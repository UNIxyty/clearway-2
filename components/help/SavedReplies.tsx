"use client";

// Saved replies manager. Each reply shows how often it is actually used, so
// the list stays honest about what earns its place, and each can pair with a
// status change — most canned replies go out together with one.

import { useEffect, useState } from "react";
import PortalShell from "@/components/portal/Shell";
import { HELP_STATUSES, HELP_STATUS_META, type HelpStatus } from "@/lib/help/shared";

type SavedReply = { id: string; text: string; setsStatus: HelpStatus | null; useCount: number };

export default function SavedReplies() {
  const [replies, setReplies] = useState<SavedReply[] | null>(null);
  const [editing, setEditing] = useState<{ id?: string; text: string; setsStatus: HelpStatus | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch("/api/help/saved-replies", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setReplies(d.replies || []))
      .catch(() => setReplies([]));

  useEffect(() => { void load(); }, []);

  async function save() {
    if (!editing || !editing.text.trim() || busy) return;
    setBusy(true);
    await fetch("/api/help/saved-replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    }).catch(() => {});
    setBusy(false);
    setEditing(null);
    void load();
  }

  async function remove(id: string) {
    await fetch(`/api/help/saved-replies?id=${id}`, { method: "DELETE" }).catch(() => {});
    void load();
  }

  return (
    <PortalShell
      crumb="Developer"
      title="Saved replies"
      subtitle="Inserted from the inbox popover and the mini app chip row; ⇧⏎ inserts and sets the paired status."
      headerRight={
        <button
          onClick={() => setEditing({ text: "", setsStatus: null })}
          className="inline-flex h-9 cursor-pointer items-center rounded-[9px] border-none bg-cw-primary px-3.5 text-[13px] font-bold text-cw-text-on-primary"
        >
          New reply
        </button>
      }
    >
      <div className="mx-auto flex max-w-[760px] flex-col gap-2.5 px-[30px] py-6">
        {editing && (
          <div className="flex flex-col gap-3 rounded-[13px] border border-cw-primary-tint-border bg-cw-primary-tint p-4">
            <textarea
              autoFocus
              rows={2}
              value={editing.text}
              onChange={(e) => setEditing({ ...editing, text: e.target.value })}
              placeholder="The reply text ops will receive — it arrives as an ordinary message"
              className="w-full resize-none rounded-[9px] border border-cw-border bg-cw-bg-surface px-3 py-2.5 text-[13.5px] leading-[1.5] text-cw-text outline-none"
            />
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] font-semibold text-cw-text-body">Pairs with:</span>
              <button
                onClick={() => setEditing({ ...editing, setsStatus: null })}
                className="h-7 cursor-pointer rounded-[7px] px-2.5 text-[12px] font-semibold"
                style={!editing.setsStatus ? { background: "var(--cw-ink)", color: "var(--cw-on-ink)", border: "none" } : { background: "var(--cw-bg-surface)", border: "1px solid var(--cw-border)", color: "var(--cw-text-body)" }}
              >
                no status change
              </button>
              {HELP_STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setEditing({ ...editing, setsStatus: s })}
                  className="h-7 cursor-pointer rounded-[7px] border px-2.5 font-mono text-[10px] font-extrabold tracking-[0.05em]"
                  style={
                    editing.setsStatus === s
                      ? { background: HELP_STATUS_META[s].bg, borderColor: HELP_STATUS_META[s].color, color: HELP_STATUS_META[s].color }
                      : { background: "var(--cw-bg-surface)", borderColor: "var(--cw-border)", color: "var(--cw-text-muted)" }
                  }
                >
                  {HELP_STATUS_META[s].chip}
                </button>
              ))}
              <div className="ml-auto flex gap-2">
                <button onClick={() => setEditing(null)} className="h-8 cursor-pointer rounded-[8px] border border-cw-border bg-cw-bg-surface px-3 text-[12.5px] font-semibold text-cw-text-muted">Cancel</button>
                <button onClick={() => void save()} className="h-8 cursor-pointer rounded-[8px] border-none bg-cw-primary px-3 text-[12.5px] font-bold text-cw-text-on-primary">
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
            {editing.setsStatus === "impossible" && (
              <span className="text-[12px] text-cw-danger-text">
                Impossible still requires a written reason at send time — the reply text is used as the reason.
              </span>
            )}
          </div>
        )}

        {replies === null && <div className="h-16 animate-pulse rounded-[13px] bg-cw-bg-surface" />}
        {replies?.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-[13px] border border-cw-border bg-cw-bg-surface px-4 py-3">
            <span
              className="flex h-8 w-8 flex-none items-center justify-center rounded-[8px] text-[14px]"
              style={
                r.setsStatus === "under_process" ? { background: "var(--cw-primary-tint)", color: "var(--cw-text-link)" }
                : r.setsStatus === "done" ? { background: "var(--cw-success-tint)", color: "var(--cw-success-text)" }
                : r.setsStatus === "impossible" ? { background: "var(--cw-danger-tint)", color: "var(--cw-danger-text)" }
                : { background: "var(--cw-bg-hover)", color: "var(--cw-text-body)" }
              }
            >
              {r.setsStatus === "under_process" ? "◷" : r.setsStatus === "done" ? "✓" : r.setsStatus === "impossible" ? "✕" : "▣"}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[13.5px] font-semibold leading-[1.4] text-cw-text">{r.text}</span>
              <span className="text-[11.5px] text-cw-text-muted">
                {r.setsStatus ? `sets ${HELP_STATUS_META[r.setsStatus].label} · ` : ""}used {r.useCount}×
              </span>
            </div>
            <button onClick={() => setEditing({ id: r.id, text: r.text, setsStatus: r.setsStatus })} className="cursor-pointer border-none bg-transparent text-[12.5px] font-bold text-cw-text-link">Edit</button>
            <button onClick={() => void remove(r.id)} className="cursor-pointer border-none bg-transparent text-[12.5px] font-semibold text-cw-text-muted hover:text-cw-danger-text">Delete</button>
          </div>
        ))}
        {replies !== null && replies.length === 0 && !editing && (
          <div className="rounded-[13px] border border-cw-border bg-cw-bg-surface p-6 text-center text-[13px] text-cw-text-muted">
            No saved replies yet — the migration seeds five starters.
          </div>
        )}
      </div>
    </PortalShell>
  );
}
