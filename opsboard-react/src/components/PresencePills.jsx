import { useEffect, useState } from 'react';
import { fetchPresence } from '../services/timelineApi';
import { subscribeWallStream } from '../services/wallStream';

// Small per-user presence pills (initials + surfaces) shown on both the
// Display ("who's watching") and the Console (your own connection state).
// Driven by /api/presence + the presence.changed SSE broadcast.
export default function PresencePills({ surface = 'display', compact = false }) {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    let mounted = true;
    fetchPresence()
      .then((payload) => mounted && setUsers(payload.users || []))
      .catch(() => {});
    const unsubscribe = subscribeWallStream(
      'presence.changed',
      (event) => setUsers(event.users || []),
      { surface }
    );
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [surface]);

  if (users.length === 0) {
    return compact ? null : <span style={s.none}>no one connected</span>;
  }

  return (
    <div style={s.row} title={users.map((u) => `${u.name} (${u.surfaces.join(', ')})`).join('\n')}>
      {users.slice(0, 6).map((user) => (
        <div key={user.userId} style={s.pill} title={`${user.name}${user.email ? ` · ${user.email}` : ''} · ${user.surfaces.join(', ')}`}>
          <span style={s.dot} />
          <span style={s.initials}>{user.initials}</span>
          {!compact && <span style={s.name}>{(user.name || '').split(' ')[0]}</span>}
        </div>
      ))}
      {users.length > 6 && <span style={s.more}>+{users.length - 6}</span>}
    </div>
  );
}

const s = {
  row: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    background: '#1a2030',
    border: '1px solid #2a395c',
    borderRadius: 999,
    padding: '3px 8px 3px 6px',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: '#34c759',
    boxShadow: '0 0 5px rgba(52,199,89,.7)',
    flexShrink: 0,
  },
  initials: {
    fontFamily: "'IBM Plex Mono',monospace",
    fontSize: 9,
    fontWeight: 700,
    color: '#b8d9ff',
    background: '#223251',
    borderRadius: '50%',
    width: 17,
    height: 17,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  name: { fontSize: 10.5, color: '#8ea1cb', whiteSpace: 'nowrap' },
  more: { fontSize: 10, color: '#6f7fa8' },
  none: { fontSize: 10, color: '#404d6e' },
};
