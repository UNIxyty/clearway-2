"use client";

// NOTAM check on a phone (Tier 2 › list grouped by a key): the morning round. Airports to check first, each with
// how many flagged NOTAMs and which flights; a row opens the airport's NOTAMs (the Tier 1 page); Mark checked is
// the wall's own acknowledgement (per airport per Riga day, wall.notam.ack). Checked ones follow, with who and when.
import { useMemo } from "react";
import { usePhonePage } from "@/components/m/chrome";
import { MError } from "@/components/m/ui";
import { T2Groups, T2Page, type T2Row } from "@/components/m/tier2";
import { ackNotamAirport, checkedBy, useWallUser, userCan, type NotamAirport, type NotamState } from "@/lib/m/wall";
import { hmZ, useAction, useResource, wallUrl } from "@/lib/m/t2";

export default function NotamCheckPhonePage() {
  const r = useResource<NotamState>(wallUrl("/notam-check/today"), { poll: 30_000, fallback: "The wall did not answer." });
  const { data: state, error, loading, reload } = r;
  const user = useWallUser();
  const act = useAction("Couldn’t mark that airport. Try again.");
  const airports = useMemo<NotamAirport[]>(() => state?.airports ?? [], [state]);
  const toCheck = airports.filter((a) => !a.checked);
  const checked = airports.filter((a) => a.checked);
  usePhonePage({ title: "NOTAM check", subtitle: state ? `${state.done ?? checked.length} of ${state.total ?? airports.length} checked · ${state.day ?? "today"}` : null, tab: "more" });
  const canAck = userCan(user ?? null, "wall.notam.ack");
  const mark = (a: NotamAirport) => act.run(a.icao, async () => { await ackNotamAirport(a.icao); await reload(); });
  const row = (a: NotamAirport, done: boolean): T2Row => ({
    key: a.icao, title: `${a.icao}${a.name ? ` · ${a.name}` : ""}`, mono: !a.name,
    sub: a.error ? `Source not answering · ${a.error}` : `${(a.filtered ?? []).length} flagged of ${(a.all ?? []).length}${a.flights?.length ? ` · ${a.flights.slice(0, 3).join(", ")}${a.flights.length > 3 ? ` +${a.flights.length - 3}` : ""}` : ""}${done && a.checked ? ` · ${checkedBy(a.checked)} ${hmZ(a.checked.at)}` : ""}`,
    href: `/m/airport/${a.icao}`,
    ...(done ? { badge: ["Checked", "ok"] as T2Row["badge"] } : canAck ? { action: { label: "Mark checked", onClick: () => void mark(a), busy: act.busy === a.icao, disabled: act.busy !== null } } : { badge: ["Open", "warn"] as T2Row["badge"] }),
  });
  return (
    <T2Page loading={loading && !state} error={error} stale={Boolean(state)} empty={airports.length === 0} emptyCopy={["Nothing to check", "No airports on today’s flights yet. The round starts when the wall has flights."]} errorCopy={["Couldn’t load the round", "Your checks so far are saved on the wall."]} onRetry={reload}>
      {act.failed && <MError title="Not marked." icon="shield-check" onRetry={act.clear}>{act.failed}</MError>}
      <T2Groups groups={[{ h: "TO CHECK", count: toCheck.length, tone: toCheck.length ? "warning" : undefined, rows: toCheck.map((a) => row(a, false)) }, { h: "CHECKED", count: checked.length, rows: checked.map((a) => row(a, true)) }]} />
      <span className="px-0.5 text-[13px] leading-normal text-cw-text-muted">Marking an airport marks its NOTAMs for every flight there today, as on the wall. There is no undo until the next daily reset.</span>
    </T2Page>
  );
}
