#!/usr/bin/env node
// Passenger Manifest — survey across every configured operator. READ-ONLY against Leon; every manifest is generated
// IN MEMORY by the real generator and discarded (nothing is saved, recorded or sent). For each flight the printed
// text is read back out of the PDF and compared with Leon's own raw values.
//
//   node scripts/manifest-survey.mjs [--per-operator 12] [--days-back 10] [--days-ahead 20] [--include <oprId:nid>,…]
//   node scripts/manifest-survey.mjs --redacted <oprId:nid> --out sample.pdf
//        (the real manifest with every passenger value masked — letters → X, digits → 9 — so the layout of real
//         filled rows can be shown without showing anyone's details)
//
// Prints operational fields and counts only: callsign, registration, operator, row counts, warning codes. Never a
// passenger's name, date, document, nationality, or the text of an operator note.
import { writeFileSync } from "node:fs";
import { PDFParse } from "pdf-parse";
import { listOperators, leonForOperator, searchFlightsAllOperators } from "../lib/leon-operators.mjs";
import { generatePassengerManifest } from "../lib/manifest/index.mjs";
import { readManifestFlight, parseFlightId } from "../lib/manifest/leon.mjs";
import { buildManifestModel } from "../lib/manifest/model.mjs";
import { renderManifest } from "../lib/manifest/render.mjs";

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };

if (arg("redacted")) {
  const { oprId, nid } = parseFlightId(arg("redacted"));
  const leon = await leonForOperator(oprId);
  const read = await readManifestFlight(leon, nid);
  const built = buildManifestModel(read.flight, read);
  const mask = (v) => String(v ?? "").replace(/\p{L}/gu, "X").replace(/\p{N}/gu, "9");
  built.model.passengers = built.model.passengers.map((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, k === "sex" ? (v ? "X" : "") : mask(v)])));
  const { bytes, pageCount } = await renderManifest(built.model, { title: "Passenger Manifest (redacted sample)" });
  writeFileSync(arg("out", "redacted.pdf"), bytes, { mode: 0o600 });
  console.log(JSON.stringify({ flight: arg("redacted"), rows: built.model.passengers.length, pageCount, header: built.model.flight }));
  process.exit(0);
}

const per = Number(arg("per-operator", 12));
const now = Date.now();
const search = await searchFlightsAllOperators({ fromMs: now - Number(arg("days-back", 10)) * 86_400_000, toMs: now + Number(arg("days-ahead", 20)) * 86_400_000 });
// Spread: per operator, flights evenly across its list (not just the first N).
const pick = [];
for (const op of search.operators) {
  const list = search.flights.filter((f) => f.oprId === op.oprId);
  const step = Math.max(1, Math.floor(list.length / per));
  for (let i = 0; i < list.length && pick.filter((p) => p.oprId === op.oprId).length < per; i += step) pick.push(list[i]);
}
for (const key of String(arg("include", "")).split(",").filter(Boolean)) if (!pick.some((p) => p.key === key)) pick.push({ key, oprId: key.split(":")[0] });

