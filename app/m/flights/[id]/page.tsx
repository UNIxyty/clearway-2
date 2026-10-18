"use client";

// One flight's record on a phone: status, then Details (the Times · UTC card and the record rows) and, from
// Stage 4, Passengers. The times are the wall's facts (shared/wall-facts.mjs). There is no Edit here: the wall holds
// no time overrides of its own today (Leon is the source of every time), so a control that promised one would lie.
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { usePhonePage } from "@/components/m/chrome";
import { MCard, MError, MSkeleton, StatusPill } from "@/components/m/ui";
import { useAllFlights } from "@/lib/m/flights";

export default function FlightRecordPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const { flights, error, loading, reload } = useAllFlights();
  const f = useMemo(() => flights?.find((x) => x.id === id) ?? null, [flights, id]);
  usePhonePage({ title: f?.callsign ?? "Flight", subtitle: f ? `${f.adep} → ${f.ades}` : null, mono: true, monoSubtitle: true, back: "/m/flights", tab: "flights" });
  if (loading && !flights) return <MSkeleton kind="rows" count={6} label="Loading the flight" />;
  if (!f) return <MError title={error ? "Couldn’t load the flight" : "This flight is not on the wall"} onRetry={error ? reload : undefined} icon="plane">{error ?? "It is not in the wall’s cache any more."}</MError>;
  const times: Array<[string, string | null, string]> = [
    ["STD", f.t.stdHm, "var(--cw-text-muted)"],
    [f.t.depKind === "T/O" ? "T/O" : "ETD", f.t.depKind === "STD" ? "—" : f.t.depHm, f.status === "delayed" ? "var(--ca-st-delayed-fg)" : "var(--cw-text)"],
    ["STA", f.t.staHm, "var(--cw-text-muted)"],
    [f.t.arrKind === "LDG" ? "LDG" : "ETA", f.t.arrKind === "STA" ? "—" : f.t.arrHm, "var(--cw-text)"],
    ["CTOT", f.raw.ctotUTC ? f.t.depKind === "CTOT" ? f.t.depHm : "set" : "—", "var(--cw-text-muted)"],
  ];
  const rec: Array<[string, string, boolean]> = [["Operator", f.operator || "—", false], ["Registration", f.registration || "—", true], ["Type", f.type ?? "—", true], ["Trip", f.raw.tripNo ?? "—", true], ["Source", "Leon", false]];
  return (
    <div className="flex min-h-full flex-col gap-3.5 px-4 pb-6 pt-3.5">
      <div className="flex items-center gap-2"><StatusPill status={f.status} />{f.status === "delayed" && f.t.depDeltaMin ? <span className="font-mono text-[13px] font-semibold" style={{ color: "var(--ca-st-delayed-fg)" }}>{f.t.depDeltaMin > 0 ? "+" : ""}{f.t.depDeltaMin} min</span> : null}{f.estimated && <span className="text-[12px] text-cw-text-muted">estimated from the schedule</span>}</div>
      <MCard>
        <div className="flex items-center px-3.5 pb-1 pt-3"><span className="flex-1 text-[15px] font-bold">Times · UTC</span><span className="text-[12.5px] text-cw-text-muted">from Leon</span></div>
        {times.map(([k, v, c]) => <div key={k} className="flex min-h-11 items-center border-t border-cw-divider px-3.5 text-[14.5px]"><span className="flex-1 text-cw-text-muted">{k}</span><span className="font-mono text-[15px] font-semibold" style={{ color: c }}>{v ?? "—"}</span></div>)}
      </MCard>
      <MCard>
        {rec.map(([k, v, mono], i) => <div key={k} className={`flex min-h-11 items-center px-3.5 text-[14.5px] ${i ? "border-t border-cw-divider" : ""}`}><span className="flex-1 text-cw-text-muted">{k}</span><span className={`font-semibold ${mono ? "font-mono" : ""}`}>{v}</span></div>)}
      </MCard>
      <span className="text-[12.5px] text-cw-text-muted">Passengers and their documents come with the passenger viewer (Stage 4).</span>
    </div>
  );
}
