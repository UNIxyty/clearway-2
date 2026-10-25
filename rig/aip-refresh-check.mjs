// The AIP refresh on the rig (docs/aip-refresh-plan.md, built 2026-10-25). There is no EAD here, so a stub answers the
// checks and stands in for the downloads; what the rig proves is the schedule, the order, the check-or-download
// decision, what the sidecars and the state file record, and what the dashboard monitor would say. Starts its own
// aip-sync worker on :3983 against a scratch STORAGE_ROOT with invented copies; nothing of production is touched.
//   node --env-file=.env.rig rig/aip-refresh-check.mjs
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 180)}` : ""}`); if (!c) failures += 1; };
const ROOT = path.resolve("rig/.scratch/aip-refresh"); fs.rmSync(ROOT, { recursive: true, force: true });
const STORAGE = path.join(ROOT, "storage"), WALL = path.join(ROOT, "wall-data"), STUB = path.join(ROOT, "ead-stub.json");
fs.mkdirSync(path.join(STORAGE, "aip/ead-pdf"), { recursive: true }); fs.mkdirSync(WALL, { recursive: true });
const DAY = 86400e3; const now = Date.now(); const iso = (ms) => new Date(ms).toISOString(); const day = (ms) => iso(ms).slice(0, 10);
const { cycleInForce, airacTable } = await import("../scripts/aip-refresh.mjs");
const cycle = cycleInForce(new Date());
const prevCycle = airacTable().filter((c) => c.effective < cycle.effective).pop();
ok(Boolean(cycle && prevCycle), "the AIRAC table gives the cycle in force and the one before", `${cycle?.airac} ${cycle?.effective} · ${prevCycle?.airac}`);

// invented copies: name → [fetched how long ago, sidecar effective date or null]
const copy = (icao, ageDays, effectiveDate, extra = {}) => {
  const key = `aip/ead-pdf/XX_AD_2_${icao}_en.pdf`; const p = path.join(STORAGE, key);
  fs.writeFileSync(p, "%PDF-1.4\n% rig copy\n%%EOF\n"); const t = new Date(now - ageDays * DAY); fs.utimesSync(p, t, t);
  if (effectiveDate !== undefined) fs.writeFileSync(path.join(STORAGE, key.replace(/\.pdf$/, ".meta.json")), JSON.stringify({ icao, source: "ead", effectiveDate, airac: null, fetchedAt: iso(now - ageDays * DAY), ...extra }, null, 2));
  return key;
};
copy("EVRA", 100, prevCycle.effective);  // over 90 days, dated last cycle; the source now says this cycle → refetch
copy("EYVI", 3, cycle.effective);        // current, has a flight soon → checked first, up to date
copy("LSGG", 40, null);                  // undated → refetch
copy("EGLL", 5, cycle.effective);        // current, source fails → recorded as a failure, copy kept
copy("LFPG", 200);                       // no sidecar at all (fetched before sidecars existed) → undated → refetch
// what the wall writes to data/portal/: the airports with flights in the next 7 days — EYVI, LSGG and EDDF (no copy of EDDF yet)
fs.writeFileSync(path.join(WALL, "upcoming-airports.json"), JSON.stringify({ updatedAt: new Date().toISOString(), airports: ["EDDF", "EYVI", "LSGG"] }));
fs.writeFileSync(path.join(WALL, "timeline-cache.json"), JSON.stringify({ flights: [
  { key: "cwy-cwy:1", flight: { startTimeUTC: iso(now + 2 * DAY), adep: { icao: "EYVI" }, ades: { icao: "LSGG" } } },
  { key: "cwy-cwy:2", flight: { startTimeUTC: iso(now + 5 * DAY), adep: { icao: "EDDF" }, ades: { icao: "EYVI" } } },
  { key: "cwy-cwy:3", flight: { startTimeUTC: iso(now + 20 * DAY), adep: { icao: "LEBL" }, ades: { icao: "EVRA" } } }, // too far ahead to count
] }));
fs.writeFileSync(STUB, JSON.stringify({ EVRA: { effectiveDate: cycle.effective }, EYVI: { effectiveDate: cycle.effective }, LSGG: { effectiveDate: cycle.effective }, EGLL: { fail: "EAD session expired (stub)" }, LFPG: { effectiveDate: prevCycle.effective }, EDDF: { effectiveDate: cycle.effective } }));

