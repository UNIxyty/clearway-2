"use client";

// One flight on the phone wall: status and delay, the route in 30 px ICAO codes (tap one for that airport), the
// times, then its five checks — an open one says what is flagged and opens a sheet to mark it; a done one shows who
// and when. Marking is the wall's own model: NOTAMs are checked per airport per day (the same acknowledgement the
// console's NOTAM Check makes, which clears the NTM marker on every flight at that airport), the other four per flight
// per cycle (POST /api/flight-checks). Both show on the wall at once.
import { shownText } from "@/lib/error-text";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import MaskIcon from "@/components/portal/Icon";
import { usePhonePage } from "@/components/m/chrome";
import { CheckChip, Chevron, MButton, MCard, MError, MRow, MSheet, MSkeleton, StatusPill, hmUtc } from "@/components/m/ui";
import { ackNotamAirport, checkedBy, postFlightCheck, useNotamToday, useWallBoard, useWallUser, userCan, type CheckKey, type Flight, type NotamAirport } from "@/lib/m/wall";
import { CHECK_KEYS, CHECK_NAME, STATUS_LABEL } from "@/shared/wall-facts.mjs";

const NAMES = CHECK_NAME as Record<CheckKey, string>;
const PERMISSION: Record<CheckKey, string> = { ntm: "wall.notam.ack", imp: "wall.flights.check", wx: "wall.flights.check", caa: "wall.flights.check", lim: "wall.flights.check" };

/** What each check is about on this flight, in one line, from the backend's decorated flight. */
function summarise(f: Flight, k: CheckKey, airports: NotamAirport[]): { text: string; items: string[] } {
  const lims = f.raw.limitations ?? [];
  const titles = (type: string) => lims.filter((l) => l.type === type).map((l) => l.title || l.description || l.caa?.authorityName || "").filter(Boolean);
  if (k === "ntm") {
    const flagged = airports.flatMap((a) => (a.filtered ?? []).map((n) => `${a.icao} ${n.number ?? ""}`.trim()));
    const n = flagged.length;
    return { text: n ? `${n} flagged at ${airports.map((a) => a.icao).join(" and ")}` : "No flagged NOTAMs for this flight", items: flagged };
  }
  if (k === "wx") {
    const parts = [f.raw.wxDep ? `${f.adep} ${f.raw.wxDep}` : null, f.raw.wxArr ? `${f.ades} ${f.raw.wxArr}` : null].filter(Boolean) as string[];
    return { text: parts.length ? parts.join(" · ") : "No weather category to note", items: parts };
  }
  const list = titles(k === "imp" ? "IMP" : k === "caa" ? "CAA" : "LIM");
  const what = k === "imp" ? "important notice" : k === "caa" ? "CAA entry" : "limitation";
  return { text: list.length ? list.join(" · ") : `No ${what} for this flight`, items: list };
}

