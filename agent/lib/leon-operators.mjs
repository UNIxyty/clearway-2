// Leon, per OPERATOR — the credentials the operators gave us, held in the `leon_operators` table (the same registry
// the wall syncs from and the console's Operators page edits). Nothing here is per user: anyone signed in to the
// Clearway portal with agent access may use it; that gate is the agent's own (authenticateRequest +
// assertMayUseAgent), unchanged.
//
// The operator list is read from the database at run time (cached 30 s), never from code or an environment
// variable, so adding, disabling or re-keying an operator is a configuration change: no code edit, no redeploy.
// Every operator is handled on its own: a token that cannot be decrypted, refreshed or used marks THAT operator
// unavailable and every other operator keeps working.
//
// Refresh tokens are AES-256-GCM encrypted in the table with LEON_REFRESH_TOKEN_ENCRYPTION_KEY (the wall's format,
// operators-store.mjs). They are decrypted in memory only, never logged, returned or audited.
import crypto from "node:crypto";

const LIST_TTL_MS = 30_000;
const ACCESS_TTL_MS = 25 * 60 * 1000; // Leon access tokens live 30 min
const ENCRYPTED_PREFIX = "enc:v1:";

export class OperatorUnavailable extends Error {
  constructor(oprId, name, reason) { super(`${name || oprId}: ${reason}`); this.oprId = oprId; this.operatorName = name || oprId; this.reason = reason; this.code = "operator-unavailable"; }
}

const supabaseUrl = () => String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const serviceKey = () => String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

