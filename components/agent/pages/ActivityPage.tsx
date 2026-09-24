"use client";

// Activity log (design spec §11): every tool the agent ran — who asked, what
// tool, what arguments, what came back, confirmed or not. Read-only. Rows with
// a record expand to REQUEST · ARGUMENTS·RESULT · CONFIRMATION. Filter menus
// and paging follow the console's Dropdown and "Load more" patterns (§16.2).

import { useCallback, useEffect, useState } from "react";
import PortalShell from "@/components/portal/Shell";
import { Dropdown, EmptyState, LoadingRows } from "@/components/console-kit";
import { C, TIER, mono } from "../ui/tokens";
import { Button, Tag, hmsZ } from "../ui/primitives";
import AgentStyles from "../ui/AgentStyles";
import { AGENT_BASE } from "../types";

type Row = { id: number; at: string; who: string; kind: "READ" | "WRITE" | "SEND" | "FILE"; tool: string; args: Record<string, unknown>; result: { text: string; tone: string }; confirmed: { text: string; tone: string }; conversationId: string | null; hasRecord: boolean; full: { args: Record<string, unknown>; result: unknown; error: string | null; confirmationStatus: string | null; level: string | null } };
const KIND: Record<Row["kind"], { fg: string; bg: string }> = { READ: { fg: C.neutral, bg: C.neutralTint }, WRITE: { fg: C.primaryHover, bg: C.primaryTint2 }, SEND: { fg: TIER.company.fg, bg: TIER.company.bg }, FILE: { fg: C.ok, bg: C.okTint } };
const TONE: Record<string, string> = { ok: C.okDot, muted: C.faint, danger: C.dangerBadge, warn: C.warnDot, faint: C.faint };
const GRID = "110px 150px 90px 190px minmax(0,1fr) 170px 150px";

