# Clearway Ops Agent extension — internal contract

Read this before touching any part. It is the one place the pieces agree on.

## The rule everything rests on
The agent never reads a page by itself. Nothing reads a page's DOM until the user acts (pill click, menu
item, shortcut, panel button), and what is read is exactly what the user chose: a selection, a captured
region (pixels), or the page's main text on request. No content script runs on any site until a user
gesture or an organisation-approved host; the pill script (approved hosts only) reads only the LENGTH of
the current selection on mouseup and sends nothing until the pill is clicked.

## Contexts
- **background** (`src/background`): MV3 service worker. Ephemeral: holds NO state; everything in
  `chrome.storage`. Owns commands, context menus, omnibox, badge, notifications, alarms, injection,
  capture, session polling, voice orchestration, the offscreen document.
- **sidepanel** (`src/sidepanel`): React, the agent UI. Reuses `components/agent/*` from the repo root.
- **offscreen** (`src/offscreen`): microphone capture (ElevenLabs realtime through the agent's token) and
  TTS playback, when the panel is closed. Exists only while voice is active.
- **content** (`src/content`): scripts injected ON DEMAND with `chrome.scripting.executeScript`.
  Everything drawn in the page is inside a closed shadow root (`surface.ts`), foreign-surface treatment.

## Server (agent service, same origin as the console: `${CONSOLE_ORIGIN}/agent/api/...`)
Auth: the console's own Supabase cookies. Every request is `credentials: "include"`. The extension
stores no token. Headers on every request: `x-clearway-client: extension`,
`x-clearway-page-host: <host>` (the active tab's host, or the host the content came from).

| Method, path | Body → response |
|---|---|
| `GET /api/extension/session` | → 401 `{ok:false}` when signed out; `{ok, user:{userId,name,email,initials,role}, tools:string[], admins:[{name,email}], sites:{approved:[{host,includeSubdomains,approvedBy,approvedAt}], requests:[{id,host,includeSubdomains,reason,status,requestedAt,decidedBy,decidedAt,note}]}, quickActions:{rules:[...]}, consoleOrigin, replyMode}` |
| `GET /api/extension/badge` | → `{ok, confirmations:[{token,what,expiresAt,conversationId,toolName}], notamReview:number, jobs:[{id,filename,at,conversationId}]}` |
| `POST /api/extension/sites/request` | `{host, includeSubdomains, reason}` → `{ok, request}` |
| `GET /api/extension/sites/admin` (admin) | → `{ok, approved:[...], requests:[...]}` |
| `POST /api/extension/sites/decide` (admin) | `{id, decision:"approve"\|"decline", note}` → `{ok, request}` |
| `POST /api/extension/sites/revoke` (admin) | `{host}` → `{ok}` |
| `POST /api/extension/sites/add` (admin) | `{host, includeSubdomains}` → `{ok, site}` |
| `POST /api/extension/resolve` | `{kind:"leon-flight", id}` → `{ok, flight:{callsign,date,adep,ades,key}}` |
| `GET /api/extension/lookup?q=` | → `{ok, suggestions:[{url, text, dim, ask?:string}]}` (≤5, "Ask Clearway" row last) |
| `POST /api/extension/insert-log` | `{host, field, characters, result:"inserted"\|"undone"\|"cancelled", verbatim?:string\|null, conversationId?}` → `{ok}` |
| `POST /api/extension/disconnect` | → `{ok}` (audit only; the console session is untouched) |
| `POST /api/chat` | as the console, plus optional `pageContext` (below) |
| `POST /api/attachments?name=capture.png` | raw PNG body → `{ok, attachment:{id,...}}` (captures ride as attachments) |

### `pageContext` (chat body, optional)
```
{ kind: "selection" | "capture" | "page",
  title: string, url: string, host: string, sentAt: ISO,
  text?: string,            // selection ≤ 20,000 chars; page ≤ 100,000 chars (trimmed:true when cut)
  attachmentId?: string,    // capture: the uploaded PNG
  chars?: number, words?: number, headings?: number, tables?: number, trimmed?: boolean,
  bytes?: number, width?: number, height?: number }
```
Server: stored on the user message as `blocks.pageContext`; sent to the model as a WEB PAGE CONTENT block;
cited as a **Web** source `"{host} · sent by you HH:MMZ"` / `"Capture · {host} · HH:MMZ"`. Capture URLs carry
the host only.

## chrome.storage
`local`:
- `session`: `{status:"unknown"|"signed-in"|"signed-out"|"disconnected"|"unreachable", user?, tools?, admins?, sites?, quickActions?, checkedAt, replyMode?}`
- `pending`: `{confirmations:[{token,what,expiresAt,conversationId,toolName,fromThisBrowser:true}], jobs:[...], approvedSites:[host], notamReview:number}` — badge sources; survives worker restarts
- `thread`: `{conversationId:string|null}` — shared by panel and voice
- `draft`: `{text?:string, pageContext?:PageContext, at:number}` — loaded into the composer when the panel opens
- `insert`: `InsertState` (see below)
- `explained`: `{leonFlight:boolean}` — the first-time quick-action card was shown
- `voice`: `{active:boolean, tabId?:number, phase?:string}`
`sync`:
- `settings`: `{pill:true, notifications:true, firstRunDone:false, mic:"pending"|"allowed"|"skipped"}`
`session` (memory only): nothing that must survive.

## Messages
All `{type, ...}`. `chrome.runtime.sendMessage` from content/offscreen/panel to background; background →
content by `chrome.tabs.sendMessage(tabId, …)`; background ↔ panel over a `chrome.runtime.connect` port
named `sidepanel`; background ↔ offscreen by runtime messages with `target:"offscreen"`.

### Content → background
- `pill.ask {text,title,url,host}` — pill clicked. Opens the panel with the selection as a draft.
- `capture.region {rect:{x,y,w,h}, dpr}` · `capture.full` · `capture.cancel`
- `insert.event {id, event:"targetLost"|"fieldChanged"|"undo"|"undoExpired"|"inserted"|"undone"|"cancelled", detail?}`
- `voicebar.action {action:"send"|"discard"|"show"|"say"|"stop"|"openPanel"|"resolve", word?, choice?}`

### Background → content (each script guards re-injection with a `window.__cw*` flag)
- `pill.config {enabled:boolean}` (pill.js)
- `capture.begin` (capture.js) → shows the overlay
- `capture.flash` — X5 white flash after the shot
- `insert.preview {id, text}` → reply `{ok, field:{label, kind:"input"|"textarea"|"contenteditable"}, after:string}` or `{ok:false, reason:"noTarget"|"notEditable"}`
- `insert.pick {id}` → asks the user to click a field; reply as above once clicked
- `insert.commit {id}` → reply `{ok, characters}` (plain text, one edit, never submits)
- `insert.undo {id}` → reply `{ok}` · `insert.cancel {id}`
- `voicebar.state {state:"invoked"|"listening"|"processing"|"answer"|"error"|"hidden", text?, tail?, bands?:number[], seconds?, step?, error?:{title,detail}, answer?:{text, spokenChars, speaking, time, duration, sources:[{name,icon}], needsPanel:boolean}}`

### Panel ↔ background (port `sidepanel`)
panel → `{type:"panel.ready"}`, `{type:"panel.thread", conversationId}`, `{type:"panel.pending", confirmations:[...]}`,
`{type:"panel.action", action:"region"|"page"|"selection"|"request-site"|"enable-site", host?}`,
`{type:"panel.insert", action:"review"|"commit"|"undo"|"cancel", id?, text?}`, `{type:"panel.voice.start"|"panel.voice.done"}`
background → `{type:"session", session}`, `{type:"tab", tab:{id,url,host,title,favIconUrl,status:"approved"|"not-on-list"|"requested"|"approved-pending-enable"|"chrome"|"unknown", scriptable:boolean}}`,
`{type:"draft", draft}`, `{type:"voice.toggle"}`, `{type:"focus", kind:"confirmation"|"job"|"notam", token?}`,
`{type:"insert", insert:InsertState}`, `{type:"capture.failed", reason, diagnostic}`, `{type:"selection", has:boolean}`

### Offscreen ↔ background
background → offscreen: `{target:"offscreen", type:"voice.start", language}` · `voice.finish` · `voice.cancel` · `tts.play {audio}` · `tts.stop` · `mic.test`
offscreen → background: `{type:"offscreen.voice.level", bands}` · `offscreen.voice.partial {text}` · `offscreen.voice.segments {text, uncertain:[...]}` · `offscreen.voice.silence` (1.5 s after the last commit) · `offscreen.voice.result {text, language, via}` · `offscreen.voice.error {title, detail}` · `offscreen.tts.progress {time, duration, spokenChars}` · `offscreen.tts.ended` · `offscreen.mic.level {level}`

## InsertState
```
{ id, tabId, host, text, verbatim?: string|null, conversationId?: string|null,
  status: "review"|"inserted"|"undone"|"cancelled"|"picking",
  field?: {label, kind}, after?: string, characters?: number,
  insertedAt?: ISO, undoUntil?: ISO, cancelReason?: string }
```

## Site status for a tab
`approved` — host matches the organisation list AND Chrome has granted the origin.
`approved-pending-enable` — on the list, Chrome permission not yet granted (S4b).
`requested` — the user has a pending request for this host (S4 after send).
`not-on-list` — everything else on http(s).
`chrome` — chrome://, chrome-extension://, Web Store, file://, about:.
