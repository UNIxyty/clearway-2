// Shared styling for all Display Console pages — one look for headers,
// forms, tables, cards, chips, switches, and status states.

export const ui = {
  page: { height: '100%', overflow: 'auto', padding: 16, background: '#0f1420' },
  top: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10 },
  title: { fontSize: 15, color: '#e8ebf5', fontWeight: 600 },
  subtitle: { fontSize: 11, color: '#6f7fa8', marginTop: 2 },

  btn: {
    fontSize: 11.5,
    color: '#d8e6ff',
    background: '#1f2a43',
    border: '1px solid #2a395c',
    borderRadius: 6,
    padding: '6px 12px',
    cursor: 'pointer',
  },
  btnPrimary: {
    fontSize: 11.5,
    color: '#eaf3ff',
    background: '#2a4a86',
    border: '1px solid #41639e',
    borderRadius: 6,
    padding: '6px 12px',
    cursor: 'pointer',
  },
  btnDanger: {
    fontSize: 11.5,
    color: '#ef9a9a',
    background: '#1a243b',
    border: '1px solid rgba(239,106,106,.3)',
    borderRadius: 6,
    padding: '6px 12px',
    cursor: 'pointer',
  },
  softBtn: {
    fontSize: 11,
    color: '#cfe0ff',
    background: '#1a243b',
    border: '1px solid #2f446e',
    borderRadius: 6,
    padding: '4px 8px',
    cursor: 'pointer',
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
  select: {
    border: '1px solid #2a395c',
    borderRadius: 6,
    padding: '7px 9px',
    fontSize: 12,
    color: '#e8ebf5',
    background: '#111626',
  },

  error: {
    color: '#ef9a9a',
    marginBottom: 10,
    fontSize: 11.5,
    background: 'rgba(239,106,106,.08)',
    border: '1px solid rgba(239,106,106,.25)',
    borderRadius: 6,
    padding: '7px 10px',
  },
  success: {
    color: '#8fdcae',
    marginBottom: 10,
    fontSize: 11.5,
    background: 'rgba(58,165,122,.08)',
    border: '1px solid rgba(58,165,122,.25)',
    borderRadius: 6,
    padding: '7px 10px',
  },
  empty: { color: '#6f7fa8', fontSize: 12, padding: '18px 0', textAlign: 'center' },
  loading: { color: '#6f7fa8', fontSize: 12, padding: '18px 0', textAlign: 'center' },

  tableWrap: { border: '1px solid #222840', borderRadius: 8, overflow: 'hidden', background: '#111626' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: {
    textAlign: 'left',
    padding: '9px 12px',
    color: '#6f7fa8',
    background: '#121726',
    borderBottom: '1px solid #222840',
    fontWeight: 600,
    fontSize: 11,
    letterSpacing: '.4px',
  },
  td: { padding: '9px 12px', color: '#c9d5f0', borderBottom: '1px solid #1f2539' },

  card: { border: '1px solid #222840', borderRadius: 8, padding: 12, background: '#111626' },
  cardTitle: { color: '#dfe7fc', fontSize: 12.5, marginBottom: 6, fontWeight: 600 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 10 },

  chip: {
    border: '1px solid #2c3f66',
    borderRadius: 999,
    padding: '2px 8px',
    background: '#172037',
    color: '#b5c8eb',
    fontSize: 11,
    cursor: 'pointer',
  },
  tag: {
    fontSize: 10,
    color: '#9db3dd',
    background: '#1a2236',
    border: '1px solid #263654',
    borderRadius: 999,
    padding: '1px 6px',
  },

  resultList: {
    marginTop: 6,
    border: '1px solid #243257',
    borderRadius: 6,
    overflow: 'hidden',
    maxHeight: 180,
    overflowY: 'auto',
    position: 'relative',
    zIndex: 5,
  },
  resultItem: {
    width: '100%',
    textAlign: 'left',
    border: 'none',
    borderBottom: '1px solid #1c2438',
    background: '#0f1524',
    color: '#d2ddf5',
    padding: '7px 8px',
    cursor: 'pointer',
    fontSize: 11,
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
  switchOn: { background: '#34c759', borderColor: 'rgba(52,199,89,.45)' },
  switchOff: { background: '#2b3348', borderColor: '#3b4969' },
  switchKnob: {
    display: 'block',
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: '#fff',
    boxShadow: '0 1px 2px rgba(0,0,0,.35)',
    transition: 'transform .18s',
  },
  toggleWrap: { display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12 },
};

export function Switch({ on, disabled, onToggle, labels = ['Enabled', 'Disabled'] }) {
  return (
    <div style={ui.toggleWrap}>
      <button
        type="button"
        role="switch"
        aria-checked={Boolean(on)}
        style={{ ...ui.switch, ...(on ? ui.switchOn : ui.switchOff) }}
        disabled={disabled}
        onClick={onToggle}
      >
        <span
          style={{ ...ui.switchKnob, transform: on ? 'translateX(16px)' : 'translateX(0)' }}
        />
      </button>
      <span>{on ? labels[0] : labels[1]}</span>
    </div>
  );
}
