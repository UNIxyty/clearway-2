import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROJECT_ROOT = process.cwd();
const DEFAULT_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
const DEFAULT_LANG = "en-US,en;q=0.9";
const SESSION_TTL_MS = 30 * 60 * 1000;
const WD_TIMEOUT_MS = 60_000;
const SCRIPT_TIMEOUT_MS = 8 * 60 * 1000;
const SELENIUM_BASE = String(process.env.BLOCKED_SELENIUM_URL || process.env.LITHUANIA_SELENIUM_URL || "http://lithuania-browser:4444/wd/hub").replace(/\/$/, "");
const SELENIUM_ROOT = SELENIUM_BASE.replace(/\/wd\/hub$/i, "");

type Mode = "collect" | "gen12" | "ad2";
type CountryKey = "greece" | "germany" | "netherlands" | "slovenia";
type CountryConfig = {
  key: CountryKey;
  country: string;
  icaoPrefix: string;
  entryUrl: string;
  outDirSlug: string;
};
type SessionRecord = { sessionId: string; countryKey: CountryKey; createdAt: number; lastUsedAt: number };
type PdfEntry = { url: string; text: string; sourceUrl: string };
type CollectOutput = { effectiveDate?: string | null; ad2Icaos?: string[] };

const COUNTRIES: Record<CountryKey, CountryConfig> = {
  greece: {
    key: "greece",
    country: "Greece",
    icaoPrefix: "LG",
    entryUrl: "https://aisgr.hasp.gov.gr/main.php?rand=0.7276487307378027#publications",
    outDirSlug: "greece-eaip",
  },
  germany: {
    key: "germany",
    country: "Germany",
    icaoPrefix: "ED",
    entryUrl: "https://aip.dfs.de/BasicIFR/2026APR20/chapter/279afdc243b210751d2f9f2401e5e4db.html",
    outDirSlug: "germany-eaip",
  },
  netherlands: {
    key: "netherlands",
    country: "Netherlands",
    icaoPrefix: "EH",
    entryUrl: "https://eaip.lvnl.nl/web/eaip/default.html",
    outDirSlug: "netherlands-eaip",
  },
  slovenia: {
    key: "slovenia",
    country: "Slovenia",
    icaoPrefix: "LJ",
    entryUrl: "https://aim.sloveniacontrol.si/aim/products/aip/",
    outDirSlug: "slovenia-eaip",
  },
};

function getStore(): Map<string, SessionRecord> {
  const g = globalThis as unknown as { __blockedWdStoreVnc?: Map<string, SessionRecord> };
  if (!g.__blockedWdStoreVnc) g.__blockedWdStoreVnc = new Map();
  return g.__blockedWdStoreVnc;
}

function isCountryKey(value: string): value is CountryKey {
  return value in COUNTRIES;
}

function touchSession(id: string) {
  const s = getStore().get(id);
  if (s) s.lastUsedAt = Date.now();
}

async function deleteWdSession(sessionId: string) {
  const id = encodeURIComponent(sessionId);
  await Promise.all([
    fetch(`${SELENIUM_BASE}/session/${id}`, { method: "DELETE" }).catch(() => {}),
    fetch(`${SELENIUM_ROOT}/session/${id}`, { method: "DELETE" }).catch(() => {}),
  ]);
  getStore().delete(sessionId);
}

async function cleanupStaleSessions() {
  const now = Date.now();
  for (const [id, row] of getStore().entries()) {
    if (now - row.lastUsedAt > SESSION_TTL_MS) await deleteWdSession(id);
  }
}

