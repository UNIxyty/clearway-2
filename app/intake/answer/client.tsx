"use client";

// The one-tap answer page for the E1 "Process?" email (§I13, L1–L4). No sign-in: the link's token is the
// authentication. L1 shows the question and one button for the answer the link carries; L2 confirms it was
// recorded; L3 says it was already answered; L4 says the question expired. Never any personal data.
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Peek = {
  state: "open" | "recorded" | "already" | "expired" | "invalid";
  answer?: "yes" | "no";
  answered?: { value: string; by: string; at: string } | null;
  reference?: string; route?: string | null; date?: string | null; legs?: number | null; provider?: string; deadlineAt?: string | null; requestId?: string;
  // The same page answers the second question type 1 asks: the provider cancelled a flight we loaded — cancel it in Leon?
  question?: "process" | "cancel";
  cancelLegs?: { leg: number; flightNid: string; departed: boolean; alreadyCancelled: boolean }[];
};
const hm = (iso?: string | null) => (iso ? `${new Date(iso).toISOString().slice(11, 16)}Z` : "");

export default function AnswerClient() {
  const [token, setToken] = useState<string | null>(null);
  const [peek, setPeek] = useState<Peek | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t");
    setToken(t);
    if (!t) { setPeek({ state: "invalid" }); return; }
    fetch(`/agent/api/intake/answer?t=${encodeURIComponent(t)}`, { cache: "no-store" })
      .then((r) => r.json()).then((p) => setPeek(p)).catch(() => setError("The agent could not be reached. Try again in a minute."));
  }, []);

  const answer = async () => {
    if (!token) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/agent/api/intake/answer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token }) });
      setPeek(await r.json());
    } catch { setError("The agent could not be reached. Your answer was not recorded; try again, or reply to the email."); }
    finally { setBusy(false); }
  };

  const yes = peek?.answer === "yes";
  const cancelQ = peek?.question === "cancel";
  const cancelLegs = cancelQ && peek?.cancelLegs?.length ? (
    <ul className="text-sm space-y-1">{peek.cancelLegs.map((l) => <li key={l.leg} className="font-mono">Leg {l.leg} · Leon {l.flightNid}{l.alreadyCancelled ? " · already cancelled" : l.departed ? " · already departed — not cancelled by the agent" : ""}</li>)}</ul>
  ) : null;
  const summary = peek?.reference ? (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-muted-foreground">Reference</dt><dd className="font-mono">{peek.reference}</dd>
      {peek.route ? <><dt className="text-muted-foreground">Route</dt><dd className="font-mono">{peek.route}</dd></> : null}
      {peek.date ? <><dt className="text-muted-foreground">Date</dt><dd>{peek.date}</dd></> : null}
      {peek.legs ? <><dt className="text-muted-foreground">Legs</dt><dd>{peek.legs}</dd></> : null}
    </dl>
  ) : null;

  let title = "", body: React.ReactNode = null;
  if (!peek && !error) { title = "One moment"; body = <p className="text-sm text-muted-foreground">Checking the link…</p>; }
  else if (error) { title = "Not recorded"; body = <p className="text-sm text-destructive">{error}</p>; }
  else if (peek!.state === "invalid") { title = "This link does not work"; body = <p className="text-sm text-muted-foreground">It may have been cut short by the mail client. Open the email again and use the button, or reply yes or no to it.</p>; }
  else if (peek!.state === "open" && cancelQ) {
    title = yes ? "Cancel this flight in Leon?" : "Keep this flight in Leon?";
    body = (
      <div className="space-y-5">
        {summary}{cancelLegs}
        <p className="text-sm text-muted-foreground">{yes ? "The provider cancelled this flight. The agent cancels each leg listed in Leon. Leon keeps the flights as cancelled; they are not removed, and this cannot be undone from here." : "Nothing is touched in Leon. The request records that the provider's cancellation was declined, with your name."}</p>
        {peek!.deadlineAt ? <p className="text-xs text-muted-foreground">No answer by {hm(peek!.deadlineAt)}: nothing is cancelled; the request waits on the intake page.</p> : null}
        <Button onClick={answer} disabled={busy} variant={yes ? "destructive" : "outline"} className="w-full" data-testid="answer-button">{busy ? "Recording…" : yes ? "Yes, cancel in Leon" : "No, keep the flights"}</Button>
      </div>
    );
  }
  else if (peek!.state === "recorded" && cancelQ) {
    title = yes ? "Recorded: cancel in Leon" : "Recorded: keep the flights";
    body = <div className="space-y-4">{summary}<p className="text-sm text-muted-foreground">{yes ? "The agent is cancelling the flights in Leon. You will get an email saying which legs were cancelled and which were not." : "Nothing was touched in Leon."}</p><p className="text-xs text-muted-foreground">You can close this page.</p></div>;
  }
  else if (peek!.state === "expired" && cancelQ) {
    title = "This question has expired";
    body = <div className="space-y-4">{summary}<p className="text-sm text-muted-foreground">No answer arrived by {hm(peek!.deadlineAt)}. Nothing was cancelled. Anyone signed in can still decide on the intake page.</p></div>;
  }
  else if (peek!.state === "open") {
    title = yes ? "Process this scheduled flight?" : "Skip this scheduled flight?";
    body = (
      <div className="space-y-5">
        {summary}
        <p className="text-sm text-muted-foreground">{yes ? "The agent will read the flight's record from the provider's portal and show it on Flight intake for you to confirm. Nothing goes to Leon without that confirmation." : "The request will be closed on Flight intake. Nothing is read from the provider, nothing is created."}</p>
        {peek!.deadlineAt ? <p className="text-xs text-muted-foreground">No answer by {hm(peek!.deadlineAt)}: the request closes and can still be processed from the intake page.</p> : null}
        <Button onClick={answer} disabled={busy} variant={yes ? "default" : "outline"} className="w-full" data-testid="answer-button">{busy ? "Recording…" : yes ? "Yes, process it" : "No, skip it"}</Button>
      </div>
    );
  }
  else if (peek!.state === "recorded") {
    title = yes ? "Recorded: process it" : "Recorded: skip it";
    body = <div className="space-y-4">{summary}<p className="text-sm text-muted-foreground">{yes ? "The agent is reading the record from the provider's portal. You will get an email when it is on Flight intake, ready to confirm." : "The request is closed. Nothing was created."}</p><p className="text-xs text-muted-foreground">You can close this page.</p></div>;
  }
  else if (peek!.state === "already") {
    title = "Already answered";
    body = <div className="space-y-4">{summary}<p className="text-sm text-muted-foreground">{peek!.answered ? `${peek!.answered.by} answered ${peek!.answered.value} at ${hm(peek!.answered.at)}.` : "Someone already answered this question."} The first answer stands; this tap changed nothing.</p></div>;
  }
  else if (peek!.state === "expired") {
    title = "This request has expired";
    body = <div className="space-y-4">{summary}<p className="text-sm text-muted-foreground">No answer arrived by {hm(peek!.deadlineAt)}, so the request was closed and nothing was created. It is still on the intake page, where anyone signed in can process it.</p></div>;
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardDescription>Clearway Ops Agent · Flight intake</CardDescription>
          <CardTitle className="text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
    </div>
  );
}
