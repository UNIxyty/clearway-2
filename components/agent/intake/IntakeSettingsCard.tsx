"use client";

// Agent settings → Flight intake (admins). The addresses, notification recipients, mailbox readers and
// retention live here, not in the server's .env. Each list saves on its own; every save is audited.
import { useCallback, useEffect, useId, useState } from "react";
import { C, TONE, mono } from "../ui/tokens";
import { Button, Eyebrow, Icon, dateLong } from "../ui/primitives";
import { AGENT_BASE } from "../types";

type Key = "addresses" | "notifyTo" | "mailboxReaders";
type Settings = { addresses: string[]; notifyTo: string[]; mailboxReaders: string[]; retentionDays: number; source: Record<string, string>; updated: Record<string, { at: string; by: string | null }> };
type Health = { addresses: { address: string; ok: boolean; why: string | null }[] } | null;
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/;

const ROWS: { key: Key; title: string; help: string; empty: string }[] = [
  { key: "addresses", title: "Receiving addresses", help: "The agent's own addresses. Mail sent to them is read as handling requests. Each must be on a domain where Resend receiving is enabled.", empty: "No address: nothing can arrive." },
  { key: "notifyTo", title: "Send intake emails to", help: "Who gets \"Review\", \"Loaded\" and \"Needs you\" emails. Usually the ops team address.", empty: "Nobody: intake emails are not sent, and the pipeline says so." },
  { key: "mailboxReaders", title: "Agent mailbox access", help: "People who may open the Agent mailbox, besides admins. It holds passport numbers and dates of birth.", empty: "Admins only." },
];

export default function IntakeSettingsCard() {
  const [s, setS] = useState<Settings | null>(null);
  const [health, setHealth] = useState<Health>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const call = useCallback(async (init?: RequestInit) => {
    const r = await fetch(`${AGENT_BASE}/api/intake/settings`, { credentials: "same-origin", cache: "no-store", ...init }).catch(() => null);
    if (!r) { setError("Could not reach the agent."); return; }
    if (r.status === 401 || r.status === 403) { setHidden(true); return; }
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) { setError(j?.message ?? `The server answered ${r.status}.`); return false; }
    setS(j.settings); setHealth(j.health); setError(null); return true;
  }, []);
  useEffect(() => { void call(); }, [call]);
  const save = async (key: string, value: unknown) => { setSaving(key); const ok = await call({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: value }) }); setSaving(null); return ok; };
  if (hidden) return null;
  return (
    <section aria-label="Flight intake" style={{ gridColumn: "1 / -1", minWidth: 0, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <Eyebrow>Flight intake</Eyebrow>
        <span style={{ fontSize: 12.5, color: C.muted }}>Addresses and recipients for handling requests. Changes apply within 15 seconds and are logged under your name.</span>
      </div>
      {error && <div role="alert" style={{ fontSize: 13, color: C.danger }}>{error}</div>}
      {!s && !error && <div style={{ fontSize: 13, color: C.muted }}>Loading…</div>}
      {s && ROWS.map((row) => (
        <ListEditor key={row.key} title={row.title} help={row.help} empty={row.empty} values={s[row.key]} source={s.source[row.key]} updated={s.updated[row.key]} saving={saving === row.key}
          status={row.key === "addresses" ? (a) => health?.addresses.find((h) => h.address === a) ?? null : undefined}
          onSave={(v) => save(row.key, v)} />
      ))}
      {s && <RetentionEditor days={s.retentionDays} source={s.source.retentionDays} updated={s.updated.retentionDays} saving={saving === "retentionDays"} onSave={(d) => save("retentionDays", d)} />}
    </section>
  );
}

function sourceLine(source: string | undefined, updated?: { at: string; by: string | null }) {
  if (source === "settings" && updated) return `Saved ${dateLong(updated.at)}${updated.by ? ` by ${updated.by}` : ""}`;
  if (source === "environment") return "From the server's environment until saved here";
  if (source === "default") return "Built-in default until saved here";
  return "Not set";
}

function ListEditor({ title, help, empty, values, source, updated, saving, status, onSave }: { title: string; help: string; empty: string; values: string[]; source?: string; updated?: { at: string; by: string | null }; saving: boolean; status?: (a: string) => { ok: boolean; why: string | null } | null; onSave: (v: string[]) => Promise<boolean | undefined> }) {
  const [draft, setDraft] = useState<string[]>(values); const [text, setText] = useState(""); const [bad, setBad] = useState<string | null>(null);
  const id = useId();
  useEffect(() => setDraft(values), [values]);
  const dirty = draft.join(",") !== values.join(",");
  const add = () => { const parts = text.split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean); if (!parts.length) return; const wrong = parts.filter((p) => !EMAIL.test(p)); if (wrong.length) { setBad(`Not an email address: ${wrong.join(", ")}`); return; } setDraft((d) => [...new Set([...d, ...parts])]); setText(""); setBad(null); };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,260px) minmax(0,1fr)", gap: 16, paddingTop: 14, borderTop: `1px solid ${C.dividerRow}` }}>
      <div>
        <div id={`${id}-t`} style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>{title}</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.muted, marginTop: 3 }}>{help}</div>
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 6 }}>{sourceLine(source, updated)}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        <ul aria-labelledby={`${id}-t`} style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {draft.length === 0 && <li style={{ fontSize: 12.5, color: C.muted }}>{empty}</li>}
          {draft.map((a) => { const h = status?.(a); return (
            <li key={a} style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 6, maxWidth: "100%", minWidth: 0, border: `1px solid ${C.borderControl}`, borderRadius: 14, padding: "3px 4px 3px 10px", background: C.surface }}>
              {h && <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: h.ok ? TONE.green.ic : TONE.red.ic }} />}
              <span style={{ ...mono({ fontSize: 12.5, fontWeight: 600 }), overflowWrap: "anywhere", minWidth: 0 }}>{a}</span>
              {h && !h.ok && h.why && <span style={{ fontSize: 11.5, color: C.danger, overflowWrap: "anywhere", minWidth: 0 }}>{h.why}</span>}
              <button type="button" className="ag-focus" aria-label={`Remove ${a}`} onClick={() => setDraft((d) => d.filter((x) => x !== a))} style={{ width: 22, height: 22, borderRadius: 999, border: "none", background: "transparent", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="x" size={13} color={C.muted} /></button>
            </li>
          ); })}
        </ul>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input type="text" aria-label={`Add to ${title}`} value={text} placeholder="name@example.com" spellCheck={false} autoComplete="off" onChange={(e) => { setText(e.target.value); setBad(null); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            className="ag-focus" style={{ ...mono({ fontSize: 13 }), height: 32, width: 300, maxWidth: "100%", borderRadius: 8, border: `1px solid ${bad ? C.dangerBadge : C.borderControl}`, padding: "0 10px", color: C.ink, background: C.surface }} />
          <Button size="xs" variant="secondary" icon="plus" onClick={add} disabled={!text.trim()}>Add</Button>
          <Button size="xs" variant="primary" onClick={async () => { const ok = await onSave(draft); if (ok === false) setDraft(values); }} disabled={!dirty || saving || (title === "Receiving addresses" && draft.length === 0)}>{saving ? "Saving…" : "Save"}</Button>
          {dirty && !saving && <Button size="xs" variant="ghost" onClick={() => { setDraft(values); setText(""); setBad(null); }}>Cancel</Button>}
        </div>
        {bad && <div role="alert" style={{ fontSize: 12.5, color: C.danger }}>{bad}</div>}
      </div>
    </div>
  );
}

