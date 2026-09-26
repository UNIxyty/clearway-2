// Server side of the Clearway Ops Agent Chrome extension (extension/PROTOCOL.md,
// docs/agent-design-spec-extension.md). The extension is a SECOND FRONT END for
// the same agent: same account, same permissions, same conversations. Nothing
// here grants anything the console would not; every write is audited.
//
// Storage: no DDL is available (Supabase is REST-only with the service key), so
// the site list and site requests live in the existing `agent_settings`
// key/value rows, the way routing.mjs keeps `pref:<userId>:tier`:
//
//   extsite:<host>   enabled=true   reason = JSON {host, includeSubdomains, approvedBy, approvedAt, note}
//   extreq:<id>      enabled=pending reason = JSON {id, host, includeSubdomains, reason, status,
//                                                  requestedBy, requestedByName, requestedAt,
//                                                  decidedBy, decidedAt, note}
//
// Listing is by id prefix (`id=like.extsite:*`, colon URL-encoded).

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { audit } from "./store.mjs";
import { executeTool, toolNamesFor } from "./tools/index.mjs";
import { fetchRecords } from "./tools/flights.mjs";
import { wallGet } from "./tools/http.mjs";
import { listPendingFor } from "./confirm.mjs";
import { BadRequest, Forbidden } from "./errors.mjs";

