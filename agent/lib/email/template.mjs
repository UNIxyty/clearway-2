// The agent email template, from the Claude Design source
// ("Ops Agent Email.dc.html"). One template for everything the agent sends.
//
// Nested tables with inline styles, because that is what email clients render.
// No <style> block, no flexbox, no grid — Outlook ignores all three.
//
// IMAGE URLS ARE ABSOLUTE HTTPS. This has bitten the project twice: a relative
// or http:// image is silently dropped by every major client, and the mail
// looks broken to the recipient while looking fine to whoever sent it. There is
// a text fallback beside every image for clients that block them by default,
// which is most of them on first open.

const TH = {
  desk: "#eef0f3", card: "#ffffff", border: "#e6e7ea", rule: "#eef0f2",
  ink: "#17181c", body: "#3a3d44", muted: "#6c7079", faint: "#9aa0a8",
  mono: "#f5f6f7", reqBg: "#fbfbfc", accent: "#2563eb",
  verbInk: "#17181c", verbOn: "#ffffff",
  callBg: "#fef3e2", callB: "#f6ddb0", callInk: "#92400e",
  fileTile: "#fdecec", link: "#2563eb", footer: "#0a1330",
};

const SANS = "'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "'IBM Plex Mono', Consolas, 'Courier New', monospace";
const PAD = "14px 32px 0";
const PAD_LAST = "20px 32px 26px";

/**
 * Where the mail's images live.
 *
 * NOT the app domain. The existing transactional templates
 * (digital-wall/templates/*.html) serve logos from Supabase public storage, and
 * those URLs are known to resolve — the app-domain equivalents do not exist.
 * Writing plausible-looking /brand/ URLs here would have shipped a third
 * broken-image incident: they 404, and the sender never sees it because their
 * own client caches or their browser has the asset.
 */
