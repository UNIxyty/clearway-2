// A conflict a person can resolve (2026-11-07): a field marked "conflict" always carries the two values to choose
// between, or it is not a conflict. The rig's first intake run on the Anthropic API found the model marking pax as a
// conflict itself; the code's own comparison skipped the field ("already a conflict"), so the review said "Choose one"
// and the edit refused "That value has no conflict": the request could never be confirmed. Pure code, invented data.
//   node rig/intake/test-conflict-pair.mjs
import { enforce } from "../../agent/lib/intake/extract.mjs";
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${d}` : ""}`); if (!c) failures += 1; };
const f = (value, state = "extracted") => ({ value, said: value == null ? null : String(value), source: "body", confidence: 0.9, state });
const leg = (pax, paxState) => ({ departure: f("EYVI"), arrival: f("LIPZ"), std: f(null, "not_given"), sta: f(null, "not_given"), crewCount: f(3), registration: f("YL-RIG"), pax: { total: f(pax, paxState) } });
const extraction = (legs, attachments) => ({ legs, attachments, conflicts: [], notes: [], personal: { people: [] } });

// 1. the model marked pax as a conflict, named no pair, and the GenDec says 0: the code's comparison gives the pair
let x = enforce(extraction([leg(2, "conflict")], [{ name: "GenDec_RIG_EYVI-LIPZ.pdf", facts: [{ departure: "EYVI", arrival: "LIPZ", paxTotal: 0 }] }]));
let p = x.legs[0].pax.total;
ok(p.state === "conflict" && p.conflict?.body === "2" && p.conflict?.attachment === "0" && p.conflict?.attachmentName === "GenDec_RIG_EYVI-LIPZ.pdf", "the model's conflict with no pair gets the attachment's value to choose from", JSON.stringify(p.conflict ?? null));

// 2. the model marked it a conflict and nothing says what with: unknown, said so, never a conflict nobody can resolve
x = enforce(extraction([leg(2, "conflict")], []));
p = x.legs[0].pax.total;
ok(p.state === "unknown" && !p.conflict && /no two values to choose from/.test(p.note ?? ""), "a conflict with no two values becomes unknown, and says why", `${p.state} · ${p.note ?? ""}`);

// 3. a conflict the model named properly is kept as it named it
const named = extraction([leg(2, "extracted")], []); named.conflicts = [{ field: "legs[0].pax.total", body: "2", attachment: "1", attachmentName: "GenDec_RIG.pdf" }];
x = enforce(named); p = x.legs[0].pax.total;
ok(p.state === "conflict" && p.conflict?.attachment === "1", "a conflict the model named with its values stays as named", JSON.stringify(p.conflict ?? null));

// 4. after enforce, no field anywhere is a conflict without its pair
const all = []; const walk = (o) => { if (!o || typeof o !== "object") return; if (Array.isArray(o)) return o.forEach(walk); if ("state" in o) all.push(o); Object.values(o).forEach(walk); };
for (const legs of [[leg(2, "conflict"), leg(5, "conflict")]]) { all.length = 0; walk(enforce(extraction(legs, [{ name: "GenDec_RIG_EYVI-LIPZ.pdf", facts: [{ departure: "EYVI", arrival: "LIPZ", paxTotal: 5 }] }])).legs); }
ok(all.every((o) => o.state !== "conflict" || o.conflict), "no field is left a conflict without the two values", all.filter((o) => o.state === "conflict" && !o.conflict).length);

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
