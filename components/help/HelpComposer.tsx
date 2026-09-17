"use client";

// The composer — five routes, each setting a different expectation. Bug seeds
// three headings instead of asking three questions in three fields. Urgent is
// the only route that states a response time. Question searches the guide as
// you type and converts the query into a thread with nothing retyped.
// Drafts save on every keystroke; discard clears them.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PortalShell from "@/components/portal/Shell";
import BlockEditor, {
  AttachmentsPanel,
  ShortcutStrip,
  headingLine,
  linesFromBlocks,
  newKey,
  paragraph,
  serializeLines,
  useAttachments,
  type EditorLine,
} from "@/components/help/BlockEditor";
import { TypeChip } from "@/components/help/chips";
import { ContextGrid } from "@/components/help/chips";
import {
  DEVELOPER_NAME,
  OUT_OF_HOURS_PHONE,
  collectClientContext,
  helpApi,
} from "@/components/help/helpApi";
import { HELP_CONTEXT_ORDER, type HelpContext, type HelpThreadType } from "@/lib/help/shared";

const TITLES: Record<HelpThreadType, { header: string; placeholder: string }> = {
  urgent: { header: "Something is blocking ops right now", placeholder: "One line — what is blocked?" },
  bug: { header: "Report a bug", placeholder: "Short summary — AIP PDF will not open for EVRA" },
  request: { header: "I have a suggestion", placeholder: "Short summary — what would you change?" },
  question: { header: "How do I…", placeholder: "Type your question — we search the guide as you type" },
  chat: { header: `Chat with ${DEVELOPER_NAME}`, placeholder: "What do you want to ask him?" },
};

function draftKey(type: string) { return `help-draft:${type}`; }

