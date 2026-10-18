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
| `shared/client-tokens.css` | `--ca-*` additions from the Claude Design project (client access): the sensitive-data rose, the six flight-status pills, scope kinds. Loaded after `portal-tokens.css`; never redefines a `--cw-*` token. The wall console uses `--ca-st-*` for status pills (since 2026-10-18); the client view (Stage 5) the rest. |
| `shared/mobile-tokens.css` | `--mx-*` additions (the phone): shell, now-line, search mark, the five check chips, paper. Loaded after the two above; never redefines a `--cw-*` token. The wall console uses `--mx-chk-*` for its check chips; the phone pages (Stages 2–3) the rest. |
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

## The wall console (since 2026-10-18)

The Display Console (`/digital-wall/console/*`, `opsboard-react/src/components/console/`) follows the portal's theme.
Its kit (`ui.jsx`) names the portal's tokens (`t.ink` is `var(--cw-text)`, and so on); the three token sheets travel
inside the console's own `<style>` (`ConsoleStyles`), so they exist only while the console is mounted; and
`src/theme/portalTheme.js` is the portal's `components/portal/theme.ts` in plain JS: the same `cw-theme` key in
localStorage (shared with the portal on the same origin), the same saved choice on the account
(`/api/user/preferences`), `data-theme` and `color-scheme` on `<html>`; `index.html` applies it before the first
paint, on console paths only. The portal's **Motion** preference (`cw-motion`, the account's `motion`,
`data-motion="reduce"`) comes the same way, with the portal's reduced-motion rules scoped to `.cw-console`. Both are
followed live: a change made in the portal's Settings reaches an open console tab through the `storage` event, with no
reload and no transition. **One place chooses them** (Settings › Appearance, Settings › Preferences); the console shows
which choice is in effect and links there, and has no control of its own. The wall's guide (`digital-wall/guide/`)
follows the same two keys and lost its own light/dark button on 2026-10-18.

**The wall display is not themed.** It keeps its own per-account colours and font (wall settings; `shared/design-tokens.json`
is its token file, read at build time), sets no `data-theme`, loads no `--cw-*` token. Everything the console draws
*of* the wall (the Colours tab's preview pill, the font preview, the limitation and clock-bar previews, today's wall
sign, the strip at the top of Settings) lives in `src/components/wall-preview/` and is drawn from the wall's resolved
colours and font — data the console edits, never a token. Each carries `data-wall-display="true"`.

Loading follows the portal's skeletons (shimmer 1400 ms linear) in the page's real grid (`pageMeta.js` is the one source
of each table's columns, for the table and for its skeleton), plus a rule the design added for the console: a skeleton
is skipped when data lands within 120 ms and, once shown, stays at least 400 ms (`useLoadPhase` in `ui.jsx`). The
portal itself shows its skeletons at once and swaps as soon as data lands; adopting the 120/400 rule there is a
separate job.

Checks: `node scripts/check-console-theme.mjs` reads the source — no hard-coded colour in a console file (a line that
must hold one, such as the colour picker's own gradients, ends in `// colour-data` and is printed), and no portal token,
`data-theme` or console import in any display file, `wall-preview/` included. `node --env-file=.env.rig
rig/wall/console-theme-check.mjs` opens the built console against the sign-in-on rig wall: all ten pages in light, dark
and "match this device"; the first second (shell, nav, title and a disabled main button at once, the badge holding its
space, nothing in the nav moving); the 120/400 rule with the API delayed; and the boundary — the display defines no
`--cw-*` token and is pixel-identical with the portal in light and in dark (the clock frozen), as is the wall preview
inside the dashed line on Settings.

