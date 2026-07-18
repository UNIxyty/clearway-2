import { useEffect, useState } from 'react';
import { deleteWebhook, fetchWebhookLog, fetchWebhooks, reregisterWebhooks, toggleWebhook } from '../../services/timelineApi';
import { subscribeWallStream } from '../../services/wallStream';
import Icon from './icons';
import {
  Button,
  Card,
  ErrorBanner,
  HelpBanner,
  IconButton,
  LoadingState,
  PageHeader,
  StatusPill,
  t,
  timeAgo,
  Toggle,
  useToast,
} from './ui';

// Webhooks — Leon push subscriptions per operator (Phase 2c). Landing /
// cancellation / schedule events push from Leon to the wall backend, which
// re-pulls the flight through the normal pipeline; this page shows health
// and controls the per-event registrations. The 60s poll always remains the
// fallback — disabling everything here never breaks the wall.

const EVENT_ORDER = [
  'flightWatchChanged',
  'flightWatchCreated',
  'flightCancellation',
  'flightScheduleChange',
  'flightCreate',
  'tripStatusChanged',
];

// Severity must match reality (Item 3): only a genuinely fixable problem
// (needsAttention) reads as a loud red; Leon-side "not offered here" is calm.
function healthOf(tenant) {
  const enabled = Object.entries(tenant.enabledEvents || {}).filter(([, on]) => on).map(([e]) => e);
  if (enabled.length === 0) return { label: 'Disabled', color: t.faint, bg: '#f1f2f4', dot: '#c3c7cd' };
  if (tenant.allEnabledLive === null && tenant.remoteError) {
    return { label: 'Status unknown (Leon unreachable)', color: t.amber, bg: t.amberTint, dot: t.amber };
  }
  const states = tenant.eventStates || {};
  const attention = enabled.filter((e) => states[e]?.state === 'needsAttention');
  const notAvailable = enabled.filter((e) => states[e]?.state === 'notAvailable');
  if (attention.length > 0) {
    return { label: `${attention.length} trigger${attention.length > 1 ? 's' : ''} need attention`, color: t.red, bg: t.redTint, dot: t.red };
  }
  const silent = () => {
    const timestamps = Object.values(tenant.lastEventAt || {});
    if (timestamps.length === 0) return null;
    const newest = Math.max(...timestamps.map((v) => new Date(v).getTime()));
    return Date.now() - newest > 24 * 3600e3;
  };
  if (notAvailable.length > 0) {
    return { label: 'Healthy · some triggers not available', color: t.greenDeep, bg: t.greenTint, dot: t.green };
  }
  if (tenant.allEnabledLive === true) {
    if (silent() === true) return { label: 'Live on Leon · >24h silent', color: t.amber, bg: t.amberTint, dot: t.amber };
    return { label: 'Healthy', color: t.greenDeep, bg: t.greenTint, dot: t.green };
  }
  return { label: 'Registering…', color: t.amber, bg: t.amberTint, dot: t.amber };
}

const EVENT_STATE_CHIP = {
  live: { label: 'live on Leon', color: t.greenDeep, bg: t.greenTint },
  notAvailable: { label: 'Not available for this operator', color: t.muted, bg: '#eef1f5' },
  needsAttention: { label: 'needs attention', color: t.redDeep, bg: t.redTint },
};

