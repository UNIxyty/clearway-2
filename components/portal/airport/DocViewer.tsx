"use client";

// The document viewer on the airport page (portal redesign, stage 3 — "Page Airport", §3.9): tabs for the airport's
// documents (AD 2, GEN), and the full controls — thumbnails, find in document, page by page, zoom, rotate, download,
// open in a new tab. The pages are drawn by the agent viewer's pdf.js renderer (components/agent/viewer/PdfView), so
// the airport page and the agent show a PDF the same way. A tab without a file yet shows what is happening instead.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { IconButton, Select, TextInput, SearchInput, ErrorState, Skeleton } from "@/components/kit";
import { PdfView, ZOOMS, type PdfHandle, type PdfStatus } from "@/components/agent/viewer/PdfView";
import AgentStyles from "@/components/agent/ui/AgentStyles";
import MaskIcon from "@/components/portal/Icon";

export type DocTab = {
  id: string;
  label: string;
  meta?: string;
  /** The file, once there is one. */
  pdf?: { url: string; filename: string; openHref?: string } | null;
  /** What the tab shows while there is no file (progress, a button to get it, an error). */
  body?: ReactNode;
  onDownload?: () => void;
  downloading?: boolean;
};

const THUMB_RAIL = 132;
const noop = () => {};

function Viewer({ tab }: { tab: DocTab & { pdf: NonNullable<DocTab["pdf"]> } }) {
  const pdf = useRef<PdfHandle>(null);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [status, setStatus] = useState<PdfStatus>({ state: "loading", loaded: 0, total: null });
  const [thumbs, setThumbs] = useState(true);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [effective, setEffective] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [page, setPage] = useState(1);
  const [pageText, setPageText] = useState("1");
  const [finding, setFinding] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ count: number; current: number } | null>(null);
  const [said, setSaid] = useState("");

  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el); setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  useEffect(() => setPageText(String(page)), [page]);
  // Find as you type (the renderer marks every match in yellow, the current one stronger).
  useEffect(() => {
    if (!finding) return;
    const t = window.setTimeout(() => { pdf.current?.search(query.trim()); if (!query.trim()) setFound(null); }, 250);
    return () => window.clearTimeout(t);
  }, [query, finding]);

  const pages = status.state === "ready" ? status.pages : status.state === "progressive" ? status.pages : 0;
  const showThumbs = thumbs && width >= 640;
  const cur = zoom === "fit" ? effective : zoom;
  const step = (dir: 1 | -1) => {
    const next = dir > 0 ? ZOOMS.find((z) => z > cur) : [...ZOOMS].reverse().find((z) => z < cur);
    if (next) setZoom(next);
  };
  const go = (n: number) => { if (!pages) return; const p = Math.min(Math.max(1, n), pages); pdf.current?.goToPage(p); };
  const onZoom = useCallback((z: number | "fit", eff: number) => { setZoom(z); if (eff) setEffective(eff); }, []);
  const onSearch = useCallback((r: { count: number; current: number }) => setFound(r), []);
  const busy = status.state === "loading";

  return (
    <>
      <AgentStyles />
      <div role="toolbar" aria-label="Document controls" className="flex h-12 items-center gap-1 overflow-x-auto border-b border-cw-divider bg-cw-bg-sunken px-2.5 text-cw-text-body">
        <IconButton icon="panel-left" label={thumbs ? "Hide page thumbnails" : "Show page thumbnails"} aria-pressed={thumbs} size="sm" onClick={() => setThumbs((t) => !t)} className={thumbs ? "!bg-cw-bg-active" : ""} />
        <IconButton icon="search" label="Find in document" aria-pressed={finding} size="sm" onClick={() => setFinding((f) => !f)} className={finding ? "!bg-cw-bg-active" : ""} />
        <span aria-hidden className="mx-1 h-5 w-px flex-none bg-cw-border" />
        <IconButton icon="chevron-up" label="Previous page" size="sm" onClick={() => go(page - 1)} />
        <span className="w-12 flex-none"><TextInput aria-label="Page" mono value={busy ? "–" : pageText} onChange={(e) => setPageText(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => { if (e.key === "Enter") go(Number(pageText) || 1); }} onBlur={() => setPageText(String(page))} className="!h-7 !px-1.5 text-center !text-[12.5px]" /></span>
        <span className="flex-none font-mono text-[12.5px] text-cw-text-muted">/ {pages || "–"}</span>
        <IconButton icon="chevron-down" label="Next page" size="sm" onClick={() => go(page + 1)} />
        <span aria-hidden className="mx-1 h-5 w-px flex-none bg-cw-border" />
        <IconButton icon="minus" label="Zoom out" size="sm" onClick={() => step(-1)} />
        <span className="w-[124px] flex-none">
          <Select size="sm" label="Zoom" value={String(zoom)} onChange={(v) => setZoom(v === "fit" ? "fit" : Number(v))}
            options={[{ value: "fit", label: "Fit width" }, ...ZOOMS.map((z) => ({ value: String(z), label: `${z}%` }))]}
            renderValue={(o) => <span className="font-mono text-[12.5px]">{o.value === "fit" ? "Fit width" : o.label}</span>} />
        </span>
        <IconButton icon="plus" label="Zoom in" size="sm" onClick={() => step(1)} />
        <IconButton icon="rotate-cw" label="Rotate" size="sm" onClick={() => setRotation((r) => (r + 90) % 360)} />
        <span className="flex-1" />
        {tab.onDownload && <IconButton icon="download" label={`Download ${tab.pdf.filename}`} size="sm" loading={tab.downloading} onClick={tab.onDownload} />}
        <a href={tab.pdf.openHref ?? tab.pdf.url} target="_blank" rel="noreferrer" aria-label="Open in a new tab" title="Open in a new tab"
          className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[8px] text-cw-text-body outline-none hover:bg-cw-bg-hover focus-visible:shadow-[0_0_0_2px_var(--cw-focus)]">
          <MaskIcon name="external-link" size={16} />
        </a>
      </div>
      {finding && (
        <div className="flex items-center gap-2 border-b border-cw-divider bg-cw-bg-surface px-3 py-2">
          <span className="min-w-0 flex-1"><SearchInput size="sm" autoFocus value={query} onValueChange={setQuery} placeholder="Find in this document" aria-label="Find in this document"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); pdf.current?.nextMatch(e.shiftKey ? -1 : 1); } if (e.key === "Escape") setFinding(false); }}
            count={found && query.trim() ? (found.count ? `${found.current + 1} of ${found.count}` : "No matches") : undefined} /></span>
          <IconButton icon="chevron-up" label="Previous match" size="sm" onClick={() => pdf.current?.nextMatch(-1)} />
          <IconButton icon="chevron-down" label="Next match" size="sm" onClick={() => pdf.current?.nextMatch(1)} />
        </div>
      )}
      <div ref={box} className="relative flex" style={{ height: "clamp(520px, calc(100vh - 300px), 860px)" }}>
        <PdfView key={tab.pdf.url} ref={pdf} url={tab.pdf.url} bytes={null} targetPage={1} zoom={zoom} rotation={rotation}
          canvasWidth={Math.max(320, width - (showThumbs ? THUMB_RAIL : 0))} thumbnails={showThumbs} citations={[]} activeCitation={null}
          onStatus={setStatus} onPage={setPage} onZoom={onZoom} onRotation={setRotation} onSearch={onSearch} onCitationResult={noop} onAnnounce={setSaid}
          reducedMotion={typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches} hidden={status.state === "error"} />
        {busy && (
          <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col items-center bg-cw-bg-sunken px-7 py-6">
            <div className="flex w-full max-w-[560px] flex-col gap-3 bg-cw-bg-surface px-12 py-14 shadow-cw-1">{["92%", "88%", "95%", "70%", "90%", "86%", "60%"].map((w, i) => <Skeleton key={i} w={w} />)}</div>
            <div className="mt-3 text-[12.5px] text-cw-text-muted">Opening {tab.pdf.filename}</div>
          </div>
        )}
        {status.state === "error" && (
          <div className="flex flex-1 items-center justify-center bg-cw-bg-sunken">
            <ErrorState title={`Couldn't show ${tab.pdf.filename}`} detail={status.detail} onRetry={() => pdf.current?.retry()} />
          </div>
        )}
      </div>
      <div aria-live="polite" className="sr-only">{said}</div>
    </>
  );
}

