"use client";

// Two things the viewer can do WITHOUT editing the file (item 15):
//  1. Edit the document's RECORD — title, version, effective date, source, scope, tags — in place.
//     Tier and approval are decisions about approved text, so they stay in the Knowledge base review
//     (tier 1 needs the approver to read each clause); the panel says so and links there.
//  2. Turn a SELECTION into something — a limitation, an IMPORTANT entry, or a note — with the document
//     recorded as its source. It goes through the agent like any request, so the normal confirmation
//     rules apply: nothing is written from here directly.
// The stored file itself is never edited.

import { useEffect, useRef, useState } from "react";
import { SHADOW, mono } from "../ui/tokens";
import { Button, Icon } from "../ui/primitives";
import { AGENT_BASE } from "../types";
import type { DocRef } from "./types";
import { cw } from "@/lib/portal-tokens";
import { apiMessage } from "../ui/errorText";

export const COMPOSE_EVENT = "cw-agent-compose";
export type ComposeDetail = { text: string; send: boolean; retry?: boolean; accepted?: boolean };

/** Hand a prepared request to whichever agent surface is open (panel or full-page chat). */
export function composeToAgent(text: string, send = true, retry = false): boolean {
  // Listeners that take the request set `accepted` on the detail (AgentPanel, FullPageChat). With no agent surface
  // mounted yet (the panel is closed), the first dispatch opens it (portal Shell) and the caller retries.
  const detail: ComposeDetail = { text, send, retry, accepted: false };
  window.dispatchEvent(new CustomEvent<ComposeDetail>(COMPOSE_EVENT, { detail }));
  return detail.accepted === true;
}
/** Hand a request to the agent and say what happened (2026-10-26): accepted → "it is in the chat, confirm it there";
 *  nobody there after the panel had 3 s to open → "nothing was sent". A proposal that lands in a chat nobody sees
 *  was the same lie as a card saying Sent: the person believed a limitation was on the wall. */
export function composeToAgentAndTell(text: string, tell: (note: { ok: boolean; text: string }) => void) {
  if (composeToAgent(text)) { tell({ ok: true, text: "Sent to the Ops Agent. Its proposal is in the chat — confirm it there, or nothing is created." }); return; }
  let tries = 0;
  const again = () => {
    tries += 1;
    if (composeToAgent(text, true, true)) { tell({ ok: true, text: "Sent to the Ops Agent. Its proposal is in the chat — confirm it there, or nothing is created." }); return; }
    if (tries < 12) setTimeout(again, 250); else tell({ ok: false, text: "Nothing was sent to the Ops Agent — the chat did not open. Open the chat and ask there." });
  };
  setTimeout(again, 250);
}

type Record = { title: string; source: string | null; version: string | null; effectiveDate: string | null; icao: string | null; country: string | null; tags: string[]; tier: string | null; status: string };

