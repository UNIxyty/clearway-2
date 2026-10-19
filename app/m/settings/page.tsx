"use client";

// Settings on a phone (Tier 2 › form): the theme and motion — the one stored choice each, shared with every portal
// page and the wall console (docs/portal-tokens.md) — and the start page for a desk. Table density is a desk setting
// and is not here; the phone has no tables.
import { useEffect, useState } from "react";
import { useIdentity } from "@/components/portal/Shell";
import { setChoice, useTheme, type ThemeChoice } from "@/components/portal/theme";
import { saveSetting, useLocalSettings } from "@/components/portal/user-settings";
import { START_PAGES, DEFAULT_START, isStartPage, type Motion } from "@/lib/user-settings";
import { usePhonePage } from "@/components/m/chrome";
import { PickSheet } from "@/components/m/pick";
import { MError } from "@/components/m/ui";
import { T2Form, T2Page } from "@/components/m/tier2";
import { getJson, useResource } from "@/lib/m/t2";

const THEMES: Array<{ value: ThemeChoice; label: string; sub: string }> = [{ value: "system", label: "Match this device", sub: "Light by day, dark when the phone is" }, { value: "light", label: "Light", sub: "" }, { value: "dark", label: "Dark", sub: "For the ops room at night" }];
const MOTIONS: Array<{ value: Motion; label: string; sub: string }> = [{ value: "system", label: "Match this device", sub: "Follows the phone’s Reduce Motion setting" }, { value: "reduce", label: "Reduce", sub: "No shimmer, no sliding sheets" }];

export default function SettingsPhonePage() {
  usePhonePage({ title: "Settings", subtitle: "Saved to your account", tab: "more" });
  const { hasAgent, isDeveloper } = useIdentity();
  const { choice } = useTheme();
  const local = useLocalSettings();
  const prefs = useResource<{ preferences?: { start_page?: unknown } }>("/api/user/preferences");
  const [startPage, setStartPage] = useState(DEFAULT_START);
  useEffect(() => { const s = prefs.data?.preferences?.start_page; if (isStartPage(s)) setStartPage(s); }, [prefs.data]);
  const [sheet, setSheet] = useState<"theme" | "motion" | "start" | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pickTheme = async (c: ThemeChoice) => { setChoice(c, { save: false }); setSheet(null); try { await getJson("/api/user/preferences", { json: { theme: c } }); } catch { setFailed("Your theme changed on this phone but could not be saved to your account."); } };
  const pickMotion = async (m: Motion) => { setBusy(true); const r = await saveSetting("motion", m); setBusy(false); setSheet(null); if (r === "failed") setFailed("Your last change was not saved. Try again."); else if (r === "local") setFailed("Changed on this phone only; it could not be saved to your account."); };
  const pickStart = async (v: string) => { setBusy(true); const r = await saveSetting("startPage", v); setBusy(false); setSheet(null); if (r === "failed") setFailed("Your last change was not saved. Try again."); else setStartPage(v); };
  const startOptions = START_PAGES.filter((p) => !p.needs || (p.needs === "agent" && hasAgent) || (p.needs === "developer" && isDeveloper));
  return (
    <T2Page loading={false} error={null} empty={false} emptyCopy={["", ""]} errorCopy={["", ""]}>
      {failed && <MError title="Not saved." onRetry={() => setFailed(null)}>{failed}</MError>}
      <T2Form groups={[
        { key: "appearance", h: "APPEARANCE", rows: [
          { key: "theme", title: "Theme", sub: THEMES.find((t) => t.value === choice)?.label, onClick: () => setSheet("theme") },
          { key: "motion", title: "Motion", sub: MOTIONS.find((m) => m.value === local.motion)?.label, onClick: () => setSheet("motion") },
        ], note: "One choice for every portal page and the wall console, on every device you sign in on. The ops-room screen keeps its own colours." },
        { key: "prefs", h: "ON A DESK", rows: [
          { key: "start", title: "Start page", sub: START_PAGES.find((p) => p.value === startPage)?.label ?? "Dashboard", onClick: () => setSheet("start") },
          { key: "density", title: "Table density, pinned tabs", sub: "Set on a wider screen", readOnly: true },
        ], note: "The phone opens on the Wall tab. These apply when you sign in on a laptop." },
      ]} />
      <PickSheet open={sheet === "theme"} onClose={() => setSheet(null)} title="Theme" options={THEMES} value={choice} onPick={(v) => void pickTheme(v)} />
      <PickSheet open={sheet === "motion"} onClose={() => setSheet(null)} title="Motion" options={MOTIONS} value={local.motion} onPick={(v) => void pickMotion(v)} busy={busy} />
      <PickSheet open={sheet === "start"} onClose={() => setSheet(null)} title="Start page" subtitle="What the portal opens on, on a desk" options={startOptions.map((p) => ({ value: p.value, label: p.label }))} value={startPage} onPick={(v) => void pickStart(v)} busy={busy} />
    </T2Page>
  );
}
