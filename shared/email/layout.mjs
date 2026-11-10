// The master email layout (design "Clearway Emails" › emails/_layout.html, 2026-11-10), as code: tables, inline CSS,
// 600px, a VML button for Outlook, light and dark (prefers-color-scheme and Outlook.com's data-ogsc), a preheader, and
// a plain-text twin. Every email the platform sends — portal, wall, agent — goes through render() here with its
// blocks; no sender keeps a layout of its own. Every value is escaped here; a caller never passes HTML in a value.
//
// Plain module: Node (three services) and the rig import it alike. The logo PNGs are the ones already hosted for the
// platform's mail (EMAIL_ASSET_BASE, default the public storage folder the wall's documents mail used), 600×110 shown
// at 150×28; the footer address is the support address from Admin › Clients, passed in as supportEmail (never in code).

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "SFMono-Regular,Menlo,Consolas,'Liberation Mono','Courier New',monospace";
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nl2br = (s) => esc(s).replace(/\n/g, "<br>");

export function assetBase() {
  const base = String(process.env.EMAIL_ASSET_BASE || process.env.AGENT_MAIL_ASSET_BASE || "https://qdeioktxzarjonlqgznt.supabase.co/storage/v1/object/public/storage/email").trim().replace(/\/+$/, "");
  return base.startsWith("https://") ? base : "https://qdeioktxzarjonlqgznt.supabase.co/storage/v1/object/public/storage/email";
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Every time in every email: "12 Nov 2026 19:14Z". Accepts a Date, ms or an ISO string; "" when unreadable. */
export function fmtZ(value) {
  const ms = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(String(value ?? ""));
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}Z`;
}

const SPACER = (h) => `<tr><td style="height:${h}px;line-height:${h}px;font-size:0;mso-line-height-rule:exactly;">&nbsp;</td></tr>`;
const SEV = { critical: ["#b91c1c", "#fdecec", "#f7cfd0"], warning: ["#b45309", "#fff4e0", "#f8dfb0"], resolved: ["#15803d", "#e8f7ee", "#bfe6cc"], info: ["#0369a1", "#e0f2fe", "#bae6fd"] };

// ── blocks ── each returns { html: table rows, text: lines[] }
export const B = {
  /** A paragraph. Parts: a string, or [{ t, strong, mono, link }] for inline marks. */
  paragraph(parts) {
    const list = Array.isArray(parts) ? parts : [{ t: parts }];
    const html = list.map((p) => { const t = p.link ? `<a href="${esc(p.link)}" class="cw-lnk" style="color:#1d4ed8;">${esc(p.t)}</a>` : esc(p.t); return p.strong ? `<strong>${t}</strong>` : p.mono ? `<span style="font-family:${MONO};">${t}</span>` : t; }).join("");
    return { html: `<tr><td class="cw-pad cw-tx2" style="padding:0 40px 0 40px;font-family:${SANS};font-size:15px;line-height:24px;mso-line-height-rule:exactly;color:#3a3d44;">${html}</td></tr>${SPACER(12)}`, text: [list.map((p) => p.t).join(""), ""] };
  },
  /** Key / value rows in a box. rows: [[key, value, { mono }]]; empty values are left out. */
  details(rows) {
    const kept = rows.filter((r) => r && r[1] !== undefined && r[1] !== null && String(r[1]).trim() !== "");
    if (!kept.length) return { html: "", text: [] };
    const tr = kept.map(([k, v, o = {}], i) => `<tr><td class="cw-k cw-mut${i ? " cw-bd" : ""}" width="140" valign="top" style="width:140px;padding:10px 0 10px 16px;${i ? "border-top:1px solid #e6e7ea;" : ""}font-family:${SANS};font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:#5f646d;">${esc(k)}</td><td class="cw-tx${i ? " cw-bd" : ""}" valign="top" style="padding:10px 16px 10px 8px;${i ? "border-top:1px solid #e6e7ea;" : ""}font-family:${o.mono ? MONO : SANS};font-size:14px;line-height:20px;mso-line-height-rule:exactly;color:#17181c;font-weight:600;${o.pre ? "white-space:pre-wrap;" : ""}">${o.pre ? nl2br(v) : esc(v)}</td></tr>`).join("");
    return { html: `<tr><td class="cw-pad" style="padding:4px 40px 16px 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="cw-box" style="width:100%;border:1px solid #e6e7ea;border-radius:10px;background-color:#f8f9fa;border-collapse:separate;">${tr}</table></td></tr>`, text: [...kept.map(([k, v]) => `${k}: ${v}`), ""] };
  },
  /** A quiet note in a box. */
  note(parts) {
    const list = Array.isArray(parts) ? parts : [{ t: parts }];
    const html = list.map((p) => (p.strong ? `<strong>${esc(p.t)}</strong>` : esc(p.t))).join("");
    return { html: `<tr><td class="cw-pad" style="padding:0 40px 16px 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="cw-box" style="width:100%;border:1px solid #e6e7ea;border-radius:10px;background-color:#f8f9fa;border-collapse:separate;"><tr><td class="cw-tx2" style="padding:12px 16px;font-family:${SANS};font-size:14px;line-height:21px;mso-line-height-rule:exactly;color:#3a3d44;">${html}</td></tr></table></td></tr>`, text: [list.map((p) => p.t).join(""), ""] };
  },
  /** Monospace text that keeps its line breaks (a NOTAM, an error line). */
  code(text) {
    if (!text) return { html: "", text: [] };
    return { html: `<tr><td class="cw-pad" style="padding:0 40px 16px 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="cw-box" style="width:100%;border:1px solid #e6e7ea;border-radius:10px;background-color:#f8f9fa;border-collapse:separate;"><tr><td class="cw-tx" style="padding:12px 16px;font-family:${MONO};font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:#17181c;white-space:pre-wrap;word-break:break-word;">${esc(text)}</td></tr></table></td></tr>`, text: [String(text), ""] };
  },
  /** A severity chip with a time beside it: critical | warning | resolved | info. */
  severity(level, when) {
    const [fg, bg, bd] = SEV[level] || SEV.info;
    return { html: `<tr><td class="cw-pad" style="padding:0 40px 12px 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td class="cw-sev-${esc(level)}" style="padding:4px 10px;border:1px solid ${bd};border-radius:6px;background-color:${bg};font-family:${MONO};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1px;color:${fg};">${esc(String(level).toUpperCase())}</td>${when ? `<td class="cw-mut" style="padding-left:10px;font-family:${SANS};font-size:13px;line-height:16px;color:#5f646d;">${esc(when)}</td>` : ""}</tr></table></td></tr>`, text: [`${String(level).toUpperCase()}${when ? ` · ${when}` : ""}`, ""] };
  },
  /** The one button, with the same link as plain text under it. */
  button(label, url) {
    if (!url) return { html: "", text: [] };
    return { html: `<tr><td class="cw-pad" style="padding:8px 40px 0 40px;"><!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(url)}" style="height:46px;v-text-anchor:middle;width:260px;" arcsize="18%" stroke="f" fillcolor="#2563eb"><w:anchorlock/><center style="color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:600;">${esc(label)}</center></v:roundrect><![endif]--><!--[if !mso]><!--><table role="presentation" cellpadding="0" cellspacing="0" border="0" class="cw-btn" style="border-collapse:separate;"><tr><td align="center" bgcolor="#2563eb" style="border-radius:9px;background-color:#2563eb;"><a href="${esc(url)}" target="_blank" style="display:inline-block;padding:13px 24px;font-family:${SANS};font-size:15px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:9px;">${esc(label)}</a></td></tr></table><!--<![endif]--></td></tr><tr><td class="cw-pad cw-mut" style="padding:14px 40px 0 40px;font-family:${SANS};font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:#5f646d;">If the button doesn’t work, copy this link into your browser:<br><a href="${esc(url)}" class="cw-lnk" style="color:#1d4ed8;font-family:${MONO};font-size:13px;word-break:break-all;">${esc(url)}</a></td></tr>${SPACER(16)}`, text: [`${label}: ${url}`, ""] };
  },
  /** A list of files or lines, one per row. */
  list(title, lines) {
    const kept = (lines || []).filter(Boolean);
    if (!kept.length) return { html: "", text: [] };
    return { html: `<tr><td class="cw-pad" style="padding:0 40px 16px 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="cw-box" style="width:100%;border:1px solid #e6e7ea;border-radius:10px;background-color:#f8f9fa;border-collapse:separate;">${title ? `<tr><td class="cw-mut" style="padding:10px 16px 4px;font-family:${SANS};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#5f646d;">${esc(title)}</td></tr>` : ""}${kept.map((l) => `<tr><td class="cw-tx" style="padding:6px 16px;font-family:${SANS};font-size:14px;line-height:20px;color:#17181c;">${esc(l)}</td></tr>`).join("")}<tr><td style="height:6px;font-size:0;line-height:6px;">&nbsp;</td></tr></table></td></tr>`, text: [...(title ? [title] : []), ...kept.map((l) => `- ${l}`), ""] };
  },
  /** Raw rows a sender already built in the layout's own vocabulary (the agent's blocks), with their text twin. */
  raw(html, text = []) { return { html, text }; },
};

