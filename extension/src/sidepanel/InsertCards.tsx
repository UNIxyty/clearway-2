// Insert into page (§E9): proposal → review (confirmation look) → inserted (with Undo) → undone / cancelled.
// The word on the first button is Review, not Insert. Nothing here touches the page: the worker does.
import { useEffect, useState } from "react";
import { C, SHADOW, mono } from "@/components/agent/ui/tokens";
import { Button, Icon, hmsZ } from "@/components/agent/ui/primitives";
import { useKeybinds } from "@/components/agent/ui/keybinds";
import type { InsertState } from "~/shared/protocol";

/** ```insert … ``` fences in a reply become the proposal card; the rest stays prose. */
export function splitInsert(content: string): { prose: string; inserts: string[] } {
  const inserts: string[] = [];
  const prose = content.replace(/```insert[^\n]*\n([\s\S]*?)```/g, (_, body: string) => { inserts.push(body.replace(/\s+$/, "")); return ""; }).replace(/\n{3,}/g, "\n\n").trim();
  return { prose, inserts };
}

export function InsertProposal({ text, host, verbatimLabel, onReview, onEdit }: { text: string; host: string; verbatimLabel: string | null; onReview: () => void; onEdit: () => void }) {
  const [copied, setCopied] = useState(false);
  const shown = verbatimLabel ? `${verbatimLabel}\n${text}` : text;
  return (
    <div data-insert="proposal" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Icon name="pen-line" size={15} color={C.primaryHover} /><span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>Insert into page</span><span style={{ fontSize: 11, color: C.muted }}>{host}</span></div>
      <div style={{ fontSize: 13, lineHeight: 1.55, color: C.ink, background: C.page, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", whiteSpace: "pre-wrap" }}>{shown}</div>
      <div style={{ fontSize: 11.5, color: C.muted }}>Goes into the field you last clicked in the page, after the caret. Nothing is inserted until you review it there.</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button variant="primary" size="sm" onClick={onReview}>Review in page</Button>
        <Button variant="secondary" size="sm" onClick={() => { void navigator.clipboard.writeText(shown).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>{copied ? "Copied" : "Copy"}</Button>
        <Button variant="ghost" size="sm" onClick={onEdit}>Edit</Button>
      </div>
    </div>
  );
}

export function InsertReview({ insert, onInsert, onEdit, onCancel }: { insert: InsertState; onInsert: () => void; onEdit: () => void; onCancel: () => void }) {
  const kb = useKeybinds();
  const lines = insert.text.split("\n").length; const chars = insert.text.length;
  const where = insert.status === "picking" ? "Click the field to insert into" : `${cap(insert.field?.label ?? "field")}${insert.after ? `, after “${insert.after}”` : ""}`;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onCancel(); } else if (kb.matches(e, "confirm") && insert.status === "review") { e.preventDefault(); onInsert(); } };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [kb, insert.status, onInsert, onCancel]);
  const row = (k: string, v: React.ReactNode) => (<><span style={{ color: C.muted }}>{k}</span><span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{v}</span></>);
  return (
    <div data-insert={insert.status} role="group" aria-label="Insert this text?" style={{ background: C.surface, border: `1.5px solid ${C.primary}`, borderRadius: 14, boxShadow: SHADOW.pending, overflow: "hidden" }}>
      <div style={{ background: C.primaryTint3, borderBottom: `1px solid ${C.primaryLine}`, padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Icon name="pen-line" size={15} color={C.primaryHover} /><span style={{ fontSize: 14, fontWeight: 700, color: C.primaryHover, flex: 1 }}>Insert this text?</span><span style={{ fontSize: 11.5, color: C.primaryOnTint }}>local · not saved to Clearway</span>
      </div>
      <div style={{ padding: 12, display: "grid", gridTemplateColumns: "64px minmax(0,1fr)", rowGap: 9, columnGap: 12, fontSize: 13 }}>
        {row("Where", where)}{row("Adds", `${lines} line${lines === 1 ? "" : "s"} · ${chars} characters`)}{row("Replaces", "Nothing. Existing text is kept")}{row("Sends", "No. Clearway never presses Send")}
      </div>
      <div style={{ padding: "10px 12px", borderTop: `1px solid ${C.divider}`, background: C.page, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Button variant="primary" size="sm" onClick={onInsert} disabled={insert.status !== "review"} keycap={kb.label("confirm")}>Insert</Button>
        <Button variant="secondary" size="sm" onClick={onEdit}>Edit first</Button>
        <span style={{ flex: 1 }} /><Button variant="ghost" size="sm" onClick={onCancel} keycap="Esc">Cancel</Button>
      </div>
    </div>
  );
}

export function InsertRecord({ insert, onUndo }: { insert: InsertState; onUndo: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  if (insert.status === "inserted") {
    const undoable = Boolean(insert.undoUntil) && new Date(insert.undoUntil!).getTime() > now;
    const left = undoable ? Math.max(0, Math.ceil((new Date(insert.undoUntil!).getTime() - now) / 1000)) : 0;
    return (
      <div data-insert="inserted" className="ag-record-in" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Icon name="circle-check" size={15} color={C.okDot} /><span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>Inserted into {insert.field?.label ?? "the field"}</span><span style={{ ...mono({ fontSize: 11 }), color: C.faint }}>{hmsZ(insert.insertedAt ?? null)}</span></div>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.body }}>{insert.characters ?? insert.text.length} characters on {insert.host}. {undoable ? `Undo here or from the page for ${left} s, or until you edit the field.` : "Undo is no longer available."} Recorded in the activity log.</div>
        {undoable && <div><Button variant="secondary" size="sm" onClick={onUndo}>Undo</Button></div>}
      </div>
    );
  }
  if (insert.status === "undone") return (
    <div data-insert="undone" className="ag-record-in" style={{ background: C.page, border: `1px dashed ${C.borderControl}`, borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Icon name="undo-2" size={15} color={C.faint} /><span style={{ fontSize: 14, fontWeight: 600, color: C.muted, flex: 1 }}>Insert undone</span><span style={{ ...mono({ fontSize: 11 }), color: C.faint }}>{hmsZ(new Date().toISOString())}</span></div>
      <div style={{ fontSize: 13, color: C.muted }}>The field is back to what it was before. Ask again if you want a different version.</div>
    </div>
  );
  if (insert.status === "cancelled") return (
    <div data-insert="cancelled" className="ag-record-in" style={{ background: C.page, border: `1px dashed ${C.borderControl}`, borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Icon name="circle-slash" size={15} color={C.faint} /><span style={{ fontSize: 14, fontWeight: 600, color: C.muted, flex: 1 }}>Insert cancelled{insert.cancelReason && /field changed|is gone/i.test(insert.cancelReason) ? ` — ${insert.cancelReason.replace(/\.$/, "").replace(/^The field this was going into is gone/, "the field this was going into is gone").replace(/^The field changed/, "the field changed")}` : ""}</span></div>
      <div style={{ fontSize: 13, color: C.muted }}>{insert.cancelReason && !/field changed|is gone/i.test(insert.cancelReason) ? insert.cancelReason : "Nothing was inserted."}</div>
    </div>
  );
  return null;
}
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
