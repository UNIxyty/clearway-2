import { useEffect, useState } from 'react';
import {
  fetchOperators,
  fetchSyncStatus,
  forceTimelineRefresh,
  setOperatorActive,
  upsertOperator,
} from '../../services/timelineApi';
import { ui, Switch } from './ui';

const INITIAL_FORM = { name: '', oprId: '', refreshToken: '' };

function fmtTime(value) {
  if (!value) return '—';
  const dt = new Date(value);
  return Number.isFinite(dt.getTime()) ? dt.toISOString().replace('T', ' ').slice(0, 19) + 'Z' : '—';
}

export default function OperatorsPage() {
  const [operators, setOperators] = useState([]);
  const [syncStatus, setSyncStatus] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [togglingId, setTogglingId] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [operatorsPayload, statusPayload] = await Promise.all([
        fetchOperators({ includeInactive: true }),
        fetchSyncStatus().catch(() => null),
      ]);
      setOperators(operatorsPayload.operators || []);
      setSyncStatus(statusPayload);
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

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await upsertOperator({ ...form, isActive: true });
      setForm(INITIAL_FORM);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleOperator(operator, isActive) {
    setError('');
    setTogglingId(operator.id);
    // Optimistic update; reload reconciles on failure.
    setOperators((prev) => prev.map((row) => (row.id === operator.id ? { ...row, isActive } : row)));
    try {
      await setOperatorActive(operator.id, isActive);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await load();
    } finally {
      setTogglingId('');
    }
  }

  async function forceSync() {
    setSyncing(true);
    setError('');
    try {
      const payload = await forceTimelineRefresh();
      setSyncStatus(payload.status || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  }

  const healthy = syncStatus?.healthy !== false;

  return (
    <div style={ui.page}>
      <div style={ui.top}>
        <div>
          <div style={ui.title}>Operators</div>
          <div style={ui.subtitle}>Leon operators feeding the wall. Refresh tokens are write-only and encrypted at rest.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={ui.btn} onClick={forceSync} disabled={syncing || loading}>
            {syncing ? 'Syncing…' : 'Force sync now'}
          </button>
          <button style={ui.btn} onClick={load} disabled={loading || saving}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {syncStatus && (
        <div style={{ ...ui.card, marginBottom: 12, display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: healthy ? '#8fdcae' : '#ef9a9a', fontWeight: 600 }}>
            {healthy ? '● Sync healthy' : '● Sync error'}
          </span>
          <span style={s.stat}>Source: <b>{syncStatus.source}</b></span>
          <span style={s.stat}>Last run: <b>{fmtTime(syncStatus.lastRunAt)}</b></span>
          <span style={s.stat}>Flights cached: <b>{syncStatus.flightsCached ?? 0}</b></span>
          <span style={s.stat}>Operators synced: <b>{syncStatus.operatorsSynced ?? 0}</b></span>
          <span style={s.stat}>Poll: <b>{Math.round((syncStatus.pollMs || 0) / 1000)}s</b></span>
          <span style={s.stat}>Storage: <b>{syncStatus.storage}</b></span>
          {syncStatus.lastError && (
            <span style={{ fontSize: 11, color: '#ef9a9a', width: '100%' }}>Last error: {syncStatus.lastError}</span>
          )}
        </div>
      )}

      <form style={s.form} onSubmit={submit}>
        <input
          style={ui.input}
          placeholder="Operator name (optional)"
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
        />
        <input
          style={ui.input}
          placeholder="Leon prefix / OPS ID"
          value={form.oprId}
          onChange={(e) => setForm((prev) => ({ ...prev, oprId: e.target.value }))}
          required
        />
        <input
          style={ui.input}
          type="password"
          autoComplete="new-password"
          placeholder="Refresh token (never displayed again)"
          value={form.refreshToken}
          onChange={(e) => setForm((prev) => ({ ...prev, refreshToken: e.target.value }))}
          required
        />
        <button style={ui.btnPrimary} type="submit" disabled={saving || loading}>
          {saving ? 'Saving…' : 'Add / Update'}
        </button>
      </form>

      {error && <div style={ui.error}>{error}</div>}

      <div style={ui.tableWrap}>
        <table style={ui.table}>
          <thead>
            <tr>
              <th style={ui.th}>OPS ID</th>
              <th style={ui.th}>Name</th>
              <th style={ui.th}>Token</th>
              <th style={ui.th}>Last sync</th>
              <th style={ui.th}>Status</th>
              <th style={ui.th}>Active</th>
            </tr>
          </thead>
          <tbody>
            {operators.map((row) => (
              <tr key={row.id}>
                <td style={{ ...ui.td, fontFamily: "'IBM Plex Mono',monospace" }}>{row.oprId}</td>
                <td style={ui.td}>{row.name || '—'}</td>
                <td style={ui.td}>{row.hasRefreshToken ? 'Saved ✓' : 'Missing'}</td>
                <td style={ui.td}>{fmtTime(row.lastSyncAt)}</td>
                <td style={ui.td}>
                  <span style={{
                    ...ui.tag,
                    color: row.lastSyncStatus === 'error' ? '#ef9a9a' : row.lastSyncStatus === 'success' ? '#8fdcae' : '#9db3dd',
                  }}>
                    {row.lastSyncStatus || 'idle'}
                  </span>
                  {row.lastSyncError && (
                    <div style={{ fontSize: 10, color: '#ef9a9a', marginTop: 3 }}>{row.lastSyncError}</div>
                  )}
                </td>
                <td style={ui.td}>
                  <Switch
                    on={Boolean(row.isActive)}
                    disabled={togglingId === row.id || loading}
                    onToggle={() => toggleOperator(row, !row.isActive)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && operators.length === 0 && <div style={ui.empty}>No operators configured yet.</div>}
        {loading && <div style={ui.loading}>Loading operators…</div>}
      </div>
    </div>
  );
}

const s = {
  form: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1.6fr auto',
    gap: 8,
    marginBottom: 12,
  },
  stat: { fontSize: 11.5, color: '#8ea1cb' },
};