export function RecordEditor({ docRef, onClose, onSaved }: { docRef: DocRef & { record?: Record | null }; onClose: () => void; onSaved: () => void }) {
  const r = docRef.record;
  const [form, setForm] = useState({ title: r?.title ?? docRef.title ?? docRef.filename, source: r?.source ?? "", version: r?.version ?? "", effectiveDate: r?.effectiveDate ?? "", icao: r?.icao ?? "", tags: (r?.tags ?? []).join(", ") });
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const first = useRef<HTMLInputElement | null>(null);
  useEffect(() => { first.current?.focus(); }, []);
  async function save() {
    setState({ busy: true, error: null });
    try {
      const res = await fetch(`${AGENT_BASE}/api/knowledge/documents/${encodeURIComponent(docRef.id)}`, { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: form.title, source: form.source, version: form.version, effectiveDate: form.effectiveDate || null, icao: form.icao, tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean) }) });
      const b = await res.json().catch(() => null);
      if (!res.ok || !b?.ok) { setState({ busy: false, error: apiMessage(b, "The record could not be saved. Try again.") }); return; }
      onSaved(); onClose();
    } catch { setState({ busy: false, error: "The record could not be saved — check the connection." }); }
  }
  const field = (label: string, key: keyof typeof form, props: Partial<React.InputHTMLAttributes<HTMLInputElement>> = {}) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, fontWeight: 600, color: cw.textMuted }}>{label}
      <input ref={key === "title" ? first : undefined} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} {...props} style={{ height: 32, border: `1px solid ${cw.borderControl}`, borderRadius: 7, padding: "0 9px", fontSize: 13, fontFamily: "inherit", color: cw.text, ...(props.style ?? {}) }} />
    </label>
  );
  return (
    <div role="dialog" aria-label="Edit document record" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}
      style={{ position: "absolute", right: 18, top: 64, zIndex: 8, width: 420, background: cw.bgSurface, border: `1px solid ${cw.border}`, borderRadius: 12, boxShadow: SHADOW.menu, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Icon name="pencil" size={14} color={cw.textBody} /><span style={{ fontSize: 13.5, fontWeight: 700 }}>Edit record</span><span style={{ flex: 1 }} /><span style={{ fontSize: 11.5, color: cw.textMuted }}>The file is not changed</span></div>
      {field("Title", "title")}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{field("Source", "source", { placeholder: "e.g. Ops manual" })}{field("Version", "version", { placeholder: "e.g. 3" })}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{field("Effective from", "effectiveDate", { type: "date" })}{field("ICAO", "icao", { maxLength: 4, style: { ...mono({ fontSize: 13 }), textTransform: "uppercase" } })}</div>
      {field("Tags", "tags", { placeholder: "comma separated" })}
      <div style={{ fontSize: 12, color: cw.textMuted, lineHeight: 1.5, background: cw.bgSunken, borderRadius: 8, padding: "8px 10px" }}>
        Tier <b style={{ color: cw.textBody }}>{r?.tier === "tier1" ? "authoritative" : r?.tier === "tier2" ? "reference" : "not set"}</b> · status <b style={{ color: cw.textBody }}>{(r?.status ?? "—").replace(/_/g, " ")}</b>. Changing tier or approval means reviewing the approved clauses, so it is done in the <a href="/agent/knowledge" style={{ color: cw.textLink }}>Knowledge base</a>.
      </div>
      {state.error && <div role="alert" style={{ fontSize: 12.5, color: cw.dangerText }}>{state.error}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="sm" disabled={state.busy || !form.title.trim()} onClick={() => void save()}>{state.busy ? "Saving…" : "Save record"}</Button>
      </div>
    </div>
  );
}

/** Floating actions for text selected inside the canvas. */
export function SelectionActions({ host, docRef, page }: { host: HTMLElement | null; docRef: DocRef; page: number }) {
  const [sel, setSel] = useState<{ text: string; x: number; y: number } | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!host) return;
    const onUp = () => window.setTimeout(() => {
      const s = window.getSelection(); const text = s?.toString().replace(/\s+\n/g, "\n").trim() ?? "";
      if (!s || !text || s.rangeCount === 0 || !host.contains(s.anchorNode)) { setSel(null); return; }
      const rect = s.getRangeAt(0).getBoundingClientRect(); const box = host.getBoundingClientRect();
      setSel({ text: text.slice(0, 4000), x: Math.min(Math.max(rect.left - box.left + rect.width / 2, 150), box.width - 150), y: Math.max(rect.top - box.top - 44, 6) });
    }, 0);
    const onDown = (e: MouseEvent) => { if (!(e.target as HTMLElement)?.closest?.("[data-selection-actions]")) setSel(null); };
    host.addEventListener("mouseup", onUp); host.addEventListener("keyup", onUp); document.addEventListener("mousedown", onDown);
    return () => { host.removeEventListener("mouseup", onUp); host.removeEventListener("keyup", onUp); document.removeEventListener("mousedown", onDown); };
  }, [host]);
  if (note && !sel) return (
    <div role={note.ok ? "status" : "alert"} data-selection-note style={{ position: "absolute", left: note.x, top: note.y, transform: "translateX(-50%)", zIndex: 9, maxWidth: 360, padding: "8px 12px", borderRadius: 9, background: note.ok ? cw.ink : cw.danger, color: cw.textOnPrimary, fontSize: 12.5, lineHeight: 1.4, boxShadow: SHADOW.menu }}>{note.text}</div>
  );
  if (!sel) return null;
  const where = `${docRef.filename}${page ? `, p. ${page}` : ""}`;
  const quote = `"""\n${sel.text}\n"""`;
  const act = (text: string) => { const at = { x: sel.x, y: sel.y }; setSel(null); window.getSelection()?.removeAllRanges(); composeToAgentAndTell(text, (n) => { setNote({ ...n, ...at }); setTimeout(() => setNote(null), n.ok ? 7000 : 12000); }); };
  const btn = (icon: string, label: string, text: string) => (
    <button type="button" onClick={() => act(text)} className="ag-hover ag-focus" style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 10px", border: "none", borderRadius: 7, background: "transparent", color: cw.textOnPrimary, fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
      <Icon name={icon} size={13} color={cw.textOnPrimary} />{label}
    </button>
  );
  return (
    <div data-selection-actions role="toolbar" aria-label="Selection actions" style={{ position: "absolute", left: sel.x, top: sel.y, transform: "translateX(-50%)", zIndex: 9, display: "flex", gap: 2, padding: 3, background: cw.ink, borderRadius: 9, boxShadow: SHADOW.menu }}>
      {btn("message-square", "Ask", `About this passage from ${where}:\n${quote}\n`)}
      {btn("shield-alert", "Limitation…", `Create a limitation from this text in ${where}. Record the document (${docRef.source}:${docRef.id}) as its source. Propose it for my confirmation; do not change the wording.\n${quote}`)}
      {btn("flag", "IMPORTANT…", `Create an IMPORTANT entry from this text in ${where}. Record the document (${docRef.source}:${docRef.id}) as its source. Propose it for my confirmation; do not change the wording.\n${quote}`)}
      {btn("bookmark", "Note…", `Save this as a knowledge note, with ${where} (${docRef.source}:${docRef.id}) recorded as its source. Ask me before saving.\n${quote}`)}
    </div>
  );
}
