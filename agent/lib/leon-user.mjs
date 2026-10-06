// Leon AS THE SIGNED-IN USER. Every other Leon client in the platform authenticates with an operator or service
// refresh token; the passenger manifest must not ("the agent acts as the signed-in user, never a service account: if
// that user cannot see the flight in Leon, they cannot generate its manifest"). So each person links their OWN Leon
// API refresh token, per Leon operator tenant (Leon → Settings → API → refresh tokens), and manifest reads use only
// that token. There is no fallback to any other credential.
//
// Storage: <STORAGE_ROOT>/leon-user-links/<sha256(userId)>.json — directory 0700, file 0600, written atomically. The
// token is AES-256-GCM encrypted with a key derived from LEON_REFRESH_TOKEN_ENCRYPTION_KEY (the key the wall already
// uses for operator tokens; the derivation label keeps the two uses apart). Tokens are never logged, never returned to
// a browser and never put in an audit row.
import crypto from "node:crypto";
import { mkdir, readFile, writeFile, rename, chmod, unlink } from "node:fs/promises";
import path from "node:path";

const TTL_MS = 25 * 60 * 1000; // Leon access tokens live 30 min
const OPR = /^[a-z0-9][a-z0-9-]{1,40}$/;
const accessCache = new Map(); // `${userKey}|${oprId}` → { token, until }

