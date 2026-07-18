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
const LOG_CAP = 75; // rolling per-(operator,event) audit entries

/**
 * Classify a registration/resolution failure by its REAL cause so the UI can
 * differentiate severity (Item 3):
 *  - needsAttention: fixable by ops — bad/expired token, oprId mismatch,
 *    missing API-key scope (Leon's gateway answers those with an HTML 403
 *    while the token still works elsewhere), endpoint unreachable.
 *  - notAvailable: Leon genuinely doesn't offer this subscription for this
 *    operator (GraphQL-level rejection of the subscription itself).
 */
export function classifyFailure(message) {
  const text = String(message || "");
  const looksHtml = /<html|<head|<body|<!doctype/i.test(text);
  if (/token refresh failed/i.test(text)) {
    return {
      state: "needsAttention",
      hint: "Leon rejected this operator's refresh token — check the stored token and that the oprId matches the Leon subdomain.",
    };
  }
  if (/403/.test(text) && looksHtml) {
    return {
      state: "needsAttention",
      hint: "Leon's gateway forbids a call this trigger needs (HTML 403 with a working token = the API key is missing a scope — likely 'Operator' / GRAPHQL_OPERATOR, used to resolve the operator id). Regenerate this operator's Leon API key with that scope, or leave this trigger off.",
    };
  }
  if (/cannot query field|unknown (subscription|field)|not supported|no access to/i.test(text)) {
    return {
      state: "notAvailable",
      hint: "Leon does not offer this subscription for this operator. Nothing to fix — leave the trigger off.",
    };
  }
  if (/fetch failed|ENOTFOUND|ETIMEDOUT|ECONNREFUSED|abort/i.test(text)) {
    return {
      state: "needsAttention",
      hint: "Leon was unreachable when registering — network/endpoint issue; retry with Re-register.",
    };
  }
  return { state: "needsAttention", hint: "Registration failed — see the raw error; retry with Re-register." };
}

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
    // TripSimple exposes ONLY tripNid + tripNumber (introspected — the docs'
    // { nid status } example does not match the live schema).
    subscription: "subscription { trip { tripStatusChanged { tripNid tripNumber } } }",
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
    this.logStore = new JsonFileStore("webhook-log.json", { logs: {} });
    this.logs = { logs: {} };
    this.keyCache = new Map(); // oprId -> { pem, fetchedAtMs }
  }

  async load() {
    const payload = await this.store.read();
    this.state = payload && typeof payload.tenants === "object" ? payload : { tenants: {} };
    const logPayload = await this.logStore.read();
    this.logs = logPayload && typeof logPayload.logs === "object" ? logPayload : { logs: {} };
  }

  /** Rolling audit trail per (operator, event) — Item 2. */
  async appendLog(oprId, event, entry) {
    const key = `${oprId}:${event}`;
    const list = this.logs.logs[key] ?? [];
    list.unshift(entry);
    this.logs.logs[key] = list.slice(0, LOG_CAP);
    await this.logStore.write(this.logs);
  }

  logFor(oprId, event) {
    return this.logs.logs[`${oprId}:${event}`] ?? [];
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
        eventStates: {},
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
  /** Human description of what a re-pull changed on the timeline (Item 2). */
  static describeChange(before, after, outcome) {
    const hm = (v) => {
      const dt = new Date(v ?? "");
      return Number.isFinite(dt.getTime())
        ? `${String(dt.getUTCHours()).padStart(2, "0")}:${String(dt.getUTCMinutes()).padStart(2, "0")}`
        : null;
    };
    if (outcome === "sync-cycle") return "incremental sync";
    if (outcome === "not-found-evicted") return "removed — no longer in Leon";
    if (String(outcome).startsWith("evicted:")) {
      const reason = String(outcome).slice("evicted:".length).replace(/-/g, " ");
      return `removed — ${reason === "cancelled" ? "cancelled" : reason}`;
    }
    if (outcome === "updated" && !before) return "new flight added";
    if (outcome === "updated" && before && after) {
      const diffs = [];
      if (before.movementState !== after.movementState) diffs.push(`movementState: ${before.movementState} → ${after.movementState}`);
      if (!before.ata && after.ata) diffs.push(`landed (ATA ${hm(after.ata)})`);
      else if (!before.atd && after.atd) diffs.push(`departed (ATD ${hm(after.atd)})`);
      if (hm(before.etd) !== hm(after.etd)) diffs.push(`ETD ${hm(before.etd) ?? "—"} → ${hm(after.etd) ?? "—"}`);
      if (hm(before.eta) !== hm(after.eta)) diffs.push(`ETA ${hm(before.eta) ?? "—"} → ${hm(after.eta) ?? "—"}`);
      const routeBefore = `${before.adep?.icao ?? "?"}→${before.ades?.icao ?? "?"}`;
      const routeAfter = `${after.adep?.icao ?? "?"}→${after.ades?.icao ?? "?"}`;
      if (routeBefore !== routeAfter) diffs.push(`route ${routeBefore} → ${routeAfter}`);
      return diffs.length > 0 ? diffs.join(" · ") : "no visible change";
    }
    return String(outcome);
  }

  async handleEvent(oprId, payload) {
    const tenant = this.tenant(oprId);
    const nids = [...extractFlightNids(payload)];
    const eventName = this.guessEventName(payload);
    tenant.lastEventAt[eventName] = new Date().toISOString();
    tenant.lastError = null;
    try {
      if (nids.length > 0) {
        for (const nid of nids) {
          const key = this.timelineService.flightCacheKey(oprId, Number(nid));
          const beforeFlight = this.timelineService.flightsByNid.get(key);
          const before = beforeFlight
            ? { movementState: beforeFlight.movementState, etd: beforeFlight.etd, eta: beforeFlight.eta, atd: beforeFlight.atd, ata: beforeFlight.ata, adep: beforeFlight.adep, ades: beforeFlight.ades, flightNo: beforeFlight.flightNo }
            : null;
          const result = await this.timelineService.resyncFlightByNid(oprId, nid);
          const afterFlight = this.timelineService.flightsByNid.get(key);
          tenant.lastRepull = { at: new Date().toISOString(), flightNid: nid, outcome: result.outcome };
          await this.appendLog(oprId, eventName, {
            at: new Date().toISOString(),
            flightNid: String(nid),
            callsign: afterFlight?.flightNo ?? before?.flightNo ?? null,
            action: result.outcome,
            change: LeonWebhookService.describeChange(before, afterFlight, result.outcome),
          });
          console.log(`[leon-webhooks] ${oprId} ${eventName}: re-pulled flight ${nid} -> ${result.outcome}`);
        }
      } else {
        // No flight nid in the payload (e.g. trip status) — one incremental
        // sync cycle picks the change up through the normal path.
        await this.timelineService.refreshNow();
        tenant.lastRepull = { at: new Date().toISOString(), flightNid: null, outcome: "sync-cycle" };
        await this.appendLog(oprId, eventName, {
          at: new Date().toISOString(),
          flightNid: null,
          callsign: null,
          action: "sync-cycle",
          change: "incremental sync",
        });
        console.log(`[leon-webhooks] ${oprId} ${eventName}: no flightNid in payload — ran a sync cycle`);
      }
      this.sseHub?.broadcast({ type: "flight.changed", oprId, flightNids: nids, via: "webhook" });
    } catch (error) {
      tenant.lastError = `${eventName}: ${error instanceof Error ? error.message : String(error)}`;
      await this.appendLog(oprId, eventName, {
        at: new Date().toISOString(),
        flightNid: nids[0] ?? null,
        callsign: null,
        action: "error",
        change: tenant.lastError.slice(0, 200),
      });
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
    // Direct source (introspected): query { operator { oprNid } } — works on
    // a tenant with ZERO flights (the old flight-scan failed on quiet
    // tenants like sunway and blocked the operator-scoped subscriptions).
    let firstAttemptError = null;
    try {
      const data = await this.timelineService.graphqlRequest(
        `query { operator { oprNid } }`,
        undefined,
        oprId
      );
      if (data.operator?.oprNid != null) {
        tenant.operatorId = String(data.operator.oprNid);
        await this.persist();
        return tenant.operatorId;
      }
    } catch (error) {
      // Keep the RAW response (status + body head) for the diagnosis — an
      // HTML 403 here with an otherwise-working token means the API key
      // lacks the GRAPHQL_OPERATOR scope (Item 1: the Sunway case).
      firstAttemptError = error instanceof Error ? error.message : String(error);
      console.warn(`[leon-webhooks] ${oprId}: operator query rejected: ${firstAttemptError.slice(0, 300)}`);
    }
    // Fallback only: scan a WIDE window (±45 days) so a quiet-but-not-empty
    // tenant still resolves; limit keeps it inside Leon's query budget.
    try {
      const data = await this.timelineService.graphqlRequest(
        `query { flightList(filter: { limit: 1, timeInterval: { start: "${new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10)}", end: "${new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10)}" } }) { oprNid } }`,
        undefined,
        oprId
      );
      const oprNid = data.flightList?.find((f) => f?.oprNid != null)?.oprNid;
      if (oprNid != null) {
        tenant.operatorId = String(oprNid);
        await this.persist();
        return tenant.operatorId;
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `operator-id resolution failed for ${oprId}: query { operator { oprNid } } AND the flightList fallback were rejected at https://${oprId}.leon.aero/api/graphql/ — ${firstAttemptError ? `operator query: ${firstAttemptError.slice(0, 160)}; ` : ""}flight scan: ${detail.slice(0, 160)}`
      );
    }
    throw new Error(
      `operator-id resolution failed for ${oprId}: ${firstAttemptError ? `query { operator { oprNid } } was rejected at https://${oprId}.leon.aero/api/graphql/ (${firstAttemptError.slice(0, 200)}) and ` : ""}the flightList fallback found no flights (quiet tenant)`
    );
  }

  /**
   * Make local state mirror what Leon ACTUALLY has registered right now:
   * tenant.registered is rebuilt from Leon's subscriptionList (our labels
   * only), and a stale lastError is cleared once every enabled event is
   * genuinely live on Leon. Called after every mutating operation and by
   * status(); health is therefore never sticky.
   */
  async syncRemoteState(oprId) {
    const tenant = this.tenant(oprId);
    const remote = await this.listRemote(oprId);
    const ours = remote.filter((r) => r.label.startsWith(`${LABEL_PREFIX}-`));
    const previous = new Map(tenant.registered.map((r) => [r.label, r]));
    tenant.registered = ours.map((r) => {
      const event = Object.keys(WEBHOOK_EVENTS).find((e) => r.label === this.labelFor(oprId, e)) ?? null;
      return {
        label: r.label,
        event,
        url: r.webhookUrl,
        registeredAt: previous.get(r.label)?.registeredAt ?? new Date().toISOString(),
      };
    });
    const liveEvents = new Set(tenant.registered.map((r) => r.event));
    for (const event of liveEvents) {
      if (event) tenant.eventStates[event] = { state: "live", detail: null, hint: null, at: new Date().toISOString() };
    }
    const allEnabledLive = Object.entries(tenant.enabledEvents).every(
      ([event, enabled]) => !enabled || liveEvents.has(event)
    );
    const needsAttention = Object.entries(tenant.enabledEvents).some(
      ([event, enabled]) => enabled && !liveEvents.has(event) && tenant.eventStates[event]?.state !== "notAvailable"
    );
    if (!needsAttention) tenant.lastError = null;
    await this.persist();
    return { remote, allEnabledLive, needsAttention };
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
    // Leon's schema (introspected): variables is the Json! scalar, described
    // as "JSON encoded data" — and it means exactly that: the VALUE must be a
    // JSON-encoded STRING under a $v: Json! declaration. Tested live: a
    // string value registers (200, appears in subscriptionList); passing an
    // actual object makes Leon 500. includeAuthorizationHeader is Boolean!
    // and must be true — the receiver's JWT verification depends on Leon
    // sending the Authorization header.
    const variables = JSON.stringify(
      def.needsOperatorId ? { operatorId: await this.operatorIdFor(oprId) } : {}
    );

    // Idempotent: delete any existing webhook under our label first.
    await this.deleteLabel(oprId, label, { sync: false }).catch(() => {});

    const data = await this.timelineService.graphqlRequest(
      `mutation Create($refreshToken: String!, $label: String!, $subscription: String!, $variables: Json!, $webhookUrl: String!, $includeAuthorizationHeader: Boolean!) {
        webhook {
          createSubscriptionWebhook(
            refreshToken: $refreshToken, label: $label, subscription: $subscription,
            variables: $variables, webhookUrl: $webhookUrl,
            includeAuthorizationHeader: $includeAuthorizationHeader
          ) {
            ... on CreateSubscriptionWebhookViolationList { error: value { message path } }
            ... on NonNullBooleanValue { result: value }
          }
        }
      }`,
      { refreshToken, label, subscription: def.subscription, variables, webhookUrl: url, includeAuthorizationHeader: true },
      oprId
    );
    const outcome = data.webhook?.createSubscriptionWebhook;
    if (outcome?.error?.length) {
      const message = outcome.error.map((e) => e.message).join("; ");
      throw new Error(`Leon rejected ${event}: ${message}`);
    }
    tenant.eventStates[event] = { state: "live", detail: null, hint: null, at: new Date().toISOString() };
    tenant.registered = [
      ...tenant.registered.filter((r) => r.label !== label),
      { label, event, url, registeredAt: new Date().toISOString() },
    ];
    tenant.webhookUrl = url;
    await this.persist();
    await this.syncRemoteState(oprId).catch(() => {});
    return { label, url };
  }

  async deleteLabel(oprId, label, { sync = true } = {}) {
    await this.timelineService.graphqlRequest(
      `mutation Delete($label: String!) { webhook { deleteSubscriptionWebhook(label: $label) } }`,
      { label },
      oprId
    );
    const tenant = this.tenant(oprId);
    tenant.registered = tenant.registered.filter((r) => r.label !== label);
    await this.persist();
    if (sync) await this.syncRemoteState(oprId).catch(() => {});
  }

  async setEventEnabled(oprId, event, enabled) {
    const tenant = this.tenant(oprId);
    if (!(event in WEBHOOK_EVENTS)) throw new Error(`Unknown webhook event: ${event}`);
    tenant.enabledEvents[event] = Boolean(enabled);
    tenant.lastError = null;
    try {
      if (enabled) await this.registerEvent(oprId, event);
      else {
        await this.deleteLabel(oprId, this.labelFor(oprId, event));
        delete tenant.eventStates[event];
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const classified = classifyFailure(message);
      tenant.eventStates[event] = { state: classified.state, detail: message.slice(0, 400), hint: classified.hint, at: new Date().toISOString() };
      tenant.lastError = message;
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
        const message = error instanceof Error ? error.message : String(error);
        const classified = classifyFailure(message);
        tenant.eventStates[event] = { state: classified.state, detail: message.slice(0, 400), hint: classified.hint, at: new Date().toISOString() };
        results[event] = `error: ${message}`;
        tenant.lastError = results[event];
      }
    }
    await this.persist();
    await this.syncRemoteState(oprId).catch(() => {});
    return results;
  }

  /**
   * Status for the console page. Accepts [{ oprId, name }] (or plain oprId
   * strings). Health comes from Leon's CURRENT subscriptionList, never from
   * stale local state: syncRemoteState reconciles and clears healed errors.
   */
  async status(operators) {
    const tenants = {};
    for (const entry of operators) {
      const oprId = typeof entry === "string" ? entry : entry.oprId;
      const name = typeof entry === "string" ? null : entry.name ?? null;
      const tenant = this.tenant(oprId);
      let remote = null;
      let remoteError = null;
      let allEnabledLive = null;
      let needsAttention = null;
      try {
        const synced = await this.syncRemoteState(oprId);
        allEnabledLive = synced.allEnabledLive;
        needsAttention = synced.needsAttention;
        remote = synced.remote.map((r) => ({
          label: r.label,
          webhookUrl: r.webhookUrl,
          ours: r.label.startsWith(`${LABEL_PREFIX}-`),
        }));
      } catch (error) {
        remoteError = error instanceof Error ? error.message : String(error);
      }
      tenants[oprId] = {
        name,
        eventStates: tenant.eventStates,
        needsAttention,
        webhookUrl: this.webhookUrlFor(oprId),
        enabledEvents: tenant.enabledEvents,
        registered: tenant.registered,
        remote,
        remoteError,
        allEnabledLive,
        lastEventAt: tenant.lastEventAt,
        lastRepull: tenant.lastRepull,
        lastError: tenant.lastError,
      };
    }
    return { events: Object.fromEntries(Object.entries(WEBHOOK_EVENTS).map(([k, v]) => [k, { description: v.description, defaultOn: v.defaultOn }])), tenants };
  }
}
