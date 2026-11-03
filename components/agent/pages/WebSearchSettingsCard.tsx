"use client";

// Agent settings → Web search (admins, 2026-11-03). Which provider searches — Tavily, the Anthropic API's own search, or
// both — and the approved sources: official (regulators, ANSPs, state AIS: stated plainly) and industry references
// (approved, named in the answer). Pass one searches only these; anything cited from elsewhere is marked on the claim.
// Settings data, not code: saved here, applied within 15 seconds, no deploy. Every save is audited.
import { useCallback, useEffect, useState } from "react";
import { Button, Eyebrow, dateLong } from "../ui/primitives";
import { AGENT_BASE } from "../types";
import { cw } from "@/lib/portal-tokens";

type Provider = "both" | "anthropic" | "tavily";
type Web = { provider: Provider; official: string[]; industry: string[]; source: Record<string, string>; updated: Record<string, { at: string; by: string | null }>; tavilyConfigured: boolean };
const PROVIDERS: { id: Provider; label: string; help: string }[] = [
  { id: "both", label: "Both", help: "The model may search with either; the answer cites whichever it used." },
  { id: "anthropic", label: "Anthropic", help: "The API's own web search only." },
  { id: "tavily", label: "Tavily", help: "Tavily only." },
];

export default function WebSearchSettingsCard({ canEdit }: { canEdit: boolean }) {
  const [w, setW] = useState<Web | null>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ official: string; industry: string }>({ official: "", industry: "" });
  const call = useCallback(async (init?: RequestInit) => {
    const r = await fetch(`${AGENT_BASE}/api/settings/web`, { credentials: "same-origin", cache: "no-store", ...init }).catch(() => null);
    if (!r) { setError("Could not reach the agent."); return false; }
    if (r.status === 401 || r.status === 403) { if (!init) setHidden(true); else setError("Your account cannot change these settings."); return false; }
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) { setError(j?.message ?? `The server answered ${r.status}.`); return false; }
    setW(j.web); setDraft({ official: j.web.official.join("\n"), industry: j.web.industry.join("\n") }); setError(null); return true;
  }, []);
  useEffect(() => { void call(); }, [call]);
  const save = async (key: string, body: unknown) => { setSaving(key); await call({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); setSaving(null); };
  if (hidden) return null;
  const listOf = (t: string) => t.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  const dirty = w ? draft.official.trim() !== w.official.join("\n") || draft.industry.trim() !== w.industry.join("\n") : false;
  const line = (k: string) => { const u = w?.updated[k]; return w?.source[k] === "settings" && u ? `Saved ${dateLong(u.at)}${u.by ? ` by ${u.by}` : ""}` : "Built-in default until saved here"; };
  return (
    <section aria-label="Web search" style={{ minWidth: 0, background: cw.bgSurface, border: `1px solid ${cw.border}`, borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <Eyebrow>Web search</Eyebrow>
        <span style={{ fontSize: 12.5, color: cw.textMuted }}>The first search of every question covers only the sources below. Only when they have nothing does the agent search the whole web, and every claim from outside the list is marked next to it. Changes apply within 15 seconds and are logged under your name.</span>
      </div>
      {error && <div role="alert" style={{ fontSize: 13, color: cw.dangerText }}>{error}</div>}
      {!w && !error && <div style={{ fontSize: 13, color: cw.textMuted }}>Loading…</div>}
      {w && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,260px) minmax(0,1fr)", gap: 16, paddingTop: 14, borderTop: `1px solid ${cw.divider}` }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: cw.text }}>Provider</div>
            <div style={{ fontSize: 11.5, color: cw.textMuted, marginTop: 6 }}>{line("provider")}</div>
          </div>
          <div role="radiogroup" aria-label="Provider" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {PROVIDERS.map((p) => (
              <label key={p.id} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13, color: cw.text, cursor: canEdit ? "pointer" : "default" }}>
                <input type="radio" name="web-provider" checked={w.provider === p.id} disabled={!canEdit || saving !== null} onChange={() => void save("provider", { provider: p.id })} />
                <span><strong>{p.label}</strong> <span style={{ color: cw.textMuted }}>— {p.help}{p.id !== "anthropic" && !w.tavilyConfigured ? " Tavily has no key on this server, so it is not offered." : ""}</span></span>
              </label>
            ))}
          </div>
        </div>
      )}
      {w && ([["official", "Official sources", "Regulators, air navigation service providers and state AIS. An answer from these is stated plainly. A domain covers its subdomains: gov.uk includes www.gov.uk."], ["industry", "Industry references", "Approved, and named in the answer so a reader can weigh them. For a permit, an airspace restriction or an entry requirement the agent prefers an official source, and says when it only found one of these."]] as const).map(([k, title, help]) => (
        <div key={k} style={{ display: "grid", gridTemplateColumns: "minmax(0,260px) minmax(0,1fr)", gap: 16, paddingTop: 14, borderTop: `1px solid ${cw.divider}` }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: cw.text }}>{title} <span style={{ fontWeight: 400, color: cw.textMuted }}>· {listOf(draft[k]).length}</span></div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: cw.textMuted, marginTop: 3 }}>{help}</div>
            <div style={{ fontSize: 11.5, color: cw.textMuted, marginTop: 6 }}>{line("sources")}</div>
          </div>
          <textarea aria-label={title} value={draft[k]} readOnly={!canEdit} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))} rows={Math.min(14, Math.max(5, listOf(draft[k]).length + 1))}
            style={{ width: "100%", minWidth: 0, fontFamily: "var(--cw-font-mono, ui-monospace, monospace)", fontSize: 12.5, lineHeight: 1.5, padding: "8px 10px", borderRadius: 8, border: `1px solid ${cw.borderControl}`, background: cw.bgSurface, color: cw.text, resize: "vertical" }} />
        </div>
      ))}
      {w && canEdit && (
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center" }}>
          {dirty && <span style={{ fontSize: 12.5, color: cw.textMuted }}>One domain per line, without https://</span>}
          <Button variant="secondary" disabled={!dirty || saving !== null} onClick={() => setDraft({ official: w.official.join("\n"), industry: w.industry.join("\n") })}>Discard</Button>
          <Button disabled={!dirty || saving !== null} onClick={() => void save("sources", { official: listOf(draft.official), industry: listOf(draft.industry) })}>{saving === "sources" ? "Saving…" : "Save sources"}</Button>
        </div>
      )}
    </section>
  );
}
