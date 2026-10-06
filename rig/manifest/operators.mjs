// Rig-only: the operator registry (leon_operators) in the RIG database, for the manifest tests. Tokens are written
// encrypted exactly as the wall's Operators page writes them (enc:v1, AES-256-GCM, key = sha256 of the rig's
// LEON_REFRESH_TOKEN_ENCRYPTION_KEY). Refuses any database that is not local.
//   node --env-file=.env.rig rig/manifest/operators.mjs seed | list | add <oprId> <name> | break <oprId> | fix <oprId> | remove <oprId>
import crypto from "node:crypto";

const URL_ = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(URL_)) { console.error("refusing: not the rig's local database"); process.exit(2); }
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = "rig-local-only-not-a-secret"; // the value rig/manifest/start.sh gives the agent
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "content-type": "application/json", Prefer: "return=representation,resolution=merge-duplicates" };

function encrypt(token) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", crypto.createHash("sha256").update(SECRET).digest(), iv);
  const body = Buffer.concat([c.update(token, "utf8"), c.final()]);
  return `enc:v1:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${body.toString("base64")}`;
}
const api = (path, init = {}) => fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } }).then(async (r) => { const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t}`); return t ? JSON.parse(t) : null; });
const upsert = (oprId, name, token) => api("leon_operators?on_conflict=opr_id", { method: "POST", body: JSON.stringify([{ opr_id: oprId, name, refresh_token: encrypt(token), is_active: true }]) });

const [cmd, a, b] = process.argv.slice(2);
if (cmd === "seed") {
  await upsert("cwy-cwy", "Clearway (CWY)", "rig-operator-token-cwy-cwy");
  await upsert("klj", "KlasJet", "rig-operator-token-klj");
  await upsert("artlw", "ART-Line Wings LLC", "rig-operator-token-artlw");
} else if (cmd === "add") {
  await upsert(a, b ?? a, `rig-operator-token-${a}`);
} else if (cmd === "break") {
  await api(`leon_operators?opr_id=eq.${encodeURIComponent(a)}`, { method: "PATCH", body: JSON.stringify({ refresh_token: encrypt("rig-operator-token-revoked") }) });
} else if (cmd === "fix") {
  await api(`leon_operators?opr_id=eq.${encodeURIComponent(a)}`, { method: "PATCH", body: JSON.stringify({ refresh_token: encrypt(`rig-operator-token-${a}`) }) });
} else if (cmd === "remove") {
  await api(`leon_operators?opr_id=eq.${encodeURIComponent(a)}`, { method: "DELETE" });
} else if (cmd !== "list") { console.error("seed | list | add <oprId> <name> | break <oprId> | fix <oprId> | remove <oprId>"); process.exit(2); }
const rows = await api("leon_operators?select=opr_id,name,is_active&order=opr_id.asc");
console.log(`rig operators: ${rows.map((r) => `${r.opr_id} (${r.name})`).join(", ") || "none"}`);