const PORT = 3983;
const worker = spawn("node", ["scripts/aip-sync-server.mjs"], { env: { ...process.env, STORAGE_ROOT: STORAGE, WALL_DATA_DIR: WALL, AIP_REFRESH_STUB: STUB, AIP_REFRESH_PAUSE_MS: "0", AIP_REFRESH_SCHEDULE: "off", AIP_REFRESH_SCOPE: "all", AIP_SYNC_PORT: String(PORT), SYNC_SECRET: "rig-refresh", TELEGRAM_BUG_BOT_TOKEN: "", TELEGRAM_BOT_TOKEN: "" }, stdio: ["ignore", "pipe", "pipe"] });
let log = ""; worker.stdout.on("data", (d) => { log += d.toString(); }); worker.stderr.on("data", (d) => { log += d.toString(); });
const up = async () => { for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/health`); if (r.ok) return true; } catch {} await new Promise((r) => setTimeout(r, 500)); } return false; };
ok(await up(), "the worker starts against the scratch storage");
const H = { "x-sync-secret": "rig-refresh" };
const run = async (mode, limit = 500, scope = "all") => (await fetch(`http://127.0.0.1:${PORT}/refresh/run?mode=${mode}&limit=${limit}&scope=${scope}`, { method: "POST", headers: H })).json();
const meta = (icao) => { const dir = path.join(STORAGE, "aip/ead-pdf"); const n = fs.readdirSync(dir).find((f) => f.endsWith(".meta.json") && new RegExp(`(_AD_2_${icao}_|^${icao}_AD2)`).test(f)); return n ? JSON.parse(fs.readFileSync(path.join(dir, n), "utf8")) : null; };
const copiesOf = (icao) => fs.readdirSync(path.join(STORAGE, "aip/ead-pdf")).filter((f) => f.endsWith(".pdf") && new RegExp(`(_AD_2_${icao}_|^${icao}_AD2)`).test(f)).length;
const noAuth = await fetch(`http://127.0.0.1:${PORT}/refresh/run?mode=check`, { method: "POST" }); ok(noAuth.status === 401, "a run needs the sync secret", noAuth.status);

// 0. the default scope: only the airports with flights in the next 7 days (EYVI, LSGG with copies; EDDF without)
const c0 = await run("check", 500, "upcoming"); const s0 = c0.summary;
ok(c0.ok && s0.scope === "upcoming" && s0.planned === 3 && s0.checked === 2 && s0.wouldRefetch === 2 && s0.failed.length === 0, "scope upcoming (the default): three airports — the two with copies checked, EDDF noted as a fetch — nothing else touched", JSON.stringify({ planned: s0.planned, checked: s0.checked, wouldRefetch: s0.wouldRefetch, failed: s0.failed }));
ok(meta("EVRA")?.lastCheck == null && meta("EGLL")?.lastCheck == null, "…EVRA and EGLL (no flights soon) were not even checked");

// 1. check-only over the full order (AIP_REFRESH_SCOPE=all): records, refetches nothing
const c1 = await run("check"); const s1 = c1.summary;
ok(c1.ok && s1.mode === "check" && s1.airac === cycle.airac, "check-only run completes for the cycle in force", JSON.stringify({ airac: s1.airac, planned: s1.planned }));
ok(s1.checked === 4 && s1.refetched === 0, "four copies checked (the fifth's check failed), none refetched in check-only", `${s1.checked} checked, ${s1.refetched} refetched`);
ok(s1.wouldRefetch === 4, "four would be refetched: the dated-last-cycle one, the two undated ones, and EDDF with no copy", `${s1.wouldRefetch}`);
ok(s1.upToDate === 1 && s1.failed.length === 1 && s1.failed[0] === "EGLL", "one up to date, one failure (EGLL), the copy kept", `${s1.upToDate} · ${s1.failed.join(",")}`);
const order = log.split("\n").filter((l) => /AIP-REFRESH.*(EYVI|LSGG|EVRA|LFPG|EGLL|EDDF):/.test(l)).map((l) => /(EYVI|LSGG|EVRA|LFPG|EGLL|EDDF):/.exec(l)[1]);
ok(order[0] === "EYVI" && order[1] === "LSGG" && order.indexOf("EVRA") < order.indexOf("EGLL") && order[order.length - 1] === "EDDF", "order: flights in 7 days first, then the >90-day copies (EVRA, LFPG), then the rest; the no-copy airport last", order.join(" → "));
ok(meta("EYVI")?.lastCheck?.ok === true && !meta("EYVI")?.lastCheck?.newer, "EYVI's sidecar: checked, nothing newer");
ok(meta("EVRA")?.lastCheck?.ok === true && meta("EVRA")?.lastCheck?.newer === true && meta("EVRA")?.effectiveDate === prevCycle.effective, "EVRA's sidecar: checked, newer at the source, the old date kept (check-only)");
ok(meta("EGLL")?.lastCheck?.ok === false && /could not read the source/.test(meta("EGLL")?.lastCheck?.reason ?? "") && fs.existsSync(path.join(STORAGE, "aip/ead-pdf/XX_AD_2_EGLL_en.pdf")), "EGLL's sidecar: the failure recorded in our words, the copy kept");
ok(meta("LFPG") === null || !meta("LFPG")?.effectiveDate, "LFPG (no sidecar before) is still undated after check-only");
const state1 = JSON.parse(fs.readFileSync(path.join(STORAGE, "aip/refresh-state.json"), "utf8"));
ok(state1.last?.failed?.[0] === "EGLL" && state1.runs?.[cycle.airac]?.firstAt && state1.tableHorizonOk === true, "the state file: the run, the failure, the cycle's first run recorded, the table horizon fine");

// 2. download mode: refetches what is newer or undated, fetches the no-copy airport
const c2 = await run("download"); const s2 = c2.summary;
ok(s2.refetched === 3 && s2.noCopyFetched === 1 && s2.failed.length === 1, "download run: three refetched (EVRA, LSGG, LFPG), EDDF fetched new, EGLL still failing", JSON.stringify({ refetched: s2.refetched, noCopy: s2.noCopyFetched, failed: s2.failed }));
ok(meta("EVRA")?.effectiveDate === cycle.effective && meta("EVRA")?.lastCheck?.refetched === true && copiesOf("EVRA") === 1, "EVRA's sidecar now carries this cycle's date, refetched, and the old copy is gone", `${copiesOf("EVRA")} copy, ${meta("EVRA")?.effectiveDate}`);
ok(fs.existsSync(path.join(STORAGE, "aip/ead-pdf/EDDF_AD2.pdf")) && JSON.parse(fs.readFileSync(path.join(STORAGE, "aip/ead-pdf/EDDF_AD2.meta.json"), "utf8")).effectiveDate === cycle.effective, "EDDF: a copy exists now, dated this cycle");
ok(s2.upToDate === 1, "EYVI stays as it is", `${s2.upToDate}`);

// 3. a third run finds everything (but EGLL) up to date
const c3 = await run("download"); const s3 = c3.summary;
ok(s3.refetched === 0 && s3.upToDate === 5 && s3.failed.length === 1, "a run straight after: nothing to refetch, five up to date, EGLL still failing", JSON.stringify({ upToDate: s3.upToDate, failed: s3.failed }));

// 4. due logic: the cycle has a first run → not due again until 24 h later; a state without this cycle is due
const { dueRun } = await import("../scripts/aip-refresh.mjs");
const stateNow = JSON.parse(fs.readFileSync(path.join(STORAGE, "aip/refresh-state.json"), "utf8"));
ok(dueRun(stateNow, new Date()).due === null, "with a first run recorded, nothing is due now");
ok(dueRun(stateNow, new Date(now + DAY + 60_000)).due === "recheck", "…but a recheck is due 24 hours after it");
ok(dueRun({ runs: {} }, new Date()).due === "first" && dueRun({ runs: {} }, new Date()).cycle.airac === cycle.airac, "a state with no run for the cycle in force is due at once (a missed date runs at the next start)");
const status = await (await fetch(`http://127.0.0.1:${PORT}/refresh/status`, { headers: H })).json();
ok(status.ok && status.state?.last?.airac === cycle.airac && status.running === false, "/refresh/status reports the last run");

worker.kill();
console.log(failures ? `${failures} FAILED` : "ALL PASSED"); process.exit(failures ? 1 : 0);
