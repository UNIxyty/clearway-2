// Client access (Stage 5, 2026-10-25): what a client may be shown of THEIR flights — the eleven switches and the three
// passenger levels, one list for the portal (Admin › Clients), the wall backend (which enforces them) and the agent
// (passengers). A switch that is off adds nothing; nothing is greyed. The Ops Agent, Flight intake, Admin, Developer,
// Users and Permissions are not switches: they are not in this list and appear nowhere a client can see.
// Plain module: Node (agent, wall) and the portal (including its edge middleware) import it alike.

export const SWITCHES = [
  // On the wall
  { key: "flight_board", group: "wall", label: "Flight board", required: true, starting: true },
  { key: "weather", group: "wall", label: "Weather", starting: true },
  { key: "notams", group: "wall", label: "NOTAM information", starting: true },
  { key: "radar", group: "wall", label: "Flight radar", starting: true },
  { key: "service_status", group: "wall", label: "Service status" },
  { key: "notam_check_status", group: "wall", label: "NOTAM check status" },
  // Reference
  { key: "documents", group: "reference", label: "Documents" },
  { key: "airport_search", group: "reference", label: "Airport & AIP search" },
  { key: "limitations", group: "reference", label: "Limitations" },
  { key: "important", group: "reference", label: "Important notices" },
  { key: "caa", group: "reference", label: "CAA details" },
];
export const SWITCH_KEYS = SWITCHES.map((s) => s.key);
export const STARTING_SWITCHES = SWITCHES.filter((s) => s.starting).map((s) => s.key);
export const REQUIRED_SWITCHES = SWITCHES.filter((s) => s.required).map((s) => s.key);

/** off: nothing about passengers · names: names, nationality and sex · documents: one passenger's document on reveal, logged. */
export const PASSENGER_LEVELS = ["off", "names", "documents"];

/** operator: every flight of a Leon operator · registration: every flight of an aircraft · trip: only those trips. */
export const SCOPE_KINDS = ["operator", "registration", "trip"];

export const CLIENT_STATUSES = ["requested", "approved", "refused", "removed"];

/** Normalises what ops saved: known switches only, the required ones always present once any are. */
export function normaliseSwitches(list) {
  const set = new Set((Array.isArray(list) ? list : []).map((s) => String(s)).filter((s) => SWITCH_KEYS.includes(s)));
  if (set.size) for (const r of REQUIRED_SWITCHES) set.add(r);
  return SWITCH_KEYS.filter((k) => set.has(k));
}

/** Normalises a scope list: [{ kind, value }] with known kinds, trimmed values, operators lower-case, registrations upper-case, no duplicates. */
export function normaliseScope(list) {
  const out = []; const seen = new Set();
  for (const e of Array.isArray(list) ? list : []) {
    const kind = String(e?.kind || "").toLowerCase(); let value = String(e?.value || "").trim();
    if (!SCOPE_KINDS.includes(kind) || !value) continue;
    if (kind === "operator") value = value.toLowerCase();
    if (kind === "registration") value = value.toUpperCase().replace(/\s+/g, "");
    const id = `${kind}:${value}`; if (seen.has(id)) continue; seen.add(id);
    out.push({ kind, value });
  }
  return out;
}
