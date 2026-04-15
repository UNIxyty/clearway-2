# Task: Reverse-engineer an aviation digital wall display webapp via browser inspection only

## Context
I have access to an aviation ops digital wall display webapp running in this browser. 
I do NOT have the source code. Your job is to:
1. Fully analyze every page/panel through DevTools inspection only
2. Reconstruct a pixel-accurate static clone using fake/mock data

---

## PHASE 1 — ANALYSIS (no code writes yet)

Open the webapp and log in. Then, for every page/view/tab you can navigate to, do the following:

### For each page, document:

**A. Page identity**
- Page name / route (from URL or nav label)
- What is the primary operational purpose of this panel?
- Who is the likely audience (dispatcher, ground crew, tower, ops manager)?

**B. Layout structure**
- Use Inspect Element to map the top-level layout containers
- Identify: header, sidebar, main content area, footer, modals, overlays
- Note grid/flex layout patterns from computed CSS
- Screenshot or describe the visual hierarchy

**C. Data entities displayed**
For every distinct data object shown on screen (flights, aircraft, crew, gates, delays, weather, etc.):
- What fields are shown? (flight number, status, time, tail number, etc.)
- What data type is each field? (string, time, enum/badge, number, boolean indicator)
- Are there color-coded statuses? Document each status label + color (use computed styles)
- Are there icons? Note their apparent meaning

**D. UI components inventory**
List every unique component type visible:
- Tables / data grids (how many columns, sortable?)
- Cards / tiles
- Status badges / pills
- Timeline bars or Gantt-style rows
- Countdown timers or live clocks
- Alert banners or notification rows
- Dropdown filters / search bars
- Charts or graphs (type, axes labels)
- Map or gate diagram
- Sidebar panels
- Modal / drawer patterns

**E. Interactivity and logic**
- What happens when you click a row, card, or badge? (modal opens? drawer expands? nothing?)
- Are there filters? What options do they have?
- Is there auto-refresh behavior? (check for polling intervals via Performance tab or network activity)
- Are there real-time updates / WebSocket connections? (check Network > WS tab)
- Are there tabs or sub-navigation within the page?
- Any keyboard shortcuts visible?

**F. Color system and visual language**
- Primary and secondary brand colors (from :root CSS variables or computed styles on key elements)
- Status color mapping (e.g. green=on-time, amber=delayed, red=cancelled, blue=boarding)
- Font family and sizes used for headings, data cells, labels
- Note any dark/light mode toggle

**G. Data relationships between pages**
- Does clicking something on Page A navigate to Page B with more detail?
- Is the same flight/aircraft/crew visible across multiple pages?
- Note any shared state or cross-panel context

---

### Repeat the above for EVERY navigable page/view. Likely pages to check:
- Dashboard / overview
- Flight schedule / departure board
- Arrival board
- Aircraft status / turnaround tracker
- Gate assignment / ground movements
- Crew roster or check-in board
- Delay / disruption manager
- Weather panel
- Notifications / alerts feed
- Settings or configuration pages

---

## PHASE 2 — RECONSTRUCTION PLAN

After completing the analysis, produce:

1. **Component map** — list of all unique React/HTML components needed
2. **Data schema** — fake TypeScript types or JS objects representing each data entity
3. **Routing plan** — list of routes/pages needed to match the original navigation
4. **Fake data plan** — for each page, what mock data arrays are needed and how many rows

---

## PHASE 3 — BUILD THE STATIC CLONE

Now build a complete, self-contained frontend clone:

### Tech stack
- React + Vite (or plain HTML/CSS/JS if simpler)
- Tailwind CSS for styling
- React Router for multi-page navigation
- No backend, no API calls — all data is hardcoded mock data

### Requirements

**Visual fidelity**
- Match the color scheme, font sizes, spacing, and layout as closely as possible
- Reproduce all status badges with correct colors
- Reproduce all table columns and card layouts
- Match the header/sidebar/footer structure exactly

**Fake data requirements**
- Every page must be populated with realistic aviation fake data
- Minimum: 15–20 flight rows per schedule page, 8–10 aircraft, 5–6 gates, 4–5 crew members
- Use realistic flight numbers (e.g. RYR1234, EZY5678, BAW901), IATA airport codes, tail numbers (e.g. EI-DVM), timestamps
- Status values must cover all observed status types (on-time, delayed, boarding, departed, cancelled, diverted, etc.)
- Delay reasons, gate numbers, stand numbers, aircraft types (A320, B737, E190) should be realistic

**Interactivity (fake but functional)**
- All clicks that opened modals/drawers should still open them (with fake data populated)
- All filter dropdowns should work (filtering the fake data client-side)
- All tab switches should work
- Any live clock elements should use real `Date.now()` 
- Auto-refresh simulation: optional, can add a static "Last updated: [timestamp]" instead

**Structure**
- One file per page component
- One central `mockData.js` file with all fake data
- Shared components (header, sidebar, status badge, etc.) in a `/components` folder
- App.jsx with React Router setup

### Explicitly do NOT:
- Make any real API calls
- Connect to any real data sources
- Include any authentication that blocks rendering
- Use real flight or personal data scraped from the app

---

## Deliverable

Produce the complete file tree and all file contents. Start with:
1. The analysis report (Phase 1 output)
2. Then the component map + data schema (Phase 2)
3. Then all code files (Phase 3)

Begin by opening the webapp now and starting Phase 1 analysis.