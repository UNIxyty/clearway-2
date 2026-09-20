import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { fetchCurrentUser } from './services/timelineApi';
import {
  announceThisDevice,
  clearDeviceToken,
  fetchThisDeviceState,
  getDeviceToken,
  installDeviceFetch,
  setDeviceToken,
} from './services/deviceAuth';
import { getDeviceId } from './services/device';
import { resetWallStream, subscribeWallStream } from './services/wallStream';

const AuthContext = createContext({ user: null, authEnabled: false, deviceMode: false });

export function useAuth() {
  return useContext(AuthContext);
}

/**
 * Builds the portal sign-in URL with a `next` parameter pointing back at the
 * page the user is on right now (path + query + hash), so after signing in
 * they land exactly where they started — including when a session expires
 * mid-use and this gate re-appears on the current view. The path is read at
 * render time, is same-origin by construction, and the portal re-validates
 * it server-side (lib/auth-next-path.mjs) before honouring it.
 */
function loginHref() {
  const here = window.location.pathname + window.location.search + window.location.hash;
  return `/login?next=${encodeURIComponent(here)}`;
}

const DEVICE_POLL_PENDING_MS = 5_000; // waiting for approval: keep the code fresh
const DEVICE_POLL_APPROVED_MS = 60_000; // running on a device token: watch for revoke

/**
 * Gates both surfaces behind the shared Clearway sign-in. The display keeps
 * rendering through transient backend errors (it only blocks on an explicit
 * 401), so a flaky auth service can't take the wall down.
 *
 * Bug report 6 item 7: the DISPLAY surface additionally supports a device
 * identity. With no user session, the wall announces itself and shows a
 * neutral "waiting to be approved" screen with a short pairing code; the
 * approval prompt (with the same code) appears in the console's Settings →
 * Devices. Approval delivers a long-lived read-only token, so the wall no
 * longer depends on a person's session that expires overnight. Revoking the
 * device from the console drops it back to this waiting screen.
 */
