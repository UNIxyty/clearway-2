# Portal colours and theme

Portal redesign, stage 1. Every colour in the portal is a `--cw-*` token with a light and a dark value. The Digital
Wall is a separate system: it keeps its own per-account colours and fonts, reads no `--cw-*` token and no `data-theme`.

## Files

| File | What it is |
| --- | --- |
| `shared/portal-tokens.json` | The source. Each token: `light`, `dark`, `use`. From the Claude Design project (where it is called `shared/design-tokens.json`), plus tokens added in the build (their `use` says so). |
| `shared/portal-tokens.css` | Generated: the tokens as custom properties for `:root`/`[data-theme="light"]`, `[data-theme="dark"]`, and `prefers-color-scheme: dark` when there is no `data-theme` (JavaScript off). Do not edit. |
| `shared/portal-contrast.json` | Text/background pairs and their measured contrast in both themes. |
| `lib/portal-tokens.ts` | For code: `cw.textMuted` → `"var(--cw-text-muted)"`, `v("text-muted")`, `alpha(token, 0.1)`, `resolveColour()` for canvas. |
| `tailwind.config.ts` | One class per token: `bg-cw-bg-surface`, `text-cw-text-muted`, `border-cw-border`; `/10` opacity modifiers mix with transparent. |
| `components/portal/theme-script.ts` | The inline `<head>` script that sets `data-theme` before first paint. |
| `components/portal/theme.ts` | The choice: `system` (match this device, default), `light`, `dark`. |

`shared/design-tokens.json` (no "portal") is the **wall's** file. The portal does not import it; the colour check fails
if anything in `app/`, `components/` or `lib/` does.

## Changing a colour

Edit `shared/portal-tokens.json`, then:

```
node scripts/portal-tokens.mjs          # writes the CSS and the contrast file; fails if a pair drops below AA
node scripts/portal-tokens.mjs --check  # CSS up to date and every pair at AA (4.5:1) in both themes
node scripts/check-portal-colours.mjs   # no hard-coded colour anywhere in the portal
```

A colour never goes into a component. Use a token (`cw.*` in a style, a `cw-` class in `className`). Text on a
coloured fill uses the matching text token (`text-on-primary` on `primary` / `danger-solid`; `on-ink` on `ink`), and
text uses the `*-text` tokens, not the dot/icon colours (`success`, `warning`, `danger`…). `text-disabled` is only for
inactive controls.

## How the theme is chosen

1. The choice is in `localStorage` (`cw-theme`) and on the account (`user_preferences.theme`,
   `docs/supabase-portal-theme.sql`). The top bar's sun/moon opens the three choices; the account copy follows the
   person to another device.
2. The inline script in `<head>` reads `cw-theme` (or the device setting for `system`) and sets `data-theme` and
   `color-scheme` on `<html>` before the first paint. With JavaScript off, the stylesheet's `prefers-color-scheme`
   block applies.
3. A change applies at once, with no transition and no re-render (every colour is a CSS variable).

## Deliberate differences from the design specs

- **Source-tier colours change in dark mode.** The agent design spec says the four source tiers (internal, company,
  attachment, web — the `tier-*` tokens) are never themed. They are: in dark each takes the dark value of its own colour
  family, so the four stay distinct and readable. A tier colour unreadable in dark is worse than one that moves.
  Accepted on 2026-10-11. Do not "fix" it back to fixed values.

## Checks (rig)

`node --env-file=.env.rig rig/stage1-check.mjs` (sign-in-on services behind the proxy on :3989): no flash in either
setting (app scripts held back 3 s), JavaScript off, switching and saving, another device adopting it, the boot
second, contrast measured on 28 views in both themes, and the wall unchanged.

`scripts/check-portal-colours.mjs` reads the source (every file in `app/`, `components/`, `lib/`) for literal
colours; it cannot see how a page looks. `rig/dark-audit.mjs` opens every page (the list is `app/**/page.tsx`) in dark
and flags pale surfaces, pale borders and dark text — what the source check cannot. Neither can judge layout: a page
built from correct tokens can still be arranged with light-theme logic (Help & support's header was, until Part A3).
