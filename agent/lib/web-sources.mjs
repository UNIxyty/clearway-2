// Web search settings (2026-11-03): which provider searches, and the approved sources. Settings data, not code — the
// agent_settings rows below, edited on Settings › Web search without a deploy:
//   web:provider  "both" (the default) | "anthropic" | "tavily"
//   web:sources   { official: [domain…], industry: [domain…] } — seeded from agent/config/web-sources.json on first read
//
// The two-pass policy reads them: pass one searches only official + industry; pass two (after widen_web_search) is
// unrestricted. Every cited source is classed by its domain — official, industry, or other — and a claim resting only
// on "other" carries the mark beside it in the console ("not from an official source: reuters.com, 2 Nov").
//
// A row that cannot be read falls back to the file, said in the log and in `source`; it is never treated as empty —
// an empty allowed list would make pass one search the whole web (the API treats no list as no restriction).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rest } from "./knowledge/retrieval.mjs";
import { logDetail } from "./public-errors.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEED = path.join(HERE, "..", "config", "web-sources.json");
const KEYS = { provider: "web:provider", sources: "web:sources" };
export const PROVIDERS = ["both", "anthropic", "tavily"];
const DOMAIN = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function seedSources() {
  const j = JSON.parse(fs.readFileSync(SEED, "utf8"));
  return { official: cleanList(j.official), industry: cleanList(j.industry) };
}
export function cleanList(v) {
  const raw = Array.isArray(v) ? v : String(v ?? "").split(/[\s,;]+/);
  return [...new Set(raw.map((d) => String(d).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")).filter(Boolean))];
}

let cache = { at: 0, value: null };
export async function webSettings({ fresh = false } = {}) {
  if (!fresh && cache.value && Date.now() - cache.at < 15_000) return withOverrides(cache.value);
  let rows = null;
  try { rows = (await rest(`agent_settings?select=id,enabled,reason,updated_at,updated_by_email&id=in.(${Object.values(KEYS).map((k) => `"${k}"`).join(",")})`)) ?? []; }
  catch (e) { logDetail("web", "could not read the web search settings; using the seed list", e); }
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  const out = { provider: "both", official: [], industry: [], source: {}, updated: {} };
  const p = byId.get(KEYS.provider);
  out.provider = PROVIDERS.includes(String(p?.reason)) ? String(p.reason) : "both";
  out.source.provider = p ? "settings" : rows === null ? "default (settings unreadable)" : "default";
  const s = byId.get(KEYS.sources);
  let parsed = null; try { parsed = s ? JSON.parse(s.reason) : null; } catch { parsed = null; }
  if (parsed && (parsed.official?.length || parsed.industry?.length)) { out.official = cleanList(parsed.official); out.industry = cleanList(parsed.industry); out.source.sources = "settings"; }
  else {
    const seed = seedSources(); out.official = seed.official; out.industry = seed.industry;
    out.source.sources = rows === null ? "seed file (settings unreadable)" : "seed file";
    // first read: the row is written from the file, so from now on the Settings page is where the list lives
    // (a check account writes nothing: AGENT_WEB_NO_SEED=1 reads the file and leaves the row to the service)
    if (rows !== null && !s && process.env.AGENT_WEB_NO_SEED !== "1") await saveRow(KEYS.sources, JSON.stringify(seed), "web-sources-seed@check.invalid").then(() => { out.source.sources = "settings"; }).catch((e) => logDetail("web", "could not seed the approved sources row", e));
  }
  for (const [k, id] of Object.entries(KEYS)) { const r = byId.get(id); if (r) out.updated[k] = { at: r.updated_at, by: r.updated_by_email ?? null }; }
  cache = { at: Date.now(), value: out };
  return withOverrides(out);
}

// A check run (scripts/check-accounts.sh, the test prompts) may pin the provider or the approved list for its own
// process only: AGENT_WEB_PROVIDER, AGENT_WEB_ALLOWED (comma list, replaces official+industry). Never set on a service.
function withOverrides(v) {
  const prov = String(process.env.AGENT_WEB_PROVIDER || "").trim();
  const allowed = String(process.env.AGENT_WEB_ALLOWED || "").trim();
  if (!prov && !allowed) return v;
  return { ...v, ...(PROVIDERS.includes(prov) ? { provider: prov } : {}), ...(allowed ? { official: cleanList(allowed), industry: [] } : {}), overridden: true, allowedOverride: Boolean(allowed) };
}

async function saveRow(id, reason, by) {
  await rest("agent_settings?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ id, enabled: true, reason, updated_at: new Date().toISOString(), updated_by_email: by ?? null }]) });
}

/** Saves the provider and/or the lists. Throws with a plain reason for anything invalid; saves nothing then. */
export async function setWebSettings(patch, user) {
  const writes = [];
  if (patch.provider !== undefined) {
    if (!PROVIDERS.includes(String(patch.provider))) throw Object.assign(new Error(`Provider must be one of: ${PROVIDERS.join(", ")}`), { status: 400 });
    writes.push([KEYS.provider, String(patch.provider)]);
  }
  if (patch.official !== undefined || patch.industry !== undefined) {
    const now = await webSettings({ fresh: true });
    const official = patch.official !== undefined ? cleanList(patch.official) : now.official;
    const industry = patch.industry !== undefined ? cleanList(patch.industry) : now.industry;
    const bad = [...official, ...industry].filter((d) => !DOMAIN.test(d));
    if (bad.length) throw Object.assign(new Error(`Not a domain: ${bad.join(", ")}. Write the domain alone, e.g. caa.co.uk.`), { status: 400 });
    if (!official.length) throw Object.assign(new Error("Keep at least one official source: an empty list would make the first pass search the whole web."), { status: 400 });
    const both = official.filter((d) => industry.includes(d));
    if (both.length) throw Object.assign(new Error(`On both lists: ${both.join(", ")}. A source is official or industry, not both.`), { status: 400 });
    writes.push([KEYS.sources, JSON.stringify({ official, industry })]);
  }
  for (const [id, reason] of writes) await saveRow(id, reason, user?.email ?? null);
  cache = { at: 0, value: null };
  return webSettings({ fresh: true });
}

export const hostOf = (url) => { try { return new URL(String(url)).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } };
const under = (host, d) => host === d || host.endsWith(`.${d}`);
/** official | industry | other — by the cited URL's host, a listed domain covering its subdomains (as the API's filter does). */
export function classifyUrl(url, settings) {
  const host = hostOf(url); if (!host) return "other";
  if ((settings?.official ?? []).some((d) => under(host, d))) return "official";
  if ((settings?.industry ?? []).some((d) => under(host, d))) return "industry";
  return "other";
}
/** Pass one's domain list: official + industry. Never empty (see the header). */
export const approvedDomains = (settings) => { const l = [...(settings?.official ?? []), ...(settings?.industry ?? [])]; return l.length ? l : seedSources().official; };

/** The Anthropic API's own web search tool for this pass. Riga by city and time zone: the API refuses country LV (2026-11-03). */
export function anthropicWebTool(settings, { widened }) {
  return {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: Number(process.env.AGENT_WEB_MAX_USES || 5),
    user_location: { type: "approximate", city: "Riga", timezone: "Europe/Riga" },
    ...(widened ? {} : { allowed_domains: approvedDomains(settings) }),
  };
}