export default function DocViewer({ tabs, active, onTab }: { tabs: DocTab[]; active: string; onTab: (id: string) => void }) {
  const tab = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <section aria-label="Documents" className="min-w-0 overflow-hidden rounded-[14px] border border-cw-border bg-cw-bg-surface shadow-cw-1">
      <div role="tablist" aria-label="Documents" className="flex items-end gap-1 overflow-x-auto border-b border-cw-border pl-3 pr-2 pt-2">
        {tabs.map((t) => {
          const on = t.id === tab.id;
          return (
            <button key={t.id} type="button" role="tab" aria-selected={on} onClick={() => onTab(t.id)}
              className={`inline-flex h-[38px] cursor-pointer items-center gap-2 whitespace-nowrap border-none bg-transparent px-3 font-sans text-[13.5px] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--cw-focus)] ${on ? "font-bold text-cw-text shadow-[inset_0_-2px_0_var(--cw-primary)]" : "font-medium text-cw-text-muted hover:text-cw-text"}`}>
              {t.label}{t.meta && <span className="font-mono text-[11.5px] font-normal text-cw-text-muted">{t.meta}</span>}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" aria-label={tab.label}>
        {tab.pdf ? <Viewer key={tab.id} tab={tab as DocTab & { pdf: NonNullable<DocTab["pdf"]> }} /> : (
          <div className="flex items-center justify-center bg-cw-bg-sunken p-5" style={{ minHeight: "clamp(420px, calc(100vh - 360px), 760px)" }}>{tab.body}</div>
        )}
      </div>
    </section>
  );
}