// ── Supabase REST (same pattern as store.mjs) ────────────────────────────────
const REST_TIMEOUT_MS = 10_000;
const supabaseUrl = () => String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const serviceKey = () => String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
async function rest(pathAndQuery, { method = "GET", body = null, prefer = null } = {}) {
  if (!supabaseUrl() || !serviceKey()) throw new Error("Supabase is not configured for the agent service.");
  const headers = { apikey: serviceKey(), Authorization: `Bearer ${serviceKey()}`, "Content-Type": "application/json" };
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(`${supabaseUrl()}/rest/v1/${pathAndQuery}`, {
    method, headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(REST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Supabase ${method} ${pathAndQuery} -> ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
const SITE_PREFIX = "extsite:";
const REQ_PREFIX = "extreq:";
const rowId = (prefix, key) => `${prefix}${key}`;
const eqId = (id) => `id=eq.${encodeURIComponent(id)}`;
const likePrefix = (prefix) => `id=like.${encodeURIComponent(prefix)}*`;
const SELECT = "select=id,enabled,reason,updated_at,updated_by_email";
async function upsert(row) {
  await rest("agent_settings", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: [row] });
}
const parseReason = (row) => { try { return row?.reason ? JSON.parse(row.reason) : null; } catch { return null; } };

// ── Who may approve ──────────────────────────────────────────────────────────
export const isPrivileged = (user) => user?.agentRole === "admin" || user?.agentRole === "developer";
function assertAdmin(user) {
  if (!isPrivileged(user)) throw Forbidden("Approving sites needs an admin.");
}

// ── Validation ───────────────────────────────────────────────────────────────
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
/** A bare lowercase hostname: no scheme, path, port or wildcard; ≤ 253 chars. */
export function normaliseHost(raw) {
  const host = String(raw ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!host) throw BadRequest("A site host is required.");
  if (host.length > 253) throw BadRequest("The host is too long (253 characters at most).");
  if (/[\s/:@?#*]/.test(host)) throw BadRequest("Give the host only — no scheme, path, port or wildcard (for example handling-baltic.lv).");
  if (!host.split(".").every((label) => HOST_LABEL.test(label))) throw BadRequest(`"${host}" is not a valid hostname.`);
  return host;
}
function normaliseReason(raw) {
  const reason = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (reason.length < 10) throw BadRequest("Say why in at least 10 characters.");
  if (reason.length > 200) throw BadRequest("Keep the reason to 200 characters.");
  return reason;
}
const noteOf = (raw) => { const n = String(raw ?? "").trim(); return n ? n.slice(0, 400) : null; };

// ── Sites ────────────────────────────────────────────────────────────────────
function siteView(row) {
  const r = parseReason(row) ?? {};
  const host = r.host ?? String(row.id).slice(SITE_PREFIX.length);
  return { host, includeSubdomains: r.includeSubdomains === true, approvedBy: r.approvedBy ?? row.updated_by_email ?? null, approvedAt: r.approvedAt ?? row.updated_at ?? null, note: r.note ?? null };
}
export async function listSites() {
  const rows = (await rest(`agent_settings?${likePrefix(SITE_PREFIX)}&enabled=eq.true&${SELECT}&order=id.asc&limit=1000`)) ?? [];
  return rows.map(siteView).sort((a, b) => a.host.localeCompare(b.host));
}
async function getSite(host) {
  const rows = await rest(`agent_settings?${eqId(rowId(SITE_PREFIX, host))}&enabled=eq.true&${SELECT}&limit=1`);
  return rows?.[0] ? siteView(rows[0]) : null;
}
async function writeSite({ host, includeSubdomains, admin, note }) {
  const site = { host, includeSubdomains: Boolean(includeSubdomains), approvedBy: admin.email ?? null, approvedAt: new Date().toISOString(), note: note ?? null };
  await upsert({ id: rowId(SITE_PREFIX, host), enabled: true, reason: JSON.stringify(site), updated_at: site.approvedAt, updated_by_email: admin.email ?? null });
  return site;
}

// ── Requests ─────────────────────────────────────────────────────────────────
function requestView(row) {
  const r = parseReason(row) ?? {};
  return {
    id: r.id ?? String(row.id).slice(REQ_PREFIX.length), host: r.host ?? null, includeSubdomains: r.includeSubdomains === true, reason: r.reason ?? null,
    status: r.status ?? (row.enabled ? "pending" : "declined"), requestedBy: r.requestedBy ?? null, requestedByName: r.requestedByName ?? null,
    requestedAt: r.requestedAt ?? row.updated_at ?? null, decidedBy: r.decidedBy ?? null, decidedAt: r.decidedAt ?? null, note: r.note ?? null,
  };
}
async function allRequests() {
  const rows = (await rest(`agent_settings?${likePrefix(REQ_PREFIX)}&${SELECT}&order=updated_at.desc&limit=1000`)) ?? [];
  return rows.map(requestView).filter((r) => r.host).sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)));
}
/** All requests for an admin; only the caller's own when `userEmail` is given. */
export async function listRequests({ userEmail = null } = {}) {
  const all = await allRequests();
  return userEmail ? all.filter((r) => String(r.requestedBy ?? "").toLowerCase() === String(userEmail).toLowerCase()) : all;
}
async function writeRequest(request, actorEmail) {
  await upsert({ id: rowId(REQ_PREFIX, request.id), enabled: request.status === "pending", reason: JSON.stringify(request), updated_at: new Date().toISOString(), updated_by_email: actorEmail ?? null });
  return request;
}

export async function requestSite({ user, host: rawHost, includeSubdomains, reason: rawReason }) {
  const host = normaliseHost(rawHost);
  const reason = normaliseReason(rawReason);
  const site = await getSite(host);
  if (site) {
    // Already on the list: no request to make. Said as such so the panel can move straight to "Enable on this site".
    return { request: { id: null, host, includeSubdomains: site.includeSubdomains, reason: null, status: "approved", requestedBy: user.email ?? null, requestedByName: user.name ?? null, requestedAt: null, decidedBy: site.approvedBy, decidedAt: site.approvedAt, note: null }, site, alreadyApproved: true, existing: false };
  }
  const mine = await listRequests({ userEmail: user.email });
  const pending = mine.find((r) => r.host === host && r.status === "pending");
  if (pending) return { request: pending, site: null, alreadyApproved: false, existing: true };
  const request = {
    id: randomUUID(), host, includeSubdomains: Boolean(includeSubdomains), reason, status: "pending",
    requestedBy: user.email ?? null, requestedByName: user.name ?? null, requestedAt: new Date().toISOString(),
    decidedBy: null, decidedAt: null, note: null,
  };
  await writeRequest(request, user.email);
  await audit({ kind: "extension.site_requested", userId: user.userId, userEmail: user.email, actorId: user.userId, actorEmail: user.email, success: true, confirmationStatus: "not_required", detail: { host, id: request.id, includeSubdomains: request.includeSubdomains, reason } });
  return { request, site: null, alreadyApproved: false, existing: false };
}

/** Mark every pending request for `host` approved (an approval covers everyone who asked for that site). */
async function approvePendingFor(host, admin, note) {
  const now = new Date().toISOString();
  const approved = [];
  for (const r of await allRequests()) {
    if (r.host !== host || r.status !== "pending") continue;
    const next = { ...r, status: "approved", decidedBy: admin.email ?? null, decidedAt: now, note: note ?? r.note ?? null };
    await writeRequest(next, admin.email);
    approved.push(next);
  }
  return approved;
}

export async function decideRequest({ admin, id, decision, note: rawNote }) {
  assertAdmin(admin);
  const reqId = String(id ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(reqId)) throw BadRequest("A request id is required.");
  if (decision !== "approve" && decision !== "decline") throw BadRequest('decision must be "approve" or "decline".');
  const note = noteOf(rawNote);
  const rows = await rest(`agent_settings?${eqId(rowId(REQ_PREFIX, reqId))}&${SELECT}&limit=1`);
  if (!rows?.[0]) throw BadRequest("No such site request.");
  const request = requestView(rows[0]);
  if (request.status !== "pending") throw BadRequest(`This request was already ${request.status}.`);
  let result;
  if (decision === "approve") {
    await writeSite({ host: request.host, includeSubdomains: request.includeSubdomains, admin, note });
    const approved = await approvePendingFor(request.host, admin, note);
    result = approved.find((r) => r.id === request.id) ?? { ...request, status: "approved", decidedBy: admin.email ?? null, decidedAt: new Date().toISOString(), note };
  } else {
    result = { ...request, status: "declined", decidedBy: admin.email ?? null, decidedAt: new Date().toISOString(), note };
    await writeRequest(result, admin.email);
  }
  await audit({ kind: "extension.site_decided", userId: admin.userId, userEmail: admin.email, actorId: admin.userId, actorEmail: admin.email, success: true, confirmationStatus: "confirmed", detail: { host: request.host, id: request.id, decision, note, includeSubdomains: request.includeSubdomains, requestedBy: request.requestedBy } });
  return result;
}

export async function revokeSite({ admin, host: rawHost }) {
  assertAdmin(admin);
  const host = normaliseHost(rawHost);
  const site = await getSite(host);
  if (!site) throw BadRequest(`${host} is not on the list.`);
  await rest(`agent_settings?${eqId(rowId(SITE_PREFIX, host))}`, { method: "DELETE", prefer: "return=minimal" });
  await audit({ kind: "extension.site_revoked", userId: admin.userId, userEmail: admin.email, actorId: admin.userId, actorEmail: admin.email, success: true, confirmationStatus: "confirmed", detail: { host, includeSubdomains: site.includeSubdomains, approvedBy: site.approvedBy } });
  return { host };
}

export async function addSite({ admin, host: rawHost, includeSubdomains }) {
  assertAdmin(admin);
  const host = normaliseHost(rawHost);
  const site = await writeSite({ host, includeSubdomains, admin, note: null });
  // Anyone who had asked for this site is answered by the addition.
  const approved = await approvePendingFor(host, admin, "Added by an admin.");
  await audit({ kind: "extension.site_added", userId: admin.userId, userEmail: admin.email, actorId: admin.userId, actorEmail: admin.email, success: true, confirmationStatus: "confirmed", detail: { host, includeSubdomains: site.includeSubdomains, requestsApproved: approved.length } });
  return site;
}

// ── Admins (the "Goes to" line on the request card) ──────────────────────────
export async function admins() {
  const out = new Map();
  const add = (name, email) => { const key = (email ?? name ?? "").toLowerCase(); if (!key || out.has(key)) return; out.set(key, { name: name ?? (email ? email.split("@")[0] : "Admin"), email: email ?? null }); };
  // user_preferences has no email column today; ask for it anyway (it may
  // gain one), fall back to names only, and to nothing on any error.
  const filter = "or=(is_admin.eq.true,is_developer.eq.true)";
  let rows = null;
  try { rows = await rest(`user_preferences?${filter}&select=user_id,display_name,email&limit=50`); }
  catch { try { rows = await rest(`user_preferences?${filter}&select=user_id,display_name&limit=50`); } catch { rows = null; } }
  for (const r of rows ?? []) { const name = String(r?.display_name ?? "").trim(); const email = r?.email ? String(r.email).trim().toLowerCase() : null; if (name || email) add(name || null, email); }
  for (const email of String(process.env.ADMIN_EMAILS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)) add(email.split("@")[0], email);
  return [...out.values()];
}

// ── Quick actions (§E7): URL-only rules, filtered to the caller's tools ──────
let quickActionConfig = null;
function loadQuickActions() {
  if (!quickActionConfig) quickActionConfig = JSON.parse(readFileSync(new URL("../config/quick-actions.json", import.meta.url), "utf8"));
  return quickActionConfig;
}
export function quickActions(user) {
  const tools = new Set(toolNamesFor(user));
  const rules = (loadQuickActions().rules ?? []).map((rule) => ({
    id: rule.id, pattern: rule.pattern, flags: rule.flags ?? "", entity: rule.entity,
    actions: (rule.actions ?? []).filter((a) => (a.requires ?? []).every((t) => tools.has(t))).map(({ requires, ...a }) => a),
  })).filter((rule) => rule.actions.length > 0);
  return { rules };
}

// ── Entity resolution: a Leon flight id from the address → the wall's record ─
export async function resolveEntity({ user, kind, id }) {
  const startedAt = Date.now();
  const nid = String(id ?? "").trim();
  const record = async (result, ok, error = null) => audit({
    kind: "tool.call", userId: user.userId, userEmail: user.email, toolName: "extension.resolve", toolArgs: { kind, id: nid },
    toolResult: result, confirmationStatus: "not_required", success: ok, error, latencyMs: Date.now() - startedAt, detail: { permission: "user", role: user.agentRole },
  });
  if (kind !== "leon-flight") { const r = { ok: false, reason: "unknown_kind" }; await record(r, false, "unknown_kind"); return r; }
  if (!/^\d{1,12}$/.test(nid)) { const r = { ok: false, reason: "not_found" }; await record(r, false, "bad_id"); return r; }
  let flights = [];
  try {
    // The wall's normalised feed keys flights "<oprId>:<flightNid>" and accepts a bare nid; no window → every cached flight.
    ({ flights } = await fetchRecords(user, { key: nid, limit: 5 }));
  } catch (error) {
    const r = { ok: false, reason: "unavailable" };
    await record(r, false, String(error?.message ?? error).slice(0, 200));
    return r;
  }
  const hit = flights.find((f) => String(f.flightNid ?? "") === nid) ?? flights[0] ?? null;
  if (!hit) { const r = { ok: false, reason: "not_found" }; await record(r, false, "not_found"); return r; }
  const f = hit.flight ?? {};
  const flight = {
    callsign: f.flightNo && f.flightNo !== "UNKNOWN" ? String(f.flightNo) : null,
    date: typeof f.startTimeUTC === "string" ? f.startTimeUTC.slice(0, 10) : null,
    adep: f.adep?.icao ?? null, ades: f.ades?.icao ?? null, key: hit.key ?? null,
  };
  const r = { ok: true, flight };
  await record(r, true);
  return r;
}

// ── Omnibox lookup (§E11) ────────────────────────────────────────────────────
const LOOKUP_TIMEOUT_MS = 6_000;
const withTimeout = (promise) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("lookup timeout")), LOOKUP_TIMEOUT_MS).unref?.())]);
const hhmmZ = (iso) => { const d = new Date(iso ?? ""); return Number.isNaN(d.getTime()) ? null : `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}Z`; };
export const consoleOrigin = () => String(process.env.NEXT_PUBLIC_SITE_URL || process.env.PORTAL_SITE_URL || "").trim().replace(/\/+$/, "");

