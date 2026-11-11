import { CLEARWAY_LOGO_PATHS as PATHS } from "@/lib/brand/clearway-logo-paths";
// The Clearway logo, inline, in currentColor (portal redesign: one file for both themes — it takes the text token, so
// it is dark on the light theme and light on the dark one). Shapes from the brand file (public/brand/clearway-logo.svg,
// the same paths as the design project's clearway-logo-currentcolor.svg, without its metadata block).

/** The full logo (mark and wordmark). Its colour is the surrounding text colour. */
export function ClearwayLogo({ height = 28, title = "Clearway — Handling & Operations", className }: { height?: number; title?: string; className?: string }) {
  return (
    <svg viewBox="0 0 1337.11 243.2" height={height} fill="currentColor" role="img" aria-label={title} className={className} style={{ display: "block", width: "auto", flex: "none" }}>
      {PATHS.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

/** The round mark alone (the 64px rail). */
export function ClearwayMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 243.2 243.2" width={size} height={size} fill="currentColor" role="img" aria-label="Clearway" className={className} style={{ display: "block", flex: "none" }}>
      <path d={PATHS[0]} />
    </svg>
  );
}
