// Intake settings, edited by admins on the Agent settings page (not in the server .env):
//   addresses      — the agent's receiving addresses (health pills, which mail counts as intake)
//   notifyTo       — who gets the E2 / E3 / E4 emails
//   mailboxReaders — who may open the Agent mailbox besides admins/developers
//   retentionDays  — how long raw mail, attachments and personal data are kept (default 90)
// Stored as agent_settings rows (`intake:*`, the value in `reason`, as the retention row already was).
// A value never saved falls back to the server environment, and the page says so.
import { rest } from "../knowledge/retrieval.mjs";
import { DEFAULT_RETENTION_DAYS } from "./retention.mjs";

const KEYS = { addresses: "intake:addresses", notifyTo: "intake:notify_to", mailboxReaders: "intake:mailbox_readers", retentionDays: "intake:retention" };
const ENV = { addresses: "INTAKE_ADDRESSES", notifyTo: "INTAKE_NOTIFY_TO", mailboxReaders: "INTAKE_MAILBOX_READERS" };
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/;
const list = (s) => [...new Set(String(s ?? "").split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];

let cache = { at: 0, value: null };
export async function intakeSettings({ fresh = false } = {}) {
  if (!fresh && cache.value && Date.now() - cache.at < 15_000) return cache.value;
  const rows = (await rest(`agent_settings?select=id,reason,updated_at,updated_by_email&id=in.(${Object.values(KEYS).map((k) => `"${k}"`).join(",")})`).catch(() => [])) ?? [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out = { source: {}, updated: {} };
  for (const [k, id] of Object.entries(KEYS)) {
    const row = byId.get(id);
    if (k === "retentionDays") { const n = Number(row?.reason); out[k] = Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_RETENTION_DAYS; out.source[k] = row ? "settings" : "default"; }
    else if (row) { out[k] = list(row.reason); out.source[k] = "settings"; }
    else { out[k] = list(process.env[ENV[k]]); out.source[k] = out[k].length ? "environment" : "unset"; }
    if (row) out.updated[k] = { at: row.updated_at, by: row.updated_by_email ?? null };
  }
  if (!out.addresses.length && out.source.addresses === "unset") out.addresses = ["handling@agent.verxyl.com"], out.source.addresses = "default";
  cache = { at: Date.now(), value: out };
  return out;
}

/** Saves the given keys. Throws with a plain reason for anything invalid; saves nothing in that case. */
export async function setIntakeSettings(patch, user) {
  const rows = [];
  for (const k of ["addresses", "notifyTo", "mailboxReaders"]) {
    if (patch[k] === undefined) continue;
    const v = Array.isArray(patch[k]) ? list(patch[k].join(",")) : list(patch[k]);
    const bad = v.filter((x) => !EMAIL.test(x));
    if (bad.length) throw Object.assign(new Error(`Not an email address: ${bad.join(", ")}`), { status: 400 });
    if (k === "addresses" && !v.length) throw Object.assign(new Error("Keep at least one receiving address."), { status: 400 });
    rows.push({ id: KEYS[k], enabled: true, reason: v.join(","), updated_at: new Date().toISOString(), updated_by_email: user?.email ?? null });
  }
  if (patch.retentionDays !== undefined) {
    const n = Math.floor(Number(patch.retentionDays));
    if (!Number.isFinite(n) || n < 1 || n > 3650) throw Object.assign(new Error("Retention must be between 1 and 3650 days."), { status: 400 });
    rows.push({ id: KEYS.retentionDays, enabled: true, reason: String(n), updated_at: new Date().toISOString(), updated_by_email: user?.email ?? null });
  }
  if (rows.length) await rest("agent_settings?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows) });
  cache = { at: 0, value: null };
  return intakeSettings({ fresh: true });
}
