# Clearway Ops Agent — Chrome extension

A second front end for the same agent. Same account, same permissions, same conversations, same rules.
The agent never reads a page by itself: it sees only what the user sends (a selection, a captured region,
the whole page on request) or asks.

Spec: `docs/agent-design-spec-extension.md`. Report and permission model: `docs/agent-extension.md`.
Internal contract between the parts: `PROTOCOL.md`.

## Build

```
cd extension
npm install
npm run build          # dist/ for https://clearway.verxyl.com
npm run zip            # dist/ + clearway-ops-agent.zip (Web Store upload)
CW_CONSOLE_ORIGIN=http://127.0.0.1:3999 npm run build   # a local console (the rig)
```

`CW_TEST_HOSTS` adds origins to `host_permissions` for automated tests only. Never set it for a release.

## Load unpacked

1. `npm run build`.
2. Chrome → `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → choose `extension/dist`.
3. Pin the icon. Sign in to the console in any tab; the panel connects on its own.
4. Shortcuts (change at `chrome://extensions/shortcuts`): ⌥⇧C panel · ⌥⇧Space talk · ⌥⇧S capture · ⌥⇧E ask about the selection.

## What the zip contains

`manifest.json`, `background.js` (service worker), `sidepanel.html` + `assets/` (the panel, React, the
console's own thread components), `offscreen.html` (microphone and speaker when the panel is closed),
`content/{pill,capture,insert,voicebar}.js` (injected on demand), `icons/` (the console's lucide masks and
the toolbar icon), `fonts/` (Public Sans, IBM Plex Mono). No remote code; nothing is fetched at runtime
except the console's own API and, for voice, ElevenLabs through a token the agent service mints.

## Layout

```
src/shared      config (console origin, limits), protocol types, storage, site matching, API helper
src/background  service worker: session, badge, menus, omnibox, notifications, capture, insert, voice
src/sidepanel   the panel (React) — App, TabBar, state cards, page-context card, insert cards, settings
src/offscreen   microphone capture + TTS playback (offscreen document)
src/content     in-page scripts (closed shadow roots): pill, capture overlay, insert preview, voice bar,
                plus two self-contained functions (readSelection, extractPage) run with executeScript
```