export default function AuthGate({ surface = 'display', children }) {
  const isDisplay = surface !== 'console';
  // Device tokens are only ever attached on the display surface; the console
  // must always be a real person.
  if (isDisplay) installDeviceFetch();

  const [state, setState] = useState({ phase: 'loading', user: null, authEnabled: false, deviceMode: false });
  const [pairing, setPairing] = useState({ code: '', error: '' });
  const deviceModeRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function enterDeviceFlow() {
      // Holding a token? Confirm we're still approved and keep rendering.
      if (getDeviceToken()) {
        try {
          const ds = await fetchThisDeviceState();
          if (cancelled) return;
          if (ds.status === 'approved') {
            deviceModeRef.current = true;
            setState({ phase: 'ready', user: null, authEnabled: true, deviceMode: true });
            return;
          }
          clearDeviceToken(); // revoked or forgotten server-side
        } catch {
          // Backend unreachable: keep rendering on the token we hold — the
          // wall must not blank because the auth check had a bad moment.
          if (deviceModeRef.current) return;
          setState({ phase: 'ready', user: null, authEnabled: true, deviceMode: true });
          deviceModeRef.current = true;
          return;
        }
      }
      // No (valid) token: announce and wait for the console to approve.
      deviceModeRef.current = false;
      try {
        const out = await announceThisDevice();
        if (cancelled) return;
        if (out.status === 'approved') {
          // Approved earlier but our token is gone (cleared storage): the
          // server will not re-issue — ops must revoke + re-approve. Say so.
          setPairing({ code: '', error: 'This screen was approved before, but its key is gone. Revoke it in Console → Settings → Devices, then it will re-request access.' });
        } else {
          setPairing({ code: out.code || '', error: '' });
        }
      } catch (err) {
        if (cancelled) return;
        setPairing({ code: '', error: err instanceof Error ? err.message : String(err) });
      }
      setState({ phase: 'device-wait', user: null, authEnabled: true, deviceMode: false });
    }

    async function check() {
      const result = await fetchCurrentUser();
      if (cancelled) return;
      if (result.status === 'ok') {
        deviceModeRef.current = false;
        setState({ phase: 'ready', user: result.user, authEnabled: result.authEnabled, deviceMode: false });
      } else if (result.status === 'unauthorized') {
        if (isDisplay) {
          await enterDeviceFlow();
        } else {
          setState({ phase: 'unauthorized', user: null, authEnabled: true, deviceMode: false });
        }
      } else {
        // Backend unreachable: degrade to rendering; data calls surface errors.
        setState({ phase: 'ready', user: null, authEnabled: false, deviceMode: deviceModeRef.current });
      }
    }

    check();
    const id = setInterval(check, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isDisplay]);

  // Waiting for approval: poll fast; the token arrives in the state payload
  // exactly once, the moment someone approves us on the console.
  useEffect(() => {
    if (state.phase !== 'device-wait') return undefined;
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const ds = await fetchThisDeviceState();
        if (cancelled) return;
        if (ds.status === 'approved' && ds.token) {
          setDeviceToken(ds.token);
          resetWallStream(); // next stream connect must carry the new token
          deviceModeRef.current = true;
          setState({ phase: 'ready', user: null, authEnabled: true, deviceMode: true });
        } else if (ds.status === 'pending' && ds.code) {
          setPairing((p) => (p.code === ds.code ? p : { code: ds.code, error: '' }));
        } else if (ds.status === 'unknown') {
          // Our pending request expired — ask again for a fresh code.
          const out = await announceThisDevice().catch(() => null);
          if (!cancelled && out?.status === 'pending') setPairing({ code: out.code || '', error: '' });
        }
      } catch {
        /* transient; keep waiting */
      }
    }, DEVICE_POLL_PENDING_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [state.phase]);

  // Running as a device: watch for revocation so the wall stops promptly —
  // the server also kills our SSE streams the moment we're revoked, this
  // poll is the belt to that suspender.
  useEffect(() => {
    if (!(state.phase === 'ready' && state.deviceMode)) return undefined;
    let cancelled = false;
    const backToPairing = async () => {
      if (cancelled) return;
      clearDeviceToken();
      resetWallStream();
      deviceModeRef.current = false;
      try {
        const out = await announceThisDevice();
        if (!cancelled) setPairing({ code: out.code || '', error: '' });
      } catch {
        if (!cancelled) setPairing({ code: '', error: '' });
      }
      if (!cancelled) setState({ phase: 'device-wait', user: null, authEnabled: true, deviceMode: false });
    };
    // Instant path: the server pushes device.revoked down our own stream
    // just before closing it.
    const unsubscribe = subscribeWallStream('device.revoked', (event) => {
      if (!event.deviceId || event.deviceId === getDeviceId()) backToPairing();
    });
    const id = setInterval(async () => {
      try {
        const ds = await fetchThisDeviceState();
        if (cancelled) return;
        if (ds.status === 'revoked' || ds.status === 'unknown') {
          backToPairing();
        }
      } catch {
        /* transient; keep rendering */
      }
    }, DEVICE_POLL_APPROVED_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      unsubscribe();
    };
  }, [state.phase, state.deviceMode]);

  if (state.phase === 'loading') {
    return <div style={s.center}>Checking session…</div>;
  }

  if (state.phase === 'device-wait') {
    // Neutral by design: no data, no hints about what the wall shows — just
    // enough for someone in the room to complete the approval on the console.
    return (
      <div style={s.center}>
        <div style={s.card}>
          <div style={s.title}>Waiting to be approved</div>
          <div style={s.text}>
            This screen has asked to join the Digital Wall. Approve it from the
            Console under Settings → Devices, where this code is shown:
          </div>
          {pairing.code ? <div style={s.code}>{pairing.code}</div> : null}
          {pairing.error ? <div style={s.err}>{pairing.error}</div> : null}
          <div style={s.hint}>Screen ID {getDeviceId()}</div>
          <a style={s.btn} href={loginHref()}>…or sign in as a user instead</a>
        </div>
      </div>
    );
  }

  if (state.phase === 'unauthorized') {
    return (
      <div style={s.center}>
        <div style={s.card}>
          <div style={s.title}>Sign in required</div>
          <div style={s.text}>
            The Digital Wall is available to signed-in Clearway users only.
            Sign in through the main portal — you will be returned to this page.
          </div>
          <a style={s.btn} href={loginHref()}>Go to Clearway sign-in</a>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user: state.user, authEnabled: state.authEnabled, deviceMode: state.deviceMode }}>
      {children}
    </AuthContext.Provider>
  );
}

const s = {
  center: {
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0f1420',
    color: '#8090b8',
    fontSize: 13,
  },
  card: {
    background: '#151a27',
    border: '1px solid #222840',
    borderRadius: 10,
    padding: '26px 30px',
    maxWidth: 380,
    textAlign: 'center',
  },
  title: { color: '#e8ebf5', fontSize: 16, fontWeight: 600, marginBottom: 10 },
  text: { color: '#8090b8', fontSize: 12.5, lineHeight: 1.6, marginBottom: 18 },
  code: {
    color: '#e8ebf5',
    fontSize: 34,
    fontWeight: 700,
    letterSpacing: 10,
    padding: '10px 0 16px',
  },
  err: { color: '#e08b8b', fontSize: 12, lineHeight: 1.5, marginBottom: 12 },
  hint: { color: '#4d5a7d', fontSize: 10.5, marginBottom: 16 },
  btn: {
    display: 'inline-block',
    fontSize: 12,
    color: '#d8e6ff',
    background: '#1f2a43',
    border: '1px solid #2a395c',
    borderRadius: 6,
    padding: '8px 16px',
    textDecoration: 'none',
  },
};
