// Routing configuration and escalation (item 3).
//
// CONFIG, NOT CODE, and editable without a deploy: agent/config/models.json is the baseline baked into
// the image; an admin override lives in the agent_settings row `routing` (JSON in `reason`) and is
// re-read every 30 s. Env BEDROCK_MODEL_<TIER> still wins over both, for emergencies.
//
// Escalation is ONE-WAY: fast → standard → reasoning. Nothing here can lower a tier, and a tier the
// user chose (/model or their Settings default) is a floor for the whole turn.

import { rest } from "./knowledge/retrieval.mjs";
import { loadModelConfig, setRuntimeOverride } from "./models.mjs";

export const LADDER = ["fast", "standard", "reasoning"];
export const MANUAL_TIERS = ["fast", "standard", "reasoning"];

export const ESCALATION_DEFAULTS = {
  // Router confidence (0–1) below which the router's pick is raised one step.
  lowConfidenceBelow: 0.6,
  // More than this many tool calls in one turn → one step up for the rest of the turn.
  maxToolsBeforeEscalate: 4,
  // A turn that retrieved APPROVED (authoritative, tier-1) text runs on at least this tier.
  authoritativeFloor: "standard",
  // Retrieval returned conflicting sources (superseded vs current, two approved clauses that differ) → this tier.
  conflictTo: "reasoning",
  // The user asked for care ("check carefully", "are you sure") → this tier.
  careTo: "reasoning",
  // The first attempt failed before any answer was shown → retry once, one step up.
  retryOnFailure: true,
  careWords: ["check carefully", "are you sure", "double[- ]check", "think (hard|carefully)", "be careful", "thorough(ly)?", "make sure", "verify", "careful(ly)?"],
};

let cache = { at: 0, value: null };

/** Current routing settings: file baseline merged with the admin override. */
export async function routingSettings({ reload = false } = {}) {
  if (!reload && cache.value && Date.now() - cache.at < 30_000) return cache.value;
  let override = null;
  try {
    const row = (await rest("agent_settings?id=eq.routing&select=reason,updated_at,updated_by_email"))?.[0];
    override = row?.reason ? { ...JSON.parse(row.reason), updatedAt: row.updated_at ?? null, updatedBy: row.updated_by_email ?? null } : null;
  } catch { override = cache.value?.override ?? null; }
  const escalation = { ...ESCALATION_DEFAULTS, ...(override?.escalation ?? {}) };
  setRuntimeOverride(override?.tiers ?? null);
  const value = { override, escalation, tiers: loadModelConfig().tiers };
  cache = { at: Date.now(), value };
  return value;
}

/** Admin: save the tier→model mapping and/or escalation rules. Validated; takes effect on the next turn. */
export async function setRoutingSettings(input, user) {
  const tiers = {};
  for (const tier of ["router", "fast", "standard", "reasoning", "extraction", "embeddings", "rerank"]) {
    const t = input?.tiers?.[tier]; if (!t) continue;
    const id = t.id == null || t.id === "" ? null : String(t.id).trim();
    const fallbackId = t.fallbackId == null || t.fallbackId === "" ? null : String(t.fallbackId).trim();
    for (const v of [id, fallbackId]) if (v && !/^[a-z0-9.:_-]{3,120}$/i.test(v)) throw new Error(`Not a model id: ${v}`);
    tiers[tier] = { id, fallbackId };
  }
  const esc = {};
  const e = input?.escalation ?? {};
  if (e.lowConfidenceBelow != null) { const n = Number(e.lowConfidenceBelow); if (!(n >= 0 && n <= 1)) throw new Error("lowConfidenceBelow must be 0–1."); esc.lowConfidenceBelow = n; }
  if (e.maxToolsBeforeEscalate != null) { const n = Math.round(Number(e.maxToolsBeforeEscalate)); if (!(n >= 1 && n <= 20)) throw new Error("maxToolsBeforeEscalate must be 1–20."); esc.maxToolsBeforeEscalate = n; }
  for (const k of ["authoritativeFloor", "conflictTo", "careTo"]) if (e[k] != null) { if (!LADDER.includes(e[k])) throw new Error(`${k} must be fast, standard or reasoning.`); esc[k] = e[k]; }
  if (e.retryOnFailure != null) esc.retryOnFailure = Boolean(e.retryOnFailure);
  const body = { tiers, escalation: esc };
  await rest("agent_settings", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ id: "routing", enabled: true, reason: JSON.stringify(body), updated_at: new Date().toISOString(), updated_by_email: user?.email ?? null }]) });
  cache = { at: 0, value: null };
  return routingSettings({ reload: true });
}

/** Raise `tier` to at least `floor`. Never lowers. */
export function atLeast(tier, floor) {
  return LADDER.indexOf(floor) > LADDER.indexOf(tier) ? floor : tier;
}
export function oneUp(tier) {
  const i = LADDER.indexOf(tier);
  return i >= 0 && i < LADDER.length - 1 ? LADDER[i + 1] : tier;
}

export function asksForCare(text, escalation = ESCALATION_DEFAULTS) {
  const re = new RegExp(`\\b(${(escalation.careWords ?? ESCALATION_DEFAULTS.careWords).join("|")})\\b`, "i");
  return re.test(String(text ?? ""));
}

/**
 * After a tool round: should the rest of the turn run on a higher tier?
 * Returns { to, reason } or null. Signals are read from what the tools ACTUALLY returned.
 */
