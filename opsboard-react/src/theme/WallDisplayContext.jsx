import { createContext, useContext, useMemo } from 'react';

// Per-account wall display options that are not colours: which chips the pills show (bug report 7 item 5) and
// the horizontal sizing knobs (item 3). DisplayApp resolves them from the same settings fetch as the colours and
// the same config.changed refetch updates them live. The context DEFAULT is "everything as shipped", so shared
// components (console lists, previews) outside the provider render exactly as before.

export const DEFAULT_CHIPS = { IMP: true, CAA: true, NTM: true, WX: true };
// floorTextPx / floorGapPx: the knobs' minimums in real panel pixels (bug report 7 follow-up item 3; FlightPill
// wallFloorsCss). Provisional until checked at the wall.
export const DEFAULT_HORIZONTAL = { callsignScale: 1, routeScale: 1, chipSpacing: 1, minPillMinutes: 45, pillPadding: 1, laneGap: 1, autoFitHorizontal: false, floorTextPx: 10, floorGapPx: 3 };

/** Settings payload → { chips, horizontal }. Missing keys keep the shipped value. */
export function resolveWallDisplay(settings = {}) {
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    chips: { IMP: settings.chipImp !== false, CAA: settings.chipCaa !== false, NTM: settings.chipNtm !== false, WX: settings.chipWx !== false },
    horizontal: Object.fromEntries(Object.entries(DEFAULT_HORIZONTAL).map(([k, d]) => [k, k === 'autoFitHorizontal' ? settings[k] === true : num(settings[k], d)])),
  };
}

const Ctx = createContext({ chips: DEFAULT_CHIPS, horizontal: DEFAULT_HORIZONTAL });

export function WallDisplayProvider({ settings, children }) {
  const value = useMemo(() => resolveWallDisplay(settings ?? {}), [settings]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallDisplay() {
  return useContext(Ctx);
}
