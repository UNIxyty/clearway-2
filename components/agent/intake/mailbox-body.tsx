"use client";

// Agent mailbox §M8 + §M14.2: the message body. HTML renders in an iframe with an EMPTY sandbox (no scripts, no
// same-origin, no forms, no popups) and its own CSP; links are inert spans; remote images are blocked unless
// asked for, and even then they come through the agent's proxy. Masked personal values arrive as \0M{n}\0
// markers and are only ever filled from the reveal call, for 60 s, for this one message.

import { useCallback, useEffect, useMemo, useState } from "react";
import { C, FONT, INTAKE, TONE, mono } from "../ui/tokens";
import { Button, Icon, dateLong } from "../ui/primitives";
import { Segmented, useHotkeys } from "./controls";
import { ApiError, mailboxApi, type MailBody } from "./api";
import { MARKER, MASK, MaskChip, RevealedValue, SmallEyebrow, esc } from "./mailbox-shared";

// ── The iframe document ──────────────────────────────────────────────────────────────────────────────────
const FRAME_CSS = `
  html, body { margin: 0; padding: 0; background: ${C.surface}; color: ${C.ink}; }
  body { padding: 16px 18px; font-family: ${FONT.sans}; font-size: 13.5px; line-height: 1.5; overflow-wrap: anywhere; }
  img { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  pre { white-space: pre-wrap; font-family: ${FONT.mono}; font-size: 12.5px; }
  blockquote { margin: 8px 0; padding-left: 10px; border-left: 3px solid ${C.border}; color: ${C.muted}; font-family: ${FONT.mono}; font-size: 12.5px; }
  .cw-mask { font-family: ${FONT.mono}; font-size: 12.5px; background: ${C.neutralTint}; color: ${C.muted}; padding: 0 5px; border-radius: 4px; }
  .cw-rev { font-family: ${FONT.mono}; font-size: 12.5px; background: ${C.warnTint}; color: ${C.ink}; padding: 0 5px; border-radius: 4px; }
  .cw-rev-print { display: none; }
  .cw-link { text-decoration: underline dotted; text-underline-offset: 2px; color: ${C.primary}; cursor: default; }
  .cw-link-url { font-family: ${FONT.mono}; font-size: 11.5px; background: ${C.dividerRow}; color: ${C.body}; border-radius: 4px; padding: 1px 5px; margin-left: 4px; }
  .cw-img-blocked { display: inline-block; border: 1.5px dashed ${C.disabledFill}; border-radius: 6px; padding: 6px 9px; color: ${C.muted}; font-size: 12px; font-family: ${FONT.sans}; }
  @media print { .cw-rev { display: none !important; } .cw-rev-print { display: inline !important; font-family: ${FONT.mono}; } }
`;
const CSP = "default-src 'none'; img-src data: 'self'; style-src 'unsafe-inline'";
const LOCAL_IMG = /src="(\/agent\/api\/mailbox\/messages\/[^"]+)"/g;

