// Registered display devices (bug report 6 item 7 — the logout problem).
//
// The ops-room wall is an unattended kiosk, but it authenticated as an
// interactive user session; Supabase sessions are built to expire and be
// refreshed by a person, so every keepalive fix closed one expiry path and
// the session found another. This gives the wall a DEVICE identity instead:
// a long-lived, console-revocable token scoped to read-only wall data.
//
// Flow (approval happens on the CONSOLE, never on the display):
//   unregistered display → POST /api/device/announce {deviceId}
//     → pending record with a short code shown on the display
//   console Settings → Devices shows the pending prompt (same code)
//     → an authorised user names + approves it
//   display polls GET /api/device/state → receives its token ONCE
//     → renders, sending x-device-token (or ?device_token= for SSE)
//
// The token never expires on a schedule; it dies only by console revoke.
// Only the SHA-256 hash is stored after first delivery. Every approve /
// revoke is audit-logged with who and when.

import crypto from "node:crypto";
import { JsonFileStore } from "./json-store.mjs";

const PENDING_TTL_MS = 15 * 60 * 1000;
const LAST_SEEN_WRITE_THROTTLE_MS = 60 * 1000;

const store = new JsonFileStore("display-device-auth.json", { devices: [], audit: [] });

const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");
const newCode = () => crypto.randomBytes(4).toString("base64").replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 4).padEnd(4, "7");
const nowIso = () => new Date().toISOString();

function audit(state, entry) {
  state.audit.unshift({ ...entry, at: nowIso() });
  state.audit = state.audit.slice(0, 200);
}

function publicDevice(d) {
  return {
    deviceId: d.deviceId,
    name: d.name || null,
    status: d.status,
    code: d.status === "pending" ? d.code : null,
    createdAt: d.createdAt,
    approvedAt: d.approvedAt || null,
    approvedBy: d.approvedBy || null,
    revokedAt: d.revokedAt || null,
    revokedBy: d.revokedBy || null,
    lastSeenAt: d.lastSeenAt || null,
    expiresAt: d.status === "pending" ? d.expiresAt : null,
  };
}

async function withState(fn) {
  return store.update((state) => {
    state.devices = Array.isArray(state.devices) ? state.devices : [];
    state.audit = Array.isArray(state.audit) ? state.audit : [];
    // pending records that nobody approved expire
    const now = Date.now();
    state.devices = state.devices.filter(
      (d) => d.status !== "pending" || Date.parse(d.expiresAt || 0) > now,
    );
    return fn(state);
  });
}

/** An unregistered display announces itself; re-announcing refreshes the code TTL. */
export async function announceDevice(deviceId, meta = {}) {
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(String(deviceId || ""))) {
    throw new Error("deviceId must be 8-64 url-safe characters.");
  }
  let out = null;
  await withState((state) => {
    let d = state.devices.find((x) => x.deviceId === deviceId);
    if (d && d.status === "approved") {
      out = { status: "approved" };
      return state;
    }
    if (d && d.status === "revoked") {
      // A revoked device may ask again — as a NEW pending request.
      d.status = "pending";
      d.code = newCode();
      d.createdAt = nowIso();
      d.expiresAt = new Date(Date.now() + PENDING_TTL_MS).toISOString();
      delete d.tokenHash;
      delete d.tokenPlain;
      audit(state, { action: "re-announce", deviceId, by: null });
    } else if (!d) {
      // Public endpoint — cap the pending pool so it cannot be flooded.
      const pendingCount = state.devices.filter((x) => x.status === "pending").length;
      if (pendingCount >= 20) throw new Error("Too many pending device requests.");
      d = {
        deviceId,
        status: "pending",
        code: newCode(),
        createdAt: nowIso(),
        expiresAt: new Date(Date.now() + PENDING_TTL_MS).toISOString(),
        userAgent: String(meta.userAgent || "").slice(0, 200),
      };
      state.devices.push(d);
      audit(state, { action: "announce", deviceId, by: null });
    } else {
      d.expiresAt = new Date(Date.now() + PENDING_TTL_MS).toISOString();
    }
    out = { status: "pending", code: d.code, expiresAt: d.expiresAt };
    return state;
  });
  return out;
}

