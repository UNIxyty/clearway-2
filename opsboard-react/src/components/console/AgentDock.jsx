import { t } from './ui';

/** Pinned "Ops Agent ⌘J" row for the deep-context sidebar (§5). */
export function AgentNavRow({ collapsed, open, onClick }) {
  return (
    <button
      type="button"
      title="Ops Agent · ⌘J"
      onClick={onClick}
      style={{
        fontFamily: 'inherit', width: '100%', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 8,
        margin: '0 0 12px', padding: collapsed ? '8px 0' : '8px 10px', borderRadius: 9, border: 'none', cursor: 'pointer',
        background: '#eef4ff', color: '#1d4ed8', fontSize: 13, fontWeight: 600,
      }}
    >
      <span aria-hidden style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #1d4ed8', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#1d4ed8' }} />
      </span>
      {!collapsed && <span style={{ flex: 1, textAlign: 'left' }}>{open ? 'Ops Agent · open' : 'Ops Agent'}</span>}
      {!collapsed && <span style={{ fontFamily: t.mono, fontSize: 10.5, fontWeight: 600, color: '#1d4ed8', background: '#fff', border: '1px solid #b9d0ff', borderRadius: 5, padding: '1px 5px' }}>⌘J</span>}
    </button>
  );
}
