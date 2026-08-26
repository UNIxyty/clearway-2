import { createContext, useContext, useMemo } from 'react';
import { resolveWallColors } from './wallColors';

// Wall colour context — DisplayApp resolves the per-account overrides
// (settings.colors from GET /api/display/settings, live-updated via the
// config.changed SSE refetch) once and every wall surface reads the resolved
// token map through useWallColors().
//
// The context DEFAULT is the resolved shipped palette, so shared components
// (FlightMarkers etc.) also work outside the provider — console lists simply
// render the defaults.

const WallColorsCtx = createContext(resolveWallColors({}));

export function WallColorsProvider({ colors, children }) {
  const value = useMemo(() => resolveWallColors(colors), [colors]);
  return <WallColorsCtx.Provider value={value}>{children}</WallColorsCtx.Provider>;
}

/** The resolved wall colour tokens ({ tokenKey: "#rrggbb" }). */
export function useWallColors() {
  return useContext(WallColorsCtx);
}
