// Leon subscription webhooks (Phase 2 of the status-lag fix).
//
// WHY: setting flight-watch times (ATD/ATA) does NOT mark a flight modified
// in Leon, so the polling sync never hears about landings (measured: 0 of 22
// — docs/leon-status-cancel-webhook-investigation.md). Leon's subscription
// webhooks push exactly those events. This service:
//   - verifies incoming webhook calls (JWT RS512 against the tenant's
//     published public key — fail-closed),
//   - treats events as TRIGGERS ONLY: the payload never writes flight state;
//     we re-pull the flight through the normal query path and the existing
//     mapLeonFlight → kind-filter → eviction pipeline,
//   - registers/deletes/reconciles the subscriptions per tenant via Leon's
//     webhook mutations (using the operator's stored refresh token),
//   - records health (last event / last re-pull / errors) for the console
//     Webhooks page.
// The 60s poll stays untouched as the fallback: a missed delivery heals at
// the next poll, and the timestamp window ages flights out regardless.
//
// Signatures verified live by introspection (2026-07-18):
//   subscription { flight { flightWatch { flightWatchChanged { flightNid } } } }
//   subscription { flight { flightWatch { flightWatchCreated { flightNid } } } }
//   subscription { flight { flightCancellation { flightNid } } }
//   subscription S($operatorId: OperatorId!) { flight { flightScheduleChange(operatorId: $operatorId) { flightNid } } }
//   subscription S($operatorId: OperatorId!) { flight { flightCreate(operatorId: $operatorId) { flightNid } } }
//   subscription { trip { tripStatusChanged { nid status } } }
//   query { webhook { subscriptionList { label webhookUrl subscription } } }
//   query { flight(flightNid: N) { ...selection } }
//   mutation { webhook { createSubscriptionWebhook(refreshToken, label, subscription, variables, webhookUrl) } }
//   mutation { webhook { deleteSubscriptionWebhook(label) } }

import crypto from "node:crypto";
import { JsonFileStore } from "./json-store.mjs";

const KEY_CACHE_TTL_MS = 24 * 3600_000;
const LABEL_PREFIX = "digitalwall";

/**
 * Event catalog. `needsOperatorId` events get the tenant's numeric operator
 * id (taken from any cached flight's oprNid) as a GraphQL variable.
 * `handler` is "repull" (payload carries flightNid → re-pull that flight) or
 * "sync" (no per-flight nid → run one incremental sync cycle).
 */
export const WEBHOOK_EVENTS = {
  flightWatchChanged: {
    subscription: "subscription { flight { flightWatch { flightWatchChanged { flightNid } } } }",
    handler: "repull",
    defaultOn: true,
    description: "Flight-watch times set/edited (ATD/ATA — the landing signal)",
  },
  flightWatchCreated: {
    subscription: "subscription { flight { flightWatch { flightWatchCreated { flightNid } } } }",
    handler: "repull",
    defaultOn: true,
    description: "First flight-watch entry created for a flight",
  },
  flightCancellation: {
    subscription: "subscription { flight { flightCancellation { flightNid } } }",
    handler: "repull",
    defaultOn: true,
    description: "Flight cancelled — instant removal",
  },
  flightScheduleChange: {
    subscription:
      "subscription S($operatorId: OperatorId!) { flight { flightScheduleChange(operatorId: $operatorId) { flightNid } } }",
    needsOperatorId: true,
    handler: "repull",
    defaultOn: true,
    description: "Times/airports changed — instant repositioning",
  },
  flightCreate: {
    subscription:
      "subscription S($operatorId: OperatorId!) { flight { flightCreate(operatorId: $operatorId) { flightNid } } }",
    needsOperatorId: true,
    handler: "repull",
    defaultOn: true,
    description: "New flight — instant lane appearance",
  },
  tripStatusChanged: {
    subscription: "subscription { trip { tripStatusChanged { nid status } } }",
    handler: "sync",
    defaultOn: false,
    description: "Trip Option/Confirmed flips — triggers an incremental sync",
  },
};

