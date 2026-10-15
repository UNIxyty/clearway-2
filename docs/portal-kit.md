# The portal's component kit

Portal redesign, stage 2. `components/kit` holds every control and surface the portal draws, once, from the Claude
Design sheet ("Portal Components"). Colours are `--cw-*` tokens ([portal-tokens.md](portal-tokens.md)); every control is
a styled element with full keyboard support. The sheet, with every component in every state in both themes, is at
**Developer → Component sheet** (`/developer/components`).

```tsx
import { Button, Select, Checkbox, DataTable, FilterBar, Card, useToast } from "@/components/kit";
```

| Area | Components |
| --- | --- |
| Buttons (§2.1) | `Button` (primary, secondary, quiet, danger, danger-quiet; sm 30 / md 36 / lg 44; `loading` + `loadingLabel`), `IconButton` (always a tooltip and an aria-label), `Spinner`, `Tooltip` |
| Form controls (§2.2) | `Field`, `TextInput`, `TextArea`, `CopyField`, `SearchInput`, `Select`, `MultiSelect`, `DateInput` (UTC days), `Toggle`, `Checkbox` (incl. mixed), `RadioGroup`, `Segmented` |
| Filters (§2.3) | `FilterBar` (search, up to four inline filters, the rest behind More filters), `FilteredStrip` ("Showing N of M · … are hiding K rows · Clear all"), `filterReasons` |
| Tables (§2.4) | `DataTable` (sort asc → desc → off, selection with a bulk-action bar, an always-visible ⋯ row menu, comfortable / dense, sticky header under the top bar, pagination above 50 rows), `TableCard`, `Pagination` |
| States (§2.5) | `EmptyState` (nothing yet), `NoMatchState` (nothing matches — offers to clear), `ErrorState` + `errorDetail(status, method, path)`, `SkeletonRows`, `Skeleton` |
| Surfaces (§2.6) | `Card` (52px header, 20px body, 48px footer), `Badge` (status tones with a dot), `RoleBadge`, `CountBadge`, `Kbd`, `Callout`, `Menu`, `Modal`, `ConfirmDialog`, `ToastProvider` / `useToast` |

## Rules the kit enforces

- **No native control.** No `<select>`, checkbox, radio or date/time input anywhere in `app/` or `components/`:
  `node scripts/check-portal-controls.mjs` (and no hard-coded colour: `node scripts/check-portal-colours.mjs`).
- **Tables scroll with the page**, never inside their own box. The header sticks at `top: var(--cw-topbar)`. A
  `DataTable` that does not set `density` follows the person's Settings → Table density (comfortable 52px rows,
  compact 32px; `html[data-density]`, set before the first paint).
- **Two kinds of empty**: nothing exists yet (say how things get here) and nothing matches (say what hid it, offer to
  clear). Loading draws the shape of what is coming. Errors name what failed, keep the status visible, offer a retry.
- **Popovers** (select, menu, date, filters) render in a portal inside the nearest `[data-theme]`, close on Esc or a
  click outside, and return focus to what opened them. A modal keeps focus inside until it closes.
- **Server-safe**: nothing in the kit renders differently on the server and on the first client render (a portal is
  drawn only after mount), so pages hydrate instead of being re-rendered.

## Rules for what a page says

These are not enforced by the kit; each was learned the hard way.

- **Two numbers may differ, but they may not share a name.** If the agent counts what is on the wall's board and the
  dashboard counts today's UTC flights, each says what it counts ("20 flights on the wall · 2 left late",
  "Flights today 7 · Delayed 0"). Two different numbers under one name, on one screen, cost more trust than either
  number is worth (2026-10-15).
- **Every time is UTC, written with a Z** (`lib/time.ts`; `rig/check-utc-times.mjs`, `rig/utc-browser-check.mjs`).
- **A person sees what happened and what to do; the detail goes to the log** (`lib/public-error.ts`;
  `rig/check-error-text.mjs`). Never answer 502 or 504: Cloudflare replaces those bodies in production.
- **Never say something will happen by itself unless it will.** A cached AIP copy said "refreshes on the next sync";
  nothing refreshed it. Say when a copy is from, and what the person has to do (2026-10-15).

## Older kits

`components/portal/ui.tsx` (`PButton`, `PEmpty`), `components/console-kit` (its `Button`, `Toggle`, `TextInput`,
`Dropdown`, `EmptyState`, `LoadingRows`, `ConfirmDialog`, `ReasonDialog`), the agent's `Button` and `Toggle`
(`components/agent/ui/primitives.tsx`) and the shadcn `components/ui` button, input and card now draw the kit's
components or its look, with their old props. Pages move onto `components/kit` directly as they are redesigned
(stage 3). The Flight intake / Agent mailbox controls (`components/agent/intake/controls.tsx`) and the agent panel's
own pieces follow the agent design spec and are left as they are.

Check: `node --env-file=.env.rig rig/stage2-check.mjs` — the sheet in both themes, keyboard on every control, the
modal's focus, table sort / pagination / sticky header / states, filters, contrast, and no native control or page
error on the portal's pages.
