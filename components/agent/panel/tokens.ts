// Ops Agent Side Panel — values taken from the Claude Design source
// ("Ops Agent Side Panel.dc.html"). Claude Design is the source of truth for
// appearance; where a value also exists in shared/design-tokens.json the two
// already agree, and the literals below are the design's own.

export const PANEL = {
  defaultWidth: 420,
  minWidth: 360,
  maxWidth: 600,
  /** Below this remaining content width the panel overlays instead of compressing. */
  minContentWidth: 900,
  /** At or below this viewport width the panel always overlays. */
  alwaysOverlayBelow: 1280,
  headerHeight: 60,
  storageKey: "cw-agent-panel-width",
} as const;

export const C = {
  ink: "#17181c",
  body: "#3a3d44",
  muted: "#6c7079",
  faint: "#9aa0a8",
  ghost: "#b9bdc5",
  card: "#ffffff",
  page: "#fbfbfc",
  surface: "#f5f6f7",
  wash: "#f0f1f3",
  userBubble: "#eef0f3",
  border: "#e6e7ea",
  borderInput: "#d6d8dc",
  borderInner: "#eef0f2",
  rowLine: "#f2f3f5",
  blue: "#2563eb",
  blueDeep: "#1d4ed8",
  blueTint: "#eef4ff",
  blueBorder: "#dbe6ff",
  blueChip: "#e8effe",
  green: "#16a34a",
  greenDeep: "#15803d",
  greenTint: "#e7f6ec",
  amber: "#b45309",
  amberTint: "#fef3e2",
  amberBorder: "#f6ddb0",
  orange: "#c2703b",
  orangeTint: "#fdf1e8",
  orangeBorder: "#f4d4b8",
  red: "#e5484d",
  redTint: "#fdecec",
  redBorder: "#f7cfd0",
  underline: "#93b4f5",
  shadowPanel: "0 1px 2px rgba(16,18,22,.04), 0 16px 40px rgba(16,18,22,.06)",
  shadowOverlay: "-18px 0 44px rgba(16,18,22,.13)",
} as const;

export const FONT = {
  sans: "'Public Sans', system-ui, sans-serif",
  mono: "'IBM Plex Mono', monospace",
} as const;

/** The design's three source tiers. Kept in lockstep with agent/lib/tools/framework.mjs. */
export const SOURCE_TIERS: Record<string, { label: string; fg: string; bg: string; icon: string }> = {
  company: { label: "Company", fg: "#6d28d9", bg: "#ede9fe", icon: "book-open" },
  internal: { label: "Internal", fg: "#1d4ed8", bg: "#dbeafe", icon: "database" },
  web: { label: "Web", fg: "#b45309", bg: "#fef3e2", icon: "globe" },
};

/**
 * Lucide icon as a CSS mask. The design references unpkg, but icons are served
 * from /icons/ like the rest of the portal: an ops tool should not fetch its
 * interface from a third-party CDN on every render — that is a dependency on
 * someone else's uptime for a screen people work from, and it leaks which
 * pages are open to whoever runs the CDN.
 */
export function iconStyle(name: string, size = 16, color: string = C.muted): import("react").CSSProperties {
  const mask = `url(/icons/${name}.svg) center/contain no-repeat`;
  return {
    width: size,
    height: size,
    display: "inline-block",
    flex: "none",
    background: color,
    mask,
    WebkitMask: mask,
  };
}