export function escalationAfterRound({ tier, toolCalls, escalation }) {
  const moves = [];
  if (toolCalls.length > escalation.maxToolsBeforeEscalate) moves.push({ to: oneUp(tier), reason: `more than ${escalation.maxToolsBeforeEscalate} tool calls in one turn` });
  for (const c of toolCalls) {
    const r = c.result ?? {};
    if (c.name === "search_knowledge" && Array.isArray(r.verbatim) && r.verbatim.length > 0) {
      moves.push({ to: atLeast(tier, escalation.authoritativeFloor), reason: "the answer draws on approved (authoritative) text" });
      const refs = new Map();
      for (const v of r.verbatim) { const k = `${v.reference ?? ""}|${String(v.title ?? "").toLowerCase()}`; if (!refs.has(k)) refs.set(k, new Set()); refs.get(k).add(String(v.text ?? "").trim()); }
      const differing = [...refs.values()].some((s) => s.size > 1);
      const mixed = r.verbatim.some((v) => v.revision?.state === "superseded") && r.verbatim.some((v) => v.revision?.state === "current");
      if (differing || mixed) moves.push({ to: atLeast(tier, escalation.conflictTo), reason: differing ? "retrieval returned approved clauses that disagree" : "retrieval returned both a current and a superseded revision" });
    }
    if (Array.isArray(r.revisionNotes) && r.revisionNotes.some((n) => /SUPERSEDED/.test(n)) && (r.reference?.length || r.verbatim?.length)) {
      moves.push({ to: atLeast(tier, escalation.conflictTo), reason: "sources include a superseded revision" });
    }
  }
  const best = moves.filter((m) => LADDER.indexOf(m.to) > LADDER.indexOf(tier)).sort((a, b) => LADDER.indexOf(b.to) - LADDER.indexOf(a.to))[0];
  return best ?? null;
}

// ── Per-user preferences (stored as agent_settings rows, no DDL) ───────────────────────────────────
// pref:<userId>:tier          reason = "fast" | "standard" | "reasoning" | "" (automatic)
// pref:<userId>:skipConfirm   enabled = true/false  (item 4)
// pref:<userId>:replyMode     reason = "auto" | "spoken" | "text"  (voice reply, spec 6b; default auto)
// lock:skipConfirm            enabled = true → nobody may skip; reason = JSON array of locked user ids

export const REPLY_MODES = ["auto", "spoken", "text"];

export async function userPrefs(userId) {
  const ids = [`pref:${userId}:tier`, `pref:${userId}:skipConfirm`, `pref:${userId}:replyMode`, "lock:skipConfirm"];
  const rows = (await rest(`agent_settings?id=in.(${ids.map((i) => `"${encodeURIComponent(i)}"`).join(",")})&select=id,enabled,reason`).catch(() => [])) ?? [];
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  const lock = by["lock:skipConfirm"];
  let lockedUsers = [];
  try { lockedUsers = lock?.reason ? JSON.parse(lock.reason) : []; } catch { lockedUsers = []; }
  const lockedForAll = lock?.enabled === true;
  const skipLocked = lockedForAll || lockedUsers.includes(userId);
  const defaultTier = MANUAL_TIERS.includes(by[`pref:${userId}:tier`]?.reason) ? by[`pref:${userId}:tier`].reason : null;
  const replyMode = REPLY_MODES.includes(by[`pref:${userId}:replyMode`]?.reason) ? by[`pref:${userId}:replyMode`].reason : "auto";
  return { defaultTier, replyMode, skipConfirm: !skipLocked && by[`pref:${userId}:skipConfirm`]?.enabled === true, skipConfirmRequested: by[`pref:${userId}:skipConfirm`]?.enabled === true, skipLocked, skipLockedForAll: lockedForAll };
}

export async function setUserPref(userId, email, key, value) {
  if (key === "tier") {
    const v = value == null || value === "" || value === "auto" ? "" : String(value);
    if (v && !MANUAL_TIERS.includes(v)) throw new Error("Tier must be fast, standard, reasoning or automatic.");
    await rest("agent_settings", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ id: `pref:${userId}:tier`, enabled: Boolean(v), reason: v, updated_at: new Date().toISOString(), updated_by_email: email ?? null }]) });
  } else if (key === "skipConfirm") {
    await rest("agent_settings", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ id: `pref:${userId}:skipConfirm`, enabled: Boolean(value), reason: null, updated_at: new Date().toISOString(), updated_by_email: email ?? null }]) });
  } else if (key === "replyMode") {
    const v = value == null || value === "" ? "auto" : String(value);
    if (!REPLY_MODES.includes(v)) throw new Error("Reply mode must be auto, spoken or text.");
    await rest("agent_settings", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ id: `pref:${userId}:replyMode`, enabled: v !== "auto", reason: v, updated_at: new Date().toISOString(), updated_by_email: email ?? null }]) });
  } else throw new Error("Unknown preference.");
  return userPrefs(userId);
}

/** Admin: lock "skip confirmation" off for everyone, or for listed users. */
export async function setSkipConfirmLock({ all, userIds }, admin) {
  await rest("agent_settings", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ id: "lock:skipConfirm", enabled: Boolean(all), reason: JSON.stringify(Array.isArray(userIds) ? userIds.map(String) : []), updated_at: new Date().toISOString(), updated_by_email: admin?.email ?? null }]) });
}

/** USD for one turn, from the pricing table (per million tokens). */
export function costUsd({ modelId, inputTokens = 0, outputTokens = 0, cacheReadTokens = 0 }) {
  const pricing = loadModelConfig().pricing ?? {};
  const key = Object.keys(pricing).find((p) => p !== "_comment" && p !== "default" && String(modelId ?? "").includes(p));
  const rate = pricing[key] ?? pricing.default ?? { input: 3, output: 15, cacheRead: 0.3 };
  return Math.round(((inputTokens * rate.input + outputTokens * rate.output + cacheReadTokens * (rate.cacheRead ?? rate.input * 0.1)) / 1e6) * 1e6) / 1e6;
}
