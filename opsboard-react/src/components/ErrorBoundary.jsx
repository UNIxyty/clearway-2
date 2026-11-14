import { Component, useEffect, useState } from 'react';
import { reportUiError } from '../services/uiError';

/**
 * One broken part must not take the app down (2026-11-12: a missing prop on the passengers sheet blanked the whole
 * phone app, because nothing caught the render error). Wrap a tab, a flight panel or a sheet in this: when something
 * inside throws while rendering, only that part is replaced by a small "This part failed. Reload" message and the rest
 * keeps working. The error goes to services/uiError.js (console + the wall server's log); its text is never shown.
 *
 *   <ErrorBoundary where="console/limits">…</ErrorBoundary>            the small message, with a Reload button
 *   <ErrorBoundary where="…" resetKey={flightId}>…</ErrorBoundary>     a new resetKey clears the failure (another flight)
 *   <ErrorBoundary where="…" fallback={(retry) => <Mine onRetry={retry} />}>   your own fallback
 *   <ErrorBoundary where="…" onError={fn}>                              told about the failure
 *   <ErrorBoundary where="…" autoRetry>                                 tries again on its own: after 5 s, 15 s, 60 s,
 *                                                                       then every 60 s (the ops room display, where
 *                                                                       nobody can tap Reload). autoRetry={[ms, …]}
 *                                                                       sets other waits; the last one repeats.
 *
 * "Reload" re-mounts the part (a fresh render, state reset). If it fails again the message simply stays.
 * The message styles itself with inherited colours only (currentColor, no token), so it reads on the dark wall, in the
 * console, in the client's frame and in the phone app alike.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false, tries: 0 };
    this.retry = this.retry.bind(this);
    this.attempt = 0;       // autoRetry: how many times in a row it has failed (picks the wait)
    this.retryTimer = null; // autoRetry: the next try
    this.calmTimer = null;  // autoRetry: a try that holds for CALM_MS starts the waits from 5 s again
  }

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error, info) {
    reportUiError(this.props.where || 'unnamed', error, info);
    if (typeof this.props.onError === 'function') { try { this.props.onError(error); } catch { /* the handler's own problem */ } }
    this.scheduleRetry();
  }

  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey) {
      this.clearTimers(); this.attempt = 0;
      if (this.state.failed) this.setState({ failed: false });
    }
  }

  componentWillUnmount() { this.clearTimers(); }

  clearTimers() { clearTimeout(this.retryTimer); clearTimeout(this.calmTimer); this.retryTimer = null; this.calmTimer = null; }

  scheduleRetry() {
    if (!this.props.autoRetry) return;
    this.clearTimers();
    const waits = Array.isArray(this.props.autoRetry) && this.props.autoRetry.length ? this.props.autoRetry : RETRY_WAITS_MS;
    const wait = Number(waits[Math.min(this.attempt, waits.length - 1)]) || RETRY_WAITS_MS[RETRY_WAITS_MS.length - 1];
    this.attempt += 1;
    this.retryTimer = setTimeout(this.retry, wait);
  }

  retry() {
    this.clearTimers();
    this.setState((s) => ({ failed: false, tries: s.tries + 1 }));
    // a try that fails again lands in componentDidCatch (which clears this); one that holds starts the waits over
    if (this.props.autoRetry) this.calmTimer = setTimeout(() => { if (!this.state.failed) this.attempt = 0; }, CALM_MS);
  }

  render() {
    if (!this.state.failed) return <FragmentKey key={this.state.tries}><ThrowProbe where={this.props.where} />{this.props.children}</FragmentKey>;
    if (typeof this.props.fallback === 'function') return this.props.fallback(this.retry);
    if (this.props.fallback !== undefined) return this.props.fallback;
    return <PartFailed onRetry={this.retry} compact={this.props.compact} />;
  }
}

// autoRetry waits: 5 s, 15 s, 60 s, then every 60 s. A try that holds for CALM_MS counts as recovered.
export const RETRY_WAITS_MS = [5000, 15000, 60000];
const CALM_MS = 30000;

// The test's way in (rig/error-boundary-check.mjs): a page script sets window.__CW_THROW__ to a boundary's `where`
// (or the start of one) and the part inside that boundary throws on its next render. Nothing in the app sets it.
// The test can also ask for that next render now: window.dispatchEvent(new Event('cw-throw-probe')) after setting the
// flag (a part that is already drawn and has no reason to draw again would otherwise never notice the flag).
// Draws nothing, in every case.
function ThrowProbe({ where }) {
  const [, look] = useState(0);
  useEffect(() => {
    const again = () => look((n) => n + 1);
    window.addEventListener('cw-throw-probe', again);
    return () => window.removeEventListener('cw-throw-probe', again);
  }, []);
  const want = typeof window !== 'undefined' ? window.__CW_THROW__ : '';
  if (want && where && String(where).startsWith(String(want))) throw new Error('boundary probe');
  return null;
}

// keyed wrapper: a new key after Reload re-mounts the children (their state starts again)
function FragmentKey({ children }) { return children; }

export function PartFailed({ onRetry, compact = false, words = 'This part failed.' }) {
  return (
    <div role="alert" data-part-failed="" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: compact ? '8px 12px' : '16px', margin: compact ? 0 : 8,
      border: '1px solid currentColor', borderRadius: 8, color: 'inherit', font: 'inherit', fontSize: 14, lineHeight: 1.4, opacity: 0.92, minWidth: 0 }}>
      <span style={{ minWidth: 0 }}>{words}</span>
      <button type="button" data-part-reload="" onClick={onRetry}
        style={{ minHeight: 44, minWidth: 44, padding: '0 16px', borderRadius: 8, border: '1px solid currentColor', background: 'transparent', color: 'inherit', font: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer', touchAction: 'manipulation' }}>
        Reload
      </button>
    </div>
  );
}
