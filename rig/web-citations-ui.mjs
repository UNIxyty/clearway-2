// Citations as the person sees them (2026-11-03): a real console build, a real agent, a stand-in Messages API. One
// question; the answer must show each claim's source number after it, the mark on the one unapproved claim only, and
// sources that say what they are — on desk and phone width, light and dark. Then Settings › Web search.
// Needs a rig console build (rig/build-portal.sh). Starts its own portal :3982, agent :5193 and proxy :3981; the
// rig's own services are not touched.
//   node --env-file=.env.rig rig/web-citations-ui.mjs [outDir]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 200)}` : ""}`); if (!c) failures += 1; };
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(process.env.NEXT_PUBLIC_SUPABASE_URL))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
if (!fs.existsSync(".next/standalone/server.js")) { console.error("no console build: run rig/build-portal.sh"); process.exit(2); }
const OUT = path.resolve(process.argv[2] || "rig/.scratch/web-citations-ui"); fs.mkdirSync(OUT, { recursive: true });

// the stand-in: one turn — the API's search (official), Tavily (industry), widen, the API's search again (news)
const sse = (res, events) => { res.writeHead(200, { "content-type": "text/event-stream" }); for (const e of events) res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`); res.end(); };
const st = () => ({ type: "message_start", message: { usage: { input_tokens: 100, output_tokens: 1 } } });
const txt = (i, t, cites = []) => [{ type: "content_block_start", index: i, content_block: { type: "text", text: "" } }, ...cites.map((c) => ({ type: "content_block_delta", index: i, delta: { type: "citations_delta", citation: c } })), { type: "content_block_delta", index: i, delta: { type: "text_delta", text: t } }];
const srch = (i, id, results) => [{ type: "content_block_start", index: i, content_block: { type: "server_tool_use", id, name: "web_search", input: {} } }, { type: "content_block_delta", index: i, delta: { type: "input_json_delta", partial_json: '{"query":"Sudan airspace"}' } }, { type: "content_block_start", index: i + 1, content_block: { type: "web_search_tool_result", tool_use_id: id, content: results.map((r) => ({ type: "web_search_result", encrypted_content: "rig", page_age: "1 day ago", ...r })) } }];
const tu = (i, id, name, input) => [{ type: "content_block_start", index: i, content_block: { type: "tool_use", id, name, input: {} } }, { type: "content_block_delta", index: i, delta: { type: "input_json_delta", partial_json: JSON.stringify(input) } }];
const end = (s, n = 0) => ({ type: "message_delta", delta: { stop_reason: s }, usage: { output_tokens: 20, server_tool_use: { web_search_requests: n } } });
const EASA = "https://www.easa.europa.eu/en/domains/air-operations/czibs/czib-2023-01r8", SAFE = "https://safeairspace.net/sudan/", NEWS = "https://www.reuters.com/world/africa/sudan-airspace";
const api = http.createServer(async (req, res) => {
  let b = ""; for await (const c of req) b += c; const body = JSON.parse(b || "{}");
  if (req.url.startsWith("/search")) { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ results: [{ title: "Sudan", url: SAFE, content: "Sudan: risk level one, do not fly.", published_date: "2026-10-30" }] })); }
  if (!body.stream) { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ content: [{ type: "text", text: '{"tier":"standard","confidence":0.9,"reason":"rig","codes":[],"ask":null}' }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } })); }
  const round = body.messages.filter((m) => m.role === "assistant").length;
  if (round === 0) return sse(res, [st(), ...srch(0, "srvtoolu_ui1", [{ url: EASA, title: "Airspace of Sudan" }]), ...tu(2, "toolu_ui_t", "tavily_search", { query: "Sudan airspace" }), end("tool_use", 1)]);
  if (round === 1) return sse(res, [st(), ...tu(0, "toolu_ui_w", "widen_web_search", { reason: "the latest news" }), end("tool_use")]);
  // the first reply points to the NOTAMs: a partial answer; the agent reads them, then the full answer with its citations
  if (round === 2) return sse(res, [st(), ...srch(0, "srvtoolu_ui2", [{ url: NEWS, title: "Sudan airspace" }]), ...txt(2, "Sudan's airspace is restricted. Check the current HSSS NOTAMs before planning."), end("end_turn", 1)]);
  if (round === 3) return sse(res, [st(), ...tu(0, "toolu_ui_n", "get_notams", { icao: "HSSS" }), end("tool_use")]);
  return sse(res, [st(),
    ...txt(2, "**No — Sudan's airspace is closed to civil traffic.**"),
    ...txt(3, " EASA recommends not operating in the Khartoum FIR at any level.", [{ type: "web_search_result_location", url: EASA, title: "Airspace of Sudan", cited_text: "x", encrypted_index: "a" }]),
    ...txt(4, "\n\n- **Industry:** SafeAirspace rates Sudan risk level one, do not fly.", [{ type: "search_result_location", source: SAFE, title: "safeairspace.net — Sudan", cited_text: "x", search_result_index: 0, start_block_index: 0, end_block_index: 0 }]),
    ...txt(5, "\n- **Latest:** Reuters reported on 2 November that Port Sudan reopened to humanitarian flights.", [{ type: "web_search_result_location", url: NEWS, title: "Sudan airspace", cited_text: "x", encrypted_index: "b" }]),
    ...txt(6, "\n\n(rig stand-in text: the answer after the NOTAM check)"), end("end_turn", 0)]);
});
await new Promise((r) => api.listen(0, "127.0.0.1", r));
const API = `http://127.0.0.1:${api.address().port}`;
const kids = [];
const run = (args, env, label) => { const c = spawn(args[0], args.slice(1), { env, stdio: ["ignore", "pipe", "pipe"] }); let out = ""; c.stdout.on("data", (d) => { out += d; }); c.stderr.on("data", (d) => { out += d; }); kids.push({ c, label, out: () => out }); return c; };
const waitFor = async (url, label) => { for (let i = 0; i < 120; i += 1) { try { const r = await fetch(url, { redirect: "manual" }); if (r.status < 500) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); } throw new Error(`${label} did not start: ${kids.find((k) => k.label === label)?.out().slice(-300)}`); };
try {
  fs.rmSync(".next/standalone/.next/static", { recursive: true, force: true }); fs.cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
  fs.rmSync(".next/standalone/public", { recursive: true, force: true }); fs.cpSync("public", ".next/standalone/public", { recursive: true });
  run(["node", "--env-file=.env.rig", "agent/server.mjs"], { ...process.env, PORT: "5193", DISABLE_AUTH_FOR_TESTING: "true", AGENT_TEST_ROLE: "developer", MODEL_PROVIDER: "anthropic", ANTHROPIC_BASE_URL: API, ANTHROPIC_API_KEY: "rig-stand-in", TAVILY_API_KEY: "rig-stand-in", TAVILY_BASE_URL: API, AGENT_WEB_PROVIDER: "both" }, "agent");
  run(["node", "--env-file=.env.rig", ".next/standalone/server.js"], { PATH: process.env.PATH, HOME: process.env.HOME, PORT: "3982", HOSTNAME: "127.0.0.1" }, "portal");
  run(["node", "rig/proxy.mjs"], { ...process.env, RIG_PROXY_PORT: "3981", RIG_PORTAL_PORT: "3982", RIG_AGENT_PORT: "5193" }, "proxy");
  await waitFor("http://127.0.0.1:5193/health", "agent"); await waitFor("http://127.0.0.1:3982/", "portal"); await waitFor("http://127.0.0.1:3981/", "proxy");
  const browser = await chromium.launch();
  for (const theme of ["light", "dark"]) for (const width of [1280, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: theme });
    await ctx.addInitScript((t) => { try { localStorage.setItem("cw-theme", t); } catch { /* none */ } }, theme);
    const page = await ctx.newPage();
    // the phone has its own page (the desk page hands over to it after load, which would eat the typing)
    await page.goto(`http://127.0.0.1:3981/${width < 600 ? "m/agent" : "agent"}`, { waitUntil: "load" }); await page.waitForTimeout(2000);
    // the phone page has its own composer: whichever one is on screen
    const box = page.locator("textarea:visible").first(); await box.waitFor({ timeout: 30000 });
    await box.fill("Is Sudan's airspace open?"); await box.press("Enter");
    const shown = await page.waitForSelector("[data-cite]", { timeout: 40000, state: "attached" }).then(() => true, () => false); await page.waitForTimeout(600);
    if (!shown) { await page.screenshot({ path: path.join(OUT, `FAILED-${theme}-${width}.png`) }); ok(false, `${theme} ${width}: the answer arrived with citations`, (await page.locator("body").innerText()).slice(-400).replace(/\s+/g, " ")); await ctx.close(); continue; }
    const cites = await page.locator("[data-cite]").count();
    const marks = await page.locator("[data-claim-mark]").allTextContents();
    const strong = await page.locator("strong", { hasText: "No — Sudan" }).count();
    const label = `${theme} ${width}`;
    ok(cites === 3, `${label}: a source number after each of the three cited claims`, cites);
    ok(marks.length === 1 && /^not from an official source: reuters\.com, 2 Nov/.test(marks[0]), `${label}: the mark on the Reuters claim only, in words`, marks.join(" | "));
    ok(strong === 1 && (await page.locator("li").filter({ hasText: "SafeAirspace" }).count()) >= 1, `${label}: the markdown still renders (bold, the list) with the citations in it`);
    const partialBox = page.locator("[data-partial-answer]");
    ok((await partialBox.count()) === 1 && /Partial answer · then tried to check the NOTAMs, and that check failed/i.test(await partialBox.innerText()) && /Check the current HSSS NOTAMs/.test(await partialBox.innerText()), `${label}: the first reply shows as a partial answer, and says the NOTAM check failed (the rig has no NOTAM source) — never "checked"`, (await partialBox.innerText().catch(() => "")).slice(0, 90));
    const chips = await page.locator("body").innerText();
    ok(/Official/.test(chips) && /Industry reference/.test(chips) && /Web · not approved/.test(chips), `${label}: the sources say what they are`);
    await page.screenshot({ path: path.join(OUT, `answer-${theme}-${width}.png`), fullPage: false });
    if (width === 1280) {
      await page.goto("http://127.0.0.1:3981/agent/settings?tab=web", { waitUntil: "load" });
      await page.getByRole("radiogroup", { name: "Provider" }).waitFor({ timeout: 20000 });
      const official = await page.getByRole("textbox", { name: "Official sources" }).inputValue();
      ok(official.split("\n").includes("easa.europa.eu") && (await page.getByRole("radio").count()) === 3, `${label}: Settings › Web search shows the three-state switch and the lists`, `${official.split("\n").length} official`);
      await page.screenshot({ path: path.join(OUT, `settings-${theme}.png`), fullPage: true });
    }
    await ctx.close();
  }
  await browser.close();
} finally { for (const k of kids) k.c.kill(); api.close(); }
console.log(`screenshots: ${OUT}`);
console.log(failures ? `${failures} FAILED` : "ALL PASSED"); process.exit(failures ? 1 : 0);
