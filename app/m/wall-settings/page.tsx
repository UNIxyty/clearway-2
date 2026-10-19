"use client";

// Wall settings on a phone (Tier 2 › form): check what the big screen shows. The display's colours and font are
// read-only here — changing them needs the full-size preview on a desk — and the preview is drawn from the room's own
// palette data (data-wall-display), never from the portal's tokens. The check chips the wall shows are toggles for
// those who may change the big screen (wall.bigscreen.settings). Then the world clocks, and the screens: a screen
// waiting to be paired can be approved from here (wall.devices.approve) with the code it shows.
import { useMemo } from "react";
import { usePhonePage } from "@/components/m/chrome";
import { MError } from "@/components/m/ui";
import { T2Form, T2Page, type T2FormGroup } from "@/components/m/tier2";
import { useWallUser, userCan } from "@/lib/m/wall";
import { dayTime, getJson, useAction, useResource, wallUrl } from "@/lib/m/t2";

type Settings = { colors?: Record<string, string>; font?: string; zeroStyle?: string; chipImp?: boolean; chipCaa?: boolean; chipNtm?: boolean; chipWx?: boolean; mvtThresholdMin?: number; mvtFlashSeconds?: number; postLandingHours?: number; upcomingHorizonHours?: number; upcomingTableEnabled?: boolean; upcomingTableSide?: string; unconfirmedOutline?: boolean };
type Display = { settings?: Settings; account?: string; mainWallAccount?: string; isMainWall?: boolean; source?: string };
type Clock = { label: string; timeZone: string; local?: boolean; home?: boolean };
type Device = { deviceId: string; name?: string | null; status: "pending" | "approved" | "revoked"; code?: string | null; createdAt?: string; approvedAt?: string | null; approvedBy?: string | null; revokedAt?: string | null };
const CHIPS: Array<[keyof Settings, string, string]> = [["chipImp", "Important notices", "The IMP marker on a flight"], ["chipNtm", "NOTAM check", "The NTM marker"], ["chipWx", "Weather", "The WX marker and category"], ["chipCaa", "CAA", "The CAA marker"]];
const FONT_LABEL: Record<string, string> = { nunito: "Nunito", roboto: "Roboto", "public-sans": "Public Sans" };
const nowIn = (tz: string) => { try { return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()); } catch { return "—"; } };

