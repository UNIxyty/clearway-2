// Bug report 6 item 6 (THIRD font report): the wall's reading font.
//
// What was actually deployed before this: NOTHING self-hosted. The app pulled
// IBM Plex Mono from the Google Fonts CDN; on the offline/slow kiosk that
// request fails and the browser falls back to the system monospace — on the
// wall box that fallback has the dotted-but-blurry zero ops photographed.
// Report 5's "self-hosted Nunito with slashed zero" never landed in the repo.
//
// This ships the requested stack, self-hosted, with a REAL dotted zero:
// Nunito has no `zero` OpenType feature at all (dotted or slashed), so the
// glyph itself is patched — a filled ellipse added inside the counter of
// U+0030 in each shipped weight (public/fonts/Nunito-dotted-*.woff2, built
// from the OFL Nunito variable font). Verified 0 8 O 6 9 distinguishable
// down to the wall's smallest configured sizes.
export const WALL_FONT = "'Nunito', Roboto, Avenir, Helvetica, Arial, sans-serif";
