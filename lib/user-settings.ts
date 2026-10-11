// Settings → Customisation and Preferences (portal redesign, stage 4): what each person can set for themselves, and how
// a stored value is checked. Saved on the account (user_preferences, docs/supabase-portal-settings.sql) and mirrored
// in the browser so it applies before the account answers. The theme lives in components/portal/theme.ts.

export type Density = "comfortable" | "compact";
export type Motion = "system" | "reduce";
export type Pin = { kind: "page" | "airport"; label: string; href: string; icon: string };

export const MAX_PINS = 5;

/** Where someone may choose to land after signing in. `needs` hides an option from people who cannot open it. */
export const START_PAGES: Array<{ value: string; label: string; needs?: "agent" | "developer" }> = [
  { value: "/dashboard", label: "Dashboard" },
  { value: "/aip", label: "Airport search" },
  { value: "/aip/service-status", label: "Service status" },
  { value: "/agent", label: "Ops Agent chat", needs: "agent" },
  { value: "/agent/intake", label: "Flight intake", needs: "agent" },
  { value: "/developer/inbox", label: "Developer inbox", needs: "developer" },
];
export const DEFAULT_START = "/dashboard";

export const isDensity = (v: unknown): v is Density => v === "comfortable" || v === "compact";
export const isMotion = (v: unknown): v is Motion => v === "system" || v === "reduce";
export const isStartPage = (v: unknown): v is string => typeof v === "string" && START_PAGES.some((p) => p.value === v);

/** A pinned list as stored, or null when it is not one. Pages are portal paths; airports are /aip/<ICAO>. */
export function sanitizePins(input: unknown): Pin[] | null {
  if (!Array.isArray(input) || input.length > MAX_PINS) return null;
  const out: Pin[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const p = raw as Partial<Pin>;
    if (p?.kind !== "page" && p?.kind !== "airport") return null;
    if (typeof p.href !== "string" || !/^\/[A-Za-z0-9/_\-.?=&]{0,200}$/.test(p.href) || p.href.startsWith("//")) return null;
    if (p.kind === "airport" && !/^\/aip\/[A-Z0-9]{4}$/.test(p.href)) return null;
    if (typeof p.label !== "string" || !p.label.trim() || p.label.length > 60) return null;
    if (typeof p.icon !== "string" || !/^[a-z0-9-]{1,40}$/.test(p.icon)) return null;
    if (seen.has(p.href)) return null;
    seen.add(p.href);
    out.push({ kind: p.kind, label: p.label.trim(), href: p.href, icon: p.icon });
  }
  return out;
}
