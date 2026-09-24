"use client";

// History (design spec §9): find and reopen a past thread. Search over titles,
// messages and entities; filter chips; grouped list with entity chips and meta.
// Empty, loading and no-results states follow the console's own EmptyState
// and LoadingRows patterns (the spec did not draw them — §16.2).

import { useEffect, useMemo, useState } from "react";
import PortalShell from "@/components/portal/Shell";
import { EmptyState, LoadingRows } from "@/components/console-kit";
import { C, FONT, mono } from "../ui/tokens";
import { Button, Icon, Tag, dayTimeZ } from "../ui/primitives";
import AgentStyles from "../ui/AgentStyles";
import { AGENT_BASE, type ConversationSummary } from "../types";

const FILTERS = [["mine", "Mine"], ["changes", "With changes"], ["files", "With files"], ["voice", "Voice"]] as const;

export default function HistoryPage() {
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Set<string>>(new Set(["mine"]));
  const [rows, setRows] = useState<ConversationSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true; setRows(null);
    const f = [...filters].filter((x) => x !== "mine").join(",");
    fetch(`${AGENT_BASE}/api/history?q=${encodeURIComponent(q)}&filter=${encodeURIComponent(f)}`, { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json()).then((b) => { if (!alive) return; if (!b?.ok) { setError(b?.message || "Could not load history."); setRows([]); return; } setRows(b.conversations ?? []); setTotal(b.total ?? 0); })
      .catch((e) => { if (alive) { setError(String(e)); setRows([]); } });
    return () => { alive = false; };
  }, [q, filters]);

  const grouped = useMemo(() => {
    const list = rows ?? [];
    const startOfToday = new Date(); startOfToday.setUTCHours(0, 0, 0, 0);
    const yesterday = new Date(startOfToday.getTime() - 86_400_000), lastWeek = new Date(startOfToday.getTime() - 7 * 86_400_000);
    const g: Array<[string, ConversationSummary[]]> = [["TODAY", []], ["YESTERDAY", []], ["LAST WEEK", []], ["OLDER", []]];
    for (const c of list) { const d = new Date(c.lastMessageAt); (d >= startOfToday ? g[0] : d >= yesterday ? g[1] : d >= lastWeek ? g[2] : g[3])[1].push(c); }
    return g.filter(([, l]) => l.length);
  }, [rows]);

  return (
    <PortalShell crumb="Ops Agent" title="History" subtitle="Your conversations with the agent. Searches titles, messages and the entities mentioned."
      headerRight={<a href="/agent" style={{ textDecoration: "none" }}><Button variant="primary" size="lg" style={{ borderRadius: 10 }}>New chat</Button></a>}>
      <AgentStyles />
      <div style={{ padding: "30px 32px", display: "flex", flexDirection: "column", gap: 18, maxWidth: 1100 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 9, height: 42, background: C.surface, border: `1px solid ${C.borderControl}`, borderRadius: 10, padding: "0 13px", flex: 1, minWidth: 260 }} className="ag-search">
            <Icon name="search" size={16} color={C.faint} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search threads, messages, callsigns…" aria-label="Search history" style={{ flex: 1, border: "none", outline: "none", fontFamily: /^[A-Z0-9-]{3,}$/.test(q) ? FONT.mono : "inherit", fontSize: 14, background: "transparent" }} />
            {rows && <span style={{ fontSize: 12.5, color: C.faint }}>{rows.length} of {total}</span>}
          </label>
          {FILTERS.map(([key, label]) => { const on = filters.has(key); return <button key={key} type="button" aria-pressed={on} onClick={() => setFilters((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; })} className="ag-hover ag-focus" style={{ fontFamily: "inherit", fontSize: 13, fontWeight: 600, padding: "8px 12px", borderRadius: 999, cursor: "pointer", background: on ? C.ink : C.surface, color: on ? C.surface : C.ink, border: `1px solid ${on ? C.ink : C.borderControl}` }}>{label}</button>; })}
        </div>
        {error && <div role="alert" style={{ fontSize: 13, color: C.danger }}>{error}</div>}
        {rows === null && <LoadingRows rows={4} />}
        {rows !== null && rows.length === 0 && (q ? <EmptyState title="No threads match">Try a callsign, an ICAO code, or a word from the conversation.</EmptyState> : <EmptyState title="No conversations yet">Open the panel with ⌘J on any console page, or start a new chat.</EmptyState>)}
        {grouped.length > 0 && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
            {grouped.map(([label, list]) => (
              <div key={label}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: C.faint, padding: "12px 18px 6px", background: C.page, borderBottom: `1px solid ${C.divider}` }}>{label}</div>
                {list.map((c) => (
                  <a key={c.id} href={`/agent/t/${encodeURIComponent(c.id)}`} className="ag-row-hover ag-hover" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 16, padding: "14px 18px", borderBottom: `1px solid ${C.dividerRow}`, textDecoration: "none", color: "inherit" }}>
                    <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontSize: 14.5, fontWeight: 700 }}>{c.title}</span>{c.changes ? <Tag fg={C.ok} bg={C.okTint}>{c.changes} CHANGE{c.changes > 1 ? "S" : ""}</Tag> : null}</div>
                      {c.snippet && <div style={{ fontSize: 13.5, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.snippet}</div>}
                      {c.entities && c.entities.length > 0 && <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{c.entities.map((e) => <span key={e} style={{ ...mono({ fontSize: 11.5, fontWeight: 600 }), color: C.primaryHover, background: C.primaryTint, borderRadius: 5, padding: "2px 6px" }}>{e}</span>)}</div>}
                    </div>
                    <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{ ...mono({ fontSize: 12 }), color: C.muted }} suppressHydrationWarning>{dayTimeZ(c.lastMessageAt)}</span>
                      <span style={{ fontSize: 12, color: C.faint }}>{[c.messageCount ? `${c.messageCount} message${c.messageCount === 1 ? "" : "s"}` : null, c.changes ? `${c.changes} change${c.changes === 1 ? "" : "s"}` : null, c.files ? `${c.files} file${c.files === 1 ? "" : "s"}` : null, c.sent ? `${c.sent} email${c.sent === 1 ? "" : "s"} sent` : null, c.voice ? "voice" : null].filter(Boolean).join(" · ")}</span>
                    </div>
                  </a>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
