"use client";

// The dashboard (portal redesign, stage 3 — "Page Dashboard"): blocks on a 12-column grid, each S, M or L wide
// (4, 6, 8 columns). "Customise" turns on the handles, the S/M/L switch, remove, and a list of blocks to add; changes
// save as they are made, on the account (lib/dashboard-layout, docs/supabase-portal-dashboard.sql) and in this browser.
// Reordering: drag a block by its handle, or focus the handle and use the arrow keys.

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import PortalShell, { useIdentity } from "@/components/portal/Shell";
import MaskIcon from "@/components/portal/Icon";
import { Button, Checkbox, useToast } from "@/components/kit";
import { BLOCK_IDS, DEFAULT_LAYOUT, SPAN, sanitizeLayout, type BlockId, type BlockSize, type Layout } from "@/lib/dashboard-layout";
import { ChangelogBlock, HealthBlock, LinksBlock, MonitorsBlock, RecentBlock, TodayBlock, type FrameControls } from "./blocks";

const BLOCKS: Record<BlockId, { title: string; icon: string; size: BlockSize; adminOnly?: boolean; render: (f: FrameControls) => ReactNode }> = {
  today: { title: "Today", icon: "gauge", size: "S", render: (f) => <TodayBlock frame={f} /> },
  recent: { title: "Recently used", icon: "history", size: "L", render: (f) => <RecentBlock frame={f} /> },
  monitors: { title: "Service monitors", icon: "activity", size: "M", render: (f) => <MonitorsBlock frame={f} /> },
  health: { title: "Server health", icon: "server", size: "M", adminOnly: true, render: (f) => <HealthBlock frame={f} /> },
  links: { title: "Quick links", icon: "link", size: "S", render: (f) => <LinksBlock frame={f} /> },
  changelog: { title: "Changelog", icon: "scroll-text", size: "L", render: (f) => <ChangelogBlock frame={f} /> },
};
const LOCAL = "cw-dashboard-layout";

function greeting(name: string | null) {
  const h = new Date().getHours();
  const part = h < 5 ? "Evening" : h < 12 ? "Morning" : h < 18 ? "Afternoon" : "Evening";
  const first = name?.trim().split(/\s+/)[0];
  return `${part}${first ? `, ${first}` : ""}. Everything below is yours to arrange.`;
}

