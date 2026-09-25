"use client";

// The non-PDF views (spec §V8) and the state card (§V9). Images pan and zoom to
// 400% with a minimap; tables freeze the header row and number the rows;
// text is shown exactly as received in mono with line numbers; DOCX is a
// rendered preview via mammoth. Search in these views is the same yellow.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { C, SHADOW, mono } from "../ui/tokens";
import { Button, Icon } from "../ui/primitives";
import { normalise } from "./locate";
import type { DocRef } from "./types";
import type { TableData } from "../types";

// ── State card ────────────────────────────────────────────────────────────────
export function StateCard({ icon, tone, kind, title, body, diag, note, actions, children }: { icon: string; tone: "neutral" | "red" | "amber"; kind: string; title: string; body: string; diag?: string | null; note?: string | null; actions?: { label: string; primary?: boolean; onClick?: () => void; href?: string | null; external?: boolean }[]; children?: React.ReactNode }) {
  const border = tone === "red" ? C.dangerBorder : tone === "amber" ? C.warnBorder : C.border;
  const kindColor = tone === "red" ? C.danger : tone === "amber" ? C.warn : C.faint;
  const tileBg = tone === "red" ? C.dangerTint : tone === "amber" ? C.warnTint : C.hover;
  const tileFg = tone === "red" ? C.dangerBadge : tone === "amber" ? C.warn : C.body;
  const firstRef = useRef<HTMLButtonElement | HTMLAnchorElement | null>(null);
  useEffect(() => { firstRef.current?.focus(); }, []);
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "auto", background: C.page, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 24px" }}>
      <div role="group" aria-label={title} style={{ width: 460, maxWidth: "100%", background: C.surface, border: `1px solid ${border}`, borderRadius: 14, padding: 24, display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 1px 2px rgba(16,18,22,.04)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 40, height: 40, borderRadius: 10, background: tileBg, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon name={icon} size={20} color={tileFg} /></span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: kindColor }}>{kind}</div>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.01em" }}>{title}</div>
          </div>
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: C.body }}>{body}</div>
        {diag && <div style={{ ...mono({ fontSize: 11.5 }), color: C.faint }}>{diag}</div>}
        {children}
        {note && <div style={{ fontSize: 12.5, color: C.muted, borderTop: `1px solid ${C.divider}`, paddingTop: 12 }}>{note}</div>}
        {actions && actions.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {actions.map((a, i) => a.href
              ? <a key={a.label} ref={i === 0 ? (firstRef as React.RefObject<HTMLAnchorElement>) : undefined} href={a.href} target={a.external ? "_blank" : undefined} rel={a.external ? "noopener noreferrer" : undefined} download={!a.external && !a.href.includes("?inline") ? "" : undefined} style={{ textDecoration: "none" }}><Button variant={a.primary ? "primary" : "secondary"} size="sm">{a.label}{a.external ? " ↗" : ""}</Button></a>
              : <Button key={a.label} ref={i === 0 ? (firstRef as React.RefObject<HTMLButtonElement>) : undefined} variant={a.primary ? "primary" : "secondary"} size="sm" onClick={a.onClick}>{a.label}</Button>)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Image ─────────────────────────────────────────────────────────────────────
export const IMAGE_ZOOMS = [50, 75, 100, 125, 150, 200, 300, 400];
export function ImageView({ url, zoom, onZoom, onMeta, onError, canvasWidth, canvasHeight }: { url: string; zoom: number | "fit"; onZoom: (z: number | "fit", effective: number) => void; onMeta: (m: { w: number; h: number }) => void; onError: (kind: "fetch" | "permission" | "render", detail: string) => void; canvasWidth: number; canvasHeight: number }) {
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => { let alive = true; let obj: string | null = null; fetch(url, { credentials: "same-origin" }).then(async (r) => { if (!r.ok) { onError(r.status === 401 || r.status === 403 ? "permission" : "fetch", `HTTP ${r.status}`); return; } const b = await r.blob(); if (!alive) return; obj = URL.createObjectURL(b); setSrc(obj); }).catch((e) => onError("fetch", String(e))); return () => { alive = false; if (obj) URL.revokeObjectURL(obj); }; }, [url, onError]);
  const fit = nat ? Math.min((canvasWidth - 56) / nat.w, (canvasHeight - 48) / nat.h, 1) : 1;
  const scale = zoom === "fit" ? fit : zoom / 100;
  useEffect(() => { onZoom(zoom, Math.round(scale * 100)); }, [zoom, scale, onZoom]);
  const zoomed = nat ? nat.w * scale > canvasWidth - 56 || nat.h * scale > canvasHeight - 48 : false;
  useEffect(() => { if (!zoomed) setPan({ x: 0, y: 0 }); }, [zoomed]);
  const onDown = (e: React.PointerEvent) => { if (!zoomed) return; drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); };
  const onMove = (e: React.PointerEvent) => { if (!drag.current) return; setPan({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) }); };
  const onUp = () => { drag.current = null; };
  const onKey = (e: React.KeyboardEvent) => { if (!zoomed) return; const d = 40; if (e.key === "ArrowLeft") setPan((p) => ({ ...p, x: p.x + d })); if (e.key === "ArrowRight") setPan((p) => ({ ...p, x: p.x - d })); if (e.key === "ArrowUp") setPan((p) => ({ ...p, y: p.y + d })); if (e.key === "ArrowDown") setPan((p) => ({ ...p, y: p.y - d })); };
  const onWheel = (e: React.WheelEvent) => { if (!(e.metaKey || e.ctrlKey)) return; e.preventDefault(); const cur = zoom === "fit" ? Math.round(fit * 100) : zoom; const i = IMAGE_ZOOMS.findIndex((z) => z >= cur); const next = e.deltaY < 0 ? IMAGE_ZOOMS[Math.min(IMAGE_ZOOMS.length - 1, (i === -1 ? IMAGE_ZOOMS.length - 1 : i) + 1)] : IMAGE_ZOOMS[Math.max(0, (i === -1 ? IMAGE_ZOOMS.length : i) - 1)]; onZoom(next, next); };
  const vw = nat ? Math.min(1, (canvasWidth - 56) / (nat.w * scale)) : 1, vh = nat ? Math.min(1, (canvasHeight - 48) / (nat.h * scale)) : 1;
  return (
    <div role="document" tabIndex={0} aria-label="Image" onKeyDown={onKey} onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden", background: C.viewerCanvasImage, cursor: zoomed ? (drag.current ? "grabbing" : "grab") : "default", display: "flex", alignItems: "center", justifyContent: "center", outline: "none" }}>
      {src && <img src={src} alt="" draggable={false} onLoad={(e) => { const im = e.currentTarget; const m = { w: im.naturalWidth, h: im.naturalHeight }; setNat(m); onMeta(m); }} onError={() => onError("render", "image could not be decoded")} style={{ width: nat ? nat.w * scale : undefined, height: nat ? nat.h * scale : undefined, transform: `translate(${pan.x}px, ${pan.y}px)`, boxShadow: "0 1px 3px rgba(16,18,22,.12), 0 8px 20px rgba(16,18,22,.05)", userSelect: "none", transition: drag.current ? "none" : "width 120ms, height 120ms" }} />}
      {zoomed && nat && src && (
        <div aria-hidden style={{ position: "absolute", right: 16, bottom: 16, width: 168, background: C.surface, border: `1px solid ${C.borderControl}`, borderRadius: 10, boxShadow: "0 6px 16px rgba(16,18,22,.14)", padding: 8 }}>
          <div style={{ position: "relative", height: 112, background: C.viewerCanvasImage, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img src={src} alt="" style={{ maxWidth: "100%", maxHeight: "100%" }} />
            <div style={{ position: "absolute", border: `2px solid ${C.primary}`, background: "rgba(37,99,235,.08)", width: `${vw * 100}%`, height: `${vh * 100}%`, left: `${(50 - vw * 50) - (pan.x / (nat.w * scale)) * 100}%`, top: `${(50 - vh * 50) - (pan.y / (nat.h * scale)) * 100}%` }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted, marginTop: 6 }}><span>Drag to pan</span><span style={mono({ fontSize: 11 })}>{Math.round(scale * 100)}%</span></div>
        </div>
      )}
    </div>
  );
}