function assetBase() {
  const base = String(
    process.env.AGENT_MAIL_ASSET_BASE ||
    "https://qdeioktxzarjonlqgznt.supabase.co/storage/v1/object/public/storage/email"
  ).trim().replace(/\/+$/, "");
  if (!base.startsWith("https://")) {
    // An http:// or relative base is silently dropped by every major client.
    throw new Error(`AGENT_MAIL_ASSET_BASE must be an absolute https URL, got "${base}"`);
  }
  return base;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const esc = escapeHtml;

// ── Blocks ─────────────────────────────────────────────────────────────────

function heading(text) {
  return `<h1 style="font-size:24px;line-height:1.25;font-weight:800;letter-spacing:-0.02em;color:${TH.ink};margin:0;">${esc(text)}</h1>`;
}

function paragraph(text) {
  return `<p style="font-size:15px;line-height:1.6;color:${TH.body};margin:0;">${esc(text)}</p>`;
}

function note(text, by) {
  return `<p style="font-size:15px;line-height:1.6;color:${TH.ink};margin:0;font-style:italic;">&ldquo;${esc(text)}&rdquo;${by ? ` <span style="font-style:normal;color:${TH.muted};">&mdash; ${esc(by)}</span>` : ""}</p>`;
}

function section(title, text) {
  return `<div style="font-size:11px;font-weight:700;letter-spacing:0.12em;color:${TH.faint};margin-bottom:6px;">${esc(title)}</div>` +
    `<p style="font-size:15px;line-height:1.6;color:${TH.body};margin:0;">${esc(text)}</p>`;
}

function table(rows) {
  const body = rows.map(([k, v, isMono], i) => {
    const bt = i ? `1px solid ${TH.rule}` : "none";
    return `<tr><td width="150" style="padding:9px 14px;font-size:13px;color:${TH.muted};border-top:${bt};vertical-align:top;">${esc(k)}</td>` +
      `<td style="padding:9px 14px;font-size:13.5px;color:${TH.ink};font-weight:600;border-top:${bt};font-family:${isMono ? MONO : "inherit"};">${esc(v)}</td></tr>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border:1px solid ${TH.border};border-radius:10px;">${body}</table>`;
}

function monoBlock(title, text) {
  return (title ? `<div style="font-size:11px;font-weight:700;letter-spacing:0.12em;color:${TH.faint};margin-bottom:6px;">${esc(title)}</div>` : "") +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${TH.mono};border-radius:8px;">` +
    `<tr><td style="padding:12px 14px;font-family:${MONO};font-size:13px;line-height:1.7;color:${TH.ink};white-space:pre-wrap;">${esc(text)}</td></tr></table>`;
}

/**
 * The verbatim frame, in email form. Same rule as the panel: this is the
 * authority's wording, reproduced exactly, and nothing else in the mail is
 * allowed to look like it.
 */
function verbatim({ reference, text, by }) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border:2px solid ${TH.verbInk};border-radius:10px;">` +
    `<tr><td style="background:${TH.verbInk};padding:8px 14px;font-size:11px;font-weight:800;letter-spacing:0.12em;color:${TH.verbOn};">VERBATIM &middot; APPROVED TEXT${reference ? ` &middot; ${esc(reference)}` : ""}</td></tr>` +
    `<tr><td style="padding:12px 14px;font-size:14.5px;line-height:1.65;color:${TH.ink};font-weight:500;white-space:pre-wrap;">${esc(text)}</td></tr>` +
    (by ? `<tr><td style="padding:0 14px 11px;font-size:12px;color:${TH.muted};">${esc(by)}</td></tr>` : "") +
    `</table>`;
}

function callout(title, text) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${TH.callBg};border:1px solid ${TH.callB};border-radius:10px;"><tr>` +
    `<td width="28" style="padding:12px 0 12px 14px;vertical-align:top;font-size:15px;font-weight:800;color:${TH.callInk};">!</td>` +
    `<td style="padding:12px 14px 12px 4px;font-size:14px;line-height:1.55;color:${TH.callInk};">${title ? `<strong>${esc(title)}</strong> ` : ""}${esc(text)}</td>` +
    `</tr></table>`;
}

function fileList(title, files) {
  const rows = files.map((f, i) => {
    const bt = i ? `1px solid ${TH.rule}` : "none";
    const ext = String(f.filename ?? "").split(".").pop()?.toUpperCase().slice(0, 4) || "FILE";
    return `<tr>` +
      `<td width="46" style="padding:10px 0 10px 14px;border-top:${bt};"><span style="display:inline-block;width:30px;height:36px;border-radius:4px;background:${TH.fileTile};font-size:8px;font-weight:800;color:#e5484d;text-align:center;line-height:52px;">${esc(ext)}</span></td>` +
      `<td style="padding:10px 8px;border-top:${bt};"><div style="font-family:${MONO};font-size:13px;font-weight:600;color:${TH.ink};">${esc(f.filename)}</div>` +
      (f.meta ? `<div style="font-size:12px;color:${TH.muted};margin-top:2px;">${esc(f.meta)}</div>` : "") + `</td>` +
      `<td align="right" style="padding:10px 14px;border-top:${bt};font-size:12.5px;color:${TH.faint};white-space:nowrap;">${esc(f.size ?? "")}</td>` +
      `</tr>`;
  }).join("");
  return `<div style="font-size:11px;font-weight:700;letter-spacing:0.12em;color:${TH.faint};margin-bottom:6px;">${esc(title ?? "ATTACHED")}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border:1px solid ${TH.border};border-radius:10px;">${rows}</table>`;
}

function sources(list) {
  const rows = list.map((s) =>
    `<div style="font-size:13px;line-height:1.7;color:${TH.body};"><strong style="color:${TH.ink};">[${esc(s.n)}] ${esc(s.tierLabel ?? s.tier ?? "")}</strong> &middot; ${esc(s.label ?? s.name ?? "")}</div>`
  ).join("");
  return `<div style="font-size:11px;font-weight:700;letter-spacing:0.12em;color:${TH.faint};margin-bottom:6px;">SOURCES</div>${rows}`;
}

function cta(text, url) {
  const safe = esc(url);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:10px;background:${TH.accent};">` +
    `<a href="${safe}" style="display:block;font-size:14.5px;font-weight:700;color:#ffffff;text-decoration:none;padding:12px 22px;">${esc(text)} &rarr;</a>` +
    `</td></tr></table>` +
    `<div style="font-size:12px;color:${TH.faint};margin-top:9px;">Or open <span style="font-family:${MONO};color:${TH.link};">${safe}</span></div>`;
}

const RENDERERS = {
  heading: (b) => heading(b.text),
  paragraph: (b) => paragraph(b.text),
  note: (b) => note(b.text, b.by),
  section: (b) => section(b.title, b.text),
  table: (b) => table(b.rows ?? []),
  mono: (b) => monoBlock(b.title, b.text),
  verbatim: (b) => verbatim(b),
  callout: (b) => callout(b.title, b.text),
  files: (b) => fileList(b.title, b.files ?? []),
  sources: (b) => sources(b.sources ?? []),
  cta: (b) => cta(b.text, b.url),
};

export const BLOCK_TYPES = Object.keys(RENDERERS);

/**
 * Render the full email.
 *
 * `requester` is not decoration: every agent email says who asked for it and
 * when, because the recipient's first question is always "why am I getting
 * this", and a machine-sent mail with no named human behind it gets ignored or
 * escalated.
 */
export function renderAgentEmail({ subject, tag, requester, requesterEmail, when, blocks = [], reference, consoleUrl }) {
  const base = assetBase();
  const firstName = String(requester ?? "").trim().split(/\s+/)[0] || "them";

  const body = blocks
    .filter((b) => RENDERERS[b.type])
    .map((b, i) => {
      const isLast = i === blocks.length - 1;
      const pad = b.pad ?? (i === 0 ? "22px 32px 0" : isLast ? PAD_LAST : PAD);
      return `<tr><td style="padding:${pad};">${RENDERERS[b.type](b)}</td></tr>`;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${esc(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:${TH.desk};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:${TH.desk};">` +
    `<tr><td align="center" style="padding:24px 20px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;border-collapse:separate;background:${TH.card};border-radius:14px;overflow:hidden;border:1px solid ${TH.border};">` +

    // Header — logo with a text fallback, because most clients block images first.
    `<tr><td style="padding:24px 32px 18px;border-bottom:1px solid ${TH.rule};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td style="vertical-align:middle;"><img src="${base}/clearway-dark.png" alt="Clearway" width="132" style="display:block;width:132px;height:auto;border:0;"/></td>` +
    `<td align="right" style="vertical-align:middle;font-family:${MONO};font-size:11px;font-weight:600;letter-spacing:0.1em;color:${TH.faint};">${esc(tag ?? "OPS AGENT")}</td>` +
    `</tr></table></td></tr>` +

    // Who asked, and when.
    `<tr><td style="padding:14px 32px;background:${TH.reqBg};border-bottom:1px solid ${TH.rule};">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td style="vertical-align:top;padding-right:10px;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;border:2px solid ${TH.accent};margin-top:3px;"></span></td>` +
    `<td style="font-size:13px;line-height:1.5;color:${TH.body};">Sent by the <strong style="color:${TH.ink};">Clearway Ops Agent</strong> at the request of <strong style="color:${TH.ink};">${esc(requester ?? "a dispatcher")}</strong>${when ? `, ${esc(when)}` : ""}. Reply to reach ${esc(firstName)} directly.</td>` +
    `</tr></table></td></tr>` +

    body +

    // Footer, with the disclaimer the design carries.
    `<tr><td style="background:${TH.footer};padding:20px 32px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td style="vertical-align:middle;">` +
    `<img src="${base}/clearway-white.png" alt="Clearway" width="104" style="display:block;width:104px;height:auto;border:0;opacity:.92;"/>` +
    `<div style="font-size:11.5px;color:rgba(255,255,255,.55);margin-top:8px;line-height:1.5;">Generated by the Clearway Ops Agent. Check operational content against the source before use.</div>` +
    `</td>` +
    `<td align="right" style="vertical-align:middle;padding-left:14px;white-space:nowrap;">` +
    `<img src="${base}/verxyl-white.png" alt="Built by Verxyl" width="110" style="display:block;width:110px;height:auto;border:0;opacity:.9;margin-left:auto;"/>` +
    `</td></tr></table>` +
    `<div style="height:1px;background:rgba(255,255,255,.12);margin:16px 0 12px;"></div>` +
    `<div style="font-family:${MONO};font-size:10.5px;color:rgba(255,255,255,.45);">${esc(reference ?? "")}</div>` +
    `</td></tr>` +

    `</table></td></tr></table></body></html>`;
}

/** Plain-text alternative. Not optional: a mail with no text part scores as spam. */
export function renderAgentEmailText({ subject, requester, when, blocks = [], reference }) {
  const lines = [subject, "", `Sent by the Clearway Ops Agent at the request of ${requester ?? "a dispatcher"}${when ? `, ${when}` : ""}.`, ""];
  for (const b of blocks) {
    if (b.type === "heading") lines.push(b.text.toUpperCase(), "");
    else if (b.type === "paragraph" || b.type === "note") lines.push(b.text, "");
    else if (b.type === "section") lines.push(`${b.title}:`, b.text, "");
    else if (b.type === "table") { for (const [k, v] of b.rows ?? []) lines.push(`  ${k}: ${v}`); lines.push(""); }
    else if (b.type === "mono") lines.push(b.title ?? "", b.text, "");
    else if (b.type === "verbatim") lines.push(`VERBATIM — APPROVED TEXT${b.reference ? ` (${b.reference})` : ""}:`, b.text, b.by ?? "", "");
    else if (b.type === "callout") lines.push(`! ${b.title ?? ""} ${b.text}`, "");
    else if (b.type === "files") { lines.push(b.title ?? "ATTACHED"); for (const f of b.files ?? []) lines.push(`  - ${f.filename}${f.size ? ` (${f.size})` : ""}`); lines.push(""); }
    else if (b.type === "sources") { lines.push("SOURCES"); for (const s of b.sources ?? []) lines.push(`  [${s.n}] ${s.tierLabel ?? s.tier} · ${s.label ?? s.name}`); lines.push(""); }
    else if (b.type === "cta") lines.push(`${b.text}: ${b.url}`, "");
  }
  lines.push("—", "Generated by the Clearway Ops Agent. Check operational content against the source before use.", reference ?? "");
  return lines.join("\n");
}
