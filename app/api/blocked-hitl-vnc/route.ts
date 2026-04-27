import { NextRequest, NextResponse } from "next/server";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROJECT_ROOT = process.cwd();
const DEFAULT_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
const DEFAULT_LANG = "en-US,en;q=0.9";
const SESSION_TTL_MS = 30 * 60 * 1000;
const WD_TIMEOUT_MS = 60_000;
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

