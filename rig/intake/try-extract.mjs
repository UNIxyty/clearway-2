// Runs the extractor on one .eml fixture and prints the field table (never the personal section's values).
//   node --env-file=.env rig/intake/try-extract.mjs rig/fixtures/intake/<file>.eml
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(path.resolve("agent/package.json"));
const { simpleParser } = require("mailparser");
import { extractAttachment } from "../../agent/lib/attachments.mjs";
import { sniff } from "../../agent/lib/intake/blobstore.mjs";
import { preclassify, runModel, normalise, referenceFor } from "../../agent/lib/intake/extract.mjs";

const p = await simpleParser(readFileSync(process.argv[2]));
const atts = [];
for (const a of p.attachments) {
  const att = { name: a.filename, content: a.content, bytes: a.size, sniffedType: sniff(a.content), inline: a.contentDisposition === "inline" };
  att.pre = preclassify(att);
  if (!att.pre) { const e = await extractAttachment(a.content, a.filename).catch((err) => ({ status: "unreadable", readNote: err.message })); att.text = e.text ?? null; att.pages = e.pages ?? null; }
  atts.push(att);
}
const t0 = Date.now();
const { raw, modelId, usage } = await runModel({ message: { from: p.from?.text, to: [p.to?.text], date: p.date?.toISOString(), subject: p.subject }, bodyText: p.text, attachments: atts });
const x = await normalise(raw);
const show = (f) => f ? `${f.state.padEnd(14)} ${JSON.stringify(f.value?.utc ?? f.value)}  said=${JSON.stringify(f.said)}${f.note ? `  · ${f.note}` : ""}` : "—";
console.log(`model ${modelId} · ${usage.inputTokens} in / ${usage.outputTokens} out · ${Date.now() - t0} ms`);
console.log("type:", x.requestType, "·", x.whyType); console.log("reference:", JSON.stringify(referenceFor(x, p.subject)), "| operator:", show(x.operator));
console.log("request source:", JSON.stringify(x.requestSource));
for (const a of atts) { const m = x.attachments.find((y) => y.name === a.name); console.log(`attachment ${a.name}: ${(a.pre ?? m)?.role} · ${(a.pre ?? m)?.why}`); }
x.legs.forEach((l, i) => {
  console.log(`\nLEG ${i + 1} ${l.direction ?? ""}`);
  for (const k of ["flightNumber", "departure", "arrival", "std", "sta", "aircraftType", "registration", "flightType", "crewCount"]) console.log(`  ${k.padEnd(13)} ${show(l[k])}`);
  for (const k of ["total", "adults", "children", "infants"]) console.log(`  pax.${k.padEnd(9)} ${show(l.pax[k])}`);
  for (const s of l.services) console.log(`  · ${s.isNote ? "NOTE" : s.requested.padEnd(10)} ${s.name}${s.detail ? ` (${s.detail})` : ""}${s.conditional ? ` [cond: ${s.condition}]` : ""} → checklist ${s.checklistNid ?? "—"} conf ${s.confidence}  said=${JSON.stringify(s.said)}`);
});
console.log("\nnotes:", x.notes.map((n) => n.text).join(" | "));
console.log("conflicts:", JSON.stringify(x.conflicts));
console.log("people:", x.personal.people.length, "records (values not shown) · per list:", JSON.stringify(x.personal.people.reduce((m, q) => ((m[`${q.list}@leg${q.leg}`] = (m[`${q.list}@leg${q.leg}`] ?? 0) + 1), m), {})));
