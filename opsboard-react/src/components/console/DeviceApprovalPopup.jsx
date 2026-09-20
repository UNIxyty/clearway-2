import { useEffect, useState } from 'react';
import { approveAuthDevice, fetchAuthDevices } from '../../services/timelineApi';
import { subscribeWallStream } from '../../services/wallStream';
import { Button, MonoChip, t, TextInput, useToast } from './ui';

// Bug report 6 item 7 follow-up: an iCloud-style approval popup. When a
// screen announces itself, this card slides in on WHATEVER console page is
// open, so approving doesn't require knowing about Settings → Devices (that
// card stays as the management home — rename/revoke/audit live there).
// "Not now" hides that request for this session; it reappears if the screen
// asks again with a fresh code.

function timeAgoShort(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

export default function DeviceApprovalPopup() {
  const [pending, setPending] = useState([]);
  const [dismissed, setDismissed] = useState(() => new Set()); // deviceId+code pairs
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const flash = useToast();

  useEffect(() => {
    const load = () =>
      fetchAuthDevices()
        .then((payload) => setPending((payload.devices || []).filter((d) => d.status === 'pending')))
        .catch(() => {}); // no console rights / transient — just no popup
    load();
    return subscribeWallStream('devices.changed', load, { surface: 'console' });
  }, []);

  // A dismissed request stays hidden only for ITS code — if the request
  // expires and the screen asks again, the new code pops up again.
  const current = pending.find((d) => !dismissed.has(`${d.deviceId}:${d.code}`)) || null;
  if (!current) return null;

  return (
    <div
      className="cw-fade"
      style={{
        position: 'fixed',
        right: 22,
        bottom: 22,
        zIndex: 120,
        width: 340,
        background: t.card,
        border: `1px solid ${t.border}`,
        borderRadius: 14,
        boxShadow: '0 18px 48px rgba(16,18,22,.22)',
        padding: '16px 18px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            background: '#fdf7e7',
            border: '1px solid #e8c56a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            flex: 'none',
          }}
        >
          🖥
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: t.ink }}>Screen requesting access</div>
          <div style={{ fontSize: 11.5, color: t.faint }}>
            asked {timeAgoShort(current.createdAt)}
            {pending.length > 1 ? ` · ${pending.length - 1} more waiting` : ''}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 22, fontWeight: 800, letterSpacing: 5, color: t.ink }}>
          {current.code}
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: t.muted, lineHeight: 1.5, marginBottom: 10 }}>
        A display is waiting to join the Digital Wall. Approve it only if this code is on that
        screen right now. It gets read-only access to wall data.
      </div>
      <div style={{ fontSize: 11, color: t.faint, marginBottom: 10 }}>
        Screen ID <MonoChip>{current.deviceId}</MonoChip>
      </div>
      {error && <div style={{ fontSize: 12, color: '#b3372f', marginBottom: 8 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. Ops room wall)"
          style={{ flex: 1, minWidth: 0 }}
        />
        <Button
          variant="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await approveAuthDevice(current.deviceId, name);
              flash('Screen approved — it comes to life in a few seconds');
              setName('');
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
            setBusy(false);
          }}
        >
          Approve
        </Button>
        <Button
          variant="soft"
          onClick={() => setDismissed((prev) => new Set(prev).add(`${current.deviceId}:${current.code}`))}
        >
          Not now
        </Button>
      </div>
    </div>
  );
}
