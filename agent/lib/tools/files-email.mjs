// File generation and email tools.
//
// These are the agent's first actions with an effect outside the platform, so
// two rules are enforced in the BACKEND rather than asked of the model:
//   · an external recipient requires explicit confirmation (send.mjs), and
//   · the agent can only email as the signed-in user, to addresses that user
//     could email themselves.
//
// The model chooses to call send_email; it cannot choose to skip the
// confirmation, because the check is recomputed from the addresses actually
// being sent to.

import { defineTool, S } from "./framework.mjs";
import { portalGet } from "./http.mjs";
import { InvalidInput, NotFound, ServiceUnavailable } from "./errors.mjs";
import { generateCsv, generateDocx, generatePdf, generateXlsx } from "../files/generate.mjs";
import { classifyRecipients, prepareEmail, refuseUnconfirmedExternal, sendAgentEmail, validateRecipients } from "../email/send.mjs";
import { recordGeneratedFile, readGeneratedFile } from "../files/store.mjs";

const BLOCK_SCHEMA = {
  type: "object",
  required: ["type"],
  properties: {
    type: { type: "string", enum: ["heading", "paragraph", "section", "table", "mono", "verbatim", "callout"] },
    text: { type: "string" },
    title: { type: "string" },
    by: { type: "string" },
    reference: { type: "string" },
    rows: { type: "array", items: { type: "array", items: { type: "string" } } },
  },
};

const FILE_RESULT = {
  type: "object",
  properties: {
    id: { type: "string" },
    filename: { type: "string" },
    mime: { type: "string" },
    bytes: { type: "integer" },
    downloadPath: { type: "string" },
  },
};

defineTool({
  name: "generate_file",
  description:
    "Produce a document the user can download or attach to an email — a PDF briefing, a Word document, or a spreadsheet/CSV of tabular data. Build it from facts you have already retrieved with other tools. Use for 'make me a brief', 'export this as a spreadsheet', 'put that in a PDF'. Quoted operational text must be given as a verbatim block so it is reproduced exactly.",
  permission: "user",
  sourceTier: "internal",
  sourceLabel: (input) => `Internal · generated ${input.format}`,
  timeoutMs: 90_000,
  input: {
    type: "object",
    required: ["format", "filename"],
    additionalProperties: false,
    properties: {
      format: { type: "string", enum: ["pdf", "docx", "xlsx", "csv"] },
      filename: { type: "string", minLength: 1, maxLength: 80 },
      // Required in practice for pdf/docx (checked below), but a CSV has no
      // title — demanding one there just makes the model invent a heading for
      // a file that cannot display it.
      title: { type: "string", minLength: 1, maxLength: 160 },
      subtitle: { type: "string", maxLength: 200 },
      blocks: { type: "array", items: BLOCK_SCHEMA, maxItems: 60, description: "For pdf and docx." },
      columns: { type: "array", items: { type: "string" }, maxItems: 30, description: "For xlsx and csv." },
      rows: { type: "array", items: { type: "array", items: { type: "string" } }, maxItems: 2000 },
    },
  },
  output: { type: "object", required: ["file"], properties: { file: FILE_RESULT } },
  async handler(input, { user, conversationId }) {
    const startedAt = Date.now();
    const { format, filename, subtitle, blocks = [], columns = [], rows = [] } = input;
    const title = input.title ?? filename;
    if ((format === "xlsx" || format === "csv") && columns.length === 0) {
      throw InvalidInput(`${format} needs columns and rows.`);
    }
    if ((format === "pdf" || format === "docx")) {
      if (blocks.length === 0) throw InvalidInput(`${format} needs at least one block.`);
      if (!input.title) throw InvalidInput(`${format} needs a title.`);
    }

    let file;
    try {
      if (format === "pdf") file = await generatePdf({ filename, title, subtitle, blocks });
      else if (format === "docx") file = await generateDocx({ filename, title, blocks });
      else if (format === "xlsx") file = await generateXlsx({ filename, sheetName: title.slice(0, 31), columns, rows });
      else file = await generateCsv({ filename, columns, rows });
    } catch (error) {
      throw ServiceUnavailable(`The file could not be generated: ${error.message}`);
    }

    await recordGeneratedFile({
      file, user, conversationId, kind: format, title,
      generatedMs: Date.now() - startedAt,
      // What went into it, so a briefing is auditable later.
      sources: blocks.filter((b) => b.type === "verbatim").map((b) => ({ type: "verbatim", reference: b.reference ?? null })),
    });

    return { file: { id: file.id, filename: file.filename, mime: file.mime, bytes: file.bytes, downloadPath: file.downloadPath } };
  },
});