/**
 * @param {object} o  { subject, preheader, eyebrow, headline, blocks: [B.*], reason, portalUrl, supportEmail, signature }
 * @returns {{ subject, html, text }}
 */
export function render(o) {
  const base = assetBase();
  const portal = String(o.portalUrl || "https://clearway.verxyl.com").replace(/\/+$/, "");
  const blocks = (o.blocks || []).filter(Boolean);
  const body = blocks.map((b) => b.html).join("\n");
  const support = o.supportEmail ? `Questions: <a href="mailto:${esc(o.supportEmail)}" class="cw-lnk" style="color:#1d4ed8;text-decoration:none;">${esc(o.supportEmail)}</a><br>` : "";
  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(o.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
  img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none}
  a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}
  @media (max-width:620px){
    .cw-wrap{width:100%!important}
    .cw-pad{padding-left:20px!important;padding-right:20px!important}
    .cw-h1{font-size:22px!important;line-height:28px!important}
    .cw-k{width:110px!important}
    .cw-btn{width:100%!important} .cw-btn a{display:block!important;box-sizing:border-box!important;width:100%!important}
  }
  @media (prefers-color-scheme:dark){
    .cw-bg{background-color:#0d1015!important}
    .cw-card{background-color:#14181e!important;border-color:#252b34!important}
    .cw-tx{color:#eceef2!important}
    .cw-tx2{color:#c3c8d0!important}
    .cw-mut{color:#959ca8!important}
    .cw-box{background-color:#1a1f27!important;border-color:#2c333d!important}
    .cw-bd{border-color:#252b34!important}
    .cw-lnk{color:#86aefc!important}
    .cw-logo-l{display:none!important}
    .cw-logo-d{display:block!important;max-height:none!important;overflow:visible!important}
    .cw-sev-critical{color:#ff8f8f!important;background-color:#2e1517!important;border-color:#5c2427!important}
    .cw-sev-warning{color:#f0b252!important;background-color:#2a1e0d!important;border-color:#5a4012!important}
    .cw-sev-resolved{color:#5bd08a!important;background-color:#10251a!important;border-color:#1d4a2f!important}
    .cw-sev-info{color:#62c3f5!important;background-color:#0d2230!important;border-color:#17435c!important}
  }
  [data-ogsc] .cw-tx{color:#eceef2!important} [data-ogsc] .cw-tx2{color:#c3c8d0!important} [data-ogsc] .cw-mut{color:#959ca8!important} [data-ogsc] .cw-lnk{color:#86aefc!important}
  [data-ogsb] .cw-bg{background-color:#0d1015!important} [data-ogsb] .cw-card{background-color:#14181e!important} [data-ogsb] .cw-box{background-color:#1a1f27!important}
</style>
</head>
<body class="cw-bg" style="margin:0;padding:0;width:100%;background-color:#f3f4f6;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(o.preheader || "")}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="cw-bg" style="width:100%;background-color:#f3f4f6;">
<tr><td align="center" style="padding:32px 12px;">
  <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="cw-wrap" style="width:600px;max-width:600px;">
    <tr><td class="cw-pad" style="padding:0 40px 20px 40px;">
      <a href="${esc(portal)}" target="_blank" style="text-decoration:none;">
        <img class="cw-logo-l" src="${base}/clearway-dark.png" width="150" height="28" alt="Clearway" style="display:block;width:150px;height:28px;border:0;font-family:${SANS};font-size:18px;font-weight:700;color:#17181c;">
        <!--[if !mso]><!--><div class="cw-logo-d" style="display:none;max-height:0;overflow:hidden;mso-hide:all;"><img src="${base}/clearway-white.png" width="150" height="28" alt="Clearway" style="display:block;width:150px;height:28px;border:0;font-family:${SANS};font-size:18px;font-weight:700;color:#eceef2;"></div><!--<![endif]-->
      </a>
    </td></tr>
    <tr><td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="cw-card" style="width:100%;background-color:#ffffff;border:1px solid #e6e7ea;border-radius:14px;border-collapse:separate;">
        ${SPACER(32)}
        ${o.eyebrow ? `<tr><td class="cw-pad cw-mut" style="padding:0 40px 8px 40px;font-family:${SANS};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#5f646d;">${esc(o.eyebrow)}</td></tr>` : ""}
        <tr><td class="cw-pad cw-tx cw-h1" style="padding:0 40px 14px 40px;font-family:${SANS};font-size:24px;line-height:31px;mso-line-height-rule:exactly;font-weight:700;color:#17181c;">${esc(o.headline)}</td></tr>
${body}
        ${SPACER(20)}
      </table>
    </td></tr>
    <tr><td class="cw-pad cw-mut" style="padding:20px 40px 0 40px;font-family:${SANS};font-size:12.5px;line-height:19px;mso-line-height-rule:exactly;color:#5f646d;">
      Sent by Clearway because ${esc(o.reason || "you have an account on the Clearway platform")}.<br>
      ${support}
      ${esc(o.signature || "Clearway Handling & Operations")}
    </td></tr>
  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
  const text = [String(o.headline), "", ...blocks.flatMap((b) => b.text), `Sent by Clearway because ${o.reason || "you have an account on the Clearway platform"}.`, ...(o.supportEmail ? [`Questions: ${o.supportEmail}`] : []), o.signature || "Clearway Handling & Operations"].join("\n");
  return { subject: String(o.subject), html, text, preheader: String(o.preheader || "") };
}
