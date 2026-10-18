import type { Config } from "tailwindcss";
import portal from "./shared/portal-tokens.json";

// Portal colours are the --cw-* tokens (shared/portal-tokens.json → shared/portal-tokens.css), one class per token:
// bg-cw-bg-surface, text-cw-text-muted, border-cw-border … Each resolves to var(--cw-…), so light and dark come from
// the stylesheet, never from a class. An opacity modifier (bg-cw-primary/10) mixes the token with transparent.
// shared/design-tokens.json is the Digital Wall's file and is not read here.
type Alpha = { opacityValue?: string };
// Tailwind's own opacity variables (--tw-bg-opacity …) are always 1 here (no bg-opacity-* utilities are used), so a
// plain class is the plain token; only an explicit modifier (/10, /[0.06]) mixes.
const tokenColour = (name: string) => ({ opacityValue }: Alpha) =>
  opacityValue === undefined || opacityValue === "1" || opacityValue.startsWith("var(--tw-")
    ? `var(--cw-${name})`
    : `color-mix(in srgb, var(--cw-${name}) calc(${opacityValue} * 100%), transparent)`;
const colourTokens = Object.keys(portal.tokens).filter((k) => !/^(shadow-|show-)/.test(k));
// Tailwind accepts a function colour (for the opacity modifier); its config type only describes strings.
const cw = Object.fromEntries(colourTokens.map((k) => [k, tokenColour(k)])) as unknown as Record<string, string>;
// The additions (shared/client-tokens.css, shared/mobile-tokens.css): the same one-class-per-token wiring, by name.
// bg-ca-st-delayed-bg, text-ca-sens-text, bg-mx-tabbar, text-mx-now … Each resolves to its variable.
const varColour = (prefix: string) => (name: string) => ({ opacityValue }: Alpha) =>
  opacityValue === undefined || opacityValue === "1" || opacityValue.startsWith("var(--tw-")
    ? `var(--${prefix}-${name})`
    : `color-mix(in srgb, var(--${prefix}-${name}) calc(${opacityValue} * 100%), transparent)`;
const CA_TOKENS = ["sens", "sens-text", "sens-tint", "sens-border", "sens-solid", "sens-on-solid", "mask", "watermark", "countdown-track",
  ...["scheduled", "delayed", "ctot", "flying", "arrived", "aog"].flatMap((s) => [`st-${s}-bg`, `st-${s}-fg`]),
  ...["op", "reg", "trip"].flatMap((s) => [`scope-${s}-bg`, `scope-${s}-fg`, `scope-${s}-bd`]), "on-dot", "off-ring", "route-line", "map-grid"];
const MX_TOKENS = ["statusbar", "appbar", "tabbar", "tab-active", "tab-idle", "tab-indicator", "sheet", "handle", "now", "now-soft", "mark-bg", "mark-fg", "hold-track",
  ...["imp", "ntm", "wx", "caa", "lim"].flatMap((s) => [`chk-${s}-bg`, `chk-${s}-fg`]), "paper", "paper-ink", "paper-rule"];
const ca = Object.fromEntries(CA_TOKENS.map((k) => [k, varColour("ca")(k)])) as unknown as Record<string, string>;
const mx = Object.fromEntries(MX_TOKENS.map((k) => [k, varColour("mx")(k)])) as unknown as Record<string, string>;

export default {
  // Theme switching is data-theme on <html> (set before first paint by the inline script in app/layout.tsx). The
  // tokens do the work; `dark:` variants are not used.
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    // Status tables in lib/ name their classes (bug-report and service-state dots).
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    // Tailwind's own shadows are hard-coded black; these are the theme's.
    boxShadow: {
      none: "none",
      sm: "var(--cw-shadow-1)",
      DEFAULT: "var(--cw-shadow-1)",
      md: "var(--cw-shadow-2)",
      lg: "var(--cw-shadow-2)",
      xl: "var(--cw-shadow-pop)",
      "2xl": "var(--cw-shadow-pop)",
      inner: "inset 0 1px 2px var(--cw-divider)",
    },
    extend: {
      fontFamily: {
        // Public Sans UI + IBM Plex Mono for codes, times and numbers (design spec §1.5).
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: { cw, ca, mx },
      // Preflight's default border, ring and placeholder colours are Tailwind greys/blues: make them tokens.
      borderColor: { DEFAULT: "var(--cw-border)" },
      ringColor: { DEFAULT: "var(--cw-focus)" },
      ringOffsetColor: { DEFAULT: "var(--cw-bg-page)" },
      boxShadow: {
        "cw-1": "var(--cw-shadow-1)",
        "cw-2": "var(--cw-shadow-2)",
        "cw-pop": "var(--cw-shadow-pop)",
        "cw-panel": "var(--cw-shadow-panel)",
      },
    },
  },
  plugins: [],
} satisfies Config;
