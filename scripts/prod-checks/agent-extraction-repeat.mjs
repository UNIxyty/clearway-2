// Is extraction the same every time? (2026-11-03: the 5.5 models refuse temperature, which extraction set to 0.) The
// same invented intake email through the real extractor (lib/intake/extract.mjs › runModel) several times, compared
// field by field, on the extraction tier as configured and on the model it ran before (Sonnet 5, temperature 0). The
// same for ingest's tier proposal (lib/knowledge/ingest.mjs › classifyDocument). No account; nothing is written (the
// extractor reads Leon's checklist list, nothing else). Prints field PATHS and counts — never a value.
export const ROLES = [];
const RUNS = Number(process.env.REPEAT_RUNS || 5);
// Fields that become the record vs the model's commentary on it
const COMMENTARY = new Set(["confidence", "typeConfidence", "whyType", "why", "reason", "note"]);
const EMAIL = {
  message: { from: "ops@example.invalid", to: ["intake@example.invalid"], date: "Mon, 2 Nov 2026 09:12:00 +0000", subject: "Handling request YL-TST EVRA 05NOV" },
  bodyText: `Dear Clearway team,

Please arrange handling for the following flight (invented test message, no real people).

Operator: Example Test Air
Aircraft: C25C, registration YL-TST, callsign XTA12

Schedule (all UTC times)
05NOV26  EPWA 0830 - EVRA 1015
05NOV26  EVRA 1600 - EPWA 1745

Crew 2, PAX 3 (inbound), PAX TBA outbound.

SERVICES (INBOUND)
- Ground handling
- Fuel uplift, Jet A-1, please confirm availability
- Catering: none required

Passengers inbound (Surname, Name):
TESTPERSON, ALPHA  DOB 01JAN1970  Passport X0000001 exp 01JAN2030  Nationality XX
TESTPERSON, BRAVO  DOB 02FEB1980  Passport X0000002 exp 02FEB2031  Nationality XX
TESTPERSON, CHARLIE DOB 03MAR1990 Passport X0000003 exp 03MAR2032  Nationality XX

Best regards,
Example Test Air Ops`,
  attachments: [],
};

function leaves(x, path = "", out = new Map()) {
  if (x === null || typeof x !== "object") { out.set(path, JSON.stringify(x)); return out; }
  if (Array.isArray(x)) { out.set(`${path}.length`, String(x.length)); x.forEach((v, i) => leaves(v, `${path}[${i}]`, out)); return out; }
  for (const [k, v] of Object.entries(x)) leaves(v, path ? `${path}.${k}` : k, out);
  return out;
}
const isCommentary = (p) => COMMENTARY.has(p.split(".").pop().replace(/\[\d+\]$/, ""));

function compare(label, outputs, ok) {
  const maps = outputs.map((o) => leaves(o));
  const paths = new Set(maps.flatMap((m) => [...m.keys()]));
  const differ = [...paths].filter((p) => new Set(maps.map((m) => m.get(p) ?? "<absent>")).size > 1);
  const record = differ.filter((p) => !isCommentary(p)), comment = differ.filter(isCommentary);
  console.log(`${label}: ${outputs.length} runs · ${paths.size} fields · differ: ${record.length} record field(s), ${comment.length} commentary field(s)`);
  for (const p of record.slice(0, 25)) console.log(`    record  ${p}  (${new Set(maps.map((m) => m.get(p) ?? "<absent>")).size} different answers)`);
  if (record.length > 25) console.log(`    … ${record.length - 25} more`);
  if (comment.length) console.log(`    commentary: ${comment.slice(0, 8).join(", ")}${comment.length > 8 ? " …" : ""}`);
  ok(record.length === 0, `${label}: the same email gives the same record every time`, `${record.length} record field(s) varied`);
  return record.length;
}

export async function check({ ok }) {
  const root = process.env.AGENT_ROOT || "/app";
  const { runModel } = await import(`${root}/lib/intake/extract.mjs`);
  const { classifyDocument } = await import(`${root}/lib/knowledge/ingest.mjs`);
  const { loadModelConfig } = await import(`${root}/lib/models.mjs`);
  const cfg = loadModelConfig(); const saved = JSON.parse(JSON.stringify(cfg.tiers));
  const variants = [["now", null], ...(process.env.REPEAT_BEFORE === "0" ? [] : [["before (Sonnet 5, temperature 0)", { id: "claude-sonnet-5", fallbackId: null, request: null }]])];
  for (const [label, swap] of variants) {
    if (swap) { cfg.tiers.extraction = { ...saved.extraction, ...swap }; cfg.tiers.standard = { ...saved.standard, ...swap }; }
    const outs = []; let tokens = { in: 0, out: 0 }; let model = null;
    for (let i = 0; i < RUNS; i++) { const r = await runModel(EMAIL); outs.push(r.raw); model = r.modelId; tokens.in += r.usage.inputTokens; tokens.out += r.usage.outputTokens; }
    console.log(`extraction ${label} on ${model} · avg in ${Math.round(tokens.in / RUNS)} out ${Math.round(tokens.out / RUNS)}`);
    compare(`extraction ${label}`, outs, ok);
    const docs = []; const sample = "1. Aircraft with a maximum take-off mass above 5,700 kg shall not land at EVRA between 2300 and 0500 UTC without prior permission from the airport operator. 2. Requests shall be sent at least 24 hours in advance. 3. Ground handling at the general aviation apron is provided by the airport's designated handler.";
    for (let i = 0; i < RUNS; i++) docs.push(await classifyDocument({ title: "EVRA night restrictions (invented test text)", source: "test", sample }));
    compare(`ingest tier proposal ${label}`, docs, ok);
    cfg.tiers.extraction = saved.extraction; cfg.tiers.standard = saved.standard;
  }
}
