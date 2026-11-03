// One extraction shape every time (2026-11-03): fillShape writes every key the schema allows to be empty, and the model
// left out, as null — so two runs that differ only in leaving a key out and writing it as null give the same record.
// A key that may not be empty stays missing, and the validator refuses it. Pure code.   node rig/intake/test-fill-shape.mjs
import { fillShape, validateExtraction } from "../../agent/lib/intake/schema.mjs";
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${d}` : ""}`); if (!c) failures += 1; };
const field = (value) => ({ value, said: null, source: null, confidence: 0.9, state: value == null ? "not_given" : "extracted" });
const base = () => ({ requestType: "handling", whyType: "asks for handling", reference: field(null), requester: { company: field("Example Test Air"), contact: field(null) }, operator: field(null), legs: [], notes: [], attachments: [], requestSource: { attachment: null, why: "body" }, conflicts: [] });
const a = { ...base(), personal: { people: [{ leg: 0, list: "pax", name: "Testperson Alpha" }] } };
const b = { ...base(), typeConfidence: null, ask: null, personal: { people: [{ leg: 0, list: "pax", name: "Testperson Alpha", salutation: null, sex: null, dob: null, role: null, type: null, nationality: null, passport: null, expiry: null, source: null }], nameOrder: null } };
const canon = (x) => (Array.isArray(x) ? x.map(canon) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon(x[k])])) : x);
const same = (x, y) => JSON.stringify(canon(x)) === JSON.stringify(canon(y));
ok(!same(a, b) && same(fillShape(structuredClone(a)), fillShape(structuredClone(b))), "a key left out and the same key written as null: different before, the same record after");
const filled = fillShape(structuredClone(a));
ok(filled.personal.people[0].sex === null && filled.personal.people[0].salutation === null && filled.personal.nameOrder === null && filled.typeConfidence === null, "left-out nullable keys are written as null (sex, salutation, nameOrder, typeConfidence)");
ok(validateExtraction(filled).length === 0, "the filled record passes the validator", validateExtraction(filled).slice(0, 2).join("; "));
const noType = fillShape((({ requestType, ...rest }) => rest)(structuredClone(a)));
ok(!("requestType" in noType) && validateExtraction(noType).some((e) => /requestType: missing/.test(e)), "a key that may not be empty is not invented: it stays missing and the validator refuses it");
const p = { leg: 0, list: "pax", name: "Testperson Alpha", passport: "X0000001" };
fillShape({ personal: { people: [p] } });
ok(p.passport === "X0000001" && p.name === "Testperson Alpha", "a value the model gave is never touched");
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