async function listWdSessions(): Promise<string[]> {
  const ids = new Set<string>();
  const out = await wdCall("/sessions").catch(() => null);
  const rows = Array.isArray(out?.value) ? out.value : [];
  for (const row of rows) {
    const id = String(row?.id || row?.sessionId || "").trim();
    if (id) ids.add(id);
  }
  const status = await fetch(`${SELENIUM_ROOT}/status`)
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);
  const nodes = Array.isArray(status?.value?.nodes) ? status.value.nodes : [];
  for (const node of nodes) {
    const slots = Array.isArray(node?.slots) ? node.slots : [];
    for (const slot of slots) {
      const session = slot?.session;
      const id = String(session?.sessionId || session?.id || "").trim();
      if (id) ids.add(id);
    }
  }
  return [...ids];
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
    body.includes("g-recaptcha") ||
    body.includes("user check") ||
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
    const recaptchaToken = String(document.querySelector("textarea[name='g-recaptcha-response']")?.value || '').trim();
    const hasRecaptcha = Boolean(document.querySelector(".g-recaptcha, iframe[src*='recaptcha'], textarea[name='g-recaptcha-response']"));
    const challengeDetected = (hasRecaptcha && !recaptchaToken) || hasCfIframe || t.includes('just a moment') || bodyText.includes('verify you are human') || bodyText.includes('checking your browser');
    return { challengeDetected, challengeOnly: challengeDetected && lines.length <= 14 };
  `;
  const out = await wdCall(`/session/${encodeURIComponent(sessionId)}/execute/sync`, "POST", { script, args: [] });
  touchSession(sessionId);
  return {
    challengeDetected: Boolean(out?.value?.challengeDetected),
    challengeOnly: Boolean(out?.value?.challengeOnly),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function wdAdvanceGreeceCaptchaIfReady(sessionId: string): Promise<"submitted" | "waiting" | "not-captcha"> {
  const script = `
    const hasForm = Boolean(document.querySelector("#aisgr_recaptcha_form, .g-recaptcha, textarea[name='g-recaptcha-response']"));
    if (!hasForm) return "not-captcha";
    const token = String(document.querySelector("textarea[name='g-recaptcha-response']")?.value || '').trim();
    if (!token) return "waiting";
    const btn = document.querySelector("#submit_btn");
    if (btn) {
      btn.click();
      return "submitted";
    }
    return "waiting";
  `;
  const out = await wdCall(`/session/${encodeURIComponent(sessionId)}/execute/sync`, "POST", { script, args: [] });
  touchSession(sessionId);
  const value = String(out?.value || "");
  if (value === "submitted") await sleep(2500);
  return value === "submitted" || value === "waiting" ? value : "not-captcha";
}

function buildNoVncUrl(request: NextRequest): string {
  const explicit = String(process.env.BLOCKED_NOVNC_URL || process.env.LITHUANIA_NOVNC_URL || "").trim();
  if (explicit) return explicit;
  const host = String(request.headers.get("host") || "localhost:3000").replace(/:\d+$/, "");
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

async function runNodeScript(scriptPath: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn("node", [scriptPath, ...args], { cwd: PROJECT_ROOT, env: process.env });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Timeout running ${scriptPath}`));
    }, SCRIPT_TIMEOUT_MS);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error((stderr || stdout || `${scriptPath} exited ${code}`).trim()));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function parseCollectOutput(stdout: string): CollectOutput {
  const body = String(stdout || "").trim();
  if (!body) return {};
  const start = body.lastIndexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return {};
  try {
    const parsed = JSON.parse(body.slice(start, end + 1)) as CollectOutput;
    return {
      effectiveDate: parsed.effectiveDate || null,
      ad2Icaos: Array.isArray(parsed.ad2Icaos) ? parsed.ad2Icaos.map((x) => String(x).toUpperCase()) : [],
    };
  } catch {
    return {};
  }
}

function latestPdfFile(dir: string, includeToken = ""): string {
  if (!existsSync(dir)) return "";
  const token = String(includeToken || "").toUpperCase();
  const files = readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .filter((name) => (token ? name.toUpperCase().includes(token) : true))
    .sort((a, b) => statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs);
  return files[0] ? join(dir, files[0]) : "";
}

