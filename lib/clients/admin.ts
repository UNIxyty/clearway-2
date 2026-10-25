// Admin › Clients, the server half (Stage 5, 2026-10-25): read the clients, change scope / switches / passenger level,
// approve / refuse / remove. Every change writes a client_decisions row (append-only) with who did it, and the account's
// app_metadata (role client, is_approved, client_status) with the service key — the only writer of those keys.
// Removing access EMPTIES: status removed, scope and switches emptied, the row kept (decided 2026-10-20).
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLIENT_STATUSES, PASSENGER_LEVELS, REQUIRED_SWITCHES, normaliseScope, normaliseSwitches } from "@/lib/clients/switches.mjs";
import { sendDecisionMail } from "@/lib/clients/mail";

export type ClientRow = {
  id: string; user_id: string; email: string; person_name: string; company: string; kind: string; note: string;
  status: "requested" | "approved" | "refused" | "removed";
  scope: Array<{ kind: string; value: string }>; switches: string[]; passenger_level: "off" | "names" | "documents"; consent: boolean;
  requested_at: string; decided_at: string | null; decided_by: string | null; decided_by_email: string | null; decision_note: string;
};
export type Actor = { id: string; email: string | null };

const COLUMNS = "id,user_id,email,person_name,company,kind,note,status,scope,switches,passenger_level,consent,requested_at,decided_at,decided_by,decided_by_email,decision_note";

export async function listClients(service: SupabaseClient) {
  const { data, error } = await service.from("clients").select(COLUMNS).order("requested_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ClientRow[];
}

export async function getClient(service: SupabaseClient, id: string) {
  const { data, error } = await service.from("clients").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as ClientRow | null) ?? null;
}

export async function listDecisions(service: SupabaseClient, limit = 200) {
  const { data, error } = await service.from("client_decisions").select("id,client_id,kind,actor_email,detail,note,created_at").order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data ?? [];
}

async function log(service: SupabaseClient, clientId: string, kind: string, actor: Actor, detail: Record<string, unknown>, note = "") {
  const { error } = await service.from("client_decisions").insert({ client_id: clientId, kind, actor_id: actor.id, actor_email: actor.email, detail, note });
  if (error) throw error;
}

/** The account's authorization keys follow the row: only this function writes them. */
async function writeAccountMetadata(service: SupabaseClient, row: ClientRow) {
  const { data } = await service.auth.admin.getUserById(row.user_id);
  const current = (data?.user?.app_metadata ?? {}) as Record<string, unknown>;
  const { error } = await service.auth.admin.updateUserById(row.user_id, {
    app_metadata: { ...current, role: "client", is_approved: row.status === "approved", client_status: row.status },
    ...(row.status === "removed" || row.status === "refused" ? {} : {}),
  });
  if (error) throw error;
}

export type Change = { scope?: unknown; switches?: unknown; passengerLevel?: unknown; consent?: unknown; note?: unknown };

/** Validates a change against the rules: a scope entry, Flight board, a known level, consent for documents. */
export function validateChange(row: ClientRow, change: Change) {
  const scope = change.scope === undefined ? normaliseScope(row.scope) : normaliseScope(change.scope);
  const switches = change.switches === undefined ? normaliseSwitches(row.switches) : normaliseSwitches(change.switches);
  const passengerLevel = change.passengerLevel === undefined ? row.passenger_level : String(change.passengerLevel);
  const consent = change.consent === undefined ? row.consent : Boolean(change.consent);
  const problems: string[] = [];
  if (!scope.length) problems.push("A client needs at least one scope entry: an operator, a registration or a trip.");
  for (const r of REQUIRED_SWITCHES) if (!switches.includes(r)) problems.push("Flight board is required.");
  if (!PASSENGER_LEVELS.includes(passengerLevel)) problems.push("The passenger level must be off, names or documents.");
  if (passengerLevel === "documents" && !consent) problems.push("Passenger documents need the consent confirmation: the client is the operator, or written consent is held.");
  return { scope, switches, passengerLevel: passengerLevel as ClientRow["passenger_level"], consent, problems };
}

/** Approve (from requested, refused or removed) with the full access set, or change an approved client. */
export async function saveAccess(service: SupabaseClient, row: ClientRow, change: Change, actor: Actor, decision: "approved" | "changed"): Promise<{ problems: string[]; row?: undefined } | { row: ClientRow; problems?: undefined }> {
  const v = validateChange(row, change);
  if (v.problems.length) return { problems: v.problems };
  const before = { scope: normaliseScope(row.scope), switches: normaliseSwitches(row.switches), passengerLevel: row.passenger_level };
  const patch = { scope: v.scope, switches: v.switches, passenger_level: v.passengerLevel, consent: v.consent, status: "approved" as const, decided_at: new Date().toISOString(), decided_by: actor.id, decided_by_email: actor.email, decision_note: String(change.note ?? ""), updated_at: new Date().toISOString() };
  const { data, error } = await service.from("clients").update(patch).eq("id", row.id).select(COLUMNS).single();
  if (error) throw error;
  const after = data as ClientRow;
  await writeAccountMetadata(service, after);
  const levelChanged = before.passengerLevel !== after.passenger_level;
  await log(service, row.id, decision, actor, { before, after: { scope: after.scope, switches: after.switches, passengerLevel: after.passenger_level } }, String(change.note ?? ""));
  if (decision === "changed" && levelChanged) await log(service, row.id, "passengers", actor, { from: before.passengerLevel, to: after.passenger_level, consent: after.consent });
  if (decision === "approved") void sendDecisionMail({ to: after.email, personName: after.person_name, company: after.company, decision: "approved" });
  return { row: after };
}

/** Refuse a request, or remove access: the row stays, emptied. */
export async function closeAccess(service: SupabaseClient, row: ClientRow, status: "refused" | "removed", actor: Actor, note = "") {
  if (!CLIENT_STATUSES.includes(status)) throw new Error("status");
  const before = { scope: normaliseScope(row.scope), switches: normaliseSwitches(row.switches), passengerLevel: row.passenger_level };
  const patch = { status, scope: [], switches: [], passenger_level: "off" as const, consent: false, decided_at: new Date().toISOString(), decided_by: actor.id, decided_by_email: actor.email, decision_note: note, updated_at: new Date().toISOString() };
  const { data, error } = await service.from("clients").update(patch).eq("id", row.id).select(COLUMNS).single();
  if (error) throw error;
  const after = data as ClientRow;
  await writeAccountMetadata(service, after);
  if (status === "removed") {
    // Signed out everywhere now: every refresh token of the account is revoked.
    await service.auth.admin.signOut(row.user_id, "global").catch(() => {});
  }
  await log(service, row.id, status, actor, { before }, note);
  void sendDecisionMail({ to: after.email, personName: after.person_name, company: after.company, decision: status, note });
  return { row: after };
}