export function parseLookup(q) {
  const text = String(q ?? "").trim().replace(/\s+/g, " ");
  const parts = text.split(" ");
  const [first = "", second = ""] = parts;
  // An ICAO lookup is `<ICAO>` or `<ICAO> <aip|notam|metar>`; a sentence that happens to start with a
  // four-letter word ("what is…") is a question for the panel, not an airport.
  if (/^[A-Za-z]{4}$/.test(first) && parts.length <= 2 && (!second || /^(aip|notam|notams|metar|wx|weather)$/i.test(second))) {
    const mode = /^(aip|notam|notams|metar|wx|weather)$/i.test(second) ? second.toLowerCase().replace(/^notams$/, "notam").replace(/^(wx|weather)$/, "metar") : null;
    return { text, icao: first.toUpperCase(), mode, callsign: null };
  }
  if (/^(?:[A-Za-z]{2,3}\d{1,4}[A-Za-z]?|[A-Za-z]+\d+)$/.test(first) && first.length >= 4 && !second) return { text, icao: null, mode: null, callsign: first.toUpperCase() };
  return { text, icao: null, mode: null, callsign: null };
}

export async function lookup({ user, q }) {
  const parsed = parseLookup(q);
  const origin = consoleOrigin();
  const ask = { url: null, text: `Ask Clearway: “${parsed.text}”`, dim: "opens the panel", ask: parsed.text };
  if (!parsed.text) return { suggestions: [ask] };
  const run = (name, input) => withTimeout(executeTool({ name, input, user, conversationId: "omnibox", origin: "ui" }));
  const jobs = [];
  if (parsed.icao) {
    const icao = parsed.icao;
    if (!parsed.mode || parsed.mode === "aip") jobs.push(run("get_aip_document", { icao }).then((r) => {
      if (r?.ok === false || !r?.documentPath) return null;
      const path = String(r.documentPath);
      const filename = decodeURIComponent(path.split("?")[0].split("/").pop() || `${icao}.pdf`);
      const rev = r.revision?.revision ?? null;
      return { url: `${origin}/agent/doc?source=aip&id=${encodeURIComponent(path)}&filename=${encodeURIComponent(filename)}`, text: `${icao} AIP AD 2 · ${filename}`, dim: `${rev ? (/^AIRAC/i.test(String(rev)) ? String(rev) : `AIRAC ${rev}`) : r.revision?.label ?? "revision unknown"} · AIP Portal` };
    }).catch(() => null));
    if (!parsed.mode || parsed.mode === "notam") jobs.push(run("get_notams", { icao, limit: 200 }).then((r) => {
      if (r?.ok === false || typeof r?.count !== "number") return null;
      const fresh = typeof r.newCount === "number" ? ` · ${r.newCount} new` : "";
      return { url: `${origin}/digital-wall/console/notam-check`, text: `${icao} NOTAM · ${r.count} active${fresh}`, dim: "NOTAM Check" };
    }).catch(() => null));
    if (!parsed.mode || parsed.mode === "metar") jobs.push(run("get_weather", { icao }).then((r) => {
      if (r?.ok === false) return null;
      const raw = String(r?.metar ?? r?.weather ?? "").split("\n").find((l) => /\d{6}Z/.test(l)) ?? String(r?.metar ?? r?.weather ?? "");
      const body = raw.replace(/^\s*METAR\s+/i, "").replace(new RegExp(`^\\s*${icao}\\s+`, "i"), "").trim();
      if (!body) return null;
      // The portal's weather comes from the CrewBriefing OPMET scraper, not aviationweather.gov.
      return { url: `${origin}/aip/${icao}`, text: `${icao} METAR ${body}`, dim: r?.source ? String(r.source) : "CrewBriefing · METAR/TAF" };
    }).catch(() => null));
  } else if (parsed.callsign) {
    const callsign = parsed.callsign;
    jobs.push(run("find_flight", { callsign, limit: 5 }).then((r) => {
      if (r?.ok === false || !Array.isArray(r?.flights) || !r.flights.length) return null;
      const hit = r.flights.find((f) => f.key === r.current) ?? r.flights[0];
      const f = hit.flight ?? {};
      const etd = hhmmZ(f.etd ?? f.startTimeUTC);
      return { url: `${origin}/digital-wall/console/flights`, text: `${f.flightNo ?? callsign} ${f.adep?.icao ?? "?"} → ${f.ades?.icao ?? "?"}${etd ? ` · ETD ${etd}` : ""}`, dim: "Flights" };
    }).catch(() => null));
  }
  const rows = (await Promise.all(jobs)).filter(Boolean).slice(0, 4);
  return { suggestions: [...rows, ask] };
}