export default function WallFlightPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const router = useRouter();
  const search = useSearchParams();
  const check = (search.get("check") as CheckKey | null) || null;
  const { flights, loading, error, reload } = useWallBoard();
  const { notam, setNotam } = useNotamToday();
  const user = useWallUser();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const f = useMemo(() => flights?.find((x) => x.id === id) ?? null, [flights, id]);

  usePhonePage({ title: f?.callsign ?? "Flight", subtitle: f ? `${f.adep} → ${f.ades}` : null, mono: true, monoSubtitle: true, back: "/m/wall", tab: "wall", tabs: !check });

  if (loading && !flights) return <MSkeleton kind="rows" count={6} label="Loading the flight" />;
  if (!f) return <MError title={error ? "Couldn’t load the flight" : "This flight is not on the wall"} onRetry={error ? reload : undefined} icon="plane">{error ?? "It may have left the wall’s window. The board shows what is on it now."}</MError>;

  const airports = (notam?.airports ?? []).filter((a) => a.icao === f.adep || a.icao === f.ades);
  const ntmChecked = airports.length > 0 && airports.every((a) => a.checked);
  const openSheet = (k: CheckKey) => router.replace(`/m/wall/${encodeURIComponent(f.id)}?check=${k}`);
  const closeSheet = () => router.replace(`/m/wall/${encodeURIComponent(f.id)}`);
  const times: Array<[string, string | null, string]> = f.status === "arrived"
    ? [[f.t.arrKind === "LDG" ? "LDG" : "ETA", f.t.arrHm, "var(--cw-text)"], ["STA", f.t.staHm, "var(--cw-text-muted)"], [f.t.depKind, f.t.depHm, "var(--cw-text-muted)"]]
    : [[f.t.depKind, f.t.depHm, f.status === "delayed" ? "var(--ca-st-delayed-fg)" : "var(--cw-text)"], ["STD", f.t.stdHm, "var(--cw-text-muted)"], [f.t.arrKind, f.t.arrHm, "var(--cw-text)"]];
  const delta = f.t.depDeltaMin;

  const mark = async (k: CheckKey, icao?: string) => {
    setBusy(true); setFailed(null);
    try {
      if (k === "ntm") { const s = await ackNotamAirport(icao!); setNotam(s); }
      else { await postFlightCheck(f.oprId, f.flightNid, [k]); await reload(); }
      closeSheet();
    } catch (e) { setFailed(shownText(e, "The wall did not answer.")); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-full flex-col gap-4 px-4 pb-6 pt-3.5">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <StatusPill status={f.status} />
          {f.status === "delayed" && delta ? <span className="font-mono text-[13px] font-semibold" style={{ color: "var(--ca-st-delayed-fg)" }}>{delta > 0 ? "+" : ""}{delta} min</span> : null}
          {f.estimated && <span className="text-[12px] text-cw-text-muted">estimated from the schedule</span>}
          <span className="flex-1" />
          <span className="font-mono text-[12.5px] text-cw-text-muted">{f.registration}{f.type ? ` · ${f.type}` : ""}</span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
          <Link href={`/m/airport/${f.adep}`} className="flex flex-col"><span className="font-mono text-[30px] font-bold tracking-[-.02em] text-cw-text-link">{f.adep}</span><span className="text-[13px] text-cw-text-muted">{f.adepName}</span></Link>
          <MaskIcon name="arrow-right" size={20} color="var(--cw-text-muted)" />
          <Link href={`/m/airport/${f.ades}`} className="flex flex-col items-end"><span className="font-mono text-[30px] font-bold tracking-[-.02em] text-cw-text-link">{f.ades}</span><span className="text-[13px] text-cw-text-muted">{f.adesName}</span></Link>
        </div>
        <div className="grid grid-cols-3 rounded-[12px] border border-cw-border bg-cw-bg-surface">
          {times.map(([k, v, c], i) => <span key={k + i} className={`flex flex-col gap-0.5 px-3 py-2.5 ${i ? "border-l border-cw-border" : ""}`}><span className="text-[11.5px] font-semibold text-cw-text-muted">{k}</span><span className="font-mono text-[17px] font-semibold" style={{ color: c }}>{v ?? "—"}</span></span>)}
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline"><span className="flex-1 text-[17px] font-extrabold">Checks</span><span className="text-[13px] text-cw-text-muted">{f.open.length} of {CHECK_KEYS.length} open</span></div>
        <MCard>
          {(CHECK_KEYS as CheckKey[]).map((k) => {
            const open = f.open.includes(k);
            const done = k === "ntm" ? ntmChecked : Boolean(f.raw.checks?.[k]);
            const by = k === "ntm" ? airports.map((a) => checkedBy(a.checked)).filter(Boolean)[0] : checkedBy(f.raw.checks?.[k]);
            const { text } = summarise(f, k, airports);
            return (
              <MRow key={k} minH={64} onClick={() => openSheet(k)} ariaLabel={`${NAMES[k]}: ${open ? "open" : done ? "checked" : "nothing flagged"}`}>
                <span className="w-12 flex-none"><CheckChip k={k} dim={!open} /></span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-[15px] font-semibold">{NAMES[k]}</span><span className="truncate text-[13px] leading-snug text-cw-text-body">{text}</span></span>
                {open ? <span className="flex items-center gap-0.5 text-[13px] font-semibold text-cw-text-link">Open<MaskIcon name="chevron-right" size={16} color="currentColor" /></span>
                  : done ? <span className="flex items-center gap-1 font-mono text-[12px] text-cw-success-text"><MaskIcon name="check" size={14} color="currentColor" />{by || "checked"}</span>
                    : <span className="text-[12px] text-cw-text-muted">—</span>}
              </MRow>
            );
          })}
        </MCard>
      </section>

      <MCard>
        <MRow href={`/m/flights/${encodeURIComponent(f.id)}/passengers`}><MaskIcon name="id-card" size={19} color="var(--ca-sens-text)" className="flex-none" /><span className="flex min-w-0 flex-1 flex-col"><span className="text-[15px] font-semibold">Passengers</span><span className="text-[13px] text-cw-text-muted">Documents hidden until opened</span></span><Chevron /></MRow>
        <MRow href={`/m/airport/${f.adep}?tab=weather`}><MaskIcon name="cloud-sun" size={19} color="var(--cw-text-muted)" className="flex-none" /><span className="flex min-w-0 flex-1 flex-col"><span className="text-[15px] font-semibold">Weather</span><span className="text-[13px] text-cw-text-muted">{[f.raw.wxDep && `${f.adep} ${f.raw.wxDep}`, f.raw.wxArr && `${f.ades} ${f.raw.wxArr}`].filter(Boolean).join(" · ") || `${f.adep} and ${f.ades}`}</span></span><Chevron /></MRow>
        <MRow href={`/m/airport/${f.ades}`}><MaskIcon name="file-text" size={19} color="var(--cw-text-muted)" className="flex-none" /><span className="flex min-w-0 flex-1 flex-col"><span className="text-[15px] font-semibold">NOTAMs and documents</span><span className="text-[13px] text-cw-text-muted">{f.ades} · arrival</span></span><Chevron /></MRow>
      </MCard>
      <span className="text-[12px] text-cw-text-muted">{STATUS_LABEL[f.status as keyof typeof STATUS_LABEL] ?? f.status} on the ops-room wall · {f.operator}</span>

      {check && (
        <CheckSheet f={f} k={check} airports={airports} canMark={userCan(user ?? null, PERMISSION[check])} userName={user?.name || user?.email || ""} busy={busy} failed={failed} onMark={mark} onClose={closeSheet} />
      )}
    </div>
  );
}

