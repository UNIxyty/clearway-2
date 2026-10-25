// AIP refresh on the AIRAC schedule (docs/aip-refresh-plan.md, built 2026-10-25). Used by scripts/aip-sync-server.mjs.
//
// What it does, once per cycle and again 24 hours later (EAD sometimes publishes late in the day):
//   1. Lists every cached EAD AD 2 copy (STORAGE_ROOT/aip/ead-pdf) with its revision sidecar.
//   2. Orders them: airports with flights on the wall in the next 7 days · copies over 90 days old · copies older than
//      one cycle · the rest. Airports with flights and no copy at all are appended (a download, never a check).
//   3. For each, CHECKS EAD's own table (ead-download-aip-pdf.mjs --check): the copy's effective date against the
//      table's. Downloads only when the table is newer, or the copy has no recorded date — and only in download mode.
//      Check-only mode (the default until AIP_REFRESH_DOWNLOADS=on) records what it found and changes no file.
//   4. Records on every sidecar: lastCheck { at, ok, sourceEffectiveDate, reason } — a failure keeps the old copy and
//      says so; the page, the email and the agent read it. Writes aip/refresh-state.json for the dashboard monitor.
//   5. One Telegram line to the developer channel when a run had failures or a due run did not happen.
// No timer counted from today: a run is DUE when the cycle in force has no run recorded (or no recheck), so a missed
// date runs at the next start. One document at a time, a pause between requests (AIP_REFRESH_PAUSE_MS, 20 s default).
// On the rig there is no EAD: AIP_REFRESH_STUB=<json file> answers the checks and stands in for the downloads.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFile as readStorageFile, saveFile, storagePathForKey } from "../lib/storage.mjs";
import { metaKeyFor, airacForDate, parseSourceDate } from "../lib/aip-revision-meta.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "..");
export const STATE_KEY = "aip/refresh-state.json";
const PDF_DIR_KEY = "aip/ead-pdf";
const DAY = 86_400_000;
const PAUSE_MS = Number(process.env.AIP_REFRESH_PAUSE_MS ?? 20_000);
const CHECK_TIMEOUT_MS = 5 * 60_000;

export function airacTable() {
  const t = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "data", "airac-dates.json"), "utf8"));
  return t.cycles.map((c) => ({ airac: String(c.airac), effective: String(c.effective) }));
}
/** The cycle whose effective date is the latest one not after `now`. */
export function cycleInForce(now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  return [...airacTable()].reverse().find((c) => c.effective <= today) ?? null;
}
export function tableHorizonOk(now = new Date()) { const t = airacTable(); return Date.parse(t[t.length - 1].effective) - now.getTime() > 182 * DAY; }

export async function readState() {
  try { const raw = await readStorageFile(STATE_KEY); return raw ? JSON.parse(raw.toString("utf8")) : { runs: {} }; } catch { return { runs: {} }; }
}
async function writeState(state) { await saveFile(STATE_KEY, JSON.stringify(state, null, 2)); }

/**
 * Is a run due? The first run of a cycle from 00:30Z on its effective date; the recheck 24 h after the first run.
 * Returns { due: "first" | "recheck" | null, cycle, missedDays } — missedDays > 1 means a date went by without a run.
 */
export function dueRun(state, now = new Date()) {
  const cycle = cycleInForce(now); if (!cycle) return { due: null, cycle: null, missedDays: 0 };
  const run = state.runs?.[cycle.airac] ?? null;
  const firstDue = Date.parse(`${cycle.effective}T00:30:00Z`);
  if (!run?.firstAt) return { due: now.getTime() >= firstDue ? "first" : null, cycle, missedDays: Math.floor((now.getTime() - firstDue) / DAY) };
  if (!run.recheckAt && now.getTime() >= Date.parse(run.firstAt) + DAY) return { due: "recheck", cycle, missedDays: 0 };
  return { due: null, cycle, missedDays: 0 };
}

const ICAO_RE = [/_AD_2_([A-Z0-9]{4})_/i, /^([A-Z0-9]{4})_AD2\b/i, /AD_2_([A-Z0-9]{4})\./i];
export function icaoFromFilename(name) { for (const re of ICAO_RE) { const m = re.exec(name); if (m) return m[1].toUpperCase(); } return null; }

