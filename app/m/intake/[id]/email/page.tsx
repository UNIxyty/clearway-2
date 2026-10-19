"use client";

// The original email behind an intake request, on a phone: as received, never edited by the agent. The headers and
// the attachments come with the request; the body is the same call the desk's drawer makes
// (mailboxApi.body, text mode, personal values masked, logged as a read). Where this account may not read bodies
// (the mailbox's readers only — the same gate as on a desk) the page says so, and the confirm step on the phone then
// refuses rather than confirming blind. Reading it here is remembered for this session (sessionStorage) so the
// confirm step knows.
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { usePhonePage } from "@/components/m/chrome";
import { MCard, MError, MSkeleton } from "@/components/m/ui";
import { intakeApi, ApiError, type MailBody } from "@/components/agent/intake/api";
import { useIntakeDetail } from "@/lib/m/intake";
import { markEmailRead } from "@/lib/intake-email-read";
import { shownText } from "@/lib/error-text";
import { dayTime } from "@/lib/m/t2";

const kb = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default function IntakeEmailPage() {
  const { id } = useParams<{ id: string }>();
  const { detail, error, reload } = useIntakeDetail(id);
  const r = detail?.request;
  const [body, setBody] = useState<MailBody | null>(null);
  const [denied, setDenied] = useState(false);
  const [bodyErr, setBodyErr] = useState<string | null>(null);
  usePhonePage({ title: "Original email", subtitle: r?.reference ?? null, monoSubtitle: true, back: `/m/intake/${id}`, tab: "intake", tabs: false });
  useEffect(() => {
    if (!r?.messageId || r.purged) return;
    let live = true;
    intakeApi.email(id).then((x) => { if (!live) return; setBody(x.body); markEmailRead(id); }) // read = saw what there is, including "purged" or "entered by hand"
      .catch((e) => { if (!live) return; if (e instanceof ApiError && (e.status === 403 || e.status === 401)) setDenied(true); else setBodyErr(shownText(e, "The body could not be loaded. Try again.")); });
    return () => { live = false; };
  }, [r?.messageId, r?.purged, id]);
  if (!detail && !error) return <MSkeleton kind="rows" count={5} label="Loading the email" />;
  if (!detail || !r) return <MError title="Couldn’t load the request" onRetry={reload}>{error}</MError>;
  const atts = detail.attachments.filter((a) => !a.inline);
  const from = r.sender && r.fromAddr && r.sender !== r.fromAddr.replace(/"/g, "") ? `${r.sender} · ${r.fromAddr}` : r.fromAddr ?? r.sender ?? "—";
  return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-3">
      <span className="text-[12.5px] text-cw-text-muted">As received. The agent never edits it.</span>
      <MCard>
        {[["From", from], ["To", (r.toAddrs ?? []).join(", ") || "—"], ["Received", dayTime(r.receivedAt)], ["Subject", r.subject ?? "(no subject)"]].map(([k, v], i) => <div key={k} className={`grid min-h-11 grid-cols-[80px_minmax(0,1fr)] items-center gap-2.5 px-3.5 py-1.5 ${i ? "border-t border-cw-divider" : ""}`}><span className="text-[12.5px] text-cw-text-muted">{k}</span><span className={`text-[14px] [overflow-wrap:anywhere] ${k === "Subject" ? "font-bold" : ""} ${k === "Received" ? "font-mono" : ""}`}>{v}</span></div>)}
      </MCard>
      {r.purged ? <span className="text-[13.5px] text-cw-text-muted">The email body and attachments were removed by retention ({detail.retention.days} days).</span>
        : denied ? <MError title="Your account may not read request emails" icon="mail">Reading the original email needs the “Read the original email of a request” permission, which an admin has taken from your role. Without it this request cannot be confirmed from here.</MError>
        : bodyErr ? <MError title="The body could not be loaded" icon="mail" onRetry={() => { setBodyErr(null); setBody(null); }}>{bodyErr}</MError>
        : body ? (
          <>
            {body.purged ? <span className="text-[13.5px] text-cw-text-muted">The body was removed by retention.</span> : body.unavailable ? <span className="text-[13.5px] text-cw-text-muted">{body.unavailable}</span> : (
              <>
                {body.masks > 0 && <span className="text-[12.5px] text-cw-text-muted">{body.masks} personal value{body.masks === 1 ? "" : "s"} masked here. The agent mailbox on a desk can show them, logged.</span>}
                <pre className="m-0 whitespace-pre-wrap break-words rounded-[12px] border border-cw-border bg-cw-bg-sunken px-3.5 py-3 font-mono text-[13px] leading-relaxed text-cw-text">{body.text || "(empty body)"}</pre>
              </>
            )}
          </>
        ) : <MSkeleton kind="rows" count={3} label="Loading the body" />}
      {atts.length > 0 && (
        <div className="flex flex-col gap-1.5"><span className="px-0.5 text-[12px] font-bold tracking-[.06em] text-cw-text-muted">ATTACHMENTS · {atts.length}</span>
          <MCard>{atts.map((a, i) => <div key={a.id} className={`flex min-h-12 items-center gap-3 px-3.5 py-2 ${i ? "border-t border-cw-divider" : ""}`}><span className="flex min-w-0 flex-1 flex-col"><span className="truncate text-[14px] font-semibold">{a.name}</span><span className="text-[12.5px] text-cw-text-muted">{kb(a.bytes)}{a.role ? ` · ${a.role}` : ""}{a.personal ? " · personal data" : ""}</span></span><span className="text-[12px] text-cw-text-muted">Open on a desk</span></div>)}</MCard>
        </div>
      )}
    </div>
  );
}
