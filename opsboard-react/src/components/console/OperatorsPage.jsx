import { useEffect, useState } from 'react';
import {
  fetchOperators,
  fetchSyncStatus,
  forceTimelineRefresh,
  setOperatorActive,
  upsertOperator,
} from '../../services/timelineApi';
import Icon from './icons';
import {
  Button,
  Card,
  ErrorBanner,
  EmptyState,
  FieldLabel,
  LoadingState,
  PageHeader,
  StatusPill,
  t,
  TableShell,
  TextInput,
  timeAgo,
  Toggle,
  useToast,
} from './ui';

// Operators — Leon operators feeding the wall + sync health (approved design).

const STATUS_MAP = {
  success: { c: '#15803d', b: '#e7f6ec', label: 'Synced', dot: '#16a34a' },
  error: { c: '#e5484d', b: '#fdecec', label: 'Error', dot: '#e5484d' },
  idle: { c: '#6c7079', b: '#eef1f5', label: 'Paused', dot: '#9aa0a8' },
};

function AddOperatorForm({ onSaved, onCancel }) {
  const [form, setForm] = useState({ name: '', oprId: '', refreshToken: '' });
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const flash = useToast();

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await upsertOperator({ ...form, isActive: true });
      flash('Operator added · initial sync queued');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="cw-fade" style={{ border: `1px solid ${t.blueBorder}`, marginBottom: 20 }}>
      <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>Add operator</h3>
      <p style={{ fontSize: 13.5, color: t.muted, margin: '0 0 18px' }}>
        Connect a Leon operator so its flights and aircraft flow into the wall.
      </p>
      <ErrorBanner>{error}</ErrorBanner>
      <form onSubmit={save}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <FieldLabel>Operator name</FieldLabel>
            <TextInput
              placeholder="e.g. SmartLynx"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div>
            <FieldLabel>Callsign prefix / oprId</FieldLabel>
            <TextInput
              mono
              placeholder="e.g. ART"
              required
              value={form.oprId}
              onChange={(e) => setForm((prev) => ({ ...prev, oprId: e.target.value }))}
            />
          </div>
        </div>
        <div style={{ marginBottom: 18 }}>
          <FieldLabel
            extra={
              <span style={{ fontSize: 11, fontWeight: 600, color: t.amber, background: t.amberTint, padding: '2px 8px', borderRadius: 6 }}>
                write-only · secret
              </span>
            }
          >
            Refresh token
          </FieldLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, border: `1px solid ${t.borderInput}`, borderRadius: 10, padding: '0 13px', background: t.card }}>
            <Icon name="key-round" size={16} color={t.faint} />
            <input
              type={showToken ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Paste Leon refresh token"
              required
              value={form.refreshToken}
              onChange={(e) => setForm((prev) => ({ ...prev, refreshToken: e.target.value }))}
              style={{ flex: 1, border: 'none', outline: 'none', fontFamily: t.mono, fontSize: 14, padding: '11px 0', background: 'transparent', color: t.ink }}
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: t.faint, padding: 6, display: 'flex' }}
            >
              <Icon name={showToken ? 'eye-off' : 'eye'} size={16} />
            </button>
          </div>
          <div style={{ fontSize: 12, color: t.faint, marginTop: 7, lineHeight: 1.5 }}>
            Stored encrypted and never echoed back. Generate one in Leon under <strong>Admin → API → Personal tokens</strong>.
            It authorises read-only flight &amp; schedule pulls.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="primary" size="lg" type="submit" disabled={saving} spin={saving}>
            Save operator
          </Button>
          <Button variant="ghost" size="lg" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function OperatorsPage() {
  const [operators, setOperators] = useState([]);
  const [sync, setSync] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [forceSyncing, setForceSyncing] = useState(false);
  const [togglingId, setTogglingId] = useState('');
  const flash = useToast();

  async function load() {
    setError('');
    try {
      const [operatorsPayload, statusPayload] = await Promise.all([
        fetchOperators({ includeInactive: true }),
        fetchSyncStatus().catch(() => null),
      ]);
      setOperators(operatorsPayload.operators || []);
      setSync(statusPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setOperators([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleOperator(operator, isActive) {
    setTogglingId(operator.id);
    setOperators((prev) => prev.map((row) => (row.id === operator.id ? { ...row, isActive } : row)));
    try {
      await setOperatorActive(operator.id, isActive);
      flash(`${isActive ? 'Activated' : 'Paused'} ${operator.name || operator.oprId}`, isActive ? '#4ade80' : '#f87171');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await load();
    } finally {
      setTogglingId('');
    }
  }

  async function forceSync() {
    if (forceSyncing) return;
    setForceSyncing(true);
    try {
      const payload = await forceTimelineRefresh();
      setSync(payload.status || null);
      flash(`Sync complete · ${payload.status?.flightsCached ?? '—'} flights cached`);
    } catch (err) {
      flash(err instanceof Error ? err.message : String(err), '#f87171');
    } finally {
      setForceSyncing(false);
    }
  }

  const healthy = sync ? sync.healthy !== false : null;
  const stats = sync
    ? [
        { label: 'DATA SOURCE', value: sync.source || '—' },
        { label: 'LAST RUN', value: sync.lastRunAt ? `${new Date(sync.lastRunAt).toISOString().slice(11, 16)} UTC · ${timeAgo(sync.lastRunAt)}` : '—' },
        { label: 'FLIGHTS CACHED', value: `${sync.flightsCached ?? 0} flights` },
        { label: 'STORAGE MODE', value: sync.storage || '—' },
        { label: 'POLL INTERVAL', value: `every ${Math.round((sync.pollMs || 0) / 1000)} seconds` },
        { label: 'LAST ERROR', value: sync.lastError || 'none', color: sync.lastError ? t.red : undefined },
      ]
    : [];

  return (
    <div>
      <PageHeader
        title="Operators"
        desc="Manage the Leon operators feeding the wall and keep an eye on sync health."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setAddOpen((v) => !v)}>
            Add operator
          </Button>
        }
      />

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>Sync health</h3>
            {healthy !== null && (
              <StatusPill
                color={healthy ? t.greenDeep : t.red}
                bg={healthy ? t.greenTint : t.redTint}
                dot={healthy ? t.green : t.red}
              >
                {healthy ? 'Healthy' : 'Error'}
              </StatusPill>
            )}
          </div>
          <Button icon="refresh-cw" size="sm" spin={forceSyncing} onClick={forceSync}>
            {forceSyncing ? 'Syncing…' : 'Force sync'}
          </Button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
          {stats.map((stat) => (
            <div key={stat.label} style={{ border: `1px solid ${t.borderInner}`, borderRadius: 11, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: t.faint, marginBottom: 6 }}>{stat.label}</div>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: stat.color || t.ink, overflowWrap: 'anywhere' }}>{stat.value}</div>
            </div>
          ))}
          {!sync && <div style={{ fontSize: 13, color: t.faint }}>Sync status unavailable.</div>}
        </div>
      </Card>

      {addOpen && <AddOperatorForm onSaved={() => { setAddOpen(false); load(); }} onCancel={() => setAddOpen(false)} />}

      <ErrorBanner>{error}</ErrorBanner>

      <TableShell
        columns="1.4fr .8fr 1fr 1fr .9fr"
        header={[
          { label: 'OPERATOR' },
          { label: 'PREFIX' },
          { label: 'LAST SYNC' },
          { label: 'STATUS' },
          { label: 'ACTIVE', align: 'right' },
        ]}
      >
        {loading && <LoadingState>Loading operators…</LoadingState>}
        {!loading && operators.length === 0 && (
          <EmptyState icon="users" title="No operators yet">
            Add a Leon operator to start feeding the wall.
          </EmptyState>
        )}
        {operators.map((operator) => {
          const status = operator.lastSyncStatus === 'error' ? 'error' : operator.isActive ? (operator.lastSyncStatus === 'success' ? 'success' : healthy ? 'success' : 'idle') : 'idle';
          const st = STATUS_MAP[status];
          return (
            <div key={operator.id} style={{ padding: '15px 18px', borderBottom: `1px solid ${t.rowLine}` }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr .8fr 1fr 1fr .9fr', alignItems: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{operator.name || operator.oprId}</div>
                <div style={{ fontFamily: t.mono, fontSize: 14, color: t.body }}>{operator.oprId}</div>
                <div style={{ fontSize: 13.5, color: t.muted }}>
                  {operator.lastSyncAt ? timeAgo(operator.lastSyncAt) : operator.isActive ? timeAgo(sync?.lastRunAt) : 'paused'}
                </div>
                <div>
                  <StatusPill color={st.c} bg={st.b} dot={st.dot}>{st.label}</StatusPill>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: operator.isActive ? t.greenDeep : t.faint }}>
                    {operator.isActive ? 'Active' : 'Paused'}
                  </span>
                  <Toggle
                    on={Boolean(operator.isActive)}
                    disabled={togglingId === operator.id}
                    onToggle={() => toggleOperator(operator, !operator.isActive)}
                  />
                </div>
              </div>
              {operator.lastSyncError && (
                <div style={{ marginTop: 11, fontSize: 13, color: t.redDeep, background: '#fdf0f0', border: '1px solid #f6d8d8', borderRadius: 9, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 9 }}>
                  <Icon name="alert-triangle" size={15} style={{ flexShrink: 0 }} />
                  {operator.lastSyncError}
                </div>
              )}
            </div>
          );
        })}
      </TableShell>
    </div>
  );
}