const rows = [];
for (const f of pick) {
  const { oprId } = parseFlightId(f.key);
  let raw = null;
  const row = { key: f.key, oprId };
  try {
    const real = await leonForOperator(oprId);
    // Capture Leon's raw flight as the generator reads it, to compare the page with it.
    const leon = { oprId: real.oprId, name: real.name, graphql: async (q) => { const r = await real.graphql(q); if (/flightNo isCnl/.test(q)) raw = r.data?.flight ?? null; return r; } };
    const made = await generatePassengerManifest({ flightId: f.key, leon });
    const text = (await new PDFParse({ data: made.pdf }).getText()).text;
    const has = (v) => v == null || v === "" ? null : new RegExp(`(^|[\\s])${String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[\\s])`, "m").test(text);
    Object.assign(row, {
      callsign: raw?.flightNo ?? null,
      registration: raw?.acft?.registration ?? null,
      regPrinted: has(raw?.acft?.registration),
      flightNoPrinted: has(raw?.flightNo),
      operator: made.result.operator?.name ?? "",
      operatorSource: made.result.operator?.source ?? null,
      leonOperator: raw?.operator?.name ?? null,
      guestAccount: Boolean(raw?.operator?.isGuest || /sub[_-]?operator/i.test(raw?.operator?.planMode ?? "")),
      rows: made.result.passengerCount,
      leonCount: raw?.passengerList?.count ?? null,
      source: raw?.passengerList ? (raw.passengerList.isDataSourceContact ? "records" : raw.passengerList.isDataSourceText ? "text" : "?") : "none",
      note: made.result.hasPaxNote,
      pages: made.result.pageCount,
      codes: [...new Set(made.result.warnings.map((w) => w.code))],
      missingRows: made.result.missing.length,
    });
  } catch (error) {
    row.failed = `${error.code ?? "error"}: ${String(error.message).slice(0, 120)}`;
  }
  rows.push(row);
}

const ok = rows.filter((r) => !r.failed);
const by = (fn) => ok.filter(fn).length;
console.log(`\nflights processed: ${rows.length} (${ok.length} generated, ${rows.length - ok.length} failed) across ${new Set(rows.map((r) => r.oprId)).size} operators`);
console.log(`operators searched: ${search.operators.map((o) => `${o.oprId}${o.available ? "" : " (UNAVAILABLE)"}`).join(", ")}`);
console.log(`registration printed differs from Leon's stored value: ${by((r) => r.regPrinted === false)}`);
console.log(`flight number printed differs from Leon's flightNo: ${by((r) => r.flightNoPrinted === false)}`);
console.log(`manifests with a blank operator: ${by((r) => !r.operator)} · operator sources: ${JSON.stringify(ok.reduce((a, r) => ((a[r.operatorSource ?? "none (blank)"] = (a[r.operatorSource ?? "none (blank)"] ?? 0) + 1), a), {}))}`);
console.log(`manifests with zero passenger rows: ${by((r) => r.rows === 0)} (of which Leon has a count but no names: ${by((r) => r.rows === 0 && r.leonCount > 0 && !r.note)}, a free-text note: ${by((r) => r.note)}, no passengers at all: ${by((r) => r.rows === 0 && !(r.leonCount > 0) && !r.note)})`);
console.log(`manifests with filled rows: ${by((r) => r.rows > 0)} (rows in total ${ok.reduce((a, r) => a + r.rows, 0)})`);
console.log(`warning codes: ${JSON.stringify(ok.flatMap((r) => r.codes).reduce((a, c) => ((a[c] = (a[c] ?? 0) + 1), a), {}))}`);
console.log("\nper operator:");
for (const op of [...new Set(rows.map((r) => r.oprId))]) {
  const rs = rows.filter((r) => r.oprId === op); const g = rs.filter((r) => !r.failed);
  console.log(`  ${op.padEnd(8)} processed ${String(rs.length).padStart(3)} · failed ${rs.length - g.length} · reg ≠ Leon ${g.filter((r) => r.regPrinted === false).length} · blank operator ${g.filter((r) => !r.operator).length} · zero rows ${g.filter((r) => r.rows === 0).length} · filled ${g.filter((r) => r.rows > 0).length}`);
}
console.log("\nper flight:");
for (const r of rows) {
  console.log(r.failed
    ? `  ${r.key.padEnd(18)} FAILED ${r.failed}`
    : `  ${r.key.padEnd(18)} ${String(r.callsign).padEnd(9)} reg ${JSON.stringify(r.registration).padEnd(12)} printed-as-stored:${r.regPrinted} · operator ${JSON.stringify(r.operator)}${r.guestAccount ? ` (Leon: ${JSON.stringify(r.leonOperator)}, guest account)` : ""} · rows ${r.rows} (Leon count ${r.leonCount}, source ${r.source}${r.note ? ", note" : ""}) · ${r.codes.join(",") || "no warnings"}`);
}
process.exit(0);