function decrypt(value) {
  if (!value || typeof value !== "string") throw new Error("no refresh token stored");
  if (!value.startsWith(ENCRYPTED_PREFIX)) return value; // older plaintext rows (the wall reads them the same way)
  const secret = String(process.env.LEON_REFRESH_TOKEN_ENCRYPTION_KEY || process.env.LEON_TOKEN_ENCRYPTION_KEY || "").trim();
  if (!secret) throw new Error("LEON_REFRESH_TOKEN_ENCRYPTION_KEY is not set on the agent service");
  const [iv, tag, body] = value.slice(ENCRYPTED_PREFIX.length).split(":");
  if (!iv || !tag || !body) throw new Error("stored refresh token is malformed");
  const decipher = crypto.createDecipheriv("aes-256-gcm", crypto.createHash("sha256").update(secret).digest(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
}

let listCache = { at: 0, operators: null };

/**
 * Active operators from leon_operators: [{ oprId, name, token | null, problem | null, lastSync }]. A row whose token
 * cannot be decrypted is returned WITH a problem (and no token) instead of failing the list.
 */
export async function listOperators({ fresh = false } = {}) {
  if (!fresh && listCache.operators && Date.now() - listCache.at < LIST_TTL_MS) return listCache.operators;
  if (!supabaseUrl() || !serviceKey()) throw new Error("The operator registry (Supabase) is not configured on the agent service.");
  const r = await fetch(`${supabaseUrl()}/rest/v1/leon_operators?select=opr_id,name,refresh_token,is_active,last_sync_status,last_sync_at&is_active=eq.true&order=opr_id.asc`, {
    headers: { apikey: serviceKey(), Authorization: `Bearer ${serviceKey()}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`The operator registry could not be read (HTTP ${r.status}).`);
  const rows = await r.json();
  const operators = rows.map((row) => {
    let token = null; let problem = null;
    try { token = decrypt(row.refresh_token); } catch (error) { problem = `its stored Leon credentials cannot be read (${error.message})`; }
    return { oprId: String(row.opr_id), name: String(row.name || row.opr_id), token, problem, lastSync: { status: row.last_sync_status ?? null, at: row.last_sync_at ?? null } };
  });
  listCache = { at: Date.now(), operators };
  return operators;
}

// LEON_OPERATOR_API_BASE is set ONLY by the rig (a mock Leon; "{opr}" is replaced by the operator id). Production
// leaves it unset and talks to https://<opr>.leon.aero exactly as the wall does.
function base(oprId) {
  const rig = String(process.env.LEON_OPERATOR_API_BASE || "").trim();
  if (rig) return rig.replace("{opr}", oprId).replace(/\/+$/, "");
  return `https://${oprId}.${process.env.LEON_SANDBOX === "true" ? "sandbox.leon.aero" : "leon.aero"}`;
}

const access = new Map(); // oprId → { token, until, refreshFp }
const fingerprint = (t) => crypto.createHash("sha256").update(t).digest("hex").slice(0, 16);

async function accessToken(op) {
  if (!op.token) throw new OperatorUnavailable(op.oprId, op.name, op.problem ?? "no Leon credentials stored");
  const fp = fingerprint(op.token);
  const hit = access.get(op.oprId);
  if (hit && hit.refreshFp === fp && Date.now() < hit.until) return hit.token;
  const form = new URLSearchParams(); form.set("refresh_token", op.token);
  let r;
  try {
    r = await fetch(`${base(op.oprId)}/access_token/refresh/`, { method: "POST", body: form, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new OperatorUnavailable(op.oprId, op.name, "Leon did not answer");
  }
  if (!r.ok) throw new OperatorUnavailable(op.oprId, op.name, r.status === 401 || r.status === 403 || r.status === 400 ? "Leon refused its credentials (expired or revoked key)" : `Leon answered HTTP ${r.status}`);
  const token = (await r.text()).trim();
  if (!token) throw new OperatorUnavailable(op.oprId, op.name, "Leon returned no access token");
  access.set(op.oprId, { token, until: Date.now() + ACCESS_TTL_MS, refreshFp: fp });
  return token;
}

/**
 * A READ-ONLY GraphQL caller for one operator: { oprId, name, graphql(query) → { data, errors, httpStatus } }.
 * Throws OperatorUnavailable for an operator that is not configured or whose credentials fail.
 */
export async function leonForOperator(oprId) {
  const id = String(oprId ?? "").trim().toLowerCase();
  const op = (await listOperators()).find((o) => o.oprId === id) ?? (await listOperators({ fresh: true })).find((o) => o.oprId === id);
  if (!op) throw new OperatorUnavailable(id, id, "is not a configured operator");
  const graphql = async (query) => {
    if (/^\s*mutation\b/i.test(query)) throw new Error("The manifest's Leon access is read-only.");
    const token = await accessToken(op);
    const r = await fetch(`${base(op.oprId)}/api/graphql/`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ query }), signal: AbortSignal.timeout(30_000),
    }).catch(() => { throw new OperatorUnavailable(op.oprId, op.name, "Leon did not answer"); });
    if (r.status === 401 || r.status === 403) { access.delete(op.oprId); throw new OperatorUnavailable(op.oprId, op.name, "Leon refused its credentials (expired or revoked key)"); }
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { data: json?.data ?? null, errors: json?.errors ?? (json ? null : [{ message: `HTTP ${r.status}` }]), httpStatus: r.status };
  };
  return { oprId: op.oprId, name: op.name, graphql };
}

// ── Flight search across every operator ────────────────────────────────────────────────────────────────────────
const VALID_STATUS = new Set(["CONFIRMED", "OPTION", "OPPORTUNITY"]);
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
const SEARCH_QUERY = (from, to) => `query {
  flightList(filter: { isCnl: false, timeInterval: { start: "${from}", end: "${to}" } }) {
    flightNid flightNo status startTimeUTC iconType isActive isSimulator flightType
    startAirport { code { icao } name city } endAirport { code { icao } name city }
    acft { registration }
  }
}`;

/**
 * Every configured operator's flights in [fromMs, toMs], read live from Leon in parallel, each operator isolated.
 * Returns { flights: [record…], operators: [{ oprId, name, available, problem, count }] }. Records use the wall's
 * key format "<oprId>:<flightNid>" and carry the operator's configured name.
 */
export async function searchFlightsAllOperators({ fromMs, toMs, timeoutMs = 20_000 }) {
  const ops = await listOperators();
  // Leon's timeInterval end day is exclusive (proven live by the wall's sync): ask one day past the window.
  const from = ymd(fromMs), to = ymd(toMs + 86_400_000);
  const settled = await Promise.allSettled(ops.map(async (op) => {
    const leon = await leonForOperator(op.oprId);
    const res = await Promise.race([
      leon.graphql(SEARCH_QUERY(from, to)),
      new Promise((_, reject) => setTimeout(() => reject(new OperatorUnavailable(op.oprId, op.name, "Leon did not answer in time")), timeoutMs)),
    ]);
    if (res.errors?.length || !Array.isArray(res.data?.flightList)) throw new OperatorUnavailable(op.oprId, op.name, `Leon returned an error (${String(res.errors?.[0]?.message ?? "no flight list").slice(0, 80)})`);
    return res.data.flightList
      .filter((f) => VALID_STATUS.has(String(f.status ?? "").toUpperCase()))
      .filter((f) => f.isActive !== false && f.isSimulator !== true && String(f.iconType ?? "").toLowerCase() !== "positioning" && String(f.iconType ?? "").toLowerCase() !== "simulator" && String(f.flightType ?? "").toUpperCase() !== "SIMULATOR")
      .filter((f) => { const t = Date.parse(f.startTimeUTC ?? ""); return Number.isFinite(t) && t >= fromMs && t <= toMs; })
      .map((f) => ({
        key: `${op.oprId}:${f.flightNid}`, oprId: op.oprId, flightNid: String(f.flightNid), operatorName: op.name, registration: f.acft?.registration ?? null,
        flight: { flightNo: f.flightNo ?? null, startTimeUTC: f.startTimeUTC, isCnl: false,
          adep: { icao: f.startAirport?.code?.icao ?? null, name: f.startAirport?.name ?? null, city: f.startAirport?.city ?? null },
          ades: { icao: f.endAirport?.code?.icao ?? null, name: f.endAirport?.name ?? null, city: f.endAirport?.city ?? null } },
      }));
  }));
  const flights = [];
  const operators = ops.map((op, i) => {
    const s = settled[i];
    if (s.status === "fulfilled") { flights.push(...s.value); return { oprId: op.oprId, name: op.name, available: true, problem: null, count: s.value.length }; }
    const reason = s.reason instanceof OperatorUnavailable ? s.reason.reason : "could not be searched";
    return { oprId: op.oprId, name: op.name, available: false, problem: reason, count: 0 };
  });
  flights.sort((a, b) => Date.parse(a.flight.startTimeUTC) - Date.parse(b.flight.startTimeUTC));
  return { flights, operators };
}
