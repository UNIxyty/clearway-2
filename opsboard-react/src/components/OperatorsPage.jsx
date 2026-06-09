import { useEffect, useState } from 'react';
import { fetchOperators, setOperatorActive, upsertOperator } from '../services/timelineApi';

const INITIAL_FORM = {
  name: '',
  oprId: '',
  refreshToken: '',
};

export default function OperatorsPage() {
  const [operators, setOperators] = useState([]);
  const [form, setForm] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const payload = await fetchOperators({ includeInactive: true });
      setOperators(payload.operators || []);
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
      await upsertOperator({
        name: form.name,
        oprId: form.oprId,
        refreshToken: form.refreshToken,
        isActive: true,
      });
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
    try {
      await setOperatorActive(operator.id, isActive);
      setOperators((prev) =>
        prev.map((row) => (row.id === operator.id ? { ...row, isActive } : row))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTogglingId('');
    }
  }

  return (
    <div style={s.page}>
      <div style={s.top}>
        <h2 style={s.title}>Operators</h2>
        <button style={s.btn} onClick={load} disabled={loading || saving}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <form style={s.form} onSubmit={submit}>
        <input
          style={s.input}
          placeholder="Operator name (optional)"
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
        />
        <input
          style={s.input}
          placeholder="OPS ID (e.g. your leon prefix)"
          value={form.oprId}
          onChange={(e) => setForm((prev) => ({ ...prev, oprId: e.target.value }))}
          required
        />
        <input
          style={s.input}
          type="password"
          autoComplete="new-password"
          placeholder="Refresh token"
          value={form.refreshToken}
          onChange={(e) => setForm((prev) => ({ ...prev, refreshToken: e.target.value }))}
          required
        />
        <button style={s.btn} type="submit" disabled={saving || loading}>
          {saving ? 'Saving...' : 'Add / Update Operator'}
        </button>
      </form>

      {error && <div style={s.error}>{error}</div>}

      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>OPS ID</th>
              <th style={s.th}>Name</th>
              <th style={s.th}>Token Saved</th>
              <th style={s.th}>Active</th>
            </tr>
          </thead>
          <tbody>
            {operators.map((row) => (
              <tr key={row.id}>
                <td style={s.td}>{row.oprId}</td>
                <td style={s.td}>{row.name || '-'}</td>
                <td style={s.td}>{row.hasRefreshToken ? 'Yes' : 'No'}</td>
                <td style={s.td}>
                  <div style={s.toggleWrap}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(row.isActive)}
                      style={{
                        ...s.switch,
                        ...(row.isActive ? s.switchOn : s.switchOff),
                      }}
                      disabled={togglingId === row.id || loading}
                      onClick={() => toggleOperator(row, !row.isActive)}
                    >
                      <span
                        style={{
                          ...s.switchKnob,
                          transform: row.isActive ? 'translateX(16px)' : 'translateX(0)',
                        }}
                      />
                    </button>
                    <span>{row.isActive ? 'Enabled' : 'Disabled'}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const s = {
  page: { height: '100%', overflow: 'auto', padding: 14, background: '#151a27' },
  top: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 14, color: '#e8ebf5' },
  form: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1.6fr auto',
    gap: 8,
    marginBottom: 10,
  },
  input: {
    border: '1px solid #2a395c',
    borderRadius: 6,
    padding: '7px 9px',
    fontSize: 12,
    color: '#e8ebf5',
    background: '#111626',
    outline: 'none',
  },
  btn: {
    fontSize: 11,
    color: '#d8e6ff',
    background: '#1f2a43',
    border: '1px solid #2a395c',
    borderRadius: 6,
    padding: '4px 10px',
    cursor: 'pointer',
  },
  error: { color: '#ef9a9a', marginBottom: 8, fontSize: 11 },
  tableWrap: { border: '1px solid #222840', borderRadius: 8, overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: {
    textAlign: 'left',
    padding: '8px 10px',
    color: '#6f7fa8',
    background: '#121726',
    borderBottom: '1px solid #222840',
  },
  td: { padding: '8px 10px', color: '#c9d5f0', borderBottom: '1px solid #1f2539' },
  toggleWrap: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
  },
  switch: {
    width: 36,
    height: 20,
    borderRadius: 999,
    border: '1px solid transparent',
    padding: 1,
    position: 'relative',
    cursor: 'pointer',
    transition: 'background .18s, border-color .18s',
  },
  switchOn: {
    background: '#34c759',
    borderColor: 'rgba(52,199,89,.45)',
  },
  switchOff: {
    background: '#2b3348',
    borderColor: '#3b4969',
  },
  switchKnob: {
    display: 'block',
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: '#fff',
    boxShadow: '0 1px 2px rgba(0,0,0,.35)',
    transition: 'transform .18s',
  },
};
