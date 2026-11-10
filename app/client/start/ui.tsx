"use client";

import { useState } from "react";
import MaskIcon from "@/components/portal/Icon";

type Pick = "timeline" | "flights";

/** Small drawn previews of the two pages (the design shows live frames; a drawing is lighter and says the same). */
function Preview({ kind }: { kind: Pick }) {
  return (
    <div className="cls-pv" aria-hidden>
      <span className="cls-pv-side"><i /><i /><i /></span>
      <span className="cls-pv-main">
        <i className="cls-pv-title" />
        {kind === "timeline" ? (
          <span className="cls-pv-tl">{[0, 1, 2].map((r) => <span key={r} className="cls-pv-lane"><i className="cls-pv-reg" /><i className="cls-pv-pill" style={{ left: `${18 + r * 22}%`, width: `${26 + r * 6}%`, background: ["var(--tl-scheduled)", "var(--tl-flying)", "var(--tl-delayed)"][r] }} /></span>)}<i className="cls-pv-now" /></span>
        ) : (
          <span className="cls-pv-list">{[0, 1, 2, 3].map((r) => <span key={r} className="cls-pv-row"><i /><i className="is-w" /><i /><b style={{ background: ["var(--tl-scheduled)", "var(--tl-flying)", "var(--tl-delayed)", "var(--tl-arrived)"][r] }} /></span>)}</span>
        )}
      </span>
    </div>
  );
}

export default function StartChoice({ person, company }: { person: string; company: string }) {
  const [picked, setPicked] = useState<Pick | null>(null);
  const [error, setError] = useState("");
  async function choose(k: Pick | null) {
    if (picked) return;
    setError("");
    setPicked(k ?? "timeline");
    try {
      if (k) {
        const r = await fetch("/api/client/prefs", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ start: k }) });
        if (!r.ok) throw new Error();
      }
      window.location.href = k === "flights" ? "/client/flights" : "/client";
    } catch { setPicked(null); setError("The choice could not be saved. Try again, or decide later."); }
  }
  const choices: { k: Pick; t: string; icon: string; d: string }[] = [
    { k: "timeline", t: "Timeline", icon: "chart-gantt", d: "One lane per aircraft, flights placed by time with a now-line. The same view Clearway ops have on the wall." },
    { k: "flights", t: "Flights list", icon: "list", d: "One row per flight, grouped by day, with search. The flight in the air now is highlighted." },
  ];
  return (
    <main className="cls" data-client-start="">
      <header className="cls-head"><span className="clw-brand">Clearway</span><span className="clw-grow" /><span className="clw-muted">{[person, company].filter(Boolean).join(" · ")}</span></header>
      <div className="cls-body">
        <ol className="cls-steps"><li className="done"><i><MaskIcon name="check" size={12} /></i>Your details</li><li className="done"><i><MaskIcon name="check" size={12} /></i>Password</li><li className="now"><i>3</i>Layout</li></ol>
        <h1>How do you want to watch your flights?</h1>
        <p className="cls-lead">This sets the page you see after signing in. Both stay in the sidebar, and you can change it any time in Account.</p>
        <div className="cls-choices">
          {choices.map((c) => (
            <button type="button" key={c.k} className={`cls-choice${picked === c.k ? " is-picked" : ""}`} onClick={() => choose(c.k)} disabled={Boolean(picked)} data-start-choice={c.k}>
              <Preview kind={c.k} />
              <span className="cls-choice-text"><span className="cls-icon"><MaskIcon name={c.icon} size={20} /></span><span><b>{c.t}</b><small>{c.d}</small></span><span className={`cl-btn${picked === c.k ? " primary" : ""}`}>{picked === c.k ? "Opening…" : "Choose"}</span></span>
            </button>
          ))}
        </div>
        <div className="cls-later"><button type="button" className="clw-link" onClick={() => choose(null)} disabled={Boolean(picked)} data-decide-later="">Decide later</button><span className="clw-muted">Opens Timeline.</span></div>
        {error && <p className="clw-form-error" role="alert">{error}</p>}
      </div>
    </main>
  );
}