export class LeonAccessError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const root = () => path.resolve(process.env.STORAGE_ROOT || "/storage", "leon-user-links");
const userKey = (user) => {
  const id = String(user?.userId ?? "").trim();
  if (!id) throw new LeonAccessError("no-user", "No signed-in user.");
  return crypto.createHash("sha256").update(`leon-user-link:${id}`).digest("hex");
};
function encKey() {
  const secret = String(process.env.LEON_REFRESH_TOKEN_ENCRYPTION_KEY || process.env.LEON_TOKEN_ENCRYPTION_KEY || "").trim();
  if (!secret) throw new LeonAccessError("not-configured", "Linking a Leon account needs LEON_REFRESH_TOKEN_ENCRYPTION_KEY on the agent service.");
  return crypto.createHash("sha256").update(`clearway-agent:leon-user-link:v1:${secret}`).digest();
}
function seal(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const ct = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString("base64url")).join(".");
}
function open(sealed) {
  const [iv, tag, ct] = String(sealed).split(".").map((s) => Buffer.from(s, "base64url"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", encKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

async function readLinks(user) {
  try {
    const raw = JSON.parse(await readFile(path.join(root(), `${userKey(user)}.json`), "utf8"));
    return raw && typeof raw.links === "object" ? raw : { v: 1, links: {} };
  } catch (error) {
    if (error.code === "ENOENT") return { v: 1, links: {} };
    throw error;
  }
}
async function writeLinks(user, data) {
  await mkdir(root(), { recursive: true, mode: 0o700 });
  await chmod(root(), 0o700).catch(() => {});
  const file = path.join(root(), `${userKey(user)}.json`);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(data), { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, file);
}

// LEON_USER_API_BASE is set ONLY by the rig (mock Leon). Production leaves it unset.
const base = (oprId) => String(process.env.LEON_USER_API_BASE || "").replace(/\/+$/, "") || `https://${oprId}.leon.aero`;

async function exchange(oprId, refreshToken) {
  const form = new URLSearchParams();
  form.set("refresh_token", refreshToken);
  let r;
  try {
    r = await fetch(`${base(oprId)}/access_token/refresh/`, { method: "POST", body: form, signal: AbortSignal.timeout(15000) });
  } catch {
    throw new LeonAccessError("unreachable", `Leon (${oprId}) did not answer.`);
  }
  if (r.status === 401 || r.status === 403 || r.status === 400) throw new LeonAccessError("rejected", `Leon (${oprId}) refused the linked token — link your Leon account again.`);
  if (!r.ok) throw new LeonAccessError("unreachable", `Leon (${oprId}) answered HTTP ${r.status}.`);
  const token = (await r.text()).trim();
  if (!token) throw new LeonAccessError("rejected", `Leon (${oprId}) returned no access token.`);
  return token;
}

/** Linked operator tenants for this user — ids and dates only, never tokens. */
export async function listLeonLinks(user) {
  const data = await readLinks(user);
  return Object.entries(data.links).map(([oprId, l]) => ({ oprId, linkedAt: l.linkedAt ?? null }));
}

/** Verify the token against Leon (exchange + one trivial query), then store it encrypted. */
export async function linkLeon(user, oprId, refreshToken) {
  const opr = String(oprId ?? "").trim().toLowerCase();
  if (!OPR.test(opr)) throw new LeonAccessError("bad-operator", "Operator must be the Leon subdomain, e.g. cwy-cwy.");
  const token = String(refreshToken ?? "").trim();
  if (token.length < 16 || /\s/.test(token)) throw new LeonAccessError("bad-token", "That does not look like a Leon refresh token.");
  const access = await exchange(opr, token);
  const probe = await gql(opr, access, "query { __typename }");
  if (probe.httpStatus !== 200 || probe.errors) throw new LeonAccessError("rejected", `Leon (${opr}) did not accept the token.`);
  const data = await readLinks(user);
  data.links[opr] = { token: seal(token), linkedAt: new Date().toISOString() };
  await writeLinks(user, data);
  accessCache.set(`${userKey(user)}|${opr}`, { token: access, until: Date.now() + TTL_MS });
  return { oprId: opr, linkedAt: data.links[opr].linkedAt };
}

export async function unlinkLeon(user, oprId) {
  const data = await readLinks(user);
  const opr = String(oprId ?? "").trim().toLowerCase();
  const had = Boolean(data.links[opr]);
  delete data.links[opr];
  if (Object.keys(data.links).length) await writeLinks(user, data);
  else await unlink(path.join(root(), `${userKey(user)}.json`)).catch(() => {});
  accessCache.delete(`${userKey(user)}|${opr}`);
  return had;
}

async function gql(oprId, accessToken, query, variables = {}) {
  const r = await fetch(`${base(oprId)}/api/graphql/`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30000),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { data: json?.data ?? null, errors: json?.errors ?? (json ? null : [{ message: `HTTP ${r.status}` }]), httpStatus: r.status };
}

/**
 * A read-only GraphQL caller for this user on this operator tenant. Throws LeonAccessError("not-linked") when the
 * user has not linked that tenant — the caller must tell them, never reach for another credential.
 */
export async function leonForUser(user, oprId) {
  const opr = String(oprId ?? "").trim().toLowerCase();
  const key = `${userKey(user)}|${opr}`;
  const graphql = async (query, variables) => {
    if (/^\s*mutation\b/i.test(query)) throw new LeonAccessError("read-only", "Manifest Leon access is read-only.");
    let cached = accessCache.get(key);
    if (!cached || Date.now() >= cached.until) {
      const data = await readLinks(user);
      const link = data.links[opr];
      if (!link) throw new LeonAccessError("not-linked", `Your Leon account for ${opr} is not linked.`);
      let refresh;
      try { refresh = open(link.token); } catch { throw new LeonAccessError("rejected", `The stored Leon link for ${opr} cannot be read — link your Leon account again.`); }
      cached = { token: await exchange(opr, refresh), until: Date.now() + TTL_MS };
      accessCache.set(key, cached);
    }
    const res = await gql(opr, cached.token, query, variables);
    if (res.httpStatus === 401) { accessCache.delete(key); throw new LeonAccessError("rejected", `Leon (${opr}) refused your linked account.`); }
    return res;
  };
  // Fail fast (and with the right message) when there is no link at all.
  const data = await readLinks(user);
  if (!data.links[opr]) throw new LeonAccessError("not-linked", `Your Leon account for ${opr} is not linked.`);
  return { oprId: opr, graphql };
}
