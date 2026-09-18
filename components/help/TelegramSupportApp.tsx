"use client";

// The Telegram mini app — triage on a phone, one-handed, following Telegram's
// own conventions: the main button only where there is exactly one thing to
// confirm (Send reply, Join chat, Save status — the inbox has none), Telegram's
// back button for every step back (no in-app chevrons), and colours from the
// theme parameters. Only the type chips and mono code blocks keep fixed hues —
// they are what make a message recognisable across sides.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HELP_CONTEXT_ORDER,
  HELP_STATUSES,
  HELP_STATUS_META,
  HELP_TYPE_META,
  helpContextFieldIsRed,
  helpThreadHasPresence,
  type HelpBlock,
  type HelpStatus,
  type HelpThread,
  type HelpThreadType,
} from "@/lib/help/shared";

type TG = {
  initData: string;
  initDataUnsafe?: { start_param?: string };
  colorScheme?: "light" | "dark";
  themeParams?: Record<string, string>;
  ready: () => void;
  expand: () => void;
  close: () => void;
  showAlert?: (msg: string) => void;
  MainButton: {
    setText: (t: string) => void; show: () => void; hide: () => void;
    onClick: (cb: () => void) => void; offClick: (cb: () => void) => void;
    showProgress?: (leave?: boolean) => void; hideProgress?: () => void;
  };
  BackButton: { show: () => void; hide: () => void; onClick: (cb: () => void) => void; offClick: (cb: () => void) => void };
};

type ThreadRow = HelpThread & { preview: string; unread: number };
type SavedReply = { id: string; text: string; setsStatus: HelpStatus | null; useCount: number };
type Message = { id: string; author: "ops" | "developer"; authorName: string | null; blocks: HelpBlock[]; createdAt: string };
type Ev = { id: string; kind: string; payload: Record<string, unknown>; actor: string | null; createdAt: string };
type Att = { id: string; name: string; size: number; mime: string; isImage: boolean };