defineTool({
  name: "email_document",
  description:
    "Email an airport's AIP AD 2 or GEN 1.2 document to someone. Use for 'send me the AIP for EVRA' or 'email the GEN for Latvia to ops'. Omit `to` to send to the person asking. Sending outside the organisation needs their explicit confirmation first.",
  permission: "user",
  sourceTier: "internal",
  sourceLabel: (input) => `Internal · AIP ${input.icao} emailed`,
  timeoutMs: 180_000,
  input: {
    type: "object",
    required: ["icao"],
    additionalProperties: false,
    properties: {
      icao: S.icao,
      document: { type: "string", enum: ["aip", "gen"], default: "aip" },
      to: { type: "array", items: { type: "string" }, maxItems: 20, description: "Defaults to the person asking." },
      note: { type: "string", maxLength: 600, description: "A line to include above the document details." },
      confirmed: { type: "boolean", default: false, description: "Set only after the user has explicitly confirmed an external recipient." },
    },
  },
  output: {
    type: "object",
    required: ["sent"],
    properties: {
      sent: { type: "boolean" },
      needsConfirmation: { type: "boolean" },
      external: { type: "array", items: { type: "string" } },
      recipients: { type: "array", items: { type: "string" } },
      messageId: { type: ["string", "null"] },
      error: { type: ["string", "null"] },
      filename: { type: ["string", "null"] },
    },
  },
  async handler({ icao, document, to, note, confirmed }, { user, conversationId }) {
    const code = String(icao).toUpperCase();
    const recipients = validateRecipients(to?.length ? to : [user.email]);
    const { external } = classifyRecipients(recipients, user);

    // Refuse BEFORE fetching: no point downloading a 3 MB PDF for a send that
    // is about to be blocked. The refusal comes from send.mjs so it is logged
    // exactly like every other blocked attempt.
    const refusal = await refuseUnconfirmedExternal({
      recipients, user, conversationId, confirmed,
      subject: `${code} · ${document === "gen" ? "GEN 1.2" : "AIP AD 2"}`,
    });
    if (refusal) return { ...refusal, filename: null };

    // Resolve and fetch through the portal AS THE USER — the same routes the
    // AIP page uses, so the agent cannot email a document its caller could not
    // open themselves.
    const resolved = await portalGet(`/api/aip/resolve?icao=${encodeURIComponent(code)}`, user, { timeoutMs: 30_000 });
    if (!resolved?.source) throw NotFound(`No AIP source serves ${code}.`);

    const path = document === "gen"
      ? `/api/aip/gen/pdf?icao=${encodeURIComponent(code)}`
      : resolved.cached && resolved.filesPath ? resolved.filesPath : `${resolved.pdfPath}&inline=1`;

    const pdf = await fetchPdf(path, user);
    if (!pdf) throw ServiceUnavailable(`The ${document === "gen" ? "GEN 1.2" : "AD 2"} document for ${code} could not be retrieved.`);

    const filename = document === "gen" ? `${code.slice(0, 2)}-GEN-1.2.pdf` : `${code}-AD2.pdf`;
    const prepared = prepareEmail({
      subject: `${code} · ${document === "gen" ? "GEN 1.2" : "AIP AD 2"}`,
      tag: document === "gen" ? "GEN DOCUMENT" : "AIP DOCUMENT",
      user, conversationId,
      blocks: [
        { type: "heading", text: `${code} — ${document === "gen" ? "GEN 1.2" : "AIP AD 2"}` },
        ...(note ? [{ type: "paragraph", text: note }] : []),
        { type: "table", rows: [
          ["Airport", code],
          ["Document", filename],
          ["Source", `Internal · AIP Portal (${resolved.source})`],
          ["Retrieved", new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z")],
        ] },
      ],
      attachments: [{ filename, bytes: pdf.length, meta: `Source: ${resolved.source}` }],
    });

    const result = await sendAgentEmail({
      to: recipients, prepared, user, conversationId,
      confirmedExternal: confirmed === true,
      attachments: [{ filename, content: pdf }],
    });

    return {
      sent: result.ok === true,
      needsConfirmation: Boolean(result.needsConfirmation),
      external,
      recipients,
      messageId: result.id ?? null,
      // The provider's real error, never softened — a swallowed mail failure
      // has cost this project weeks.
      error: result.ok ? null : String(result.error ?? "Send failed."),
      filename,
    };
  },
});

defineTool({
  name: "send_email",
  description:
    "Send an email composed from blocks, optionally attaching files you generated with generate_file. Use for 'email this brief to…' or 'forward that answer to…'. Sending outside the organisation needs the user's explicit confirmation first.",
  permission: "user",
  sourceTier: "internal",
  sourceLabel: () => "Internal · email sent",
  timeoutMs: 120_000,
  input: {
    type: "object",
    required: ["subject", "blocks"],
    additionalProperties: false,
    properties: {
      subject: { type: "string", minLength: 1, maxLength: 160 },
      to: { type: "array", items: { type: "string" }, maxItems: 20 },
      blocks: { type: "array", items: BLOCK_SCHEMA, minItems: 1, maxItems: 40 },
      attachmentIds: { type: "array", items: { type: "string" }, maxItems: 5, description: "Ids returned by generate_file." },
      confirmed: { type: "boolean", default: false },
    },
  },
  output: {
    type: "object",
    required: ["sent"],
    properties: {
      sent: { type: "boolean" },
      needsConfirmation: { type: "boolean" },
      external: { type: "array", items: { type: "string" } },
      recipients: { type: "array", items: { type: "string" } },
      messageId: { type: ["string", "null"] },
      error: { type: ["string", "null"] },
    },
  },
  async handler({ subject, to, blocks, attachmentIds = [], confirmed }, { user, conversationId }) {
    const recipients = validateRecipients(to?.length ? to : [user.email]);
    const { external } = classifyRecipients(recipients, user);
    const refusal = await refuseUnconfirmedExternal({ recipients, user, conversationId, subject, confirmed });
    if (refusal) return refusal;

    const attachments = [];
    for (const id of attachmentIds) {
      const found = await readGeneratedFile(id, user);
      if (!found) throw NotFound(`No generated file ${id}. Generate it first with generate_file.`);
      attachments.push({ filename: found.filename, content: found.buffer, bytes: found.buffer.length });
    }

    const prepared = prepareEmail({ subject, tag: "OPS AGENT", blocks, attachments, user, conversationId });
    const result = await sendAgentEmail({
      to: recipients, prepared, user, conversationId,
      confirmedExternal: confirmed === true,
      attachments: attachments.map((a) => ({ filename: a.filename, content: a.content })),
    });

    return {
      sent: result.ok === true,
      needsConfirmation: Boolean(result.needsConfirmation),
      external, recipients,
      messageId: result.id ?? null,
      error: result.ok ? null : String(result.error ?? "Send failed."),
    };
  },
});

async function fetchPdf(path, user) {
  const base = String(process.env.PORTAL_BASE_URL || "http://portal:3000").replace(/\/+$/, "");
  const headers = { accept: "application/pdf" };
  if (user?.cookieHeader) headers.cookie = user.cookieHeader;
  if (user?.accessToken) headers.authorization = `Bearer ${user.accessToken}`;
  const response = await fetch(`${base}${path}`, { headers, redirect: "manual", signal: AbortSignal.timeout(170_000) });
  if (!response.ok) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  // A login page or an error body is not a PDF; sending one as an attachment
  // looks like success to everyone except the recipient.
  return buffer.length > 500 && buffer.subarray(0, 4).toString() === "%PDF" ? buffer : null;
}
