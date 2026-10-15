// AIP copies are not refreshed automatically (2026-10-15), so everything that shows or sends one says when it is from.
//   A. The airport page says "This copy is from DD Mon YYYY." — from the PDF's own record (its stored extraction is
//      dropped after a day, which used to leave the page with no date at all); older than a day it says it is not
//      refreshed automatically and to press Re-sync; older than 28 days (one AIRAC cycle) it says so, in orange.
//   B. The wall's Send AIP / GEN: the email row says "Cached copy from …", the file name carries the date, and a
//      line across the top of the PDF says "Clearway cached copy, fetched …".
//   node --env-file=.env.rig rig/fixes/aip-copy-date.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { BASE, SB, signedIn, ok, done, sleep, text } from "./common.mjs";

const STORAGE = path.resolve(process.env.STORAGE_ROOT || "rig/.scratch/storage");
const PDF = path.join(STORAGE, "aip/ead-pdf/EVRA.pdf");
const JSON_COPY = path.join(STORAGE, "aip/ead/EVRA.json");
const DAY = 24 * 3600 * 1000;
const WALL = "http://127.0.0.1:5198", RESEND = "http://127.0.0.1:3996";
const day = (ms) => { const d = new Date(ms); return `${String(d.getUTCDate()).padStart(2, "0")} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

const original = fs.statSync(PDF).mtime;
const savedJson = fs.existsSync(JSON_COPY) ? fs.readFileSync(JSON_COPY) : null;
const { browser, page } = await signedIn("user");
try {
  // ── A. The airport page ──
  if (fs.existsSync(JSON_COPY)) fs.rmSync(JSON_COPY); // as in production after a day: only the PDF's own record is left
  for (const [ageDays, want] of [[40, "old-cycle"], [3, "stale"], [0, "fresh"]]) {
    const t = new Date(Date.now() - ageDays * DAY);
    fs.utimesSync(PDF, t, t);
    await page.goto(`${BASE}/aip/EVRA`, { waitUntil: "load" }); await sleep(5000);
    const line = page.locator("[data-aip-copy-age]");
    const got = await line.getAttribute("data-aip-copy-age").catch(() => null);
    const said = await text(line);
    ok(got === want && said.includes(`This copy is from ${day(t.getTime())}.`), `a copy ${ageDays} days old: the page says it is from ${day(t.getTime())} (${want})`, `${got} · ${said}`);
    if (want === "old-cycle") ok(/more than one AIRAC cycle \(28 days\) ago/.test(said) && /not refreshed automatically/.test(said) && /Press Re-sync/.test(said), "…and says it is more than one AIRAC cycle old, not refreshed, press Re-sync", said);
    if (want === "stale") ok(/not refreshed automatically/.test(said) && !/AIRAC/.test(said), "…a few days old: not refreshed automatically, no AIRAC warning", said);
    if (want === "fresh") ok(!/not refreshed/.test(said), "…today's copy: just the date", said);
  }
  ok(!/refreshes on the next sync/.test(await text(page.locator("body"))), "nothing says a refresh is coming");

  // ── B. The wall's Send AIP / GEN ──
  const t = new Date(Date.now() - 40 * DAY); fs.utimesSync(PDF, t, t);
  const sess = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "content-type": "application/json" }, body: JSON.stringify({ email: "rig-access-user@rig.invalid", password: "rig-access-check-only" }) })).json();
  const cookie = `sb-rig-auth-token=${encodeURIComponent(JSON.stringify([sess.access_token]))}`;
  const w = (p, init = {}) => fetch(`${WALL}${p}`, { ...init, headers: { cookie, "content-type": "application/json", ...(init.headers || {}) } }).then((r) => r.json());
  const flights = await w("/api/flights/normalized?icao=EVRA&limit=20");
  const f = (flights.flights ?? flights.records ?? []).find((x) => (x.flight?.adep?.icao ?? x.adep) === "EVRA");
  ok(Boolean(f), "a rig flight departs EVRA", f ? `${f.flight?.flightNo ?? f.flightNo}` : JSON.stringify(flights).slice(0, 120));
  const before = (await (await fetch(`${RESEND}/_rig/sent`)).json()).length;
  const started = await w("/api/aip/send", { method: "POST", body: JSON.stringify({ flightNid: f?.flightNid ?? f?.flight?.flightNid, oprId: f?.oprId, airports: ["dep"], docs: ["aip"] }) });
  let job = started.job;
  for (let i = 0; i < 40 && job && !["sent", "error"].includes(job.stage); i++) { await sleep(1000); job = (await w(`/api/aip/send/${started.jobId}`)).job; }
  ok(job?.stage === "sent", "the wall sent the document", job?.stage);
  const sent = await (await fetch(`${RESEND}/_rig/sent`)).json();
  const last = sent.length > before ? sent[sent.length - 1] : null;
  const name = last?.attachments?.[0]?.filename ?? "";
  ok(new RegExp(`^EVRA-AD2_fetched-${t.toISOString().slice(0, 10)}\\.pdf$`).test(name), "the file name carries the fetch date", name);
  const full = last ? await (await fetch(`${RESEND}/_rig/sent/${last.id}`)).json() : {};
  ok(new RegExp(`Cached copy from ${day(t.getTime())}`).test(full.html ?? "") && /more than one AIRAC cycle old/.test(full.html ?? ""), "the email says when the copy is from, and that it is more than one AIRAC cycle old", (full.html ?? "").match(/Cached copy[^<]{0,120}/)?.[0]);
  const tmp = path.join(os.tmpdir(), `aip-stamp-${process.pid}.pdf`);
  fs.writeFileSync(tmp, Buffer.from(full.attachments?.[0]?.content ?? "", "base64"));
  const pdfText = (() => { try { return execFileSync("pdftotext", [tmp, "-"]).toString(); } catch { return ""; } })();
  fs.rmSync(tmp, { force: true });
  ok(pdfText.includes(`Clearway cached copy, fetched ${day(t.getTime())}`) && /Not refreshed automatically/.test(pdfText), "the PDF itself carries the line: cached copy, fetched …", pdfText.split("\n").find((l) => /Clearway cached copy/.test(l)));
} finally {
  fs.utimesSync(PDF, original, original);
  if (savedJson) fs.writeFileSync(JSON_COPY, savedJson);
  await browser.close();
}
done();