const utc = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date();
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}Z`;
};
const age = (iso: string) => {
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return h < 48 ? "yesterday" : `${Math.floor(h / 24)} d`;
};
const waitingSeconds = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));

function needsYouNow(t: ThreadRow): boolean {
  if (t.status === "done" || t.status === "impossible") return false;
  if (t.type === "urgent") return true;
  return t.type === "chat" && ["notified", "joining", "no_answer"].includes(t.presence);
}

const initialsOf = (name: string) =>
  name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "??";

export default function TelegramSupportApp() {
  const [tg, setTg] = useState<TG | null>(null);
  const [threads, setThreads] = useState<ThreadRow[] | null>(null);
  const [savedReplies, setSavedReplies] = useState<SavedReply[]>([]);
  const [mediaToken, setMediaToken] = useState("");
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [lost, setLost] = useState(false);
  const [denied, setDenied] = useState(false);
  const [view, setView] = useState<{ name: "inbox" } | { name: "thread"; id: string } | { name: "join"; id: string }>({ name: "inbox" });
  const [detail, setDetail] = useState<{ thread: HelpThread; messages: Message[]; events: Ev[]; attachments: Att[] } | null>(null);
  const [filterSheet, setFilterSheet] = useState(false);
  const [cannedSheet, setCannedSheet] = useState(false);
  const [statusSheet, setStatusSheet] = useState(false);
  const [selectedReply, setSelectedReply] = useState<SavedReply | null>(null);
  const [fltStatus, setFltStatus] = useState<HelpStatus | null>(null);
  const [fltType, setFltType] = useState<HelpThreadType | null>(null);
  const [fltUnread, setFltUnread] = useState(false);
  const [draftStatus, setDraftStatus] = useState<HelpStatus | null>(null);
  const [reason, setReason] = useState("");
  const [reply, setReply] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [, setTick] = useState(0); // waiting-time seconds tick
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  // ── Telegram bootstrap + theme ────────────────────────────────────────────
  useEffect(() => {
    const boot = () => {
      const w = window as unknown as { Telegram?: { WebApp?: TG } };
      const app = w.Telegram?.WebApp;
      if (!app) return false;
      app.ready();
      app.expand();
      setTg(app);
      const start = app.initDataUnsafe?.start_param;
      if (start) setView({ name: "thread", id: start }); // resolved to join view after load
      return true;
    };
    if (!boot()) {
      const t = setInterval(() => boot() && clearInterval(t), 100);
      return () => clearInterval(t);
    }
  }, []);

  const theme = useMemo(() => {
    const p = tg?.themeParams || {};
    const dark = tg?.colorScheme === "dark";
    return {
      dark,
      bg: p.bg_color || (dark ? "#17212b" : "#ffffff"),
      secondaryBg: p.secondary_bg_color || (dark ? "#232e3c" : "#f1f1f2"),
      text: p.text_color || (dark ? "#ffffff" : "#000000"),
      hint: p.hint_color || (dark ? "#708499" : "#999999"),
      button: p.button_color || (dark ? "#5288c1" : "#2481cc"),
      border: dark ? "#232e3c" : "#e4e4e6",
      outBubble: dark ? "#2b5278" : "#e1f0ff",
    };
  }, [tg]);

  const api = useCallback(
    async (init: RequestInit & { qs?: string } = {}) => {
      const res = await fetch(`/api/telegram/support${init.qs || ""}`, {
        ...init,
        headers: {
          ...(init.headers || {}),
          "x-telegram-init-data": tg?.initData || "",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
      });
      if (res.status === 401) { setDenied(true); throw new Error("unauthorized"); }
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error || `HTTP ${res.status}`);
      return res.json();
    },
    [tg],
  );

  const loadInbox = useCallback(async () => {
    try {
      const d = await api({ qs: "?op=inbox" });
      setThreads(d.threads);
      setSavedReplies(d.savedReplies || []);
      setMediaToken(d.mediaToken || "");
      setFetchedAt(d.fetchedAt);
      setLost(false);
      try { localStorage.setItem("tg-help-inbox", JSON.stringify({ threads: d.threads, at: d.fetchedAt })); } catch { /* full */ }
    } catch (e) {
      if ((e as Error).message !== "unauthorized") {
        setLost(true);
        if (!threads) {
          try {
            const cached = JSON.parse(localStorage.getItem("tg-help-inbox") || "null");
            if (cached?.threads) { setThreads(cached.threads); setFetchedAt(cached.at); }
          } catch { /* none */ }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const loadThread = useCallback(async (id: string) => {
    try {
      const d = await api({ qs: `?op=thread&id=${encodeURIComponent(id)}` });
      setDetail(d);
      setMediaToken(d.mediaToken || "");
      // A waiting chat opened from the push lands on the invitation screen.
      const t: HelpThread = d.thread;
      if (helpThreadHasPresence(t.type) && ["notified", "joining", "no_answer"].includes(t.presence) && viewRef.current.name !== "join") {
        setView({ name: "join", id: t.id });
      } else if (viewRef.current.name === "join") {
        setView({ name: "join", id: t.id });
      } else {
        setView({ name: "thread", id: t.id });
      }
    } catch { /* handled by lost banner */ }
  }, [api]);

  useEffect(() => {
    if (!tg) return;
    if (view.name === "inbox") void loadInbox();
    else void loadThread(view.id);
    const poll = setInterval(() => {
      const current = viewRef.current;
      if (current.name === "inbox") void loadInbox();
      else void loadThread(current.id);
    }, 15000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tg, view.name, view.name === "inbox" ? "" : view.id]);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Telegram chrome: back button + main button ────────────────────────────
  useEffect(() => {
    if (!tg) return;
    const onBack = () => {
      if (filterSheet || cannedSheet || statusSheet) { setFilterSheet(false); setCannedSheet(false); setStatusSheet(false); return; }
      if (viewRef.current.name === "join") {
        tg.showAlert?.("They stay on “notified” — the console says you have not opened the chat yet.");
        setView({ name: "inbox" });
        return;
      }
      if (viewRef.current.name !== "inbox") { setView({ name: "inbox" }); setDetail(null); return; }
      tg.close();
    };
    tg.BackButton.onClick(onBack);
    if (view.name === "inbox" && !filterSheet && !cannedSheet && !statusSheet) tg.BackButton.hide();
    else tg.BackButton.show();
    return () => tg.BackButton.offClick(onBack);
  }, [tg, view, filterSheet, cannedSheet, statusSheet]);

  const filteredCount = useMemo(() => {
    let list = threads || [];
    if (fltUnread) list = list.filter((t) => t.unread > 0);
    if (fltStatus) list = list.filter((t) => t.status === fltStatus);
    if (fltType) list = list.filter((t) => t.type === fltType);
    return list.length;
  }, [threads, fltUnread, fltStatus, fltType]);

  const mainButton = useMemo<null | { text: string; action: () => void }>(() => {
    if (!tg) return null;
    if (filterSheet) return { text: `Show ${filteredCount} conversation${filteredCount === 1 ? "" : "s"}`, action: () => setFilterSheet(false) };
    if (statusSheet && draftStatus)
      return {
        text: "Save status",
        action: () => {
          if (draftStatus === "impossible" && reason.trim().length < 5) { tg.showAlert?.("Impossible needs a written reason."); return; }
          void api({ method: "POST", body: JSON.stringify({ op: "status", id: detail?.thread.id, status: draftStatus, reason: reason.trim() || undefined }) })
            .then(() => { setStatusSheet(false); setDraftStatus(null); setReason(""); if (detail) void loadThread(detail.thread.id); })
            .catch((e) => tg.showAlert?.(e.message));
        },
      };
    if (view.name === "join" && detail) return {
      text: "Join chat",
      action: () => {
        void api({ method: "POST", body: JSON.stringify({ op: "presence", id: detail.thread.id, action: "join" }) })
          .then(() => setView({ name: "thread", id: detail.thread.id }))
          .catch((e) => tg.showAlert?.(e.message));
      },
    };
    if (view.name === "thread" && detail) return {
      text: "SEND REPLY",
      action: () => void sendReply(),
    };
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tg, view, filterSheet, statusSheet, draftStatus, reason, filteredCount, detail, reply]);

  useEffect(() => {
    if (!tg) return;
    if (!mainButton) { tg.MainButton.hide(); return; }
    tg.MainButton.setText(mainButton.text);
    tg.MainButton.show();
    const cb = mainButton.action;
    tg.MainButton.onClick(cb);
    return () => tg.MainButton.offClick(cb);
  }, [tg, mainButton]);

  async function sendReply(extra?: string) {
    if (!detail || !tg) return;
    const text = (extra ?? reply).trim();
    if (!text) return;
    const blocks: HelpBlock[] = [];
    text.split(/```/).forEach((part, i) => {
      const trimmed = part.replace(/^\n+|\n+$/g, "");
      if (!trimmed) return;
      if (i % 2 === 1) blocks.push({ type: "code", text: trimmed });
      else for (const para of trimmed.split(/\n{2,}/)) if (para.trim()) blocks.push({ type: "paragraph", text: para.trim() });
    });
    try {
      await api({ method: "POST", body: JSON.stringify({ op: "message", id: detail.thread.id, blocks }) });
      if (extra === undefined) setReply("");
      void loadThread(detail.thread.id);
    } catch (e) {
      tg.showAlert?.((e as Error).message);
    }
  }

  function insertCanned(r: SavedReply, alsoStatus: boolean) {
    setReply((v) => (v ? `${v}\n${r.text}` : r.text));
    setCannedSheet(false);
    setSelectedReply(null);
    void api({ method: "POST", body: JSON.stringify({ op: "replyUsed", replyId: r.id }) }).catch(() => {});
    if (alsoStatus && r.setsStatus && detail) {
      void api({
        method: "POST",
        body: JSON.stringify({ op: "status", id: detail.thread.id, status: r.setsStatus, reason: r.setsStatus === "impossible" ? r.text : undefined }),
      }).then(() => detail && void loadThread(detail.thread.id)).catch(() => {});
    }
    inputRef.current?.focus();
  }

  // ── Fixed-hue pieces (identical across sides) ────────────────────────────
  const typeChip = (type: HelpThreadType) => {
    const m = HELP_TYPE_META[type];
    return (
      <span style={{ display: "inline-flex", alignItems: "center", height: 18, padding: "0 6px", borderRadius: 5, background: m.bg, color: m.color, fontFamily: "ui-monospace, monospace", fontSize: 9, fontWeight: 800, letterSpacing: "0.05em", flex: "none" }}>
        {m.chip}
      </span>
    );
  };
  const statusChip = (status: HelpStatus) => {
    const m = HELP_STATUS_META[status];
    return (
      <span style={{ display: "inline-flex", alignItems: "center", height: 17, padding: "0 6px", borderRadius: 4, background: m.bg, color: m.color, fontFamily: "ui-monospace, monospace", fontSize: 8.5, fontWeight: 800, letterSpacing: "0.05em", flex: "none" }}>
        {m.chip}
      </span>
    );
  };

  const renderBlocks = (blocks: HelpBlock[], atts: Map<string, Att>) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 0 }}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading": case "subheading":
            return <span key={i} style={{ fontSize: 13.5, fontWeight: 700, color: theme.text }}>{b.text}</span>;
          case "paragraph":
            // Inline `code` spans render as mono chips here too (fixed hue —
            // part of what makes a message recognisable across sides).
            return (
              <span key={i} style={{ fontSize: 14, lineHeight: 1.5, color: theme.text, overflowWrap: "anywhere" }}>
                {b.text.split(/(`[^`]+`)/g).map((part, j) =>
                  part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
                    <span key={j} style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.92em", background: "#ffffff", border: "1px solid #e4e4e6", borderRadius: 4, padding: "0 4px", color: "#000000" }}>{part.slice(1, -1)}</span>
                  ) : (
                    <span key={j}>{part}</span>
                  ),
                )}
              </span>
            );
          case "quote":
            return <span key={i} style={{ fontSize: 13.5, lineHeight: 1.5, color: theme.hint, borderLeft: `2px solid ${theme.border}`, paddingLeft: 8 }}>{b.text}</span>;
          case "code":
            // Fixed hue on every surface, light or dark.
            return (
              <div key={i} style={{ background: "#ffffff", border: "1px solid #e4e4e6", borderRadius: 8, padding: "9px 10px", fontFamily: "ui-monospace, monospace", fontSize: 11, lineHeight: 1.65, color: "#000000", whiteSpace: "pre", overflowX: "auto" }}>
                {b.text}
              </div>
            );
          case "bullet": case "numbered":
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {b.items.map((it, j) => (
                  <div key={j} style={{ display: "flex", gap: 8 }}>
                    <span style={{ fontSize: 13.5, color: theme.hint }}>{b.type === "bullet" ? "•" : `${j + 1}.`}</span>
                    <span style={{ fontSize: 13.5, lineHeight: 1.45, color: theme.text }}>{it}</span>
                  </div>
                ))}
              </div>
            );
          case "checklist":
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {b.items.map((it, j) => (
                  <div key={j} style={{ display: "flex", gap: 8 }}>
                    <span style={{ fontSize: 13.5, color: it.checked ? theme.button : theme.hint }}>{it.checked ? "☑" : "☐"}</span>
                    <span style={{ fontSize: 13.5, lineHeight: 1.45, color: theme.text }}>{it.text}</span>
                  </div>
                ))}
              </div>
            );
          case "divider":
            return <div key={i} style={{ height: 1, background: theme.border }} />;
          case "image": {
            // Inline in the flow on the constrained surface too.
            const src = `/api/telegram/support/attachment/${b.id}?mt=${mediaToken}`;
            return (
              <figure key={i} style={{ margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                <a href={src} target="_blank" rel="noreferrer" style={{ display: "block", maxWidth: "100%" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={b.caption || "image"} style={{ display: "block", maxWidth: "100%", maxHeight: 260, objectFit: "contain", borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.secondaryBg }} />
                </a>
                {b.caption && <figcaption style={{ fontSize: 11.5, fontStyle: "italic", color: theme.hint }}>{b.caption}</figcaption>}
              </figure>
            );
          }
          case "attachment": {
            const a = atts.get(b.id);
            if (!a) return null;
            const href = `/api/telegram/support/attachment/${a.id}?mt=${mediaToken}`;
            if (a.isImage) {
              return (
                <a key={i} href={href} target="_blank" rel="noreferrer" style={{ display: "block", width: 140 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={href} alt={a.name} style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 8, border: `1px solid ${theme.border}` }} />
                </a>
              );
            }
            return (
              <a key={i} href={href} target="_blank" rel="noreferrer" style={{ display: "flex", flexDirection: "column", gap: 2, borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.bg, padding: "9px 10px", textDecoration: "none" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>{a.name}</span>
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: theme.hint }}>
                  {a.size >= 1048576 ? `${(a.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(a.size / 1024))} KB`} · tap to view
                </span>
              </a>
            );
          }
        }
      })}
    </div>
  );

  // ── Denied / boot states ──────────────────────────────────────────────────
  if (denied) {
    return (
      <Screen theme={theme}>
        <div style={{ padding: "48px 24px", textAlign: "center", display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>Not your inbox</span>
          <span style={{ fontSize: 13.5, lineHeight: 1.5, color: theme.hint }}>
            This mini app is gated to the developer account. Your Telegram user id is not on the allow-list.
          </span>
        </div>
      </Screen>
    );
  }

  // ── Views ─────────────────────────────────────────────────────────────────
  const attMap = new Map((detail?.attachments || []).map((a) => [a.id, a]));

  if (view.name === "join" && detail) {
    const t = detail.thread;
    const lastOps = [...detail.messages].reverse().find((m) => m.author === "ops");
    const secs = t.presenceAt ? waitingSeconds(t.presenceAt) : 0;
    return (
      <Screen theme={theme}>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center", textAlign: "center", paddingTop: 18 }}>
            <span style={{ width: 52, height: 52, borderRadius: "50%", background: HELP_TYPE_META[t.type].bg, color: HELP_TYPE_META[t.type].color, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "ui-monospace, monospace", fontSize: 16, fontWeight: 700 }}>
              {initialsOf(t.userName || t.userEmail || "??")}
            </span>
            <span style={{ fontSize: 17, fontWeight: 700, color: theme.text, marginTop: 6 }}>
              {t.userName || t.userEmail} wants to chat
            </span>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#e5484d", fontWeight: 700 }}>
              waiting {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
            </span>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: theme.hint }}>{t.reference}</span>
          </div>
          {lastOps && (
            <div style={{ background: theme.secondaryBg, borderRadius: 13, padding: "11px 13px" }}>
              {renderBlocks(lastOps.blocks, attMap)}
            </div>
          )}
          <ContextPanel theme={theme} thread={t} />
          {/* The two lighter exits, listed rather than hidden. */}
          <button
            onClick={() => {
              void sendReply("I will be there in about five minutes.");
              tg?.showAlert?.("Sent. They stay on “notified” until you join.");
            }}
            style={{ height: 44, borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            Say you will be five minutes
          </button>
          <button
            onClick={() => {
              void api({ method: "POST", body: JSON.stringify({ op: "status", id: t.id, status: "under_process" }) })
                .then(() => { tg?.showAlert?.("Filed — answer it like a report when you can."); setView({ name: "thread", id: t.id }); })
                .catch(() => {});
            }}
            style={{ height: 44, borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            Turn this into a report
          </button>
          <span style={{ fontSize: 12, lineHeight: 1.5, color: theme.hint, textAlign: "center" }}>
            Often the context above is enough to answer without joining. Closing without choosing leaves them on “notified”, and they are told so.
          </span>
        </div>
      </Screen>
    );
  }

  if (view.name === "thread" && detail) {
    const t = detail.thread;
    const timeline = [
      ...detail.messages.map((m) => ({ at: m.createdAt, kind: "msg" as const, msg: m })),
      ...detail.events.map((e) => ({ at: e.createdAt, kind: "event" as const, event: e })),
    ].sort((a, b) => a.at.localeCompare(b.at));
    // Keyboard-open case: only the last exchange stays, pinned to the bottom.
    const shown = inputFocused ? timeline.slice(-2) : timeline;
    return (
      <Screen theme={theme}>
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <div style={{ flex: "none", padding: "10px 14px", background: theme.secondaryBg, borderBottom: `1px solid ${theme.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: theme.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</span>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: theme.hint }}>
                {t.reference} · {t.userName || t.userEmail}
              </span>
            </div>
            {!inputFocused && (
              <div style={{ display: "flex", gap: 7, overflowX: "auto" }}>
                <button onClick={() => { setStatusSheet(true); setDraftStatus(t.status); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 9, background: theme.bg, border: `1px solid ${theme.border}`, fontFamily: "ui-monospace, monospace", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.05em", color: HELP_STATUS_META[t.status].color, flex: "none", cursor: "pointer" }}>
                  {HELP_STATUS_META[t.status].chip} <span style={{ fontSize: 10, color: theme.hint }}>▾</span>
                </button>
                <button
                  onClick={() => void api({ method: "POST", body: JSON.stringify({ op: "status", id: t.id, status: "done" }) }).then(() => void loadThread(t.id)).catch(() => {})}
                  style={{ display: "inline-flex", alignItems: "center", height: 34, padding: "0 12px", borderRadius: 9, background: "#e7f6ec", border: "1px solid #c7ead2", fontSize: 12.5, fontWeight: 700, color: "#15803d", flex: "none", cursor: "pointer" }}
                >
                  Mark done
                </button>
                {helpThreadHasPresence(t.type) && t.presence !== "present" && (
                  <button
                    onClick={() => void api({ method: "POST", body: JSON.stringify({ op: "presence", id: t.id, action: "join" }) }).then(() => void loadThread(t.id)).catch(() => {})}
                    style={{ display: "inline-flex", alignItems: "center", height: 34, padding: "0 12px", borderRadius: 9, background: theme.bg, border: `1px solid ${theme.border}`, fontSize: 12.5, fontWeight: 600, color: theme.text, flex: "none", cursor: "pointer" }}
                  >
                    Go live
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 11, justifyContent: shown.length < 4 ? "flex-end" : undefined }}>
            {!inputFocused && <ContextPanel theme={theme} thread={t} />}
            {shown.map((item) => {
              if (item.kind === "event") {
                const e = item.event!;
                const p = e.payload as { to?: string; reason?: string };
                const text = e.kind === "status_changed" ? `You set status to ${HELP_STATUS_META[p.to as HelpStatus]?.label || p.to}` : e.kind === "joined" ? "You joined the chat" : e.kind === "chat_closed" ? "Chat closed" : e.kind;
                return (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "2px 0" }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: theme.hint, flex: "none" }} />
                    <span style={{ fontSize: 11.5, color: theme.hint }}>{text} · {utc(e.createdAt)}</span>
                  </div>
                );
              }
              const m = item.msg!;
              const mine = m.author === "developer";
              return (
                <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: mine ? "flex-end" : "stretch" }}>
                  {!mine && (
                    <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: theme.text }}>{m.authorName || t.userName || "Ops"}</span>
                      <span style={{ fontSize: 11, color: theme.hint }}>{String(t.context.role || "ops")} · {utc(m.createdAt)}</span>
                    </div>
                  )}
                  <div
                    style={{
                      background: mine ? theme.outBubble : theme.secondaryBg,
                      borderRadius: 13,
                      borderBottomLeftRadius: mine ? 13 : 4,
                      borderBottomRightRadius: mine ? 4 : 13,
                      padding: "11px 13px",
                      maxWidth: mine ? 290 : undefined,
                    }}
                  >
                    {renderBlocks(m.blocks, attMap)}
                    {mine && <span style={{ fontSize: 10.5, color: theme.hint, display: "block", textAlign: "right", marginTop: 4 }}>{utc(m.createdAt)}{t.opsLastReadAt && Date.parse(t.opsLastReadAt) >= Date.parse(m.createdAt) ? " · read" : ""}</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Canned chips directly above the input — one tap fills the field. */}
          {inputFocused && savedReplies.length > 0 && (
            <div style={{ flex: "none", display: "flex", gap: 7, overflowX: "auto", padding: "8px 12px", background: theme.bg, borderTop: `1px solid ${theme.border}` }}>
              {savedReplies.map((r) => (
                <button key={r.id} onMouseDown={(e) => { e.preventDefault(); insertCanned(r, false); }} style={{ flex: "none", height: 32, padding: "0 12px", borderRadius: 16, background: theme.secondaryBg, border: `1px solid ${theme.border}`, fontSize: 12.5, color: theme.text, cursor: "pointer", whiteSpace: "nowrap" }}>
                  {r.text.length > 34 ? `${r.text.slice(0, 33)}…` : r.text}
                </button>
              ))}
            </div>
          )}

          <div style={{ flex: "none", borderTop: `1px solid ${theme.border}`, background: theme.secondaryBg, padding: "9px 12px", display: "flex", alignItems: "flex-end", gap: 9 }}>
            <button onClick={() => setCannedSheet(true)} style={{ width: 36, height: 36, borderRadius: 9, background: theme.bg, border: `1px solid ${theme.border}`, fontSize: 15, color: theme.button, flex: "none", cursor: "pointer" }}>⚡</button>
            <textarea
              ref={inputRef}
              rows={1}
              value={reply}
              onChange={(e) => {
                setReply(e.target.value);
                e.currentTarget.style.height = "0px";
                e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 110)}px`;
              }}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="Reply…"
              style={{ flex: 1, minHeight: 36, borderRadius: 18, background: theme.bg, border: `1px solid ${theme.border}`, padding: "8px 13px", fontSize: 13.5, color: theme.text, outline: "none", resize: "none" }}
            />
            <button
              onClick={() => {
                const el = inputRef.current;
                if (!el) return;
                const s = el.selectionStart ?? 0, e2 = el.selectionEnd ?? 0;
                setReply(`${reply.slice(0, s)}\n\`\`\`\n${reply.slice(s, e2)}\n\`\`\`\n${reply.slice(e2)}`);
                el.focus();
              }}
              style={{ width: 36, height: 36, borderRadius: 9, background: theme.bg, border: `1px solid ${theme.border}`, fontFamily: "ui-monospace, monospace", fontSize: 12, fontWeight: 700, color: theme.button, flex: "none", cursor: "pointer" }}
            >
              {"{ }"}
            </button>
          </div>
        </div>

        {statusSheet && (
          <Sheet theme={theme} onClose={() => { setStatusSheet(false); setDraftStatus(null); setReason(""); }} title="Set status">
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {HELP_STATUSES.map((s) => (
                <button key={s} onClick={() => setDraftStatus(s)} style={{ height: 36, padding: "0 13px", borderRadius: 18, background: draftStatus === s ? theme.button : theme.secondaryBg, border: `1px solid ${draftStatus === s ? theme.button : theme.border}`, fontSize: 13, fontWeight: draftStatus === s ? 600 : 500, color: draftStatus === s ? "#fff" : theme.text, cursor: "pointer" }}>
                  {HELP_STATUS_META[s].label}
                </button>
              ))}
            </div>
            {draftStatus === "impossible" && (
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Impossible needs a written reason — ops will see it"
                rows={2}
                style={{ width: "100%", borderRadius: 10, background: theme.secondaryBg, border: `1px solid ${theme.border}`, padding: "9px 11px", fontSize: 13, color: theme.text, outline: "none", resize: "none" }}
              />
            )}
            <span style={{ fontSize: 11.5, color: theme.hint }}>The main button saves — ops see the change as a dated system event.</span>
          </Sheet>
        )}

        {cannedSheet && (
          <Sheet theme={theme} onClose={() => { setCannedSheet(false); setSelectedReply(null); }} title="Canned replies">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {savedReplies.map((r) => (
                <button key={r.id} onClick={() => setSelectedReply(r)} style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "left", borderRadius: 10, background: selectedReply?.id === r.id ? theme.outBubble : theme.secondaryBg, border: `1px solid ${selectedReply?.id === r.id ? theme.button : theme.border}`, padding: "10px 12px", cursor: "pointer" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: theme.text, lineHeight: 1.4 }}>{r.text}</span>
                  <span style={{ fontSize: 11, color: theme.hint }}>
                    {r.setsStatus ? `sets ${HELP_STATUS_META[r.setsStatus].label} · ` : ""}used {r.useCount}×
                  </span>
                </button>
              ))}
            </div>
            {/* The real time-saver: the pairing. */}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                disabled={!selectedReply}
                onClick={() => selectedReply && insertCanned(selectedReply, false)}
                style={{ flex: 1, height: 44, borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.secondaryBg, color: theme.text, fontSize: 14, fontWeight: 600, opacity: selectedReply ? 1 : 0.5, cursor: "pointer" }}
              >
                Insert only
              </button>
              <button
                disabled={!selectedReply?.setsStatus}
                onClick={() => selectedReply && insertCanned(selectedReply, true)}
                style={{ flex: 1, height: 44, borderRadius: 10, border: "none", background: theme.button, color: "#fff", fontSize: 14, fontWeight: 600, opacity: selectedReply?.setsStatus ? 1 : 0.5, cursor: "pointer" }}
              >
                {selectedReply?.setsStatus ? `Insert + ${HELP_STATUS_META[selectedReply.setsStatus].label}` : "Insert + set status"}
              </button>
            </div>
          </Sheet>
        )}
      </Screen>
    );
  }

  // ── Inbox ─────────────────────────────────────────────────────────────────
  const list = (threads || []).filter((t) => {
    if (fltUnread && t.unread === 0) return false;
    if (fltStatus && t.status !== fltStatus) return false;
    if (fltType && t.type !== fltType) return false;
    return true;
  });
  const urgent = list.filter(needsYouNow);
  const waiting = list.filter((t) => !needsYouNow(t));
  const unreadTotal = (threads || []).filter((t) => t.unread > 0).length;

  const rowFor = (r: ThreadRow, hot: boolean) => (
    <button
      key={r.id}
      onClick={() => setView(needsYouNow(r) && r.type === "chat" ? { name: "join", id: r.id } : { name: "thread", id: r.id })}
      style={{ display: "flex", gap: 11, padding: "12px 14px", borderBottom: `1px solid ${theme.dark ? "#232e3c" : "#f1f1f2"}`, background: "transparent", border: "none", borderBottomStyle: "solid", borderBottomWidth: 1, borderBottomColor: theme.dark ? "#232e3c" : "#f1f1f2", textAlign: "left", cursor: "pointer", width: "100%" }}
    >
      <span style={{ width: 38, height: 38, borderRadius: "50%", background: HELP_TYPE_META[r.type].bg, color: HELP_TYPE_META[r.type].color, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "ui-monospace, monospace", fontSize: 12, fontWeight: 700, flex: "none" }}>
        {initialsOf(r.userName || r.userEmail || "??")}
      </span>
      <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 14.5, fontWeight: r.unread ? 700 : 500, color: theme.text }}>{r.userName || r.userEmail || "Ops"}</span>
          {typeChip(r.type)}
          <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: hot ? 700 : 400, color: hot ? "#e5484d" : theme.hint }}>
            {hot ? `waiting ${age(r.presenceAt || r.lastMessageAt)}` : age(r.lastMessageAt)}
          </span>
        </span>
        <span style={{ fontSize: 13.5, lineHeight: 1.4, color: r.unread ? theme.text : theme.hint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.preview}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {statusChip(r.status)}
          <span style={{ fontSize: 12, color: theme.hint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {r.type === "chat" && hot ? "wants to chat now" : String(r.context?.page || HELP_TYPE_META[r.type].label.toLowerCase())}
          </span>
          {r.unread > 0 && <span style={{ marginLeft: "auto", width: 9, height: 9, borderRadius: "50%", background: hot ? "#e5484d" : theme.button, flex: "none" }} />}
        </span>
      </span>
    </button>
  );

  return (
    <Screen theme={theme}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", opacity: lost ? 0.45 : 1 }}>
        <div style={{ flex: "none", padding: "12px 14px 10px", display: "flex", gap: 6 }}>
          <button onClick={() => setFltUnread((v) => !v)} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 16, background: fltUnread ? theme.button : theme.secondaryBg, fontSize: 13, fontWeight: fltUnread ? 600 : 500, color: fltUnread ? "#fff" : theme.text, border: "none", cursor: "pointer" }}>
            Unread{unreadTotal > 0 && <span style={{ fontSize: 11.5, fontWeight: 700, background: fltUnread ? "rgba(255,255,255,.28)" : theme.border, borderRadius: 9, padding: "0 5px" }}>{unreadTotal}</span>}
          </button>
          <button onClick={() => { setFltUnread(false); setFltStatus(null); setFltType(null); }} style={{ height: 32, padding: "0 12px", borderRadius: 16, background: theme.secondaryBg, fontSize: 13, color: theme.text, border: "none", cursor: "pointer" }}>
            All {threads?.length ?? ""}
          </button>
          <button onClick={() => setFilterSheet(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 16, background: fltStatus || fltType ? theme.button : theme.secondaryBg, fontSize: 13, color: fltStatus || fltType ? "#fff" : theme.text, border: "none", cursor: "pointer" }}>
            Filter <span style={{ fontSize: 11 }}>▾</span>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {threads === null &&
            [0, 1, 2].map((i) => (
              <div key={i} style={{ padding: "12px 14px", display: "flex", gap: 11 }}>
                <span style={{ width: 38, height: 38, borderRadius: "50%", background: theme.secondaryBg }} />
                <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ height: 12, width: `${58 - i * 7}%`, borderRadius: 4, background: theme.secondaryBg }} />
                  <span style={{ height: 12, width: `${82 - i * 10}%`, borderRadius: 4, background: theme.secondaryBg }} />
                </span>
              </div>
            ))}
          {threads !== null && list.length === 0 && (
            <div style={{ padding: "56px 28px", textAlign: "center", display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: theme.text }}>Inbox zero</span>
              <span style={{ fontSize: 13, lineHeight: 1.5, color: theme.hint }}>
                You can close this — Telegram already notifies you when something new arrives.
              </span>
            </div>
          )}
          {urgent.length > 0 && (
            <div style={{ padding: "6px 14px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", color: "#e5484d" }}>NEEDS YOU NOW</span>
              <span style={{ height: 1, background: theme.dark ? "#232e3c" : "#f1f1f2", flex: 1 }} />
            </div>
          )}
          {urgent.map((r) => rowFor(r, true))}
          {waiting.length > 0 && (
            <div style={{ padding: "10px 14px 6px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", color: theme.hint }}>WAITING</span>
              <span style={{ height: 1, background: theme.dark ? "#232e3c" : "#f1f1f2", flex: 1 }} />
            </div>
          )}
          {waiting.map((r) => rowFor(r, false))}
        </div>
      </div>

      {lost && (
        <div style={{ position: "absolute", left: 12, right: 12, top: 12, borderRadius: 12, background: theme.secondaryBg, border: `1px solid ${theme.border}`, padding: "11px 13px", display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>Connection lost</span>
          <span style={{ fontSize: 12, color: theme.hint }}>
            Showing the inbox as fetched {fetchedAt ? utc(fetchedAt) : "earlier"} — retrying every 15 seconds.
          </span>
        </div>
      )}

      {filterSheet && (
        <Sheet theme={theme} onClose={() => setFilterSheet(false)} title="Filter">
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", color: theme.hint }}>STATUS</span>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {HELP_STATUSES.map((s) => (
                <button key={s} onClick={() => setFltStatus(fltStatus === s ? null : s)} style={{ height: 36, padding: "0 13px", borderRadius: 18, background: fltStatus === s ? theme.button : theme.secondaryBg, border: `1px solid ${fltStatus === s ? theme.button : theme.border}`, fontSize: 13, fontWeight: fltStatus === s ? 600 : 500, color: fltStatus === s ? "#fff" : theme.text, cursor: "pointer" }}>
                  {HELP_STATUS_META[s].label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", color: theme.hint }}>TYPE</span>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {(Object.keys(HELP_TYPE_META) as HelpThreadType[]).map((ty) => (
                <button key={ty} onClick={() => setFltType(fltType === ty ? null : ty)} style={{ height: 36, padding: "0 13px", borderRadius: 18, background: fltType === ty ? theme.button : theme.secondaryBg, border: `1px solid ${fltType === ty ? theme.button : theme.border}`, fontSize: 13, fontWeight: fltType === ty ? 600 : 500, color: fltType === ty ? "#fff" : theme.text, cursor: "pointer" }}>
                  {HELP_TYPE_META[ty].label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 2 }}>
            <span style={{ fontSize: 14, color: theme.text }}>Unread only</span>
            <button onClick={() => setFltUnread((v) => !v)} style={{ width: 48, height: 28, borderRadius: 15, background: fltUnread ? theme.button : theme.border, position: "relative", border: "none", cursor: "pointer" }}>
              <i style={{ position: "absolute", top: 3, left: fltUnread ? 23 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff", display: "block", transition: "left .15s" }} />
            </button>
          </div>
        </Sheet>
      )}
    </Screen>
  );
}

function Screen({ theme, children }: { theme: { bg: string; text: string }; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: theme.bg, color: theme.text, fontFamily: "-apple-system, 'Public Sans', system-ui, sans-serif", overflow: "hidden" }}>
      {children}
    </div>
  );
}

