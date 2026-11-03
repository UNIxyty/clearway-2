// The same intake email through the real extractor several times, compared field by field (2026-11-03: the 5.5 models
// take no temperature). Record values (what goes to Leon) must be identical on every run; the wording shown to the
// reviewer (the source's words copied, where found, notes) is counted and printed. Needs the rig's model key
// (known-failures: no-model-key). The same comparison runs on production as scripts/prod-checks/agent-extraction-repeat.mjs.
//   node --env-file=.env.rig rig/intake/extraction-repeat.mjs
import { EMAIL, compareRuns } from "../../scripts/prod-checks/agent-extraction-repeat.mjs";
const { runModel } = await import("../../agent/lib/intake/extract.mjs");
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${d}` : ""}`); if (!c) failures += 1; };
const RUNS = Number(process.env.REPEAT_RUNS || 3);
const outs = []; for (let i = 0; i < RUNS; i++) outs.push((await runModel(EMAIL)).raw);
compareRuns("extraction", outs, ok);
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
