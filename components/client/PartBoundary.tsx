"use client";

// One broken part of the client's desk must not blank the page (2026-11-13, the portal's twin of the wall app's
// opsboard-react/src/components/ErrorBoundary.jsx). Wrap a card, the frame or a page's body in this: when something
// inside throws while rendering, only that part is replaced by a short message with a Reload button, and the sidebar,
// the header and the other cards keep working. The error goes to the console and, best effort, to the wall server's
// log (POST /digital-wall/api/ui-error, the same report the wall app sends); its text is never shown to the person.
//
//   <PartBoundary where="client/account/grants">…</PartBoundary>
//
// "Reload" re-mounts the part (a fresh render, state reset); if it fails again the message stays. Next's own
// signals (a redirect, a not-found) are not failures: they are thrown on to the router.
import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";

const seen = new Set<string>();
let sent = 0;

function report(where: string, error: unknown, info?: ErrorInfo) {
  const e = error as { name?: unknown; message?: unknown; stack?: unknown } | null;
  const name = String(e?.name || "Error").slice(0, 60);
  const message = String(e?.message || error || "").slice(0, 300);
  const stack = String(e?.stack || "").split("\n").slice(0, 8).join("\n").slice(0, 1600);
  const component = String(info?.componentStack || "").split("\n").filter(Boolean).slice(0, 6).join("\n").slice(0, 800);
  try { console.error(`[ui-error] ${where}: ${name}: ${message}`, error, component); } catch { /* no console */ }
  const key = `${where}|${name}|${message}`;
  if (seen.has(key) || sent >= 20) return;
  seen.add(key); sent += 1;
  try {
    const body = JSON.stringify({ where: where.slice(0, 80), name, message, stack, component, path: window.location.pathname.slice(0, 200) });
    fetch("/digital-wall/api/ui-error", { method: "POST", credentials: "same-origin", keepalive: true, headers: { "content-type": "application/json" }, body }).catch(() => {});
  } catch { /* the report is best effort; the message on the page does not depend on it */ }
}

/** Next's control flow (redirect(), notFound()) travels as a thrown error with a digest: never a failed part. */
function isNextSignal(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND" || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"));
}

// The test's way in (rig/client-ui-check.mjs), the same as the wall app's: a page script sets window.__CW_THROW__ to a
// boundary's `where` (or the start of one) and fires the "cw-throw-probe" event; the part inside that boundary throws
// on its next render. Nothing in the portal sets it. Draws nothing, in every case.
function ThrowProbe({ where }: { where: string }) {
  const [, look] = useState(0);
  useEffect(() => {
    const again = () => look((n) => n + 1);
    window.addEventListener("cw-throw-probe", again);
    return () => window.removeEventListener("cw-throw-probe", again);
  }, []);
  const want = typeof window !== "undefined" ? (window as unknown as { __CW_THROW__?: unknown }).__CW_THROW__ : "";
  if (want && where && where.startsWith(String(want))) throw new Error("boundary probe");
  return null;
}

// keyed wrapper: a new key after Reload re-mounts the children (their state starts again)
function Keyed({ children }: { children: ReactNode }) { return <>{children}</>; }

type Props = { where: string; children: ReactNode; words?: string };

export default class PartBoundary extends Component<Props, { failed: boolean; tries: number }> {
  state = { failed: false, tries: 0 };

  static getDerivedStateFromError(error: unknown) {
    if (isNextSignal(error)) throw error;
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) { report(this.props.where || "client/unnamed", error, info); }

  retry = () => { this.setState((s) => ({ failed: false, tries: s.tries + 1 })); };

  render() {
    if (!this.state.failed) return <Keyed key={this.state.tries}><ThrowProbe where={this.props.where} />{this.props.children}</Keyed>;
    return (
      <div className="clw-part-failed" role="alert" data-part-failed={this.props.where}>
        <span>{this.props.words ?? "This part failed."}</span>
        <button type="button" className="clw-btn" onClick={this.retry} data-part-reload="">Reload</button>
      </div>
    );
  }
}
