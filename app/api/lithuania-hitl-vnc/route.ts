import { NextRequest, NextResponse } from "next/server";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENTRY_URL = "https://www.ans.lt/a1/aip/02_16Apr2026/EY-history-en-US.html";
const PROJECT_ROOT = process.cwd();
const OUT_GEN = join(PROJECT_ROOT, "downloads", "lithuania-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "lithuania-eaip", "AD2");
const DEFAULT_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
const DEFAULT_LANG = "en-US,en;q=0.9";
const SESSION_TTL_MS = 30 * 60 * 1000;
const WD_TIMEOUT_MS = 60_000;
const SELENIUM_BASE = String(process.env.LITHUANIA_SELENIUM_URL || "http://lithuania-browser:4444/wd/hub").replace(/\/$/, "");

type Mode = "collect" | "gen12" | "ad2";
type Ad2Entry = { icao: string; label: string; htmlUrl: string };
type SessionRecord = { sessionId: string; createdAt: number; lastUsedAt: number };

function getStore(): Map<string, SessionRecord> {
  const g = globalThis as unknown as { __lithuaniaWdStoreVnc?: Map<string, SessionRecord> };
  if (!g.__lithuaniaWdStoreVnc) g.__lithuaniaWdStoreVnc = new Map();
  return g.__lithuaniaWdStoreVnc;
}

function touchSession(id: string) {
  const s = getStore().get(id);
  if (s) s.lastUsedAt = Date.now();
}

async function deleteWdSession(sessionId: string) {
  await fetch(`${SELENIUM_BASE}/session/${encodeURIComponent(sessionId)}`, { method: "DELETE" }).catch(() => {});
  getStore().delete(sessionId);
}

async function cleanupStaleSessions() {
  const now = Date.now();
  for (const [id, row] of getStore().entries()) {
    if (now - row.lastUsedAt > SESSION_TTL_MS) await deleteWdSession(id);
  }
}

async function listWdSessions(): Promise<string[]> {
  const out = await wdCall("/sessions");
  const rows = Array.isArray(out?.value) ? out.value : [];
  return rows
    .map((row: any) => String(row?.id || row?.sessionId || "").trim())
    .filter((id: string) => Boolean(id));
}

async function reapAllWdSessions() {
  const ids = await listWdSessions().catch(() => []);
  for (const id of ids) {
    await deleteWdSession(id);
  }
  getStore().clear();
}

function isVerificationPage(html: string): boolean {
  const body = String(html || "").toLowerCase();
  return (
    body.includes("__http403_forbidden__") ||
    body.includes("just a moment") ||
    body.includes("cf-challenge") ||
    body.includes("cf-browser-verification") ||
    body.includes("captcha") ||
    body.includes("verify you are human")
  );
}

async function wdCall(path: string, method = "GET", body?: unknown): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WD_TIMEOUT_MS);
  try {
    const res = await fetch(`${SELENIUM_BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${JSON.stringify(json).slice(0, 200)}`);
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function createWdSession(): Promise<string> {
  const payload = {
    capabilities: {
      alwaysMatch: {
        browserName: "chrome",
        "goog:chromeOptions": {
          args: [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-blink-features=AutomationControlled",
            "--window-size=1366,900",
            "--lang=en-US,en;q=0.9",
          ],
          excludeSwitches: ["enable-automation"],
          useAutomationExtension: false,
        },
      },
    },
  };
  const out = await wdCall("/session", "POST", payload);
  const sid = String(out?.value?.sessionId || out?.sessionId || "").trim();
  if (!sid) throw new Error("Selenium did not return sessionId");
  return sid;
}

async function wdNavigate(sessionId: string, url: string) {
  await wdCall(`/session/${encodeURIComponent(sessionId)}/url`, "POST", { url });
  touchSession(sessionId);
}

async function wdGetCurrentUrl(sessionId: string): Promise<string> {
  const out = await wdCall(`/session/${encodeURIComponent(sessionId)}/url`);
  touchSession(sessionId);
  return String(out?.value || "");
}

async function wdGetTitle(sessionId: string): Promise<string> {
  const out = await wdCall(`/session/${encodeURIComponent(sessionId)}/title`);
  touchSession(sessionId);
  return String(out?.value || "");
}

async function wdGetSource(sessionId: string): Promise<string> {
  const out = await wdCall(`/session/${encodeURIComponent(sessionId)}/source`);
  touchSession(sessionId);
  return String(out?.value || "");
}

async function wdFetchHtml(sessionId: string, url: string): Promise<string> {
  await wdNavigate(sessionId, url);
  return await wdGetSource(sessionId);
}

async function wdGetCookies(sessionId: string): Promise<string> {
  const out = await wdCall(`/session/${encodeURIComponent(sessionId)}/cookie`);
  touchSession(sessionId);
  const cookies = Array.isArray(out?.value) ? out.value : [];
  return cookies
    .map((c: any) => `${String(c?.name || "").trim()}=${String(c?.value || "").trim()}`)
    .filter((x: string) => x && !x.startsWith("="))
    .join("; ");
}

async function wdGetBrowserMeta(sessionId: string): Promise<{ userAgent: string; language: string }> {
  const script = `
    return {
      userAgent: String(navigator.userAgent || ''),
      language: String(navigator.language || '')
    };
  `;
  const out = await wdCall(`/session/${encodeURIComponent(sessionId)}/execute/sync`, "POST", { script, args: [] });
  touchSession(sessionId);
  const ua = String(out?.value?.userAgent || "").trim();
  const lang = String(out?.value?.language || "").trim();
  return {
    userAgent: ua || DEFAULT_UA,
    language: lang || "en-US",
  };
}

async function wdChallengeStatus(sessionId: string): Promise<{ challengeDetected: boolean; challengeOnly: boolean }> {
  const script = `
    const t = String(document.title || '').toLowerCase();
    const bodyText = String(document.body?.innerText || '').toLowerCase();
    const lines = String(document.body?.innerText || '').split(/\\r?\\n/).map(x => x.trim()).filter(Boolean);
    const hasCfIframe = Boolean(document.querySelector("iframe[src*='challenges.cloudflare.com']"));
    const challengeDetected = hasCfIframe || t.includes('just a moment') || bodyText.includes('verify you are human') || bodyText.includes('checking your browser');
    return { challengeDetected, challengeOnly: challengeDetected && lines.length <= 14 };
  `;
  const out = await wdCall(`/session/${encodeURIComponent(sessionId)}/execute/sync`, "POST", { script, args: [] });
  touchSession(sessionId);
  return {
    challengeDetected: Boolean(out?.value?.challengeDetected),
    challengeOnly: Boolean(out?.value?.challengeOnly),
  };
}

function buildNoVncUrl(request: NextRequest): string {
  const explicit = String(process.env.LITHUANIA_NOVNC_URL || "").trim();
  if (explicit) return explicit;
  const host = String(request.headers.get("host") || "localhost:3000").replace(/:\d+$/, "");
  // noVNC standalone endpoint on port 6080 is typically served over plain HTTP.
  // Using https here causes browser connection failures on many deployments.
  return `http://${host}:6080/vnc.html?autoconnect=1&resize=scale`;
}

function buildHeaders(cookie: string, userAgent: string, language: string, referer = "") {
  const headers: HeadersInit = {
    "User-Agent": userAgent || DEFAULT_UA,
    "Accept-Language": language ? `${language},en;q=0.9` : DEFAULT_LANG,
  };
  if (referer) headers.Referer = referer;
  const clean = String(cookie || "").trim();
  if (clean) headers.Cookie = clean;
  return headers;
}

async function downloadPdf(url: string, cookie: string, userAgent: string, language: string, outFile: string, referer = "") {
  const headers = buildHeaders(cookie, userAgent, language, referer);
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Downloaded payload is not a PDF");
  writeFileSync(outFile, bytes);
}

function parseIssueIndexUrl(historyHtml: string, historyUrl: string): { indexUrl: string; effectiveDate: string | null } {
  const links = [...String(historyHtml || "").matchAll(/href=['"]([^'"]*\/html\/index-[^'"]+\.html)['"]/gi)].map((m) => m[1]);
  if (!links.length) throw new Error("Could not resolve Lithuania issue index URL.");
  const resolved = links.map((href) => new URL(href, historyUrl).href);
  resolved.sort((a, b) => String(b).localeCompare(String(a)));
  const indexUrl = resolved[0];
  const isoDateMatch = indexUrl.match(/(\d{4}-\d{2}-\d{2})/);
  const stampMatch = indexUrl.match(/(\d{2})_(\d{2})([A-Za-z]{3})(\d{4})/);
  let effectiveDate: string | null = isoDateMatch?.[1] || null;
  if (!effectiveDate && stampMatch) {
    const months: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
    const mm = months[stampMatch[3].toLowerCase()];
    if (mm) effectiveDate = `${stampMatch[4]}-${mm}-${stampMatch[2]}`;
  }
  return { indexUrl, effectiveDate };
}

function collectFrameSrcs(html: string, baseUrl: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of String(html || "").matchAll(/<(?:frame|iframe)\b[^>]*\bsrc=['"]([^'"]+)['"][^>]*>/gi)) {
    const raw = String(m[1] || "").trim();
    if (!raw) continue;
    const abs = new URL(raw, baseUrl).href;
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push(abs);
  }
  return out;
}

function parseTocUrl(indexHtml: string, indexUrl: string): string {
  const html = String(indexHtml || "");

  const strict = html.match(/<(?:frame|iframe)\b[^>]*\bname=['"]eAISNavigationBase['"][^>]*\bsrc=['"]([^'"]+)['"][^>]*>/i)?.[1];
  if (strict) return new URL(strict, indexUrl).href;

  const frames = collectFrameSrcs(html, indexUrl);
  const ranked =
    frames.find((u) => /(?:\/|_|-)toc(?:[-_.]|$)/i.test(u)) ||
    frames.find((u) => /navigationbase|navigation/i.test(u)) ||
    frames.find((u) => /frameset/i.test(u)) ||
    frames[0];
  if (ranked) return ranked;

  // Some cycles expose the next TOC/frameset link directly, without frame tags.
  const direct = html.match(/href=['"]([^'"]*(?:toc|frameset)[^'"]*\.html[^'"]*)['"]/i)?.[1];
  if (direct) return new URL(direct, indexUrl).href;

  throw new Error("Could not resolve Lithuania TOC URL.");
}

function parseMenuUrl(tocHtml: string, tocUrl: string): string {
  const html = String(tocHtml || "");

  const strict = html.match(/<(?:frame|iframe)\b[^>]*\bname=['"]eAISNavigation['"][^>]*\bsrc=['"]([^'"]+)['"][^>]*>/i)?.[1];
  if (strict) return new URL(strict, tocUrl).href;

  const frames = collectFrameSrcs(html, tocUrl);
  const ranked =
    frames.find((u) => /(?:\/|_|-)menu(?:[-_.]|$)/i.test(u)) ||
    frames.find((u) => /navigation/i.test(u)) ||
    frames[0];
  if (ranked) return ranked;

  // When TOC HTML is already the menu content (no nested frame), reuse it.
  if (/EY-AD-2\.[A-Z0-9]{4}/i.test(html) || /EY-GEN-1\.2/i.test(html)) return tocUrl;

  throw new Error("Could not resolve Lithuania menu URL.");
}

function parseAd2Entries(menuHtml: string, menuUrl: string): Ad2Entry[] {
  const byIcao = new Map<string, Ad2Entry>();
  for (const m of String(menuHtml || "").matchAll(/href=['"]([^'"]*EY-AD-2\.([A-Z0-9]{4})-[^'"]*\.html#[^'"]*)['"]/gi)) {
    const icao = m[2].toUpperCase();
    if (byIcao.has(icao)) continue;
    byIcao.set(icao, { icao, label: icao, htmlUrl: new URL(m[1], menuUrl).href });
  }
  return [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
}

function parsePdfLinks(pageHtml: string, pageUrl: string): string[] {
  return [...String(pageHtml || "").matchAll(/href=['"]([^'"]+\.pdf[^'"]*)['"]/gi)].map((m) => new URL(m[1], pageUrl).href);
}

async function resolveContext(sessionId: string) {
  const entryHtml = await wdFetchHtml(sessionId, ENTRY_URL);
  if (isVerificationPage(entryHtml)) return { needsVerification: true as const };
  const { indexUrl, effectiveDate } = parseIssueIndexUrl(entryHtml, ENTRY_URL);
  const indexHtml = await wdFetchHtml(sessionId, indexUrl);
  if (isVerificationPage(indexHtml)) return { needsVerification: true as const };
  const tocUrl = parseTocUrl(indexHtml, indexUrl);
  const tocHtml = await wdFetchHtml(sessionId, tocUrl);
  if (isVerificationPage(tocHtml)) return { needsVerification: true as const };
  const menuUrl = parseMenuUrl(tocHtml, tocUrl);
  const menuHtml = await wdFetchHtml(sessionId, menuUrl);
  if (isVerificationPage(menuHtml)) return { needsVerification: true as const };
  const ad2Entries = parseAd2Entries(menuHtml, menuUrl);
  const genHtmlUrl = new URL("eAIP/EY-GEN-1.2-en-US.html", new URL("html/", new URL("../", indexUrl))).href;
  return { needsVerification: false as const, effectiveDate, genHtmlUrl, ad2Entries };
}

async function runLithuaniaScrape(
  sessionId: string,
  cookie: string,
  userAgent: string,
  language: string,
  mode: Mode,
  icao: string,
) {
  const ctx = await resolveContext(sessionId);
  if (ctx.needsVerification) {
    return { ok: false, needsHumanVerification: true, message: "Lithuania source still requires verification in noVNC browser.", verifyUrl: ENTRY_URL };
  }
  if (mode === "collect") {
    return { ok: true, effectiveDate: ctx.effectiveDate, ad2Icaos: ctx.ad2Entries.map((x) => x.icao) };
  }
  if (mode === "gen12") {
    const genHtml = await wdFetchHtml(sessionId, ctx.genHtmlUrl);
    if (isVerificationPage(genHtml)) {
      return { ok: false, needsHumanVerification: true, message: "Verification expired during GEN fetch. Re-verify and retry.", verifyUrl: ENTRY_URL };
    }
    const candidates = parsePdfLinks(genHtml, ctx.genHtmlUrl);
    if (!candidates.length) throw new Error("No GEN 1.2 PDF links found on Lithuania GEN page.");
    mkdirSync(OUT_GEN, { recursive: true });
    const outFile = join(OUT_GEN, `${ctx.effectiveDate || "unknown-date"}_GEN-1.2.pdf`);
    let lastError = "";
    for (const url of candidates) {
      try {
        await downloadPdf(url, cookie, userAgent, language, outFile, ctx.genHtmlUrl);
        return { ok: true, file: outFile, sourceUrl: url };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
    throw new Error(lastError || "All GEN 1.2 candidates failed.");
  }
  const wantedIcao = String(icao || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(wantedIcao)) return { ok: false, error: "Provide a valid ICAO for AD2 mode." };
  const row = ctx.ad2Entries.find((x) => x.icao === wantedIcao);
  if (!row) return { ok: false, error: `ICAO not found in Lithuania AD2 menu: ${wantedIcao}` };
  const adHtml = await wdFetchHtml(sessionId, row.htmlUrl);
  if (isVerificationPage(adHtml)) {
    return { ok: false, needsHumanVerification: true, message: "Verification expired during AD2 fetch. Re-verify and retry.", verifyUrl: ENTRY_URL };
  }
  const candidates = parsePdfLinks(adHtml, row.htmlUrl);
  if (!candidates.length) throw new Error(`No AD2 PDF links found for ${row.icao}.`);
  mkdirSync(OUT_AD2, { recursive: true });
  const outFile = join(OUT_AD2, `${ctx.effectiveDate || "unknown-date"}_${row.icao}_AD2.pdf`);
  let lastError = "";
  for (const url of candidates) {
    try {
      await downloadPdf(url, cookie, userAgent, language, outFile, row.htmlUrl);
      return { ok: true, file: outFile, sourceUrl: url, icao: row.icao };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(lastError || `All AD2 candidates failed for ${row.icao}.`);
}

export async function POST(request: NextRequest) {
  try {
    await cleanupStaleSessions();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "").trim();

    if (action === "start") {
      // Selenium node is single-session; clear any stale remote sessions first
      // to avoid long queueing/hangs when previous sessions were not closed cleanly.
      await reapAllWdSessions();
      const sessionId = await createWdSession();
      await wdNavigate(sessionId, ENTRY_URL);
      getStore().set(sessionId, { sessionId, createdAt: Date.now(), lastUsedAt: Date.now() });
      return NextResponse.json({
        ok: true,
        sessionId,
        verifyUrl: ENTRY_URL,
        popupUrl: buildNoVncUrl(request),
      });
    }

    const sessionId = String(body.sessionId || "").trim();
    if (!sessionId) return NextResponse.json({ ok: false, error: "sessionId is required" }, { status: 400 });
    if (!getStore().has(sessionId)) return NextResponse.json({ ok: false, error: "Session not found or expired" }, { status: 404 });
    touchSession(sessionId);

    if (action === "status") {
      const [url, title, challenge] = await Promise.all([wdGetCurrentUrl(sessionId), wdGetTitle(sessionId), wdChallengeStatus(sessionId)]);
      return NextResponse.json({ ok: true, sessionId, url, title, ...challenge });
    }

    if (action === "scrape") {
      const mode = String(body.mode || "collect") as Mode;
      const icao = String(body.icao || "").trim().toUpperCase();
      const [cookie, browserMeta] = await Promise.all([wdGetCookies(sessionId), wdGetBrowserMeta(sessionId)]);
      if (!cookie) {
        return NextResponse.json({
          ok: false,
          needsHumanVerification: true,
          message: "No browser session cookies yet. Solve captcha in noVNC popup first.",
          verifyUrl: ENTRY_URL,
        });
      }
      const result = await runLithuaniaScrape(sessionId, cookie, browserMeta.userAgent, browserMeta.language, mode, icao);
      return NextResponse.json(result);
    }

    if (action === "close") {
      await deleteWdSession(sessionId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: "Lithuania HITL VNC route failed", detail }, { status: 500 });
  }
}
