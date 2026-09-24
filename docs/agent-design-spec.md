# Clearway Ops Agent — implementation spec

Build reference for the AI Operations Agent inside the Clearway console. It documents what is drawn in these design files, and nothing more:

| File | What it holds |
|---|---|
| `Ops Agent.dc.html` | Round 1: full-page chat thread end to end (A), states (B), composer (C), voice indicator and overlay (D) |
| `Ops Agent Views.dc.html` | Sidebar entry, History, Knowledge base, Activity log, Agent settings |
| `Ops Agent Email.dc.html` | Agent email template, three examples, light / dark / images-blocked |
| `Ops Agent Alternatives.dc.html` | Round 2: compact voice bar (V), show-or-say (6a–6c), alternatives 1a–5c with the chosen ones marked |
| `Ops Agent Side Panel.dc.html` | Round 3: side panel in context, empty states, replies at panel width, voice, history, expand, minimised, system states |

Where this spec and a design file disagree, **this spec wins**, because it records the decisions made across rounds. Every such conflict is listed in §16.2.

Read it in pieces. Each component section (§4) is complete by itself. Screen sections (§5–§11) reference components by their § number instead of repeating them.

---

## Table of contents

1. [How to read this spec](#1-how-to-read-this-spec)
2. [Tokens](#2-tokens)
   - 2.1 Colour · 2.2 Type · 2.3 Spacing, radius, border, shadow · 2.4 Motion · 2.5 Icons · 2.6 Z-order
3. [Rules that must not be broken](#3-rules-that-must-not-be-broken)
4. [Components](#4-components)
   - 4.1 Clearway ring mark and voice indicator (orb)
   - 4.2 Waveform
   - 4.3 Message: user bubble
   - 4.4 Message: agent reply shell
   - 4.5 Tool activity
   - 4.6 Streaming reply and Stop
   - 4.7 Source attribution
   - 4.8 Verbatim block and "Agent's reading"
   - 4.9 Flight card
   - 4.10 Airport summary
   - 4.11 Document result
   - 4.12 Generated file
   - 4.13 Table result
   - 4.14 Mono block (raw METAR / TAF / NOTAM)
   - 4.15 Confirmation prompt (three risk levels) and its records
   - 4.16 Error card
   - 4.17 Composer
   - 4.18 Attachments
   - 4.19 `@` mentions
   - 4.20 `/` commands
   - 4.21 Context chip
   - 4.22 Suggested questions
   - 4.23 Compact voice bar
   - 4.24 Voice overlay (large)
   - 4.25 Spoken reply (speaking states)
   - 4.26 Panel shell
   - 4.27 Buttons, pills, badges, keycaps
5. [Screen: sidebar entry](#5-screen-sidebar-entry)
6. [Screen: side panel](#6-screen-side-panel)
7. [Screen: full-page chat](#7-screen-full-page-chat)
8. [Screen: voice (bar, overlay, show-or-say)](#8-screen-voice)
9. [Screen: History](#9-screen-history)
10. [Screen: Knowledge base](#10-screen-knowledge-base)
11. [Screen: Activity log](#11-screen-activity-log)
12. [Screen: Agent settings](#12-screen-agent-settings)
13. [Email template](#13-email-template)
14. [Animation register](#14-animation-register)
15. [Keyboard register](#15-keyboard-register)
16. [Edges: ready, incomplete, not designed](#16-edges)

---

## 1. How to read this spec

- **`TOKEN MISSING`** — `shared/design-tokens.json` **does not exist in this project**. No token names can be cited. §2 proposes names for every value; add them to the token file and reference them, do not inline hex values. Every value in this spec gives the proposed token *and* the raw value.
- **`SOURCE UNKNOWN — developer to wire`** — the design shows the content but not where it comes from. Do not invent an endpoint.
- **`NOT IN DESIGN — spec default`** — the design does not specify this value (usually an easing curve). The value given is a default chosen for this spec so the developer is not left guessing; it is marked so it can be changed without anyone thinking it was a design decision.
- **`DECISION OPEN`** — the design shows options without choosing. Listed again in §16.
- Tool names in the designs (`flights.get`, `notam.status`, `wall.show`, …) are **display labels drawn for illustration**. The real tool registry is `SOURCE UNKNOWN`. The UI must display whatever name the backend reports.
- All sample content (callsigns, ICAOs, names, times) is illustrative. Every piece of it is dynamic unless marked *static copy*.
- Times are UTC and always shown with a `Z` suffix in IBM Plex Mono: `07:42Z`, `23 SEP 18:10Z`, `07:49:12Z` (seconds only on records of actions).

---

## 2. Tokens

### 2.1 Colour

`TOKEN MISSING` for every row. Proposed name → value.

**Neutrals**

| Proposed token | Hex | Used for |
|---|---|---|
| `color.ink` | `#17181c` | Primary text; verbatim frame; command chips; dark tooltips |
| `color.text.body` | `#3a3d44` | Body copy in cards, secondary values |
| `color.text.muted` | `#6c7079` | Descriptions, labels, meta |
| `color.text.faint` | `#9aa0a8` | Timestamps, section eyebrows, placeholders, hint text |
| `color.text.disabled` | `#b9bdc5` | Not-yet-spoken transcript, dim meta on dark |
| `color.border` | `#e6e7ea` | Card borders |
| `color.border.control` | `#d6d8dc` | Inputs, secondary buttons, composer, frames |
| `color.divider` | `#eef0f2` | Section dividers inside cards |
| `color.divider.row` | `#f2f3f5` | Row dividers in lists and tables |
| `color.page` | `#fbfbfc` | Page background; table header rows; card footers |
| `color.surface` | `#ffffff` | Cards, panel, composer |
| `color.sidebar` | `#f5f6f7` | Sidebar/rail background; mono block background; locked composer |
| `color.nav.active` | `#e9ebee` | Active sidebar item |
| `color.hover` | `#f0f1f3` | Ghost-button hover; icon tile neutral |
| `color.bubble.user` | `#eef0f3` | User message bubble |
| `color.disabled.fill` | `#c9cdd3` | Locked send button; queued step icon; "—" in permissions |

**Primary (blue) — actions, entities, the agent's own state**

| Proposed token | Hex | Used for |
|---|---|---|
| `color.primary` | `#2563eb` | Primary buttons, focus ring, live voice colour, streaming caret |
| `color.primary.hover` | `#1d4ed8` | Primary hover; blue text on tints |
| `color.primary.tint` | `#eef4ff` | Selected rows, context chip, active sub-nav |
| `color.primary.tint2` | `#dbeafe` | Entity chips, internal-tier badge background |
| `color.primary.tint3` | `#f2f7ff` | Confirmation header, drop zone, focused mention text |
| `color.primary.line` | `#dbe6ff` | Confirmation header divider, context chip border |
| `color.primary.border` | `#b9d0ff` | Suggested-question hover border, applied-row border |
| `color.primary.on-tint` | `#3a5170` | Secondary text on `#f2f7ff` |
| `color.send.empty` | `#b9c8ea` | Send button when the composer is empty |
| `color.primary.focus` | `rgba(37,99,235,.10)` | 3px focus halo on inputs |
| `color.primary.halo` | `rgba(37,99,235,.08)` | 4px halo on a pending confirmation |

**Source tiers** — see §3 rule 2. These three must never be swapped or merged.

| Tier | Proposed token | Text/icon | Tint bg | Underline (per-claim) | Footer strip segment |
|---|---|---|---|---|---|
| Internal system | `color.tier.internal.*` | `#1d4ed8` | `#dbeafe` | `#93b4f5` | `#2563eb` |
| Company knowledge | `color.tier.company.*` | `#6d28d9` | `#ede9fe` | `#c4b5fd` | `#7c3aed` |
| Web | `color.tier.web.*` | `#b45309` | `#fef3e2` | `#f3c77e` (claim bg `#fffaf0`) | `#d97706` |

**Status**

| Meaning | Proposed token | Text | Tint | Border | Icon/dot |
|---|---|---|---|---|---|
| Amber — delayed, CTOT, warning, pending approval | `color.status.warn.*` | `#b45309` | `#fef3e2` | `#f6ddb0` | `#f59e0b` |
| Amber callout text | `color.status.warn.strong` | `#92400e` | `#fef7e6` | `#f6ddb0` | — |
| Red — unreviewed NOTAM, error, destructive | `color.status.danger.*` | `#b91c1c` (strong) / `#e5484d` (badge) | `#fdecec` | `#f7cfd0` | `#e5484d` |
| Disabled destructive button | `color.danger.disabled` | fill `#f2a3a5` | — | — | — |
| Green — done, applied, checked, on wall | `color.status.ok.*` | `#15803d` | `#e7f6ec` | `#c7ead2` | `#16a34a` |
| Slate — scheduled, neutral state | `color.status.neutral.*` | `#475569` | `#eef1f5` | — | — |
| Sky — MVFR, airborne | `color.status.info.*` | `#0369a1` | `#e0f2fe` | — | — |
| Uncertain transcription | `color.voice.uncertain.*` | dotted underline `#d97706` | `#fef7e6` | — | — |
| Stop control | `color.stop.*` | `#c2703b` | `#fdf1e8` | `#f4d4b8` | square `#e0894f` |

**Dark surfaces** (wall context, email dark mode)

| Proposed token | Hex |
|---|---|
| `color.wall.bg` | `#0f1420` |
| `color.wall.row` | `#161d2c` |
| `color.wall.voicebar.bg` | `rgba(23,27,38,.96)` |
| `color.wall.voicebar.border` | `#3a4560` |
| `color.wall.accent` | `#6ea0ff` |
| `color.wall.text` | `#e8ecf4` |
| `color.wall.text.muted` | `#8c97ad` |
| `color.wall.uncertain` | `#f5c77a` |
| `color.email.footer` | `#0a1330` |

The canvas background `#e8e9ec` in the design files is presentation only. **Do not build it.**

### 2.2 Type

Families (`TOKEN MISSING`):

- `font.ui` = `'Public Sans', system-ui, sans-serif` — weights 400, 500, 600, 700, 800
- `font.mono` = `'IBM Plex Mono', monospace` — weights 400, 500, 600. In email: `'IBM Plex Mono', Consolas, 'Courier New', monospace`

**Mono rule (operational).** Use `font.mono` for anything read character by character: callsigns (`BTI472`), ICAO codes (`EGLL`), registrations (`YL-ABC`), times (`11:55Z`), deltas (`+15`), raw METAR/TAF/NOTAM, NOTAM IDs (`A2291/26`), limitation IDs in lists (`LIM-0412`), file names, keycaps, tool names and arguments, hashes, record IDs. **Why:** `0/O`, `1/l/I` and `5/S` are distinguishable only in the mono face, and a dispatcher misreading a callsign or registration acts on the wrong aircraft. Building these in Public Sans is a defect, not a style choice.

Scale (px / weight / line-height / letter-spacing). Line-height is `normal` unless given.

| Proposed token | Size | Weight | LH | LS | Used for |
|---|---|---|---|---|---|
| `type.page-title` | 26 | 800 | — | -0.02em | Page titles in panel context frames (Flights, Limitations) |
| `type.view-title` | 26 | 800 | — | -0.02em | History, Knowledge base, Activity log, Agent settings |
| `type.empty-title.full` | 24 | 800 | — | -0.02em | Full-page empty state headline |
| `type.empty-title.panel` | 19 | 800 | 1.3 | -0.01em | Panel empty state headline |
| `type.overlay-transcript` | 19 | 400 | 1.5 | — | Voice overlay transcript |
| `type.flight.icao.lg` | 22 | 600 mono | — | — | Flight card airports (full page) |
| `type.flight.icao.panel` | 17 | 600 mono | — | — | Flight card airports (panel) |
| `type.flight.callsign` | 18 | 600 mono | — | 0.02em | Flight card callsign (full page); 15 in panel |
| `type.thread-title` | 16 | 700 | — | — | Full-page header thread title |
| `type.verbatim` | 15.5 | 500 | 1.65 | — | Verbatim body, full page. 14 / 1.6 in panel |
| `type.body` | 15 | 400 | 1.6 | — | Agent prose (full page). User bubble 15 / 1.55 |
| `type.body.panel` | 14 | 400 | 1.55 | — | Agent prose and bubbles in the panel |
| `type.card-title` | 14 | 700 | — | — | Confirmation titles, card headings |
| `type.label` | 13.5 | 600 | — | — | Buttons (13–14), nav items (500), row labels |
| `type.small` | 13 | 400 | 1.5 | — | Card descriptions |
| `type.meta` | 12.5 | 400/600 | 1.5 | — | Chips, secondary info |
| `type.caption` | 12 | 400 | 1.5 | — | Hints, footnotes |
| `type.timestamp` | 11 | 400 mono | — | — | Message timestamps `DK · 07:42Z` |
| `type.eyebrow` | 11 | 700 | — | 0.12em uppercase | Section labels (`4 SOURCES`, `AGENT'S READING`) |
| `type.eyebrow.sm` | 10.5 | 700 | — | 0.10em uppercase | Eyebrows in the panel |
| `type.badge` | 11–12 | 600–700 | — | 0.04–0.08em | Status pills, tier badges |
| `type.verbatim-header` | 11.5 (10.5 panel) | 800 | — | 0.12em uppercase | `VERBATIM · APPROVED TEXT` |
| `type.sup` | 10 (9.5 panel) | 700 | — | — | Citation numbers |

Tabular figures: `NOT IN DESIGN — spec default`: set `font-variant-numeric: tabular-nums` on all mono time/delta columns so tables align. Plex Mono is monospaced already; this is for Public Sans numbers in counters.

### 2.3 Spacing, radius, border, shadow

`TOKEN MISSING`. The design uses these values consistently:

**Spacing (px):** 2, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22, 24, 28, 30, 32. Proposed scale: `space.1=4, space.1_5=6, space.2=8, space.2_5=10, space.3=12, space.3_5=14, space.4=16, space.4_5=18, space.5=20, space.6=24, space.7=28, space.8=32`. Odd values (5, 7, 9) appear only in chip padding and are listed where used.

**Radius:**

| Proposed token | Value | Used for |
|---|---|---|
| `radius.xs` | 4 | Citation numbers, small badges, mini doc tiles |
| `radius.sm` | 6 | Inline entity/command chips, small tags |
| `radius.md` | 7–8 | Small buttons, source chips, mention rows |
| `radius.control` | 9 | Standard buttons, nav items |
| `radius.lg` | 10 | Mono blocks, 36px icon buttons, panel cards |
| `radius.card` | 12 | Tool activity, tables, verbatim (panel 10), cards in panel |
| `radius.card.lg` | 14 | Flight card, confirmation, main cards (brief: 13–14) |
| `radius.composer` | 16 | Composer, bubbles |
| `radius.overlay` | 22 | Voice overlay card |
| `radius.pill` | 999 | Status pills, context chip, voice bar |

**Borders:** default `1px solid #e6e7ea`; controls `1px solid #d6d8dc`; verbatim `1.5px solid #17181c`; pending confirmation `1.5px solid #2563eb`; destructive `1.5px solid #e5484d`; ghost/pending row `1.5px dashed #2563eb`; cancelled/expired records `1px dashed #d6d8dc`; drop zone `2px dashed #2563eb`.

**Shadows:**

| Proposed token | Value |
|---|---|
| `shadow.frame` | `0 1px 2px rgba(16,18,22,.04), 0 24px 60px rgba(16,18,22,.08)` |
| `shadow.composer` | `0 1px 2px rgba(16,18,22,.04), 0 8px 24px rgba(16,18,22,.05)` |
| `shadow.menu` | `0 12px 34px rgba(16,18,22,.12)` (panel menus `0 12px 30px rgba(16,18,22,.14)`) |
| `shadow.voicebar` | `0 8px 24px rgba(16,18,22,.12)`; over a page `0 10px 30px rgba(16,18,22,.16)` |
| `shadow.overlay` | `0 24px 70px rgba(16,18,22,.3)` |
| `shadow.modal` | `0 24px 60px rgba(16,18,22,.35)`; light modal `0 16px 40px rgba(16,18,22,.2)` |
| `shadow.panel.overlay` | `-18px 0 40px rgba(16,18,22,.10)` |
| `shadow.panel.minimised` | `-4px 4px 14px rgba(16,18,22,.1)` |
| `shadow.focus` | `0 0 0 3px rgba(37,99,235,.1)` + border `#2563eb` |
| `shadow.pending` | `0 0 0 4px rgba(37,99,235,.08)` |
| `shadow.selected-row` | `inset 3px 0 0 #2563eb` (applied limitation row: `inset 4px 0 0 #2563eb`) |

### 2.4 Motion

`TOKEN MISSING`. The designs specify durations but **no easing curves**. Spec defaults (`NOT IN DESIGN — spec default`):

| Proposed token | Value | Use |
|---|---|---|
| `ease.out` | `cubic-bezier(0.2, 0, 0, 1)` | Anything entering |
| `ease.in` | `cubic-bezier(0.4, 0, 1, 1)` | Anything leaving |
| `ease.inout` | `ease-in-out` | Loops (the design uses `ease-in-out` for the shimmer) |
| `dur.fast` | 120 ms | Voice bar entrance (design value) |
| `dur.base` | 200 ms | Panel expand to full page (design value) |
| `dur.hover` | 120 ms | Hover colour transitions (spec default) |

The full list of animations is §14.

### 2.5 Icons

Lucide, static SVGs, version pinned in the designs at `lucide-static@0.454.0`, rendered as a CSS mask so they take `currentColor` or a set colour. Sizes used: 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 24 px. Every icon named in this spec is a Lucide name (`circle-check`, `shield-alert`, …).

### 2.6 Z-order

`NOT IN DESIGN — spec default`, derived from what overlaps what in the frames:

1. Page content
2. Side panel (overlay mode) and minimised tab
3. Compact voice bar and short-answer card
4. Menus (`@`, `/`), tooltips, uncertain-word popover
5. Full-view sheet (tables, PDFs)
6. Scrim + modal confirmation, voice overlay, command palette
7. Toasts

---

## 3. Rules that must not be broken

These carry operational meaning. Building them "close enough" produces a system dispatchers can be misled by.

1. **Verbatim is verbatim.** Text inside a verbatim block (§4.8) is the approved document's text, byte for byte: same words, same capitals (`AUTOLAND IS NOT PERMITTED`), same clause numbers, same line breaks. It is never summarised, reworded, truncated, translated, spell-corrected, auto-linked or reflowed into a different order, and the model never generates it: the client renders the stored clause from the authoritative tier by ID. If the clause text can't be fetched, show an error; never fall back to model text inside the frame. **If built wrong:** a paraphrase that loses "including gusts" or "manually by the Commander" reads as the approved limitation.
2. **The ink frame belongs to verbatim only.** `#17181c` filled headers and 1.5px ink borders are used by exactly one thing in the product: approved text. No other card may use a black header. **Why:** it is the at-a-glance signal, including across the room. A second black card teaches people to ignore it.
3. **Only the authoritative tier can render in the verbatim frame.** Reference-tier documents are cited (§4.7), never framed. A document awaiting approval (§10) is neither quotable nor framed; the agent says it "could not be quoted".
4. **Every factual reply carries attribution** (§4.7). A factual sentence with no source is marked as the agent's reasoning, never presented as fact.
5. **Tier colours are fixed.** Internal = blue, Company = violet, Web = amber. Web is amber so it never passes for company data. Do not theme them, do not reuse violet or amber for anything tier-like.
6. **Confirmations are real and blocking.** Nothing that changes data (wall, NOTAM Check, limitations, email) executes until the user confirms in the UI. The confirm request must be server-verified (a one-time confirmation token bound to the exact action and arguments shown). The UI must not be optimistic: show "applied" only after the tool returns success. **Double-fire:** the Confirm control disables on first activation and the request is idempotent on the token; a second click, a held Enter, or a network retry must not run the action twice.
7. **The composer is locked while a confirmation is pending** (§4.15). The user must answer it before sending anything else.
8. **Confirmations expire.** A pending prompt expires 5 minutes after it appears; nothing runs; the prompt is not reusable ("The wall may have changed since").
9. **Voice never confirms a change.** Confirmations are always shown and require a click/key. A spoken "yes" does nothing.
10. **Verbatim limitations are never read aloud.** The voice says "the limitation is on screen".
11. **Offline never queues writes.** Questions may queue; anything that changes data needs a fresh confirmation when back online.
12. **The agent never has more access than the person asking.** Every tool call runs as the requester. Permission errors say which role is missing.
13. **Nothing reaches the wall display without a confirmed action from a console.** The agent panel is never available on the wall display itself.
14. **Mono for codes** (§2.2).

---

## 4. Components

Each component section: purpose, anatomy with values, variants, states, copy, behaviour, animation. Screens reference these.

### 4.1 Clearway ring mark and voice indicator (orb)

**What it is.** The Clearway logo (a ring with a centre dot) rendered live on a \`<canvas>\`. It is the agent's avatar, the voice button content, and the voice overlay's centrepiece. **Why:** it reads as Clearway, not as a copied assistant. Idle, it *is* the logo.

**Where used and sizes**

| Use | Size | State |
|---|---|---|
| Agent message avatar | 26px (column 28px) | idle, **still** (no animation) |
| Composer voice button content | 22px inside a 36×36 button | idle (breathing) / live states while voice is active |
| Full-page empty state | 64px | idle |
| Streaming reply avatar | 26px | thinking |
| Voice overlay | 120px | all five states |
| Speaking transcript card | 30px | speaking |
| Mic permission / unavailable cards | 30px | idle still / error still |
| Panel header, sidebar, context chips | static CSS mark (not canvas): 18px circle, 2px \`#17181c\` border, 6px \`#17181c\` dot | — |

**Geometry (all states).** \`cx = size/2\`. Ring radius \`R = size × 0.33\`. Stroke width \`w = max(1.6, size × 0.075)\`, round caps. Dot base radius \`d = R × 0.36\`. Render at \`devicePixelRatio\`.

**Colour by state.** idle \`#17181c\` at alpha 0.9; listening / thinking / speaking \`#2563eb\`; error \`#e5484d\`.

**Glow.** Only when \`size > 40\` and state ≠ idle: radial gradient from \`R × 0.4\` to \`size/2\`, inner stop = state colour at alpha \`0.10 + level × 0.14\`, outer stop alpha 0, filling the canvas.

**Level.** \`level\` is smoothed each frame: \`level += (target − level) × 0.18\`. In production \`target\` is the **mic input RMS normalised 0–1** (listening) or **TTS output amplitude 0–1** (speaking). The design simulates it with sines; do not ship the sines.

**States**

| State | Ring | Dot | Extras |
|---|---|---|---|
| **Idle** | Full circle, alpha 0.9 | \`d × (1 + 0.04 × sin(1.3t))\` — 4% breathing, period ≈ 4.8 s | Avatar use: **still**, no breathing |
| **Listening** | Deformed circle, 90 segments: \`r = R + R × level × 0.16 × (0.6·sin(3a + 2.4t) + 0.4·sin(5a − 3.3t))\` | \`d × (0.85 + level × 0.55)\` | Glow. Silence (level→0) visibly flattens the ring to a circle and shrinks the dot |
| **Thinking** | Track: full circle at alpha 0.16. Arc: starts at angle \`3.2t\` rad, length \`π × (0.55 + 0.25·sin(1.6t))\` | \`d × (0.8 + 0.12·sin(4t))\` | Glow. Always paired with the step list (§4.5); never alone |
| **Speaking** | Circle with slight wobble \`r = R + R × level × 0.05 × sin(2a + 4t)\` | \`d × (0.9 + level × 0.35)\` | 3 rings released outward: phase \`p = (0.55t + i/3) mod 1\`, radius \`R + p × size × 0.16\`, alpha \`(1 − p) × 0.28\`, width \`w × 0.45\`. A Stop control is always beside it |
| **Error** | Arc with a gap at 12 o'clock: from \`−π/2 + 0.55\` to \`−π/2 − 0.55 + 2π\` | Full dot, no scaling | **Still. No animation at all.** Why: motion means work; a moving error could be mistaken for progress |

\`t\` = seconds since mount; \`a\` = angle around the ring.

**Reduced motion.** Render a single still frame of each state (level = 0.5 for listening/speaking, arc fixed at 0 → 0.7π for thinking). Keep the colour change; it carries the state.

### 4.2 Waveform

**What it is.** The compact level meter in the voice bar and speaking cards. Genuinely small; it replaces the orb in compact contexts.

| Variant | Size | Bars | Colour |
|---|---|---|---|
| Voice bar (light) | 56 × 18 | 10 | \`#2563eb\` |
| Voice bar over wall | 48 × 16 | 10 | \`#6ea0ff\` |
| Speaking card | 40 × 16 | 7 | \`#2563eb\` |
| Speaking card, short | 32 × 14 | 6 | \`#2563eb\` |
| Panel composer (static drawing) | 10 bars, 3px wide, gap 2px, heights \`6,11,15,9,13,16,8,12,5,10\` px | 10 | \`#2563eb\` |

Bar gap 2px; bar width \`(w − 2 × (bars − 1)) / bars\`; fully rounded ends (radius = half width); vertically centred; minimum height 2px. Per-bar smoothing \`level += (target − level) × 0.25\` per frame.

| Mode | Target per bar |
|---|---|
| Invoked (idle) | 0.12 constant — flat dots until sound arrives |
| Listening | mic level per frequency band (production). Design sim: \`0.2 + 0.8·|sin(6t + 0.9i)·sin(2.3t + 0.4i)|\` |
| Low / uncertain | same source, visually quieter; sim \`0.15 + 0.35·|sin(4t + 1.1i)|\` |
| Speaking | TTS output level; sim \`0.25 + 0.6·|sin(5t + 0.6i)|·(0.5 + 0.5·sin 1.7t)\` |

**Reduced motion.** Static bars at the current level, updated at most 4 times per second, no smoothing tween.

### 4.3 Message: user bubble

- Row: right-aligned column, \`gap 5px\` between bubble and timestamp.
- Bubble: \`background #eef0f3\`; radius \`16px 16px 4px 16px\` (panel \`14px 14px 4px 14px\`); padding \`11px 15px\` (panel \`8–9px 12–13px\`); \`max-width 560px\` (panel 320–330px); text 15/1.55 \`#17181c\` (panel 14px).
- Timestamp under it: mono 11 \`#9aa0a8\`: \`{initials} · {HH:MM}Z\` e.g. \`DK · 07:42Z\`. *Panel: timestamps are not drawn* — \`DECISION OPEN\`, spec default: show on hover only.
- Inline chips inside the bubble: entity chips §4.19, command chips §4.20.
- Voice-originated message: prefixed with a 13px \`mic\` icon \`#9aa0a8\`, 7px gap (Ops Agent D3).
- **Content source:** the user's sent text with mention/command tokens resolved to entity IDs.
- **States:** default only. Sending/failed-to-send states are **not drawn** (§16).

### 4.4 Message: agent reply shell

- Row: \`display:flex; gap:14px\`. Left: 28px column with the avatar (§4.1, 26px, idle still; thinking while working). Right: content column, \`gap 14px\` between blocks (panel 10–12px).
- Header line: \`Ops Agent\` 13.5/700 \`#17181c\` + timestamp mono 11 \`#9aa0a8\`, \`gap 10px\`, baseline aligned. In the panel the header line is omitted.
- Block order inside a reply (as drawn): tool activity (§4.5) → prose → rich cards (§4.9–4.14) → verbatim (§4.8) → "Agent's reading" → sources (§4.7). Confirmation (§4.15) is the whole reply when the agent needs one.
- Thread column: \`max-width 800px\`, centred, gap between messages \`30px\`. Panel: 14px padding, gap 12–14px.

### 4.5 Tool activity

**Purpose.** Shows what the agent is doing while it works and what it did afterwards. Not a spinner: a record.

**A. Live step list (while working)** — Ops Agent B2

- Container: white, \`1px #e6e7ea\`, radius 12, padding \`6px 0\`.
- Row: flex, \`gap 10px\`, padding \`6px 14px\`; icon 14px; label 13.5; right: mono 11.5 \`#9aa0a8\` elapsed.

| Step state | Icon | Icon colour | Label colour / weight | Right text |
|---|---|---|---|---|
| Done | \`circle-check\` | \`#16a34a\` | \`#6c7079\` / 500 | \`0.4 s\` |
| Running | \`loader-circle\` | \`#2563eb\`, pulsing (§14 A7) | \`#17181c\` / 600, ends with \`…\` | elapsed, live |
| Queued | \`circle\` | \`#c9cdd3\` | \`#9aa0a8\` / 500 | \`queued\` |
| Cancelled | **not drawn** — spec default: \`circle-slash\` \`#9aa0a8\`, label struck through, right \`cancelled\` |

Example copy (dynamic, from the tool's own description): \`Found 7 departures before 09:00Z\`, \`Checked NOTAMs for EVRA, ESSA, LFPG, EGLL, EDDF\`, \`Searching limitations for YL-PVA…\`, \`Fetch TAFs for 5 airports\`.

Steps appear in the order the backend starts them. **Content source:** tool-call events streamed from the agent runtime — \`SOURCE UNKNOWN — developer to wire\`.

**B. Completed summary, collapsible** — Ops Agent A thread, first reply

- Container: white, \`1px #e6e7ea\`, radius 12, overflow hidden.
- Header is a full-width \`<button>\`: padding \`10px 14px\`, gap 10; \`circle-check\` 15 \`#16a34a\`; text 13.5/600: \`Used {n} tools\` + \` · read only · {s} s\` in 500 \`#9aa0a8\`; chevron 15 \`#9aa0a8\` (\`chevron-down\` collapsed / \`chevron-up\` expanded). Hover: background \`#fbfbfc\`.
- \`read only\` appears when no tool wrote data. For a reply that wrote data the summary is replaced by the applied-changes record (§4.15 D).
- Expanded body: top border \`1px #eef0f2\`; rows are a grid \`20px 170px minmax(0,1fr) auto\`, gap 10, padding \`9px 14px\`, bottom border \`#f2f3f5\`:
  - \`eye\` icon 14 \`#9aa0a8\` (read tool)
  - tool name mono 12.5/600 \`#17181c\` e.g. \`flights.get\`
  - arguments: mono 12 \`#6c7079\`, single line, ellipsis, e.g. \`{"callsign":"BTI472","date":"2026-09-23"}\`; below it the result 12.5 \`#3a3d44\` e.g. \`1 flight · Leon · CTOT 11:52Z\`
  - duration mono 11.5 \`#9aa0a8\` e.g. \`312 ms\`
- **Default:** \`DECISION OPEN\`. The design draws it expanded. Spec default: **collapsed** once the reply finishes; expanded while live (as list A); user's toggle persists per message.
- **Keyboard:** header is focusable; Enter/Space toggles; \`aria-expanded\`.

**C. One-line summary** — used for replies with 1–2 tools

\`circle-check\` 14 \`#16a34a\`, 13px \`#6c7079\` label, then mono 12 \`#9aa0a8\` tool names + time: \`Used 2 tools  aip.get · file.generate_pdf · 3.1 s\`, or \`Fetched TAF EGLL  weather.taf · 410 ms\`. Clicking it: \`NOT IN DESIGN\`; spec default: expands to list B.

**Write tools** in list B: icon not drawn. Spec default: \`pencil\` 14 \`#1d4ed8\`.

### 4.6 Streaming reply and Stop

- Text streams token by token into the prose block.
- **Caret** at the insertion point: block 8×17 \`#2563eb\` (panel 7×15), \`margin-left 2px\`, \`vertical-align -3px\`, blinking (§14 A6).
- **Stop button**, under the streaming block, left-aligned: 13.5/600 \`#c2703b\`, bg \`#fdf1e8\`, border \`1px #f4d4b8\`, padding \`8px 14px\`, radius 9, gap 8; leading 10×10 square radius 2 \`#e0894f\`; trailing keycap \`Esc\` mono 11 at 70% opacity. Copy: \`Stop\` + \`Esc\`. Panel variant: 12.5px, padding \`5px 10px\`, radius 8, label \`Stop · Esc\`.
- **Esc** stops while streaming (unless a menu is open — the menu closes first).
- **Stopped state:** caret and Stop disappear; a row appears under the partial text: top border \`1px dashed #d6d8dc\`, padding-top 10, gap 10; \`square\` 14 \`#9aa0a8\`; 13px \`#6c7079\` text; right button \`Continue\` (secondary small, §4.27).
  - Copy: \`Stopped by you at {HH:MM:SS}Z. Partial reply kept; {n} tools finished, {m} was cancelled before it ran.\`
- **Behaviour:** Stop cancels queued tool calls that haven't started. **A write that has already been confirmed and is running is not cancelled by Stop** — it completes and its record is shown (spec rule; not drawn). Continue resumes generation from the partial reply.

### 4.7 Source attribution

**Chosen treatment: per-claim citation (Alternatives 3c, marked RECOMMENDED).** 3a (inline tier glyph) and 3b (footer strip) are not to be built. The side-panel narrow variant uses a footer strip visual *in addition* (see C below).

**A. In the prose**

- Each claim that came from a source is wrapped: \`border-bottom: 2px solid {tier underline}\` (Internal \`#93b4f5\`, Company \`#c4b5fd\`, Web \`#f3c77e\` **plus** background \`#fffaf0\`). Line-height of the prose rises to 1.8 (full) so the underline clears descenders.
- Immediately after the claim: superscript number, 10px/700 in the tier text colour (\`#1d4ed8\` / \`#6d28d9\` / \`#b45309\`), \`margin-left 1px\`. (Round-1 thread draws the number on a tinted 4px-radius pill \`padding 0 4px\` — superseded by 3c; see §16 conflicts.)
- **Hover a claim** → its row in the list highlights; **hover a row** → its claim(s) highlight. Highlight colour drawn only for Web (\`#fffaf0\`); spec default for the others: the tier tint (\`#dbeafe\`, \`#ede9fe\`).
- **Sentence with no source:** no underline. Hover shows tooltip \`agent's reasoning\` (copy from 3c). Visual for a reply with *no* source at all: the note in Ops Agent A says it carries \`No source · agent's reasoning\`; its appearance is **not drawn** — spec default: an eyebrow-style label in the sources slot, \`#9aa0a8\`, no chip.

**B. Source list under the reply**

- Eyebrow: \`{n} SOURCES\` (or \`SOURCE\` for one) 11/700/0.12em \`#9aa0a8\`; panel 10.5/0.1em.
- Separator: \`border-top 1px #eef0f2\`, padding-top 12px (panel 8–9px).
- **Several sources — chip row** (full page): wrap, gap 6. Chip: white, \`1px #e6e7ea\`, radius 8, padding \`5px 9px 5px 5px\`, 12.5 \`#3a3d44\`, gap 7. Contents: number badge (10.5/700, tier text on tier tint, radius 4, min 18×18) · tier icon 13 in tier colour · tier name 600 in tier colour · source name · \`arrow-up-right\` 12 \`#9aa0a8\` when a link exists. Clickable when linked; opens the source document (AIP page, limitation, NOTAM Check, external URL in a new tab for Web).
- **One source:** eyebrow \`SOURCE\` inline to the left of a single chip; no number badge; chip padding \`5px 9px\`.
- **3c list rows** (Alternatives, used where the list is vertical): row padding \`6px 8px\`, radius 7, 12.5px, gap 8; number badge; tier name 700; name ellipsised.

| Tier | Icon | Tier label | Name examples | Must also show |
|---|---|---|---|---|
| Internal | \`database\` | \`Internal\` | \`Leon flights · BTI472\`, \`NOTAM Check · EGLL\`, \`Digital Wall · NOTAM Check, live\` | sync time or \`live\` |
| Company | \`book-open\` | \`Company\` | \`Limitations register · LIM-0412 rev 3\` | document ID and revision |
| Web | \`globe\` | \`Web\` | \`aviationweather.gov · retrieved 07:44Z\` | domain + retrieval time |

**C. Panel width (400px)** — Side Panel B7 and C4

- 4px tall strip, radius 2, one equal segment per source in its footer-strip colour (\`#2563eb\` / \`#7c3aed\` / \`#d97706\`), \`margin-bottom 4px\`.
- Then one line per source: number badge 16×16 · tier icon 11 · \`{Tier} · {name}\` 12px, ellipsis, gap 7, row gap 3.
- Panel single-line chips (A1, A2): 11.5px, \`1px #e6e7ea\`, radius 6, padding \`3px 7px\`, gap 5, preceded by \`SOURCES\` eyebrow 10.5.

**Content source:** citation spans and source metadata returned with the reply — \`SOURCE UNKNOWN — developer to wire\`. The model must return claim boundaries; if it doesn't, the per-claim underline cannot be built. Flagged in §16.

### 4.8 Verbatim block and "Agent's reading"

**Chosen treatment: ink frame (Alternatives 4a, RECOMMENDED).** 4b (page excerpt) and 4c (two columns) are not to be built. Read §3 rules 1–3 first.

**Full-page anatomy** (Ops Agent A)

| Part | Values |
|---|---|
| Frame | \`border 1.5px solid #17181c\`, radius 12, white, overflow hidden |
| Header | bg \`#17181c\`, padding \`9px 14px\`, flex gap 10: \`stamp\` icon 15 white · \`VERBATIM · APPROVED TEXT\` 11.5/800/0.12em white · \`Reproduced exactly. Not summarised.\` 12 \`#b9bdc5\` · spacer · \`{LIM-ID} · rev {n}\` mono 11.5 \`#b9bdc5\` |
| Body | padding \`16px 18px 14px\`, column gap 10 |
| Title | 12.5/700 \`#3a3d44\`, e.g. \`YL-ABC · A220-300 · Landing crosswind — contaminated and wet runways\` |
| Text | 15.5/1.65, weight 500, \`#17181c\`, \`white-space: pre-wrap\` (preserves source line breaks and clause numbers) |
| Footer | \`border-top 1px dashed #d6d8dc\`, padding-top 10, flex wrap gap 14: \`Approved {DD Mon YYYY} by {Name}, {Role} · authoritative tier\` 12 \`#6c7079\` (name 600 \`#3a3d44\`) · \`sha256 {first4}…{last4}\` mono 11 \`#9aa0a8\` · spacer · buttons \`Copy exact text\` (\`copy\` 13) and \`Open source · p. {n}\` (\`file-text\` 13) |
| Buttons | 12.5/600 \`#17181c\`, white, \`1px #d6d8dc\`, padding \`6px 10px\`, radius 7, gap 6 |

**Panel anatomy (≤ 420px)** — Side Panel B7, C4. Frame radius 10. Header **stacks**: line 1 \`VERBATIM · APPROVED TEXT\` 10.5/800; line 2 \`LIM-0412 rev 3 · §3.3\` mono 10.5 \`#b9bdc5\`; padding \`7px 11px\`. Body padding \`10px 11px\`, 14/1.6/500. Footer padding \`8px 11px\`, column: \`Approved 02 Sep 2026 · N. Ozola\` 11.5 \`#6c7079\`, then buttons \`Copy exact\` and \`Open p. 3\` (12px, padding \`4–5px 8–9px\`, radius 6–7). **The frame keeps every element at narrow widths. It never collapses, truncates or goes behind a "show more".** If the clause is long the panel scrolls.

**Behaviour**

- \`Copy exact text\` copies the stored clause string exactly (including line breaks). Toast/confirmation for copy: **not drawn**; spec default: button label changes to \`Copied\` for 1500 ms.
- \`Open source · p. 3\` opens the source PDF at that page (full page: new view; panel: full-view sheet beside the panel).
- Text is selectable, not editable.
- In the email (§13) the frame is rendered with tables; same header copy with the reference appended.
- Voice: never read aloud (§3 rule 10). In "both at once" it carries the header \`VERBATIM · LIM-0412 · NOT READ ALOUD\`.

**"Agent's reading"** — the synthesised text next to a quote

- Only when prose sits next to a verbatim block. Eyebrow \`AGENT'S READING — CHECK AGAINST THE QUOTED TEXT\` (full page; 11/700/0.12em \`#9aa0a8\`, leading \`pen-line\` 12 \`#9aa0a8\`, gap 7). Panel/short form: \`AGENT'S READING\` 10.5/700/0.1em.
- Prose: 15/1.6 \`#3a3d44\` (muted, **not** ink). Panel 14/1.55.
- **Why two different colours:** agent prose is deliberately quieter than the quote so the eye lands on the approved words.

**Content source:** clause text and metadata from the authoritative tier of the knowledge base (§10) — \`SOURCE UNKNOWN — developer to wire\`.

### 4.9 Flight card

**Chosen density:** \`DECISION OPEN\` between 2a (dense grouped card) and 2b (spacious lead + supporting). The designs use the individual spacious card on the full page (Ops Agent A) and a compressed version of it in the panel (Side Panel A1, C1). Build both variants below; see §16.

**Spacious — full page** (Ops Agent A)

| Region | Values |
|---|---|
| Card | white, \`1px #e6e7ea\`, radius 14, overflow hidden |
| Header | padding \`14px 18px\`, bottom border \`#eef0f2\`, gap 12: callsign mono 18/600/0.02em · \`{operator} · {registration mono 12.5 #3a3d44} · {type}\` 13.5 \`#6c7079\` · spacer · status pills |
| Route row | grid \`1fr 60px 1fr\`, gap 12, padding \`16px 18px\`, align centre |
| Origin (left) / Destination (right-aligned) | ICAO mono 22/600 · city 12.5 \`#6c7079\`, margin-bottom 8 · times row mono 12.5 gap 16: \`STD 11:40Z\` \`ETD 11:55Z +15\` (labels \`#9aa0a8\`, delta \`#b45309\` 600) |
| Connector | 1px \`#d6d8dc\` line with a \`plane\` icon 16 \`#9aa0a8\` centred on it |
| Footer | bg \`#fbfbfc\`, top border \`#eef0f2\`, padding \`11px 18px\`, gap 8, wrap: marker pills · spacer · \`Open in Flights\` (secondary small) |

Status pills (12/600, padding \`4px 10px\`, radius 999): \`Delayed · CTOT\` amber · \`On wall\` green. Marker pills: \`CTOT 11:52Z\` amber (time mono) · \`NOTAM unreviewed · EGLL\` red 700 · \`1 limitation\` amber.

Delta colour: positive delay \`#b45309\`; on time — not drawn, spec default \`#9aa0a8\` \`—\` (matches the Flights table \`—\`).

**Panel — 372px content width** (Side Panel A1, C1)

- Radius 12. Header padding \`10px 12px\`: callsign mono 15/600 · \`{operator} · {reg} · {type}\` 12 \`#6c7079\` ellipsis · delta pill (\`+40\`) or \`CTOT\` pill 11.5/600 padding \`3px 8px\`.
- Route: grid \`1fr auto 1fr\` (or \`1fr 24px 1fr\`), gap 6–8, padding \`10px 12px\`; ICAO mono 17/600; times mono 11.5 in the compact form \`12:35Z → 13:15Z\` (new time amber 600) or \`ETD 11:55Z +15\`. Connector: \`arrow-right\` 14 \`#9aa0a8\` or a 1px line.
- Footer: bg \`#fbfbfc\`, padding \`8px 12px\`, tags 11/700 padding \`2–3px 7–8px\` radius 5 or 999: \`CTOT 13:14Z\`, \`INBOUND LATE\` (slate), \`NOTAM · EGLL\`, \`1 limitation\`, \`Late inbound\`, \`NOTAM checked\` (green).
- No "Open in Flights" button in the panel (the page is behind it). Clicking the card: \`NOT IN DESIGN\`; spec default: selects the flight on the page behind if it's the Flights page, otherwise opens it.

**Dense row — 2a** (one grouped card for several results)

- Card radius 12. Each row: grid \`24px 76px minmax(0,1fr) auto\`, gap 10, padding \`9px 12px\`, row divider \`#f2f3f5\`.
- Flight row: \`plane\` 14 \`#6c7079\` · \`BTI472\` mono 13/600 · \`EVRA 11:55Z +15 → EGLL 13:22Z +12 · YL-ABC\` mono 12 \`#3a3d44\` ellipsis (deltas amber) · tags 10.5/700 radius 4 padding \`2px 6px\`: \`CTOT\` amber, \`NOTAM\` red, \`LIM\` amber.
- Airport row: \`map-pin\` · \`EGLL\` · raw METAR + \`· 38 NOTAM\` · \`MVFR\` sky, \`4 NEW\` red.
- Document row: \`file-text\` 14 \`#e5484d\` · \`AD 2\` 12/700 \`#6c7079\` · file name + AIRAC + size · \`Download · Email\` links 11.5/600 \`#1d4ed8\`.
- Click a row → expands to the spacious card inline (Alternatives 2a note). Raw METAR is shown, not decoded ("dispatchers read it faster").

**Several in one reply**

- Spacious (2b): the subject gets the full card; related results sit in a 2-column grid (gap 10) of half-weight cards (radius 14, padding \`14px 16px\`). More than three supporting cards → \`+N more\` under the grid.
- Panel: flight cards stack; after two, the rest collapse into one list \`+{n} more flights\` (Side Panel draft note; copy not finalised — spec default \`+3 more flights\`).

**Content source:** Leon flight data (callsign, operator, reg, type, STD/ETD/STA/ETA, CTOT), NOTAM Check status, limitations register, wall state — \`SOURCE UNKNOWN — developer to wire\`.

### 4.10 Airport summary

**Full page** (Ops Agent A): white card radius 14, padding \`16px 18px\`, grid \`1.3fr 1fr 1fr\`, gap 20.

| Column | Contents |
|---|---|
| Weather | eyebrow \`ARRIVAL · WEATHER 07:20Z\` · \`EGLL\` mono 16/600 + flight category badge 11/700 radius 6 padding \`3px 8px\` (\`MVFR\` sky \`#0369a1\`/\`#e0f2fe\`; \`VFR\` green \`#15803d\`/\`#e7f6ec\`) · decoded line 13.5/1.55 \`#3a3d44\` with values in mono: \`Wind 240° 14G26 kt · vis 10 km+ · broken 1,400 ft · 12/09 · Q1009\` |
| NOTAM | eyebrow \`NOTAM\` · count 22/800 \`38\` + \`active\` 13/500 \`#6c7079\` · \`4 new since last check\` 13/600 \`#e5484d\` |
| CAA contact | eyebrow \`CAA CONTACT\` · \`UK CAA · Airspace & ATM\` 13.5/600 · phone mono 12.5 \`#3a3d44\` · email 12.5 \`#2563eb\` (mailto link) |

**Panel** (Side Panel C1 draft / A2): radius 12. Header: ICAO mono 14–15/600 · name 12 \`#6c7079\` · category badge 10.5. Then label rows grid \`78px 1fr\`: \`Weather\` raw METAR mono · \`NOTAM\` \`38 active · 4 new\` red 600 · \`CAA\` \`UK CAA · +44 330 022 1500\`. A2 compact form: METAR line mono 12 + \`17 NOTAM · 2 new · CAA Latvia +371 6783 0936\` 12 \`#6c7079\`, right \`METAR 0750Z\` 11.5.

**Why raw in the panel, decoded on the page:** the page has room for both; in the panel raw is shorter and is what dispatchers scan.

**Content source:** METAR/TAF provider, NOTAM Check, CAA contacts (Console CAA Details) — \`SOURCE UNKNOWN — developer to wire\`.

### 4.11 Document result

**Full page** (Ops Agent A): white card radius 14, padding \`14px 16px\`, flex gap 14, align centre.

- PDF tile 44×54, radius 7, bg \`#fdecec\`, border \`1px #f7cfd0\`, label \`PDF\` 10/800/0.04em \`#e5484d\` bottom-centred (padding-bottom 7).
- Title: file name mono 14/600, e.g. \`EV_AD_2_EVRA_en.pdf\`. Meta 13 \`#6c7079\`: \`AIP Latvia · AD 2 EVRA Riga · AIRAC 2610 effective 01 Oct 2026 · 34 pages · 2.8 MB\` (AIRAC number mono).
- Actions, gap 6: \`Download\` (primary small), \`Open\`, \`Email\` (secondary small).

**Panel** (Side Panel B6): radius 12, padding 12, column gap 10. Tile 34×42 radius 5; title mono 13/600; meta 12 \`AIP Latvia · AIRAC 2610 · 34 pp · 2.8 MB\`. Actions in a 3-column grid, gap 6, each centred 12.5/600 padding \`7px 0\` (primary) / \`6px 0\` (secondary), radius 8. Very narrow (Alternatives 1b, 340px): icon buttons 26×26 radius 6, \`download\` on primary, \`mail\` on secondary.

**Behaviour.** Download → file download. Open → PDF viewer (full page: document view; panel: full-view sheet beside the panel, "not in a new tab"). Email → starts an \`/email\` flow that ends in a confirmation (§4.15). **Stale source** (EAD down): the card must be marked stale — visual **not drawn** beyond the error card (§4.16); spec default: an amber \`Cached · {date}\` pill in the meta line.

**Content source:** AIP Portal / EAD sync — \`SOURCE UNKNOWN — developer to wire\`.

### 4.12 Generated file

Ops Agent A, reply 5. White card radius 14, overflow hidden, flex.

- Left preview pane: 132px, bg \`#f5f6f7\`, right border \`#eef0f2\`, padding 14, centred. Thumbnail 84×110, white, \`1px #e6e7ea\`, radius 4, shadow \`0 2px 6px rgba(16,18,22,.06)\`. Production: render page 1 of the actual file; the design's grey bars are placeholders.
- Right: padding \`14px 16px\`, column gap 8. Eyebrow \`GENERATED FILE\` 11/700/0.12em \`#16a34a\` + mono 11.5 \`#9aa0a8\` \`07:51Z · 1 page · 212 KB\`. Name mono 14/600 \`BTI472_crew_brief_23SEP.pdf\`. Contents summary 13/1.5 \`#6c7079\` (dynamic, from the generator), e.g. \`Flight and times · EGLL TAF raw + decoded · 4 unreviewed NOTAMs → now checked · LIM-0412 quoted verbatim, not summarised.\`
- Actions: \`Download\` (primary), \`Preview\`, \`Send…\` (secondary). \`Send…\` opens the email confirmation.
- **Rule:** a generated document that includes a limitation must include it verbatim, from the authoritative tier, never summarised — and the summary line must say so.

### 4.13 Table result

**Full page** (Ops Agent A, reply 3): white, radius 12, overflow hidden.

- Header row: grid of the column template, padding \`9px 14px\`, bg \`#fbfbfc\`, bottom \`#eef0f2\`; headers 11/700/0.06em \`#9aa0a8\` uppercase.
- Rows: padding \`11px 14px\`, bottom \`#f2f3f5\`, 13.5px, align centre. Codes/times mono; counts as red pills \`{n} new\` 12/700 padding \`3px 9px\` radius 999; "last checked" mono 12.5 \`#6c7079\`.
- Example template (unreviewed NOTAMs): \`1fr 1.3fr .8fr .8fr .9fr 1fr\` with \`FLIGHT · ROUTE · ETD · AIRPORT · NOTAMS · LAST CHECKED\`.
- Footer: padding \`9px 14px\`, gap 8: \`Open NOTAM Check\` (secondary small) · \`Export CSV\` (ghost small).

**Panel — reflow, never scroll sideways** (Side Panel B5). **Why:** horizontal scroll in a 372px column hides the column people came for.

- Header bar: bg \`#fbfbfc\`, padding \`8px 12px\`: \`{n} flights · sorted by ETD\` 12/700 · \`maximize-2\` 12 + \`Full view\` 12/600 \`#1d4ed8\`.
- Each row becomes two lines, padding \`9px 12px\`, gap 3: line 1 = key (mono 13.5/600) + the value that answered the question (mono 12) + the count pill (11/700, \`{n} new\`); line 2 = the remaining columns as one mono 11.5 \`#6c7079\` string: \`ETD 11:55Z · EGLL · last checked 22 SEP\`.
- **Up to 4 rows inline.** Footer 12 \`#6c7079\`: \`+{n} more · Show all · Filter the Flights page to these\` (links 600 \`#1d4ed8\`).
- Over 4 rows **or** over 5 columns → the rest goes to **Full view**: a wide sheet over the page (drawn size in the round-3 draft: 900px; spec default 900px, full height, left of the panel) with the full-page table.
- When the page behind can show the result, the agent offers to filter it instead (\`Filter the Flights page to these\`).

**Command palette variant** (1c): collapsed chip \`table-2\` 13 + \`3 affected flights\`; \`⏎\` shows them.

### 4.14 Mono block (raw METAR / TAF / NOTAM)

- Container: bg \`#f5f6f7\`, \`1px #e6e7ea\`, radius 10 (panel 9–10), overflow hidden.
- Header bar: padding \`7px 12px\` (panel \`6px 10px\`), bottom border \`#e6e7ea\`, gap 8–10: label 11/700/0.1em \`#6c7079\` (\`TAF · RAW\`, \`NOTAM · RAW · 2\`, \`METAR · TAF · RAW\`) · meta mono 11.5 \`#9aa0a8\` (\`issued 230459Z · valid 2306/2412\`) · spacer · actions: \`Copy\` (\`copy\` 13, 12/600 \`#3a3d44\`, ghost), panel adds \`Wrap\` toggle and \`Show on page ↖\` (\`#1d4ed8\`).
- Body: mono 13.5/1.75 (panel 12/1.65–1.7), padding \`12px 14px\` (panel \`9px 10px\`).

**Wrapping — this is the rule that matters.** Raw aviation text must not reflow in a way that changes how it reads.

- **Full page:** \`white-space: pre\`. No wrapping; horizontal scroll if needed. Continuation lines as in the source (two-space indent for TEMPO/PROB/BECMG).
- **Panel:** wrap **only at spaces**, never inside a group (\`word-break: normal; overflow-wrap: normal\`), hanging indent (\`padding-left 22px; text-indent -12px\`) so each report still starts at the margin. Where the panel wrapped a line, a grey \`↳\` (\`#9aa0a8\`) marks the continuation. Multiple NOTAMs are separated by a \`—\` line in \`#9aa0a8\`.
- **Copy** always copies the **original source string** with its original line breaks — never the wrapped rendering, never the \`↳\` markers.
- **Wrap toggle (panel):** off = \`white-space: pre\` + horizontal scroll, for comparing columns.
- **Show on page ↖** (panel, airport page behind): scrolls the page to that NOTAM and highlights it. Highlight style **not drawn**; spec default: row bg \`#eef4ff\` + \`inset 3px 0 0 #2563eb\` for 3000 ms.

Example (verbatim sample from the design):

\`\`\`
TAF EGLL 230459Z 2306/2412 24012KT 9999 BKN014
  TEMPO 2309/2315 24016G28KT 6000 -SHRA BKN009
  PROB30 2312/2316 7000 SHRA BKN012CB
  BECMG 2318/2321 22008KT
\`\`\`

**Content source:** raw weather/NOTAM text as received — \`SOURCE UNKNOWN — developer to wire\`. The client must display the received string; the model may not rewrite it.

---

### 4.15 Confirmation prompt (three risk levels) and its records

**Purpose.** The safety mechanism. Shown before any action that changes data: what will change, on what, and Confirm / Cancel. Read §3 rules 6–9 first.

**Which prompt when** (Alternatives 5, "Suggested combination", plus round 1):

| Risk | Examples | Where from | Prompt |
|---|---|---|---|
| **Low** — reversible display setting | wall timeline zoom 3 h → 4 h | thread / panel | **5a inline, one key** (A below) |
| **Standard write** — data change, email | mark NOTAM checked, put flight on wall, create limitation, send email | thread / panel | **Standard card** (B below — round 1, Ops Agent A/B4; Side Panel A3) |
| **Destructive** — cannot be undone | delete a limitation | thread / panel | **5c pinned bar, hold-to-confirm 2 s** (C below) |
| Any level | — | voice bar or ⌘K (no thread exists) | **5b modal**, same risk styling as the level (E below) |

What separates the levels in every variant: **colour** (blue vs red), **verb** (\`Apply\` / \`Confirm and send\` vs \`Delete permanently\`), **consequences listed**, and **a second deliberate action only for destructive** (hold 2 s, or type the ID in the modal). **Why:** they must not feel the same; a dispatcher who confirms twenty blue prompts a shift must hit something different before a delete.

**Common rules**

- The composer locks while any prompt is pending (§4.17 locked state). Copy: \`Confirm or cancel the email above to continue\` (email) — generalise to \`Confirm or cancel the change above to continue\` (Side Panel A3 wording).
- Expiry: 5 minutes. Header shows \`expires {HH:MM}Z\`. On expiry → Expired record (D).
- Keyboard: \`⌘⏎\` confirms (standard), \`Esc\` cancels, \`⏎\` applies low-risk. Destructive: no keyboard confirm (hold with mouse/touch, or Space held 2 s when the hold button has focus — **not drawn**, spec default).
- Focus: when a prompt appears, focus moves to its Cancel button (spec default — prevents a stray Enter confirming; **not drawn**).
- Confirm → button shows loading (**not drawn**; spec default: label replaced by 14px spinner, button disabled) → card collapses into the Applied record only after success.
- Never optimistic; never auto-retry a write.

**A. Low risk — inline (5a)**

White, \`1px #d6d8dc\`, radius 14, padding \`12px 14px\`, flex gap 10, align centre:
\`sliders-horizontal\` 15 \`#6c7079\` · \`Wall timeline zoom\` 13.5 + old value mono \`#9aa0a8\` line-through + \` → \` + new value mono 600 · \`Apply ⏎\` (primary small, 13/600 padding \`7px 12px\` radius 8, keycap opacity .75) · \`Cancel\` (ghost 13/600 \`#3a3d44\`).

**B. Standard write — card**

| Part | Values |
|---|---|
| Frame | white, \`1.5px solid #2563eb\`, radius 14, shadow \`0 0 0 4px rgba(37,99,235,.08)\` |
| Header | bg \`#f2f7ff\`, bottom \`1px #dbe6ff\`, padding \`12px 16px\`, gap 10: \`shield-alert\` 16 \`#1d4ed8\` · title 14/700 \`#1d4ed8\` · spacer · right note 12 \`#3a5170\` |
| Body | padding \`14px 16px\`, grid \`90px minmax(0,1fr)\`, row gap 9, col gap 14, 13.5px; labels \`#6c7079\` |
| Footer | padding \`12px 16px\`, top \`#eef0f2\`, bg \`#fbfbfc\`, gap 8: primary \`{Verb} ⌘⏎\` (14/600 padding \`10px 16px\` radius 9) · secondary (\`Preview email\` / \`Edit first\`) · spacer · ghost \`Cancel Esc\` |

Email copy (verbatim):

\`\`\`
Confirm before I send
Nothing is sent until you confirm · expires 07:58Z
Action     Send email   email.send via Resend
To         Anna Kerimova   a.kerimova@clearway.lv
Subject    BTI472 · EVRA AD 2 and crew brief, 23 Sep
Attached   EV_AD_2_EVRA_en.pdf · 2.8 MB   BTI472_crew_brief_23SEP.pdf · 212 KB
Signed as  "Sent by Clearway Ops Agent at the request of Dmitrijs Kalnins"
[Confirm and send ⌘⏎]  [Preview email]            [Cancel Esc]
\`\`\`

Attachment chips in the body: mono 12, bg \`#f5f6f7\`, \`1px #e6e7ea\`, radius 6, padding \`2px 7px\`.

**Multiple changes** (Ops Agent B4): header \`{n} changes need your confirmation\` + \`expires 07:53Z\`. One block per change, padding \`12px 16px\`, bottom \`#f2f3f5\`, column gap 7:

- line 1: number badge (11/700/0.08em \`#6c7079\`, bg \`#f0f1f3\`, radius 5, padding \`2px 7px\`) · target 13.5/700 (\`NOTAM Check · EGLL\`) · tool mono 11.5 \`#9aa0a8\`
- line 2, **before → after**: before chip bg \`#fdecec\` text \`#b91c1c\` line-through (decoration \`rgba(185,28,28,.4)\`) radius 6 padding \`3px 8px\` · \`arrow-right\` 14 \`#9aa0a8\` · after chip bg \`#e7f6ec\` \`#15803d\` 600
- optional side-effect warning: \`triangle-alert\` 13 + 12.5 \`#b45309\`: \`Replaces what everyone in the ops room sees. Artyom Gud will be notified.\`
- footer buttons: \`Confirm 2 changes\` · \`Only change 1\` · spacer · \`Cancel\`

**Change that affects the page behind the panel** (Side Panel A3): header \`Confirm new limitation\` + right note \`previewed on the page ←\` 11.5 \`#3a5170\`; body grid \`78px 1fr\`, 13px: \`Creates LIM-0421\` (mono 600) · \`Text EVRA de-icing pad C closed. Use pads A or B.\` · \`Valid now – 23 SEP 18:00Z\` · \`Wall Shown to the ops room · 6 flights get the marker\` · \`Tier Reference — not quotable until approved\`; buttons \`Create and show ⌘⏎\` · \`Edit first\` · \`Cancel\`. The page shows a ghost row while pending (§6.8).

**C. Destructive — pinned bar, hold to confirm (5c)**

- Pinned above the composer, visible however far the user scrolls; also shown on any console page as a top banner (banner **not drawn**; §16).
- Frame white, \`1.5px solid #e5484d\`, radius 10. Header bg \`#fdecec\`, padding \`10px 12px\`: \`trash-2\` 14 \`#e5484d\` · \`Delete LIM-0412 — can't be undone\` 13/700 \`#b91c1c\` · countdown mono 11 \`#b91c1c\` \`4:12 left\`.
- Body padding \`10px 12px\`: \`Affects BTI472, BTI641 and the authoritative tier. Hold the button for 2 seconds to delete.\` 12.5 \`#3a3d44\`; \`Hold to delete\` button (13/600 white on \`#e5484d\`, padding \`8px 14px\`, radius 8) with a fill overlay \`rgba(0,0,0,.18)\` growing left→right over 2000 ms while held · spacer · \`Keep it\` (secondary).
- Release before 2000 ms → fill returns to 0 over 150 ms (spec default), nothing happens.
- Composer below: bg \`#f5f6f7\`, \`Locked until the pending change is answered\`.
- **Why hold, not type:** works on the ops-room touch screen, and can't be triggered by a stray Enter.

Inline destructive (5a lower) is drawn but **not chosen**; do not build it. Its copy is reused in the modal.

**D. Records — what the prompt becomes after it is answered**

| Outcome | Frame | Icon | Title (14/600) | Body (13 \`#6c7079\`) / right |
|---|---|---|---|---|
| Applied (several) | white \`1px #e6e7ea\` radius 14 | \`shield-check\` 16 \`#16a34a\` | \`2 changes applied\` (14/700) | right: \`Confirmed by you · 07:49:12Z\`; one row per change (grid \`20px 1fr auto\`, \`check\` 15 green, what 13.5/600, detail 12.5 \`#6c7079\`, ref mono 11.5 \`#9aa0a8\` e.g. \`wall.show · wl_a204\`); footer 12.5: \`View in activity log\` link + \`Undo isn't automatic — ask me to revert either change.\` \`#9aa0a8\` |
| Sent (email) | white \`1px #e6e7ea\` radius 14, padding \`12px 16px\` | \`mail-check\` 16 green | \`Sent to Anna Kerimova · 2 attachments\` | right: \`Confirmed by you · 07:53:40Z · re_8Hk2Qw\` (times/IDs mono) |
| Cancelled | bg \`#fbfbfc\`, \`1px dashed #d6d8dc\` | \`circle-slash\` \`#9aa0a8\` | \`Email not sent — you cancelled\` / \`Cancelled — nothing changed\` (\`#6c7079\`) | \`You cancelled at 07:48:40Z. Recorded in the activity log as declined.\` |
| Expired | same as Cancelled | \`timer-off\` \`#9aa0a8\` | \`Expired — nothing changed\` | \`No answer within 5 minutes. The wall may have changed since, so I won't reuse this prompt.\` + \`Ask again\` |
| Partial | white, \`1px #f7cfd0\` | \`triangle-alert\` \`#e5484d\` | \`1 of 2 applied\` (\`#b91c1c\`) | \`EGLL is marked checked. The wall change failed (wall offline since 07:48Z) — BTI472 is still on screen.\` + \`Retry wall change\` |
| Applied (panel, limitation) | white radius 12 padding \`10px 12px\` | \`shield-check\` 15 green | \`LIM-0421 created · on the wall\` + mono \`08:14:20Z\` | \`Confirmed by you. The row is highlighted on the page for 10 s. Artyom Gud and Musalini saw it arrive on their Limitations page too.\` + links \`Show on page\` \`Activity log\` |

Record IDs (\`nc_7f31\`, \`wl_a204\`, \`re_8Hk2Qw\`) come from the tool result — \`SOURCE UNKNOWN — developer to wire\`.

**E. Modal (5b)** — only from the voice bar and ⌘K

- Scrim \`rgba(23,24,28,.45)\` (destructive) / \`rgba(23,24,28,.12)\` (low). Card 420 (destructive) / 340 (low) wide, radius 16/14, shadow §2.3.
- Destructive: \`trash-2\` 18 in a 36×36 \`#fdecec\` tile radius 10 · \`Delete LIM-0412 permanently?\` 16/800 · \`The agent asked on your behalf in "BTI472 morning prep".\` 13 \`#6c7079\` · bullets 13/1.5: \`· Leaves the wall and the authoritative tier\` \`· Marker removed from BTI472, BTI641\` \`· N. Ozola (approver) is notified\` · input \`Type LIM-0412 to confirm\` (mono 12.5, \`1px #d6d8dc\` radius 8 padding \`8px 10px\`) · footer bg \`#fbfbfc\`: \`Keep it\` (secondary) · \`Delete\` (disabled \`#f2a3a5\` until the typed value exactly matches; then \`#e5484d\`).
- Low: \`Change wall timeline zoom?\` 14/700 · \`3 h → 4 h for everyone in the ops room.\` · \`Cancel\` · \`Apply\`.
- Focus trap; Esc = Cancel/Keep it; initial focus on the input (destructive) or Cancel (low).

### 4.16 Error card

Ops Agent B3. Each error says what failed, what the agent did and didn't conclude, and what to do next.

- Frame: white, \`1px {border}\`, radius 12, padding \`14px 16px\`, flex gap 12.
- Icon tile 30×30 radius 8, bg tint, icon 16.
- Title 14/700 · kind label 11/700/0.08em in the kind colour · body 13.5/1.55 \`#3a3d44\` · diagnostic mono 11.5 \`#9aa0a8\` · actions (primary + secondary small), margin-top 4.

| Kind label | Icon | Colours (fg / tint / border) | Title | Body | Diagnostic | Actions |
|---|---|---|---|---|---|---|
| \`TOOL FAILED\` | \`plug-zap\` | \`#b45309\` / \`#fef3e2\` / \`#f6ddb0\` | \`NOTAM Check didn't answer\` | \`I could not read review status for EPWA, so I have not said whether its NOTAMs are checked. Everything else in the reply stands.\` | \`notam.status → 503 Service Unavailable · 3 retries · 08:04Z\` | \`Retry\` · \`Open NOTAM Check\` |
| \`PERMISSION DENIED\` | \`lock\` | \`#b91c1c\` / \`#fdecec\` / \`#f7cfd0\` | \`You can't change the wall from here\` | \`Putting a flight on the wall needs the Wall operator role. I can read wall data for you. Ask an admin (Artyom Gud, Dmitrijs Kalnins) to grant it.\` | \`wall.show → 403 · role user · requires wall:write\` | \`Request access\` · \`Copy request\` |
| \`SOURCE UNAVAILABLE\` | \`cloud-off\` | amber | \`EAD is offline — answer uses the cached AIP\` | \`The AD 2 I attached is AIRAC 2609 from yesterday's sync, marked stale in the reply. AIRAC 2610 takes effect 01 Oct; check before relying on it after that.\` | \`aip.get → EAD timeout · cached 22 SEP 06:10Z\` | \`Retry live\` · \`Keep cached\` |
| \`MODEL UNAVAILABLE\` | \`circle-off\` | \`#6c7079\` / \`#f0f1f3\` / \`#e6e7ea\` | \`The agent can't reply right now\` | \`Your message is saved and will send when it's back. Nothing was run. The console itself is working — Flights, NOTAM Check and AIP search are all available.\` | \`model provider 529 overloaded · since 08:06Z · status page\` | \`Retry now\` · \`Go to Flights\` |

Admin names in the permission copy are dynamic (users with the role) — \`SOURCE UNKNOWN\`.

**Panel variants** (Side Panel C6): radius 12, padding 12, 13px body.
- Tool failed: border \`#f6ddb0\`, title 12/700 \`#b45309\` \`Tool failed\`; body \`Eurocontrol didn't answer, so I can't confirm the new CTOT. Leon still shows 13:14Z from 08:02Z.\`; diag \`nm_b2b.flight → timeout 10 s\`; actions \`Retry\` · \`Use Leon only\`.
- Offline: bg \`#fbfbfc\`, \`wifi-off\` 13; \`Offline\`; \`You're offline. Earlier replies stay readable; new questions queue and send when the connection returns. Nothing that changes data is queued.\`; queued item row: \`1px dashed #d6d8dc\` radius 8 padding \`7px 10px\`, text in quotes + \`Queued\` 600.
- Loading: see §6.11.

**Rule:** a failed tool never produces a guessed answer for the part it couldn't read. The reply states the gap.

### 4.17 Composer

**Full page**

- Wrapper: bottom of the chat column, padding \`16px 24px 20px\`, background gradient \`linear-gradient(rgba(251,251,252,0), #fbfbfc 30%)\` so thread content fades under it. Inner \`max-width 800px\`.
- Box: white, \`1px #d6d8dc\`, radius 16, \`shadow.composer\`.
- Input area: padding \`14px 16px 6px\`, min-height 48, 15/1.6. Placeholder \`#9aa0a8\`: \`Ask a follow-up, @ to mention, / for an action…\` (in a thread) · \`Ask, type @ for a flight or airport, / for an action…\` (empty state).
- **Grows** with content up to **8 lines** (8 × 24px = 192px), then scrolls internally.
- Toolbar: padding \`6px 8px 8px\`, gap 4: three icon buttons 34×34 radius 8 (hover \`#f0f1f3\`), icons 17 \`#6c7079\`: \`paperclip\` (title \`Attach\`), \`at-sign\` (\`Mention\`), \`slash\` (\`Command\`) · spacer · hint 12 \`#9aa0a8\`, margin-right 8: \`⏎ send · ⇧⏎ new line · hold ⌥ Space to talk\` (keys mono) · voice button 36×36, \`1px #e6e7ea\`, radius 10, contains the 22px orb (title \`Hold to talk\`) · send button 36×36 radius 10, \`arrow-up\` 17 white.
- Focus: border \`#2563eb\` + \`0 0 0 3px rgba(37,99,235,.1)\`.

| State | Box bg | Placeholder / content | Send button |
|---|---|---|---|
| Empty | white | placeholder | \`#b9c8ea\`, disabled |
| Has text | white | text | \`#2563eb\`, hover \`#1d4ed8\` |
| Uploading attachment | white | text + chips | \`#b9c8ea\`, disabled; warning line 12 \`#b45309\` \`Sending waits for the upload · the 31 MB file won't be sent\` |
| Locked by confirmation | \`#f5f6f7\` | \`lock\` 14 \`#9aa0a8\` + \`Confirm or cancel the email above to continue\` | \`#c9cdd3\`, disabled |
| Voice active | — | compact bar docked in place of the input (§4.23, panel) | hidden during capture (spec default) |
| Offline | **not drawn** — spec default: white, placeholder \`You're offline — questions will send when you're back\`, send enabled (queues) |

**Panel**: box radius 14 (or 12 for the one-line form), \`1px #d6d8dc\`; input padding \`11px 13px 4px\`, 14px; placeholder \`Ask about {context}…\` (e.g. \`Ask about KLJ7226…\`, \`Ask about EVRA…\`, \`Ask about NOTAM Check…\`) or \`Ask, @ a flight or airport, / for an action…\` with no context. Toolbar padding \`4px 6px 6px\`, gap 2: 30×30 icon buttons (\`paperclip\`, \`at-sign\`, \`slash\`), icons 15 · spacer · hint 11 \`hold ⌥ Space\` · send 32×32 radius 9, icon 15. Container padding \`10px 14px 14px\`, top border \`#eef0f2\`. One-line form (as drawn in A2/A3/B): height 44, radius 12, padding \`0 12px\`, 14px.

**Keyboard:** \`⏎\` send; \`⇧⏎\` new line; \`@\` opens mentions; \`/\` at the start of a line or after a space opens commands; \`↑\` in an empty composer: **not drawn** (spec default: edit last message — do not build unless confirmed).

### 4.18 Attachments

Ops Agent C1. Accepted: \`PDF, images, CSV, XLSX, TXT\`. Max \`25 MB\` per file. Entry: picker (\`paperclip\`), paste, drag-drop anywhere on the thread.

**Chip** — 170px wide, radius 10, padding 8, flex gap 9; positioned relative with a remove button. Chips row: wrap, gap 8, padding \`12px 12px 0\` inside the composer, above the text.

| State | Border / bg | Tile (38×38, radius 6) | Name (12.5/600, ellipsis) | Meta (11.5) |
|---|---|---|---|---|
| Uploaded image | \`#e6e7ea\` / white | image thumbnail (design placeholder: striped + \`PNG\`) | \`stand14_flap_damage.png\` | \`1.9 MB\` \`#6c7079\` |
| Uploading | \`#dbe6ff\` / white | \`#eef4ff\` + \`file-text\` 17 \`#2563eb\` | \`techlog_YL-ABC_p212.pdf\` | \`Uploading · 64%\` \`#1d4ed8\` + progress bar 3px, track \`#e6e7ea\`, fill \`#2563eb\`, radius 2, margin-top 5 |
| Failed | \`#f7cfd0\` / \`#fffafa\` | \`#fdecec\` + \`rotate-cw\` \`#e5484d\` | \`crew_roster_SEP.xlsx\` | \`Failed · Retry\` \`#b91c1c\` — tile/meta click retries |
| Too large | \`#f6ddb0\` / \`#fffcf6\` | \`#fef3e2\` + \`file-warning\` \`#b45309\` | \`AMM_ch27_flight_ctrl.pdf\` | \`31 MB · over 25 MB\` \`#b45309\` |
| Uploaded file | **not drawn** — spec default: as Uploading without the bar, meta = size |

Remove: 18×18 circle, white, \`1px #d6d8dc\`, \`x\` 10 \`#6c7079\`, at \`top -6px; right -6px\`.

**Drop zone** (while dragging over the thread): height 150, \`2px dashed #2563eb\`, bg \`#f2f7ff\`, radius 16, centred column gap 6: \`file-up\` 24 \`#2563eb\` · \`Drop to attach {n} files\` 15/700 \`#1d4ed8\` · \`PDF, images, CSV, XLSX, TXT · up to 25 MB each · the whole thread is the drop target\` 12.5 \`#3a5170\`.

**Behaviour:** sending waits for uploads to finish; too-large files are excluded from the send and stay in the tray marked. Upload endpoint: \`SOURCE UNKNOWN\`.

### 4.19 \`@\` mentions

Resolves real entities: \`@flight\` (live flight search), \`@airport\` (ICAO), \`@operator\`, \`@aircraft\`, \`@limitation\`, \`@document\`. Ops Agent C2 and Side Panel B4.

**Picker** — opens above the caret when \`@\` is typed. White, \`1px #d6d8dc\`, radius 14, \`shadow.menu\`.

- Type tabs row: padding \`8px 8px 0\`, gap 4, bottom border \`#eef0f2\`. Tabs: \`All\` \`@flight\` \`@airport\` \`@operator\` \`@aircraft\` \`@limitation\` \`@document\`; 12.5; active 700 \`#17181c\` with 2px \`#17181c\` bottom border; inactive 500 \`#6c7079\`; padding \`6px 9px 9px\`. \`Tab\` cycles types.
- Groups: padding \`6px 6px 2px\`; group label 10.5/700/0.12em \`#9aa0a8\` padding \`4px 10px\` (\`AIRPORTS\`, \`FLIGHTS · LIVE\`, \`DOCUMENTS\`).
- Row: flex gap 10, padding \`8px 10px\`, radius 8; highlighted row bg \`#eef4ff\`. Contents: type tile 26×26 radius 7 (tint + icon 14) · primary mono 13.5/600 with the **matched prefix highlighted** bg \`#fef3c7\` radius 2 · secondary 13 \`#6c7079\` ellipsis · type tag 11.5 \`#9aa0a8\` (\`@airport\`).
- Footer: padding \`8px 16px\`, top \`#eef0f2\`, bg \`#fbfbfc\`, gap 14, 12 \`#9aa0a8\`: \`↑↓ move\` \`⏎ insert\` \`Tab next type\` \`Esc close\` · spacer · \`Flights search Leon live\`.

| Type | Icon | Tile / fg |
|---|---|---|
| airport | \`map-pin\` | \`#dbeafe\` / \`#1d4ed8\` |
| flight | \`plane\` | \`#dbeafe\` / \`#1d4ed8\` |
| aircraft | \`plane-takeoff\` | \`#dbeafe\` / \`#1d4ed8\` (panel: \`#f0f1f3\` / \`#3a3d44\` when not selected) |
| document | \`file-text\` | \`#f0f1f3\` / \`#3a3d44\` |
| limitation | \`triangle-alert\` | \`#ede9fe\` / \`#6d28d9\` |
| operator | **not drawn** — spec default \`building-2\`, neutral tile |

**Ordering in the panel** (context-aware, Side Panel B4): with nothing typed after \`@\`: group \`ON THIS PAGE\` → selected record first (tag \`SELECTED\` 10.5/700 \`#1d4ed8\`, row bg \`#eef4ff\`), then records related to it (its aircraft, its destination), then other visible records (tag \`VISIBLE\` \`#9aa0a8\`, 6px gap before them), then recents. Panel picker radius 12, padding 6, tile 24×24 radius 6, row padding \`7px 8px\`.

**While typing in the composer:** the pending token \`@EV\` is mono 14, bg \`#f2f7ff\`, \`border-bottom 1.5px solid #2563eb\`, padding \`0 2px\`.

**Inserted mention chip** (in composer and in the sent bubble): inline-flex gap 4, radius 6, padding \`0 6px\`, vertical-align 1px; icon 12 \`currentColor\`.

| Entity | Colours | Font |
|---|---|---|
| Flight, airport, aircraft, document | \`#dbeafe\` / \`#1d4ed8\` | mono 13.5/600 |
| Limitation | \`#ede9fe\` / \`#6d28d9\` | sans 14/600 |
| Person (email recipient) | \`#e7f6ec\` / \`#15803d\`, icon \`user\` | sans 14/600 |

Hover a sent chip → entity card (\`Hover a chip for its card · aircraft, airport, limitation\`) — card content **not drawn**. \`⌫\` next to a chip removes it as a unit (spec default). Search source: live Leon flights, ICAO list, operators, aircraft, limitations register, documents — \`SOURCE UNKNOWN\`.

### 4.20 \`/\` commands

Ops Agent C3. Menu: white, \`1px #d6d8dc\`, radius 14, \`shadow.menu\`, padding 6.

Row: grid \`30px 90px minmax(0,1fr) auto\`, gap 10, padding \`9px 10px\`, radius 8; highlighted bg \`#eef4ff\` and its tile turns \`#17181c\` with a white icon.

| Command | Description | Args (mono 12 \`#9aa0a8\`) | Icon | Kind (11/700/0.06em) |
|---|---|---|---|---|
| \`/aip\` | \`Get an AIP document\` | \`ICAO [part]\` | \`file-text\` | \`READ\` \`#9aa0a8\` |
| \`/notam\` | \`Active and new NOTAMs\` | \`ICAO [since]\` | \`file-check\` | \`READ\` |
| \`/weather\` | \`METAR and TAF, raw + decoded\` | \`ICAO…\` | \`cloud-sun\` | \`READ\` |
| \`/brief\` | \`Build a briefing for a flight or wave\` | \`flight | time range\` | \`clipboard-list\` | \`MAKES A FILE\` \`#16a34a\` |
| \`/email\` | \`Send something from this thread\` | \`to [what]\` | \`send\` | \`ASKS FIRST\` \`#1d4ed8\` |

Tile 28×28 radius 7, default bg \`#f0f1f3\` icon \`#3a3d44\` 14.

**Chosen command in the composer:** chip bg \`#17181c\`, white mono 13.5/600, radius 7, padding \`3px 6px 3px 8px\`, gap 6, with a 15×15 remove box (\`rgba(255,255,255,.14)\` radius 4, \`x\` 9 white). Then argument slots: current slot \`1px #2563eb\` bg \`#f2f7ff\` radius 7 padding \`2px 8px\` mono 13.5 \`#1d4ed8\` with caret; optional slot \`1px dashed #d6d8dc\` 13 \`#9aa0a8\` (\`since · optional\`). Hint right 12 \`#9aa0a8\`: \`Tab next argument · ⌫ on empty removes command\`.

**In a sent bubble:** chip \`#17181c\` / white mono 13.5/600 radius 6 padding \`0 7px\`, then args in mono 14 (\`/aip EVRA AD 2\`).

**Why black:** blue chips are entities, black chips are actions. (This is the only other use of \`#17181c\` as a fill besides verbatim; it is small, inline and always a \`/\`-prefixed token, so it cannot be mistaken for a quote block.)

### 4.21 Context chip

Side Panel, top of the panel body. **Supersedes** the header badge \`Sees: …\` drawn in round 1 (B5) and Alternatives 1b.

- Pill: inline-flex gap 7, 12.5/600 \`#1d4ed8\`, bg \`#eef4ff\`, \`1px #dbe6ff\`, radius 999, padding \`5px 6px 5px 11px\`, \`align-self: flex-start\`.
- Leading icon 12 \`currentColor\` by context type: flight \`plane\`, airport \`map-pin\`, wall/NOTAM Check \`file-check\` or \`monitor\`, limitations page \`triangle-alert\`.
- Text: \`Asking about flight KLJ7226\` · \`Asking about EVRA · NOTAM tab\` · \`Asking about NOTAM Check\` · \`Asking about the Limitations page\`. Codes in mono.
- Clear button: 18×18 circle bg \`#dbe6ff\`, \`x\` 9. Click → chip removed, question becomes general, placeholder changes to the no-context copy.
- No context → no chip.

**Behaviour** (Side Panel decisions, verbatim): *A chip names the page or record. It updates as the user navigates until they send; after that the thread keeps its context and a "Now on…" chip offers the switch.* The "Now on…" chip is **not drawn** (§16).

**Loading:** \`Reading Flights · KLJ7226…\` — 12/600 \`#6c7079\`, bg \`#f5f6f7\`, \`1px dashed #d6d8dc\`, radius 999, padding \`4px 10px\`, leading 8px dot \`#9aa0a8\` pulsing. Composer is usable immediately; context attaches when ready (< 300 ms).

**Content source:** current route, selected record(s), and visible records from the console page — the page must expose them to the panel. \`SOURCE UNKNOWN — developer to wire\`.

### 4.22 Suggested questions

**Full page, first open** (Ops Agent B1): 2-column grid gap 10. Card white \`1px #e6e7ea\` radius 12 padding \`13px 15px\`, column gap 7; hover border \`#b9d0ff\` bg \`#f7faff\`, cursor pointer. Eyebrow 11/700/0.08em with icon 12, colour by kind; question 14.5/1.45/500.

| Kind label | Icon | Colour | Question |
|---|---|---|---|
| \`COMPANY KNOWLEDGE · QUOTED EXACTLY\` | \`book-open\` | \`#6d28d9\` | \`What is the wet-runway crosswind limit for YL-ABC?\` |
| \`LIVE DATA\` | \`database\` | \`#1d4ed8\` | \`Which flights today still have unreviewed NOTAMs?\` |
| \`DOCUMENTS · EMAIL\` | \`file-text\` | \`#1d4ed8\` | \`Send me the AD 2 for EVRA and LFPG.\` |
| \`CHANGES THE WALL · ASKS FIRST\` | \`shield-check\` | \`#15803d\` | \`Put GBJ88 on the wall and mark EPWA checked.\` |

**Why these four:** each teaches one thing the agent can actually do and its safety behaviour (quotes exactly, reads live data, delivers documents, asks before changing).

**Panel** (Side Panel B1–B3): column gap 8. Card \`1px #e6e7ea\` radius 11 padding \`10px 12px\`, column gap 4; hover as above. Eyebrow 10.5/700/0.08em (colour per row); question 14/1.4/500. Click → sends the question (spec default; **not drawn** whether it sends or fills the composer — spec: sends, since each is a complete question).

Question sets and headlines are in §6.6. **Content source:** generated from the current context (e.g. "3 airports still need checking" is live data) — \`SOURCE UNKNOWN\`. The no-context set "come from what's happening now, not a fixed list".

### 4.23 Compact voice bar

Alternatives V. The default voice UI: "just ask it something quickly" without losing sight of the page. The large overlay (§4.24) is for deliberate hands-free moments.

**Invocation:** **hold \`⌥ Space\`** anywhere in the console. Release to send. \`Esc\` discards. Double-tap \`⌥ Space\` opens the large overlay instead.

**Anatomy (light)**

- Pill, height **44px**, width **360–560px** (invoked state 380; grows with transcript up to 560, never beyond). White, \`1px #d6d8dc\`, radius 999, \`shadow.voicebar\`, padding \`0 8px 0 14px\`, flex gap 12, align centre.
- Left: ring mark 16×16 (\`2px #2563eb\` border, 6px \`#2563eb\` dot); red broken ring for errors.
- Waveform §4.2 (56×18, 10 bars).
- Transcript: 14px, single line, \`flex:1\`, overflow hidden. **Older words scroll off the left** (implementation in design: \`direction: rtl; text-align: left\` on the container with an \`isolate\`d LTR span). Final words \`#17181c\`; the provisional tail \`#9aa0a8\`; caret 1.5×15 \`#2563eb\` blinking.
- Right: timer mono 11.5 \`#9aa0a8\` (\`0:04\`) or state-specific text.

**States**

| # | State | Differences from base | Copy |
|---|---|---|---|
| 1 | **Invoked** | Width 380. Waveform flat (0.12). Appears in **120 ms**, before the mic warms up, "so the keypress feels answered" | \`Listening…\` (\`#9aa0a8\`, 13.5) · right \`⌥ Space held · Esc\` 11.5 \`#9aa0a8\` (keys mono \`#6c7079\`) |
| 2 | **Listening** | Live waveform; transcript streaming; timer | e.g. \`is BTI472 still on the CTOT or has it been rele\` |
| 3 | **Uncertain word** | Uncertain token: \`border-bottom 2px dotted #d97706\`, bg \`#fef7e6\`, radius 3, padding \`0 3px\`, mono 13. Right: \`1 word to check\` 11.5/600 \`#b45309\`. Popover above the word (top offset 46px): bg \`#17181c\`, radius 10, padding 5, gap 4, 12.5 white, shadow \`0 6px 18px rgba(0,0,0,.2)\`; options radius 6 padding \`4px 8px\` mono 600, first option bg \`#2563eb\`; last \`type…\` \`#b9bdc5\` | options: \`1 GBJ88\` \`2 GBJ86\` \`3 GBJ8\` \`type…\` |
| 4 | **Processing** | Waveform replaced by a 2px \`#2563eb\` progress line (33% width) sliding along the bottom edge (§14 V3). Request quoted left (\`#6c7079\`, max 220px, ellipsis); 1×18 divider \`#e6e7ea\`; current tool step right (13.5, ellipsis); \`Esc\` mono 11.5 | \`"is BTI472 still on the CTOT…"\` · \`Checking Leon for BTI472…\` |
| 5 | **Error** | Border \`#f7cfd0\`, shadow \`0 8px 24px rgba(16,18,22,.1)\`, padding \`0 6px 0 14px\`. Ring 16px \`2px #e5484d\` with the top gap (clip-path). Title 13.5/600 \`#b91c1c\`; detail 13 \`#6c7079\` ellipsis; action pill 12.5/600 \`#17181c\` bg \`#f5f6f7\` \`1px #e6e7ea\` radius 999 padding \`6px 11px\` | see table below |

| Error | Detail | Action | Holds |
|---|---|---|---|
| \`No microphone\` | \`none connected to this PC\` | \`Type instead ⌘J\` | 6 s, then fade |
| \`Microphone blocked\` | \`allow it in the address bar, then retry\` | \`How to allow\` | 6 s |
| \`Didn't catch that\` | \`nothing heard in 4 s\` | \`Hold ⌥ Space again\` | **3 s** |

**Uncertain-word behaviour.** Codes are matched against live flights and ICAOs, so alternatives are real entities. Press \`1\`–\`3\`, or type to replace just that word. Keep talking and it stays marked. **The agent asks before acting on an unresolved one** (Ops Agent D3): it replies \`I heard "G B J eight eight" with low confidence. Which one?\` with option buttons (mono 13/600, white, \`1px #d6d8dc\`, radius 8, padding \`6px 10px\`): \`GBJ88 EPWA→EVRA\` \`GBJ86 EVRA→LKPR\`. **Why:** a wrong callsign acted on is worse than a question.

**Placement**

| Context | Position | Draggable | Notes |
|---|---|---|---|
| Normal console page | Floats **22px above the bottom edge**, centred on the content area (not the viewport — excludes the sidebar) | Yes, along the bottom edge only; snaps left / centre / right; remembered per user | The selected row is attached as context: pill \`+ PNV210 selected\` 11/600 \`#1d4ed8\` bg \`#eef4ff\` radius 999 padding \`4px 8px\` at the right end |
| Side panel open | Docks into the panel composer (§6.9) | No | — |
| Wall timeline (dark) | **Pinned top-right** in the header band (\`right 18px; top 14px\`), never over the timeline | **No** — the wall layout is shared and fixed | Height **36**, width 400, bg \`rgba(23,27,38,.96)\`, \`1px #3a4560\`, shadow \`0 8px 24px rgba(0,0,0,.4)\`, padding \`0 6px 0 12px\`, gap 10; ring 14px \`#6ea0ff\` (dot 5); waveform 48×16 \`#6ea0ff\`; text 13 \`#e8ecf4\`; uncertain underline \`#f5c77a\`; \`Esc\` mono 11 \`#8c97ad\`. Answers stay on the operator's own screen. **See conflict §16.2 #3.** |

**Short answer** (panel closed, Side Panel C2): one or two sentences appear in a small card above the bar for **8 s**, spoken if the delivery rule says so (§4.25). Card: white, \`1px #d6d8dc\`, radius 10, shadow \`0 6px 16px rgba(16,18,22,.16)\`; last line \`Open in panel ⌘J\` 600 \`#1d4ed8\`. \`⏎\` opens it in the panel. Exact card dimensions are only drawn as a sketch (210px at thumbnail scale) — spec default: same width as the bar, padding \`10px 14px\`, 14/1.5 text.

**Needs room:** a table, document, confirmation or more than two sentences **opens the panel** with the thread already in it.

**From the ⌘K palette or the bar, a confirmation is a modal** (§4.15 E).

### 4.24 Voice overlay (large)

Ops Agent D2. Invoked by **double-tap \`⌥ Space\`**. For a hands-free conversation.

- Scrim over the whole console: \`rgba(23,24,28,.28)\`.
- Card: centred horizontally, **36px from the bottom**, width **600**, white, radius 22, \`shadow.overlay\`, padding \`26px 28px 18px\`, column, centred, gap 14.
- Orb 120px (§4.1).
- State label 11/700/0.12em; colour \`#2563eb\` for live states, \`#9aa0a8\` ready, \`#e5484d\` error.
- Transcript 19/1.5 centred \`#17181c\`, min-height 58, max-width 520.
- Footer: full-width, top \`#eef0f2\`, padding-top 12, gap 16, 12 \`#9aa0a8\`: \`Release ⌥ Space to send\` · \`Esc discard\` · \`Tap once to keep listening\` · spacer · \`Reply in the panel · sound on\`.

| State | Label | Transcript copy (sample) |
|---|---|---|
| idle | \`READY\` \`#9aa0a8\` | \`Hold ⌥ Space and speak.\` (\`#9aa0a8\`) |
| listening | \`LISTENING\` | \`Put G B J eight eight on the wall and mark EPWA as\` + grey tail \` checked…\`; uncertain phrase styled as §4.23; below it a disambiguation row (bg \`#fef7e6\`, \`1px #f6ddb0\`, radius 10, padding \`7px 10px\`, 12.5 \`#92400e\`): \`Not sure I heard the callsign:\` + two mono chips \`GBJ88 · EPWA→EVRA\` (600) \`GBJ86 · EVRA→LKPR\` |
| thinking | \`WORKING\` | \`Checking NOTAM status for EPWA…\` (\`#6c7079\`, code \`#17181c\` mono) |
| speaking | \`SPEAKING\` | spoken part \`#17181c\`, unspoken \`#b9bdc5\`: \`Two EPWA NOTAMs are still open. I need your\` / \` confirmation before I change the wall — it's on screen for you now.\` |
| error | \`MICROPHONE LOST\` \`#e5484d\` | \`I lost the microphone mid-sentence.\` (\`#b91c1c\`) + \` What I heard is kept in the composer — press ⌥ Space to try again.\` (\`#6c7079\`) |

The design includes a state switcher (Idle/Listening/Thinking/Speaking/Error tabs) **for review only. Do not build it.**

### 4.25 Spoken reply (speaking states)

**Delivery model: 6c "Inferred, reversible", seeded by 6b "Persistent preference"** (Alternatives 6, RECOMMENDED). 6a (ask Show/Say/Both every time) is **not to be built**.

**Rules (verbatim from the design — this is the decision table):**

| Answer type | Behaviour |
|---|---|
| Short, factual | Spoken + transcript, under ~15 s. "Show instead" on \`S\`. |
| Tables, docs, charts, raw METAR/TAF/NOTAM | Always shown. Voice says one line naming what is on screen. |
| Long | Speaks a summary written for the ear; full answer on screen; "Show full". |
| Verbatim limitation | Never read aloud. "The limitation is on screen." |
| Needs confirmation | Always shown. Voice never confirms a change. |
| Preference = text | Never speaks unless \`V\` is pressed. |

Preference (6b): lives in the voice bar as a pill \`Reply: spoken\` / \`Reply: auto\` (\`volume-2\` 12, 12/600 \`#1d4ed8\` bg \`#eef4ff\` radius 999 padding \`6px 10px\` or \`3px 8px\` in the panel) and in Account. **Hold \`⇧\` as you release \`⌥ Space\` to flip it for this one answer.** Values: \`auto\` (6c inference), \`spoken\`, \`text\`. Default: \`auto\` (spec default).

**Speaking card** (bar context): width 440, white, \`1px #d6d8dc\`, radius 16, \`shadow.voicebar\`, padding \`12px 14px\`, column gap 8.
- Top row gap 10: waveform (40×16, 7 bars) · \`SPEAKING · 0:03 / 0:06\` 12/700/0.08em \`#2563eb\` flex 1 · \`Show instead S\` (12.5/600 bg \`#f5f6f7\` \`1px #e6e7ea\` radius 999 padding \`5px 10px\`, key mono \`#9aa0a8\`) · \`Stop\` (§4.6 stop colours, radius 999).
- Transcript 14/1.5: spoken \`#17181c\`, not yet spoken \`#b9bdc5\`. E.g. \`Yes — CTOT 11:52Z, fifteen minutes late.\` + \` No revision since 07:30.\`

**Must show (can't be spoken):** card with a header row (gap 10, padding \`10px 14px\`, bottom \`#eef0f2\`): short waveform · the one spoken line in quotes 13.5 \`"Four flights. It's on screen."\` · badge \`SHOWN · TABLE\` 11/700/0.06em \`#6c7079\` bg \`#f0f1f3\` radius 5 padding \`2px 7px\`. Then the content (mini table rows mono 12.5). Footer 12 \`#6c7079\`: \`Opens in the side panel on ⏎\` · spacer · \`Esc dismiss\`. **Voice never reads codes aloud character by character.**

**Long answer:** label \`SPEAKING SUMMARY · 0:09 / 0:14\`; Stop with square + \`Esc\`; progress bar 3px (track \`#e6e7ea\`, fill \`#2563eb\`, radius 2) showing playback; transcript; footer (top \`1px dashed #d6d8dc\`, padding-top 9, 12.5 \`#6c7079\`): \`file-text\` 13 · \`Full brief · 7 flights · 2 min to read aloud\` · \`Show full\` 600 \`#1d4ed8\`. Threshold: over ~20 seconds of speech → summarise. **It says when it's summarising.**

**Both at once — reading position** (in the panel/thread): label \`READING 2 OF 3\`; text 14.5/1.65: sentences already spoken \`#17181c\`; the sentence being spoken \`#17181c\` on \`#e8effe\` with \`box-shadow 0 0 0 2px #e8effe\`, radius 3; not yet spoken \`#9aa0a8\`. **Click any sentence to jump there. Scrolling away doesn't stop the voice; Esc does.** A verbatim block in the reply carries \`VERBATIM · LIM-0412 · NOT READ ALOUD\`.

**Round-1 spoken transcript** (Ops Agent D4) — also valid in the full-page thread: orb 30px speaking · progress 3px · \`0:07 / 0:19\` mono 11.5 · Stop (12.5 radius 7). Note under it (verbatim): \`Codes are spelled out when spoken ("Bravo Tango India four seven two" is off by default — setting). Verbatim limitations are never read aloud; the agent says "the limitation is on screen".\` The phonetic-spelling setting is **not drawn** in Settings (§16).

**Content source:** TTS engine and word/sentence timing marks — \`SOURCE UNKNOWN — developer to wire\`. The reading-position highlight needs sentence-level timestamps.

### 4.26 Panel shell

See §6 for the full screen. Shell parts:

- Width **420px default**, drag the left edge **360–600px**, remembered per user. Resize handle: 6×44, bg \`#d6d8dc\`, radius 3, at \`left -3px\`, vertically centred, \`cursor: ew-resize\`.
- White, \`border-left 1px #e6e7ea\`; in overlay mode + \`shadow.panel.overlay\`.
- Header: height **60** (matches the shell header in A1; drawn 52–56 elsewhere — build 60), bottom \`#eef0f2\`, padding \`0 10px 0 16px\`, gap 6: static ring mark 18px · \`Ops Agent\` 14.5/700, margin-left 4, flex 1 · icon buttons 30×30 radius 8, icon 16 \`#6c7079\`, hover bg \`#f0f1f3\`:

| Icon | Title / tooltip | Action |
|---|---|---|
| \`history\` | \`History\` | Opens panel history (§6.10) |
| \`square-pen\` | \`New thread\` | Starts a new thread with the current context |
| \`maximize-2\` | \`Open full page\` | Expand transition (§6.12), \`⌘⇧J\` |
| \`minus\` | \`Minimise\` | Minimised tab (§6.13) |
| \`x\` | \`Close · Esc\` | Closes; thread kept |

- Body: padding \`14px 16px\`, column gap 12–14, scrolls (\`overflow-y: auto\`), newest at bottom, auto-scroll to bottom while streaming unless the user has scrolled up (spec default).
- Composer: §4.17 panel variant, bottom-pinned.

### 4.27 Buttons, pills, badges, keycaps

| Element | Values |
|---|---|
| Primary button | bg \`#2563eb\`, white, 600; hover \`#1d4ed8\`. Large 14px padding \`10px 16px\` radius 9; standard 13.5px padding \`9px 14px\` radius 9; small 13px padding \`8px 12px\` radius 8; xs 12.5px padding \`6px 11px\` radius 7 |
| Secondary button | white, \`1px #d6d8dc\`, \`#17181c\` 600, same sizes (padding 1px less vertically) |
| Ghost button | transparent, \`#3a3d44\` 600; hover \`#f0f1f3\` |
| Destructive button | bg \`#e5484d\` white; disabled \`#f2a3a5\` |
| Disabled (non-destructive) | **not drawn** — spec default: 50% opacity, \`cursor: not-allowed\` |
| Focus ring (all interactive) | **not drawn except inputs** — spec default: \`outline: 2px solid #2563eb; outline-offset: 2px\` on \`:focus-visible\` |
| Status pill | 12/600, padding \`4px 10px\`, radius 999, tint + text colour per §2.1 status |
| Tag (small) | 10.5–11/700, padding \`2px 6–7px\`, radius 4–5 |
| Keycap (in buttons) | mono 11, opacity .7–.75, margin-left 6 |
| Keycap (standalone, sidebar) | mono 10.5/600, \`#6c7079\`, white, \`1px #d6d8dc\`, radius 5, padding \`1px 5px\` |
| Header status pill (full page) | 12/600 \`#3a3d44\`, bg \`#f5f6f7\`, \`1px #e6e7ea\`, radius 999, padding \`5px 10px\`, icon 13 |

---

## 5. Screen: sidebar entry

**Purpose.** Makes the agent findable in the existing console nav and shows its keyboard shortcut. Everyone sees it; the Knowledge base badge is for approvers.

**Placement.** A top-level item **between Digital Wall and Reports & Issues**.

**Expanded sidebar (244px)** — Ops Agent Views, Sidebar entry; Ops Agent A.

- Item: flex gap 10, padding \`8px 9px\`, radius 9, 13.5px. Icon \`circle-dot\` 17. Label \`Ops Agent\`. Keycap \`⌘J\` right.
- Active (agent page open): bg \`#e9ebee\`, label 700 \`#17181c\`, icon \`#1d4ed8\`.
- Panel open on another page (Side Panel A1): bg \`#eef4ff\`, label 600 \`#1d4ed8\`, keycap \`#1d4ed8\` on white with \`1px #b9d0ff\`.
- Inactive: 500 \`#3a3d44\`, icon \`#6c7079\`.
- Sub-items (when on an agent page): container margin \`2px 0 8px 18px\`, padding-left 9, \`border-left 1px #dcdee2\`, gap 1. Each: flex gap 8, padding \`6px 9px\`, radius 7, 13px, icon 15 \`currentColor\`. Active: white bg, 700 \`#1d4ed8\`. Inactive: 500 \`#3a3d44\`.

| Sub-item | Icon | Route |
|---|---|---|
| \`Chat\` | \`message-square\` | full-page chat §7 |
| \`History\` | \`history\` | §9 |
| \`Knowledge base\` | \`library\` | §10 — badge: approval count, 11/700 \`#b45309\` on \`#fef3e2\`, padding \`1px 6px\`, radius 5; **approvers only** |
| \`Activity log\` | \`scroll-text\` | §11 |
| \`Settings\` | \`settings-2\` | §12 (admins) |

**Rail (68px):** 40×34–36 buttons, radius 9, icon 17 (sub-items 14). Ops Agent active bg \`#e9ebee\`, icon \`#1d4ed8\`. Knowledge base shows a 7px \`#f59e0b\` dot at \`top 4px; right 6px\` instead of the count. Tooltip = label (\`title\`).

**Deep-context sidebar** (e.g. Digital Wall, Side Panel A3): the Ops Agent entry is a pinned block at the bottom: margin \`0 10px 12px\`, padding \`8px 10px\`, radius 9, bg \`#eef4ff\`, 13/600 \`#1d4ed8\`, static ring mark 14px, label, keycap mono 10.5 \`⌘J\`.

**The sidebar is never changed by the panel.** Expanded, rail or deep context stay as the user left them.

---
## 6. Screen: side panel

**Purpose.** The most common way the agent is used: the dispatcher is already looking at something and has a question about it. The panel is useful *because* of what's behind it — it knows the page, the selection, and can change the page in front of the user's eyes.

### 6.1 Open and close

| Action | Trigger |
|---|---|
| Open | \`⌘J\` anywhere (Ctrl+J on Windows); the Ops Agent sidebar item; "Ask about…" on any selected record (e.g. \`Ask about KLJ7226 ⌘J\` button in the page header) |
| Close | \`⌘J\` again; \`Esc\` on an empty composer (when no menu is open and nothing is streaming); \`x\` in the header |
| After close | The thread survives until "New thread". Reopening shows it |

"Ask about…" page-header button (Side Panel A1, when closed): secondary, 13.5/600, padding \`9px 14px\`, radius 10, gap 8; static ring mark 14px \`#1d4ed8\` (2px border, 5px dot); label \`Ask about {record}\`; keycap mono 11 \`#9aa0a8\` \`⌘J\`.

Open/close animation: **not drawn** (§16). Spec default: panel slides in from the right, \`transform: translateX(100%) → 0\`, 200 ms \`ease.out\`; close 160 ms \`ease.in\`; in push mode the page width animates with it. Reduced motion: no slide, instant.

**Focus on open:** the composer (spec default; so the user can type immediately). **On close:** focus returns to the element that opened it.

### 6.2 Push vs overlay

- **Push (page compresses):** when the content area keeps **≥ 900px** after the panel takes its width. ≈ screens 1600px and wider with the expanded sidebar. The page reflows exactly as it would at that width without the panel (e.g. Flights table: A1 keeps 7 columns at 1680).
- **Overlay:** otherwise. The panel covers the right of the page with \`shadow.panel.overlay\`, **no scrim**; the page stays usable and scrolls under it. **At 1280 it always overlays.** The page doesn't move when the panel opens or closes.
- **Why no scrim:** the whole point is to keep working on the page.

### 6.3 Sidebar states × widths (drawn frames)

| Frame | Page | Sidebar | Viewport | Mode |
|---|---|---|---|---|
| A1 | Flights list, KLJ7226 selected | Expanded 244 | 1680 × 860 | Push |
| A2 | EVRA airport page, NOTAM tab | Rail 68 | 1280 × 800 | Overlay (panel drawn 400px) |
| A3 / A4 | Digital Wall → Limitations (wall console) | Deep context 244 | 1440 × 800 | Push (panel 420) |

**Not drawn:** expanded sidebar at 1280; rail on a large monitor; any panel below 1280 (tablet/phone). See §16.

### 6.4 Layout of the panel

§4.26 shell + body contents, top to bottom:
1. Context chip §4.21 (or none)
2. Thread (§4.3, §4.4 panel variants)
3. Composer §4.17 panel

### 6.5 Frame A1 — Flights (content reference)

Page: title \`Flights\` 26/800, sub \`Today · 23 Sep · 14 flights\` 14.5 \`#6c7079\`. Table white radius 14; columns \`110px minmax(0,1.3fr) 100px minmax(0,1fr) 80px 80px 110px\` = \`CALLSIGN ROUTE REG OPERATOR ETD DELAY STATUS\`; header 11/700/0.06em \`#9aa0a8\` padding \`11px 18px\` bg \`#fbfbfc\`; rows padding \`13px 18px\`, 14px. Selected row (the panel's context) bg \`#eef4ff\` + \`inset 3px 0 0 #2563eb\`.

Panel conversation (sample, verbatim):

\`\`\`
[chip] Asking about flight KLJ7226
[user] Why is this delayed?
[tools] Used 3 tools · 1.4 s
[agent] Inbound late. LY-KLJ left Athens 38 minutes behind on a Eurocontrol slot¹, so the
        turnaround at Riga now finishes at 13:05Z. The new CTOT is 13:14Z².
[flight card] KLJ7226 · KlasJet · LY-KLJ · B737-500 · +40
              EVRA 12:35Z → 13:15Z   →   LGAV 16:20Z → 17:00Z
              CTOT 13:14Z  INBOUND LATE
[sources] 1 Leon · LY-KLJ rotation   2 Eurocontrol NM B2B
[composer] Ask about KLJ7226…
\`\`\`

### 6.6 Empty states (B1–B3)

Panel height as drawn 640 min; body padding 18, gap 16. Headline §2.2 \`type.empty-title.panel\`; sub 13.5/1.55 \`#6c7079\`; questions §4.22 panel.

**B1 — Airport (context)**

\`\`\`
[chip map-pin] Asking about EVRA
What do you need to know about Riga?
I can see the NOTAM tab you have open, plus EVRA weather, AIP and today's flights through it.
NOTAM         Any NOTAMs I should know about?
WEATHER       Will the TAF affect this afternoon's departures?
DOCUMENTS     Email me the AD 2 and the de-icing chart.
LIMITATIONS   What limitations apply at EVRA today?        (eyebrow #6d28d9; others #1d4ed8)
Placeholder:  Ask about EVRA…
\`\`\`

**B2 — Wall console (context)**

\`\`\`
[chip file-check] Asking about NOTAM Check
3 airports still need checking today.
The agent read the page before you asked. Start there, or ask anything else.
NOTAM CHECK         Which airports still need checking today?           (eyebrow #e5484d)
NOTAM CHECK         Summarise the new NOTAMs at LFPG, EPWA and ESSA.    (#1d4ed8)
WALL · ASKS FIRST   Mark the ones I've read as checked.                 (#15803d)
Placeholder:  Ask about NOTAM Check…
\`\`\`

**B3 — No context (opened from the Dashboard).** The weaker case; it must still feel purposeful, so it leads with live state and recent threads.

\`\`\`
(no chip)
Morning, Dmitrijs. 14 flights today, 2 delayed.
Opened from the dashboard, so there's no page to ask about. These come from what's happening now, not a fixed list.
NOW         Why are GBJ88 and KLJ7226 delayed?                    (#b45309)
NOW         Which flights still have unreviewed NOTAMs?            (#e5484d)
DOCUMENTS   /aip EGLL AD 2                                         (#1d4ed8)
PICK UP WHERE YOU LEFT OFF
  BTI472 morning prep      07:42Z
  LFPG slot and AD 2       07:22Z
Placeholder:  Ask, @ a flight or airport, / for an action…
\`\`\`

Recent list: eyebrow 10.5/700/0.1em \`#9aa0a8\`; rows 13px, title 600, time mono 11.5 \`#9aa0a8\`; click opens that thread. Greeting uses the user's first name and a live count — \`SOURCE UNKNOWN\`. Greeting for other times of day: **not drawn**.

### 6.7 Replies at panel width

All reply types have a panel variant in their component section: flight card §4.9, airport §4.10, table §4.13 (reflow + Full view), document §4.11, mono §4.14 (wrap rules), verbatim §4.8 (never degrades), sources §4.7 C, confirmation §4.15.

A2 conversation sample (airport page, overlay):

\`\`\`
[chip] Asking about EVRA · NOTAM tab
[user] Any NOTAMs I should know about?
[agent] Two of the 17 matter for today's departures. Runway 18 has a displaced threshold
        until Friday, and ILS 36 glide path is out 22:00–04:00Z tonight.
[mono NOTAM · RAW · 2]  Copy   Show on page ↖
A2231/26 EVRA RWY 18 THR DISPLACED 300M. LDA 2900M. 2309230600-2309261800
—
A2238/26 EVRA ILS RWY 36 GP U/S. 2309232200-2309240400
[airport compact] EVRA VFR · METAR 0750Z · 20005KT 9999 SCT030 14/08 Q1016
                  17 NOTAM · 2 new · CAA Latvia +371 6783 0936
[sources] AIP Portal · NOTAM sync 07:40Z
\`\`\`

### 6.8 When the agent changes the page behind the panel (A3 → A4)

**Why this matters:** it is the best argument for the panel existing; it must be designed, not an accident.

Request: \`Add a limitation: EVRA de-icing pad C closed until 18:00Z, show it on the wall.\`

**While pending (A3)** — nothing is written:

- **Page:** a ghost row at the position the record will land (top of the list): bg \`#f7faff\`, \`1.5px dashed #2563eb\`, radius 12; ID and title \`#1d4ed8\`; subtitle \`Pending · Ops Agent · waiting for your confirmation\`; validity mono \`now – 18:00Z\`; badge \`Pending\` 11.5/700 \`#1d4ed8\` transparent bg \`1px dashed #2563eb\` radius 999. Page subtitle \`4 active · 1 pending\`.
- **Wall preview** (230×92, bg \`#0f1420\`, radius 10; label \`WALL PREVIEW · LIVE\` 9.5/700/0.1em \`#8c97ad\`; rows 16px mono 9.5 white radius 4): the pending item outlined \`inset 0 0 0 1px #6ea0ff\`, transparent fill, text \`EVRA · pad C closed (pending)\`.
- **Panel:** standard confirmation (§4.15 B, "Change that affects the page behind") with \`previewed on the page ←\`. Composer locked: \`Confirm or cancel the change above\`, bg \`#f5f6f7\`.
- **Cancel** → ghost row and outlined preview removed (spec default: fade out 150 ms).

**After Confirm (A4)** — only after the tool returns success:

- Page updates **live**. The new row: bg \`#f2f7ff\`, \`1px #b9d0ff\`, \`inset 4px 0 0 #2563eb\`; subtitle \`Use pads A or B · New · by Ops Agent for Dmitrijs Kalnins\`; badge \`On wall\` green. The highlight holds **10 s** (then reverts to a normal row; transition not drawn — spec default 400 ms fade).
- Banner above the list: bg \`#f2f7ff\`, \`1px #b9d0ff\`, radius 10, padding \`9px 14px\`, 13px, gap 10: ring mark 14 \`#1d4ed8\` · \`LIM-0421 added by Ops Agent for Dmitrijs Kalnins · 08:14:20Z · on the wall now\` (\`#1d4ed8\`, the first part bold) · \`Open\` 600 \`#17181c\` · \`Revert…\` 600 \`#6c7079\`. Revert opens a new confirmation (a revert is itself a write).
- Wall preview: the item filled \`#2563eb\`.
- Page subtitle \`5 active\`.
- **Every other user on that page** gets the same row with a quieter highlight (style **not drawn**; spec default: \`inset 4px 0 0 #93b4f5\`, no banner).
- If the change lands off-screen, the page scrolls to it (spec text from the round-3 draft; spec default: smooth scroll, reduced-motion instant).
- Panel: Applied record (§4.15 D, last row).

Page ↔ panel event contract: \`SOURCE UNKNOWN — developer to wire\`. The page must subscribe to data changes and render pending previews supplied by the panel.

### 6.9 Voice in the panel

- With the panel open, the compact bar **docks into the panel composer**: composer border \`#2563eb\` + focus halo, radius 14, padding \`10px 12px\`. Top row gap 10: ring mark 16 · 10 static-drawn bars (animated in production, §4.2) · spacer · \`0:03 · Esc\` mono 11 \`#9aa0a8\`. Transcript types into the field 14/1.5 with grey provisional tail and caret. Release to send; it lands in the thread as a normal message. The context chip applies. (An alternative draft footer \`Release ⌥ Space to send · Esc discard\` + \`Reply: auto\` pill — build the pill; see §4.25.)
- Keybind from elsewhere with the panel closed: §4.23 short-answer flow (C2): 1 · hold anywhere → bar; 2 · short answer → card above the bar for 8 s, panel stays closed; 3 · needs room → the panel opens with the thread already in it.

### 6.10 History in the panel (C3)

Header 52: \`arrow-left\` 16 (back to thread) · \`History\` 14/700. Search field: height 38, \`1px #d6d8dc\`, radius 10, \`search\` 14, placeholder \`Search threads\`. Group eyebrow 10.5/700/0.1em \`#9aa0a8\` padding \`0 12px 4px\`.

Groups in order: \`ABOUT {current record}\` (e.g. \`ABOUT KLJ7226\`) → \`TODAY · ELSEWHERE\` → \`YESTERDAY\` → older. Row padding \`9px 12px\`, bottom \`#f2f3f5\`: title 13.5/600 · time mono 11 \`#9aa0a8\` · snippet 12.5 \`#6c7079\` ellipsis. Current thread row bg \`#f6faff\`. Footer: \`All history in full page →\` 12.5/600 \`#1d4ed8\`, top border.

Sample rows (verbatim): \`Why is this delayed?\` 08:12Z \`Inbound late from Athens; new CTOT 13:14Z\` · \`BTI472 morning prep\` 07:42Z \`Email both to Anna Kerimova. — Sent\` · \`LFPG slot and AD 2\` 07:22Z \`EAD offline — cached AIRAC 2609\` · \`Heathrow crosswind — A220 fleet\` 17:05Z \`Quoted LIM-0412 §3.2–3.4\` · \`Evening shift note\` 15:48Z \`1 file · crew brief\`.

### 6.11 Loading, streaming, error, offline at panel width (C6)

| State | Appearance |
|---|---|
| Opening, reading the page | Context chip loading (§4.21) + two skeleton lines 12px tall, radius 4, \`#f0f1f3\`, widths 80% / 60%. Copy: \`Composer is usable at once; context attaches when ready (< 300 ms).\` |
| Streaming | Running step row \`Checking CTOT history for KLJ7226…\` with pulsing \`loader-circle\` 12; text 13.5/1.55 with caret 7×15; \`Stop · Esc\` |
| Tool failed | §4.16 panel variant |
| Offline | §4.16 panel variant |

### 6.12 Expand to full page (C4)

Trigger: \`maximize-2\` in the header or \`⌘⇧J\`. **Moves the current conversation into the full chat view, keeping everything** (messages, scroll position, pending confirmation, context).

| Step | What happens |
|---|---|
| 1 · Panel | Thread, context chip and any pending confirmation |
| 2 · 200 ms | The panel widens over the page, which fades; the thread keeps its scroll position |
| 3 · Full page | Same thread at \`/agent/t/…\`; the context chip becomes a "From Flights · KLJ7226" link back. Back returns to the page with the panel open |

Motion: panel width 420 → full content width, page opacity 1 → 0.35 → 0, **200 ms** total, easing \`NOT IN DESIGN\` (spec default \`ease.out\`). Reduced motion: cross-fade 100 ms or instant route change.

### 6.13 Minimised (C5)

The panel collapses to a tab on the right edge so the page gets its width back while the agent works.

- Tab: 44 wide, white, \`1px #d6d8dc\` without right border, radius \`12px 0 0 12px\`, \`shadow.panel.minimised\`, padding \`10px 0\`, column centred gap 8, 34px from the top of the content area.
- Contents: 18px ring with a transparent top segment (spinning, §14 P3) · vertical text (\`writing-mode: vertical-rl\`) 11/600 \`#1d4ed8\` \`Working · 2 of 4\` · 8px \`#2563eb\` dot pulsing.

| State | Appearance |
|---|---|
| Working | Blue ring, step count. The page gets its width back |
| Needs you | Amber tab \`Confirm 1 change\`; **never auto-expands over the page**. (Amber values not drawn — spec default: text \`#b45309\`, bg \`#fef3e2\`, border \`#f6ddb0\`) |
| Done | Ink dot for 30 s, then the tab hides. The reply waits in the thread |

Click tab or \`⌘J\` → reopens.

### 6.14 Wall console vs wall display

- The **wall console** (Digital Wall pages in the console) is a light console page; the panel is the normal light panel. The dark wall preview on those pages keeps its dark styling; neither restyles the other.
- The panel is **never available on the wall display itself**: it is a shared screen with no keyboard, and what the room sees should only change through a confirmed action from someone's console.

---

## 7. Screen: full-page chat

**Purpose.** A deliberate session: planning, long threads, briefings. Opened from Ops Agent → Chat, History, or Expand from the panel.

### 7.1 Layout

- Shell sidebar (244 expanded; rail/deep context as the user left it).
- Main column, flex column:
  1. **Header** — height 60, white, bottom \`#e6e7ea\`, padding \`0 24px\`, gap 14.
  2. **Thread** — flex 1, scrolls; padding \`32px 24px 8px\`; inner column **max-width 800px**, centred; gap between messages 30.
  3. **Composer** — bottom-pinned (§4.17).
- Right-hand annotation cards in the design file are **documentation, not UI. Do not build them.**
- Responsive: the 800px column centres on any width ≥ 1024 (spec default). Below 1024 / tablet / phone: **not designed**.

### 7.2 Header elements (left → right)

| Element | Values | Behaviour | Source |
|---|---|---|---|
| Thread title | 16/700 e.g. \`BTI472 morning prep\` | Static. Rename: **not drawn** | Auto-generated from the first message — \`SOURCE UNKNOWN\` |
| Thread meta | mono 12 \`#9aa0a8\` \`23 SEP · started 07:42Z · 12 messages\` | Static | thread record |
| \`Web search on\` pill | §4.27 header pill, \`globe\` 13 \`#b45309\` | Static indicator; mirrors Settings. Off state **not drawn** (spec default: hide pill) | Settings |
| \`Changes: ask first\` pill | \`shield-check\` 13 \`#3a3d44\` | Static; states the write policy | Settings |
| Divider | 1×24 \`#e6e7ea\` | — | — |
| Side-panel button | 36×36, \`1px #e6e7ea\`, radius 9, \`panel-right\` 16 \`#6c7079\`, hover \`#f5f6f7\`, title \`Open as side panel\` | Moves the thread into the panel over the last console page (spec default: over Dashboard if none) | — |
| \`New chat\` | primary standard, \`plus\` 15 white, gap 7 | New empty thread → empty state | — |

### 7.3 First open — empty state (B1)

Centre column: orb 64 idle · headline \`Ask about flights, airports, documents or the wall.\` 24/800/-0.02em · sub \`Every answer shows where it came from. Limitations are quoted exactly. Nothing changes until you confirm it.\` 15/1.55 \`#6c7079\` max 520 · 4 suggestion cards (§4.22 full) · composer. Panel padding in design \`56px 48px 28px\`, gap 26.

### 7.4 The thread end to end (reference conversation, verbatim)

This is the canonical conversation. Build fixtures from it.

**1 — User 07:42Z:** \`Brief me on [BTI472] — anything I should know before the crew arrives?\`

**Agent 07:42Z**
- Tool activity §4.5 B: \`Used 4 tools · read only · 2.4 s\`:

| Tool | Arguments | Result | Time |
|---|---|---|---|
| \`flights.get\` | \`{"callsign":"BTI472","date":"2026-09-23"}\` | \`1 flight · Leon · CTOT 11:52Z\` | \`312 ms\` |
| \`notam.status\` | \`{"icao":["EVRA","EGLL"]}\` | \`EVRA checked 06:30Z · EGLL 4 unreviewed\` | \`540 ms\` |
| \`weather.metar_taf\` | \`{"icao":"EGLL"}\` | \`METAR 0720Z · TAF 0459Z\` | \`880 ms\` |
| \`limitations.search\` | \`{"registration":"YL-ABC","tier":"authoritative"}\` | \`1 match · LIM-0412 rev 3\` | \`690 ms\` |

- Prose: \`BTI472 is running 15 minutes late on a CTOT¹. Heathrow has four NOTAMs nobody has reviewed yet², and the arrival forecast brings gusts that bring a YL-ABC crosswind limitation into play³⁴.\`
- Flight card (spacious) — BTI472 airBaltic YL-ABC A220-300; \`Delayed · CTOT\`, \`On wall\`; EVRA Riga STD 11:40Z ETD 11:55Z +15; EGLL London Heathrow STA 13:10Z ETA 13:22Z +12; markers \`CTOT 11:52Z\`, \`NOTAM unreviewed · EGLL\`, \`1 limitation\`; \`Open in Flights\`.
- Airport summary — EGLL, per §4.10.
- Verbatim block — LIM-0412 rev 3. Body text exactly:

\`\`\`
3.2  Maximum demonstrated crosswind for landing on a WET runway: 25 kt, including gusts.
3.3  When the reported crosswind component exceeds 20 kt, AUTOLAND IS NOT PERMITTED. The approach shall be flown manually by the Commander.
3.4  These values supersede AFM 4.2 for this registration until the rudder PCU modification (SB 27-0114) is embodied.
\`\`\`

Footer \`Approved 02 Sep 2026 by N. Ozola, Ops Quality · authoritative tier\` · \`sha256 4f2a…c91e\`.
- Agent's reading: \`With 240° 14G26 kt forecast and 27L in use, the gust crosswind is about 21 kt. That is inside the 25 kt limit but above the 20 kt autoland threshold, so the crew should plan a manual approach if the TEMPO verifies. I'd review the four EGLL NOTAMs before the crew brief at 10:40Z.\`
- Sources (4): \`1 Internal Leon flights · BTI472\` · \`2 Internal NOTAM Check · EGLL\` · \`3 Company Limitations register · LIM-0412 rev 3\` · \`4 Web aviationweather.gov · EGLL TAF\`.

**2 — User 07:44Z:** \`Show me the raw TAF for Heathrow.\` → Agent: one-line tool summary \`Fetched TAF EGLL  weather.taf · 410 ms\`; mono block (TAF above, header meta \`issued 230459Z · valid 2306/2412\`); \`The TEMPO covers BTI472's arrival window (13:22Z).\`; single source \`Web aviationweather.gov · retrieved 07:44Z\`.

**3 — User 07:46Z:** \`Which flights today still have unreviewed NOTAMs?\` → \`Queried today's flights against NOTAM Check  notam.unreviewed · 620 ms\`; \`Four flights, across four airports:\`; table:

| FLIGHT | ROUTE | ETD | AIRPORT | NOTAMS | LAST CHECKED |
|---|---|---|---|---|---|
| BTI472 | EVRA → EGLL | 11:55Z | EGLL | 4 new | 22 SEP 18:10Z |
| GBJ88 | EPWA → EVRA | 12:30Z | EPWA | 2 new | 22 SEP 21:45Z |
| PNV210 | EVRA → LFPG | 12:05Z | LFPG | 7 new | never today |
| ABT19 | EVRA → ESSA | 13:15Z | ESSA | 1 new | 23 SEP 05:02Z |

Source \`Internal Digital Wall · NOTAM Check, live\`.

**4 — User 07:48Z:** \`I've read the Heathrow ones. Mark EGLL checked and put [GBJ88] on the wall.\` → Agent: confirmation (two changes, §4.15 B multi) → after confirm, Applied record:
- \`EGLL marked NOTAM checked\` / \`NOTAM Check · Unreviewed → Checked by Dmitrijs Kalnins · wall sign updated\` / \`notam_check.mark · nc_7f31\`
- \`GBJ88 put on the wall\` / \`Replaced BTI472 (opened by Artyom Gud). 3 people in the ops room saw the change.\` / \`wall.show · wl_a204\`

**5 — User 07:51Z:** \`[/aip] EVRA AD 2 — and make me a one-page crew briefing for BTI472 with the limitation in it.\` → \`Used 2 tools  aip.get · file.generate_pdf · 3.1 s\`; document result; generated file; sources \`Internal AIP Portal · EAD sync 06:10Z\`, \`Company LIM-0412 rev 3\`.

**6 — User 07:53Z:** \`Email both to [Anna Kerimova].\` → pending email confirmation; composer locked. Confirm → Sent record. Cancel → Cancelled record.

### 7.5 Streaming and stop (B2)

Sample: user \`[/brief] tomorrow's first wave out of EVRA\`; avatar orb thinking; live step list; streaming text \`Seven departures before 09:00Z tomorrow. Five are clean. Two need attention: ABT19 has a CTOT and ESSA reports runway 01L closed 0600–0900Z, and PNV210 is on YL-PVA, which carries a▌\`; Stop. Stopped state per §4.6.

### 7.6 Behaviour

- **Load order:** header + composer render immediately; thread messages load (skeleton: **not drawn**, spec default: 3 grey blocks as §6.11); scroll to bottom.
- **Focus on open:** composer.
- **Far too much data:** tables > 4 rows collapse on full page? — **not drawn** for full page; the full page shows up to 10 rows inline (spec default) with \`Show all {n}\`; panel rule is §4.13.
- **Long thread:** no virtualisation drawn — spec default: virtualise above 200 messages.
- **Tab order:** header controls → thread (each message's interactive elements in order) → composer attach/mention/command → input → voice → send.

### 7.7 Command palette (Alternatives 1c) — \`DECISION OPEN\`

Designed as an alternative for one-shot questions via \`⌘K\`; not confirmed for build (§16). If built: scrim \`rgba(23,24,28,.25)\`; box 520 wide at top 56, radius 16, \`shadow 0 24px 60px rgba(16,18,22,.3)\`; input row padding \`14px 16px\` with ring mark 16 blue, 15px text, \`⌘K\`; answer 14/1.5 headline (bold subject) + result chips (\`table-2\` \`3 affected flights\`, \`file-text\` file name mono); actions list rows padding \`8px 10px\` radius 8, highlighted \`#eef4ff\`: \`Show the 3 flights ⏎\`, \`Download LF_AD_2_LFPG_en.pdf ⌘D\`, \`Continue in a thread ⌘⏎\`. One answer, no thread.

---
## 8. Screen: voice

**Purpose.** Ask by voice without leaving the page (compact bar), or hold a hands-free exchange (overlay). The components are §4.1, §4.2, §4.23, §4.24, §4.25. This section covers entry, permission and the order of events.

### 8.1 Order of events (compact bar)

1. \`⌥ Space\` keydown (held ≥ 150 ms — spec default to distinguish from double-tap) → bar appears (120 ms) in **Invoked**. Mic permission checked.
2. First audio frame → **Listening**; waveform live; transcript streams.
3. Low-confidence code token → **Uncertain** marking + popover; listening continues.
4. Key released → **Processing**: transcript sent as a message (to the panel thread if open, else to a background thread); current tool step shown.
5. Answer → delivery per §4.25 rules: short card above the bar (8 s) / spoken / panel opens for content that needs room. Confirmation → panel (if open) or modal (§4.15 E).
6. \`Esc\` at any point before step 4 → discard, bar exits. After step 4, \`Esc\` stops the reply (and speech).

Double-tap \`⌥ Space\` (two presses within 300 ms — spec default) → overlay (§4.24) instead.

### 8.2 Microphone permission not yet granted (Ops Agent D5)

Shown the first time voice is invoked. Card white, \`1px #e6e7ea\`, radius 14, padding 16, column gap 10 (in the thread or panel; spec default for a keybind invocation with no panel: open the panel with this card).

\`\`\`
[orb idle 30, still]  Talk to the agent from anywhere          (14.5/700)
Hold ⌥ Space on any console page. Audio is transcribed and discarded; only the text is kept in the thread.
[Allow microphone] (primary)   [Not now] (ghost)
\`\`\`

\`Allow microphone\` → browser permission prompt. Granted → proceed to Listening. Denied → §8.3.

### 8.3 Microphone unavailable (Ops Agent D6)

Card border \`#f7cfd0\`, otherwise as §8.2:

\`\`\`
[orb error 30, still]  Microphone blocked for this site
Chrome is blocking it. Click the ⊘ in the address bar → Microphone → Allow, then reload. On the ops-room PC no microphone is connected — typing works the same.
[Try again] (secondary)   [Type instead] (ghost)
\`\`\`

The browser name and the instruction must match the actual browser (spec rule; only Chrome is drawn). The bar-level errors are in §4.23.

### 8.4 Data handling (copy is a promise)

\`Audio is transcribed and discarded; only the text is kept in the thread.\` Settings repeats: \`Audio is discarded after transcription.\` The implementation must not store audio. If that changes, the copy must change.

---

## 9. Screen: History

Ops Agent Views. **Purpose:** find and reopen a past thread; enough context to recognise one.

**Layout.** View padding \`30px 32px\`, column gap 18. Title \`History\` §2.2 view-title; sub \`Your conversations with the agent. Searches titles, messages and the entities mentioned.\` 15 \`#6c7079\`. Right: \`New chat\` (primary large, radius 10).

**Search row** (flex gap 10, wrap):
- Search field: height 42, white, radius 10, padding \`0 13px\`, gap 9, flex 1, min-width 260; \`search\` 16 \`#9aa0a8\`; query (mono when it's a code, e.g. \`EGLL\`); right count 12.5 \`#9aa0a8\` \`5 of 63\`. Focus: \`#2563eb\` border + halo.
- Filter chips 13/600, padding \`8px 12px\`, radius 999: selected \`#17181c\` bg white text; unselected white \`1px #d6d8dc\` \`#17181c\`. Chips: \`Mine\` \`With changes\` \`With files\` \`Voice\`. Multi-select (spec default).

**List** — white card \`1px #e6e7ea\` radius 14.
- Group header (\`TODAY\`, \`YESTERDAY\`, \`LAST WEEK\`): 11/700/0.12em \`#9aa0a8\`, padding \`12px 18px 6px\`, bg \`#fbfbfc\`, bottom \`#eef0f2\`.
- Row: grid \`minmax(0,1fr) auto\`, gap 16, padding \`14px 18px\`, bottom \`#f2f3f5\`. Current/selected row bg \`#f6faff\`. Hover: **not drawn** — spec default \`#fbfbfc\`.
  - Title 14.5/700 + optional tag \`{n} CHANGES\` / \`1 CHANGE\` 11/700 \`#15803d\` on \`#e7f6ec\` radius 5 padding \`2px 7px\`.
  - Snippet 13.5 \`#6c7079\`, one line, ellipsis (last exchange).
  - Entity chips: mono 11.5/600 \`#1d4ed8\` on \`#eef4ff\` radius 5 padding \`2px 6px\`, gap 5.
  - Right: time mono 12 \`#6c7079\` (\`07:42Z\` today; \`22 SEP 17:05Z\` older) · meta 12 \`#9aa0a8\` (\`12 messages · 3 changes\`, \`Anna Kerimova shared\`, \`6 messages · voice\`, \`1 file\`, \`1 email sent\`).
- Click → opens the thread in full page.

Sample rows are in the design file; all dynamic. **Empty, loading, no-results states: not drawn** (§16). Sharing (\`Anna Kerimova shared\`) implies shared threads; the sharing UI is **not designed**.

---

## 10. Screen: Knowledge base

**Purpose.** Documents the agent can read, their indexing status, which tier each is in, and the **human approval step** before anything enters the authoritative tier. Uploaders, approvers and admins use it.

**Header.** \`Knowledge base\` + description (verbatim): \`Documents the agent can read. Authoritative documents are quoted verbatim and need an approver. Reference documents are searched and cited, never quoted as approved text.\` (the two tier names 600 \`#17181c\`). Right: \`Upload\` primary with \`upload\` 15. Upload flow (tier choice, metadata entry): **not drawn** (§16).

**Stat cards** — 4-column grid gap 12; card white radius 12 padding \`14px 16px\`; label 11/700/0.12em; value 26/800; sub 12.5 \`#6c7079\`.

| Label (colour) | Border | Value | Sub |
|---|---|---|---|
| \`AUTHORITATIVE\` \`#17181c\` | \`#17181c\` | \`18\` | \`quoted verbatim · 412 clauses\` |
| \`REFERENCE\` \`#9aa0a8\` | \`#e6e7ea\` | \`46\` | \`searched and cited\` |
| \`AWAITING APPROVAL\` \`#b45309\` | \`#f6ddb0\` | \`2\` | \`oldest 1 day\` |
| \`NEEDS ATTENTION\` \`#b91c1c\` | \`#f7cfd0\` | \`1\` | \`indexing failed\` |

Clicking a stat to filter: **not drawn**.

**Document table** (left, flex 1) — columns \`minmax(0,2.2fr) 1.1fr 1fr 1.1fr 1fr\` = \`DOCUMENT TIER STATUS OWNER UPDATED\`; header padding \`10px 18px\` bg \`#fbfbfc\`; rows padding \`12px 18px\`, clickable, selected row bg \`#fffaf0\`.
- Document: file tile 30×36 radius 5 bg \`#f5f6f7\` \`1px #e6e7ea\` with ext 8/800 \`#6c7079\` (\`PDF\` \`DOCX\` \`XLSX\`) · title 13.5/600 ellipsis · \`{ID} · {size}\` mono 11.5 \`#9aa0a8\`.
- Tier badge 11.5/700/0.04em radius 6 padding \`3px 8px\`:

| Tier | Style | Meaning |
|---|---|---|
| \`AUTHORITATIVE\` | white on \`#17181c\` | Approved; clauses quotable verbatim |
| \`AUTH · REQUESTED\` | \`#17181c\` on white, \`1px #17181c\` | Uploader asked for authoritative; awaiting approval; **not quotable** |
| \`REFERENCE\` | \`#3a3d44\` on white, \`1px #d6d8dc\` | Searched and cited only |

- Status: 8px dot + 12.5/600 text: \`Indexed\` (\`#16a34a\` / \`#15803d\`) · \`Awaiting approval\` (\`#f59e0b\` / \`#b45309\`) · \`Indexing · 62%\` (\`#2563eb\` / \`#1d4ed8\`) · \`Failed · scanned, no text\` (\`#e5484d\` / \`#b91c1c\`).
- Owner 12.5 \`#3a3d44\`; Updated mono 12 \`#6c7079\` (\`02 SEP 2026\`).

**Approval panel** (right, 440 wide) — the human approval step.

- Frame white, radius 14, \`1.5px\` border by state. Header padding \`12px 16px\`, bottom \`#eef0f2\`: icon 15 · title 13.5/700 · ID mono 11.5 \`#6c7079\` (\`LIM-0417\`).
- Body padding 16, column gap 12:
  - \`EPWA — winter operations limitations 2026/27\` 15/700; \`Uploaded by Anna Kerimova · 22 Sep 16:40Z · requested tier Authoritative\` 12.5 \`#6c7079\`.
  - Metadata grid \`110px 1fr\`, row gap 7, 13px: \`Extracted 14 limitation clauses · 3 pages\` · \`Applies to EPWA · all operators\` · \`Valid 01 NOV 2026 – 31 MAR 2027\` · \`Supersedes LIM-0301 rev 2\` · \`Checksum sha256 91bd…07e4\` (values mono where codes/dates).
  - Extraction check box (\`1px #e6e7ea\` radius 10): header \`CHECK THE EXTRACTED TEXT — CLAUSE 2.1 OF 14\` 11/700/0.1em bg \`#fbfbfc\`; clause 13.5/1.6 \`2.1  Departures from RWY 29 are NOT PERMITTED when the reported braking action is POOR or worse. Operators shall plan RWY 33 or delay.\`; footer \`✓ matches page 2 of the PDF\` 12/600 \`#15803d\` · \`Compare all 14\` link. **Why:** the approver is signing off the extracted text that will be quoted, not the PDF; they must see it.
  - Note 12.5 \`#6c7079\`: \`Approving puts these clauses in the verbatim tier: the agent will quote them exactly and cite you as approver. The uploader can't approve their own document.\`
  - Actions: \`Approve as authoritative\` (14/600 white on \`#17181c\`, padding \`10px 14px\`, radius 9, flex 1 — **the only black button**, because it creates black-frame content) · \`Reference only\` (secondary) · \`Reject\` (14/600 \`#e5484d\` on \`#fdecec\`, no border).

| State | Border | Header bg | Icon / colour | Title |
|---|---|---|---|---|
| Pending | \`#f6ddb0\` | \`#fffaf0\` | \`shield-alert\` \`#b45309\` | \`Approval needed · authoritative tier\` |
| Approved | \`#c7ead2\` | \`#f0faf3\` | \`shield-check\` \`#15803d\` | \`Approved as authoritative · by you 08:12Z · 14 clauses now quotable\` |
| Reference | \`#e6e7ea\` | \`#fbfbfc\` | \`book-open\` \`#3a3d44\` | \`Added as reference only · agent will cite, not quote\` |
| Rejected | \`#f7cfd0\` | \`#fdf3f3\` | \`x-circle\` \`#b91c1c\` | \`Rejected · Anna Kerimova notified with your note\` |

After a decision, the action row is replaced by a status box (bg \`#fbfbfc\`, \`1px #e6e7ea\`, radius 9, padding \`10px 12px\`, 13px) repeating the title. The design's \`Reset demo\` button is for review only — **do not build**. The rejection note input: **not drawn**.

**Rules:** the uploader cannot approve their own document (Approve button disabled for them — disabled style §4.27); approval is recorded in the Activity log; only approved clauses can render in the verbatim frame (§3).

---

## 11. Screen: Activity log

**Purpose.** Compliance surface: every tool the agent ran — who asked, what tool, what arguments, what result, confirmed or not. Designed to be read. Read-only, kept 24 months.

**Header.** \`Activity log\` + \`Every tool the agent ran, for whom, with what, and what came back. Read-only, kept 24 months. Click a row for the full record.\` Right: \`Export CSV\` (secondary large).

**Filters** (flex gap 10, wrap):
- Segmented control bg \`#eef0f2\` radius 10 padding 3: \`All\` \`Changes\` \`Sent\` \`Denied\`; segments 13/600 padding \`7px 12px\` radius 8; selected white + \`0 1px 2px rgba(0,0,0,.06)\` \`#17181c\`, others \`#6c7079\`.
- Dropdown buttons (secondary, radius 10): \`Person: anyone\` · \`Tool: any\` · date \`23 SEP 2026\` (mono). Menus: **not drawn**.

**Table** — columns \`110px 150px 90px 190px minmax(0,1fr) 170px 150px\` = \`TIME WHO ASKED KIND TOOL ARGUMENTS RESULT CONFIRMED\`. Row padding \`11px 18px\`, clickable; expanded row bg \`#f6faff\`.

| Column | Style |
|---|---|
| Time | mono 12.5 \`#3a3d44\` \`07:53:40Z\` |
| Who asked | 13/600 |
| Kind | 11/700/0.04em, radius 5, padding \`2px 7px\`: \`READ\` \`#475569\`/\`#eef1f5\` · \`WRITE\` \`#1d4ed8\`/\`#dbeafe\` · \`SEND\` \`#6d28d9\`/\`#ede9fe\` · \`FILE\` \`#15803d\`/\`#e7f6ec\` |
| Tool | mono 12.5/600 |
| Arguments | mono 12 \`#6c7079\`, one line, ellipsis |
| Result | 7px dot + 12.5/600, same colour: \`Delivered\`/\`Applied\`/\`3 results\`/\`1 file · 212 KB\` \`#16a34a\` · \`Not run\` \`#9aa0a8\` · \`Denied · 403\` \`#e5484d\` · \`Cached · EAD down\` \`#f59e0b\` |
| Confirmed | 12.5: \`Confirmed 07:53:40Z\` 600 \`#15803d\` · \`Declined 07:36:05Z\` 600 \`#6c7079\` · \`Not required\` 500 \`#9aa0a8\` · \`—\` |

**Note on the KIND colours:** \`SEND\` uses violet, which is also the Company tier colour. In this table it is a kind badge, not a source; it never appears next to a source chip. Left as designed; flagged §16.

**Expanded record** — padding \`4px 18px 16px 130px\`, 3-column grid gap 14, bg \`#fbfdff\`; each column has an eyebrow 11/700/0.1em \`#9aa0a8\`:
- \`REQUEST\` — the user's words in quotes 13.5/1.5 + \`Thread {link}\` 12 \`#6c7079\`.
- \`ARGUMENTS · RESULT\` — mono 12/1.6, bg \`#f5f6f7\`, radius 8, padding \`9px 11px\`, pre-wrap. Full arguments and result, e.g.

\`\`\`
flight: GBJ88
replaces: BTI472 (opened by Artyom Gud)
→ wall_id wl_a204 · live 07:49:13Z
→ notified: Artyom Gud
\`\`\`

- \`CONFIRMATION\` — 13/1.6 pre-wrap, e.g. \`Prompted 07:48:21Z with 2 changes\` / \`Confirmed both by Dmitrijs Kalnins 07:49:12Z (51 s)\` / \`Before: BTI472 on screen\` / \`After: GBJ88 on screen\`.

Only rows with a full record expand; one expanded at a time (click again collapses). Read rows without a record: \`NOT IN DESIGN\` whether they expand — spec default: yes, same layout, CONFIRMATION = \`Not required\`.

**Rules:** the log is append-only; rows cannot be edited or deleted from the UI. Denied and declined actions are logged. Pagination / infinite scroll: **not drawn**. Source: \`SOURCE UNKNOWN — developer to wire\`.

---

## 12. Screen: Agent settings

**Purpose.** Organisation settings, admins only (\`Organisation settings, admins only. Your own voice preferences are under Account.\`). 2-column grid gap 18.

**Capabilities** (left card) — eyebrow \`CAPABILITIES\` padding \`14px 18px 8px\`; rows padding \`13px 18px\`, top \`#f2f3f5\`, gap 14: label 14/600 + description 12.5/1.45 \`#6c7079\` · toggle.

Toggle: 44×26 radius 999, padding 3, knob 20×20 white radius 50% \`0 1px 3px rgba(0,0,0,.2)\`; on bg \`#16a34a\` knob right; off \`#cfd3d8\` knob left. Knob transition: **not drawn** (spec default 150 ms \`ease.out\` on \`transform\`).

| Label | Description (verbatim) | Default in design |
|---|---|---|
| \`Web search\` | \`Public sources, shown in amber with URL and time. Off: company and internal only.\` | on |
| \`Voice\` | \`Push-to-talk and the ⌥ Space keybind. Audio is discarded after transcription.\` | on |
| \`Write actions\` | \`Wall, NOTAM Check, limitations. Always asks first; this switch only removes the ability.\` | on |
| \`Send email\` | \`Through Resend, signed with the requester's name. Always asks first.\` | on |
| \`Auto-approve reference uploads\` | \`Authoritative uploads always need an approver regardless.\` | off |

**Why the write switch can't disable confirmation:** there is no "don't ask" mode. The switch removes the capability; confirmation is not configurable. Toggling a capability off is itself logged (spec rule). Save model: immediate (spec default; no save button drawn).

**Who can do what** (right, top card) — eyebrow \`WHO CAN DO WHAT\`; header row bg \`#fbfbfc\` padding \`8px 18px\` 11/700/0.04em: \`PERSON READ WALL EMAIL APPROVE KB\`; columns \`minmax(0,1.6fr) repeat(4,1fr)\`; rows padding \`10px 18px\`: avatar 26 circle (initials 10.5/700 white on a per-user colour) + name 13.5/600; cells centred 13/700: \`✓\` \`#16a34a\` · \`ask\` \`#1d4ed8\` (allowed, with confirmation) · \`—\` \`#c9cdd3\`. Footer 12.5 \`#6c7079\`: \`The agent never has more access than the person asking. Roles are set in Admin → Users.\` Read-only here; data from Admin → Users — \`SOURCE UNKNOWN\`.

**Usage** (right, bottom card) — padding \`16px 18px\`, gap 12: eyebrow \`USAGE · SEPTEMBER\` + right mono 12 \`model: claude-sonnet · voice: on\` (model name dynamic — \`SOURCE UNKNOWN\`) · \`€142.60\` 28/800 + \`of €250 monthly cap · 1,284 replies · 3,902 tool calls\` 13 \`#6c7079\` · bar 8px track \`#eef0f2\` fill \`#2563eb\` radius 999 at 57% · \`At the cap the agent stops replying and says so; the console is unaffected. Heaviest user: Anna Kerimova, €38.10.\` Editing the cap: **not drawn**.

---
## 13. Email template

Ops Agent Email. **Purpose:** one template for everything the agent sends through Resend — document delivery, briefing, limitation summary, forwarded answer. Header and footer match the platform's transactional mail.

### 13.1 Technical constraints (must)

- Nested \`<table role="presentation">\` with \`cellpadding=0 cellspacing=0 border=0\`. **No flexbox, no grid.**
- All styles inline.
- Container width **600px** (\`width:600px; max-width:100%\`), centred in a full-width table with padding \`24px 20px\`.
- **Images:** absolute HTTPS URLs only, with meaningful \`alt\`. Design text gives \`https://clearway.aero/mail/clearway.png\` for the header logo. White logo and Verxyl logo production URLs: \`SOURCE UNKNOWN — developer to wire\` (design uses local \`assets/clearway-white.svg\`, \`assets/verxyl-white.png\`; SVG is not safe in email — use PNG).
- **Images blocked:** every logo has a text fallback of the same meaning (see 13.3). The email must read completely without images.
- Fonts: Public Sans / IBM Plex Mono with fallbacks (\`Consolas, 'Courier New', monospace\` for mono; system sans for UI).
- Light and dark rendering: dark via \`@media (prefers-color-scheme: dark)\` and \`[data-ogsc]\` overrides (spec default mechanism; the design shows the target colours).
- From \`agent@clearway.aero\`; **Reply-To is the requester** (\`Reply-To Dmitrijs Kalnins\`).

### 13.2 Structure (top → bottom)

| Row | Light | Dark | Content |
|---|---|---|---|
| Outer desk | \`#eef0f3\` | \`#0d0f13\` | radius 14 (clients that support it) |
| Card | \`#ffffff\`, \`1px #e6e7ea\`, radius 14 | \`#17191e\`, \`1px #2a2d34\` | — |
| Header | padding \`24px 32px 18px\`, bottom \`1px #eef0f2\` | rule \`#24272d\` | Logo left (132px wide; dark uses white logo); right: tag mono 11/600/0.1em \`#9aa0a8\` (dark \`#7d838c\`): \`AIP DOCUMENT\` / \`BRIEFING\` / \`FORWARDED ANSWER\` |
| Requester line | padding \`14px 32px\`, bg \`#fbfbfc\` (dark \`#1b1e24\`), bottom rule | — | 10px ring (2px \`#2563eb\`; dark \`#6ea0ff\`) + 13/1.5 \`#3a3d44\` (dark \`#c9ccd2\`): \`Sent by the **Clearway Ops Agent** at the request of **{Requester}**, {DD Mon YYYY} at {HH:MM}Z. Reply to reach {FirstName} directly.\` |
| Content blocks | padding \`14px 32px 0\` each; first block \`22px 32px 0\`; last (CTA) \`20px 32px 26px\` | — | see 13.3 |
| Footer | bg \`#0a1330\` **in both modes**, padding \`20px 32px\` | same | Left: white Clearway logo 104px at 92% opacity + \`Generated by the Clearway Ops Agent. Check operational content against the source before use.\` 11.5/1.5 \`rgba(255,255,255,.55)\`. Right: Verxyl logo 110px at 90% (\`alt="Built by Verxyl"\`). Rule 1px \`rgba(255,255,255,.12)\` margin \`16px 0 12px\`. Reference line mono 10.5 \`rgba(255,255,255,.45)\`: \`agent-msg am_41c9 · thread BTI472 morning prep · Resend re_8Hk2Qw\` |

**Why the requester line is mandatory:** the email must make clear it was generated by the agent at a person's request, and who. It is never omitted.

### 13.3 Blocks

Light / dark colours: ink \`#17181c\`/\`#f2f3f5\`; body \`#3a3d44\`/\`#c9ccd2\`; muted \`#6c7079\`/\`#9aa0a8\`; faint \`#9aa0a8\`/\`#7d838c\`; border \`#e6e7ea\`/\`#2a2d34\`; rule \`#eef0f2\`/\`#24272d\`; link \`#2563eb\`/\`#8fb4ff\`.

| Block | Spec |
|---|---|
| Heading | \`<h1>\` 24/1.25/800/-0.02em ink, margin 0 |
| Paragraph | \`<p>\` 15/1.6 body, margin 0 |
| Personal note (forward) | 15/1.6 ink italic in quotes + \`— {Name}\` normal muted |
| Titled section | eyebrow 11/700/0.12em faint, margin-bottom 6 + paragraph |
| Label/value table | table \`1px border\` radius 10; label cell width 150, padding \`9px 14px\`, 13 muted; value 13.5/600 ink, mono when a code/date; rows separated by \`1px rule\` top border |
| Mono block | eyebrow + table bg \`#f5f6f7\` (dark \`#0f1115\`) radius 8; cell padding \`12px 14px\`, mono 13/1.7 ink, \`white-space: pre-wrap\` |
| Verbatim quote | table \`2px solid\` ink (dark: \`#f2f3f5\`) radius 10; header row bg ink, padding \`8px 14px\`, 11/800/0.12em, text white (dark \`#17191e\`): \`VERBATIM · APPROVED TEXT · {REF}\`; body 14.5/1.65/500 pre-wrap; footer 12 muted: \`Approved {date} by {name}, {role}. Reproduced exactly.\` |
| Callout | table bg \`#fef3e2\` (dark \`#2a2113\`) \`1px #f6ddb0\` (dark \`#4a3a1d\`) radius 10; \`!\` 15/800 in a 28px cell; text 14/1.55 \`#92400e\` (dark \`#f5c77a\`) with bold lead |
| Attachment list | eyebrow \`ATTACHED\` + table border radius 10; row: 30×36 tile \`#fdecec\` (dark \`#2a1d1f\`) with \`PDF\` 8/800 \`#e5484d\` · name mono 13/600 + meta 12 muted · size 12.5 faint right |
| Sources | eyebrow \`SOURCES\`; each 13/1.7 body: **\`[n] {Tier}\`** ink + \` · {name}\` |
| Console link (CTA) | table cell radius 10 bg \`#2563eb\`; link block 14.5/700 white padding \`12px 22px\`: \`{label} →\`; below 12 faint: \`Or open\` + URL mono in link colour |

**Images blocked:** header logo → text \`Clearway\` 15/800 ink in a \`1px dashed\` box padding \`6px 10px\`; footer logo → \`Clearway\` 14/800 white; Verxyl → \`Built by Verxyl\` 12/700 \`rgba(255,255,255,.75)\`.

**Verbatim in email follows §3 rule 1.** The web tiers' colours are not used in email; tier is written in words.

### 13.4 Examples (verbatim)

**1 · AIP document delivery** — Subject \`EVRA · AIP AD 2 (AIRAC 2610)\` · tag \`AIP DOCUMENT\` · requester Dmitrijs Kalnins, 23 Sep 2026 at 07:53Z.
- H: \`EVRA Riga — AIP AD 2\`
- P: \`The current AD 2 for Riga International is attached, retrieved from the AIP Portal after this morning's EAD sync.\`
- Table: \`Airport | EVRA · Riga International\` · \`Document | EV_AD_2_EVRA_en.pdf\` · \`AIRAC | 2610 · effective 01 OCT 2026\` · \`Retrieved | 23 SEP 2026 06:10Z\` · \`Source | Internal · AIP Portal (EAD)\`
- Callout: **\`AIRAC change in 8 days.\`** \`This edition takes effect 01 Oct. Until then, AIRAC 2609 is in force.\`
- Attached: \`EV_AD_2_EVRA_en.pdf\` · \`AIP Latvia · 34 pages\` · \`2.8 MB\`
- CTA: \`Open EVRA in the console →\` · \`console.clearway.aero/aip/EVRA\`

**2 · Operational briefing** — Subject \`BTI472 EVRA→EGLL · crew brief, 23 Sep\` · tag \`BRIEFING\`.
- H: \`BTI472 · EVRA → EGLL\`
- Table: \`Aircraft | YL-ABC · A220-300\` · \`STD / ETD | 11:40Z / 11:55Z (+15, CTOT 11:52Z)\` · \`STA / ETA | 13:10Z / 13:22Z (+12)\` · \`EGLL NOTAMs | 38 active · 4 new, checked 07:49Z\`
- Mono \`EGLL TAF · RAW\`: the TAF from §4.14
- Verbatim \`LIM-0412 REV 3\`: \`3.3  When the reported crosswind component exceeds 20 kt, AUTOLAND IS NOT PERMITTED. The approach shall be flown manually by the Commander.\` · \`Approved 02 Sep 2026 by N. Ozola, Ops Quality. Reproduced exactly.\`
- Section \`AGENT'S READING\`: \`Gust crosswind on 27L is about 21 kt during the TEMPO, above the 20 kt autoland threshold. Plan a manual approach.\`
- Attached: \`BTI472_crew_brief_23SEP.pdf\` · \`Generated 07:51Z · 1 page\` · \`212 KB\`
- CTA: \`Open BTI472 in Flights →\` · \`console.clearway.aero/wall/flights/BTI472\`

**3 · Answer forwarded to a colleague** — Subject \`Fwd: EPWA snow removal — answer from Ops Agent\` · tag \`FORWARDED ANSWER\` · requester Anna Kerimova, 23 Sep 2026 at 07:24Z · Reply-To Anna Kerimova.
- Note: \`"Artyom — this is what the agent found for Warsaw this winter. Worth a look before the GBJ88 rotation." — Anna\`
- \`QUESTION\`: \`How does EPWA handle runway snow clearance, and what does it mean for our departures?\`
- \`ANSWER\`: \`Warsaw clears one runway at a time, typically 25–40 minutes each, and publishes the order by NOTAM at the start of each event [1]. Our own winter limitations for EPWA are awaiting approval and could not be quoted [2]. Until they are approved, plan on the published order and expect CTOTs during clearance.\`
- Sources: \`[1] Web · PANSA — EPWA winter operations plan 2026/27, retrieved 07:20Z\` · \`[2] Company · LIM-0417 EPWA winter operations — pending approval, not quoted\`
- CTA: \`Open the conversation →\` · \`console.clearway.aero/agent/t/7b2e\`

The light/dark/images-blocked switcher in the design file is for review — **do not build it**.

---

## 14. Animation register

Every moving thing. Easing marked *(spec default)* is not in the design (§2.4). **Reduced motion** column is a spec rule (the design does not specify it).

| ID | Element | Trigger | Property | From → to | Duration | Easing | Delay / stagger | Reduced motion |
|---|---|---|---|---|---|---|---|---|
| O1 | Orb idle breathing | always, idle (not avatar) | dot radius | ×1.00 ↔ ×1.04 | sine, period ≈ 4.8 s | sine | — | still |
| O2 | Orb listening | mic level | ring deformation, dot scale, glow alpha | per §4.1 | per frame (rAF), smoothing 0.18 | — | — | still frame, colour kept |
| O3 | Orb thinking | agent working | arc rotation + length, dot | 3.2 rad/s; length 0.3π–0.8π over ≈ 3.9 s | continuous | sine | — | fixed arc 0 → 0.7π |
| O4 | Orb speaking | TTS playing | dot scale, 3 outward rings | ring radius R → R + 0.16·size, alpha 0.28 → 0 | ring cycle ≈ 1.82 s | linear | rings staggered by 1/3 cycle | still ring, no pulses |
| O5 | Orb error | error | — | none | — | — | — | — |
| O6 | Orb state change | state switch | colour | old → new | **not drawn** — 200 ms *(spec default)* | ease.out | — | instant |
| W1 | Waveform bars | mic/TTS level | bar height | 2 px → full height | per frame, smoothing 0.25 | — | per-bar phase | 4 Hz static updates |
| A6 | Streaming caret, all carets | streaming / focused transcript | opacity | 1 → 0 | 1000 ms loop, \`steps(1)\` (hard blink) | steps(1) | — | solid, no blink |
| A7 | Running step icon; loading dots; minimised dot | step running | opacity | .35 ↔ 1 | 1100 ms (steps), 1000 ms (panel streaming), 1200 ms (loading, minimised) loop | ease-in-out | — | opacity 1, no loop |
| A8 | Tool summary expand/collapse | click | height, chevron | 0 → auto | **not drawn** — 160 ms *(spec default)* | ease.out | — | instant |
| A9 | Token streaming | tokens arrive | text appended | — | as received | — | — | same (not an animation) |
| A10 | Stopped row appears | Stop | opacity | 0 → 1 | 150 ms *(spec default)* | ease.out | — | instant |
| C1 | Confirmation card collapses to record | success / cancel / expiry | height, content swap | card → record | **not drawn** — 200 ms *(spec default)* | ease.out | — | instant |
| C2 | Hold-to-delete fill | pointer/space held | overlay width | 0% → 100% | **2000 ms** linear | linear | — | same (progress, not decoration); announce "hold 2 seconds" |
| C3 | Hold release before complete | release | overlay width | current → 0% | 150 ms *(spec default)* | ease.in | — | instant |
| C4 | Destructive countdown | pending | text | \`4:12 left\` ticking | 1 s steps | — | — | same |
| V1 | Voice bar entrance | ⌥ Space held | opacity, translateY | 0, +8px → 1, 0 *(spec default values)* | **120 ms** | ease.out | — | opacity only |
| V2 | Voice bar width growth | transcript length | width | 380 → max 560 | 150 ms *(spec default)* | ease.out | — | instant |
| V3 | Processing line | processing | translateX of a 33%-wide 2px bar | -100% → 300% | **1400 ms loop** | **ease-in-out** (design) | — | static 33% bar |
| V4 | Transcript scroll-off | text exceeds width | horizontal offset | older words leave left | continuous as words arrive | — | — | same |
| V5 | Voice bar error | error | — | holds **6 s** (\`Didn't catch that\` **3 s**) then fades | fade 200 ms *(spec default)* | ease.in | — | instant remove |
| V6 | Voice bar exit | send / Esc / error end | opacity, translateY | 1,0 → 0,+8px | 120 ms *(spec default)* | ease.in | — | opacity only |
| V7 | Short-answer card | short answer | enter as V1; auto-dismiss | visible **8 s** | 120 ms in / out | ease.out / in | — | opacity only |
| V8 | Uncertain popover | low-confidence token | opacity, translateY | 0,4px → 1,0 | 120 ms *(spec default)* | ease.out | — | opacity only |
| V9 | Overlay entrance | double-tap ⌥ Space | scrim opacity; card translateY + opacity | 0 → .28; 16px → 0 | **not drawn** — 200 ms *(spec default)* | ease.out | card 40 ms after scrim | opacity only |
| S1 | Speaking progress bar | playing | width | 0 → 100% | length of audio | linear | — | same |
| S2 | Reading-position highlight | sentence boundary | background of current sentence | none → \`#e8effe\` | 150 ms *(spec default)* | ease.out | per sentence | instant |
| S3 | Transcript colour (spoken vs unspoken) | word/sentence timing | colour | \`#b9bdc5\` → \`#17181c\` | per word | — | — | same |
| P1 | Panel open/close | ⌘J, button | translateX (and page width in push) | 100% → 0 / 0 → 100% | **not drawn** — 200 / 160 ms *(spec default)* | ease.out / ease.in | — | instant |
| P2 | Expand to full page | ⌘⇧J, ⤢ | panel width; page opacity | 420 → full; 1 → 0 | **200 ms** (design) | ease.out *(spec default)* | — | cross-fade 100 ms |
| P3 | Minimised ring | working | rotation | 0 → 360° | 1000 ms loop *(spec default; drawn static)* | linear | — | static |
| P4 | Context chip loading | panel opens | dot pulse (A7) | — | — | — | — | static |
| P5 | Skeleton lines | loading | — | **static in design**; no shimmer | — | — | — | — |
| P6 | Ghost row (pending change) | confirmation shown | opacity | 0 → 1 | 150 ms *(spec default)* | ease.out | — | instant |
| P7 | Applied row highlight | write succeeded | bg + inset edge | shown → removed after **10 s** | fade out 400 ms *(spec default)* | ease.in | — | instant after 10 s |
| P8 | Scroll to changed row | change off-screen | scroll | — | smooth *(spec default)* | — | — | instant |
| P9 | "Show on page" highlight | click | row bg | \`#eef4ff\` for 3 s *(spec default)* | fade 400 ms | ease.in | — | instant |
| P10 | Done dot on minimised tab | reply done | visible | 30 s then tab hides | fade 200 ms *(spec default)* | ease.in | — | instant |
| H1 | Hover colour changes (buttons, cards, rows) | hover | background, border | per component | 120 ms *(spec default)* | ease.out | — | instant |
| T1 | Toggle knob | click | translateX | 0 → 18px | 150 ms *(spec default)* | ease.out | — | instant |
| D1 | Drop zone | drag enter / leave | opacity | 0 ↔ 1 | 120 ms *(spec default)* | ease.out | — | instant |
| U1 | Upload progress | upload | bar width | 0 → 100% | real progress | linear | — | same |
| M1 | Menus (@, /) | open | opacity, translateY | 0,4px → 1,0 | 120 ms *(spec default)* | ease.out | — | opacity only |

---

## 15. Keyboard register

| Key | Where | Action |
|---|---|---|
| \`⌘J\` / Ctrl+J | anywhere in the console | Toggle side panel (opens with current context) |
| \`⌘⇧J\` | panel open | Expand to full page |
| \`⌘K\` | anywhere | Command palette — **only if 1c is built** (\`DECISION OPEN\`) |
| hold \`⌥ Space\` | anywhere (not while typing in another input — spec default: yes, it still works; ⌥ Space does not type a character users need) | Compact voice bar; release sends |
| double-tap \`⌥ Space\` | anywhere | Large voice overlay |
| \`⇧\` held on release of ⌥ Space | voice | Flip reply mode for this answer |
| \`S\` / \`V\` | while an answer is being spoken / shown | Show instead / say instead |
| \`1\`–\`3\` | uncertain-word popover | Pick alternative |
| \`Esc\` | voice capture | Discard |
| \`Esc\` | streaming or speaking | Stop |
| \`Esc\` | menu open | Close menu (first) |
| \`Esc\` | pending standard/low confirmation | Cancel |
| \`Esc\` | panel, empty composer, nothing else active | Close panel |
| \`⏎\` | composer | Send |
| \`⇧⏎\` | composer | New line |
| \`⏎\` | low-risk inline confirmation | Apply |
| \`⌘⏎\` | standard confirmation | Confirm |
| (none) | destructive | No keyboard confirm; hold 2 s (pointer, or Space on the focused button — spec default) |
| \`@\` | composer | Mention picker |
| \`/\` | composer, line start or after space | Command menu |
| \`↑\` \`↓\` | menus | Move |
| \`⏎\` | menus | Insert |
| \`Tab\` | @ menu | Next type tab |
| \`Tab\` | command args | Next argument |
| \`⌫\` | empty command argument | Remove command |
| \`⏎\` | short-answer card / "must show" card | Open in side panel |
| \`⌘D\` | palette | Download (1c only) |

Precedence of \`Esc\`: menu → voice capture → confirmation → streaming/speech → panel close.

---

## 16. Edges

### 16.1 Designed and ready

- Tokens (§2) — values complete; names proposed (token file missing).
- Orb in all five states at all sizes; waveform; compact voice bar in all five states + placement on a normal page and docked in the panel; large overlay in all states; mic permission and unavailable cards.
- Show-or-say delivery model (6c + 6b) with its rule table; speaking card; must-show; long answer; both-at-once with reading position.
- Full-page chat: header, empty state, full reference thread, streaming + stop + stopped, four error types, confirmation (standard, multi-change, outcomes), composer with attachments (all four chip states + drop zone), @ picker, / commands, multi-line.
- Rich replies: flight card, airport summary, document, generated file, table, mono block — full page and panel variants.
- Source attribution per-claim (3c) with one and several sources, and the narrow variant.
- Verbatim ink frame (4a) full and narrow, with Agent's reading.
- Confirmation by risk: low inline (5a), standard card, destructive pinned hold (5c), modal (5b).
- Side panel: widths, push vs overlay rule, open/close triggers, three console pages across the three sidebar states, context chip, three empty states, @ selection-first, every reply type at 400px, voice docked, keybind flow, history, expand, minimised, loading/streaming/error/offline, change-behind-panel (pending ghost → applied).
- Sidebar entry (expanded, rail, deep context); History; Knowledge base with approval; Activity log with expanded record; Agent settings.
- Email template: all blocks, three examples, light / dark / images-blocked.

### 16.2 Designed but incomplete

**Conflicts between files — resolved here, confirm with design:**

1. **Citation marker style.** Round-1 thread draws numbered pills with a tinted background; the chosen 3c uses plain coloured superscripts + claim underlines. Build 3c everywhere.
2. **Context indicator.** Round 1 (B5) and 1b show \`Sees: …\` in the panel header; round 3 uses the context chip. Build the chip.
3. **Voice bar over the wall.** Alternatives V draws the compact bar pinned top-right over the *dark wall timeline*; round 3 says the agent is *never available on the wall display itself*. Resolve: if the dark frame is the wall **display**, don't build it; if it's a dark console view of the wall, build it as drawn. **Needs a decision.**
4. **Panel width.** Decisions say 420 default; A2 (1280) and the B/C cards draw 400. Build 420; B/C cards are 400 for layout only.
5. **Panel header height.** Drawn 60 (A1), 56 (A2–A4), 52 (cards). Build 60.
6. **Minimised "needs you" colour.** Round-3 draft said blue, final file says amber. Build amber.
7. **Violet reuse.** \`SEND\` kind badge in the Activity log uses the Company tier violet. Kept as drawn; consider a different colour.

**Missing states or details:**

- Reply card density: \`DECISION OPEN\` between 2a dense and 2b spacious for multi-result replies. Interim: spacious on full page, dense/stacked in the panel.
- Command palette (1c): designed as an alternative only; build or drop.
- Tool summary default (expanded vs collapsed after completion).
- User message: sending, failed to send, edit/retry.
- Tool step "cancelled" and write-tool icon.
- Confirm button loading state; focus placement when a prompt appears.
- Destructive **top banner on other console pages** while a 5c prompt is pending.
- "Now on…" chip when the user navigates after sending.
- Highlight colours for claim↔source hover (drawn only for Web).
- "No source · agent's reasoning" visual for an unsourced reply.
- Stale/cached document marking on the document card.
- Hover card for sent mention chips; \`@operator\` icon.
- Short-answer card exact size (drawn only as a sketch).
- Panel open/close animation; overlay entrance animation; all easing curves.
- Full-view sheet (table/PDF) exact layout.
- Panel below 1280; expanded sidebar at 1280; rail on a large monitor.
- History: empty, loading, no results, shared-thread UI.
- Knowledge base: upload flow, rejection note, failed-indexing actions, stat-card filtering, disabled Approve for the uploader.
- Activity log: filter menus, pagination, expanded view for read rows.
- Settings: cap editing, phonetic-spelling setting (referenced in D4), per-user voice preference in Account.
- Focus rings on non-input controls; disabled button style.
- Times of day other than morning for the no-context greeting.
- Every \`SOURCE UNKNOWN\` item: tool registry, flight/NOTAM/weather/AIP/limitations APIs, citation spans from the model, TTS timing marks, page↔panel event contract, upload endpoint, record IDs, user/role data, usage data.

### 16.3 Not designed (out of scope — do not build a guess)

- Tablet and phone layouts for any agent surface (the project's Mobile and Tablet file does not cover the agent).
- The agent on the wall display itself (deliberately excluded).
- Thread rename, delete, share, pin.
- Editing or regenerating an agent reply; message reactions/feedback.
- Multi-language / translation (verbatim text must never be translated anyway).
- Notifications outside the console (push, desktop).
- Admin setup of tools, models or the knowledge-base tiers beyond the Settings page shown.
- Onboarding/tour for the agent.
- Anything in the design files that exists only for review: canvas background, section labels, annotation cards, \`Reset demo\` buttons, state switchers (overlay tabs, email mode tabs), "RECOMMENDED" badges, option IDs (1a, 2b…).
