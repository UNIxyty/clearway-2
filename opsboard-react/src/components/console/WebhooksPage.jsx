import { useEffect, useState } from 'react';
import { deleteWebhook, fetchWebhooks, reregisterWebhooks, toggleWebhook } from '../../services/timelineApi';
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

function healthOf(tenant) {
  if (tenant.lastError) return { label: 'Error', color: t.red, bg: t.redTint, dot: t.red };
  const enabled = Object.values(tenant.enabledEvents || {}).some(Boolean);
  if (!enabled) return { label: 'Disabled', color: t.faint, bg: '#f1f2f4', dot: '#c3c7cd' };
  const timestamps = Object.values(tenant.lastEventAt || {});
  if (timestamps.length === 0) return { label: 'Registered — no events yet', color: t.amber, bg: t.amberTint, dot: t.amber };
  const newest = Math.max(...timestamps.map((v) => new Date(v).getTime()));
  if (Date.now() - newest > 24 * 3600e3) return { label: 'Stale (>24h silent)', color: t.amber, bg: t.amberTint, dot: t.amber };
  return { label: 'Healthy', color: t.greenDeep, bg: t.greenTint, dot: t.green };
}

function OperatorCard({ oprId, tenant, events, onChanged, setError }) {
  const [busyEvent, setBusyEvent] = useState('');
  const [busyAll, setBusyAll] = useState(false);
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
        <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, fontFamily: t.mono }}>{oprId}</h3>
        <StatusPill color={health.color} bg={health.bg} dot={health.dot}>{health.label}</StatusPill>
        <div style={{ flex: 1 }} />
        <Button size="sm" icon="rotate-cw" spin={busyAll} disabled={busyAll} onClick={reRegister}>
          Re-register all
        </Button>
      </div>
      <div style={{ fontSize: 12.5, color: t.faint, fontFamily: t.mono, marginBottom: 14, overflowWrap: 'anywhere' }}>
        {tenant.webhookUrl}
      </div>
      {tenant.lastError && (
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
          const lastAt = tenant.lastEventAt?.[event];
          return (
            <div key={event} style={{ display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${t.borderInner}`, borderRadius: 10, padding: '10px 14px', background: enabled ? '#fff' : t.subtle }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: t.mono, fontSize: 13.5, fontWeight: 700 }}>{event}</span>
                  {enabled && (
                    <StatusPill color={liveOnLeon ? t.greenDeep : t.amber} bg={liveOnLeon ? t.greenTint : t.amberTint}>
                      {liveOnLeon ? 'live on Leon' : 'not confirmed on Leon'}
                    </StatusPill>
                  )}
                </div>
                <div style={{ fontSize: 12, color: t.faint, marginTop: 3 }}>
                  {events[event].description}
                  {lastAt && <> · last event {timeAgo(lastAt)}</>}
                  {registration && <> · registered {timeAgo(registration.registeredAt)}</>}
                </div>
              </div>
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