function CheckSheet({ f, k, airports, canMark, userName, busy, failed, onMark, onClose }: { f: Flight; k: CheckKey; airports: NotamAirport[]; canMark: boolean; userName: string; busy: boolean; failed: string | null; onMark: (k: CheckKey, icao?: string) => void; onClose: () => void }) {
  const { items } = summarise(f, k, airports);
  const open = f.open.includes(k);
  const signed = <>Signed as {userName || "you"} · {hmUtc()} UTC · shows on the wall</>;
  const noPermission = "You don’t have permission to mark checks";
  return (
    <MSheet open onClose={onClose} lead={<CheckChip k={k} />} title={k === "ntm" ? `NOTAMs · ${airports.map((a) => a.icao).join(", ") || f.ades}` : NAMES[k]} subtitle={k === "ntm" ? "Flagged for today’s check, this flight’s airports" : `${f.callsign} · ${f.adep} → ${f.ades}`}
      footer={k === "ntm" ? (
        <>
          {airports.filter((a) => !a.checked).map((a) => <MButton key={a.icao} kind="primary" icon="check" disabled={!canMark || busy} onClick={() => onMark("ntm", a.icao)}>Mark {a.icao} NOTAMs checked</MButton>)}
          {airports.length > 0 && airports.every((a) => a.checked) && <span className="text-center text-[13.5px] text-cw-success-text">Checked today at {airports.map((a) => a.icao).join(" and ")}</span>}
          <span className="text-center text-[12.5px] text-cw-text-muted">{canMark ? signed : noPermission}</span>
        </>
      ) : (
        <>
          <MButton kind="primary" icon="check" disabled={!canMark || busy || !open} onClick={() => onMark(k)}>{open ? `Mark ${NAMES[k]} checked` : "Nothing to mark"}</MButton>
          <span className="text-center text-[12.5px] text-cw-text-muted">{canMark ? signed : noPermission}</span>
        </>
      )}>
      {failed && <div role="alert" className="mb-3 rounded-[10px] border border-cw-danger-border bg-cw-danger-tint px-3 py-2 text-[13.5px] text-cw-danger-text">{failed}</div>}
      {k === "ntm" ? (
        airports.length === 0 ? <span className="text-[14px] text-cw-text-body">Today’s check has no entry for {f.adep} or {f.ades} yet.</span> : airports.map((a) => (
          <div key={a.icao} className="mb-3 flex flex-col gap-2">
            <span className="text-[12px] font-bold tracking-[.06em] text-cw-text-muted">{a.icao} · {(a.filtered ?? []).length} FLAGGED{a.checked ? ` · CHECKED BY ${checkedBy(a.checked).toUpperCase()}` : ""}</span>
            {(a.filtered ?? []).map((n, i) => (
              <div key={`${n.number}-${i}`} className="flex flex-col gap-1 rounded-[10px] border border-cw-border border-l-4 border-l-cw-warning bg-cw-bg-surface px-3 py-2.5">
                <span className="flex gap-2"><span className="font-mono text-[12.5px] text-cw-text-muted">{n.number}</span><span className="text-[11.5px] font-semibold text-cw-text-muted">{(n.matches ?? []).map((m) => m.group).filter(Boolean).join(", ")}</span></span>
                <span className="text-[14.5px] font-semibold leading-snug">{(n.condition ?? "").split("\n")[0]}</span>
                {(n.startDateUtc || n.endDateUtc) && <span className="font-mono text-[12px] text-cw-text-muted">{n.startDateUtc ?? "?"} – {n.endDateUtc ?? "?"}</span>}
              </div>
            ))}
            {(a.filtered ?? []).length === 0 && <span className="text-[13.5px] text-cw-text-body">Nothing flagged by the keyword filter. The full list is on the airport page.</span>}
            <Link href={`/m/airport/${a.icao}`} className="flex h-11 items-center gap-1.5 text-[14px] font-semibold text-cw-text-link">All {(a.all ?? []).length} NOTAMs at {a.icao}<MaskIcon name="chevron-right" size={15} color="currentColor" /></Link>
          </div>
        ))
      ) : items.length ? items.map((t, i) => <div key={i} className="mb-2 rounded-[10px] border border-cw-border bg-cw-bg-surface px-3 py-2.5 text-[14.5px] leading-snug">{t}</div>)
        : <span className="text-[14px] text-cw-text-body">Nothing is flagged for this flight.</span>}
    </MSheet>
  );
}