export default function WallSettingsPhonePage() {
  usePhonePage({ title: "Wall settings", subtitle: "The ops-room screen", tab: "more" });
  const own = useResource<Display>(wallUrl("/display/settings"), { fallback: "The wall did not answer." });
  const main = useResource<Display>(own.data?.mainWallAccount ? wallUrl(`/display/settings?account=${encodeURIComponent(own.data.mainWallAccount)}`) : null, { fallback: "The wall did not answer." });
  const clocks = useResource<{ clocks?: Clock[] }>(wallUrl("/display/clocks"));
  const devices = useResource<{ devices?: Device[] }>(wallUrl("/device/list"), { poll: 15_000 });
  const user = useWallUser();
  const act = useAction("The wall did not accept that. Try again.");
  const big = main.data ?? (own.data?.isMainWall ? own.data : null);
  const s = big?.settings;
  const canBig = userCan(user ?? null, "wall.bigscreen.settings"), canApprove = userCan(user ?? null, "wall.devices.approve");
  const colours = useMemo(() => Object.entries(s?.colors ?? {}).filter(([, v]) => typeof v === "string" && v), [s]);
  const setChip = (key: keyof Settings, on: boolean) => act.run(String(key), async () => { if (!big?.account) return; await getJson(wallUrl("/display/settings"), { method: "PUT", json: { settings: { [key]: on }, account: big.account } }); await main.reload(); });
  const approve = (d: Device) => act.run(d.deviceId, async () => { await getJson(wallUrl("/device/approve"), { json: { deviceId: d.deviceId, name: d.name || `Screen ${d.code ?? ""}`.trim() } }); await devices.reload(); });
  const pending = (devices.data?.devices ?? []).filter((d) => d.status === "pending"), approved = (devices.data?.devices ?? []).filter((d) => d.status === "approved");
  // The preview: whatever colours the room has set, in the room's own values. With none set, the wall runs on its
  // shipped palette, which lives in the wall's own files and is not drawn here.
  const bg = s?.colors?.background ?? s?.colors?.bg ?? s?.colors?.pageBg; const fg = s?.colors?.text ?? s?.colors?.textPrimary;
  const preview = (
    <div className="flex flex-col gap-2 rounded-[14px] border-[1.5px] border-dashed border-cw-border-strong p-2.5">
      {bg || colours.length ? (
        <div data-wall-display="true" className="flex flex-col gap-1.5 rounded-[8px] p-3" style={{ background: bg ?? undefined, color: fg ?? undefined, border: bg ? undefined : "1px solid currentColor" }}>
          <span className="text-[9px] font-bold tracking-[.1em]">THE ROOM’S COLOURS · {colours.length} SET</span>
          <div className="flex flex-wrap gap-1.5">{colours.slice(0, 12).map(([k, v]) => <span key={k} title={k} className="h-5 w-5 rounded-[4px] border border-current/20" style={{ background: v }} />)}</div>
        </div>
      ) : <span className="px-1 py-2 text-[13px] text-cw-text-muted">The wall runs on its shipped palette — nothing has been changed for this room.</span>}
      <span className="flex items-center gap-1.5 text-[12px] text-cw-text-muted">The wall display, in its own colours. Light and dark don’t apply to it.</span>
    </div>
  );
  const groups: T2FormGroup[] = [
    { key: "display", h: "WALL DISPLAY · ITS OWN COLOURS", before: preview, rows: [
      { key: "palette", title: "Palette", sub: colours.length ? `${colours.length} colour${colours.length === 1 ? "" : "s"} set for this room` : "Shipped palette", readOnly: true },
      { key: "font", title: "Font", sub: `${FONT_LABEL[s?.font ?? ""] ?? s?.font ?? "—"}${s?.zeroStyle ? ` · ${s.zeroStyle} zero` : ""}`, readOnly: true },
      { key: "sizes", title: "Sizes and zoom", sub: "Set on a desk with the full-size preview", readOnly: true },
    ], note: "The wall display keeps its own colours and font. Change them on a wider screen, where you can see the full-size preview." },
    { key: "shows", h: "WHAT THE WALL SHOWS", rows: [
      ...CHIPS.map(([key, title, sub]) => ({ key: String(key), title, sub, toggle: { on: Boolean(s?.[key]), onChange: (v: boolean) => void setChip(key, v), disabled: !canBig || !big?.account || act.busy !== null } })),
      { key: "mvt", title: "Movement overdue after", sub: s?.mvtThresholdMin != null ? `${s.mvtThresholdMin} min, flashing ${s.mvtFlashSeconds ?? 0} s` : "—", readOnly: true },
      { key: "hours", title: "Window", sub: s ? `${s.upcomingHorizonHours ?? "—"} h ahead · ${s.postLandingHours ?? "—"} h after landing` : "—", readOnly: true },
      ...(s?.upcomingTableEnabled !== undefined ? [{ key: "table", title: "Upcoming table", sub: s.upcomingTableEnabled ? `On the ${s.upcomingTableSide ?? "right"}` : "Off", readOnly: true }] : []),
    ], note: canBig ? "The markers change on the ops-room screen within a few seconds." : "Changing what the big screen shows needs the big-screen permission." },
    { key: "clocks", h: "WORLD CLOCKS", rows: (clocks.data?.clocks ?? []).map((c) => ({ key: c.timeZone + c.label, title: c.label, sub: `${c.timeZone}${c.home ? " · home" : ""}${c.local ? " · local" : ""}`, trailing: <span className="pr-1 font-mono text-[15px] font-semibold">{nowIn(c.timeZone)}</span> })), note: clocks.loading ? "…" : clocks.data?.clocks?.length ? "Added and ordered on a desk." : "No clocks on the wall." },
    { key: "screens", h: "SCREENS", rows: [
      ...pending.map((d) => ({ key: d.deviceId, title: `Waiting to be paired${d.code ? ` · code ${d.code}` : ""}`, sub: `${d.name || "Unnamed screen"} · asked ${dayTime(d.createdAt)}`, trailing: canApprove ? <button type="button" disabled={act.busy !== null} onClick={() => void approve(d)} className="inline-flex h-11 items-center rounded-[11px] bg-cw-primary px-3.5 text-[14px] font-semibold text-cw-text-on-primary disabled:opacity-60">{act.busy === d.deviceId ? "…" : "Approve"}</button> : undefined })),
      ...approved.map((d) => ({ key: d.deviceId, title: d.name || "Screen", sub: `Approved ${dayTime(d.approvedAt)}${d.approvedBy ? ` by ${d.approvedBy}` : ""}`, readOnly: true })),
    ], note: pending.length ? "Check the code on the screen before approving: it gives that screen a long-lived key to the wall’s flight data." : devices.loading ? "…" : "A new screen shows a code on itself and appears here. Renaming and revoking are on a desk." },
  ];
  return (
    <T2Page loading={(own.loading && !own.data) || (main.loading && !main.data && Boolean(own.data?.mainWallAccount))} error={own.error && !own.data ? own.error : null} empty={false} emptyCopy={["No wall set up", "Set up a wall on a wider screen."]} errorCopy={["Couldn’t load settings", "The wall keeps running as it is."]} onRetry={own.reload}>
      {act.failed && <MError title="Not changed." icon="palette" onRetry={act.clear}>{act.failed}</MError>}
      <T2Form groups={groups} />
    </T2Page>
  );
}