// ── Insert into page (§E9): local, never a server action, still logged ───────
const INSERT_RESULTS = new Set(["inserted", "undone", "cancelled"]);
export async function insertLog({ user, host: rawHost, field, characters, result, verbatim, conversationId }) {
  const host = normaliseHost(rawHost);
  if (!INSERT_RESULTS.has(result)) throw BadRequest('result must be "inserted", "undone" or "cancelled".');
  const chars = Math.max(0, Math.round(Number(characters) || 0));
  const fieldLabel = String(field ?? "").trim().slice(0, 200) || null;
  const verbatimRef = verbatim == null ? null : String(verbatim).trim().slice(0, 200) || null;
  const convId = conversationId && /^[0-9a-f-]{36}$/i.test(String(conversationId)) ? String(conversationId) : null;
  await audit({
    kind: "tool.call", userId: user.userId, userEmail: user.email, conversationId: convId, toolName: "page.insert",
    toolArgs: { host, field: fieldLabel, characters: chars, verbatim: verbatimRef }, toolResult: { result }, success: true, confirmationStatus: "confirmed",
    detail: { client: { kind: "extension", host }, local: true },
  });
  return { host, field: fieldLabel, characters: chars, result };
}

// ── Badge (§E10) ─────────────────────────────────────────────────────────────
export async function badge({ user }) {
  const confirmations = listPendingFor(user).map((c) => ({ token: c.token, what: c.summary ?? c.targetLabel ?? c.toolName, expiresAt: c.expiresAt, conversationId: c.conversationId ?? null, toolName: c.toolName }));
  let notamReview = 0;
  try {
    // The same call get_notam_check_status makes; the wall being down means "nothing to review", not an error.
    const data = await wallGet("/api/notam-check/today", user, { timeoutMs: 8_000 });
    if (typeof data?.outstandingCount === "number") notamReview = data.outstandingCount;
    else {
      const airports = Array.isArray(data?.airports) ? data.airports : Object.entries(data?.status ?? {}).map(([icao, v]) => ({ icao, ...(v ?? {}) }));
      notamReview = airports.filter((a) => !(a.checked ?? a.acked ?? a.at)).length;
    }
  } catch { notamReview = 0; }
  // No job registry exists yet (generated files are not tracked as long jobs), so this stays empty.
  return { confirmations, notamReview, jobs: [] };
}
