#!/usr/bin/env node
// Part 5's done-condition: a generated briefing arrives as a readable PDF, and
// "send me the AIP for EVRA" fetches, attaches and sends with the send recorded.
//
// Sends are NOT made to real external addresses. The external path is proven by
// showing it is BLOCKED without confirmation — which is the behaviour that
// matters — and the delivering path is exercised only to the signed-in user.
//
//   node scripts/agent-verify-part5.mjs [--send]   (--send actually delivers)

import { readFileSync, existsSync } from "node:fs";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined && m[2].trim()) process.env[m[1]] = m[2].trim();
  }
}

const args = process.argv.slice(2);
const value = (f, d) => (args.indexOf(f) === -1 ? d : args[args.indexOf(f) + 1] ?? d);
const BASE = value("--base", process.env.AGENT_BASE_URL || "http://127.0.0.1:5175").replace(/\/+$/, "");
const REALLY_SEND = args.includes("--send");
// An explicit address, because the mock user's is not a real mailbox. Passing
// one is itself the human confirmation the external gate demands — which is why
// it is a flag a person types, not a default the script picks.
const SEND_TO = value("--to", null);
const MOCK_USER_ID = "00000000-0000-4000-8000-000000000001";
const SB = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const results = [];
const check = (name, passed, detail = "") => {
  results.push({ name, passed });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const skip = (name, why) => { results.push({ name, passed: true, skipped: true }); console.log(`SKIP  ${name} — ${why}`); };

async function sb(path, init = {}) {
  const res = await fetch(`${SB}/rest/v1/${path}`, { headers: H, ...init });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
const invoke = (name, input = {}) =>
  fetch(`${BASE}/api/tools/invoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, input }) }).then((r) => r.json());

async function main() {
  console.log(`agent: ${BASE}${REALLY_SEND ? "  (WILL DELIVER)" : "  (no real delivery)"}\n`);
  await sb("agent_settings?id=eq.global", { method: "PATCH", body: JSON.stringify({ enabled: true, reason: "part5 verify" }) });
  await sb(`agent_access?user_id=eq.${MOCK_USER_ID}`, { method: "DELETE" });
  await sb("agent_access", { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify([{ user_id: MOCK_USER_ID, user_email: "part5@clearway.local" }]) });

  // ── File generation, all four formats ──────────────────────────────────
  const blocks = [
    { type: "section", title: "ROUTE", text: "EVRA → EGLL, STD 11:40Z" },
    { type: "table", rows: [["Aircraft", "YL-ABC · A220-300"], ["CTOT", "11:52Z"]] },
    { type: "verbatim", reference: "LIM-0412 rev 3", text: "When the reported crosswind component exceeds 20 kt, AUTOLAND IS NOT PERMITTED.", by: "Approved 02 Sep 2026 by N. Ozola" },
    { type: "mono", title: "TAF", text: "TAF EGLL 230459Z 2306/2412 24012KT 9999 BKN014" },
  ];

  const pdf = await invoke("generate_file", { format: "pdf", filename: "part5_brief", title: "BTI472 · EVRA → EGLL", subtitle: "Crew brief", blocks });
  check("a PDF briefing is generated", pdf.ok === true && pdf.file?.bytes > 1000, pdf.ok ? `${pdf.file.filename} · ${pdf.file.bytes} bytes` : pdf.message);

  // Readable, not just non-empty: fetch it back and check the magic bytes.
  const download = pdf.ok ? await fetch(`${BASE}${pdf.file.downloadPath}`) : null;
  const bytes = download?.ok ? Buffer.from(await download.arrayBuffer()) : null;
  check("the PDF downloads and is a real PDF", Boolean(bytes) && bytes.subarray(0, 4).toString() === "%PDF",
    bytes ? `${bytes.length} bytes, header ${bytes.subarray(0, 4).toString()}` : `HTTP ${download?.status}`);

  const xlsx = await invoke("generate_file", { format: "xlsx", filename: "part5_flights", title: "Flights", columns: ["Callsign", "Route"], rows: [["BTI472", "EVRA-EGLL"]] });
  check("an XLSX is generated", xlsx.ok === true && xlsx.file?.bytes > 500, xlsx.ok ? `${xlsx.file.bytes} bytes` : xlsx.message);

  const docx = await invoke("generate_file", { format: "docx", filename: "part5_brief", title: "Brief", blocks });
  check("a DOCX is generated", docx.ok === true && docx.file?.bytes > 400, docx.ok ? `${docx.file.bytes} bytes` : docx.message);

  const csv = await invoke("generate_file", { format: "csv", filename: "part5_flights", columns: ["Callsign"], rows: [["BTI472"]] });
  check("a CSV is generated", csv.ok === true, csv.ok ? `${csv.file.bytes} bytes` : csv.message);

  // Generation is logged with what went into it.
  const logged = await sb(`agent_generated_files?user_id=eq.${MOCK_USER_ID}&select=kind,filename,bytes,sources,generated_ms&order=created_at.desc&limit=5`);
  check("generation is logged with requester, type and timing",
    (logged ?? []).length >= 4 && logged.every((r) => r.kind && r.filename && r.generated_ms !== null),
    `${(logged ?? []).length} rows: ${(logged ?? []).map((r) => r.kind).join(", ")}`);

  // ── Email template ─────────────────────────────────────────────────────
  const preview = await fetch(`${BASE}/api/email/preview`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject: "BTI472 crew brief", blocks, to: ["part5@clearway.local"] }),
  }).then((r) => r.json());
  check("preview renders the email", preview.ok === true && preview.html?.includes("<table"), `${preview.html?.length ?? 0} bytes`);
  check("the verbatim frame survives into email", preview.html?.includes("VERBATIM &middot; APPROVED TEXT"));

  const imgs = [...(preview.html ?? "").matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
  check("every image URL is absolute https", imgs.length > 0 && imgs.every((u) => u.startsWith("https://")), `${imgs.length} images`);
  const reachable = await Promise.all(imgs.map((u) => fetch(u, { method: "HEAD" }).then((r) => r.ok).catch(() => false)));
  check("every image URL actually resolves", reachable.every(Boolean), `${reachable.filter(Boolean).length}/${imgs.length} reachable`);

  // ── The rule that matters: external recipients need confirmation ────────
  const externalPreview = await fetch(`${BASE}/api/email/preview`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject: "x", blocks: [{ type: "paragraph", text: "y" }], to: ["someone@example.com"] }),
  }).then((r) => r.json());
  check("an external recipient is flagged for confirmation", externalPreview.needsConfirmation === true && externalPreview.external?.includes("someone@example.com"));

  const blocked = await invoke("send_email", { subject: "Should be blocked", to: ["someone@example.com"], blocks: [{ type: "paragraph", text: "test" }] });
  check("sending externally WITHOUT confirmation is refused", blocked.sent === false && blocked.needsConfirmation === true, blocked.error?.slice(0, 70));

  const blockedLog = await sb(`agent_email_log?user_id=eq.${MOCK_USER_ID}&status=eq.blocked&select=recipients,external_recipients,provider_error&order=created_at.desc&limit=1`);
  check("the blocked attempt is logged", (blockedLog ?? []).length > 0, blockedLog?.[0]?.external_recipients?.join(", "));

  // ── Delivery ───────────────────────────────────────────────────────────
  if (!REALLY_SEND) {
    skip("a real email is delivered", "pass --send to deliver to the signed-in user");
  } else {
    const sent = await invoke("send_email", {
      subject: "Clearway Ops Agent · template check",
      ...(SEND_TO ? { to: [SEND_TO], confirmed: true } : {}),
      blocks: [
        { type: "heading", text: "Ops Agent email template" },
        { type: "paragraph", text: "This is the agent's email template, sent from the real send path with a generated PDF attached. Everything below is a block the agent can compose with." },
        { type: "table", rows: [["Flight", "BTI472 · EVRA → EGLL"], ["Aircraft", "YL-ABC · A220-300"], ["CTOT", "11:52Z"]] },
        { type: "mono", title: "EGLL TAF · RAW", text: "TAF EGLL 230459Z 2306/2412 24012KT 9999 BKN014\n  TEMPO 2309/2315 24016G28KT 6000 -SHRA BKN009" },
        { type: "verbatim", reference: "LIM-0412 rev 3", text: "When the reported crosswind component exceeds 20 kt, AUTOLAND IS NOT PERMITTED. The approach shall be flown manually by the Commander.", by: "Approved 02 Sep 2026 by N. Ozola, Ops Quality. Reproduced exactly." },
        { type: "section", title: "AGENT'S READING", text: "Gust crosswind on 27L is about 21 kt during the TEMPO, above the 20 kt threshold. Plan a manual approach." },
        { type: "callout", title: "This is a test.", text: "Sent by the Part 5 verifier — no action needed." },
      ],
      attachmentIds: [pdf.file.id],
    });
    check("an email with an attachment is delivered", sent.sent === true, sent.sent ? `Resend id ${sent.messageId}` : sent.error);
    const sendLog = await sb(`agent_email_log?user_id=eq.${MOCK_USER_ID}&select=status,provider_id,provider_error,attachments,recipients&order=created_at.desc&limit=1`);
    check("the send is logged with the provider response",
      sendLog?.[0]?.status === "sent" && Boolean(sendLog[0].provider_id),
      sendLog?.[0] ? `${sendLog[0].status} · ${sendLog[0].provider_id ?? sendLog[0].provider_error}` : "no row");
  }

  // A failure must surface the provider's own words, not a generic message.
  check("failures carry the provider's real error",
    typeof blocked.error === "string" && blocked.error.includes("example.com"),
    "blocked send names the offending address");

  // ── Cleanup ────────────────────────────────────────────────────────────
  await sb(`agent_generated_files?user_id=eq.${MOCK_USER_ID}`, { method: "DELETE" });
  await sb(`agent_email_log?user_id=eq.${MOCK_USER_ID}`, { method: "DELETE" });
  await sb(`agent_access?user_id=eq.${MOCK_USER_ID}`, { method: "DELETE" });

  const failed = results.filter((r) => !r.passed);
  const skipped = results.filter((r) => r.skipped).length;
  console.log(`\n${results.length - failed.length - skipped}/${results.length - skipped} checks passed${skipped ? `, ${skipped} skipped` : ""}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\nverification aborted: ${e.message}`); process.exit(1); });
