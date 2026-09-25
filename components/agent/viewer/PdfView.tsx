"use client";

// PDF renderer for the viewer (spec §V4.7, §V6, §V9). pdf.js with range
// requests, so the cited/target page is fetched and drawn first; a text layer
// for selection, search (yellow) and citations (blue, exact match only);
// thumbnails; password and scanned detection. Nothing here is ever drawn from
// the model's words — highlights come from the file's own text layer.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { C, VIEWER, mono } from "../ui/tokens";
import { buildPageText, findAll, findExact, hitToItemRanges, normalise, type Hit, type PageText } from "./locate";
import type { Citation, CitationResult } from "./types";

type Pdfjs = typeof import("pdfjs-dist");
type PDFDocumentProxy = import("pdfjs-dist").PDFDocumentProxy;
type PDFPageProxy = import("pdfjs-dist").PDFPageProxy;

export type PdfHandle = {
  goToPage: (n: number, behavior?: "smooth" | "auto") => void;
  setZoom: (z: number | "fit") => void;
  rotate: () => void;
  search: (q: string) => void;
  nextMatch: (dir: 1 | -1) => void;
  locate: (c: Citation) => Promise<CitationResult>;
  focusCitation: (k: number) => void;
  submitPassword: (pw: string) => void;
  retry: () => void;
};

export type PdfStatus =
  | { state: "loading"; loaded: number; total: number | null }
  | { state: "progressive"; loaded: number; total: number | null; page: number; pages: number }
  | { state: "ready"; pages: number; scanned: boolean }
  | { state: "password"; wrong: boolean }
  | { state: "error"; code: "render" | "fetch" | "permission" | "empty" | "toolarge"; detail: string };