/** The display polls this. Read-only except the single token delivery. */
export async function deviceState(deviceId) {
  const state = await store.read();
  const d = (state.devices || []).find((x) => x.deviceId === deviceId);
  if (!d) return { status: "unknown" };
  if (d.status === "pending") {
    if (Date.parse(d.expiresAt || 0) <= Date.now()) return { status: "unknown" };
    return { status: "pending", code: d.code, expiresAt: d.expiresAt };
  }
  if (d.status === "revoked") return { status: "revoked" };
  const out = { status: "approved", name: d.name };
  if (d.tokenPlain) {
    let token = null;
    await withState((s) => {
      const row = s.devices.find((x) => x.deviceId === deviceId);
      if (row?.tokenPlain) {
        token = row.tokenPlain;
        delete row.tokenPlain; // one delivery; only the hash stays on disk
        audit(s, { action: "token-delivered", deviceId, by: null });
      }
      return s;
    });
    if (token) out.token = token;
  }
  return out;
}

export async function approveDevice(deviceId, name, byUser) {
  let out = null;
  await withState((state) => {
    const d = state.devices.find((x) => x.deviceId === deviceId);
    if (!d || d.status !== "pending") throw new Error("No pending request for that device.");
    const token = crypto.randomBytes(32).toString("hex");
    d.status = "approved";
    d.name = String(name || "").trim().slice(0, 60) || `Display ${d.code}`;
    d.approvedAt = nowIso();
    d.approvedBy = byUser || "unknown";
    d.tokenHash = sha256(token);
    d.tokenPlain = token; // scrubbed on first poll delivery
    delete d.expiresAt;
    audit(state, { action: "approve", deviceId, name: d.name, by: byUser });
    out = publicDevice(d);
    return state;
  });
  return out;
}

export async function revokeDevice(deviceId, byUser) {
  let out = null;
  await withState((state) => {
    const d = state.devices.find((x) => x.deviceId === deviceId);
    if (!d) throw new Error("Unknown device.");
    d.status = "revoked";
    d.revokedAt = nowIso();
    d.revokedBy = byUser || "unknown";
    delete d.tokenHash;
    delete d.tokenPlain;
    audit(state, { action: "revoke", deviceId, name: d.name || null, by: byUser });
    out = publicDevice(d);
    return state;
  });
  return out;
}

export async function listDevices() {
  let out = { devices: [], audit: [] };
  await withState((state) => {
    out = {
      devices: state.devices.map(publicDevice).sort((a, b) => (a.status === "pending" ? -1 : 1) - (b.status === "pending" ? -1 : 1) || String(b.lastSeenAt || b.createdAt).localeCompare(String(a.lastSeenAt || a.createdAt))),
      audit: state.audit.slice(0, 50),
    };
    return state;
  });
  return out;
}

const lastSeenWrites = new Map();

/**
 * Token → approved device, or null. Read-only on the hot path (this runs on
 * every device request); lastSeen is persisted at most once a minute.
 */
export async function validateDeviceToken(token) {
  if (!token || typeof token !== "string" || token.length < 32) return null;
  const hash = sha256(token);
  const state = await store.read();
  const d = (state.devices || []).find((x) => x.status === "approved" && x.tokenHash === hash);
  if (!d) return null;
  const prev = lastSeenWrites.get(d.deviceId) || 0;
  if (Date.now() - prev > LAST_SEEN_WRITE_THROTTLE_MS) {
    lastSeenWrites.set(d.deviceId, Date.now());
    await withState((s) => {
      const row = s.devices.find((x) => x.deviceId === d.deviceId);
      if (row) row.lastSeenAt = nowIso();
      return s;
    });
  }
  return { deviceId: d.deviceId, name: d.name };
}