async function runGreeceScriptFlow(mode: Mode, icao: string, postCaptchaHtml: string) {
  const scriptPath = join(PROJECT_ROOT, "scripts", "web-table-scrapers", "greece-eaip-interactive.mjs");
  const tempPath = join(tmpdir(), `clearway-greece-post-captcha-${Date.now()}.html`);
  writeFileSync(tempPath, postCaptchaHtml, "utf8");
  try {
    if (mode === "collect") {
      const out = await runNodeScript(scriptPath, ["--collect", "--post-captcha-html", tempPath]);
      const parsed = parseCollectOutput(out.stdout);
      return {
        ok: true,
        effectiveDate: parsed.effectiveDate || null,
        ad2Icaos: parsed.ad2Icaos || [],
      };
    }

    if (mode === "gen12") {
      await runNodeScript(scriptPath, ["--download-gen12", "--post-captcha-html", tempPath]);
      const file = latestPdfFile(join(PROJECT_ROOT, "downloads", "greece-eaip", "GEN"), "GEN-1.2");
      if (!file) throw new Error("Greece GEN 1.2 download finished but output file was not found.");
      return { ok: true, file };
    }

    const wantedIcao = String(icao || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(wantedIcao)) return { ok: false, error: "Provide a valid ICAO for AD2 mode." };
    await runNodeScript(scriptPath, ["--download-ad2", wantedIcao, "--post-captcha-html", tempPath]);
    const file = latestPdfFile(join(PROJECT_ROOT, "downloads", "greece-eaip", "AD2"), wantedIcao);
    if (!file) throw new Error(`Greece AD2 download finished but output file for ${wantedIcao} was not found.`);
    return { ok: true, file, icao: wantedIcao };
  } finally {
    try {
      unlinkSync(tempPath);
    } catch {}
  }
}

function findHrefByText(html: string, baseUrl: string, textPattern: RegExp): string {
  for (const link of extractAnchors(html, baseUrl)) {
    if (textPattern.test(link.text)) return link.url;
  }
  return "";
}

async function wdResolveGreeceBrowseUrl(sessionId: string): Promise<string> {
  const script = `
    const norm = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const pub = document.querySelector('#publications') || document;
    const acc = Array.from(pub.querySelectorAll('button.accordion1, button'))
      .find((button) => /Aeronautical Information Publications|\\bAIP\\b/i.test(norm(button.textContent)));
    if (acc && !String(acc.className || '').includes('active')) acc.click();

    const buttons = Array.from(pub.querySelectorAll('button, a'))
      .filter((el) => /browse/i.test(norm(el.textContent)));
    for (const el of buttons) {
      const anchor = el.tagName.toLowerCase() === 'a' ? el : el.closest('a');
      if (anchor && anchor.href) return anchor.href;
      if (el.dataset?.href) return new URL(el.dataset.href, location.href).href;
    }
    return '';
  `;
  const out = await wdCall(`/session/${encodeURIComponent(sessionId)}/execute/sync`, "POST", { script, args: [] });
  touchSession(sessionId);
  return String(out?.value || "").trim();
}