export default function HelpComposer() {
  const router = useRouter();
  const params = useSearchParams();
  const type = (params.get("type") || "bug") as HelpThreadType;
  const fromPage = params.get("page") || "";
  const linkedFrom = params.get("from") || "";
  const atts = useAttachments();

  const [title, setTitle] = useState("");
  const [lines, setLines] = useState<EditorLine[]>(() =>
    type === "bug" ? [headingLine("What happened"), paragraph(), headingLine("What you expected"), paragraph()] : [paragraph()],
  );
  const [screen, setScreen] = useState(fromPage);
  const [editingScreen, setEditingScreen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [serverCtx, setServerCtx] = useState<{ role?: string; services?: string }>({});
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [guideResults, setGuideResults] = useState<Array<{ title: string; snippet: string; href: string }>>([]);
  const [asking, setAsking] = useState(type !== "question"); // question route: search first, editor after "ask"
  const restored = useRef(false);

  // Draft: restore once, save as you type.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const raw = JSON.parse(localStorage.getItem(draftKey(type)) || "null");
      if (raw?.title || raw?.blocks?.length) {
        setTitle(raw.title || "");
        if (raw.blocks?.length) setLines(linesFromBlocks(raw.blocks));
        if (raw.screen) setScreen(raw.screen);
      }
    } catch { /* no draft */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey(type), JSON.stringify({ title, blocks: serializeLines(lines), screen, ts: Date.now() }));
      } catch { /* full */ }
    }, 300);
    return () => clearTimeout(t);
  }, [title, lines, screen, type]);

  useEffect(() => {
    fetch("/api/help/context", { cache: "no-store" }).then((r) => r.json()).then(setServerCtx).catch(() => {});
  }, []);

  // Question route: search the guide as you type.
  useEffect(() => {
    if (type !== "question" || title.trim().length < 3) { setGuideResults([]); return; }
    const t = setTimeout(() => {
      helpApi.guideSearch(title.trim()).then((d) => setGuideResults(d.results.slice(0, 3))).catch(() => setGuideResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [title, type]);

  const previewContext: HelpContext = useMemo(() => {
    const client = collectClientContext(screen || fromPage || undefined);
    return {
      page: client.page,
      role: serverCtx.role || "…",
      browser: client.browser,
      viewport: client.viewport,
      services: serverCtx.services || "collected on send",
      lastRequest: client.lastRequest,
    };
  }, [screen, fromPage, serverCtx]);

  const canSend = title.trim().length >= 3 && !sending && !atts.uploading;

  async function send() {
    if (!canSend) return;
    setSending(true);
    setSendError(null);
    const blocks = serializeLines(lines);
    if (type === "bug" && screen) {
      blocks.push({ type: "heading", text: "Which screen" }, { type: "paragraph", text: `\`${screen}\`` });
    }
    for (const id of atts.attachedIds) blocks.push({ type: "attachment", id });
    try {
      const { thread } = await helpApi.createThread({
        type,
        title: title.trim(),
        blocks,
        attachmentIds: atts.attachedIds,
        context: collectClientContext(screen || fromPage || undefined),
        linkedFrom: linkedFrom || undefined,
        clientKey: newKey(),
      });
      try { localStorage.removeItem(draftKey(type)); } catch { /* fine */ }
      router.replace(`/help/${thread.reference}`);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Failed to send");
      setSending(false);
    }
  }

  function discard() {
    try { localStorage.removeItem(draftKey(type)); } catch { /* fine */ }
    router.push("/help");
  }

  const urgent = type === "urgent";
  const t = TITLES[type];

  return (
    <PortalShell crumb="Help" title="" wide>
      <div className="mx-auto max-w-[900px] px-[30px] pb-14 pt-2">
        <div
          className="flex items-center gap-3 rounded-t-[16px] border border-cw-border bg-white px-6 py-4"
          style={urgent ? { background: "#fdf2f2", borderColor: "#f0c9ca" } : undefined}
        >
          <button onClick={() => router.push("/help")} className="flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-[9px] border border-cw-border bg-white text-[15px] text-cw-body">←</button>
          <div className="flex flex-1 items-center gap-2.5">
            <span className="text-[17px] font-extrabold tracking-[-0.015em] text-cw-ink">{title.trim() || t.header}</span>
            <TypeChip type={type} />
          </div>
          <button onClick={discard} className="cursor-pointer border-none bg-transparent text-[13.5px] font-semibold text-cw-muted">Discard</button>
          <button
            onClick={send}
            disabled={!canSend}
            className="inline-flex h-[38px] cursor-pointer items-center rounded-[10px] border-none px-4 text-[13.5px] font-bold"
            style={canSend ? { background: urgent ? "#e5484d" : "#2563eb", color: "#fff" } : { background: "#f1f2f4", color: "#9aa0a8", cursor: "default" }}
          >
            {sending ? "Sending…" : urgent ? "Send — it pings now" : type === "chat" ? "Start chat" : "Send report"}
          </button>
        </div>

        <div className="flex flex-col gap-[18px] rounded-b-[16px] border border-t-0 border-cw-border bg-white px-6 pb-5 pt-6">
          {urgent && (
            <div className="flex items-center gap-3 rounded-[11px] border border-[#f0c9ca] bg-[#fdf2f2] px-3.5 py-2.5 text-[12.5px] leading-normal text-[#8b3a3a]">
              <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[7px] bg-white text-[14px] font-extrabold text-cw-red">!</span>
              Pings {DEVELOPER_NAME} in Telegram the moment you send. Under 25 minutes, 06:00–22:00Z. Outside those hours
              call <span className="pl-1 font-mono font-semibold">{OUT_OF_HOURS_PHONE}</span>.
            </div>
          )}
          {type === "request" && (
            <div className="rounded-[11px] border border-cw-border bg-cw-page px-3.5 py-2.5 text-[12.5px] text-cw-muted">
              Honestly: suggestions are read weekly, not daily. No response-time promise.
            </div>
          )}
          {sendError && (
            <div className="rounded-[11px] border border-[#f0c9ca] bg-[#fdf2f2] px-3.5 py-2.5 text-[12.5px] font-semibold text-[#b42318]">{sendError}</div>
          )}

          <textarea
            rows={1}
            value={title}
            autoFocus
            onChange={(e) => {
              setTitle(e.target.value.replace(/\n/g, " "));
              e.currentTarget.style.height = "0px";
              e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
            }}
            placeholder={t.placeholder}
            className="w-full resize-none overflow-hidden border-none bg-transparent p-0 text-[24px] font-extrabold tracking-[-0.02em] text-cw-ink outline-none placeholder:text-[#c3c7ce]"
          />

          {type === "question" && !asking && (
            <div className="flex flex-col gap-2.5">
              {guideResults.map((g, i) => (
                <a key={i} href={g.href} target="_blank" rel="noreferrer" className="flex flex-col gap-1 rounded-[12px] border border-cw-border bg-cw-page px-4 py-3 no-underline hover:bg-cw-sidebar">
                  <span className="text-[13.5px] font-bold text-cw-ink">{g.title}</span>
                  <span className="text-[12.5px] leading-normal text-cw-muted">{g.snippet}</span>
                  <span className="text-[12px] font-semibold text-cw-primary">Open in the guide →</span>
                </a>
              ))}
              {title.trim().length >= 3 && (
                <button
                  onClick={() => setAsking(true)}
                  className="flex cursor-pointer items-center justify-between rounded-[12px] border border-cw-border bg-white px-4 py-3 text-left hover:bg-cw-page"
                >
                  <span className="text-[13.5px] font-semibold text-cw-ink">
                    {guideResults.length ? "None of these help? Ask it as a question" : "Ask it as a question"}
                  </span>
                  <span className="text-[12px] text-cw-faint">nothing is retyped</span>
                </button>
              )}
              {title.trim().length < 3 && (
                <span className="text-[12.5px] text-cw-faint">Type at least three characters — matching guide sections appear here.</span>
              )}
            </div>
          )}

          {(type !== "question" || asking) && (
            <>
              <BlockEditor lines={lines} onChange={setLines} atts={atts} screenUrl={screen || fromPage || "/"} autoFocus={false} />

              {type === "bug" && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[16px] font-bold text-cw-ink">Which screen</span>
                  <div className="inline-flex h-[34px] items-center gap-2 self-start rounded-[9px] border border-cw-border bg-cw-sidebar px-[11px]">
                    {editingScreen ? (
                      <input
                        autoFocus
                        value={screen}
                        onChange={(e) => setScreen(e.target.value)}
                        onBlur={() => setEditingScreen(false)}
                        onKeyDown={(e) => e.key === "Enter" && setEditingScreen(false)}
                        className="w-[220px] border-none bg-transparent font-mono text-[12.5px] font-semibold text-cw-body outline-none"
                      />
                    ) : (
                      <>
                        <span className="font-mono text-[12.5px] font-semibold text-cw-body">{screen || "not set"}</span>
                        <button onClick={() => setEditingScreen(true)} className="cursor-pointer border-none bg-transparent p-0 text-[11.5px] text-cw-faint">
                          {fromPage && screen === fromPage ? "filled in for you · change" : "change"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              <AttachmentsPanel atts={atts} />

              <div className="overflow-hidden rounded-[12px] border border-cw-border bg-cw-page">
                <div className="flex items-center gap-3 px-[15px] py-3" style={reviewOpen ? { borderBottom: "1px solid #e6e7ea" } : undefined}>
                  <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[7px] bg-[#f1f2f4] text-[13px] text-cw-muted">⚙</span>
                  <div className="flex flex-1 flex-col gap-0.5">
                    <span className="text-[13px] font-bold text-cw-ink">Clearway will attach {HELP_CONTEXT_ORDER.length} technical details</span>
                    <span className="text-[12.5px] text-cw-faint">Collected automatically — you did not type these. Nothing from the flight data.</span>
                  </div>
                  <button onClick={() => setReviewOpen((v) => !v)} className="cursor-pointer border-none bg-transparent text-[12.5px] font-bold text-cw-primary">
                    {reviewOpen ? "Hide" : "Review"}
                  </button>
                </div>
                {reviewOpen && (
                  <div className="px-[15px] py-[13px]">
                    <ContextGrid context={previewContext} />
                  </div>
                )}
              </div>

              <ShortcutStrip trailing="Saved as a draft as you type" />
            </>
          )}
        </div>
      </div>
    </PortalShell>
  );
}
