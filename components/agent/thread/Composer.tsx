"use client";

// The composer (design spec §4.17), attachments (§4.18), @ mentions (§4.19)
// and / commands (§4.20). Full-page and panel variants, six composer states.
//
// Attachments are real uploads to the agent (25 MB, PDF/images/CSV/XLSX/TXT)
// with progress, retry and too-large states; sending waits for uploads and a
// too-large file is excluded and stays marked. @ resolves real entities
// through the agent's own tools, the current selection first. A / command is
// a black chip with argument slots; on send it becomes the sentence it stands
// for and goes through the same pipeline as anything typed.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { C, SHADOW, mono } from "../ui/tokens";
import { Icon, IconButton, Keycap } from "../ui/primitives";
import Orb from "../ui/Orb";
import { useKeybinds } from "../ui/keybinds";
import { AGENT_BASE, type AgentContext } from "../types";

// ── Attachments ───────────────────────────────────────────────────────────────
export type AttachmentChip = { localId: string; name: string; bytes: number; kind: "image" | "file"; state: "uploading" | "uploaded" | "failed" | "too-large"; progress: number; id?: string; hasText?: boolean; error?: string; file?: File; previewUrl?: string };
const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.gif,.webp,.csv,.xlsx,.txt,.md,.json";
const fmtSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function uploadWithProgress(file: File, onProgress: (p: number) => void): Promise<{ id: string; hasText: boolean }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${AGENT_BASE}/api/attachments?name=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => { try { const b = JSON.parse(xhr.responseText); if (xhr.status === 200 && b.ok) resolve({ id: b.attachment.id, hasText: b.attachment.hasText }); else reject(new Error(b.message || `HTTP ${xhr.status}`)); } catch { reject(new Error(`HTTP ${xhr.status}`)); } };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(file);
  });
}

