# CNAIR flight-dispatcher portal — investigation (2026-09-29, in progress)

1. **API or scraping?** Neither REST/ORDS nor JSON. The portal is **Four Js Genero** (not Oracle APEX): the
   screen is drawn by the Genero Browser Client from Genero's own text protocol (AUI tree deltas) over
   `/gas320/ua/sua/<session>`. Not yet seen: whether the vendor exposes any Genero Web Services endpoint.
2. **Unattended session?** Login itself is a plain form post (no MFA, no CAPTCHA seen) — so probably yes —
   **but not demonstrated: the account cannot open the application** (below).
3. **Every field Leon needs?** **Unknown — blocked.** No flight record has been seen.
4. **Timezone of the times?** **Unknown — blocked.** Not guessed.
5. **Do records change after publication?** **Unknown — blocked.**

**Blocker:** with the credentials in `.env`, login succeeds (the site issues its session token) but the Genero
program answers **"No se ha podido iniciar sesión"** ("the session could not be started") before showing
anything. Same result in a headless and in a normal, visible browser. Stopped after two attempts so the account
is not locked. Needed from you: confirm this account can open *flightdispatcher* in a normal browser (it may lack
the permission or a licence seat, or have a session open elsewhere), and a sample notification email.

---

## 1. The platform

Evidence (response headers and page source):

| Signal | Value |
|---|---|
| `X-FourJs-Server` | `GAS/3.21.01-202307071742` (Genero Application Server) |
| `X-FourJs-Web-Service` | `GWS Server (Build 202409061145)` (Genero Web Services) |
| Front end | Genero Browser Client `fjs-gbc-1.00.68-build202504070939` |
| Runtime | `runtimeVersion "3.21.03-2525"`, protocol 102, interface 110 |
| Web server | Apache 2.4.53 on Rocky Linux |
| Program | `UserInterface name "ProgramacionCnair"` (Spanish UI; DMY4 dates; `,` decimal separator) |

**What it means.** The URL shape looked like APEX, but `/gas320/ua/r/<group>/<app>` is Genero's
"Universal Rendering" start URL. A Genero application is a server-side 4GL program; the browser only renders
the tree of widgets the server sends. The data on screen is **not loaded from a data API**: after bootstrap,
the page and the server exchange Genero protocol messages, e.g.

```
GET  /gas320/ua/r/cnair/flightdispatcher?Bootstrap=done      → meta Connection {{encoding "UTF-8"} {protocolVersion "102"} …}
POST /gas320/ua/sua/<session-id>?appId=0&pageId=1            body: meta Client{{name "GBC"}{version "1.00.68"}…}
                                                             → om 0 {{an 0 UserInterface 0 {{name "ProgramacionCnair"} …
```

Integration options, in order of robustness:
1. **Ask the provider for an API or an export.** They run Genero Web Services already (the `GWS` header), so
   exposing a REST service over the same data is ordinary work on their side. This is the recommendation.
2. **Drive the Genero protocol.** Possible (it is a documented, stable client protocol), but we would be
   re-implementing a thin Genero client against someone else's program; any change to their screens or
   field names breaks it.
3. **Scrape the rendered GBC page.** The most fragile: widget ids are generated, and layout changes with every
   update of their program or of GBC.

## 2. Authentication and session (what was observed)

- **Login:** HTML form on the start URL, `POST` of `userName`, `password`, `submit=Entrar` → `302` back to the
  start URL, which then boots the Genero client. No MFA, no CAPTCHA, no JavaScript challenge was seen.
- **Cookies** (all session cookies, no fixed expiry): `EFFI_TOKEN` (534 chars, *not* HttpOnly, *not* Secure,
  path `/gas320/ua/r/cnair`), `EFFI_USER` (the username, URL-encoded), `Genero-SID` (HttpOnly, SameSite=Strict,
  path `/gas320`), `lang`. The session id also appears in the protocol URL (`/ua/sua/<id>`).
- **Headless:** the failure is identical headless and headed, so there is no sign of browser-based bot
  detection at the login. No rate limiting was hit (4 page loads in total).
- **Not yet answered:** session lifetime (idle vs fixed), renewal, and behaviour from a server IP — all need a
  working session.

## 3–6. Record lookup, field inventory, changes after publication, Leon mapping

Blocked until the application opens. No record, field, label, time or timezone has been seen, and nothing is
assumed. The Leon side (section 6) can be documented independently of the portal and will be, but the
mapping table cannot be filled without the portal's fields.

## 7. Risks seen so far

- **Terms of use:** none published — the login page links to no terms, and `/robots.txt` is a 404. That is not
  permission; the automated-access question should be put to the provider directly, together with the API
  request in §1.
- **Cookie hygiene on their side:** the session token cookie is neither HttpOnly nor Secure. Worth mentioning
  to them; for us it means the token is readable by any script on that origin.

## Method

One browser session at a time, paced; credentials read from `.env` and scrubbed from every saved URL, body and
header; screenshots mask the username. Tooling: `rig/cnair/session.mjs`. Raw network logs stay in
`rig/.scratch/cnair/` (not committed).