/** Every cached EAD copy: { icao, key, fetchedAt, effectiveDate, airac, lastCheck, ageDays }. */
export async function listCopies() {
  const dir = storagePathForKey(PDF_DIR_KEY);
  let names = []; try { names = fs.readdirSync(dir).filter((n) => /\.pdf$/i.test(n)); } catch { return []; }
  const out = [];
  for (const name of names) {
    const icao = icaoFromFilename(name); if (!icao) continue;
    const key = `${PDF_DIR_KEY}/${name}`;
    let meta = null; try { const raw = await readStorageFile(metaKeyFor(key)); meta = raw ? JSON.parse(raw.toString("utf8")) : null; } catch { meta = null; }
    let fetchedAt = meta?.fetchedAt ?? null;
    if (!fetchedAt) { try { fetchedAt = fs.statSync(path.join(dir, name)).mtime.toISOString(); } catch { /* unknown */ } }
    out.push({ icao, key, fetchedAt, effectiveDate: meta?.effectiveDate ?? null, airac: meta?.airac ?? null, lastCheck: meta?.lastCheck ?? null, ageDays: fetchedAt ? Math.floor((Date.now() - Date.parse(fetchedAt)) / DAY) : null });
  }
  return out;
}

/** Airports with flights on the wall in the next 7 days: the wall writes data/portal/upcoming-airports.json (ICAO codes only). */
export function upcomingAirports(now = new Date()) {
  const dir = process.env.WALL_DATA_DIR || "/wall-portal";
  try {
    const small = JSON.parse(fs.readFileSync(path.join(dir, "upcoming-airports.json"), "utf8"));
    if (Array.isArray(small?.airports)) return new Set(small.airports.map((i) => String(i).toUpperCase()));
  } catch { /* an older wall: fall back to its cache when that is what is mounted */ }
  try {
    const c = JSON.parse(fs.readFileSync(path.join(dir, "timeline-cache.json"), "utf8"));
    const set = new Set(); const from = now.getTime() - DAY, to = now.getTime() + 7 * DAY;
    for (const e of c.flights ?? []) { const f = e.flight ?? e; if (f?.isCnl) continue; const t = Date.parse(f?.startTimeUTC ?? ""); if (!Number.isFinite(t) || t < from || t > to) continue; for (const i of [f?.adep?.icao, f?.ades?.icao]) if (i) set.add(String(i).toUpperCase()); }
    return set;
  } catch { return new Set(); }
}

/** The run's order (plan step 4). Each item: { icao, copy|null, why }. */
export function orderRun(copies, upcoming, cycle) {
  const byIcao = new Map(copies.map((c) => [c.icao, c]));
  const olderThanCycle = (c) => (c.effectiveDate ? c.effectiveDate < (cycle?.effective ?? "") : (c.ageDays ?? 0) > 28);
  const seen = new Set(); const out = [];
  const take = (c, why) => { if (seen.has(c.icao)) return; seen.add(c.icao); out.push({ icao: c.icao, copy: c, why }); };
  for (const i of upcoming) if (byIcao.has(i)) take(byIcao.get(i), "flight in the next 7 days");
  for (const c of copies.filter((c) => (c.ageDays ?? 0) > 90).sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0))) take(c, "over 90 days old");
  for (const c of copies.filter(olderThanCycle)) take(c, "older than one cycle");
  for (const c of copies) take(c, "the rest");
  for (const i of upcoming) if (!byIcao.has(i) && !seen.has(i)) { seen.add(i); out.push({ icao: i, copy: null, why: "flight in the next 7 days, no copy yet" }); }
  return out;
}

function readStub() { const p = process.env.AIP_REFRESH_STUB; if (!p) return null; try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return {}; } }