function b64urlToBuffer(value) {
  return Buffer.from(String(value).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** Deep-search a webhook payload for every flightNid it carries. */
export function extractFlightNids(value, found = new Set()) {
  if (!value || typeof value !== "object") return found;
  for (const [key, v] of Object.entries(value)) {
    if (key === "flightNid" && (typeof v === "number" || typeof v === "string")) found.add(String(v));
    else if (v && typeof v === "object") extractFlightNids(v, found);
  }
  return found;
}

export class LeonWebhookService {
  constructor({ timelineService, sseHub = null } = {}) {
    this.timelineService = timelineService;
    this.sseHub = sseHub;
    this.store = new JsonFileStore("webhooks.json", { tenants: {} });
    this.state = { tenants: {} };
    this.keyCache = new Map(); // oprId -> { pem, fetchedAtMs }
  }

  async load() {
    const payload = await this.store.read();
    this.state = payload && typeof payload.tenants === "object" ? payload : { tenants: {} };
  }

  async persist() {
    await this.store.write(this.state);
    this.sseHub?.broadcast({ type: "webhooks.changed" });
  }

  tenant(oprId) {
    const key = String(oprId || "").trim();
    if (!this.state.tenants[key]) {
      this.state.tenants[key] = {
        enabledEvents: Object.fromEntries(
          Object.entries(WEBHOOK_EVENTS).map(([event, def]) => [event, def.defaultOn])
        ),
        registered: [],
        lastEventAt: {},
        lastRepull: null,
        lastError: null,
        operatorId: null,
        webhookUrl: null,
      };
    }
    return this.state.tenants[key];
  }

  /** Public base URL Leon calls; per-tenant path segment identifies the key set. */
  webhookUrlFor(oprId) {
    const base = String(process.env.LEON_WEBHOOK_PUBLIC_URL || "https://clearway.verxyl.com/digital-wall/leon/webhook")
      .trim()
      .replace(/\/$/, "");
    return `${base}/${encodeURIComponent(oprId)}`;
  }

  labelFor(oprId, event) {
    // Deterministic so re-register/delete finds it. Leon requires >5 chars.
    return `${LABEL_PREFIX}-${event}-${oprId}`.slice(0, 64);
  }

  // ── JWT verification (fail-closed) ─────────────────────────────────────
  async publicKeyFor(oprId) {
    const cached = this.keyCache.get(oprId);
    if (cached && Date.now() - cached.fetchedAtMs < KEY_CACHE_TTL_MS) return cached.pem;
    const base = String(process.env.LEON_WEBHOOK_KEY_BASE_URL || `https://${oprId}.leon.aero`).replace(/\/$/, "");
    const response = await fetch(`${base}/.well-known/keys/leon-subscriptions-webhook-1.pub`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`public key fetch failed (${response.status})`);
    const pem = await response.text();
    this.keyCache.set(oprId, { pem, fetchedAtMs: Date.now() });
    return pem;
  }

  /**
   * Verify the Authorization JWT of an incoming webhook call.
   * Returns { ok: true, claims } or { ok: false, error } — never throws.
   */
  async verifyRequest(oprId, authorizationHeader) {
    try {
      const token = String(authorizationHeader || "").replace(/^Bearer\s+/i, "").trim();
      if (!token) return { ok: false, error: "missing Authorization token" };
      const parts = token.split(".");
      if (parts.length !== 3) return { ok: false, error: "malformed JWT" };
      const header = JSON.parse(b64urlToBuffer(parts[0]).toString("utf-8"));
      if (header.alg !== "RS512") return { ok: false, error: `unexpected alg ${header.alg}` };
      const pem = await this.publicKeyFor(oprId);
      const verified = crypto
        .createVerify("RSA-SHA512")
        .update(`${parts[0]}.${parts[1]}`)
        .verify(pem, b64urlToBuffer(parts[2]));
      if (!verified) return { ok: false, error: "signature verification failed" };
      const claims = JSON.parse(b64urlToBuffer(parts[1]).toString("utf-8"));
      const nowSec = Math.floor(Date.now() / 1000);
      if (typeof claims.exp === "number" && claims.exp < nowSec) return { ok: false, error: "token expired" };
      if (claims.iss !== "Leon Software") return { ok: false, error: `unexpected iss ${claims.iss}` };
      const expectedAud = this.tenant(oprId).webhookUrl || this.webhookUrlFor(oprId);
      if (claims.aud && claims.aud !== expectedAud) {
        return { ok: false, error: `aud mismatch (${claims.aud})` };
      }
      return { ok: true, claims };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  // ── Event handling: trigger → re-pull, never trust the payload ─────────
  async handleEvent(oprId, payload) {
    const tenant = this.tenant(oprId);
    const nids = [...extractFlightNids(payload)];
    const eventName = this.guessEventName(payload);
    tenant.lastEventAt[eventName] = new Date().toISOString();
    tenant.lastError = null;
    try {
      if (nids.length > 0) {
        for (const nid of nids) {
          const result = await this.timelineService.resyncFlightByNid(oprId, nid);
          tenant.lastRepull = { at: new Date().toISOString(), flightNid: nid, outcome: result.outcome };
          console.log(`[leon-webhooks] ${oprId} ${eventName}: re-pulled flight ${nid} -> ${result.outcome}`);
        }
      } else {
        // No flight nid in the payload (e.g. trip status) — one incremental
        // sync cycle picks the change up through the normal path.
        await this.timelineService.refreshNow();
        tenant.lastRepull = { at: new Date().toISOString(), flightNid: null, outcome: "sync-cycle" };
        console.log(`[leon-webhooks] ${oprId} ${eventName}: no flightNid in payload — ran a sync cycle`);
      }
      this.sseHub?.broadcast({ type: "flight.changed", oprId, flightNids: nids, via: "webhook" });
    } catch (error) {
      tenant.lastError = `${eventName}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[leon-webhooks] ${oprId} ${eventName} handling failed:`, tenant.lastError);
    }
    await this.persist();
  }

  guessEventName(payload) {
    // Payload shape mirrors the subscription selection, e.g.
    // { flight: { flightWatch: { flightWatchChanged: { flightNid } } } }.
    const walk = (obj, path = []) => {
      if (!obj || typeof obj !== "object") return null;
      for (const [key, v] of Object.entries(obj)) {
        if (WEBHOOK_EVENTS[key]) return key;
        const nested = walk(v, [...path, key]);
        if (nested) return nested;
      }
      return null;
    };
    return walk(payload?.data ?? payload) ?? "unknown";
  }

  // ── Registration / reconciliation via Leon mutations ───────────────────
  async operatorIdFor(oprId) {
    const tenant = this.tenant(oprId);
    if (tenant.operatorId) return tenant.operatorId;
    const data = await this.timelineService.graphqlRequest(
      `query { flightList(filter: { timeInterval: { start: "${new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)}", end: "${new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)}" } }) { oprNid } }`,
      undefined,
      oprId
    );
    const oprNid = data.flightList?.find((f) => f?.oprNid != null)?.oprNid;
    if (oprNid == null) throw new Error("could not determine the tenant's operator id (no flights with oprNid)");
    tenant.operatorId = String(oprNid);
    await this.persist();
    return tenant.operatorId;
  }

  async listRemote(oprId) {
    const data = await this.timelineService.graphqlRequest(
      `query { webhook { subscriptionList { label webhookUrl subscription } } }`,
      undefined,
      oprId
    );
    return data.webhook?.subscriptionList ?? [];
  }

  async registerEvent(oprId, event) {
    const def = WEBHOOK_EVENTS[event];
    if (!def) throw new Error(`Unknown webhook event: ${event}`);
    const tenant = this.tenant(oprId);
    const label = this.labelFor(oprId, event);
    const url = this.webhookUrlFor(oprId);
    const refreshToken = await this.timelineService.resolveOperatorRefreshToken(oprId);
    const variables = def.needsOperatorId ? JSON.stringify({ operatorId: await this.operatorIdFor(oprId) }) : "{}";

    // Idempotent: delete any existing webhook under our label first.
    await this.deleteLabel(oprId, label).catch(() => {});

    const data = await this.timelineService.graphqlRequest(
      `mutation Create($refreshToken: String!, $label: String!, $subscription: String!, $variables: String!, $webhookUrl: String!) {
        webhook {
          createSubscriptionWebhook(
            refreshToken: $refreshToken, label: $label, subscription: $subscription,
            variables: $variables, webhookUrl: $webhookUrl
          ) {
            ... on CreateSubscriptionWebhookViolationList { error: value { message path } }
            ... on NonNullBooleanValue { result: value }
          }
        }
      }`,
      { refreshToken, label, subscription: def.subscription, variables, webhookUrl: url },
      oprId
    );
    const outcome = data.webhook?.createSubscriptionWebhook;
    if (outcome?.error?.length) {
      const message = outcome.error.map((e) => e.message).join("; ");
      throw new Error(`Leon rejected ${event}: ${message}`);
    }
    tenant.registered = [
      ...tenant.registered.filter((r) => r.label !== label),
      { label, event, url, registeredAt: new Date().toISOString() },
    ];
    tenant.webhookUrl = url;
    await this.persist();
    return { label, url };
  }

  async deleteLabel(oprId, label) {
    await this.timelineService.graphqlRequest(
      `mutation Delete($label: String!) { webhook { deleteSubscriptionWebhook(label: $label) } }`,
      { label },
      oprId
    );
    const tenant = this.tenant(oprId);
    tenant.registered = tenant.registered.filter((r) => r.label !== label);
    await this.persist();
  }

  async setEventEnabled(oprId, event, enabled) {
    const tenant = this.tenant(oprId);
    if (!(event in WEBHOOK_EVENTS)) throw new Error(`Unknown webhook event: ${event}`);
    tenant.enabledEvents[event] = Boolean(enabled);
    tenant.lastError = null;
    try {
      if (enabled) await this.registerEvent(oprId, event);
      else await this.deleteLabel(oprId, this.labelFor(oprId, event));
    } catch (error) {
      tenant.lastError = error instanceof Error ? error.message : String(error);
      await this.persist();
      throw error;
    }
    await this.persist();
  }

  /** (Re)register every enabled event; delete our labels that are disabled. */
  async reRegisterAll(oprId) {
    const tenant = this.tenant(oprId);
    const results = {};
    for (const [event, enabled] of Object.entries(tenant.enabledEvents)) {
      try {
        if (enabled) {
          await this.registerEvent(oprId, event);
          results[event] = "registered";
        } else {
          await this.deleteLabel(oprId, this.labelFor(oprId, event)).catch(() => {});
          results[event] = "disabled";
        }
      } catch (error) {
        results[event] = `error: ${error instanceof Error ? error.message : String(error)}`;
        tenant.lastError = results[event];
      }
    }
    await this.persist();
    return results;
  }

  /** Status for the console page: local state + live remote list per tenant. */
  async status(oprIds) {
    const tenants = {};
    for (const oprId of oprIds) {
      const tenant = this.tenant(oprId);
      let remote = null;
      let remoteError = null;
      try {
        remote = (await this.listRemote(oprId)).map((r) => ({
          label: r.label,
          webhookUrl: r.webhookUrl,
          ours: r.label.startsWith(`${LABEL_PREFIX}-`),
        }));
      } catch (error) {
        remoteError = error instanceof Error ? error.message : String(error);
      }
      tenants[oprId] = {
        webhookUrl: this.webhookUrlFor(oprId),
        enabledEvents: tenant.enabledEvents,
        registered: tenant.registered,
        remote,
        remoteError,
        lastEventAt: tenant.lastEventAt,
        lastRepull: tenant.lastRepull,
        lastError: tenant.lastError,
      };
    }
    return { events: Object.fromEntries(Object.entries(WEBHOOK_EVENTS).map(([k, v]) => [k, { description: v.description, defaultOn: v.defaultOn }])), tenants };
  }
}