function AttachmentChipView({ a, onRemove, onRetry }: { a: AttachmentChip; onRemove: () => void; onRetry: () => void }) {
  const look = a.state === "uploading" ? { border: C.primaryLine, bg: C.surface, tileBg: C.primaryTint, tileIcon: "file-text", tileFg: C.primary }
    : a.state === "failed" ? { border: C.dangerBorder, bg: C.dangerWashSoft, tileBg: C.dangerTint, tileIcon: "rotate-cw", tileFg: C.dangerBadge }
    : a.state === "too-large" ? { border: C.warnBorder, bg: C.warnWashSoft, tileBg: C.warnTint, tileIcon: "file-warning", tileFg: C.warn }
    : { border: C.border, bg: C.surface, tileBg: C.primaryTint, tileIcon: "file-text", tileFg: C.primary };
  return (
    <div style={{ position: "relative", width: 170, borderRadius: 10, padding: 8, display: "flex", gap: 9, alignItems: "center", background: look.bg, border: `1px solid ${look.border}` }}>
      <button type="button" onClick={a.state === "failed" ? onRetry : undefined} title={a.state === "failed" ? "Retry" : undefined} style={{ width: 38, height: 38, borderRadius: 6, background: look.tileBg, border: "none", padding: 0, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: a.state === "failed" ? "pointer" : "default", overflow: "hidden" }}>
        {a.kind === "image" && a.previewUrl && a.state !== "failed" ? <img src={a.previewUrl} alt="" style={{ width: 38, height: 38, objectFit: "cover" }} /> : <Icon name={look.tileIcon} size={17} color={look.tileFg} />}
      </button>
      <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ ...mono({ fontSize: 12.5, fontWeight: 600 }), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
        {a.state === "uploading" && <><span style={{ fontSize: 11.5, color: C.primaryHover }}>Uploading · {a.progress}%</span><span style={{ height: 3, borderRadius: 2, background: C.border, marginTop: 3, overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${a.progress}%`, background: C.primary, transition: "width 120ms linear" }} /></span></>}
        {a.state === "uploaded" && <span style={{ fontSize: 11.5, color: C.muted }}>{fmtSize(a.bytes)}{a.hasText === false ? " · no text" : ""}</span>}
        {a.state === "failed" && <button type="button" onClick={onRetry} style={{ textAlign: "left", fontFamily: "inherit", fontSize: 11.5, color: C.danger, background: "transparent", border: "none", padding: 0, cursor: "pointer" }}>Failed · Retry</button>}
        {a.state === "too-large" && <span style={{ fontSize: 11.5, color: C.warn }}>{fmtSize(a.bytes)} · over 25 MB</span>}
      </div>
      <button type="button" onClick={onRemove} title="Remove" aria-label={`Remove ${a.name}`} className="ag-focus" style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: C.surface, border: `1px solid ${C.borderControl}`, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}><Icon name="x" size={10} color={C.muted} /></button>
    </div>
  );
}

// ── @ mentions ────────────────────────────────────────────────────────────────
type MentionType = "flight" | "airport" | "operator" | "aircraft" | "limitation" | "document";
export type Mention = { type: MentionType; id: string; primary: string; secondary: string; tag?: "SELECTED" | "VISIBLE" | null };
const TYPES: MentionType[] = ["flight", "airport", "operator", "aircraft", "limitation", "document"];
const TYPE_LOOK: Record<MentionType, { icon: string; bg: string; fg: string }> = {
  airport: { icon: "map-pin", bg: C.primaryTint2, fg: C.primaryHover }, flight: { icon: "plane", bg: C.primaryTint2, fg: C.primaryHover }, aircraft: { icon: "plane-takeoff", bg: C.primaryTint2, fg: C.primaryHover },
  document: { icon: "file-text", bg: C.hover, fg: C.body }, limitation: { icon: "triangle-alert", bg: "#ede9fe", fg: "#6d28d9" }, operator: { icon: "building-2", bg: C.hover, fg: C.body },
};
const invoke = async (name: string, input: Record<string, unknown>) => { try { const r = await fetch(`${AGENT_BASE}/api/tools/invoke`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, input }) }); return await r.json(); } catch { return null; } };

async function resolveMentions(q: string, type: MentionType | "all", context: AgentContext | null): Promise<Mention[]> {
  const out: Mention[] = [];
  const query = q.trim(); const ql = query.toLowerCase();
  // The current selection first, then what is visible on the page (§4.19 panel ordering).
  if (!query) {
    for (const s of context?.selected ?? []) out.push({ type: s.kind, id: s.id, primary: s.label, secondary: "selected", tag: "SELECTED" });
    for (const v of (context?.visible ?? []).slice(0, 6)) if (!out.some((m) => m.id === v.id)) out.push({ type: v.kind, id: v.id, primary: v.label, secondary: v.sub ?? "on this page", tag: "VISIBLE" });
  }
  const want = (t: MentionType) => type === "all" || type === t;
  const per = type === "all" ? (query ? 4 : 3) : 12;
  const hit = (...fields: Array<string | null | undefined>) => !query || fields.some((f) => String(f ?? "").toLowerCase().includes(ql));
  const jobs: Promise<void>[] = [];
  // Flights: today's wall window; a query matches callsign, registration or route.
  if (want("flight")) jobs.push(invoke("search_flights", query.length >= 2 ? { callsign: query.toUpperCase(), limit: 12 } : { limit: 12 }).then((b) => {
    const list = (b?.flights ?? []).filter((f: Record<string, string | null>) => hit(f.callsign, f.registration, f.departureIcao, f.arrivalIcao));
    for (const f of list.slice(0, per)) out.push({ type: "flight", id: f.flightId, primary: f.callsign || f.registration || f.flightId, secondary: `${f.departureIcao ?? "?"} → ${f.arrivalIcao ?? "?"}${f.registration ? ` · ${f.registration}` : ""}` });
  }));
  // Airports: the portal's own airport search (ICAO, IATA or name); same session.
  if (want("airport") && query.length >= 2) jobs.push(fetch(`/api/search?q=${encodeURIComponent(query)}`, { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).then((b) => {
    for (const a of (b?.results ?? []).slice(0, per)) out.push({ type: "airport", id: String(a.icao).toUpperCase(), primary: String(a.icao).toUpperCase(), secondary: [a.name, a.country].filter(Boolean).join(" · ") || "airport" });
  }).catch(() => {}));
  if (want("limitation")) jobs.push(invoke("list_limitations", query.length >= 2 ? { query, limit: per } : { limit: per }).then((b) => { for (const l of (b?.limitations ?? []).slice(0, per)) if (!out.some((m) => m.id === l.id)) out.push({ type: "limitation", id: l.id, primary: l.id, secondary: l.title }); }));
  if (want("aircraft")) jobs.push(invoke("list_aircraft", {}).then((b) => {
    const list = (b?.aircraft ?? []).filter((a: Record<string, string | null>) => hit(a.registration, a.type, a.operatorId));
    for (const a of list.slice(0, per)) out.push({ type: "aircraft", id: a.registration ?? a.id, primary: a.registration ?? a.id, secondary: [a.type, a.operatorId].filter(Boolean).join(" · ") || "aircraft" });
  }));
  if (want("operator")) jobs.push(invoke("list_operators", {}).then((b) => {
    const list = (b?.operators ?? []).filter((o: { id?: string; name?: string; operatorId?: string }) => hit(o.id, o.name, o.operatorId));
    for (const o of list.slice(0, per)) out.push({ type: "operator", id: String(o.operatorId ?? o.id), primary: o.name ?? String(o.id), secondary: o.operatorId ? `Leon ${o.operatorId}` : "operator" });
  }));
  // Documents: the knowledge base list (title match), plus semantic hits for a real question.
  if (want("document")) jobs.push(fetch(`${AGENT_BASE}/api/knowledge/documents`, { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).then((b) => {
    const docs = (b?.documents ?? []).filter((d: Record<string, string | null>) => (d.status === "indexed" || d.status === "approved") && hit(d.title, d.filename, d.icao, d.source));
    for (const d of docs.slice(0, per)) out.push({ type: "document", id: d.id as string, primary: (d.title ?? d.filename) as string, secondary: d.tier === "tier1" ? "authoritative · quoted exactly" : "reference" });
  }).catch(() => {}));
  if (want("document") && query.length >= 3) jobs.push(invoke("search_knowledge", { query }).then((b) => { for (const d of [...(b?.verbatim ?? []), ...(b?.reference ?? [])].slice(0, 3)) { const id = d.documentId ?? d.recordId ?? d.reference; if (id && !out.some((m) => m.id === id)) out.push({ type: "document", id, primary: d.title ?? d.reference ?? id, secondary: d.tier === "tier1" ? "authoritative · quoted exactly" : "reference" }); } }));
  await Promise.all(jobs);
  // De-dupe; keep the page's items first, then group by type in tab order.
  const seen = new Set<string>();
  const uniq = out.filter((m) => { const k = `${m.type}:${m.id}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const rank = (m: Mention) => (m.tag ? -1 : TYPES.indexOf(m.type));
  return uniq.sort((a, b) => rank(a) - rank(b)).slice(0, type === "all" ? 24 : 12);
}

function Highlight({ text, prefix }: { text: string; prefix: string }) {
  if (!prefix || !text.toLowerCase().startsWith(prefix.toLowerCase())) return <>{text}</>;
  return <><span style={{ background: C.highlight, borderRadius: 2 }}>{text.slice(0, prefix.length)}</span>{text.slice(prefix.length)}</>;
}

// ── / commands ────────────────────────────────────────────────────────────────
type Command = { cmd: string; description: string; args: string; icon: string; kind: string; kindColor: string; needs: ("icao" | "flight" | "to" | "text")[]; optional?: string; ask: (args: string[]) => string };
const COMMANDS: Command[] = [
  { cmd: "/aip", description: "Get an AIP document", args: "ICAO [part]", icon: "file-text", kind: "READ", kindColor: C.faint, needs: ["icao"], optional: "part", ask: ([icao, part]) => `Find the ${part?.trim() || "AD 2"} document for ${icao}.` },
  { cmd: "/notam", description: "Active and new NOTAMs", args: "ICAO [since]", icon: "file-check", kind: "READ", kindColor: C.faint, needs: ["icao"], optional: "since", ask: ([icao, since]) => `What NOTAMs are current at ${icao}${since?.trim() ? ` since ${since.trim()}` : ""}?` },
  { cmd: "/weather", description: "METAR and TAF, raw + decoded", args: "ICAO…", icon: "cloud-sun", kind: "READ", kindColor: C.faint, needs: ["icao"], ask: ([icao]) => `Give me the METAR and TAF for ${icao}, raw and decoded.` },
  { cmd: "/brief", description: "Build a briefing for a flight or wave", args: "flight | time range", icon: "clipboard-list", kind: "MAKES A FILE", kindColor: C.okDot, needs: ["text"], ask: ([what]) => `Build a one-page crew briefing PDF for ${what}, quoting any limitation that applies verbatim.` },
  { cmd: "/email", description: "Send something from this thread", args: "to [what]", icon: "send", kind: "ASKS FIRST", kindColor: C.primaryHover, needs: ["to"], optional: "what", ask: ([to, what]) => `Email ${what?.trim() || "the latest document from this thread"} to ${to}.` },
];
export type ActiveCommand = { command: Command; args: string[]; slot: number };

// ── The composer ──────────────────────────────────────────────────────────────
export default function Composer({
  panel = false, context, streaming, locked = null, offline = false, voiceEnabled = true, onSend, onStop, onVoice, autoFocus = true, placeholderOverride,
}: {
  panel?: boolean;
  context: AgentContext | null;
  streaming: boolean;
  /** Composer locked while a confirmation is pending (§4.15): the copy to show. */
  locked?: string | null;
  offline?: boolean;
  voiceEnabled?: boolean;
  onSend: (text: string, attachmentIds: string[], meta: { mentions: Mention[]; command: string | null }) => void;
  onStop: () => void;
  onVoice?: () => void;
  autoFocus?: boolean;
  placeholderOverride?: string;
}) {
  const [value, setValue] = useState("");
  const kb = useKeybinds();
  const [attachments, setAttachments] = useState<AttachmentChip[]>([]);
  const [menu, setMenu] = useState<"none" | "mention" | "command">("none");
  const [query, setQuery] = useState("");
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [searching, setSearching] = useState(false);
  const [mentionType, setMentionType] = useState<MentionType | "all">("all");
  const [highlight, setHighlight] = useState(0);
  const [inserted, setInserted] = useState<Mention[]>([]);
  const [command, setCommand] = useState<ActiveCommand | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const slotRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

  // Grow with content up to 8 lines (§4.17), then scroll internally.
  useEffect(() => { const el = inputRef.current; if (!el) return; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 8 * 24)}px`; }, [value]);

  // Menus: @ opens mentions, / at line start or after a space opens commands.
  useEffect(() => {
    const at = /(?:^|\s)@(\S*)$/.exec(value);
    const slash = /(?:^|\s)\/(\S*)$/.exec(value);
    if (at) { setMenu("mention"); setQuery(at[1]); setHighlight(0); }
    else if (slash && !command) { setMenu("command"); setQuery(slash[1]); setHighlight(0); }
    else setMenu("none");
  }, [value, command]);
  useEffect(() => {
    if (menu !== "mention") return;
    let alive = true; setSearching(true);
    resolveMentions(query, mentionType, context).then((m) => { if (alive) { setMentions(m); setSearching(false); } });
    return () => { alive = false; };
  }, [menu, query, mentionType, context]);

  const commands = useMemo(() => COMMANDS.filter((c) => c.cmd.slice(1).startsWith(query.toLowerCase())), [query]);

  const uploading = attachments.some((a) => a.state === "uploading");
  const tooLarge = attachments.filter((a) => a.state === "too-large");
  const canSend = !streaming && !locked && !uploading && (value.trim().length > 0 || attachments.some((a) => a.state === "uploaded") || Boolean(command));

  const startUpload = useCallback((chip: AttachmentChip) => {
    if (!chip.file) return;
    uploadWithProgress(chip.file, (p) => setAttachments((list) => list.map((a) => (a.localId === chip.localId ? { ...a, progress: p } : a))))
      .then(({ id, hasText }) => setAttachments((list) => list.map((a) => (a.localId === chip.localId ? { ...a, state: "uploaded", progress: 100, id, hasText } : a))))
      .catch((e) => setAttachments((list) => list.map((a) => (a.localId === chip.localId ? { ...a, state: "failed", error: e.message } : a))));
  }, []);
  const addFiles = useCallback((files: FileList | File[] | null) => {
    if (!files) return;
    const next: AttachmentChip[] = [];
    for (const f of Array.from(files)) {
      const kind = /^image\//.test(f.type) ? "image" : "file";
      const chip: AttachmentChip = { localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: f.name, bytes: f.size, kind, state: f.size > MAX_BYTES ? "too-large" : "uploading", progress: 0, file: f, previewUrl: kind === "image" ? URL.createObjectURL(f) : undefined };
      next.push(chip);
    }
    setAttachments((list) => [...list, ...next]);
    next.filter((c) => c.state === "uploading").forEach(startUpload);
  }, [startUpload]);

  // Paste and drop anywhere on the thread (§4.18); the parent wires the drop target through these.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => { const files = Array.from(e.clipboardData?.files ?? []); if (files.length) { e.preventDefault(); addFiles(files); } };
    const onDragOver = (e: DragEvent) => { if (e.dataTransfer?.types.includes("Files")) { e.preventDefault(); setDragging(true); } };
    const onDragLeave = (e: DragEvent) => { if (!e.relatedTarget) setDragging(false); };
    const onDrop = (e: DragEvent) => { if (e.dataTransfer?.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } setDragging(false); };
    window.addEventListener("paste", onPaste); window.addEventListener("dragover", onDragOver); window.addEventListener("dragleave", onDragLeave); window.addEventListener("drop", onDrop);
    return () => { window.removeEventListener("paste", onPaste); window.removeEventListener("dragover", onDragOver); window.removeEventListener("dragleave", onDragLeave); window.removeEventListener("drop", onDrop); };
  }, [addFiles]);

  function submit() {
    if (!canSend) return;
    let text = value.trim();
    let commandName: string | null = null;
    if (command) {
      const req = command.command.needs.length;
      const args = command.args.map((a) => a.trim());
      if (!args[0]) { setHint(`${command.command.cmd} needs ${command.command.args.split(" ")[0]} — for example ${command.command.cmd} EVRA`); slotRefs.current[0]?.focus(); return; }
      if (command.command.needs[0] === "icao" && !/^[A-Za-z]{4}$/.test(args[0])) { setHint(`${command.command.cmd} needs a four-letter ICAO code.`); slotRefs.current[0]?.focus(); return; }
      if (command.command.needs[0] === "icao") args[0] = args[0].toUpperCase();
      text = [command.command.ask(args), text].filter(Boolean).join(" ");
      commandName = command.command.cmd; void req;
    }
    setHint(null);
    const ids = attachments.filter((a) => a.state === "uploaded" && a.id).map((a) => a.id as string);
    onSend(text, ids, { mentions: inserted, command: commandName });
    setValue(""); setAttachments([]); setInserted([]); setCommand(null); setMenu("none");
  }

  function pickMention(m: Mention) {
    setInserted((list) => [...list, m]);
    setValue((v) => v.replace(/(?:^|\s)@\S*$/, (s) => `${s.startsWith(" ") ? " " : ""}@${m.primary} `));
    setMenu("none"); inputRef.current?.focus();
  }
  function pickCommand(c: Command) {
    setValue((v) => v.replace(/(?:^|\s)\/\S*$/, "").trimEnd());
    setCommand({ command: c, args: c.optional ? ["", ""] : [""], slot: 0 });
    setMenu("none");
    setTimeout(() => slotRefs.current[0]?.focus(), 0);
  }

  function onKey(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (menu !== "none") {
      const list = menu === "mention" ? mentions : commands;
      if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, list.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); return; }
      if (e.key === "Enter" && list.length) { e.preventDefault(); if (menu === "mention") pickMention(mentions[highlight]); else pickCommand(commands[highlight]); return; }
      if (e.key === "Tab" && menu === "mention") { e.preventDefault(); setMentionType((t) => { const i = t === "all" ? -1 : TYPES.indexOf(t); return i + 1 >= TYPES.length ? "all" : TYPES[i + 1]; }); return; }
      if (e.key === "Escape") { e.preventDefault(); setMenu("none"); setValue((v) => v.replace(/(?:^|\s)[@/]\S*$/, "")); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); return; }
    if (e.key === "Escape" && streaming) { e.preventDefault(); onStop(); return; }
    if (e.key === "Backspace" && !value && inserted.length) { setInserted((l) => l.slice(0, -1)); }
  }

  const placeholder = placeholderOverride ?? (locked ? "" : offline ? "You're offline — questions will send when you're back" : context ? `Ask about ${context.kind === "flight" ? context.label : context.icao ?? context.label}…` : panel ? "Ask, @ a flight or airport, / for an action…" : "Ask, type @ for a flight or airport, / for an action…");
  const boxRadius = panel ? 14 : 16;

  return (
    <div style={{ padding: panel ? "10px 14px 14px" : "16px 24px 20px", borderTop: panel ? `1px solid ${C.divider}` : "none", background: panel ? C.surface : `linear-gradient(rgba(251,251,252,0), ${C.page} 30%)`, position: "relative" }}>
      <div style={{ maxWidth: panel ? "none" : 800, margin: "0 auto", position: "relative" }}>
        {dragging && (
          <div className="ag-dropzone-in" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); setDragging(false); }} style={{ position: "absolute", left: 0, right: 0, bottom: "100%", marginBottom: 8, height: 150, border: `2px dashed ${C.primary}`, background: C.primaryTint3, borderRadius: 16, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, zIndex: 5 }}>
            <Icon name="file-up" size={24} color={C.primary} />
            <span style={{ fontSize: 15, fontWeight: 700, color: C.primaryHover }}>Drop to attach</span>
            <span style={{ fontSize: 12.5, color: C.primaryOnTint }}>PDF, images, CSV, XLSX, TXT · up to 25 MB each · the whole thread is the drop target</span>
          </div>
        )}
        {menu === "mention" && (
          <div className="ag-menu-in" role="listbox" style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0, background: C.surface, border: `1px solid ${C.borderControl}`, borderRadius: panel ? 12 : 14, boxShadow: panel ? SHADOW.menuPanel : SHADOW.menu, zIndex: 20, overflow: "hidden" }}>
            <div style={{ display: "flex", gap: 4, padding: "8px 8px 0", borderBottom: `1px solid ${C.divider}`, overflowX: "auto" }}>
              {(["all", ...TYPES] as const).map((t) => <button key={t} type="button" onClick={() => setMentionType(t)} style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: mentionType === t ? 700 : 500, color: mentionType === t ? C.ink : C.muted, background: "transparent", border: "none", borderBottom: `2px solid ${mentionType === t ? C.ink : "transparent"}`, padding: "6px 9px 9px", cursor: "pointer", whiteSpace: "nowrap" }}>{t === "all" ? "All" : `@${t}`}</button>)}
            </div>
            <div style={{ padding: "6px 6px 2px", maxHeight: 280, overflowY: "auto" }}>
              {!query && mentions.some((m) => m.tag) && <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", color: C.faint, padding: "4px 10px" }}>ON THIS PAGE</div>}

              {mentions.length === 0 && (
                <div style={{ padding: "10px 10px 8px", fontSize: 13, color: C.muted }}>
                  {searching ? "Searching…" : query.length < 2 ? "Type a callsign, ICAO, registration, limitation ID or document name…" : `No ${mentionType === "all" ? "matches" : `${mentionType}s`} for “${query}”`}
                </div>
              )}
              {mentions.map((m, i) => (<Fragment key={`${m.type}:${m.id}`}>
                {mentionType === "all" && !m.tag && (i === 0 || mentions[i - 1].type !== m.type || mentions[i - 1].tag) && <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", color: C.faint, padding: "6px 10px 2px" }}>{m.type.toUpperCase()}S</div>}
                <button type="button" role="option" aria-selected={i === highlight} onMouseEnter={() => setHighlight(i)} onClick={() => pickMention(m)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: panel ? "7px 8px" : "8px 10px", borderRadius: 8, border: "none", background: i === highlight || m.tag === "SELECTED" ? C.primaryTint : "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", marginTop: m.tag === "VISIBLE" && mentions[i - 1]?.tag === "SELECTED" ? 6 : 0 }}>
                  <span style={{ width: panel ? 24 : 26, height: panel ? 24 : 26, borderRadius: 7, background: TYPE_LOOK[m.type].bg, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon name={TYPE_LOOK[m.type].icon} size={14} color={TYPE_LOOK[m.type].fg} /></span>
                  <span style={m.type === "limitation" ? { fontSize: 13.5, fontWeight: 600 } : mono({ fontSize: 13.5, fontWeight: 600 })}><Highlight text={m.primary} prefix={query} /></span>
                  <span style={{ fontSize: 13, color: C.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.secondary}</span>
                  <span style={{ fontSize: m.tag ? 10.5 : 11.5, fontWeight: m.tag ? 700 : 400, color: m.tag === "SELECTED" ? C.primaryHover : C.faint }}>{m.tag ?? `@${m.type}`}</span>
                </button>
              </Fragment>))}
            </div>
            <div style={{ display: "flex", gap: 14, padding: "8px 16px", borderTop: `1px solid ${C.divider}`, background: C.page, fontSize: 12, color: C.faint }}><span>↑↓ move</span><span>⏎ insert</span><span>Tab next type</span><span>Esc close</span><span style={{ flex: 1 }} /><span>Flights search Leon live</span></div>
          </div>
        )}
        {menu === "command" && commands.length > 0 && (
          <div className="ag-menu-in" role="listbox" style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0, background: C.surface, border: `1px solid ${C.borderControl}`, borderRadius: 14, boxShadow: SHADOW.menu, padding: 6, zIndex: 20 }}>
            {commands.map((c, i) => (
              <button key={c.cmd} type="button" role="option" aria-selected={i === highlight} onMouseEnter={() => setHighlight(i)} onClick={() => pickCommand(c)} style={{ width: "100%", display: "grid", gridTemplateColumns: "30px 90px minmax(0,1fr) auto", gap: 10, alignItems: "center", padding: "9px 10px", borderRadius: 8, border: "none", background: i === highlight ? C.primaryTint : "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <span style={{ width: 28, height: 28, borderRadius: 7, background: i === highlight ? C.ink : C.hover, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name={c.icon} size={14} color={i === highlight ? C.surface : C.body} /></span>
                <span style={mono({ fontSize: 13.5, fontWeight: 600 })}>{c.cmd}</span>
                <span style={{ minWidth: 0 }}><span style={{ fontSize: 13.5 }}>{c.description}</span> <span style={{ ...mono({ fontSize: 12 }), color: C.faint }}>{c.args}</span></span>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: c.kindColor }}>{c.kind}</span>
              </button>
            ))}
          </div>
        )}

        {hint && <div role="alert" style={{ fontSize: 12, color: C.warn, padding: "0 4px 6px" }}>{hint}</div>}
        {tooLarge.length > 0 && !uploading && <div style={{ fontSize: 12, color: C.warn, padding: "0 4px 6px" }}>Sending waits for the upload · {tooLarge.map((a) => a.name).join(", ")} won&apos;t be sent</div>}

        <div style={{ background: locked ? C.sidebar : C.surface, border: `1px solid ${C.borderControl}`, borderRadius: boxRadius, boxShadow: panel ? "none" : SHADOW.composer }} className="ag-composer">
          {attachments.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "12px 12px 0" }}>{attachments.map((a) => <AttachmentChipView key={a.localId} a={a} onRemove={() => setAttachments((l) => l.filter((x) => x.localId !== a.localId))} onRetry={() => { setAttachments((l) => l.map((x) => (x.localId === a.localId ? { ...x, state: "uploading", progress: 0 } : x))); startUpload(a); }} />)}</div>}
          {command && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: panel ? "10px 12px 0" : "12px 16px 0", flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.ink, color: C.surface, ...mono({ fontSize: 13.5, fontWeight: 600 }), borderRadius: 7, padding: "3px 6px 3px 8px" }}>
                {command.command.cmd}
                <button type="button" onClick={() => setCommand(null)} aria-label="Remove command" style={{ width: 15, height: 15, borderRadius: 4, background: "rgba(255,255,255,.14)", border: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}><Icon name="x" size={9} color={C.surface} /></button>
              </span>
              {command.args.map((arg, i) => (
                <input key={i} ref={(el) => { slotRefs.current[i] = el; }} value={arg} placeholder={i === 0 ? command.command.args.split(" ")[0] : `${command.command.optional} · optional`} aria-label={`Argument ${i + 1}`}
                  onChange={(e) => setCommand((c) => c ? { ...c, args: c.args.map((a, j) => (j === i ? e.target.value : a)) } : c)}
                  onKeyDown={(e) => { if (e.key === "Tab" && i < command.args.length - 1) { e.preventDefault(); slotRefs.current[i + 1]?.focus(); } if (e.key === "Backspace" && !arg && i === 0) { e.preventDefault(); setCommand(null); inputRef.current?.focus(); } if (e.key === "Enter") { e.preventDefault(); submit(); } if (e.key === "Escape") { setCommand(null); inputRef.current?.focus(); } }}
                  style={{ ...mono({ fontSize: 13.5 }), color: i === 0 || arg ? C.primaryHover : C.faint, background: i === 0 || arg ? C.primaryTint3 : "transparent", border: i === 0 || arg ? `1px solid ${C.primary}` : `1px dashed ${C.borderControl}`, borderRadius: 7, padding: "2px 8px", outline: "none", minWidth: 90 }} />
              ))}
              <span style={{ fontSize: 12, color: C.faint, marginLeft: "auto" }}>Tab next argument · ⌫ on empty removes command</span>
            </div>
          )}
          {locked ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: panel ? "11px 13px" : "14px 16px", fontSize: panel ? 13.5 : 14, color: C.muted }}><Icon name="lock" size={14} color={C.faint} />{locked}</div>
          ) : (
            <textarea ref={inputRef} rows={1} value={value} disabled={streaming && false} onChange={(e) => setValue(e.target.value)} onKeyDown={onKey} placeholder={placeholder} aria-label="Message"
              style={{ width: "100%", border: "none", outline: "none", resize: "none", padding: panel ? "11px 13px 4px" : "14px 16px 6px", fontFamily: "inherit", fontSize: panel ? 14 : 15, lineHeight: panel ? 1.5 : 1.6, color: C.ink, background: "transparent", minHeight: panel ? 38 : 48, maxHeight: 8 * 24, boxSizing: "border-box", overflowY: "auto" }} />
          )}
          <div style={{ display: "flex", alignItems: "center", gap: panel ? 2 : 4, padding: panel ? "4px 6px 6px" : "6px 8px 8px" }}>
            <input ref={fileRef} type="file" accept={ACCEPT} multiple style={{ display: "none" }} onChange={(e) => { addFiles(e.target.files); if (fileRef.current) fileRef.current.value = ""; }} />
            <IconButton icon="paperclip" title="Attach" size={panel ? 30 : 34} iconSize={panel ? 15 : 17} onClick={() => fileRef.current?.click()} disabled={Boolean(locked)} />
            <IconButton icon="at-sign" title="Mention" size={panel ? 30 : 34} iconSize={panel ? 15 : 17} onClick={() => { setValue((v) => `${v}${v && !v.endsWith(" ") ? " " : ""}@`); inputRef.current?.focus(); }} disabled={Boolean(locked)} />
            <IconButton icon="slash" title="Command" size={panel ? 30 : 34} iconSize={panel ? 15 : 17} onClick={() => { setValue((v) => `${v}${v && !v.endsWith(" ") ? " " : ""}/`); inputRef.current?.focus(); }} disabled={Boolean(locked) || Boolean(command)} />
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: panel ? 11 : 12, color: C.faint, marginRight: 8, display: panel ? undefined : "inline-flex", gap: 10 }}>{panel ? <>hold <span style={mono()}>{kb.label("voice")}</span></> : <><span><span style={mono()}>⏎</span> send</span><span><span style={mono()}>⇧⏎</span> new line</span><span>hold <span style={mono()}>{kb.label("voice")}</span> to talk</span></>}</span>
            {voiceEnabled && (
              <button type="button" title="Hold to talk" aria-label="Hold to talk" onClick={onVoice} className="ag-hover ag-focus" style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
                <Orb size={22} state="idle" title="Voice" />
              </button>
            )}
            {streaming ? (
              <button type="button" onClick={onStop} className="ag-focus" style={{ fontFamily: "inherit", fontSize: panel ? 12.5 : 13.5, fontWeight: 600, color: C.stop, background: C.stopTint, border: `1px solid ${C.stopBorder}`, borderRadius: panel ? 8 : 9, padding: panel ? "5px 10px" : "8px 14px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: C.stopSquare }} />{panel ? "Stop · Esc" : <>Stop<Keycap>Esc</Keycap></>}
              </button>
            ) : (
              <button type="button" onClick={submit} disabled={!canSend} title="Send" aria-label="Send" className="ag-focus" style={{ width: panel ? 32 : 36, height: panel ? 32 : 36, borderRadius: panel ? 9 : 10, border: "none", background: locked ? C.disabledFill : canSend ? C.primary : C.sendEmpty, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: canSend ? "pointer" : "default", padding: 0 }}>
                <Icon name="arrow-up" size={panel ? 15 : 17} color={C.surface} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
