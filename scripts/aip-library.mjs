// The AIP library (bug report 8 item 3; design "AIP Library", 2026-11-10): one row per country with three links —
// the official AIP page, GEN and ENR straight to the part — and the state of each. The links are DATA, not code:
// the table lives in storage (aip/library.json), seeded from data/aip-library-countries.json (every country, with
// the official page the downloaders already know), and a job re-resolves and checks every link once a day and on
// each AIRAC cycle (the aip-sync worker calls runLibraryCheck). A link that fails is marked, never hidden, and a
// site still on an older cycle says so.
//
// How a GEN / ENR link is found: the official page (and up to a few pages it links to that look like an eAIP menu)
// is read, and every link whose name says GEN or ENR in the eAIP way (XX-GEN-1.2-en-GB.html, ENR-1.1, "GEN 1.2") is
// a candidate; the lowest section number wins (GEN 0/1 … ENR 1 …). A page behind the EAD login gives "login". A page
// with no such links gives "no direct link" with the reason. Nothing is guessed: a link is only written when it was
// read from the site and answered 200.
//
// CLI (inside the worker image or a checkout with network):
//   node scripts/aip-library.mjs check [--country Latvia] [--limit N]     resolve + check and save
//   node scripts/aip-library.mjs show                                      print the table
import { readFile as readStored, saveFile } from "../lib/storage.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const LIBRARY_KEY = "aip/library.json";
const SEED_FILE = join(here, "..", "data", "aip-library-countries.json");
const UA = "Mozilla/5.0 (compatible; ClearwayAIPLibrary/1.0; +https://clearway.verxyl.com)";
const FETCH_MS = 20_000;
const EAD_LOGIN = /ead\.eurocontrol\.int/i;

// ── AIRAC (the same arithmetic as lib/airac.ts; a plain copy so this module needs no TypeScript) ──
const CYCLE_MS = 28 * 86_400_000;
const AIRAC_EPOCH_UTC = Date.UTC(2026, 0, 22); // AIRAC 2601
function firstCycleOfYear(year) {
  let first = new Date(AIRAC_EPOCH_UTC);
  while (first.getUTCFullYear() < year) first = new Date(first.getTime() + CYCLE_MS);
  while (first.getUTCFullYear() > year) first = new Date(first.getTime() - CYCLE_MS);
  while (new Date(first.getTime() - CYCLE_MS).getUTCFullYear() === year) first = new Date(first.getTime() - CYCLE_MS);
  return first;
}
const label = (d) => `${String(d.getUTCFullYear()).slice(2)}${String(Math.round((d.getTime() - firstCycleOfYear(d.getUTCFullYear()).getTime()) / CYCLE_MS) + 1).padStart(2, "0")}`;
export function airacNow(at = new Date()) {
  const n = Math.floor((at.getTime() - AIRAC_EPOCH_UTC) / CYCLE_MS);
  const from = new Date(AIRAC_EPOCH_UTC + n * CYCLE_MS); const next = new Date(from.getTime() + CYCLE_MS);
  return { cycle: label(from), effectiveFrom: from.toISOString().slice(0, 10), nextCycle: label(next), nextEffectiveFrom: next.toISOString().slice(0, 10) };
}

export function seedCountries() {
  return JSON.parse(readFileSync(SEED_FILE, "utf8"));
}

export async function readLibrary() {
  try { const b = await readStored(LIBRARY_KEY); if (b) return JSON.parse(b.toString("utf8")); } catch { /* none yet */ }
  return null;
}

/** The table as the page reads it: the stored rows, or the seed with every link still unchecked. */
export async function libraryTable() {
  const stored = await readLibrary();
  const seed = seedCountries();
  const byIso = new Map((stored?.countries ?? []).map((c) => [c.iso, c]));
  const countries = seed.map((s) => {
    const row = byIso.get(s.iso);
    return row ? { ...s, ...row, name: s.name, prefixes: s.prefixes, region: s.region, provider: s.provider } : { ...s, links: emptyLinks(s), checkedAt: null, airac: null, lastResult: null };
  });
  return { airac: airacNow(), checkedAt: stored?.checkedAt ?? null, running: Boolean(stored?.running), countries };
}

function emptyLinks(s) {
  const official = s.official ? { url: s.official, state: "unchecked", why: "Not checked yet", source: s.officialSource } : { url: null, state: "none", why: "No official page on file", source: null };
  const part = s.official ? { url: null, state: "unchecked", why: "Not resolved yet", source: null } : { url: null, state: "none", why: "No official page on file", source: null };
  return { official, gen: { ...part }, enr: { ...part } };
}

