// The portal's colour tokens, for code (portal redesign, stage 1). The values live in shared/portal-tokens.json, which
// scripts/portal-tokens.mjs turns into shared/portal-tokens.css (--cw-* custom properties, light and dark). Code never
// holds a colour: it holds the token's CSS variable, so a theme change needs no re-render and no JS.
//
//   style={{ color: cw.textMuted, background: cw.bgSurface }}       className="text-cw-text-muted bg-cw-bg-surface"
//
// Not the Digital Wall's tokens (shared/design-tokens.json): the wall reads no --cw-* token and no data-theme.
import source from "@/shared/portal-tokens.json";

export type TokenName = keyof typeof source.tokens;
type Camel<S extends string> = S extends `${infer A}-${infer B}` ? `${A}${Capitalize<Camel<B>>}` : S;
const camel = (k: string) => k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/** Every token as `var(--cw-…)`, by camelCase name: cw.bgSurface, cw.textMuted, cw.dangerText … */
export const cw = Object.freeze(
  Object.fromEntries(Object.keys(source.tokens).map((k) => [camel(k), `var(--cw-${k})`])),
) as { readonly [K in TokenName as Camel<K>]: string };

/** The token's CSS variable, by its own name: v("bg-surface") === "var(--cw-bg-surface)". */
export const v = (name: TokenName) => `var(--cw-${name})`;

/**
 * A colour a canvas can draw with. Canvas cannot read CSS variables, so a `var(--cw-…)` is resolved against the page's
 * current theme (the <html data-theme> the theme script sets). Anything else is returned as is.
 */
export function resolveColour(value: string): string {
  const m = /^var\((--cw-[a-z0-9-]+)\)$/.exec(value.trim());
  if (!m || typeof document === "undefined") return value;
  return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || value;
}

/** A token at an opacity, as CSS (no colour arithmetic in JS): alpha(cw.primary, 0.12). */
export const alpha = (token: string, a: number) => `color-mix(in srgb, ${token} ${Math.round(a * 1000) / 10}%, transparent)`;
