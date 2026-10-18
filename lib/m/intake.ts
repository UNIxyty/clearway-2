"use client";

// Flight intake on the phone: the same client as the desktop page (components/agent/intake/api.ts) — the same
// requests, verbs and bodies — arranged around the one question that is blocking a request. Nothing here decides
// anything the desktop does not; what a person may answer from the list is exactly what the desktop's Actions offer.
import { shownText } from "@/lib/error-text";
import { useCallback, useEffect, useRef, useState } from "react";
import { intakeApi, type Field, type Leg, type ListRow, type RequestDetail, ApiError } from "@/components/agent/intake/api";
import { bannerFor } from "@/components/agent/intake/intake-detail";
import { legIssues } from "@/components/agent/intake/intake-review";
import { fieldOf, legRoute } from "@/components/agent/intake/intake-shared";

export type Question = { text: string; why: string | null; answers: Array<{ label: string; value: "yes" | "no" }>; kind: "approval" | "cancellation" } | null;

/** The one question blocking a request, with its two answers, as the desktop's Actions and banner put it. */
export function questionFor(detail: RequestDetail, now = Date.now()): Question {
  const r = detail.request;
  const legs = (detail.review?.legs ?? []).filter((l) => !l.removed);
  const cx = r.type === "scheduled" ? detail.review?.cancellation : null;
  if (cx?.approval && !cx.approval.answer) {
    return { kind: "cancellation", text: "The provider cancelled this flight. Cancel it in Leon?", why: bannerFor(detail, now, false)?.body ?? null, answers: [{ label: "Cancel in Leon", value: "yes" }, { label: "Keep it", value: "no" }] };
  }
  if (r.type === "scheduled" && !legs.length && (r.status === "awaiting_approval" || r.closedReason === "expired")) {
    const expired = r.closedReason === "expired";
    return { kind: "approval", text: expired ? "Nobody answered by the deadline. Process it anyway?" : "Process this scheduled flight?", why: bannerFor(detail, now, false)?.body ?? null, answers: expired ? [{ label: "Process anyway", value: "yes" }] : [{ label: "Process it", value: "yes" }, { label: "Skip it", value: "no" }] };
  }
  return null;
}

export async function answerQuestion(detail: RequestDetail, q: NonNullable<Question>, value: "yes" | "no") {
  const id = detail.request.id;
  if (q.kind === "cancellation") return intakeApi.cancelAnswer(id, value === "yes");
  return value === "yes" ? intakeApi.approve(id) : intakeApi.decline(id);
}

/** Leg fields that need a look, in the order the desktop counts them: to fix, timezone, to check. */
export function flaggedFields(leg: Leg): Array<{ f: Field; tone: "bad" | "warn"; tag: string }> {
  const out: Array<{ f: Field; tone: "bad" | "warn"; tag: string }> = [];
  for (const f of leg.fields) {
    if (f.state === "tz_unknown") out.push({ f, tone: "bad", tag: "TIMEZONE UNKNOWN" });
    else if ((f.state === "not_given" && f.required)) out.push({ f, tone: "bad", tag: "NOT GIVEN" });
    else if (f.state === "invalid") out.push({ f, tone: "bad", tag: "INVALID" });
    else if (f.state === "conflict") out.push({ f, tone: "bad", tag: "CONFLICT" });
    else if (f.state === "leon_refused") out.push({ f, tone: "bad", tag: "LEON REFUSED" });
    else if (f.state === "unknown" && f.required && f.sent) out.push({ f, tone: "bad", tag: "UNKNOWN" });
    else if (f.state === "low_confidence") out.push({ f, tone: "warn", tag: "LOW CONFIDENCE" });
  }
  return out;
}
export const okFields = (leg: Leg) => leg.fields.filter((f) => !flaggedFields(leg).some((x) => x.f.key === f.key) && f.state !== "not_read");
export { legIssues, legRoute, fieldOf };

/** What to show for a failed intake call: the agent's own wording (ApiError, written for a person, as the desktop shows it), the offline sentence, or our fallback. */
export const intakeErrorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : shownText(e, fallback)); // public-error-ok: ApiError is the agent's person-facing text

export function useIntakeList() {
  const [rows, setRows] = useState<ListRow[] | null>(null);
  const [counts, setCounts] = useState<{ needs: number; progress: number; loaded: number; closed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const load = useCallback(async () => {
    try { const r = await intakeApi.list({ tab: "all" }); if (!alive.current) return; setRows(r.rows); setCounts(r.counts); setError(null); }
    catch (e) { if (alive.current) setError(intakeErrorText(e, "The agent did not answer.")); }
  }, []);
  useEffect(() => { alive.current = true; void load(); const t = setInterval(load, 15_000); return () => { alive.current = false; clearInterval(t); }; }, [load]);
  return { rows, counts, error, reload: load };
}

export function useIntakeDetail(id: string) {
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const load = useCallback(async () => {
    try { const d = await intakeApi.detail(id); if (!alive.current) return; setDetail(d); setError(null); }
    catch (e) { if (alive.current) setError(intakeErrorText(e, "The agent did not answer.")); }
  }, [id]);
  useEffect(() => { alive.current = true; void load(); const t = setInterval(load, 10_000); return () => { alive.current = false; clearInterval(t); }; }, [load]);
  return { detail, setDetail, error, reload: load };
}
