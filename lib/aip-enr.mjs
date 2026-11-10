// ENR is paused (2026-11-11): every national scraper is to be examined and rebuilt first, as its own project. Until
// then nothing downloads or links ENR. The code (Latvia's own source, EAD, the cache per AIRAC, the per-cycle refresh)
// stays in the repo behind this one setting: AIP_ENR=on turns it back on everywhere — the worker's /sync/enr and its
// refresh tick, the portal's ENR routes, the library's ENR link check and the ENR button on the AIP library page.
export const ENR_ENABLED = String(process.env.AIP_ENR || "off").trim().toLowerCase() === "on";
/** The words every disabled ENR action shows (visible text, never a tooltip). */
export const ENR_PAUSED_TEXT = "Not supported now, working on it";