export default function ActivityPage() {
  const [filter, setFilter] = useState<"all" | "changes" | "sent" | "denied">("all");
  const [person, setPerson] = useState<string>("");
  const [tool, setTool] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [people, setPeople] = useState<string[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [request, setRequest] = useState<Record<number, { title: string; text: string | null } | null>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (before: string | null = null) => {
    const qs = new URLSearchParams({ filter, limit: "60" }); if (person) qs.set("person", person); if (tool) qs.set("tool", tool); if (date) qs.set("date", date); if (before) qs.set("before", before);
    const r = await fetch(`${AGENT_BASE}/api/activity?${qs}`, { credentials: "same-origin", cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) { setError(r?.message || "Could not load the activity log."); setRows([]); return; }
    setRows((prev) => (before && prev ? [...prev, ...r.rows] : r.rows)); setPeople(r.people ?? []); setTools(r.tools ?? []); setNextBefore(r.rows.length >= 60 ? r.nextBefore : null);
  }, [filter, person, tool, date]);
  useEffect(() => { setRows(null); setOpen(null); void load(); }, [load]);

  async function toggle(row: Row) {
    if (open === row.id) { setOpen(null); return; }
    setOpen(row.id);
    if (row.conversationId && request[row.id] === undefined) {
      const r = await fetch(`${AGENT_BASE}/api/activity/${row.id}/request?conversation=${encodeURIComponent(row.conversationId)}&at=${encodeURIComponent(row.at)}`, { credentials: "same-origin" }).then((x) => x.json()).catch(() => null);
      setRequest((m) => ({ ...m, [row.id]: r?.request ?? null }));
    }
  }

  return (
    <PortalShell crumb="Ops Agent" title="Activity log" subtitle="Every tool the agent ran, for whom, with what, and what came back. Read-only, kept 24 months. Click a row for the full record."
      headerRight={<a href={`${AGENT_BASE}/api/activity?filter=${filter}&format=csv${person ? `&person=${encodeURIComponent(person)}` : ""}${tool ? `&tool=${encodeURIComponent(tool)}` : ""}${date ? `&date=${date}` : ""}`} style={{ textDecoration: "none" }}><Button variant="secondary" size="lg" style={{ borderRadius: 10 }}>Export CSV</Button></a>}>
      <AgentStyles />
      <div style={{ padding: "30px 32px", display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div role="tablist" style={{ display: "flex", background: C.divider, borderRadius: 10, padding: 3 }}>
            {(["all", "changes", "sent", "denied"] as const).map((f) => <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} style={{ fontFamily: "inherit", fontSize: 13, fontWeight: 600, padding: "7px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: filter === f ? C.surface : "transparent", color: filter === f ? C.ink : C.muted, boxShadow: filter === f ? "0 1px 2px rgba(0,0,0,.06)" : "none" }}>{f[0].toUpperCase() + f.slice(1)}</button>)}
          </div>
          <Dropdown value={person} onChange={setPerson} options={[{ value: "", label: "Person: anyone" }, ...people.map((p) => ({ value: p, label: p }))]} />
          <Dropdown value={tool} onChange={setTool} options={[{ value: "", label: "Tool: any" }, ...tools.map((t) => ({ value: t, label: t }))]} />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" style={{ ...mono({ fontSize: 12.5, fontWeight: 600 }), height: 38, border: `1px solid ${C.borderControl}`, borderRadius: 10, padding: "0 12px", background: C.surface, color: C.ink }} />
        </div>
        {error && <div role="alert" style={{ fontSize: 13, color: C.danger }}>{error}</div>}
        {rows === null && <LoadingRows rows={6} />}
        {rows !== null && rows.length === 0 && <EmptyState title="Nothing logged for this filter">Every tool call the agent makes lands here as it happens.</EmptyState>}
        {rows !== null && rows.length > 0 && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 12, padding: "10px 18px", background: C.page, borderBottom: `1px solid ${C.divider}` }}>
              {["TIME", "WHO ASKED", "KIND", "TOOL", "ARGUMENTS", "RESULT", "CONFIRMED"].map((h) => <span key={h} style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: C.faint }}>{h}</span>)}
            </div>
            {rows.map((r) => (
              <div key={r.id} style={{ borderBottom: `1px solid ${C.dividerRow}` }}>
                <button type="button" onClick={() => void toggle(r)} aria-expanded={open === r.id} className="ag-row-hover ag-focus" style={{ width: "100%", display: "grid", gridTemplateColumns: GRID, gap: 12, padding: "11px 18px", alignItems: "center", cursor: "pointer", border: "none", fontFamily: "inherit", textAlign: "left", background: open === r.id ? C.rowExpanded : "transparent" }}>
                  <span style={{ ...mono({ fontSize: 12.5 }), color: C.body }}>{hmsZ(r.at)}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.who}</span>
                  <span><Tag fg={KIND[r.kind].fg} bg={KIND[r.kind].bg} style={{ letterSpacing: "0.04em" }}>{r.kind}</Tag></span>
                  <span style={mono({ fontSize: 12.5, fontWeight: 600 })}>{r.tool}</span>
                  <span style={{ ...mono({ fontSize: 12 }), color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{JSON.stringify(r.args)}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: TONE[r.result.tone] ?? C.body }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: TONE[r.result.tone] ?? C.body }} />{r.result.text}</span>
                  <span style={{ fontSize: 12.5, fontWeight: r.confirmed.tone === "faint" ? 500 : 600, color: TONE[r.confirmed.tone] ?? C.body }}>{r.confirmed.text}</span>
                </button>
                {open === r.id && (
                  <div style={{ padding: "4px 18px 16px 130px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, background: C.rowRecord }}>
                    <div><div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.faint, marginBottom: 6 }}>REQUEST</div><div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{request[r.id] === undefined && r.conversationId ? "…" : request[r.id]?.text ? `“${request[r.id]?.text}”` : "Direct call — no message."}</div>{request[r.id]?.title && r.conversationId && <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Thread <a href={`/agent/t/${encodeURIComponent(r.conversationId)}`} style={{ color: C.primary }}>{request[r.id]?.title}</a></div>}</div>
                    <div><div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.faint, marginBottom: 6 }}>ARGUMENTS · RESULT</div><div style={{ ...mono({ fontSize: 12 }), lineHeight: 1.6, background: C.sidebar, borderRadius: 8, padding: "9px 11px", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{Object.entries(r.full.args).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join("\n")}{r.full.result ? `\n→ ${typeof r.full.result === "object" ? JSON.stringify(r.full.result).slice(0, 600) : String(r.full.result)}` : ""}{r.full.error ? `\n→ ${r.full.error}` : ""}</div></div>
                    <div><div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: C.faint, marginBottom: 6 }}>CONFIRMATION</div><div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{r.full.confirmationStatus === "confirmed" ? `Confirmed by ${r.who} ${hmsZ(r.at)}${r.full.level ? `\nLevel: ${r.full.level}` : ""}` : r.full.confirmationStatus === "rejected" ? `Declined by ${r.who} ${hmsZ(r.at)}` : r.full.confirmationStatus === "pending" ? "Prompted — awaiting an answer" : "Not required"}</div></div>
                  </div>
                )}
              </div>
            ))}
            {nextBefore && <div style={{ padding: "10px 18px" }}><Button variant="ghost" size="sm" onClick={() => void load(nextBefore)}>Load more</Button></div>}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