function Sheet({ theme, onClose, title, children }: { theme: { bg: string; secondaryBg: string; text: string; border: string }; onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.45)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: theme.bg, borderTop: `1px solid ${theme.border}`, borderRadius: "16px 16px 0 0", padding: "12px 16px 20px", display: "flex", flexDirection: "column", gap: 16, maxHeight: "80%", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <span style={{ width: 38, height: 4, borderRadius: 3, background: theme.border }} />
        </div>
        <span style={{ fontSize: 17, fontWeight: 700, color: theme.text }}>{title}</span>
        {children}
      </div>
    </>
  );
}

function ContextPanel({ theme, thread }: { theme: { secondaryBg: string; hint: string; text: string; button: string; border: string }; thread: HelpThread }) {
  const copyAll = () =>
    navigator.clipboard?.writeText(
      HELP_CONTEXT_ORDER.map(({ key, label }) => `${label}: ${thread.context[key] || "—"}`).join("\n"),
    ).catch(() => {});
  return (
    <div style={{ background: theme.secondaryBg, border: `1px solid ${theme.border}`, borderRadius: 11, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 7, flex: "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", color: theme.hint }}>CONTEXT · AUTO-COLLECTED</span>
        <button onClick={copyAll} style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 600, color: theme.button, background: "none", border: "none", cursor: "pointer" }}>Copy all</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: "7px 12px" }}>
        {HELP_CONTEXT_ORDER.map(({ key, label }) => {
          const value = String(thread.context[key] || "—");
          return (
            <div key={key} style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.08em", color: theme.hint }}>{label}</span>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11.5, fontWeight: 600, color: helpContextFieldIsRed(key, value) ? "#e5484d" : theme.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