const ZOOMS = [50, 75, 100, 125, 150, 200];
let pdfjsPromise: Promise<Pdfjs> | null = null;
async function loadPdfjs(): Promise<Pdfjs> {
  if (!pdfjsPromise) pdfjsPromise = import("pdfjs-dist").then((m) => { m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"; return m; });
  return pdfjsPromise;
}

export const PdfView = forwardRef<PdfHandle, {
  url: string;
  bytes: number | null;
  targetPage: number;
  /** Keep the document (and its password callback) alive while a state card covers it. */
  hidden?: boolean;
  zoom: number | "fit";
  rotation: number;
  canvasWidth: number;
  thumbnails: boolean;
  citations: Citation[];
  activeCitation: number | null;
  scanned?: boolean;
  onStatus: (s: PdfStatus) => void;
  onPage: (n: number) => void;
  onZoom: (z: number | "fit", effective: number) => void;
  onRotation: (deg: number) => void;
  onSearch: (r: { count: number; current: number; pages: number[] }) => void;
  onCitationResult: (r: CitationResult) => void;
  onAnnounce: (text: string) => void;
  reducedMotion: boolean;
}>(function PdfView({ url, bytes, targetPage, hidden, zoom, rotation, canvasWidth, thumbnails, citations, activeCitation, onStatus, onPage, onZoom, onRotation, onSearch, onCitationResult, onAnnounce, reducedMotion }, ref) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const pageEls = useRef<Map<number, HTMLDivElement>>(new Map());
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState(0);
  const [baseSize, setBaseSize] = useState<{ w: number; h: number } | null>(null); // page 1 at scale 1
  const [rendered, setRendered] = useState<Set<number>>(new Set());
  const [visible, setVisible] = useState<Set<number>>(() => new Set([Math.max(1, targetPage)]));  // the target page renders first (§V9)
  const [current, setCurrent] = useState(Math.max(1, targetPage));
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<{ page: number; hit: Hit }[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [cites, setCites] = useState<Record<number, { page: number; ranges: { item: number; from: number; to: number }[]; contPage?: number; contRanges?: { item: number; from: number; to: number }[] }>>({});
  const [scanned, setScanned] = useState(false);
  const textCache = useRef<Map<number, PageText>>(new Map());
  const pageCache = useRef<Map<number, PDFPageProxy>>(new Map());
  const passwordCb = useRef<((pw: string) => void) | null>(null);
  const searchRun = useRef(0);
  const [attempt, setAttempt] = useState(0);

  const pdfjsRef = useRef<Pdfjs | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false; let task: ReturnType<Pdfjs["getDocument"]> | null = null;
    setDoc(null); setPages(0); setRendered(new Set()); textCache.current.clear(); pageCache.current.clear(); setCites({}); setMatches([]); setScanned(false);
    onStatus({ state: "loading", loaded: 0, total: bytes });
    if (bytes != null && bytes > VIEWER.viewLimitBytes) { onStatus({ state: "error", code: "toolarge", detail: `${(bytes / 1048576).toFixed(0)} MB` }); return; }
    if (bytes === 0) { onStatus({ state: "error", code: "empty", detail: "0 bytes" }); return; }
    (async () => {
      const pdfjs = await loadPdfjs(); pdfjsRef.current = pdfjs;
      if (cancelled) return;
      // A HEAD-free probe: the first request tells us permission and reachability before pdf.js interprets a failure.
      // Ranges only, no streaming: the bytes for the target page are requested first and nothing else is pulled until needed (§V9).
      task = pdfjs.getDocument({ url, withCredentials: true, rangeChunkSize: 65536, disableAutoFetch: true, disableStream: true });
      const progressive = (bytes ?? 0) > VIEWER.progressiveBytes;
      task.onProgress = (p: { loaded: number; total?: number }) => { if (cancelled) return; onStatus(progressive ? { state: "progressive", loaded: p.loaded, total: p.total ?? bytes ?? null, page: targetPage, pages: 0 } : { state: "loading", loaded: p.loaded, total: p.total ?? bytes ?? null }); };
      task.onPassword = (update: (pw: string) => void, reason: number) => { onStatus({ state: "password", wrong: reason === 2 }); passwordCb.current = update; };
      try {
        const pdf = await task.promise;
        if (cancelled) return;
        // The target page first (§V9): fetched and measured before anything else.
        const first = await pdf.getPage(Math.min(Math.max(1, targetPage), pdf.numPages));
        pageCache.current.set(first.pageNumber, first);
        const vp = first.getViewport({ scale: 1 });
        setBaseSize({ w: vp.width, h: vp.height });
        setDoc(pdf); setPages(pdf.numPages);
        const tc = await first.getTextContent();
        const text = buildPageText(tc.items as { str: string }[]);
        textCache.current.set(first.pageNumber, text);
        const isScanned = !text.joined.trim();
        setScanned(isScanned);
        onStatus(pdf.numPages > VIEWER.progressivePages || progressive ? { state: "progressive", loaded: 0, total: bytes, page: first.pageNumber, pages: pdf.numPages } : { state: "ready", pages: pdf.numPages, scanned: isScanned });
        if (pdf.numPages > VIEWER.progressivePages || progressive) {
          // Mark ready once the rest of the document has been touched (pdf.js keeps fetching ranges on demand).
          window.setTimeout(() => { if (!cancelled) onStatus({ state: "ready", pages: pdf.numPages, scanned: isScanned }); }, 1500);
        }
      } catch (e) {
        if (cancelled) return;
        const name = (e as { name?: string; status?: number; message?: string })?.name ?? "";
        const status = (e as { status?: number })?.status;
        if (name === "PasswordException") return; // handled by onPassword
        // Ownership on the agent's file routes answers 404 (no existence leak): treat it as no permission, not a bad link.
        if (status === 401 || status === 403 || status === 404 || /401|403|404/.test(String((e as Error)?.message))) onStatus({ state: "error", code: "permission", detail: `${status ?? 403}` });
        else if (name === "MissingPDFException" || name === "UnexpectedResponseException" || status || /failed to fetch|network|load failed/i.test(String((e as Error)?.message ?? ""))) onStatus({ state: "error", code: "fetch", detail: String((e as Error)?.message ?? name).slice(0, 120) });
        else onStatus({ state: "error", code: "render", detail: `pdf.render → ${name || "error"}${(e as Error)?.message ? ` · ${String((e as Error).message).slice(0, 80)}` : ""}` });
      }
    })();
    return () => { cancelled = true; task?.destroy().catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, attempt]);

  // ── Geometry ──────────────────────────────────────────────────────────────
  const fitScale = useMemo(() => {
    if (!baseSize) return 1;
    const rotated = rotation % 180 !== 0;
    const pw = rotated ? baseSize.h : baseSize.w;
    return Math.min(canvasWidth - 56, VIEWER.pageMax) / pw;
  }, [baseSize, canvasWidth, rotation]);
  const scale = zoom === "fit" ? fitScale : (zoom / 100) * (96 / 72) * 0.75; // 100% = 1 CSS px per point
  useEffect(() => { onZoom(zoom, Math.round(scale / ((96 / 72) * 0.75) * 100)); }, [zoom, scale, onZoom]);
  const pageCss = useMemo(() => { if (!baseSize) return { w: 620, h: 877 }; const rotated = rotation % 180 !== 0; return { w: (rotated ? baseSize.h : baseSize.w) * scale, h: (rotated ? baseSize.w : baseSize.h) * scale }; }, [baseSize, scale, rotation]);

  // ── Which pages to render: visible ± 1 ────────────────────────────────────
  const positioned = useRef(false);
  const recomputeVisible = useCallback(() => {
    const el = scroller.current; if (!el || !pages || !positioned.current) return;  // nothing but the target page until the initial scroll has landed
    const top = el.scrollTop, bottom = top + el.clientHeight;
    const stride = pageCss.h + 20;
    const firstIdx = Math.max(1, Math.floor((top - 24) / stride) + 1), lastIdx = Math.min(pages, Math.ceil((bottom - 24) / stride) + 1);
    const set = new Set<number>(); for (let p = Math.max(1, firstIdx - 1); p <= Math.min(pages, lastIdx + 1); p += 1) set.add(p);
    setVisible((prev) => { if (prev.size === set.size && [...set].every((p) => prev.has(p))) return prev; return set; });
    // Reading position: the page with the most visible area.
    let best = firstIdx, bestArea = -1;
    for (let p = firstIdx; p <= lastIdx; p += 1) { const pt = 24 + (p - 1) * stride, pb = pt + pageCss.h; const area = Math.min(bottom, pb) - Math.max(top, pt); if (area > bestArea) { bestArea = area; best = p; } }
    if (best !== current) { setCurrent(best); onPage(best); }
  }, [pages, pageCss.h, current, onPage]);
  useEffect(() => { const el = scroller.current; if (!el) return; let raf = 0; const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(recomputeVisible); }; el.addEventListener("scroll", onScroll, { passive: true }); recomputeVisible(); return () => { el.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); }; }, [recomputeVisible]);

  const getPage = useCallback(async (n: number) => { const cached = pageCache.current.get(n); if (cached) return cached; const p = await doc!.getPage(n); pageCache.current.set(n, p); return p; }, [doc]);
  const getText = useCallback(async (n: number) => { const cached = textCache.current.get(n); if (cached) return cached; const p = await getPage(n); const tc = await p.getTextContent(); const t = buildPageText(tc.items as { str: string }[]); textCache.current.set(n, t); return t; }, [getPage]);

  // ── Render visible pages (canvas + text layer) ────────────────────────────
  // Each page render is tracked on its own: a change of the visible set must
  // never abort a render already in flight (that left pages with a canvas but
  // no text layer, and no retry). Only a new document cancels.
  const docToken = useRef(0);
  useEffect(() => { docToken.current += 1; }, [doc]);
  const inFlight = useRef<Map<number, string>>(new Map());
  useEffect(() => {
    if (!doc || !pdfjsRef.current) return;
    const token = docToken.current;
    // The page the reader is on (or was sent to) is drawn before its neighbours (§V9: the target page arrives first).
    const anchor = current;
    for (const n of [...visible].sort((a, b) => Math.abs(a - anchor) - Math.abs(b - anchor))) {
      const host = pageEls.current.get(n); if (!host) continue;
      const key = `${scale.toFixed(4)}:${rotation}`;
      if (host.dataset.rendered === key || inFlight.current.get(n) === key) continue;
      inFlight.current.set(n, key);
      (async () => {
        try {
          const page = await getPage(n); if (token !== docToken.current || !host.isConnected) return;
          const viewport = page.getViewport({ scale, rotation });
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          let canvas = host.querySelector("canvas"); if (!canvas) { canvas = document.createElement("canvas"); host.prepend(canvas); }
          canvas.width = Math.floor(viewport.width * dpr); canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
          const ctx = canvas.getContext("2d")!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          await page.render({ canvasContext: ctx, viewport, canvas }).promise; if (token !== docToken.current) return;
          let layer = host.querySelector<HTMLDivElement>(".textLayer"); if (layer) layer.remove();
          layer = document.createElement("div"); layer.className = "textLayer"; layer.style.setProperty("--scale-factor", String(viewport.scale)); host.append(layer);
          const tc = await page.getTextContent(); if (token !== docToken.current) return;
          if (!textCache.current.has(n)) textCache.current.set(n, buildPageText(tc.items as { str: string }[]));
          const tl = new pdfjsRef.current!.TextLayer({ textContentSource: tc, container: layer, viewport });
          await tl.render(); if (token !== docToken.current) return;
          (host as HTMLDivElement & { __divs?: HTMLElement[] }).__divs = tl.textDivs as HTMLElement[];
          host.dataset.rendered = key;
          setRendered((s) => { const next = new Set(s); next.add(n); return next; });
          host.classList.add("cw-page-in");
        } catch (e) {
          if (token === docToken.current) onStatus({ state: "error", code: "render", detail: `pdf.render → ${(e as Error)?.name ?? "error"} · p. ${n}${(e as Error)?.message ? ` · ${String((e as Error).message).slice(0, 60)}` : ""}` });
        } finally { if (inFlight.current.get(n) === key) inFlight.current.delete(n); }
      })();
    }
  }, [doc, visible, scale, rotation, getPage, onStatus, current]);

  // ── Marks: search (yellow) and citations (blue) on rendered pages ─────────
  const applyMarks = useCallback(() => {
    for (const [n, host] of pageEls.current) {
      const divs = (host as HTMLDivElement & { __divs?: HTMLElement[] }).__divs; if (!divs) continue;
      // reset
      host.querySelectorAll("mark").forEach((m) => { const parent = m.parentNode; if (!parent) return; while (m.firstChild) parent.insertBefore(m.firstChild, m); parent.removeChild(m); parent.normalize?.(); });
      host.querySelectorAll(".cw-cite-marker, .cw-cite-tag").forEach((m) => m.remove());
      const wrap = (item: number, from: number, to: number, cls: string, attrs: Record<string, string> = {}) => {
        const div = divs[item]; if (!div) return null;
        const textNode = [...div.childNodes].find((c) => c.nodeType === 3) as Text | undefined; if (!textNode) return null;
        const full = textNode.textContent ?? ""; if (from >= full.length) return null;
        const range = document.createRange(); range.setStart(textNode, from); range.setEnd(textNode, Math.min(to, full.length));
        const mark = document.createElement("mark"); mark.className = cls; for (const [k, v] of Object.entries(attrs)) mark.setAttribute(k, v);
        try { range.surroundContents(mark); } catch { return null; }
        return mark;
      };
      // search hits on this page
      matches.forEach((m, i) => { if (m.page !== n) return; const text = textCache.current.get(n); if (!text) return; for (const r of hitToItemRanges(text, m.hit)) wrap(r.item, r.from, r.to, i === matchIndex ? "cw-search-hit cw-search-current" : "cw-search-hit"); });
      // citations on this page
      for (const [kStr, c] of Object.entries(cites)) {
        const k = Number(kStr); const isActive = k === activeCitation; const cls = isActive ? "cw-cite-hit" : "cw-cite-hit cw-cite-prev";
        const parts: { page: number; ranges: { item: number; from: number; to: number }[]; cont: boolean }[] = [{ page: c.page, ranges: c.ranges, cont: false }];
        if (c.contPage && c.contRanges) parts.push({ page: c.contPage, ranges: c.contRanges, cont: true });
        for (const part of parts) {
          if (part.page !== n) continue;
          let first: HTMLElement | null = null;
          for (const r of part.ranges) { const m = wrap(r.item, r.from, r.to, cls, { "data-cite": String(k), tabindex: "-1" }); if (m && !first) first = m; }
          if (!first) continue;
          if (!part.cont) {
            const marker = document.createElement("span"); marker.className = `cw-cite-marker${isActive ? " cw-cite-ring" : " cw-cite-marker-prev"}`; marker.textContent = String(k); marker.setAttribute("aria-hidden", "true");
            const div = first.closest<HTMLElement>(".textLayer > span") ?? first; marker.style.top = `${div.offsetTop}px`; host.append(marker);
            if (c.contPage) { const tag = document.createElement("span"); tag.className = "cw-cite-tag cw-cite-tag-end"; tag.textContent = `Passage continues on p. ${c.contPage} ↓`; host.append(tag); }
          } else {
            const tag = document.createElement("span"); tag.className = "cw-cite-tag cw-cite-tag-start"; tag.textContent = `↑ Cited passage ${k} continued from p. ${c.page}`; host.append(tag);
          }
        }
      }
    }
  }, [matches, matchIndex, cites, activeCitation]);

  // ── Scroll helpers ────────────────────────────────────────────────────────
  const scrollToPage = useCallback((n: number, behavior: "smooth" | "auto" = "smooth", offset = 24) => {
    const el = scroller.current; if (!el) return; const stride = pageCss.h + 20; const top = 24 + (n - 1) * stride - offset;
    el.scrollTo({ top: Math.max(0, top), behavior: reducedMotion ? "auto" : behavior });
  }, [pageCss.h, reducedMotion]);
  const scrollToMark = useCallback((n: number, selector: string) => {
    const el = scroller.current, host = pageEls.current.get(n); if (!el || !host) return false;
    const mark = host.querySelector<HTMLElement>(selector); if (!mark) return false;
    const div = mark.closest<HTMLElement>(".textLayer > span") ?? mark;
    const top = host.offsetTop + div.offsetTop - VIEWER.citationOffset;
    const far = Math.abs(el.scrollTop - top) > (pageCss.h + 20) * 6;
    el.scrollTo({ top: Math.max(0, top), behavior: reducedMotion || far ? "auto" : "smooth" });
    return true;
  }, [pageCss.h, reducedMotion]);
  // Focus lands on the passage once its mark exists in the DOM — the immediate attempt after locate can
  // run before React has applied the new citation (a second citation into an open tab).
  const focusK = useRef<{ k: number; page: number } | null>(null);
  useEffect(() => {
    applyMarks();
    const want = focusK.current; if (!want) return;
    const m = pageEls.current.get(want.page)?.querySelector<HTMLElement>(`mark[data-cite="${want.k}"]`);
    if (m) { focusK.current = null; scrollToMark(want.page, `mark[data-cite="${want.k}"]`); m.focus(); }
  }, [applyMarks, rendered, scrollToMark]);

  // Initial position: the target page.
  const positioning = useRef(false);
  useEffect(() => { if (!doc || positioned.current || positioning.current) return; positioning.current = true; requestAnimationFrame(() => { scrollToPage(targetPage, "auto"); positioned.current = true; positioning.current = false; recomputeVisible(); }); }, [doc, targetPage, scrollToPage, recomputeVisible]);
  useEffect(() => { positioned.current = false; setVisible(new Set([Math.max(1, targetPage)])); }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Search ────────────────────────────────────────────────────────────────
  const runSearch = useCallback(async (q: string) => {
    setQuery(q); const run = ++searchRun.current; const out: { page: number; hit: Hit }[] = [];
    if (!doc || !normalise(q) || scanned) { setMatches([]); setMatchIndex(0); onSearch({ count: 0, current: 0, pages: [] }); return; }
    for (let n = 1; n <= pages; n += 1) {
      const t = await getText(n).catch(() => null); if (run !== searchRun.current) return; if (!t) continue;
      for (const hit of findAll(t, q)) out.push({ page: n, hit });
      if (n % 5 === 0 || n === pages) { setMatches([...out]); onSearch({ count: out.length, current: out.length ? 1 : 0, pages: [...new Set(out.map((m) => m.page))] }); }
    }
    setMatches(out); setMatchIndex(0); onSearch({ count: out.length, current: out.length ? 1 : 0, pages: [...new Set(out.map((m) => m.page))] });
    if (out[0]) { scrollToPage(out[0].page, "auto"); requestAnimationFrame(() => scrollToMark(out[0].page, ".cw-search-current")); }
  }, [doc, pages, scanned, getText, onSearch, scrollToPage, scrollToMark]);
  const nextMatch = useCallback((dir: 1 | -1) => {
    if (!matches.length) return; const i = (matchIndex + dir + matches.length) % matches.length; setMatchIndex(i); onSearch({ count: matches.length, current: i + 1, pages: [...new Set(matches.map((m) => m.page))] });
    scrollToPage(matches[i].page, "auto"); requestAnimationFrame(() => { applyMarks(); scrollToMark(matches[i].page, ".cw-search-current"); });
  }, [matches, matchIndex, onSearch, scrollToPage, scrollToMark, applyMarks]);

  // ── Citations: exact match on the cited page, then the whole document, then across a page break ──
  const locate = useCallback(async (c: Citation): Promise<CitationResult> => {
    if (!doc) return { k: c.k, state: "no-span", page: c.page };
    if (scanned) { const r: CitationResult = { k: c.k, state: "scanned", page: c.page }; onCitationResult(r); return r; }
    const span = c.span ?? c.verbatim?.text ?? null;
    if (!span) { const r: CitationResult = { k: c.k, state: "no-span", page: c.page }; onCitationResult(r); if (c.page) scrollToPage(c.page, "auto"); return r; }
    const order = [...(c.page ? [c.page] : []), ...Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n !== c.page)];
    for (const n of order) {
      const t = await getText(n).catch(() => null); if (!t) continue;
      const hit = findExact(t, span);
      if (hit) {
        setCites((m) => ({ ...m, [c.k]: { page: n, ranges: hitToItemRanges(t, hit) } }));
        const r: CitationResult = { k: c.k, state: "found", page: n, parts: 1 }; onCitationResult(r);
        focusK.current = { k: c.k, page: n }; scrollToPage(n, "auto"); requestAnimationFrame(() => { applyMarks(); setTimeout(() => { scrollToMark(n, `mark[data-cite="${c.k}"]`); const m = pageEls.current.get(n)?.querySelector<HTMLElement>(`mark[data-cite="${c.k}"]`); m?.focus(); onAnnounce(`Cited passage ${c.k}, page ${n}`); }, 60); });
        return r;
      }
    }
    // Page break: the span ends one page and continues on the next.
    const needle = normalise(span);
    for (let n = 1; n < pages; n += 1) {
      const a = await getText(n).catch(() => null), b = await getText(n + 1).catch(() => null); if (!a || !b) continue;
      for (let cut = Math.min(needle.length - 1, 600); cut >= 8; cut -= 1) {
        const head = needle.slice(0, cut), tail = needle.slice(cut).trim();
        if (a.joined.endsWith(head) && b.joined.startsWith(tail)) {
          const h1: Hit = { start: a.joined.length - head.length, end: a.joined.length }, h2: Hit = { start: 0, end: tail.length };
          setCites((m) => ({ ...m, [c.k]: { page: n, ranges: hitToItemRanges(a, h1), contPage: n + 1, contRanges: hitToItemRanges(b, h2) } }));
          const r: CitationResult = { k: c.k, state: "found", page: n, parts: 2 }; onCitationResult(r);
          focusK.current = { k: c.k, page: n }; scrollToPage(n, "auto"); requestAnimationFrame(() => { applyMarks(); setTimeout(() => { scrollToMark(n, `mark[data-cite="${c.k}"]`); pageEls.current.get(n)?.querySelector<HTMLElement>(`mark[data-cite="${c.k}"]`)?.focus(); onAnnounce(`Cited passage ${c.k}, page ${n}, continues on page ${n + 1}`); }, 60); });
          return r;
        }
      }
    }
    // Not found: nothing is drawn. The page still opens where the agent said.
    const r: CitationResult = { k: c.k, state: "not-found", page: c.page }; onCitationResult(r);
    if (c.page) scrollToPage(c.page, "auto");
    onAnnounce(`Cited passage ${c.k} not found`);
    return r;
  }, [doc, scanned, pages, getText, onCitationResult, scrollToPage, scrollToMark, applyMarks, onAnnounce]);

  useImperativeHandle(ref, () => ({
    goToPage: (n, behavior) => { const p = Math.min(Math.max(1, n), pages || 1); scrollToPage(p, behavior ?? "smooth"); },
    setZoom: (z) => { onZoom(z, 0); },
    rotate: () => onRotation((rotation + 90) % 360),
    search: (q) => void runSearch(q),
    nextMatch,
    locate,
    focusCitation: (k) => { const c = cites[k]; if (!c) return; scrollToPage(c.page, "auto"); requestAnimationFrame(() => scrollToMark(c.page, `mark[data-cite="${k}"]`)); },
    submitPassword: (pw) => { passwordCb.current?.(pw); onStatus({ state: "loading", loaded: 0, total: bytes }); },
    retry: () => setAttempt((a) => a + 1),
  }), [pages, scrollToPage, onZoom, onRotation, rotation, runSearch, nextMatch, locate, cites, scrollToMark, onStatus, bytes]);

  // Thumbnails: lazy small renders.
  const thumbEls = useRef<Map<number, HTMLCanvasElement>>(new Map());
  useEffect(() => {
    if (!doc || !thumbnails) return; let cancelled = false;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue; const canvas = e.target as HTMLCanvasElement; const n = Number(canvas.dataset.page); if (canvas.dataset.done) continue; canvas.dataset.done = "1";
        (async () => { try { const page = await getPage(n); if (cancelled) return; const vp = page.getViewport({ scale: 1 }); const s = 78 / vp.width; const v = page.getViewport({ scale: s * 2, rotation }); canvas.width = v.width; canvas.height = v.height; await page.render({ canvasContext: canvas.getContext("2d")!, viewport: v, canvas }).promise; canvas.classList.add("cw-thumb-in"); } catch { /* keep the grey placeholder */ } })();
      }
    }, { root: railRef.current, rootMargin: "200px" });
    for (const c of thumbEls.current.values()) io.observe(c);
    return () => { cancelled = true; io.disconnect(); };
  }, [doc, thumbnails, pages, getPage, rotation]);
  useEffect(() => { const rail = railRef.current; if (!rail) return; const t = rail.querySelector<HTMLElement>(`[data-thumb="${current}"]`); t?.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" }); }, [current, thumbnails, reducedMotion]);

  const citePages = useMemo(() => { const m: Record<number, number[]> = {}; for (const [k, c] of Object.entries(cites)) { (m[c.page] ||= []).push(Number(k)); if (c.contPage) (m[c.contPage] ||= []).push(Number(k)); } return m; }, [cites]);
  const matchPages = useMemo(() => new Set(matches.map((m) => m.page)), [matches]);

  return (
    <div style={{ display: hidden ? "none" : "flex", minHeight: 0, flex: 1 }}>
      {thumbnails && pages > 0 && (
        <div ref={railRef} className="cw-thumb-rail" style={{ width: VIEWER.thumbRail, flex: "none", background: C.sidebar, borderRight: `1px solid ${C.border}`, overflowY: "auto", padding: "14px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }} aria-label="Pages">
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" data-thumb={n} onClick={() => scrollToPage(n)} aria-label={`Page ${n}`} aria-current={n === current ? "page" : undefined} style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, fontFamily: "inherit" }}>
              <span style={{ position: "relative", width: 78, height: 101, background: C.viewerCanvas, border: n === current ? `2px solid ${C.primary}` : `1px solid ${C.border}`, borderRadius: 3, boxShadow: n === current ? "0 0 0 3px rgba(37,99,235,.15)" : "none", overflow: "hidden", display: "block" }}>
                <canvas ref={(el) => { if (el) thumbEls.current.set(n, el); else thumbEls.current.delete(n); }} data-page={n} className="cw-thumb" style={{ width: "100%", height: "100%", display: "block", background: C.surface, opacity: 0 }} />
                {citePages[n] && <span style={{ position: "absolute", top: -6, right: -6, height: 16, minWidth: 16, padding: "0 5px", borderRadius: 999, background: C.primary, color: C.surface, fontSize: 9.5, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{citePages[n].join(" ")}</span>}
                {matchPages.has(n) && <span style={{ position: "absolute", bottom: 4, right: 4, width: 10, height: 10, borderRadius: "50%", background: C.warnDot, boxShadow: `0 0 0 2px ${C.sidebar}` }} />}
              </span>
              <span style={{ ...mono({ fontSize: 11, fontWeight: n === current ? 700 : 400 }), color: n === current ? C.primaryHover : C.muted }}>{n}</span>
            </button>
          ))}
        </div>
      )}
      <div ref={scroller} className="cw-canvas" role="document" tabIndex={0} aria-label={pages ? `Document, page ${current} of ${pages}` : "Document"} style={{ flex: 1, minWidth: 0, overflow: "auto", background: C.viewerCanvas, padding: "24px 28px", outline: "none" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <div key={n} ref={(el) => { if (el) pageEls.current.set(n, el); else pageEls.current.delete(n); }} className="cw-page" data-page={n} style={{ position: "relative", width: pageCss.w, height: pageCss.h, background: scanned ? C.viewerPageScan : C.surface, boxShadow: "0 1px 3px rgba(16,18,22,.12), 0 8px 20px rgba(16,18,22,.05)", flex: "none" }}>
              {!rendered.has(n) && (
                <div aria-hidden style={{ position: "absolute", inset: 0, padding: "56px 48px", display: "flex", flexDirection: "column", gap: 12 }}>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => <span key={i} className="cw-skel" style={{ height: 10, borderRadius: 3, background: C.hover, width: `${[92, 88, 95, 70, 90, 86, 94, 60, 80][i]}%` }} />)}
                  <span style={{ ...mono({ fontSize: 13 }), color: C.faint, textAlign: "center", marginTop: "auto" }}>p. {n} · loading</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
export { ZOOMS };