// Item 2: per-trigger audit trail overlay — what Leon pushed, which flight,
// what the re-pull did, and the before -> after timeline change.
function TriggerLogOverlay({ oprId, event, onClose }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchWebhookLog(oprId, event)
      .then((p) => setEntries(p.entries || []))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [oprId, event]);

  const ACTION_STYLE = {
    updated: { color: t.greenDeep, bg: t.greenTint },
    'sync-cycle': { color: t.blueDeep, bg: t.blueChip },
    error: { color: t.redDeep, bg: t.redTint },
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,18,26,.45)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="cw-fade"
        style={{ background: '#fff', borderRadius: 16, boxShadow: '0 24px 70px rgba(16,18,22,.35)', width: 680, maxWidth: '94vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${t.borderInner}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="clock" size={17} color={t.blueDeep} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, fontFamily: t.mono }}>{event}</div>
            <div style={{ fontSize: 12, color: t.faint }}>Trigger history · {oprId} · newest first</div>
          </div>
          <IconButton icon="x" title="Close" onClick={onClose} />
        </div>
        <div style={{ overflowY: 'auto', padding: '12px 20px 18px' }}>
          {error && <ErrorBanner>{error}</ErrorBanner>}
          {entries === null && !error && <LoadingState>Loading history…</LoadingState>}
          {entries !== null && entries.length === 0 && (
            <div style={{ fontSize: 13.5, color: t.faint, padding: '18px 0' }}>
              No events received yet for this trigger — history appears as Leon starts pushing.
            </div>
          )}
          {(entries || []).map((entry, index) => {
            const st = ACTION_STYLE[entry.action] || (String(entry.action).startsWith('evicted') || entry.action === 'not-found-evicted'
              ? { color: '#b45309', bg: t.amberTint }
              : { color: t.muted, bg: '#eef1f5' });
            return (
              <div key={`${entry.at}-${index}`} style={{ borderBottom: `1px solid ${t.rowLine}`, padding: '10px 2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: t.mono, fontSize: 12, color: t.faint }}>
                    {new Date(entry.at).toISOString().slice(5, 16).replace('T', ' ')}Z
                  </span>
                  {entry.callsign && (
                    <span style={{ fontFamily: t.mono, fontSize: 13, fontWeight: 700 }}>
                      {entry.callsign}
                      <span style={{ color: t.ghost, fontWeight: 400 }}> · {entry.flightNid}</span>
                    </span>
                  )}
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: st.color, background: st.bg, padding: '2px 8px', borderRadius: 6 }}>
                    {entry.action}
                  </span>
                </div>
                {entry.change && (
                  <div style={{ fontFamily: t.mono, fontSize: 12.5, color: t.body, marginTop: 5, overflowWrap: 'anywhere' }}>
                    {entry.change}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function OperatorCard({ oprId, tenant, events, onChanged, setError }) {
  const [busyEvent, setBusyEvent] = useState('');
  const [busyAll, setBusyAll] = useState(false);
  const [logEvent, setLogEvent] = useState('');
  const flash = useToast();
  const health = healthOf(tenant);
  const registeredByEvent = Object.fromEntries((tenant.registered || []).map((r) => [r.event, r]));
  const remoteOurs = (tenant.remote || []).filter((r) => r.ours);

  async function toggle(event, enabled) {
    setBusyEvent(event);
    setError('');
    try {
      await toggleWebhook({ oprId, event, enabled });
      flash(`${enabled ? 'Registered' : 'Removed'} ${event} for ${oprId}`, enabled ? '#4ade80' : '#f87171');
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await onChanged();
    } finally {
      setBusyEvent('');
    }
  }

  async function reRegister() {
    setBusyAll(true);
    setError('');
    try {
      const payload = await reregisterWebhooks(oprId);
      const errors = Object.entries(payload.results || {}).filter(([, v]) => String(v).startsWith('error'));
      flash(errors.length === 0 ? `Re-registered all enabled events for ${oprId}` : `${oprId}: ${errors.length} event(s) failed — see card`, errors.length === 0 ? '#4ade80' : '#f87171');
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAll(false);
    }
  }

  return (
    <Card style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        {/* operator NAME first (ops reads names, not ids); oprId muted */}
        <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>
          {tenant.name || oprId}
          {tenant.name && tenant.name !== oprId && (
            <span style={{ fontFamily: t.mono, fontSize: 13, fontWeight: 600, color: t.faint, marginLeft: 9 }}>· {oprId}</span>
          )}
        </h3>
        <StatusPill color={health.color} bg={health.bg} dot={health.dot}>{health.label}</StatusPill>
        <div style={{ flex: 1 }} />
        <Button size="sm" icon="rotate-cw" spin={busyAll} disabled={busyAll} onClick={reRegister}>
          Re-register all
        </Button>
      </div>
      <div style={{ fontSize: 12.5, color: t.faint, fontFamily: t.mono, marginBottom: 14, overflowWrap: 'anywhere' }}>
        {tenant.webhookUrl}
      </div>
      {tenant.lastError && tenant.needsAttention === true && (
        <div style={{ fontSize: 13, color: t.redDeep, background: '#fdf0f0', border: '1px solid #f6d8d8', borderRadius: 9, padding: '9px 12px', marginBottom: 14, display: 'flex', gap: 9, alignItems: 'center' }}>
          <Icon name="alert-triangle" size={15} style={{ flexShrink: 0 }} />
          <span style={{ overflowWrap: 'anywhere' }}>{tenant.lastError}</span>
        </div>
      )}
      {tenant.remoteError && (
        <div style={{ fontSize: 12.5, color: t.amber, marginBottom: 12 }}>
          Could not read Leon's live registration list: {tenant.remoteError}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {EVENT_ORDER.filter((event) => events[event]).map((event) => {
          const enabled = Boolean(tenant.enabledEvents?.[event]);
          const registration = registeredByEvent[event];
          const liveOnLeon = remoteOurs.some((r) => r.label.includes(`-${event}-`));
          const eventState = tenant.eventStates?.[event];
          const lastAt = tenant.lastEventAt?.[event];
          // chip severity mirrors reality: live green; Leon-side unavailable
          // is CALM grey; only fixable problems are red (Item 3)
          const chip = enabled
            ? liveOnLeon
              ? EVENT_STATE_CHIP.live
              : EVENT_STATE_CHIP[eventState?.state] ?? { label: 'not confirmed on Leon', color: t.amber, bg: t.amberTint }
            : null;
          return (
            <div key={event} style={{ display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${t.borderInner}`, borderRadius: 10, padding: '10px 14px', background: enabled ? '#fff' : t.subtle }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: t.mono, fontSize: 13.5, fontWeight: 700 }}>{event}</span>
                  {chip && (
                    <span title={eventState?.hint || ''} style={{ fontSize: 11, fontWeight: 700, color: chip.color, background: chip.bg, padding: '3px 9px', borderRadius: 6, cursor: eventState?.hint ? 'help' : 'default' }}>
                      {chip.label}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: t.faint, marginTop: 3 }}>
                  {events[event].description}
                  {lastAt && <> · last event {timeAgo(lastAt)}</>}
                  {registration && <> · registered {timeAgo(registration.registeredAt)}</>}
                </div>
                {enabled && eventState?.state === 'needsAttention' && eventState?.hint && (
                  <div style={{ fontSize: 12, color: t.redDeep, marginTop: 5, lineHeight: 1.45 }}>{eventState.hint}</div>
                )}
              </div>
              <IconButton
                icon="clock"
                title="Trigger history — what Leon pushed and what it changed"
                onClick={() => setLogEvent(event)}
              />
              {registration && (
                <IconButton
                  icon="trash-2"
                  title={`Delete webhook ${registration.label}`}
                  disabled={busyEvent === event}
                  onClick={() => toggle(event, false)}
                />
              )}
              <Toggle on={enabled} disabled={busyEvent === event} onToggle={() => toggle(event, !enabled)} />
            </div>
          );
        })}
      </div>

      {tenant.lastRepull && (
        <div style={{ fontSize: 12.5, color: t.muted, marginTop: 12 }}>
          Last re-pull: {tenant.lastRepull.flightNid ? `flight ${tenant.lastRepull.flightNid}` : 'sync cycle'} →{' '}
          <span style={{ fontFamily: t.mono }}>{tenant.lastRepull.outcome}</span> · {timeAgo(tenant.lastRepull.at)}
        </div>
      )}
      {logEvent && <TriggerLogOverlay oprId={oprId} event={logEvent} onClose={() => setLogEvent('')} />}
    </Card>
  );
}

export default function WebhooksPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  async function load({ quiet = false } = {}) {
    if (!quiet) setRefreshing(true);
    try {
      const payload = await fetchWebhooks();
      setData(payload);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load({ quiet: true });
    return subscribeWallStream('webhooks.changed', () => load({ quiet: true }), { surface: 'console' });
  }, []);

  const tenants = data?.tenants || {};

  return (
    <div>
      <PageHeader
        title="Webhooks"
        desc="Leon push subscriptions per operator. When OPS set a landing, cancel a flight or change a schedule, Leon pushes the event here and the wall updates within seconds — the 60s poll always remains as fallback."
        descMax={680}
        actions={
          <Button icon="refresh-cw" spin={refreshing} onClick={() => load()}>
            Refresh health
          </Button>
        }
      />

      <HelpBanner
        title="How this works"
        items={[
          { title: 'Toggles', body: "register a subscription webhook on that operator's Leon tenant (deterministic label, max 10 per operator)." },
          { title: 'Security', body: 'every delivery is signed by Leon and verified before anything runs; a failed signature is rejected.' },
          { title: 'Trigger only', body: 'an event re-pulls that flight through the normal sync pipeline — the payload is never trusted as state.' },
          { title: 'Fallback', body: 'disabling everything returns that operator to poll-only updates; the 60s poll never stops.' },
        ]}
      />

      <ErrorBanner>{error}</ErrorBanner>

      {loading && <LoadingState>Loading webhook status…</LoadingState>}
      {!loading && Object.keys(tenants).length === 0 && !error && (
        <Card><div style={{ fontSize: 14, color: t.muted }}>No operators configured.</div></Card>
      )}
      {Object.entries(tenants).map(([oprId, tenant]) => (
        <OperatorCard
          key={oprId}
          oprId={oprId}
          tenant={tenant}
          events={data?.events || {}}
          onChanged={() => load({ quiet: true })}
          setError={setError}
        />
      ))}
    </div>
  );
}