/** EAD's table row for the airport: { effectiveDate (ISO day or null), airacText }. Throws when EAD could not be read. */
export async function checkSource(icao) {
  const stub = readStub();
  if (stub) { const s = stub[icao]; if (!s || s.fail) throw new Error(s?.fail || "EAD did not answer for this airport (stub)"); return { effectiveDate: s.effectiveDate ?? null, airacText: s.airac ?? null }; }
  return new Promise((resolve, reject) => {
    const child = spawn("node", [path.join(PROJECT_ROOT, "scripts", "ead-download-aip-pdf.mjs"), icao, "--check"], { cwd: PROJECT_ROOT, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = ""; const t = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("EAD check timed out")); }, CHECK_TIMEOUT_MS);
    child.stdout.on("data", (d) => { out += d.toString(); }); child.stderr.on("data", (d) => { err += d.toString().slice(0, 400); });
    child.on("close", (code) => {
      clearTimeout(t);
      const line = out.split("\n").find((l) => l.startsWith("EAD-CHECK "));
      if (!line) return reject(new Error(code === 0 ? "EAD check gave no answer" : `EAD check failed (exit ${code})${err ? `: ${err.split("\n")[0].slice(0, 160)}` : ""}`));
      try { const j = JSON.parse(line.slice("EAD-CHECK ".length)); resolve({ effectiveDate: parseSourceDate(j.effectiveDate) ?? null, airacText: j.airacText ?? null }); } catch (e) { reject(e); }
    });
  });
}

/** Should the copy be fetched again? Unknown is not current; a newer date at the source means a new document. */
export function needsRefetch(copy, source) {
  if (!copy) return true;
  if (!copy.effectiveDate) return true;
  if (!source?.effectiveDate) return false; // the table gave no date: keep what we have, say we checked
  return source.effectiveDate > copy.effectiveDate;
}

async function recordLastCheck(copy, lastCheck) {
  if (!copy) return;
  let meta = {}; try { const raw = await readStorageFile(metaKeyFor(copy.key)); meta = raw ? JSON.parse(raw.toString("utf8")) : {}; } catch { meta = {}; }
  await saveFile(metaKeyFor(copy.key), JSON.stringify({ ...meta, icao: meta.icao ?? copy.icao, lastCheck }, null, 2));
}

async function notifyDeveloper(text) {
  const token = String(process.env.TELEGRAM_BUG_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chats = String(process.env.TELEGRAM_BUG_ALLOWED_CHAT_IDS || process.env.TELEGRAM_DEBUG_ALLOWED_CHAT_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!token || !chats.length) return false;
  for (const chat_id of chats) { try { await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id, text }), signal: AbortSignal.timeout(10_000) }); } catch { /* the log has it */ } }
  return true;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One run. `mode`: "check" (record only) or "download" (refetch when needed). `syncIcao(icao)` is the worker's own
 * full fetch (download → storage → sidecar → extract). `limit` caps the list (the rig, a manual trial).
 */
/** The rig's stand-in for a fetch: a placeholder PDF and a sidecar with the stub's date, under the real key layout. */
async function stubSync(icao) {
  const stub = readStub() ?? {}; const src = stub[icao]; if (!src || src.fail) throw new Error(src?.fail || "download failed (stub)");
  const dir = storagePathForKey(PDF_DIR_KEY);
  try { for (const n of fs.readdirSync(dir)) if (icaoFromFilename(n) === icao) fs.rmSync(path.join(dir, n), { force: true }); } catch { /* nothing there */ }
  const key = `${PDF_DIR_KEY}/${icao}_AD2.pdf`;
  await saveFile(key, Buffer.from("%PDF-1.4\n% rig placeholder, not a document\n%%EOF\n"));
  await saveFile(metaKeyFor(key), JSON.stringify({ icao, source: "ead", effectiveDate: src.effectiveDate ?? null, airac: airacForDate(src.effectiveDate ?? null), fetchedAt: new Date().toISOString(), revisionSource: "stub" }, null, 2));
}