function RetentionEditor({ days, source, updated, saving, onSave }: { days: number; source?: string; updated?: { at: string; by: string | null }; saving: boolean; onSave: (d: number) => Promise<boolean | undefined> }) {
  const [v, setV] = useState(String(days)); useEffect(() => setV(String(days)), [days]);
  const n = Number(v); const valid = Number.isInteger(n) && n >= 1 && n <= 3650;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,260px) minmax(0,1fr)", gap: 16, paddingTop: 14, borderTop: `1px solid ${C.dividerRow}` }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>Keep intake mail</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.muted, marginTop: 3 }}>Raw emails, attachments and extracted personal data are deleted this many days after the email arrived or after the request&apos;s last flight, whichever is later. Flights, times and Leon ids stay.</div>
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 6 }}>{sourceLine(source, updated)}</div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input type="text" inputMode="numeric" aria-label="Days to keep intake mail" value={v} onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ""))} className="ag-focus"
          style={{ ...mono({ fontSize: 13 }), height: 32, width: 90, borderRadius: 8, border: `1px solid ${valid ? C.borderControl : C.dangerBadge}`, padding: "0 10px", color: C.ink, background: C.surface }} />
        <span style={{ fontSize: 13, color: C.muted }}>days</span>
        <Button size="xs" variant="primary" disabled={!valid || n === days || saving} onClick={() => void onSave(n)}>{saving ? "Saving…" : "Save"}</Button>
        {!valid && <span role="alert" style={{ fontSize: 12.5, color: C.danger }}>Between 1 and 3650 days.</span>}
      </div>
    </div>
  );
}