// ── fetching ──
async function get(url, { head = false } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), FETCH_MS);
  try {
    const r = await fetch(url, { method: head ? "HEAD" : "GET", redirect: "follow", signal: ctl.signal, headers: { "user-agent": UA, accept: "text/html,application/pdf,*/*" } });
    const type = r.headers.get("content-type") || "";
    const text = head || !/html|xml|text/i.test(type) ? "" : (await r.text()).slice(0, 2_000_000);
    return { ok: r.ok, status: r.status, url: r.url || url, type, text };
  } catch (e) {
    return { ok: false, status: 0, url, type: "", text: "", error: e?.name === "AbortError" ? `Timed out after ${FETCH_MS / 1000} s` : String(e?.message || e).slice(0, 80) };
  } finally { clearTimeout(t); }
}

/** Every href (and frame src) on a page, absolute. */
function linksOf(html, base) {
  const out = [];
  const re = /(?:href|src)\s*=\s*["']([^"']+)["']/gi; let m;
  while ((m = re.exec(html))) { try { const u = new URL(m[1].trim(), base); u.hash = ""; out.push(u.href); } catch { /* bad href */ } }
  return [...new Set(out)];
}

const PART_RE = { gen: /(?:^|[\/_\-\s%])GEN(?:[\-_ ]?(\d)(?:[._\-](\d+))?)?(?:[^a-z0-9]|$)/i, enr: /(?:^|[\/_\-\s%])ENR(?:[\-_ ]?(\d)(?:[._\-](\d+))?)?(?:[^a-z0-9]|$)/i };
const MENU_RE = /(menu|eAIP|html\/index|history|current|aip\/?$|toc|index-en|-en-GB\.html|package|publication)/i;
const AD_RE = /(?:^|[\/_\-\s])AD[\-_ ]?\d|AD-2|AD2|charts?\//i;