export async function runRefresh({ mode = "check", syncIcao, limit = Infinity, log = () => {}, now = new Date(), reason = "scheduled" } = {}) {
  if (readStub()) syncIcao = stubSync; // the rig has no EAD
  const state = await readState();
  const cycle = cycleInForce(now);
  const copies = await listCopies();
  const upcoming = upcomingAirports(now);
  const plan = orderRun(copies, upcoming, cycle).slice(0, limit);
  const summary = { airac: cycle?.airac ?? null, effective: cycle?.effective ?? null, startedAt: now.toISOString(), mode, reason, planned: plan.length, checked: 0, upToDate: 0, refetched: 0, wouldRefetch: 0, failed: [], noCopyFetched: 0, upcomingAirports: upcoming.size, copies: copies.length };
  log(`refresh ${summary.airac ?? "?"} (${mode}, ${reason}): ${plan.length} airports, ${upcoming.size} with flights in 7 days, ${copies.length} copies`);
  let first = true;
  for (const item of plan) {
    if (!first && PAUSE_MS > 0) await sleep(PAUSE_MS); first = false;
    const at = new Date().toISOString();
    try {
      if (!item.copy) {
        // no copy yet: a download when allowed, otherwise noted
        if (mode === "download" && syncIcao) { await syncIcao(item.icao); summary.noCopyFetched += 1; log(`${item.icao}: fetched (no copy before; ${item.why})`); }
        else { summary.wouldRefetch += 1; log(`${item.icao}: no copy yet (${item.why}); would fetch in download mode`); }
        continue;
      }
      const source = await checkSource(item.icao);
      summary.checked += 1;
      if (needsRefetch(item.copy, source)) {
        if (mode === "download" && syncIcao) {
          await syncIcao(item.icao); summary.refetched += 1;
          const fresh = (await listCopies()).find((c) => c.icao === item.icao) ?? item.copy;
          await recordLastCheck(fresh, { at, ok: true, sourceEffectiveDate: source.effectiveDate, refetched: true });
          log(`${item.icao}: refetched (copy ${item.copy.effectiveDate ?? "undated"} → source ${source.effectiveDate ?? "undated"}; ${item.why})`);
        } else {
          summary.wouldRefetch += 1;
          await recordLastCheck(item.copy, { at, ok: true, sourceEffectiveDate: source.effectiveDate, newer: true });
          log(`${item.icao}: newer at the source (copy ${item.copy.effectiveDate ?? "undated"} → ${source.effectiveDate ?? "undated"}); check-only, kept`);
        }
      } else {
        summary.upToDate += 1;
        await recordLastCheck(item.copy, { at, ok: true, sourceEffectiveDate: source.effectiveDate });
        log(`${item.icao}: up to date (${item.copy.effectiveDate ?? "undated"}; ${item.why})`);
      }
    } catch (e) {
      const reasonText = e instanceof Error ? e.message : String(e);
      summary.failed.push(item.icao);
      log(`${item.icao}: FAILED — ${reasonText}`);
      if (item.copy) await recordLastCheck(item.copy, { at, ok: false, reason: "The refresh could not read the source. The copy shown is the last one fetched." }).catch(() => {});
    }
  }
  summary.finishedAt = new Date().toISOString(); summary.durationMs = Date.now() - now.getTime();
  const runs = { ...(state.runs ?? {}) }; const r = { ...(runs[summary.airac] ?? {}) };
  if (reason === "recheck") r.recheckAt = summary.finishedAt; else if (!r.firstAt) r.firstAt = summary.finishedAt; else r.lastAt = summary.finishedAt;
  if (summary.airac) runs[summary.airac] = { ...r, summary };
  await writeState({ ...state, runs, last: summary, tableHorizonOk: tableHorizonOk(now) });
  if (summary.failed.length) await notifyDeveloper(`AIP refresh ${summary.airac} (${mode}): ${summary.checked} checked, ${summary.refetched} refetched, ${summary.failed.length} failed (${summary.failed.slice(0, 12).join(", ")}${summary.failed.length > 12 ? "…" : ""}). The old copies stay; each page says so.`);
  return summary;
}

/** Called by the worker every half hour: runs when due, says so when a date was missed. */
export async function tick({ syncIcao, log = () => {}, now = new Date() } = {}) {
  const state = await readState();
  const due = dueRun(state, now);
  if (!due.due) return null;
  if (due.due === "first" && due.missedDays >= 1 && !state.runs?.[due.cycle.airac]?.missedNoted) {
    await notifyDeveloper(`AIP refresh: AIRAC ${due.cycle.airac} became effective on ${due.cycle.effective} and no run happened for ${due.missedDays} day(s) — running now.`);
    await saveFile(STATE_KEY, JSON.stringify({ ...state, runs: { ...(state.runs ?? {}), [due.cycle.airac]: { ...(state.runs?.[due.cycle.airac] ?? {}), missedNoted: true } } }, null, 2));
  }
  const mode = String(process.env.AIP_REFRESH_DOWNLOADS || "").toLowerCase() === "on" ? "download" : "check";
  return runRefresh({ mode, syncIcao, log, now, reason: due.due });
}
