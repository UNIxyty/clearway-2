import { createContext, useContext, useEffect, useState } from 'react';
import { fetchCurrentUser } from './services/timelineApi';

const AuthContext = createContext({ user: null, authEnabled: false });

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

/**
 * Gates both surfaces behind the shared Clearway sign-in. The display keeps
 * rendering through transient backend errors (it only blocks on an explicit
 * 401), so a flaky auth service can't take the wall down.
 */
export default function AuthGate({ children }) {
  const [state, setState] = useState({ phase: 'loading', user: null, authEnabled: false });

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const result = await fetchCurrentUser();
      if (cancelled) return;
      if (result.status === 'ok') {
        setState({ phase: 'ready', user: result.user, authEnabled: result.authEnabled });
      } else if (result.status === 'unauthorized') {
        setState({ phase: 'unauthorized', user: null, authEnabled: true });
      } else {
        // Backend unreachable: degrade to rendering; data calls surface errors.
        setState({ phase: 'ready', user: null, authEnabled: false });
      }
    }

    check();
    const id = setInterval(check, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (state.phase === 'loading') {
    return <div style={s.center}>Checking session…</div>;
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
    <AuthContext.Provider value={{ user: state.user, authEnabled: state.authEnabled }}>
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
