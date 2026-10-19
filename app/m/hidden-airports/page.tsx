"use client";

// Hidden airports on a phone (Tier 2 › list): bring one back. Each row has Show again (44 px); the server scopes the
// list to the airports this person hid.
import { useMemo } from "react";
import { usePhonePage } from "@/components/m/chrome";
import { MError } from "@/components/m/ui";
import { T2Groups, T2Page } from "@/components/m/tier2";
import { dayShort, getJson, useAction, useResource } from "@/lib/m/t2";

type Hidden = { id: number; icao: string; airport_snapshot?: { country?: string; state?: string; name?: string } | null; deleted_reason?: string | null; deleted_at: string; restored_at?: string | null };

export default function HiddenAirportsPhonePage() {
  const r = useResource<{ results?: Hidden[] }>("/api/airports/list?include_deleted=true");
  const act = useAction("Couldn’t show that airport again.");
  const rows = useMemo(() => (r.data?.results ?? []).filter((x) => !x.restored_at), [r.data]);
  usePhonePage({ title: "Hidden airports", subtitle: rows.length ? `${rows.length} hidden by you` : null, tab: "more" });
  const restore = (x: Hidden) => act.run(String(x.id), async () => { await getJson("/api/airports/restore", { json: { deletedId: x.id, icao: x.icao } }); r.setData((d) => (d ? { ...d, results: (d.results ?? []).filter((y) => y.id !== x.id) } : d)); });
  return (
    <T2Page loading={r.loading && !r.data} error={r.error} empty={rows.length === 0} emptyCopy={["No hidden airports", "Airports you hide from search appear here, with a way back."]} errorCopy={["Couldn’t load the list", "Search still works."]} onRetry={r.reload}>
      {act.failed && <MError title="Not shown again." icon="eye-off" onRetry={act.clear}>{act.failed}</MError>}
      <T2Groups groups={[{ h: "HIDDEN BY YOU", count: rows.length, rows: rows.map((x) => ({ key: String(x.id), title: `${x.icao.toUpperCase()}${x.airport_snapshot?.name ? ` · ${x.airport_snapshot.name}` : ""}`, mono: !x.airport_snapshot?.name, sub: `Hidden ${dayShort(x.deleted_at)}${x.deleted_reason ? ` · ${x.deleted_reason}` : ""}${x.airport_snapshot?.country ? ` · ${x.airport_snapshot.country}` : ""}`, action: { label: "Show", onClick: () => void restore(x), busy: act.busy === String(x.id), disabled: act.busy !== null } })) }]} />
    </T2Page>
  );
}
