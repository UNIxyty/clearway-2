# Sign in (Sign In v2, 2026-10-28)

From the Claude Design project "Clearway Portal", `Sign In v2.dc.html`: the form on the portal's own page colours, and
from 900 px a photograph panel beside it. Code: `app/login/page.tsx` (layout), `app/login/ui/LoginCard.tsx` (the form),
`app/login/ui/SigninPhoto.tsx` (the photograph). Tokens: `shared/signin-tokens.css` (`--si-*`).

## The form comes first

- The server HTML holds the whole form and no `<img>`. It paints with the portal's own stylesheets; nothing of the
  photograph is in the first response.
- After the page's load event and an idle moment, and only when the window is at least 900 px wide, `SigninPhoto` adds a
  `<picture>`: AVIF, WebP for browsers without AVIF, three widths (480, 720, 1024), `sizes` matched to the panel
  (448 px of photograph from 900 px, 668 px from 1200 px), `fetchpriority="low"`, `decoding="async"`. It fades in over
  0.6 s once decoded; with reduced motion it appears without the fade.
- Below 900 px the panel is not drawn and nothing is downloaded. Widening the window past 900 px loads it then.
- It is a real `<form>`: Enter signs in. The mechanics are unchanged: the validated `next`, the reset email to the
  address typed, the `?error=` sentences.

## Which photograph

All three of the design's photographs are kept:

| When (base time, Riga) | Light theme | Dark theme |
| --- | --- | --- |
| 06:00–19:59 | blue dawn | blue night |
| 20:00–05:59 | runway at night | runway at night |

A theme switch on the page chooses again. The files are `public/signin/<name>-<width>.<avif|webp>`, encoded from the
design's 2 MB PNGs (1024 × 1536) with sharp: AVIF quality 80 at full colour resolution (4:4:4), WebP quality 88.

| File | 480 | 720 | 1024 |
| --- | --- | --- | --- |
| blue dawn AVIF / WebP | 6 / 11 KB | 19 / 28 KB | 65 / 76 KB |
| blue night AVIF / WebP | 7 / 12 KB | 28 / 38 KB | 100 / 107 KB |
| runway at night AVIF / WebP | 12 / 14 KB | 22 / 29 KB | 54 / 68 KB |

A 1440 screen takes the 1024 file at 2× and the 720 file at 1×, so the most it downloads is 107 KB (blue night, WebP).
A phone downloads none of them.

## Measured

`node rig/signin-perf.mjs` against the rig's production build, cache off, the median of five loads. Desk: 1440 × 900,
10 Mbit/s, 40 ms. Phone: 390 × 844, 1.6 Mbit/s, 150 ms, CPU × 4. "Form seen" is the first frame in which the email
field is laid out and fully opaque; Chromium reported no first contentful paint for the old page on the phone profile,
because its card faded in from opacity 0.

| | Form seen | Typeable | Bytes | Photograph |
| --- | --- | --- | --- | --- |
| Desk, before | 503 ms | 493 ms | 426 KB | none |
| Desk, Sign In v2 | 175 ms | 488 ms | 455 KB | 54 KB, asked for at about 500 ms |
| Phone, before | 1159 ms | 2690 ms | 426 KB | none |
| Phone, Sign In v2 | 786 ms | 2577 ms | 400 KB | none |

Render-blocking resources, by Chromium's own `renderBlockingStatus`: the portal's three global stylesheets, before and
after. Nothing of the photograph blocks. On the desk the largest contentful paint is now the photograph, at about
1.2 s, because it arrives after the form by design.

`node rig/signin-perf.mjs --check` (in the runner) holds the page to this: the photograph is AVIF in Chromium and at
most 200 KB at 1440, it is asked for only after the form is on screen, it fades in, nothing of it blocks rendering, no
photograph and no panel at 390, which photograph at which hour and theme, and no page error.

## What the design has that this page does not

- **No "Create account" link.** The design's way in for people without an account is Ask for access. `/signup` still
  works for anyone who has the link.
- **No Documentation or contact links in the footer.** The documentation is not public while the docs site is
  private, and the design's contact address is a real one.
- **The request, forgot-password and waiting screens** keep their current pages (`/request-access`, the reset email,
  the client waiting page); only the sign-in screen is v2.
