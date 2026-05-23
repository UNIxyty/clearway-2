import fs from "node:fs/promises";
import path from "node:path";

const LOCAL_VISIBILITY_FILE = path.resolve(process.cwd(), "data", "aircraft-visibility.json");

function supabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let supabaseUsable = null;

async function canUseSupabase() {
  if (!supabaseConfigured()) return false;
  if (supabaseUsable !== null) return supabaseUsable;
  try {
    await supabaseFetch("leon_operators?select=id&limit=1");
    supabaseUsable = true;
  } catch {
    supabaseUsable = false;
  }
  return supabaseUsable;
}

function supabaseHeaders(prefer = "return=representation") {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: prefer,
  };
}

async function supabaseFetch(tablePath, init = {}) {
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${tablePath}`;
  const response = await fetch(base, {
    ...init,
    headers: {
      ...supabaseHeaders(init.method === "PATCH" ? "return=representation" : "return=representation"),
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${body.slice(0, 400)}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function readLocalJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeLocalJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf-8");
}

function sanitizeOperator(row) {
  return {
    id: row.id,
    oprId: row.opr_id ?? row.oprId,
    name: row.name ?? "",
    isActive: row.is_active ?? row.isActive ?? true,
    hasRefreshToken: Boolean(row.refresh_token ?? row.refreshToken),
    lastSyncAt: row.last_sync_at ?? row.lastSyncAt ?? null,
    lastSyncStatus: row.last_sync_status ?? row.lastSyncStatus ?? "idle",
    lastSyncError: row.last_sync_error ?? row.lastSyncError ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
}

function chunkArray(items, size = 200) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function inFilterList(values) {
  return values.map((value) => `"${String(value).replaceAll('"', '\\"')}"`).join(",");
}

export class OperatorsStore {
  async listOperators({ includeInactive = false } = {}) {
    if (!(await canUseSupabase())) {
      throw new Error("Supabase is required for operators storage.");
    }
    const filter = includeInactive ? "" : "&is_active=eq.true";
    const rows =
      (await supabaseFetch(`leon_operators?select=*&order=opr_id.asc${filter}`)) || [];
    return rows.map(sanitizeOperator);
  }

  async getOperatorCredentials() {
    if (!(await canUseSupabase())) {
      throw new Error("Supabase is required for operators storage.");
    }
    const rows =
      (await supabaseFetch(
        "leon_operators?select=id,opr_id,name,refresh_token,is_active&is_active=eq.true&order=opr_id.asc"
      )) || [];
    return rows
      .filter((row) => row.refresh_token)
      .map((row) => ({
        id: row.id,
        oprId: row.opr_id,
        name: row.name ?? row.opr_id,
        refreshToken: row.refresh_token,
      }));
  }

  async upsertOperator({ name, oprId, refreshToken, isActive = true }) {
    const normalizedOprId = String(oprId || "").trim();
    if (!normalizedOprId) {
      throw new Error("Leon prefix (oprId) is required.");
    }
    if (!String(refreshToken || "").trim()) {
      throw new Error("Leon API refresh token is required.");
    }

    if (!(await canUseSupabase())) {
      throw new Error("Supabase is required for operators storage.");
    }
    const payload = {
      opr_id: normalizedOprId,
      name: String(name || normalizedOprId).trim(),
      refresh_token: String(refreshToken).trim(),
      is_active: isActive,
      updated_at: new Date().toISOString(),
    };
    const rows = await supabaseFetch("leon_operators?on_conflict=opr_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(payload),
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    return sanitizeOperator(row);
  }

  async setOperatorActive(id, isActive) {
    if (!(await canUseSupabase())) {
      throw new Error("Supabase is required for operators storage.");
    }
    const rows = await supabaseFetch(`leon_operators?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: isActive, updated_at: new Date().toISOString() }),
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    return sanitizeOperator(row);
  }

  async getOperatorByOprId(oprId) {
    if (!(await canUseSupabase())) return null;
    const rows =
      (await supabaseFetch(
        `leon_operators?select=id,opr_id,name&opr_id=eq.${encodeURIComponent(oprId)}&limit=1`
      )) || [];
    return Array.isArray(rows) ? rows[0] ?? null : null;
  }

  async loadCachedFlights({ oprId, fromIso, toIso }) {
    if (!(await canUseSupabase())) return [];
    const operator = await this.getOperatorByOprId(oprId);
    if (!operator?.id) return [];

    const params = new URLSearchParams();
    params.set("select", "raw_payload,aircraft_registration");
    params.set("operator_id", `eq.${operator.id}`);
    params.set("is_deleted", "eq.false");
    if (fromIso) {
      params.set("estimated_arrival", `gte.${fromIso}`);
    }
    if (toIso) {
      params.set("estimated_departure", `lt.${toIso}`);
    }
    params.set("order", "estimated_departure.asc");
    const rows = (await supabaseFetch(`leon_flights?${params.toString()}`)) || [];
    return rows.map((row) => ({
      flight: row.raw_payload ?? null,
      registration: row.aircraft_registration ?? "UNKNOWN",
    }));
  }

  async upsertFlightsCache({ oprId, flights }) {
    if (!(await canUseSupabase())) return { cached: 0, updated: 0, skipped: 0 };
    if (!Array.isArray(flights) || flights.length === 0) {
      return { cached: 0, updated: 0, skipped: 0 };
    }

    const operator = await this.getOperatorByOprId(oprId);
    if (!operator?.id) {
      throw new Error(`Operator ${oprId} not found in Supabase.`);
    }

    const byNid = new Map();
    for (const flight of flights) {
      const nid = String(flight.flightNid ?? "").trim();
      if (!nid) continue;
      byNid.set(nid, flight);
    }
    const nids = [...byNid.keys()];
    if (nids.length === 0) {
      return { cached: 0, updated: 0, skipped: 0 };
    }

    const existingByNid = new Map();
    for (const chunk of chunkArray(nids, 150)) {
      const filter = inFilterList(chunk);
      const rows =
        (await supabaseFetch(
          `leon_flights?select=flight_nid,flight_last_modification_time,raw_payload,is_deleted&operator_id=eq.${operator.id}&flight_nid=in.(${filter})`
        )) || [];
      for (const row of rows) {
        existingByNid.set(String(row.flight_nid), row);
      }
    }

    const payload = [];
    let skipped = 0;
    for (const [nid, flight] of byNid) {
      const existing = existingByNid.get(nid);
      const existingMod = existing?.flight_last_modification_time ?? null;
      const nextMod = flight.flightLastModificationTime ?? null;
      const samePayload = existing?.raw_payload && JSON.stringify(existing.raw_payload) === JSON.stringify(flight);
      const sameMod = existingMod === nextMod;
      if (existing && !existing.is_deleted && samePayload && sameMod) {
        skipped += 1;
        continue;
      }

      payload.push({
        operator_id: operator.id,
        flight_nid: nid,
        flight_no: flight.flightNo ?? null,
        date_trip: flight.startTimeUTC ? String(flight.startTimeUTC).slice(0, 10) : null,
        trip_code: flight.tripCode ?? null,
        departure_icao: flight.adep?.icao ?? null,
        arrival_icao: flight.ades?.icao ?? null,
        estimated_departure: flight.startTimeUTC ?? null,
        estimated_arrival: flight.endTimeUTC ?? null,
        actual_departure: flight.atd ?? null,
        actual_arrival: flight.ata ?? null,
        delay_minutes: Number.isFinite(Number(flight.delayMin)) ? Number(flight.delayMin) : 0,
        aircraft_registration: flight.aircraftRegistration ?? null,
        status: flight.status ?? null,
        is_deleted: false,
        flight_last_modification_time: flight.flightLastModificationTime ?? null,
        raw_payload: flight,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    if (payload.length > 0) {
      await supabaseFetch("leon_flights?on_conflict=operator_id,flight_nid", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(payload),
      });
    }

    return { cached: flights.length, updated: payload.length, skipped };
  }

  async markFlightsDeleted({ oprId, flightNids }) {
    if (!(await canUseSupabase())) return { marked: 0 };
    if (!Array.isArray(flightNids) || flightNids.length === 0) return { marked: 0 };

    const operator = await this.getOperatorByOprId(oprId);
    if (!operator?.id) return { marked: 0 };

    let marked = 0;
    for (const chunk of chunkArray(flightNids.map((v) => String(v)).filter(Boolean), 150)) {
      if (chunk.length === 0) continue;
      const filter = inFilterList(chunk);
      await supabaseFetch(
        `leon_flights?operator_id=eq.${operator.id}&flight_nid=in.(${filter})`,
        {
          method: "PATCH",
          body: JSON.stringify({
            is_deleted: true,
            updated_at: new Date().toISOString(),
            synced_at: new Date().toISOString(),
          }),
        }
      );
      marked += chunk.length;
    }
    return { marked };
  }

  async listHiddenAircraftKeys() {
    if (await canUseSupabase()) {
      const rows =
        (await supabaseFetch(
          "leon_aircraft_visibility?select=opr_id,registration&is_hidden=eq.true"
        )) || [];
      return rows.map((row) => `${row.opr_id}:${row.registration}`);
    }

    const local = await readLocalJson(LOCAL_VISIBILITY_FILE, { hidden: [] });
    return Array.isArray(local.hidden) ? local.hidden : [];
  }

  async setAircraftHidden({ oprId, registration, isHidden }) {
    const key = `${oprId}:${registration}`;
    if (await canUseSupabase()) {
      const operators = await supabaseFetch(`leon_operators?select=id,opr_id&opr_id=eq.${encodeURIComponent(oprId)}`);
      const operator = Array.isArray(operators) ? operators[0] : null;
      if (!operator) throw new Error(`Operator ${oprId} not found.`);

      await supabaseFetch("leon_aircraft_visibility?on_conflict=opr_id,registration", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({
          operator_id: operator.id,
          opr_id: oprId,
          registration,
          is_hidden: Boolean(isHidden),
          updated_at: new Date().toISOString(),
        }),
      });
      return { key, isHidden: Boolean(isHidden) };
    }

    const local = await readLocalJson(LOCAL_VISIBILITY_FILE, { hidden: [] });
    const hidden = new Set(Array.isArray(local.hidden) ? local.hidden : []);
    if (isHidden) hidden.add(key);
    else hidden.delete(key);
    await writeLocalJson(LOCAL_VISIBILITY_FILE, { hidden: [...hidden] });
    return { key, isHidden: Boolean(isHidden) };
  }

  storageMode() {
    if (supabaseUsable === true) return "supabase";
    if (supabaseConfigured() && supabaseUsable === false) return "supabase-unavailable";
    return "local-json";
  }
}
