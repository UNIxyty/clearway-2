"use client";

// Leon access (passenger manifest). The manifest is read from Leon with YOUR Leon account — never a service account
// — so if you cannot see a flight in Leon, you cannot make its manifest. Link one Leon API refresh token per operator
// tenant you work in (Leon → Settings → API → Refresh tokens). The token is checked against Leon, stored encrypted on
// the agent service, and never shown again; unlink removes it.
import { useEffect, useState } from "react";
import { C, mono } from "../ui/tokens";
import { Button, Eyebrow } from "../ui/primitives";
import { AGENT_BASE } from "../types";

type Link = { oprId: string; linkedAt: string | null };
const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" } as const;
const field = { fontFamily: "inherit", fontSize: 13.5, color: C.ink, background: C.surface, border: `1px solid ${C.borderControl}`, borderRadius: 8, padding: "7px 10px", outline: "none" } as const;

export function LeonAccessSettings() {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [oprId, setOprId] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const call = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(`${AGENT_BASE}${path}`, { credentials: "same-origin", ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
    const b = await r.json().catch(() => null);
    return { ok: r.ok && b?.ok !== false, body: b };
  };
  useEffect(() => { void call("/api/leon/links").then(({ ok, body }) => setLinks(ok ? body.links : [])); }, []);

  async function link() {
    setBusy(true); setMsg(null);
    const { ok, body } = await call(`/api/leon/links/${encodeURIComponent(oprId.trim().toLowerCase())}`, { method: "PUT", body: JSON.stringify({ refreshToken: token.trim() }) });
    setBusy(false);
    setToken("");
    if (ok) { setLinks(body.links); setOprId(""); setMsg({ tone: "ok", text: `Linked: Leon ${body.link.oprId}. Manifests for its flights now read Leon as you.` }); }
    else setMsg({ tone: "err", text: body?.message ?? "Leon did not accept that token." });
  }
  async function unlink(id: string) {
    const { ok, body } = await call(`/api/leon/links/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (ok) { setLinks(body.links); setMsg({ tone: "ok", text: `Unlinked Leon ${id}.` }); }
  }

  return (
    <section aria-label="Leon access" style={{ ...card, gridColumn: "1 / -1" }}>
      <div style={{ padding: "14px 18px 6px" }}><Eyebrow>Leon access · passenger manifest</Eyebrow></div>
      <div style={{ padding: "4px 18px 18px", display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.3fr)", gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>Your own Leon account</span>
          <span>The passenger manifest is read from Leon with your account, never a shared one: if you cannot see a flight in Leon, you cannot make its manifest, and passports Leon masks for you stay blank.</span>
          <span>Link one refresh token per Leon operator you work in — the subdomain, e.g. <span style={mono({ fontSize: 12 })}>cwy-cwy</span> or <span style={mono({ fontSize: 12 })}>klj</span>. Create it in Leon under Settings → API → Refresh tokens. It is checked against Leon, stored encrypted, and never shown again.</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {links === null ? <span style={{ fontSize: 13, color: C.muted }}>Loading…</span> : links.length === 0 ? <span style={{ fontSize: 13, color: C.muted }}>No Leon account linked yet.</span> : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {links.map((l) => (
                <li key={l.oprId} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                  <span style={mono({ fontSize: 13, fontWeight: 600 })}>{l.oprId}</span>
                  <span style={{ color: C.faint, flex: 1 }}>{l.linkedAt ? `linked ${l.linkedAt.slice(0, 10)}` : "linked"}</span>
                  <Button variant="secondary" size="sm" onClick={() => void unlink(l.oprId)}>Unlink</Button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={(e) => { e.preventDefault(); if (oprId.trim() && token.trim() && !busy) void link(); }} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }} autoComplete="off">
            <input name="leon-operator" aria-label="Leon operator subdomain" placeholder="operator, e.g. cwy-cwy" value={oprId} onChange={(e) => setOprId(e.target.value)} autoComplete="off" spellCheck={false} style={{ ...field, ...mono({ fontSize: 13 }), width: 170 }} />
            <input name="leon-refresh-token" type="password" aria-label="Your Leon refresh token" placeholder="your Leon refresh token" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="new-password" spellCheck={false} data-1p-ignore="" data-lpignore="true" style={{ ...field, flex: 1, minWidth: 200 }} />
            <Button type="submit" variant="primary" size="sm" disabled={busy || !oprId.trim() || !token.trim()}>{busy ? "Checking with Leon…" : "Link"}</Button>
          </form>
          {msg && <span role={msg.tone === "err" ? "alert" : "status"} style={{ fontSize: 12.5, color: msg.tone === "err" ? C.danger : C.ok }}>{msg.text}</span>}
        </div>
      </div>
    </section>
  );
}
