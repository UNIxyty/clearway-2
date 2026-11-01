// Dead-time meter for the rig suites (2026-11-01): how much of a suite's run is spent in fixed waits.
//   node --import ./rig/lib/wait-meter.mjs --env-file=.env.rig rig/<suite>.mjs
// Counts every setTimeout of 250 ms or more that FIRES in the test process (a sleep() resolving; a cleared timeout,
// such as Playwright's own 30 s guards, is not counted) and every page.waitForTimeout. Prints one line to stderr at
// exit: "WAIT-METER <ms total> in <n> waits · longest <ms>".
const real = globalThis.setTimeout;
let total = 0, n = 0, longest = 0;
const note = (ms) => { total += ms; n += 1; if (ms > longest) longest = ms; };
globalThis.setTimeout = function (fn, ms, ...rest) {
  const d = Number(ms) || 0;
  if (d < 250 || typeof fn !== "function") return real(fn, ms, ...rest);
  return real(function (...a) { note(d); return fn.apply(this, a); }, ms, ...rest);
};
try {
  const { Page } = await import("playwright-core/lib/client/page.js");
  const orig = Page.prototype.waitForTimeout;
  Page.prototype.waitForTimeout = function (ms) { note(Number(ms) || 0); return orig.call(this, ms); };
  const { Frame } = await import("playwright-core/lib/client/frame.js");
  const of = Frame.prototype.waitForTimeout;
  Frame.prototype.waitForTimeout = function (ms) { note(Number(ms) || 0); return of.call(this, ms); };
} catch { /* no playwright in this suite */ }
process.on("exit", () => { process.stderr.write(`\nWAIT-METER ${Math.round(total)} ms in ${n} waits · longest ${Math.round(longest)} ms\n`); });