// ── Table (CSV / XLSX / agent result) ─────────────────────────────────────────
type Sheet = { name: string; rows: string[][] };
export function TableView({ url, table, query, onMeta, onError, onSearch, citedRows }: { url: string | null; table?: TableData | null; query: string; onMeta: (m: { rows: number; cols: number; sheets: number }) => void; onError: (kind: "fetch" | "permission" | "render", detail: string) => void; onSearch: (r: { count: number; current: number; pages: number[] }) => void; citedRows?: Set<number> }) {
  const [sheets, setSheets] = useState<Sheet[] | null>(table ? [{ name: table.title ?? "Result", rows: [table.columns, ...table.rows] }] : null);
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (table || !url) return; let alive = true;
    (async () => {
      try {
        const r = await fetch(url, { credentials: "same-origin" }); if (!r.ok) { onError(r.status === 401 || r.status === 403 ? "permission" : "fetch", `HTTP ${r.status}`); return; }
        const buf = await r.arrayBuffer(); if (!alive) return;
        const XLSX = await import("xlsx");
        const wb = XLSX.read(buf, { type: "array" });
        const out: Sheet[] = wb.SheetNames.map((name) => ({ name, rows: (XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: "" }) as string[][]).map((r) => r.map((c) => String(c ?? ""))) }));
        if (!alive) return; setSheets(out);
      } catch (e) { onError("render", `table.parse → ${(e as Error)?.message ?? "error"}`); }
    })();
    return () => { alive = false; };
  }, [url, table, onError]);
  const sheet = sheets?.[active] ?? null;
  const header = sheet?.rows[0] ?? [], body = sheet?.rows.slice(1) ?? [];
  useEffect(() => { if (sheet) onMeta({ rows: body.length, cols: header.length, sheets: sheets?.length ?? 1 }); }, [sheet, body.length, header.length, sheets?.length, onMeta]);
  const q = normalise(query).toLowerCase();
  const hits = useMemo(() => { if (!q) return []; const out: [number, number][] = []; body.forEach((r, i) => r.forEach((c, j) => { if (String(c).toLowerCase().includes(q)) out.push([i, j]); })); return out; }, [q, body]);
  useEffect(() => { onSearch({ count: hits.length, current: hits.length ? 1 : 0, pages: [] }); }, [hits, onSearch]);
  const isMono = (v: string) => /^[A-Z0-9][A-Z0-9:\-/. ]{2,}$|^\d{1,2}:\d{2}|^\d{4}-\d{2}-\d{2}/.test(v);
  return (
    <div role="document" tabIndex={0} aria-label="Table" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: C.surface, outline: "none" }}>
      {sheets && sheets.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderBottom: `1px solid ${C.divider}`, fontSize: 12.5 }}>
          {sheets.map((s, i) => <button key={s.name} type="button" onClick={() => setActive(i)} style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: i === active ? 700 : 500, color: i === active ? C.ink : C.muted, background: i === active ? C.surface : "transparent", border: `1px solid ${i === active ? C.borderControl : "transparent"}`, borderRadius: 7, padding: "5px 10px", cursor: "pointer" }}>{s.name}</button>)}
          <span style={{ flex: 1 }} /><span style={{ fontSize: 12, color: C.muted }}>{body.length} rows · {header.length} columns · header row frozen</span>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {sheet ? (
          <table style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: "100%" }}>
            <thead><tr><th style={{ position: "sticky", top: 0, zIndex: 2, width: 44, background: C.page, borderBottom: `1px solid ${C.divider}`, borderRight: `1px solid ${C.divider}` }} />{header.map((h, j) => <th key={j} style={{ position: "sticky", top: 0, zIndex: 1, background: C.page, textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: C.faint, padding: "9px 12px", borderBottom: `1px solid ${C.divider}`, borderRight: `1px solid ${C.divider}`, whiteSpace: "nowrap" }}>{String(h).toUpperCase()}</th>)}</tr></thead>
            <tbody>
              {body.map((r, i) => (
                <tr key={i} style={{ background: citedRows?.has(i) ? C.citeHighlight : undefined }}>
                  <td style={{ ...mono({ fontSize: 12 }), color: C.faint, textAlign: "right", padding: "9px 12px", borderBottom: `1px solid ${C.dividerRow}`, borderRight: `1px solid ${C.divider}`, userSelect: "none" }}>{i + 1}</td>
                  {header.map((_, j) => { const v = String(r[j] ?? ""); const hit = q && v.toLowerCase().includes(q); return <td key={j} style={{ fontSize: 13, padding: "9px 12px", borderBottom: `1px solid ${C.dividerRow}`, borderRight: `1px solid ${C.dividerRow}`, whiteSpace: "nowrap", ...(isMono(v) ? mono({ fontSize: 12.5 }) : {}), color: v ? C.ink : C.disabledFill, background: hit ? C.searchMatch : undefined }}>{v || "—"}</td>; })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div style={{ padding: 24, fontSize: 13, color: C.muted }}>Opening…</div>}
      </div>
      {sheets && sheets.length <= 1 && sheet && <div style={{ padding: "8px 16px", borderTop: `1px solid ${C.divider}`, fontSize: 12, color: C.muted, textAlign: "right" }}>{body.length} rows · {header.length} columns · header row frozen</div>}
    </div>
  );
}

// ── Text / raw ────────────────────────────────────────────────────────────────
export function TextView({ url, query, citedSpan, onMeta, onError, onSearch, onCitationResult }: { url: string; query: string; citedSpan: string | null; onMeta: (m: { lines: number }) => void; onError: (kind: "fetch" | "permission" | "render" | "empty", detail: string) => void; onSearch: (r: { count: number; current: number; pages: number[] }) => void; onCitationResult?: (found: boolean) => void }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => { let alive = true; fetch(url, { credentials: "same-origin" }).then(async (r) => { if (!r.ok) { onError(r.status === 401 || r.status === 403 ? "permission" : "fetch", `HTTP ${r.status}`); return; } const t = await r.text(); if (!alive) return; if (!t.length) { onError("empty", "0 bytes"); return; } setText(t); onMeta({ lines: t.split("\n").length }); }).catch((e) => onError("fetch", String(e))); return () => { alive = false; }; }, [url, onError, onMeta]);
  const lines = useMemo(() => (text ?? "").split("\n"), [text]);
  const q = normalise(query).toLowerCase();
  const hitLines = useMemo(() => new Set(q ? lines.map((l, i) => (l.toLowerCase().includes(q) ? i : -1)).filter((i) => i >= 0) : []), [lines, q]);
  useEffect(() => { onSearch({ count: hitLines.size, current: hitLines.size ? 1 : 0, pages: [] }); }, [hitLines, onSearch]);
  const cited = useMemo(() => { if (!citedSpan || !text) return new Set<number>(); const needle = normalise(citedSpan); const norm = normalise(text); const found = norm.includes(needle); onCitationResult?.(found); if (!found) return new Set<number>(); const first = needle.split(" ")[0]; const out = new Set<number>(); lines.forEach((l, i) => { if (normalise(l).includes(first) && needle.includes(normalise(l).slice(0, 30))) out.add(i); }); return out; }, [citedSpan, text, lines, onCitationResult]);
  const mark = (line: string) => { if (!q) return line; const parts: React.ReactNode[] = []; let i = 0; const low = line.toLowerCase(); let j = low.indexOf(q); while (j !== -1) { parts.push(line.slice(i, j)); parts.push(<mark key={j} className="cw-search-hit">{line.slice(j, j + q.length)}</mark>); i = j + q.length; j = low.indexOf(q, i); } parts.push(line.slice(i)); return parts; };
  return (
    <div role="document" tabIndex={0} aria-label="Text" style={{ flex: 1, minHeight: 0, overflow: "auto", background: C.surface, outline: "none" }}>
      {text === null ? <div style={{ padding: 24, fontSize: 13, color: C.muted }}>Opening…</div> : (
        <pre style={{ ...mono({ fontSize: 13.5 }), lineHeight: 1.75, margin: 0, padding: "16px 0", whiteSpace: "pre", overflow: "visible" }}>
          {lines.map((l, i) => <div key={i} style={{ display: "flex", background: cited.has(i) ? C.citeHighlight : hitLines.has(i) ? "transparent" : undefined }}><span aria-hidden style={{ width: 56, flex: "none", textAlign: "right", paddingRight: 16, color: C.disabledFill, userSelect: "none" }}>{i + 1}</span><span style={{ paddingRight: 24 }}>{mark(l)}</span></div>)}
        </pre>
      )}
    </div>
  );
}