/** Pick the best candidate for a part: a link that names GEN/ENR, lowest section first; a plain "GEN" index is fine. */
function pickPart(links, part) {
  const cands = links.filter((u) => PART_RE[part].test(decodeURIComponent(u)) && !AD_RE.test(u) && !/VFR|SUP|AIC|AMDT|supplement|circular/i.test(decodeURIComponent(u))).map((u) => {
    const m = PART_RE[part].exec(decodeURIComponent(u)); const sec = m?.[1] != null ? Number(m[1]) + (m[2] ? Number(m[2]) / 100 : 0) : -1;
    return { u, sec, score: (sec < 0 ? 0 : 10 - sec) + (/-en-|_en|\/en\//i.test(u) ? 3 : 0) + (/\.html?$|\.pdf$/i.test(u) ? 1 : 0) + (/eAIP\//.test(u) ? 2 : 0) };
  }).sort((a, b) => b.score - a.score);
  return cands[0]?.u ?? null;
}

/** Resolve one country: read its official page and a few menu-like pages, find GEN and ENR, check each. */
export async function resolveCountry(country, { log = () => {} } = {}) {
  const now = new Date().toISOString();
  const out = { iso: country.iso, checkedAt: now, airac: airacNow().cycle, links: { official: null, gen: null, enr: null }, lastResult: "" };
  if (!country.official) {
    out.links = emptyLinks(country).links ?? emptyLinks(country);
    out.lastResult = "No official page on file";
    return out;
  }
  if (EAD_LOGIN.test(country.official)) {
    const r = await get(country.official, { head: true });
    out.links.official = { url: country.official, state: r.ok ? "ok" : "failed", why: r.ok ? "EAD Basic (login)" : `${r.error || `HTTP ${r.status}`}`, source: country.officialSource };
    out.links.gen = { url: null, state: "login", why: "GEN is behind the EAD login", source: "ead" };
    out.links.enr = { url: null, state: "login", why: "ENR is behind the EAD login", source: "ead" };
    out.lastResult = r.ok ? "EAD login page answers; parts need a login" : `Official page failed: ${out.links.official.why}`;
    return out;
  }
  const first = await get(country.official);
  out.links.official = { url: country.official, state: first.ok ? "ok" : "failed", why: first.ok ? "Opens" : first.error || `HTTP ${first.status}`, source: country.officialSource };
  if (!first.ok) {
    out.links.gen = { url: null, state: "failed", why: `Official page failed: ${out.links.official.why}`, source: null };
    out.links.enr = { ...out.links.gen };
    out.lastResult = `Official page failed: ${out.links.official.why}`;
    return out;
  }
  // Walk the site the way a person does: the entry page, then the pages that look like an eAIP index or menu (and the
  // frames inside them), newest issue first but never one dated after today, at most MAX_PAGES fetches.
  const MAX_PAGES = 10;
  const host = new URL(first.url).host;
  const today = new Date().toISOString().slice(0, 10);
  const dateOf = (u) => (u.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || "";
  const prio = (u) => (/menu/i.test(u) ? 4 : /\/index\.html?$|index-en/i.test(u) ? 3 : /eAIP|history|current|package|publication|toc/i.test(u) ? 2 : 1);
  let links = linksOf(first.text, first.url);
  const seen = new Set([first.url]);
  let fetched = 0;
  const candidates = () => links
    .filter((u) => !seen.has(u) && new URL(u).host === host && !/\.(pdf|png|jpe?g|gif|css|js|zip|xml|ico|svg)(\?|$)/i.test(u) && !PART_RE.gen.test(decodeURIComponent(u)) && !PART_RE.enr.test(decodeURIComponent(u)) && !AD_RE.test(u) && (MENU_RE.test(u) || /\.html?(\?|$)/i.test(u)))
    .filter((u) => !dateOf(u) || dateOf(u) <= today)
    .sort((a, b) => prio(b) - prio(a) || dateOf(b).localeCompare(dateOf(a)));
  while (fetched < MAX_PAGES) {
    const next = candidates()[0];
    if (!next) break;
    seen.add(next); fetched += 1;
    const r = await get(next);
    if (r.ok && r.text) links = [...new Set([...links, ...linksOf(r.text, r.url)])];
    if (pickPart(links, "gen") && pickPart(links, "enr")) break;
  }
  for (const part of ["gen", "enr"]) {
    const url = pickPart(links, part);
    if (!url) { out.links[part] = { url: null, state: "nodeep", why: `The site offers no direct link to ${part.toUpperCase()} that we can read`, source: "resolved" }; continue; }
    const r = await get(url, { head: true });
    const r2 = r.ok ? r : await get(url); // some servers refuse HEAD
    out.links[part] = r2.ok ? { url, state: "ok", why: "Opens the part", source: "resolved" } : { url, state: "failed", why: r2.error || `HTTP ${r2.status}`, source: "resolved" };
  }
  const bad = ["gen", "enr"].filter((k) => out.links[k].state === "failed");
  out.lastResult = bad.length ? `${bad.map((k) => k.toUpperCase()).join(" and ")} link failed` : ["gen", "enr"].every((k) => out.links[k].state === "ok") ? "All three links open" : "Official page opens; a part has no direct link";
  log(`${country.name}: ${out.lastResult}`);
  return out;
}

/** The job: every country (or one), saved as it goes so a long run leaves a partial table rather than nothing. */
export async function runLibraryCheck({ only = null, limit = 500, log = (s) => console.log(`[aip-library] ${s}`), pauseMs = 1500 } = {}) {
  const seed = seedCountries();
  const stored = (await readLibrary()) ?? { countries: [] };
  const byIso = new Map((stored.countries ?? []).map((c) => [c.iso, c]));
  const todo = seed.filter((c) => !only || c.name.toLowerCase() === String(only).toLowerCase() || c.iso === String(only).toLowerCase()).slice(0, limit);
  const started = new Date().toISOString();
  let n = 0;
  await saveFile(LIBRARY_KEY, Buffer.from(JSON.stringify({ ...stored, running: true, startedAt: started })));
  for (const c of todo) {
    try { byIso.set(c.iso, await resolveCountry(c, { log })); }
    catch (e) { byIso.set(c.iso, { iso: c.iso, checkedAt: new Date().toISOString(), airac: airacNow().cycle, links: emptyLinks(c), lastResult: `Check crashed: ${String(e?.message || e).slice(0, 80)}` }); }
    n += 1;
    if (n % 10 === 0) await saveFile(LIBRARY_KEY, Buffer.from(JSON.stringify({ countries: [...byIso.values()], checkedAt: stored.checkedAt ?? null, running: true, startedAt: started })));
    await new Promise((r) => setTimeout(r, pauseMs));
  }
  const final = { countries: [...byIso.values()], checkedAt: new Date().toISOString(), running: false, startedAt: started, airac: airacNow().cycle };
  await saveFile(LIBRARY_KEY, Buffer.from(JSON.stringify(final)));
  log(`done: ${n} countries checked`);
  return { checked: n, checkedAt: final.checkedAt };
}

/** Is a run due? Once a day (after 03:00Z) and on an AIRAC effective date; never twice in six hours. */
export async function libraryCheckDue(now = new Date()) {
  const stored = await readLibrary();
  const last = stored?.checkedAt ? Date.parse(stored.checkedAt) : 0;
  if (stored?.running && stored.startedAt && now.getTime() - Date.parse(stored.startedAt) < 3 * 3600_000) return false;
  if (now.getTime() - last < 6 * 3600_000) return false;
  const today = now.toISOString().slice(0, 10);
  const lastDay = last ? new Date(last).toISOString().slice(0, 10) : "";
  if (lastDay !== today && now.getUTCHours() >= 3) return true;
  return airacNow(now).effectiveFrom === today && lastDay !== today;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const cmd = process.argv[2] || "show";
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  if (cmd === "check") runLibraryCheck({ only: arg("--country"), limit: Number(arg("--limit")) || 500 }).then((r) => console.log(JSON.stringify(r)));
  else libraryTable().then((t) => { for (const c of t.countries) console.log(`${c.name.padEnd(24)} ${c.links.official.state.padEnd(9)} ${c.links.gen.state.padEnd(9)} ${c.links.enr.state.padEnd(9)} ${c.airac || "-"} ${c.lastResult || ""}`); });
}
