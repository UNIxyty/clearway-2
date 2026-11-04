// Disclosure shows only when it has something to report (2026-11-05). On the real model, the rig's own key: a real agent
// server, the real API, one turn per kind. "hey" got a partial-answer banner, a line about NOTAMs not being checked,
// three paragraphs about nothing having been checked, a "No source" footer and 366 output tokens over 7.1 s.
//
//   greetings ("hey", "thanks", "what can you do")  no banner, no footer, no disclosure, under 100 output tokens, fast tier
//   a question answered completely                   no partial banner, citations present
//   a question where a tool genuinely failed         the failure shown, naming that tool (the rig has no NOTAM source)
//   a question partly answered                       "could not establish" only for the part asked for and missing
// Costs a few cents of the rig key a run. Needs the key: skipped with a reason when .env.rig has none.
//   node --env-file=.env.rig rig/agent-disclosure-check.mjs
import { spawn } from "node:child_process";
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d !== "" ? `  · ${String(d).slice(0, 260)}` : ""}`); if (!c) failures += 1; };
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
if (!String(process.env.ANTHROPIC_API_KEY || "").trim()) { console.log("SKIP  no ANTHROPIC_API_KEY in .env.rig (rig/probes/no-model-key.mjs)"); process.exit(0); }

const PORT = 5194;
const child = spawn("node", ["--env-file=.env.rig", "agent/server.mjs"], { env: { ...process.env, PORT: String(PORT), DISABLE_AUTH_FOR_TESTING: "true", AGENT_TEST_ROLE: "user", MODEL_PROVIDER: "anthropic", SMOKE_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"] });
let log = ""; child.stdout.on("data", (d) => { log += d; }); child.stderr.on("data", (d) => { log += d; });
try {
  let up = false;
  for (let i = 0; i < 80 && !up; i += 1) { await new Promise((r) => setTimeout(r, 250)); try { up = (await fetch(`http://127.0.0.1:${PORT}/health`)).status < 500; } catch { /* starting */ } }
  if (!up) throw new Error(`the agent did not start: ${log.slice(-300)}`);
  const turns = [];
  const chat = async (message) => {
    const t0 = Date.now();
    const r = await fetch(`http://127.0.0.1:${PORT}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message }), signal: AbortSignal.timeout(180_000) });
    const raw = await r.text(); const events = [];
    for (const f of raw.split("\n\n")) { const ev = /^event: (.+)$/m.exec(f)?.[1]; const data = /^data: (.+)$/m.exec(f)?.[1]; if (ev && data) { try { events.push({ ev, data: JSON.parse(data) }); } catch { /* partial frame */ } } }
    const out = { message, ms: Date.now() - t0, events, done: events.find((e) => e.ev === "done")?.data ?? null, error: events.find((e) => e.ev === "error")?.data ?? null };
    turns.push(out); return out;
  };
  // what disclosure with nothing under it looks like
  const EMPTY_DISCLOSURE = /could not establish|not been checked|have not checked|haven't checked|did not check|didn't check|nothing (has been|is|was) (recorded|checked)|no source|cannot conclude|can't conclude|nothing can be concluded/i;

  // ── greetings: nothing to report, so nothing reported ──
  for (const q of ["hey", "thanks", "what can you do"]) {
    const t = await chat(q); const d = t.done;
    const tier = d?.routing?.finalTier ?? d?.routing?.tier ?? d?.modelTier ?? null;
    ok(Boolean(d) && !d.partial && !t.events.some((e) => e.ev === "partial"), `"${q}": no partial-answer banner`, t.error ? JSON.stringify(t.error) : "");
    ok(d?.assertsNothing === true && (d.sources ?? []).length === 0, `"${q}": no "No source" footer (the reply asserts nothing)`, `${(d?.sources ?? []).length} sources · assertsNothing ${d?.assertsNothing}`);
    ok(!EMPTY_DISCLOSURE.test(d?.content ?? ""), `"${q}": no disclosure with nothing under it`, (d?.content ?? "").replace(/\s+/g, " ").slice(0, 160));
    ok((d?.outputTokens ?? 999) < 100, `"${q}": under 100 output tokens`, `${d?.outputTokens} tokens · ${t.ms} ms`);
    ok(tier === "fast", `"${q}": the fast tier`, `${tier} · ${d?.modelId}`);
  }

  // ── a question answered completely: citations, no banner ──
  {
    // a document question: its answer does not turn on a NOTAM check (the rig has no NOTAM source, so one would fail)
    const t = await chat("What is EASA Safety Directive SD-2021-02 about, and when was it issued?"); const d = t.done;
    ok(Boolean(d) && !d.partial && (d.sources ?? []).length > 0 && (d.claims ?? []).length > 0, "a question answered completely: no partial banner, citations present", `${(d?.sources ?? []).length} sources · ${(d?.claims ?? []).length} cited claims${t.error ? ` · ${JSON.stringify(t.error)}` : ""}`);
  }

  // ── a tool that genuinely failed: shown, naming the tool (the rig has no NOTAM source) ──
  {
    const t = await chat("Are there any NOTAMs at EVRA today that affect a departure this afternoon?"); const d = t.done;
    const failed = (d?.toolActivity ?? []).filter((a) => a.ok === false).map((a) => a.name);
    const named = failed.includes("get_notams") || /^The NOTAMs could not be checked/.test(d?.partial?.line ?? "");
    ok(named, "a tool that genuinely failed: the failure is shown, naming that tool (the console's card for a failed step, or the one-line missing check)", `failed steps: ${failed.join(", ") || "none"} · ${d?.partial?.line ?? "no partial line"}`);
    ok(!/\b(no (current |active )?NOTAMs?|there are no NOTAMs)\b/i.test(d?.content ?? "") || /could not|couldn't|unavailable|did not answer|not available/i.test(d?.content ?? ""), "…and the answer never says there are no NOTAMs on the strength of a check that failed", (d?.content ?? "").replace(/\s+/g, " ").slice(0, 160));
  }

  // ── partly answered: what is missing is the part asked for, by name, and nothing else ──
  {
    const t = await chat("What does EASA's conflict zone bulletin say about Belarus, and what is the direct phone number of the Minsk airport duty manager tonight?"); const d = t.done;
    const c = d?.content ?? "";
    ok(/phone|number|duty manager/i.test(c) && /(could not|couldn't|not) (find|establish|found|established|published)|no (published|public) (phone|number)/i.test(c), "partly answered: the part not found (the duty manager's number) is said, by name", c.replace(/\s+/g, " ").slice(-200));
    // the missing list: the "What I could not establish" section (to the next heading), or the sentences that say so
    const sec = /\*{0,2}What I could not establish\*{0,2}:?\s*\n([\s\S]*?)(?=\n\s*\*\*[^*\n]+\*\*\s*\n|\n#{1,3} |$)/i.exec(c)?.[1];
    const missingSection = sec ?? c.split(/(?<=[.!?])\s+|\n+/).filter((x) => /could not establish|couldn't establish|not established/i.test(x)).join(" ");
    ok(!/\b(NOTAMs?|limitations|weather|METAR|TAF)\b/.test(missingSection), "…and the missing list names only what was asked: no NOTAMs, limitations or weather nobody asked about", missingSection.replace(/\s+/g, " ").slice(0, 160));
  }
  // across every turn: a partial line only ever stands for a check that really failed
  const unbacked = turns.filter((t) => t.done?.partial && !(t.done.partial.followUps ?? []).every((f) => f.outcome === "failed" && (t.done.toolActivity ?? []).some((a) => a.ok === false && (!f.tool || a.name === f.tool))));
  ok(unbacked.length === 0, `across all ${turns.length} turns: every partial line stands for a check whose tool really failed`, unbacked.map((t) => `${t.message}: ${t.done.partial.line}`).join(" | "));
} finally { child.kill(); }
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
