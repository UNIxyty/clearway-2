// Attached emails: a forward "as attachment" arrives as an Outlook .msg (OLE) or a message/rfc822 .eml, and the
// real handling request — body AND its own attachments (GenDecs, crew lists) — is inside it. This opens both
// kinds and returns the inner email and its files, so the pipeline reads them like any other document.
import { simpleParser } from "mailparser";
import MsgReaderMod from "@kenjiuno/msgreader";
import { sniff } from "./blobstore.mjs";

const MsgReader = MsgReaderMod.default ?? MsgReaderMod;
const htmlToText = (h) => String(h ?? "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();

/** True when the bytes are an email we can open. */
export function isEmailFile(att) {
  if (att.sniffedType === "message/rfc822") return true;
  if (att.sniffedType === "application/x-ole-storage") return /\.msg$/i.test(att.name) || /outlook/i.test(att.declaredType ?? "") || isMsg(att.content);
  return false;
}
function isMsg(buf) { try { const d = new MsgReader(buf).getFileData(); return !d.error && (d.subject != null || d.body != null); } catch { return false; } }

/**
 * @returns { email: { from, to, date, subject, text }, children: [{ name, content, declaredType, inline, cid }] } | null
 */
export async function unpackEmail(att) {
  if (att.sniffedType === "message/rfc822") {
    const p = await simpleParser(att.content, { skipImageLinks: true });
    return {
      email: { from: p.from?.text ?? null, to: p.to?.text ?? null, date: p.date?.toISOString() ?? null, subject: p.subject ?? null, text: p.text || htmlToText(p.html) },
      children: (p.attachments ?? []).filter((a) => a?.content?.length).map((a) => ({ name: a.filename || "(no name)", content: a.content, declaredType: a.contentType ?? null, inline: a.contentDisposition === "inline" || (!!a.cid && !a.filename), cid: a.cid ?? null })),
    };
  }
  const r = new MsgReader(att.content); const d = r.getFileData();
  if (d.error) return null;
  const html = d.bodyHtml ?? (d.html ? Buffer.from(d.html).toString("utf8") : "");
  const children = [];
  for (const a of d.attachments ?? []) {
    try {
      const x = r.getAttachment(a);
      const content = Buffer.from(x.content ?? []);
      if (!content.length) continue;
      children.push({ name: a.fileName ?? a.name ?? x.fileName ?? "(no name)", content, declaredType: a.attachMimeTag ?? null, inline: !!a.attachmentHidden, cid: a.pidContentId ?? null });
    } catch { /* an embedded object msgreader cannot give back as bytes */ }
  }
  const from = d.senderName || d.senderEmail ? `${d.senderName ?? ""}${d.senderEmail ? ` <${d.senderSmtpAddress ?? d.senderEmail}>` : ""}`.trim() : null;
  return { email: { from, to: (d.recipients ?? []).map((x) => x.smtpAddress ?? x.email ?? x.name).filter(Boolean).join(", ") || null, date: d.messageDeliveryTime ?? d.clientSubmitTime ?? null, subject: d.subject ?? null, text: d.body || htmlToText(html) }, children };
}

/** Name to give the text readers: keep the real name when its extension matches the content, else add one. */
const EXT = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx", "text/plain": "txt" };
export function readableName(att) {
  const want = EXT[att.sniffedType]; if (!want) return att.name;
  const has = String(att.name).toLowerCase().split(".").pop();
  return has === want || (want === "jpg" && has === "jpeg") ? att.name : `${att.name}.${want}`;
}
export { sniff };
