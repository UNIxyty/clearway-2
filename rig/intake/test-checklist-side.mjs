// One checklist item every time (2026-11-08): a plain pick ("Catering") takes the leg's airport variant ("Catering
// (ADES)") when the leg's other services are on that airport; otherwise it stays. Pure code; invented items and nids.
//   node rig/intake/test-checklist-side.mjs
import { sideChecklistItems } from "../../agent/lib/intake/extract.mjs";
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${d}` : ""}`); if (!c) failures += 1; };
const defs = [{ nid: 9001, section: "Pax", label: "Snacks" }, { nid: 9002, section: "Pax", label: "Snacks (ADEP)" }, { nid: 9003, section: "Pax", label: "Snacks (ADES)" },
  { nid: 9010, section: "Ground", label: "Towing (ADES)" }, { nid: 9011, section: "Ground", label: "Towing (ADEP)" }, { nid: 9020, section: "Ops", label: "Water" }];
const nids = (legs) => sideChecklistItems({ legs: legs.map((s) => ({ services: s.map((n) => ({ checklistNid: n })) })) }, defs).legs.map((l) => l.services.map((s) => s.checklistNid));
ok(JSON.stringify(nids([[9010, 9001]])) === "[[9010,9003]]", "a plain pick takes the variant of the airport the leg's other services are on");
ok(JSON.stringify(nids([[9010, 9003]])) === "[[9010,9003]]", "a pick already on that airport stays");
ok(JSON.stringify(nids([[9001, 9020]])) === "[[9001,9020]]", "a leg with no airport-specific pick keeps the plain item");
ok(JSON.stringify(nids([[9010, 9011, 9001]])) === "[[9010,9011,9001]]", "a leg with picks on both airports keeps the plain item (no guess)");
ok(JSON.stringify(nids([[9010, 9020]])) === "[[9010,9020]]", "an item with no airport variants is left alone");
ok(JSON.stringify(nids([[9010, 9001], [9011, 9001]])) === "[[9010,9003],[9011,9002]]", "each leg by its own airport");
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