export default function Dashboard() {
  const toast = useToast();
  const { role, roleKnown, isDeveloper } = useIdentity();
  const isAdmin = role === "admin" || isDeveloper;
  // undefined = not read yet; null = never customised (the default shows).
  const [layout, setLayout] = useState<Layout | null | undefined>(undefined);
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [hello, setHello] = useState("Everything below is yours to arrange.");
  const [dragging, setDragging] = useState<BlockId | null>(null);
  const [announce, setAnnounce] = useState("");
  const dirty = useRef(false);

  // This browser's copy first (no wait), then the account's, which follows the person between devices.
  useEffect(() => {
    try { const local = sanitizeLayout(JSON.parse(localStorage.getItem(LOCAL) || "null")); if (local) setLayout(local); } catch { /* private mode */ }
    fetch("/api/user/preferences", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      const prefs = d?.preferences ?? null;
      if (prefs?.display_name) setName(prefs.display_name);
      if (dirty.current) return; // already changed here; that wins
      if (prefs && "dashboard_layout" in prefs) setLayout(sanitizeLayout(prefs.dashboard_layout));
      else setLayout((cur) => (cur === undefined ? null : cur));
    }).catch(() => setLayout((cur) => (cur === undefined ? null : cur)));
  }, []);
  useEffect(() => { setHello(greeting(name)); }, [name]);
  // Settings → Customisation links here with ?customise=1: open straight into editing.
  useEffect(() => { if (new URLSearchParams(window.location.search).get("customise") === "1") setEdit(true); }, []);

  const save = useRef<number | null>(null);
  const change = useCallback((next: Layout | null) => {
    dirty.current = true;
    setLayout(next);
    try { if (next) localStorage.setItem(LOCAL, JSON.stringify(next)); else localStorage.removeItem(LOCAL); } catch { /* private mode */ }
    if (save.current) window.clearTimeout(save.current);
    save.current = window.setTimeout(async () => {
      const res = await fetch("/api/user/preferences", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dashboard_layout: next }) }).catch(() => null);
      if (!res?.ok) toast.show({ tone: "warning", title: "Couldn't save your layout to your account", body: "It is kept in this browser. Try another change in a moment." });
    }, 500);
  }, [toast]);

  const current: Layout = layout === undefined || layout === null ? DEFAULT_LAYOUT : layout;
  const allowed = (id: BlockId) => !BLOCKS[id].adminOnly || (roleKnown && isAdmin);
  const shown = useMemo(() => current.filter((b) => allowed(b.id)), [current, roleKnown, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps
  const library = BLOCK_IDS.filter((id) => !BLOCKS[id].adminOnly || isAdmin);

  const move = (id: BlockId, by: number) => {
    const i = current.findIndex((b) => b.id === id); const j = i + by;
    if (i < 0 || j < 0 || j >= current.length) return;
    const next = [...current]; const [it] = next.splice(i, 1); next.splice(j, 0, it);
    change(next);
    setAnnounce(`${BLOCKS[id].title} moved to position ${j + 1} of ${next.length}`);
  };
  // While dragging, a block moves into the slot of the block under the pointer. The last block it moved onto is
  // remembered, so the pointer still resting there after the swap does not swap them back.
  const lastOver = useRef<BlockId | null>(null);
  // A block is draggable throughout customising (the browser decides at pointer-down), but a drag only starts from
  // its handle: pressing the handle arms the block; any other drag is cancelled.
  const armed = useRef<BlockId | null>(null);
  const moveOnto = (id: BlockId, target: BlockId) => {
    if (id === target || lastOver.current === target) return;
    lastOver.current = target;
    const from = current.findIndex((b) => b.id === id), to = current.findIndex((b) => b.id === target);
    if (from < 0 || to < 0) return;
    const next = [...current]; const [it] = next.splice(from, 1); next.splice(to, 0, it);
    setLayout(next); // committed (saved) when the drag ends
  };
  const setSize = (id: BlockId, size: BlockSize) => change(current.map((b) => (b.id === id ? { ...b, size } : b)));
  const remove = (id: BlockId) => { change(current.filter((b) => b.id !== id)); setAnnounce(`${BLOCKS[id].title} removed`); };
  const toggle = (id: BlockId, on: boolean) => change(on ? [...current, { id, size: BLOCKS[id].size }] : current.filter((b) => b.id !== id));

  const handleKeys = (id: BlockId) => (e: KeyboardEvent) => {
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); move(id, -1); }
    if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); move(id, 1); }
  };
  // The live announcement clears itself, so the same message can be announced again.
  useEffect(() => { if (!announce) return; const t = window.setTimeout(() => setAnnounce(""), 3000); return () => window.clearTimeout(t); }, [announce]);

  const ready = layout !== undefined;
  const empty = ready && shown.length === 0;

  return (
    <PortalShell title="Dashboard" crumb="/dashboard"
      subtitle={edit ? "Editing — changes save as you make them and only affect you." : hello}
      headerRight={ready && (edit || !empty) ? (edit ? (
        <div className="flex gap-2">
          <Button variant="quiet" onClick={() => { change(null); setAnnounce("Default layout restored"); }}>Reset to default</Button>
          <Button variant="primary" icon="check" onClick={() => setEdit(false)}>Done</Button>
        </div>
      ) : <Button icon="layout-dashboard" onClick={() => setEdit(true)}>Customise</Button>) : undefined}>
      <div style={{ padding: "0 var(--cw-page-pad) 40px" }}>
        <div aria-live="polite" className="sr-only">{announce}</div>
        {!ready ? (
          <div className="cw-dash-grid" aria-busy="true">
            {DEFAULT_LAYOUT.filter((b) => !BLOCKS[b.id].adminOnly).map((b) => (
              <div key={b.id} className="cw-dash-block h-[220px] rounded-[14px] border border-cw-border bg-cw-bg-surface shadow-cw-1" style={{ ["--span" as string]: SPAN[b.size], ["--span-md" as string]: Math.max(6, SPAN[b.size]) }} />
            ))}
          </div>
        ) : empty && !edit ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-cw-border-control text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-[12px] border border-cw-border bg-cw-bg-sunken"><MaskIcon name="layout-dashboard" size={20} color="var(--cw-text-muted)" /></span>
            <div className="mt-1 text-[16px] font-bold text-cw-text">Your dashboard has no blocks</div>
            <div className="max-w-[340px] text-[13.5px] leading-normal text-cw-text-muted">Add service monitors, counters and quick links, then arrange them the way you work.</div>
            <div className="mt-2 flex gap-2">
              <Button variant="primary" icon="plus" onClick={() => setEdit(true)}>Add blocks</Button>
              <Button onClick={() => change(null)}>Use the default layout</Button>
            </div>
          </div>
        ) : (
          <div className={edit ? "grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]" : ""}>
            {edit && (
              <aside aria-label="Blocks" className="rounded-[14px] border border-cw-border bg-cw-bg-surface shadow-cw-2 xl:sticky xl:top-[calc(var(--cw-topbar)+28px)] xl:order-2">
                <div className="border-b border-cw-divider p-4">
                  <h2 className="m-0 text-[15px] font-bold text-cw-text">Blocks</h2>
                  <p className="m-0 mt-0.5 text-[12.5px] leading-normal text-cw-text-muted">Drag by the handle to reorder, or focus it and use the arrow keys. S, M, L set the width.</p>
                </div>
                <ul className="m-0 flex list-none flex-col gap-0.5 p-2">
                  {library.map((id) => (
                    <li key={id} className="flex min-h-10 items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 hover:bg-cw-bg-hover">
                      <Checkbox checked={current.some((b) => b.id === id)} onChange={(v) => toggle(id, v)} ariaLabel={`Show ${BLOCKS[id].title}`} />
                      <MaskIcon name={BLOCKS[id].icon} size={15} color="var(--cw-text-muted)" />
                      <span className="flex-1 text-[13.5px] text-cw-text">{BLOCKS[id].title}</span>
                      {BLOCKS[id].adminOnly && <span className="text-[10px] font-bold tracking-[0.06em] text-cw-text-muted">ADMIN</span>}
                    </li>
                  ))}
                </ul>
              </aside>
            )}
            {shown.length === 0 ? (
              <div className="flex min-h-[200px] items-center justify-center rounded-[14px] border border-dashed border-cw-border-control p-6 text-center text-[13.5px] text-cw-text-muted">Tick a block in the list to add it.</div>
            ) : (
              <div className="cw-dash-grid">
                {shown.map((b, i) => {
                  const def = BLOCKS[b.id];
                  const frame: FrameControls = {
                    edit, size: b.size, onSize: (s) => setSize(b.id, s), onRemove: () => remove(b.id),
                    handle: (
                      <button type="button" aria-label={`Move ${def.title} (position ${i + 1} of ${shown.length}; arrow keys move it)`} title="Drag to reorder"
                        onKeyDown={handleKeys(b.id)} onPointerDown={() => { lastOver.current = null; armed.current = b.id; }}
                        className="-ml-1 flex h-7 w-6 cursor-grab items-center justify-center rounded-[6px] border-none bg-transparent text-cw-text-muted outline-none hover:bg-cw-bg-hover focus-visible:shadow-[0_0_0_2px_var(--cw-focus)] active:cursor-grabbing">
                        <MaskIcon name="grip-vertical" size={16} />
                      </button>
                    ),
                  };
                  return (
                    <div key={b.id} data-block={b.id} className={`cw-dash-block ${dragging === b.id ? "opacity-60" : ""}`} style={{ ["--span" as string]: SPAN[b.size], ["--span-md" as string]: Math.max(6, SPAN[b.size]) }}
                      draggable={edit}
                      onDragStart={(e) => {
                        if (armed.current !== b.id) { e.preventDefault(); return; }
                        e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", b.id); setDragging(b.id);
                      }}
                      onDragOver={(e) => { if (!dragging) return; e.preventDefault(); moveOnto(dragging, b.id); }}
                      onDrop={(e) => e.preventDefault()}
                      onDragEnd={() => { const id = dragging; armed.current = null; setDragging(null); if (id) { change(current); setAnnounce(`${BLOCKS[id].title} moved`); } }}
                      onPointerUp={() => { armed.current = null; }}>
                      {def.render(frame)}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