export function buildFrameDoc(html: string, values: string[] | null, inlined: Record<string, string>) {
  const body = html
    .replace(MARKER, (_, n: string) => { const v = values?.[Number(n)]; return v != null ? `<span class="cw-rev">${esc(v)}</span><span class="cw-rev-print">${MASK}</span>` : `<span class="cw-mask">${MASK}</span>`; })
    .replace(/\u0000/g, "")
    .replace(LOCAL_IMG, (all, u: string) => (inlined[u] ? `src="${inlined[u]}"` : all));
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="referrer" content="no-referrer"><style>${FRAME_CSS}</style></head><body>${body}</body></html>`;
}

/** The opaque-origin iframe cannot send the console's cookies, so cid: and proxied images are fetched here
 *  (same origin, as the signed-in user) and inlined as data: URIs, which the frame's CSP allows. */
function useInlinedImages(html: string | undefined) {
  const [map, setMap] = useState<Record<string, string>>({});
  useEffect(() => {
    setMap({});
    if (!html) return;
    const urls = [...new Set([...html.matchAll(LOCAL_IMG)].map((m) => m[1]))].slice(0, 40);
    if (!urls.length) return;
    let dead = false;
    void Promise.all(urls.map(async (u) => {
      try {
        const r = await fetch(u.replace(/&amp;/g, "&"), { credentials: "same-origin", cache: "no-store" });
        if (!r.ok) return null; const b = await r.blob();
        if (b.size > 5_000_000 || !/^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(b.type)) return null;
        const d = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(fr.error); fr.readAsDataURL(b); });
        return [u, d] as const;
      } catch { return null; }
    })).then((pairs) => { if (!dead) setMap(Object.fromEntries(pairs.filter((p): p is readonly [string, string] => !!p))); });
    return () => { dead = true; };
  }, [html]);
  return map;
}

/** Fixed-height sandboxed frame with its own scroll; the person can drag it taller (resize: vertical).
 *  Measuring the content is impossible: the frame's origin is opaque and it runs no script. */
export function SandboxFrame({ html, values, label, height = 480 }: { html: string; values: string[] | null; label: string; height?: number }) {
  const inlined = useInlinedImages(html);
  const doc = useMemo(() => buildFrameDoc(html, values, inlined), [html, values, inlined]);
  return (
    <div style={{ height, minHeight: 360, resize: "vertical", overflow: "hidden", borderTop: `1px solid ${C.divider}` }}>
      <iframe sandbox="" srcDoc={doc} aria-label={label} referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", border: 0, display: "block", background: C.surface }} />
    </div>
  );
}

// ── Plain text with mask chips ───────────────────────────────────────────────────────────────────────────
function Segments({ line, values }: { line: string; values: string[] | null }) {
  const parts = line.split(/(\u0000M\d+\u0000)/);
  return <>{parts.map((p, i) => { const m = /^\u0000M(\d+)\u0000$/.exec(p); if (!m) return <span key={i}>{p.replace(/\u0000/g, "")}</span>; const v = values?.[Number(m[1])]; return v != null ? <RevealedValue key={i} value={v} /> : <MaskChip key={i} />; })}</>;
}
export function PlainText({ text, values }: { text: string; values: string[] | null }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  return (
    <div style={{ ...mono({ fontSize: 12.5 }), lineHeight: 1.6, color: C.ink, whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: "14px 18px", borderTop: `1px solid ${C.divider}` }}>
      {lines.map((l, i) => /^\s*>/.test(l)
        ? <div key={i} style={{ color: C.muted, borderLeft: `3px solid ${C.border}`, paddingLeft: 10 }}><Segments line={l} values={values} /></div>
        : <div key={i}>{l ? <Segments line={l} values={values} /> : " "}</div>)}
    </div>
  );
}

// ── Links in this message (not live; open only after an inline confirm) ──────────────────────────────────
const OPENABLE = /^(https?:|mailto:|tel:)/i;
function LinksList({ links }: { links: NonNullable<MailBody["links"]> }) {
  const [asking, setAsking] = useState<number | null>(null);
  useHotkeys({ Escape: () => setAsking(null) }, asking !== null);
  if (!links.length) return null;
  return (
    <div style={{ borderTop: `1px solid ${C.divider}`, padding: "10px 18px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
      <SmallEyebrow>Links in this message · not live</SmallEyebrow>
      {links.map((l, i) => {
        const ok = OPENABLE.test(l.url);
        const scheme = /^mailto:/i.test(l.url) ? "your mail app" : /^tel:/i.test(l.url) ? "your phone app" : l.host;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12.5 }}>
            <span style={{ textDecoration: "underline dotted", textUnderlineOffset: 2, color: C.ink, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.text || "(no text)"}</span>
            <span style={{ ...mono({ fontSize: 11.5 }), color: C.body, background: C.dividerRow, borderRadius: 5, padding: "2px 6px", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.url}</span>
            {ok ? (
              asking === i ? (
                <span role="group" aria-label="Open this link?" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.body, background: C.warnStrongTint, border: `1px solid ${C.warnBorder}`, borderRadius: 7, padding: "4px 8px" }}>
                  {scheme === l.host ? `Opens ${l.host} in a new tab. Only open links you trust.` : `Opens ${scheme}. Only open links you trust.`}
                  <button type="button" className="ag-focus" autoFocus onClick={() => { window.open(l.url, "_blank", "noopener,noreferrer"); setAsking(null); }} style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: C.surface, background: C.ink, border: "none", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>Open</button>
                  <button type="button" className="ag-focus" onClick={() => setAsking(null)} style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: C.body, background: "transparent", border: "none", cursor: "pointer" }}>Cancel</button>
                </span>
              ) : (
                <button type="button" className="ag-focus" onClick={() => setAsking(i)} style={{ fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, color: C.primary, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>Open link…</button>
              )
            ) : <span style={{ fontSize: 11.5, color: C.faint }}>Not a web link · can&apos;t be opened</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── The Message card ─────────────────────────────────────────────────────────────────────────────────────
type Reveal = { phase: "off" } | { phase: "ask" } | { phase: "loading" } | { phase: "on"; values: string[] } | { phase: "error"; message: string };

export function MessageCard({ id, plain, setPlain, onOpenRaw }: { id: string; plain: boolean; setPlain: (v: boolean) => void; onOpenRaw: () => void }) {
  const mode = plain ? "text" : "html";
  const [images, setImages] = useState(false);
  const [body, setBody] = useState<MailBody | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remote, setRemote] = useState<NonNullable<MailBody["remoteImages"]>>([]);
  const [bestEffort, setBestEffort] = useState(false);
  const [reveal, setReveal] = useState<Reveal>({ phase: "off" });
  const hide = useCallback(() => setReveal((r) => (r.phase === "off" ? r : { phase: "off" })), []);

  useEffect(() => {
    let dead = false; setBody(null); setError(null); hide();
    mailboxApi.body(id, mode, images).then(({ body: b }) => { if (dead) return; setBody(b); if (b.mode === "html" && !images) setRemote(b.remoteImages ?? []); })
      .catch((e) => { if (!dead) setError(e instanceof ApiError ? e.message : "The server did not answer."); });
    return () => { dead = true; };
  }, [id, mode, images, hide]);

  // Re-mask: after 60 s, on tab blur / hide, and before printing. (Focus moving into the frame is not a blur.)
  useEffect(() => {
    if (reveal.phase !== "on") return;
    const t = setTimeout(hide, 60_000);
    const onBlur = () => setTimeout(() => { if (!document.hasFocus()) hide(); }, 0);
    const onVis = () => { if (document.visibilityState === "hidden") hide(); };
    window.addEventListener("blur", onBlur); document.addEventListener("visibilitychange", onVis); window.addEventListener("beforeprint", hide);
    return () => { clearTimeout(t); window.removeEventListener("blur", onBlur); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("beforeprint", hide); };
  }, [reveal.phase, hide]);

  const show = async () => {
    setReveal({ phase: "loading" });
    try { const r = await mailboxApi.reveal(id, mode, images); setReveal({ phase: "on", values: r.values }); }
    catch (e) { setReveal({ phase: "error", message: e instanceof ApiError ? e.message : "The server did not answer." }); }
  };
  const values = reveal.phase === "on" ? reveal.values : null;
  const masks = body?.masks ?? 0;
  const hosts = [...new Set(remote.map((r) => r.host))];

  return (
    <section aria-label="Message" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "8px 14px", background: C.page }}>
        <Segmented size="sm" label="Show the message as" value={mode} onChange={(v) => setPlain(v === "text")} options={[{ value: "html", label: "Rendered" }, { value: "text", label: <>Plain text</> }]} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.muted }}><Icon name="shield" size={13} color={C.muted} />Sandboxed · scripts off · links not live</span>
        <span style={{ flex: 1 }} />
        {masks > 0 && (
          reveal.phase === "off" ? (
            <button type="button" className="ag-focus" onClick={() => setReveal({ phase: "ask" })} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: C.ink, background: C.surface, border: `1px solid ${C.borderControl}`, borderRadius: 8, padding: "4px 9px", cursor: "pointer" }}>
              <Icon name="eye" size={13} color={C.body} />Show personal data in this message
            </button>
          ) : reveal.phase === "ask" || reveal.phase === "loading" || reveal.phase === "error" ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span role={reveal.phase === "error" ? "alert" : undefined} style={{ fontSize: 11.5, color: reveal.phase === "error" ? C.danger : C.body }}>{reveal.phase === "error" ? reveal.message : "Logged under your name."}</span>
              <button type="button" className="ag-focus" autoFocus disabled={reveal.phase === "loading"} onClick={() => void show()} style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: C.surface, background: C.ink, border: "none", borderRadius: 8, padding: "5px 9px", cursor: reveal.phase === "loading" ? "wait" : "pointer" }}>Show for 60 s</button>
              <button type="button" className="ag-focus" onClick={hide} style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: C.body, background: "transparent", border: "none", cursor: "pointer" }}>Cancel</button>
            </span>
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: TONE.amber.fg, background: C.warnTint, border: `1px solid ${C.warnBorder}`, borderRadius: 999, padding: "3px 8px" }}>Visible · hides after 60 s · logged</span>
              <button type="button" className="ag-focus" onClick={hide} style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: C.ink, background: C.surface, border: `1px solid ${C.borderControl}`, borderRadius: 8, padding: "4px 9px", cursor: "pointer" }}>Hide now</button>
            </span>
          )
        )}
      </div>

      {!plain && remote.length > 0 && (images ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: C.page, borderTop: `1px solid ${C.divider}`, fontSize: 12, color: C.muted }}>
          <span style={{ flex: 1 }}>Remote images shown for this message. The sender can now see it was opened.</span>
          <button type="button" className="ag-focus" onClick={() => setImages(false)} style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: C.primary, background: "transparent", border: "none", cursor: "pointer" }}>Block again</button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: C.sidebar, borderTop: `1px solid ${C.divider}`, fontSize: 12.5, color: C.body }}>
          <Icon name="image-off" size={14} color={C.muted} />
          <span style={{ flex: 1, lineHeight: 1.45 }}>Remote images are blocked. This message has {remote.length} image{remote.length === 1 ? "" : "s"} from {hosts.join(", ")}. Showing them tells the sender it was opened.</span>
          <Button size="xs" variant="secondary" onClick={() => setImages(true)}>Show images</Button>
        </div>
      ))}

      {bestEffort && plain && <div style={{ padding: "8px 14px", background: C.warnTint, borderTop: `1px solid ${C.warnBorder}`, fontSize: 12.5, color: TONE.amber.fg }}>Best-effort decode. Characters may be wrong. Check against the attachment.</div>}

      {error ? (
        <div style={{ margin: 14, border: `1.5px dashed ${C.dangerBadge}`, background: C.dangerWashSoft, borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.danger }}>This message can&apos;t be displayed</div>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: C.body }}>{error} Nothing has been guessed. The attachments and the raw source are still available below.</div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            {!plain && <Button size="xs" variant="secondary" onClick={() => { setBestEffort(true); setPlain(true); }}>Try as plain text (best effort)</Button>}
            <Button size="xs" variant="secondary" onClick={onOpenRaw}>Open raw source</Button>
          </div>
        </div>
      ) : !body ? (
        <div aria-busy="true" style={{ padding: "18px", borderTop: `1px solid ${C.divider}`, display: "flex", flexDirection: "column", gap: 8 }}>
          {[92, 78, 85, 60].map((w, i) => <span key={i} style={{ height: 10, width: `${w}%`, borderRadius: 5, background: C.hover }} />)}
        </div>
      ) : body.unavailable ? (
        <div role="alert" style={{ margin: "14px 18px", padding: "14px 16px", border: `1.5px dashed ${C.dangerBadge}`, borderRadius: 10, background: INTAKE.fieldRed }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.danger }}>This message can&apos;t be displayed</div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: C.body, marginTop: 4 }}>{body.unavailable} Nothing has been guessed.</div>
        </div>
      ) : body.purged ? (
        <div style={{ padding: "16px 18px", borderTop: `1px solid ${C.divider}`, ...mono({ fontSize: 12.5 }), color: C.muted }}>[removed on {dateLong(body.purgedAt)}] · The body was removed by retention. The headers above are what is left.</div>
      ) : body.mode === "html" && body.html != null ? (
        <>
          <SandboxFrame html={body.html} values={values} label="Message body, sandboxed" />
          <LinksList links={body.links ?? []} />
        </>
      ) : (
        <>
          {!plain && body.mode === "text" && <div style={{ padding: "6px 18px", fontSize: 12, color: C.muted, borderTop: `1px solid ${C.divider}` }}>This email has no HTML part; showing its text.</div>}
          <PlainText text={body.text ?? ""} values={values} />
        </>
      )}
    </section>
  );
}

/** §M13 AS SENT: the sent HTML, in the same sandbox. */
export function AsSentFrame({ id }: { id: string }) {
  const [html, setHtml] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { let dead = false; setHtml(null); setError(null); mailboxApi.body(id, "html", false).then(({ body }) => { if (!dead) setHtml(body.html ?? ""); }).catch((e) => { if (!dead) setError(e instanceof ApiError ? e.message : "The server did not answer."); }); return () => { dead = true; }; }, [id]);
  if (error) return <div role="alert" style={{ padding: "12px 18px", fontSize: 13, color: C.danger, borderTop: `1px solid ${C.divider}` }}>{error}</div>;
  if (html === null) return <div aria-busy="true" style={{ padding: 18, borderTop: `1px solid ${C.divider}` }}><span style={{ display: "block", height: 10, width: "70%", borderRadius: 5, background: C.hover }} /></div>;
  if (!html.trim()) return <div style={{ padding: "12px 18px", fontSize: 13, color: C.muted, borderTop: `1px solid ${C.divider}` }}>No HTML was stored for this email.</div>;
  return <SandboxFrame html={html} values={null} label="The email as sent, sandboxed" height={420} />;
}