// ── DOCX rendered preview ─────────────────────────────────────────────────────
export function DocxView({ url, query, onMeta, onError, onSearch, canvasWidth }: { url: string; query: string; onMeta: () => void; onError: (kind: "fetch" | "permission" | "render", detail: string) => void; onSearch: (r: { count: number; current: number; pages: number[] }) => void; canvasWidth: number }) {
  const [html, setHtml] = useState<string | null>(null);
  const host = useRef<HTMLDivElement | null>(null);
  useEffect(() => { let alive = true; (async () => { try { const r = await fetch(url, { credentials: "same-origin" }); if (!r.ok) { onError(r.status === 401 || r.status === 403 ? "permission" : "fetch", `HTTP ${r.status}`); return; } const buf = await r.arrayBuffer(); const mammoth = await import("mammoth"); const out = await mammoth.convertToHtml({ arrayBuffer: buf }); if (!alive) return; setHtml(out.value); onMeta(); } catch (e) { onError("render", `docx.render → ${(e as Error)?.message ?? "error"}`); } })(); return () => { alive = false; }; }, [url, onError, onMeta]);
  // search: wrap matches in the rendered text
  const count = useMemo(() => { if (!html) return 0; const q = normalise(query).toLowerCase(); if (!q) return 0; const text = html.replace(/<[^>]+>/g, " ").toLowerCase(); let n = 0, i = text.indexOf(q); while (i !== -1) { n += 1; i = text.indexOf(q, i + q.length); } return n; }, [html, query]);
  useEffect(() => { onSearch({ count, current: count ? 1 : 0, pages: [] }); }, [count, onSearch]);
  useEffect(() => {
    const el = host.current; if (!el || !html) return;
    el.innerHTML = html;
    const q = normalise(query).toLowerCase(); if (!q) return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const nodes: Text[] = []; while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    for (const node of nodes) { const low = node.textContent!.toLowerCase(); let i = low.indexOf(q); if (i === -1) continue; const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + q.length); const m = document.createElement("mark"); m.className = "cw-search-hit"; try { range.surroundContents(m); } catch { /* crosses elements */ } }
  }, [html, query]);
  const w = Math.min(canvasWidth - 56, 900);
  return (
    <div role="document" tabIndex={0} aria-label="Document" style={{ flex: 1, minHeight: 0, overflow: "auto", background: C.viewerCanvas, padding: "24px 28px", outline: "none" }}>
      {html === null ? <div style={{ width: w, margin: "0 auto", background: C.surface, minHeight: 520, padding: 48, boxShadow: SHADOW.frame }}><div className="cw-skel" style={{ height: 10, width: "80%", background: C.hover, borderRadius: 3 }} /></div>
        : <div ref={host} className="cw-docx" style={{ width: w, margin: "0 auto", background: C.surface, padding: "56px 64px", boxShadow: "0 1px 3px rgba(16,18,22,.12), 0 8px 20px rgba(16,18,22,.05)", fontSize: 14.5, lineHeight: 1.6 }} />}
    </div>
  );
}

export function docTileLook(kind: string, ref: DocRef): { bg: string; border: string; fg: string; label: string } {
  const ext = String(ref.filename).split(".").pop()?.toUpperCase() ?? "";
  if (kind === "pdf") return { bg: C.dangerTint, border: C.dangerBorder, fg: C.dangerBadge, label: "PDF" };
  if (kind === "table") return { bg: C.okTint, border: C.okBorder, fg: C.ok, label: ext === "CSV" ? "CSV" : "XLSX" };
  if (kind === "docx") return { bg: C.primaryTint2, border: C.primaryBorder, fg: C.primaryHover, label: "DOCX" };
  return { bg: C.hover, border: C.border, fg: C.muted, label: (ext || "FILE").slice(0, 4) };
}

export const noop = () => {};
export const useStableCallback = <T extends (...a: never[]) => unknown>(fn: T) => { const r = useRef(fn); r.current = fn; return useCallback(((...a: Parameters<T>) => r.current(...a)) as T, []); };