async function wdBuildGreeceAipHtmlBundle(sessionId: string): Promise<string> {
  const captchaState = await wdAdvanceGreeceCaptchaIfReady(sessionId);
  if (captchaState === "waiting") {
    throw new Error("Greece reCAPTCHA is not solved yet. Check the box in noVNC first.");
  }

  let currentUrl = await wdGetCurrentUrl(sessionId);
  let html = await wdGetSource(sessionId);
  if (isVerificationPage(html)) {
    throw new Error("Greece source still requires verification in noVNC viewer.");
  }

  if (!/\/cd\/ais\/index\.html/i.test(currentUrl)) {
    if (!/\/cd\/start\/index\.html/i.test(currentUrl)) {
      const browseUrl = await wdResolveGreeceBrowseUrl(sessionId);
      if (!browseUrl) throw new Error("Could not find Greece AIP Browse button after captcha.");
      await wdNavigate(sessionId, browseUrl);
      await sleep(2000);
      currentUrl = await wdGetCurrentUrl(sessionId);
      html = await wdGetSource(sessionId);
    }

    const aipUrl = findHrefByText(html, currentUrl, /^AIP$/i) || new URL("../ais/index.html", currentUrl).href;
    await wdNavigate(sessionId, aipUrl);
    await sleep(1500);
    currentUrl = await wdGetCurrentUrl(sessionId);
    html = await wdGetSource(sessionId);
  }

  const frames = extractFrameLinks(html, currentUrl);
  const sideUrl =
    frames.find((frame) => /navigationbase|side/i.test(frame.text) || /\/side\.htm$/i.test(frame.url))?.url ||
    new URL("side.htm", currentUrl).href;
  const mainFrameUrl =
    frames.find((frame) => /content|mainframe/i.test(frame.text) || /\/mainframe\.htm$/i.test(frame.url))?.url ||
    new URL("mainframe.htm", currentUrl).href;

  const sideHtml = await wdFetchHtml(sessionId, sideUrl);
  const mainHtml = await wdFetchHtml(sessionId, mainFrameUrl).catch(() => "");
  return [
    `<!-- CLEARWAY_BASE_URL:${sideUrl} -->`,
    `<!-- CLEARWAY_AIP_INDEX_URL:${currentUrl} -->`,
    html,
    sideHtml,
    mainHtml,
  ].join("\n");
}

function parseTagAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of String(tag || "").matchAll(/\b([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(['"])(.*?)\2/g)) {
    attrs[m[1].toLowerCase()] = m[3];
  }
  return attrs;
}

function normalizeText(raw: string): string {
  return String(raw || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractAnchors(html: string, baseUrl: string): { url: string; text: string }[] {
  const out: { url: string; text: string }[] = [];
  for (const m of String(html || "").matchAll(/<a\b[^>]*\bhref=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = String(m[1] || "").trim();
    if (!href || href.startsWith("javascript:")) continue;
    const text = normalizeText(m[2]);
    try {
      out.push({ url: new URL(href, baseUrl).href, text });
    } catch {
      continue;
    }
  }
  return out;
}

function extractFrameLinks(html: string, baseUrl: string): { url: string; text: string }[] {
  const out: { url: string; text: string }[] = [];
  for (const m of String(html || "").matchAll(/<(?:frame|iframe)\b[^>]*>/gi)) {
    const attrs = parseTagAttrs(m[0]);
    const src = String(attrs.src || "").trim();
    if (!src) continue;
    try {
      out.push({ url: new URL(src, baseUrl).href, text: `${attrs.name || ""} ${attrs.id || ""}`.trim() });
    } catch {
      continue;
    }
  }
  return out;
}

function parseEffectiveDate(blob: string): string | null {
  const iso = [...blob.matchAll(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/g)]
    .map((m) => `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`);
  if (iso.length) return iso.sort().slice(-1)[0];
  const monthMap: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const long = [...blob.matchAll(/\b(0?[1-9]|[12]\d|3[01])\s+([A-Za-z]{3,9})\s+(20\d{2})\b/g)].map((m) => {
    const mm = monthMap[String(m[2]).slice(0, 3).toLowerCase()];
    return mm ? `${m[3]}-${mm}-${String(m[1]).padStart(2, "0")}` : "";
  }).filter(Boolean);
  return long.length ? long.sort().slice(-1)[0] : null;
}

function extractIcaos(blob: string, prefix: string): string[] {
  const re = new RegExp(`\\b${prefix}[A-Z0-9]{2}\\b`, "gi");
  const set = new Set<string>();
  for (const m of String(blob || "").matchAll(re)) {
    set.add(String(m[0]).toUpperCase());
  }
  return [...set].sort();
}

function scoreGen(entry: PdfEntry): number {
  const s = `${entry.url} ${entry.text}`.toLowerCase();
  let score = 0;
  if (/gen[^a-z0-9]*1[^a-z0-9]*2/.test(s)) score += 80;
  if (/\bgen\b/.test(s)) score += 30;
  if (/1[^a-z0-9]*2/.test(s)) score += 15;
  if (/ad[^a-z0-9]*2/.test(s)) score -= 40;
  return score;
}

function scoreAd2(entry: PdfEntry, icao: string): number {
  const s = `${entry.url} ${entry.text}`.toLowerCase();
  let score = 0;
  if (icao && s.includes(icao.toLowerCase())) score += 100;
  if (/ad[^a-z0-9]*2/.test(s)) score += 35;
  if (/aerodrome|airport/.test(s)) score += 20;
  if (/\bgen\b/.test(s)) score -= 45;
  return score;
}

async function crawlContext(sessionId: string, cfg: CountryConfig) {
  const origin = new URL(cfg.entryUrl).origin;
  const queue: string[] = [cfg.entryUrl];
  const seen = new Set<string>();
  const pages: { url: string; html: string }[] = [];
  const pdfMap = new Map<string, PdfEntry>();

  while (queue.length && pages.length < 10) {
    const url = String(queue.shift() || "");
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const html = await wdFetchHtml(sessionId, url);
    if (isVerificationPage(html)) return { needsVerification: true as const };
    pages.push({ url, html });

    const links = [...extractAnchors(html, url), ...extractFrameLinks(html, url)];
    for (const link of links) {
      if (!link.url.startsWith(origin)) continue;
      if (/\.pdf(?:$|[?#])/i.test(link.url)) {
        if (!pdfMap.has(link.url)) pdfMap.set(link.url, { url: link.url, text: link.text, sourceUrl: url });
        continue;
      }
      if (seen.has(link.url)) continue;
      if (!/\.html?|\.php|\/index|\/aip|\/gen|\/ad|\/publicat|\/content|\/chapter|\/products/i.test(link.url)) continue;
      queue.push(link.url);
    }
  }

  const blob = pages.map((p) => `${p.url}\n${normalizeText(p.html)}`).join("\n") + "\n" + [...pdfMap.keys()].join("\n");
  const effectiveDate = parseEffectiveDate(blob);
  const ad2Icaos = extractIcaos(blob, cfg.icaoPrefix);

  return {
    needsVerification: false as const,
    effectiveDate,
    ad2Icaos,
    pdfEntries: [...pdfMap.values()],
  };
}

async function runBlockedScrape(
  cfg: CountryConfig,
  sessionId: string,
  cookie: string,
  userAgent: string,
  language: string,
  mode: Mode,
  icao: string,
) {
  if (cfg.key === "greece") {
    let html = "";
    try {
      html = await wdBuildGreeceAipHtmlBundle(sessionId);
    } catch (err) {
      return {
        ok: false,
        needsHumanVerification: true,
        message: err instanceof Error ? err.message : "Greece source still requires verification in noVNC viewer.",
        verifyUrl: cfg.entryUrl,
      };
    }
    return await runGreeceScriptFlow(mode, icao, html);
  }

  const ctx = await crawlContext(sessionId, cfg);
  if (ctx.needsVerification) {
    return { ok: false, needsHumanVerification: true, message: `${cfg.country} source still requires verification in noVNC viewer.`, verifyUrl: cfg.entryUrl };
  }

  if (mode === "collect") {
    return { ok: true, effectiveDate: ctx.effectiveDate, ad2Icaos: ctx.ad2Icaos };
  }

  const outGen = join(PROJECT_ROOT, "downloads", cfg.outDirSlug, "GEN");
  const outAd2 = join(PROJECT_ROOT, "downloads", cfg.outDirSlug, "AD2");

  if (mode === "gen12") {
    const ranked = [...ctx.pdfEntries]
      .map((x) => ({ ...x, score: scoreGen(x) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    if (!ranked.length) throw new Error(`No GEN 1.2 PDF candidates found for ${cfg.country}.`);
    mkdirSync(outGen, { recursive: true });
    const outFile = join(outGen, `${ctx.effectiveDate || "unknown-date"}_GEN-1.2.pdf`);
    let lastError = "";
    for (const entry of ranked) {
      try {
        await downloadPdf(entry.url, cookie, userAgent, language, outFile, entry.sourceUrl);
        return { ok: true, file: outFile, sourceUrl: entry.url };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
    throw new Error(lastError || `All GEN candidates failed for ${cfg.country}.`);
  }

  const wantedIcao = String(icao || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(wantedIcao)) return { ok: false, error: "Provide a valid ICAO for AD2 mode." };
  const ranked = [...ctx.pdfEntries]
    .map((x) => ({ ...x, score: scoreAd2(x, wantedIcao) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) throw new Error(`No AD2 PDF candidates found for ${cfg.country}/${wantedIcao}.`);
  mkdirSync(outAd2, { recursive: true });
  const outFile = join(outAd2, `${ctx.effectiveDate || "unknown-date"}_${wantedIcao}_AD2.pdf`);
  let lastError = "";
  for (const entry of ranked) {
    try {
      await downloadPdf(entry.url, cookie, userAgent, language, outFile, entry.sourceUrl);
      return { ok: true, file: outFile, sourceUrl: entry.url, icao: wantedIcao };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(lastError || `All AD2 candidates failed for ${cfg.country}/${wantedIcao}.`);
}

export async function POST(request: NextRequest) {
  try {
    await cleanupStaleSessions();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "").trim();
    const countryKeyRaw = String(body.country || "").trim().toLowerCase();
    if (!isCountryKey(countryKeyRaw)) {
      return NextResponse.json({ ok: false, error: "country is required and must be one of: greece, germany, netherlands, slovenia" }, { status: 400 });
    }
    const countryKey = countryKeyRaw as CountryKey;
    const cfg = COUNTRIES[countryKey];

    if (action === "start") {
      await reapAllWdSessions();
      const sessionId = await createWdSession();
      await wdNavigate(sessionId, cfg.entryUrl);
      getStore().set(sessionId, { sessionId, countryKey, createdAt: Date.now(), lastUsedAt: Date.now() });
      return NextResponse.json({
        ok: true,
        country: cfg.key,
        sessionId,
        verifyUrl: cfg.entryUrl,
        popupUrl: buildNoVncUrl(request),
      });
    }

    const sessionId = String(body.sessionId || "").trim();
    if (!sessionId) return NextResponse.json({ ok: false, error: "sessionId is required" }, { status: 400 });

    if (action === "close") {
      await deleteWdSession(sessionId);
      return NextResponse.json({ ok: true });
    }

    const record = getStore().get(sessionId);
    if (!record) return NextResponse.json({ ok: false, error: "Session not found or expired" }, { status: 404 });
    if (record.countryKey !== countryKey) {
      return NextResponse.json({ ok: false, error: `Session belongs to ${record.countryKey}, not ${countryKey}` }, { status: 400 });
    }
    touchSession(sessionId);

    if (action === "status") {
      if (cfg.key === "greece") {
        await wdAdvanceGreeceCaptchaIfReady(sessionId).catch(() => "waiting");
      }
      const [url, title, challenge] = await Promise.all([wdGetCurrentUrl(sessionId), wdGetTitle(sessionId), wdChallengeStatus(sessionId)]);
      return NextResponse.json({ ok: true, country: cfg.key, sessionId, url, title, ...challenge });
    }

    if (action === "scrape") {
      const mode = String(body.mode || "collect") as Mode;
      const icao = String(body.icao || "").trim().toUpperCase();
      const [cookie, browserMeta] = await Promise.all([wdGetCookies(sessionId), wdGetBrowserMeta(sessionId)]);
      if (!cookie) {
        return NextResponse.json({
          ok: false,
          needsHumanVerification: true,
          message: "No browser session cookies yet. Solve captcha in noVNC viewer first.",
          verifyUrl: cfg.entryUrl,
        });
      }
      const result = await runBlockedScrape(cfg, sessionId, cookie, browserMeta.userAgent, browserMeta.language, mode, icao);
      return NextResponse.json(result);
    }

    return NextResponse.json({ ok: false, error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: "Blocked HITL VNC route failed", detail }, { status: 500 });
  }
}

