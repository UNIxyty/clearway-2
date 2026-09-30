// Builds a "forwarded as attachment" email around a .eml or .msg, like Outlook's Forward as Attachment:
// the outer body is only a cover note; the request is inside the attached email.
//   node rig/intake/wrap-forward.mjs <inner.eml|inner.msg> <out.eml>
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const [inner, out] = process.argv.slice(2);
const buf = readFileSync(inner); const isMsg = /\.msg$/i.test(inner);
const B = "=_fwd_" + Date.now().toString(36);
const b64 = (b) => Buffer.from(b).toString("base64").replace(/.{76}/g, "$&\r\n");
const name = path.basename(inner);
const eml = [`From: Ops Desk <ops-desk@clearway-rig.invalid>`, `To: handling@intake.rig.invalid`, `Subject: FW: ${name.replace(/\.(eml|msg)$/i, "")}`, `Date: ${new Date().toUTCString()}`, `Message-ID: <fwd-${Date.now().toString(36)}@clearway-rig.invalid>`, `MIME-Version: 1.0`, `Content-Type: multipart/mixed; boundary="${B}"`, ``,
  `--${B}`, `Content-Type: text/plain; charset=utf-8`, ``, `FYI, please handle - see attached.`, ``, `--`, `Ops Desk`, ``,
  `--${B}`, isMsg ? `Content-Type: application/vnd.ms-outlook; name="${name}"` : `Content-Type: message/rfc822; name="${name}"`, `Content-Disposition: attachment; filename="${name}"`, `Content-Transfer-Encoding: base64`, ``, b64(buf), `--${B}--`, ``].join("\r\n");
writeFileSync(out, eml); console.log(`wrote ${out} (${eml.length} bytes, attached ${isMsg ? ".msg" : ".eml"})`);
