import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { shouldRequireBrowserCookie } from "@/lib/blocked-hitl-cookie-policy.mjs";
import { resolveGreeceAipIndexUrl, shouldUseGreeceAipIndex } from "@/lib/greece-hitl-navigation.mjs";
import {
  buildNetherlandsNativePdfCandidates,
  buildNetherlandsMenuCandidates,
  NETHERLANDS_FALLBACK_AD2_ICAOS,
  parseNetherlandsAd2Icaos,
  parseNetherlandsCurrentPackageUrl,
  parseNetherlandsEffectiveDate,
  parseNetherlandsGen12HtmlUrl,
  parseNetherlandsNativePdfUrl,
  parseNetherlandsPackageDate,
  parseNetherlandsMenuUrl,
  resolveNetherlandsAd2HtmlUrl,
} from "@/lib/netherlands-eaip-navigation.mjs";

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
type RenderTechnique = "native" | "html" | "snapshot";
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
type NetherlandsContext = {
  effectiveDate: string | null;
  ad2Icaos: string[];
  packageEntryUrl: string;
  menuHtml: string;
  menuUrl: string;
  gen12HtmlUrl: string;
};

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
    const hasRecaptcha = Boolean(document.querySelector(".g-recaptcha, iframe[src*='recaptcha'], textarea[name='g-recaptcha-response']"));
    const challengeDetected = hasRecaptcha || hasCfIframe || t.includes('just a moment') || bodyText.includes('verify you are human') || bodyText.includes('checking your browser');
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
  return value === "submitted" || value === "waiting" ? value : "not-captcha";
}

async function wdWaitForGreeceContentAfterSubmit(sessionId: string): Promise<{ currentUrl: string; html: string }> {
  const deadline = Date.now() + 20_000;
  let lastUrl = "";
  let lastHtml = "";
  while (Date.now() < deadline) {
    lastUrl = await wdGetCurrentUrl(sessionId);
    lastHtml = await wdGetSource(sessionId);
    if (!isVerificationPage(lastHtml)) return { currentUrl: lastUrl, html: lastHtml };
    await sleep(750);
  }
  throw new Error(`Greece reCAPTCHA was submitted, but the content page did not load yet. Last URL: ${lastUrl || "unknown"}`);
}

async function wdWaitForUrlOrSourceChange(sessionId: string, previousUrl: string, previousHtml: string): Promise<{ currentUrl: string; html: string }> {
  const deadline = Date.now() + 20_000;
  let currentUrl = "";
  let html = "";
  while (Date.now() < deadline) {
    currentUrl = await wdGetCurrentUrl(sessionId);
    html = await wdGetSource(sessionId);
    if (currentUrl !== previousUrl || html !== previousHtml) return { currentUrl, html };
    await sleep(750);
  }
  return { currentUrl, html };
}

async function wdClickNetherlandsCurrentPackage(sessionId: string): Promise<{ clicked: boolean; url: string }> {
  const script = `
    const norm = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const rows = Array.from(document.querySelectorAll('table.HISTORY tbody tr, table[class*="HISTORY"] tbody tr, tr'));
    for (const row of rows) {
      const text = norm(row.textContent);
      const dateCell = Array.from(row.querySelectorAll('td')).find((cell) => {
        const style = String(cell.getAttribute('style') || '').toLowerCase();
        return /\\b\\d{1,2}\\s+[a-z]{3}\\s+20\\d{2}\\b/i.test(norm(cell.textContent)) &&
          (style.includes('#adff2f') || style.includes('greenyellow') || row.className.includes('odd-row'));
      });
      if (!dateCell) continue;
      const anchor = row.querySelector('a[href*="html/eAIP"], a[href*="eAIP"], a[href*="index"], a[href]');
      if (anchor && anchor.href) return { clicked: false, url: anchor.href };
      const target = dateCell || row;
      target.click();
      return { clicked: true, url: '' };
    }
    return { clicked: false, url: '' };
  `;
  const out = await wdCall(`/session/${encodeURIComponent(sessionId)}/execute/sync`, "POST", { script, args: [] });
  touchSession(sessionId);
  return {
    clicked: Boolean(out?.value?.clicked),
    url: String(out?.value?.url || ""),
  };
}

function escapeAttr(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function wdExpandNetherlandsNavigation(sessionId: string) {
  const script = `
    const norm = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const wanted = [
      /Part\\s*1\\s*GENERAL|GENERAL\\s*\\(GEN\\)|\\bGEN\\b/i,
      /GEN\\s*1\\s*NATIONAL|GEN\\s*1/i,
      /Part\\s*3\\s*AERODROMES|AERODROMES\\s*\\(AD\\)|\\bAD\\b/i,
      /AD\\s*2\\s*AERODROMES|AD\\s*2/i,
    ];
    const clickMatches = (win) => {
      let doc;
      try {
        doc = win.document;
      } catch {
        return 0;
      }
      let count = 0;
      for (const re of wanted) {
        const elements = Array.from(doc.querySelectorAll('a, button, span, div, li'))
          .filter((el) => re.test(norm(el.textContent)) || re.test(String(el.getAttribute('title') || '')));
        for (const el of elements.slice(0, 8)) {
          try {
            el.scrollIntoView?.({ block: 'center', inline: 'nearest' });
            el.click();
            count += 1;
          } catch {}
        }
      }
      for (const frame of Array.from(win.frames || [])) count += clickMatches(frame);
      return count;
    };
    return clickMatches(window);
  `;
  await wdCall(`/session/${encodeURIComponent(sessionId)}/execute/sync`, "POST", { script, args: [] }).catch(() => null);
  touchSession(sessionId);
  await sleep(750);
}

async function wdExtractRenderedNavigationHtml(sessionId: string): Promise<string> {
  const script = `
    const out = [];
    const seen = new Set();
    const collect = (win) => {
      let doc;
      try {
        doc = win.document;
      } catch {
        return;
      }
      const pageText = String(doc.body?.innerText || '').replace(/\\s+/g, ' ').trim();
      if (pageText) out.push({ tag: 'body', href: '', text: pageText, onclick: '', attrs: '' });
      for (const el of Array.from(doc.querySelectorAll('a, button, span, div, li'))) {
        const rawHref = String(el.getAttribute('href') || '');
        const href = rawHref && !/^javascript:/i.test(rawHref) ? String(el.href || rawHref) : rawHref;
        const text = String(el.textContent || el.getAttribute('title') || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim();
        const onclick = String(el.getAttribute('onclick') || '');
        const attrs = Array.from(el.attributes || []).map((attr) => attr.name + '=' + attr.value).join(' ');
        if (!href && !text && !onclick && !attrs) continue;
        const key = href + "\\n" + text + "\\n" + onclick + "\\n" + attrs;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ tag: el.tagName, href, text, onclick, attrs });
      }
      for (const frame of Array.from(win.frames || [])) collect(frame);
    };
    collect(window);
    return out;
  `;
  const result = await wdCall(`/session/${encodeURIComponent(sessionId)}/execute/sync`, "POST", { script, args: [] });
  touchSession(sessionId);
  const links = Array.isArray(result?.value) ? result.value : [];
  return links
    .map((link: any) => {
      const href = escapeAttr(String(link?.href || ""));
      const text = escapeHtml(`${String(link?.text || "")} ${String(link?.onclick || "")} ${String(link?.attrs || "")}`.trim());
      const tag = escapeHtml(String(link?.tag || "node").toLowerCase());
      return `<${tag} href="${href}">${text}</${tag}>`;
    })
    .join("\n");
}

async function wdClickNetherlandsNavItem(sessionId: string, terms: string[]): Promise<boolean> {
  const script = `
    const terms = arguments[0].map((value) => String(value || '').toUpperCase());
    const norm = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const matches = (el) => {
      const text = norm([
        el.textContent,
        el.getAttribute?.('title'),
        el.getAttribute?.('aria-label'),
        el.getAttribute?.('href'),
        el.getAttribute?.('onclick'),
      ].filter(Boolean).join(' ')).toUpperCase();
      return terms.every((term) => text.includes(term));
    };
    const clickIn = (win) => {
      let doc;
      try {
        doc = win.document;
      } catch {
        return false;
      }
      const selectors = ['a', 'button', '[role="treeitem"]', 'span', 'div', 'li'];
      for (const el of Array.from(doc.querySelectorAll(selectors.join(',')))) {
        if (!matches(el)) continue;
        const target = el.closest?.('a,button,[role="treeitem"],li,div') || el;
        try {
          target.scrollIntoView?.({ block: 'center', inline: 'nearest' });
          target.click();
          return true;
        } catch {}
      }
      for (const frame of Array.from(win.frames || [])) {
        if (clickIn(frame)) return true;
      }
      return false;
    };
    return clickIn(window);
  `;
  const out = await wdCall(`/session/${encodeURIComponent(sessionId)}/execute/sync`, "POST", { script, args: [terms] });
  touchSession(sessionId);
  return Boolean(out?.value);
}

function isNetherlandsErrorPage(html: string): boolean {
  return /(?:404|not\s+found|file\s+not\s+found|page\s+not\s+found)/i.test(String(html || ""));
}

function isNetherlandsAd2Content(html: string, icao: string): boolean {
  const body = String(html || "");
  const wantedIcao = String(icao || "").trim().toUpperCase();
  return (
    new RegExp(`\\b${wantedIcao}\\b`, "i").test(body) &&
    /AERODROME DATA|AD\s*2\.1|AD\s*2\s+[A-Z0-9]{4}|AMSTERDAM|SCHIPHOL/i.test(body)
  );
}

function isNetherlandsAd2Page(html: string, url: string, icao: string): boolean {
  const wantedIcao = String(icao || "").trim().toUpperCase();
  if (isNetherlandsErrorPage(html)) return false;
  if (isNetherlandsAd2Content(html, wantedIcao)) return true;
  return new RegExp(`/EH-AD\\s*2[\\s.]${wantedIcao}(?:\\s+1)?-en-GB\\.html`, "i").test(decodeURIComponent(String(url || ""))) && String(html || "").length > 500;
}

async function wdFindNetherlandsNativePdfUrl(sessionId: string): Promise<string> {
  const pageUrl = await wdGetCurrentUrl(sessionId);
  const pageHtml = await wdGetSource(sessionId);
  const parsed = parseNetherlandsNativePdfUrl(pageHtml, pageUrl);
  if (parsed) return parsed;

  const script = `
    const urls = [];
    const collect = (win) => {
      let doc;
      try {
        doc = win.document;
      } catch {
        return;
      }
      const add = (value) => {
        const raw = String(value || '').trim();
        if (!/\\.pdf(?:[?#]|$)/i.test(raw)) return;
        try {
          urls.push(new URL(raw, doc.baseURI || location.href).href);
        } catch {}
      };
      for (const el of Array.from(doc.querySelectorAll('a, button, img, input, [onclick], [data-href], [data-url]'))) {
        for (const attr of Array.from(el.attributes || [])) {
          add(attr.value);
          for (const m of String(attr.value || '').matchAll(/["']([^"']+\\.pdf(?:[?#][^"']*)?)["']/gi)) add(m[1]);
        }
      }
      for (const frame of Array.from(win.frames || [])) collect(frame);
    };
    collect(window);
    return urls[0] || '';
  `;
  const out = await wdCall(`/session/${encodeURIComponent(sessionId)}/execute/sync`, "POST", { script, args: [] });
  touchSession(sessionId);
  return String(out?.value || "").trim();
}

async function wdClickNetherlandsPdfButton(sessionId: string): Promise<string> {
  const beforeUrl = await wdGetCurrentUrl(sessionId);
  const beforeHtml = await wdGetSource(sessionId);
  const script = `
    const norm = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const matches = (el) => {
      const blob = norm([
        el.textContent,
        el.getAttribute?.('title'),
        el.getAttribute?.('aria-label'),
        el.getAttribute?.('alt'),
        el.getAttribute?.('href'),
        el.getAttribute?.('src'),
        el.getAttribute?.('onclick'),
        el.className,
        el.id,
      ].filter(Boolean).join(' '));
      return /\\.pdf(?:[?#]|$)|\\bpdf\\b|print/i.test(blob);
    };
    const clickIn = (win) => {
      let doc;
      try {
        doc = win.document;
      } catch {
        return false;
      }
      for (const el of Array.from(doc.querySelectorAll('a, button, input, img, [onclick], [role="button"]'))) {
        if (!matches(el)) continue;
        const target = el.closest?.('a,button,[role="button"]') || el;
        try {
          target.scrollIntoView?.({ block: 'center', inline: 'nearest' });
          target.click();
          return true;
        } catch {}
      }
      for (const frame of Array.from(win.frames || [])) {
        if (clickIn(frame)) return true;
      }
      return false;
    };
    return clickIn(window);
  `;
  const out = await wdCall(`/session/${encodeURIComponent(sessionId)}/execute/sync`, "POST", { script, args: [] });
  touchSession(sessionId);
  if (!out?.value) return "";
  await wdWaitForUrlOrSourceChange(sessionId, beforeUrl, beforeHtml).catch(() => null);
  const afterUrl = await wdGetCurrentUrl(sessionId);
  return /\.pdf(?:[?#]|$)/i.test(afterUrl) ? afterUrl : await wdFindNetherlandsNativePdfUrl(sessionId);
}

async function downloadNetherlandsNativePdf(sessionId: string, outFile: string): Promise<string> {
  const [{ userAgent, language }, cookie, referer] = await Promise.all([
    wdGetBrowserMeta(sessionId),
    wdGetCookies(sessionId),
    wdGetCurrentUrl(sessionId),
  ]);
  let pdfUrl = await wdFindNetherlandsNativePdfUrl(sessionId);
  if (!pdfUrl) pdfUrl = await wdClickNetherlandsPdfButton(sessionId);
  const candidates = buildNetherlandsNativePdfCandidates(referer, pdfUrl);
  const errors: string[] = [];
  for (const candidate of candidates) {
    try {
      await downloadPdf(candidate, cookie, userAgent, language, outFile, referer);
      return candidate;
    } catch (err) {
      errors.push(`${candidate}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error(`Could not download the Netherlands native PDF from the opened HTML page. Tried: ${errors.slice(0, 4).join(" | ") || "no PDF URL candidates"}`);
}

async function wdResolveNetherlandsContentFrameUrl(sessionId: string, mode: Mode, icao = ""): Promise<string> {
  const script = `
    const out = [];
    const collect = (win) => {
      let doc;
      try {
        doc = win.document;
      } catch {
        return;
      }
      out.push({
        url: String(win.location?.href || doc.URL || ''),
        title: String(doc.title || ''),
        text: String(doc.body?.innerText || '').replace(/\\s+/g, ' ').slice(0, 12000),
      });
      for (const frame of Array.from(win.frames || [])) collect(frame);
    };
    collect(window);
    return out;
  `;
  const result = await wdCall(`/session/${encodeURIComponent(sessionId)}/execute/sync`, "POST", { script, args: [] });
  touchSession(sessionId);
  type FrameInfo = { url: string; text: string; title: string };
  const frames = Array.isArray(result?.value) ? result.value : [];
  const currentUrl = await wdGetCurrentUrl(sessionId);
  const targetIcao = String(icao || "").trim().toUpperCase();
  const isShell = (url: string) => /(?:^|\/)(?:index|default|menu|history)[^/]*\.html(?:[?#]|$)/i.test(decodeURIComponent(url));
  const candidates: FrameInfo[] = frames
    .map((frame: any) => ({
      url: String(frame?.url || ""),
      text: String(frame?.text || ""),
      title: String(frame?.title || ""),
    }))
    .filter((frame: FrameInfo) => frame.url && frame.url !== currentUrl && !isShell(frame.url));

  const matched = candidates.find((frame: FrameInfo) => {
    const blob = `${decodeURIComponent(frame.url)} ${frame.title} ${frame.text}`;
    if (mode === "gen12") return /GEN\s*1\.2/i.test(blob);
    return targetIcao ? new RegExp(`\\b${targetIcao}\\b`, "i").test(blob) : false;
  });
  return matched?.url || "";
}

async function wdOpenNetherlandsAd2Page(sessionId: string, ctx: NetherlandsContext, icao: string, acceptRenderedPage = false): Promise<string> {
  const wantedIcao = String(icao || "").trim().toUpperCase();
  await wdNavigate(sessionId, ctx.packageEntryUrl);
  const beforeUrl = await wdGetCurrentUrl(sessionId);
  const beforeHtml = await wdGetSource(sessionId);
  await wdExpandNetherlandsNavigation(sessionId);
  const clicked = await wdClickNetherlandsNavItem(sessionId, ["AD 2", wantedIcao]) ||
    (acceptRenderedPage ? await wdClickNetherlandsNavItem(sessionId, [wantedIcao]) : false);
  if (clicked) {
    await wdWaitForUrlOrSourceChange(sessionId, beforeUrl, beforeHtml).catch(() => null);
    const clickedHtml = await wdGetSource(sessionId);
    const clickedUrl = await wdGetCurrentUrl(sessionId);
    if (
      !isVerificationPage(clickedHtml) &&
      !isNetherlandsErrorPage(clickedHtml) &&
      (acceptRenderedPage || isNetherlandsAd2Page(clickedHtml, clickedUrl, wantedIcao))
    ) {
      return clickedUrl;
    }
  }

  if (acceptRenderedPage) {
    throw new Error(`Could not open Netherlands AD2 page for ${wantedIcao} through the rendered navigation tree.`);
  }

  const candidates = [
    resolveNetherlandsAd2HtmlUrl(ctx.menuHtml, ctx.menuUrl, wantedIcao),
    new URL(`EH-AD%202.${wantedIcao}-en-GB.html`, ctx.packageEntryUrl).href,
    new URL(`EH-AD-2.${wantedIcao}-en-GB.html`, ctx.packageEntryUrl).href,
    new URL(`eAIP/EH-AD%202%20${wantedIcao}%201-en-GB.html#AD-2-${wantedIcao}-1`, ctx.packageEntryUrl).href,
    new URL(`html/eAIP/eH-AD%202.${wantedIcao}-en-GB.html`, ctx.packageEntryUrl).href,
    new URL(`html/eAIP/EH-AD-2.${wantedIcao}-en-GB.html`, ctx.packageEntryUrl).href,
    new URL(`eAIP/eH-AD%202.${wantedIcao}-en-GB.html`, ctx.packageEntryUrl).href,
  ];
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    await wdNavigate(sessionId, candidate);
    const html = await wdGetSource(sessionId);
    if (isVerificationPage(html)) throw new Error(`${ctx.packageEntryUrl} still requires verification in noVNC viewer.`);
    if (isNetherlandsAd2Page(html, candidate, wantedIcao)) {
      return candidate;
    }
    errors.push(`${candidate}: ${isNetherlandsErrorPage(html) ? "error page" : "not AD2 content"}`);
  }

  throw new Error(`Could not open a real Netherlands AD2 page for ${wantedIcao}. Tried: ${errors.slice(0, 6).join(" | ")}`);
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

async function wdPrintPdf(sessionId: string, outFile: string) {
  const out = await wdCall(`/session/${encodeURIComponent(sessionId)}/print`, "POST", {
    orientation: "portrait",
    scale: 0.9,
    page: { width: 21.0, height: 29.7 },
    margin: { top: 0.8, bottom: 0.8, left: 0.8, right: 0.8 },
    background: true,
    shrinkToFit: true,
  });
  touchSession(sessionId);
  const pdfBase64 = String(out?.value || "");
  if (!pdfBase64) throw new Error("Selenium did not return PDF data.");
  const bytes = Buffer.from(pdfBase64, "base64");
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Selenium print output is not a PDF.");
  writeFileSync(outFile, bytes);
}

async function wdScreenshot(sessionId: string): Promise<Buffer> {
  const out = await wdCall(`/session/${encodeURIComponent(sessionId)}/screenshot`);
  touchSession(sessionId);
  const pngBase64 = String(out?.value || "");
  if (!pngBase64) throw new Error("Selenium did not return screenshot data.");
  return Buffer.from(pngBase64, "base64");
}

async function wdSnapshotPdf(sessionId: string, outFile: string) {
  const metricsScript = `
    return {
      width: Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0, 1),
      height: Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0, 1),
      scrollHeight: Math.max(
        document.body?.scrollHeight || 0,
        document.documentElement?.scrollHeight || 0,
        document.body?.offsetHeight || 0,
        document.documentElement?.offsetHeight || 0,
        window.innerHeight || 0,
        1
      )
    };
  `;
  const metricsOut = await wdCall(`/session/${encodeURIComponent(sessionId)}/execute/sync`, "POST", { script: metricsScript, args: [] });
  touchSession(sessionId);
  const metrics = metricsOut?.value || {};
  const viewportHeight = Math.max(1, Number(metrics.height || 900));
  const scrollHeight = Math.max(viewportHeight, Number(metrics.scrollHeight || viewportHeight));
  const positions: number[] = [];
  for (let y = 0; y < scrollHeight; y += viewportHeight) positions.push(y);
  const last = Math.max(0, scrollHeight - viewportHeight);
  if (!positions.includes(last)) positions.push(last);

  const pdf = await PDFDocument.create();
  for (const y of positions) {
    await wdCall(`/session/${encodeURIComponent(sessionId)}/execute/sync`, "POST", {
      script: "window.scrollTo(0, arguments[0]); return window.scrollY;",
      args: [y],
    });
    touchSession(sessionId);
    await sleep(300);
    const pngBytes = await wdScreenshot(sessionId);
    const png = await pdf.embedPng(pngBytes);
    const page = pdf.addPage([png.width, png.height]);
    page.drawImage(png, { x: 0, y: 0, width: png.width, height: png.height });
  }
  const pdfBytes = await pdf.save();
  writeFileSync(outFile, Buffer.from(pdfBytes));
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

  let currentUrl = "";
  let html = "";
  if (captchaState === "submitted") {
    const ready = await wdWaitForGreeceContentAfterSubmit(sessionId);
    currentUrl = ready.currentUrl;
    html = ready.html;
  } else {
    currentUrl = await wdGetCurrentUrl(sessionId);
    html = await wdGetSource(sessionId);
  }
  if (isVerificationPage(html)) {
    throw new Error("Greece source still requires verification in noVNC viewer.");
  }

  const currentAipIndexUrl = resolveGreeceAipIndexUrl(currentUrl);
  if (currentAipIndexUrl) {
    if (!shouldUseGreeceAipIndex(currentUrl)) {
      await wdNavigate(sessionId, currentAipIndexUrl);
      currentUrl = await wdGetCurrentUrl(sessionId);
      html = await wdGetSource(sessionId);
    }
  } else {
    if (!/\/cd\/start\/index\.html/i.test(currentUrl)) {
      const browseUrl = await wdResolveGreeceBrowseUrl(sessionId);
      if (!browseUrl) throw new Error("Could not find Greece AIP Browse button after captcha.");
      await wdNavigate(sessionId, browseUrl);
      const ready = await wdWaitForGreeceContentAfterSubmit(sessionId);
      currentUrl = ready.currentUrl;
      html = ready.html;
    }

    const aipUrl = findHrefByText(html, currentUrl, /^AIP$/i) || new URL("../ais/index.html", currentUrl).href;
    await wdNavigate(sessionId, aipUrl);
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

  let sideHtml = "";
  let mainHtml = "";
  try {
    sideHtml = await wdFetchHtml(sessionId, sideUrl);
    mainHtml = await wdFetchHtml(sessionId, mainFrameUrl).catch(() => "");
  } finally {
    await wdNavigate(sessionId, currentUrl).catch(() => {});
  }
  return [
    `<!-- CLEARWAY_BASE_URL:${sideUrl} -->`,
    `<!-- CLEARWAY_AIP_INDEX_URL:${currentUrl} -->`,
    html,
    sideHtml,
    mainHtml,
  ].join("\n");
}

async function wdBuildNetherlandsContext(sessionId: string, cfg: CountryConfig): Promise<NetherlandsContext | { needsVerification: true }> {
  let entryUrl = await wdGetCurrentUrl(sessionId);
  let entryHtml = await wdGetSource(sessionId);

  if (!entryUrl.startsWith(new URL(cfg.entryUrl).origin) || /\/html\/eAIP\/EH-/i.test(entryUrl)) {
    await wdNavigate(sessionId, cfg.entryUrl);
    entryUrl = await wdGetCurrentUrl(sessionId);
    entryHtml = await wdGetSource(sessionId);
  }

  if (isVerificationPage(entryHtml)) return { needsVerification: true };

  let packageEntryUrl = entryUrl;
  let packageEntryHtml = entryHtml;
  const currentPackage = parseNetherlandsCurrentPackageUrl(entryHtml, entryUrl);
  if (currentPackage) {
    await wdNavigate(sessionId, currentPackage.url);
    packageEntryUrl = await wdGetCurrentUrl(sessionId);
    packageEntryHtml = await wdGetSource(sessionId);
  } else if (!/<(?:frame|iframe)\b/i.test(entryHtml) && !/EH-menu-en-GB\.html/i.test(entryHtml)) {
    const clickResult = await wdClickNetherlandsCurrentPackage(sessionId);
    if (!clickResult.clicked && clickResult.url) {
      await wdNavigate(sessionId, clickResult.url);
      packageEntryUrl = await wdGetCurrentUrl(sessionId);
      packageEntryHtml = await wdGetSource(sessionId);
    } else if (clickResult.clicked) {
      const ready = await wdWaitForUrlOrSourceChange(sessionId, entryUrl, entryHtml);
      packageEntryUrl = ready.currentUrl;
      packageEntryHtml = ready.html;
    }
  }

  if (isVerificationPage(packageEntryHtml)) return { needsVerification: true };
  if (!/<(?:frame|iframe)\b/i.test(packageEntryHtml) && !/EH-menu-en-GB\.html/i.test(packageEntryHtml)) {
    if (!/eAIP\s*-\s*THE NETHERLANDS|THE NETHERLANDS LVNL|AIRAC AMDT/i.test(packageEntryHtml)) {
      throw new Error("Could not open the Netherlands effective-date eAIP package from the history table.");
    }
  }

  let menuUrl = "";
  let menuHtml = "";
  const menuErrors: string[] = [];

  await wdExpandNetherlandsNavigation(sessionId);
  const renderedNavigationHtml = await wdExtractRenderedNavigationHtml(sessionId);
  const renderedIcaos = parseNetherlandsAd2Icaos(renderedNavigationHtml);
  if (renderedIcaos.length || /E[Hh]-GEN(?:[-_%20\s])*1\.2|GEN[^<]{0,20}1\.2|Part\s+3\s+AERODROMES|AD\s+2\s+AERODROMES/i.test(renderedNavigationHtml)) {
    menuUrl = packageEntryUrl;
    menuHtml = renderedNavigationHtml;
  }

  if (!menuHtml) {
    for (const candidate of buildNetherlandsMenuCandidates(packageEntryHtml, packageEntryUrl)) {
      try {
        const html = await wdFetchHtml(sessionId, candidate);
        if (isVerificationPage(html)) return { needsVerification: true };
        const icaos = parseNetherlandsAd2Icaos(html);
        if (icaos.length || /E[Hh]-GEN(?:[-_%20\s])*1\.2|GEN[^<]{0,20}1\.2|Part\s+3\s+AERODROMES|AD\s+2\s+AERODROMES/i.test(html)) {
          menuUrl = candidate;
          menuHtml = html;
          break;
        }
        menuErrors.push(`${candidate}: no GEN/AD links`);
      } catch (err) {
        menuErrors.push(`${candidate}: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        await wdNavigate(sessionId, packageEntryUrl).catch(() => {});
      }
    }
  }
  if (!menuHtml || !menuUrl) {
    throw new Error(`No Netherlands eAIP menu page with GEN/AD links found. Tried: ${menuErrors.slice(0, 5).join(" | ")}`);
  }

  const ad2Icaos = parseNetherlandsAd2Icaos(menuHtml);
  if (!ad2Icaos.length) {
    ad2Icaos.push(...NETHERLANDS_FALLBACK_AD2_ICAOS);
  }
  if (!ad2Icaos.length) throw new Error("No AD2 ICAOs found in Netherlands unlocked menu.");

  return {
    effectiveDate: currentPackage?.effectiveDate || parseNetherlandsPackageDate(packageEntryUrl) || parseNetherlandsEffectiveDate(`${entryHtml}\n${packageEntryHtml}\n${menuHtml}`),
    ad2Icaos,
    packageEntryUrl,
    menuHtml,
    menuUrl,
    gen12HtmlUrl: parseNetherlandsGen12HtmlUrl(menuHtml, menuUrl),
  };
}

async function finishNetherlandsPagePdf(sessionId: string, outFile: string, technique: RenderTechnique, mode: Mode, icao = ""): Promise<string> {
  if (technique === "html") {
    const contentUrl = await wdResolveNetherlandsContentFrameUrl(sessionId, mode, icao);
    if (contentUrl) await wdNavigate(sessionId, contentUrl);
    await wdPrintPdf(sessionId, outFile);
    return await wdGetCurrentUrl(sessionId);
  }
  if (technique === "snapshot") {
    const contentUrl = await wdResolveNetherlandsContentFrameUrl(sessionId, mode, icao);
    if (contentUrl) await wdNavigate(sessionId, contentUrl);
    await wdSnapshotPdf(sessionId, outFile);
    return await wdGetCurrentUrl(sessionId);
  }
  return await downloadNetherlandsNativePdf(sessionId, outFile);
}

async function runNetherlandsSeleniumFlow(cfg: CountryConfig, sessionId: string, mode: Mode, icao: string, technique: RenderTechnique = "native") {
  const ctx = await wdBuildNetherlandsContext(sessionId, cfg);
  if ("needsVerification" in ctx) {
    return {
      ok: false,
      needsHumanVerification: true,
      message: `${cfg.country} source still requires verification in noVNC viewer.`,
      verifyUrl: cfg.entryUrl,
    };
  }

  if (mode === "collect") {
    return { ok: true, effectiveDate: ctx.effectiveDate, ad2Icaos: ctx.ad2Icaos };
  }

  const dateTag = ctx.effectiveDate || "unknown-date";
  if (mode === "gen12") {
    const outGen = join(PROJECT_ROOT, "downloads", cfg.outDirSlug, "GEN");
    mkdirSync(outGen, { recursive: true });
    const outFile = join(outGen, `${dateTag}_GEN-1.2.pdf`);
    await wdNavigate(sessionId, ctx.gen12HtmlUrl);
    const html = await wdGetSource(sessionId);
    if (isVerificationPage(html)) {
      return { ok: false, needsHumanVerification: true, message: `${cfg.country} GEN page still requires verification in noVNC viewer.`, verifyUrl: cfg.entryUrl };
    }
    if (isNetherlandsErrorPage(html)) {
      throw new Error(`Netherlands GEN 1.2 page returned an error: ${ctx.gen12HtmlUrl}`);
    }
    const pdfUrl = await finishNetherlandsPagePdf(sessionId, outFile, technique, mode);
    await wdNavigate(sessionId, ctx.packageEntryUrl).catch(() => {});
    return { ok: true, file: outFile, sourceUrl: pdfUrl };
  }

  const wantedIcao = String(icao || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(wantedIcao)) return { ok: false, error: "Provide a valid ICAO for AD2 mode." };
  if (!ctx.ad2Icaos.includes(wantedIcao)) throw new Error(`AD2 ICAO not found for Netherlands: ${wantedIcao}`);

  const outAd2 = join(PROJECT_ROOT, "downloads", cfg.outDirSlug, "AD2");
  mkdirSync(outAd2, { recursive: true });
  const outFile = join(outAd2, `${dateTag}_${wantedIcao}_AD2.pdf`);
  const ad2Url = await wdOpenNetherlandsAd2Page(sessionId, ctx, wantedIcao, technique === "html" || technique === "snapshot");
  const html = await wdGetSource(sessionId);
  if (isVerificationPage(html)) {
    return { ok: false, needsHumanVerification: true, message: `${cfg.country} AD2 page still requires verification in noVNC viewer.`, verifyUrl: cfg.entryUrl };
  }
  if (isNetherlandsErrorPage(html)) {
    throw new Error(`Netherlands AD2 page returned an error for ${wantedIcao}: ${ad2Url}`);
  }
  const pdfUrl = await finishNetherlandsPagePdf(sessionId, outFile, technique, mode, wantedIcao);
  await wdNavigate(sessionId, ctx.packageEntryUrl).catch(() => {});
  return { ok: true, file: outFile, sourceUrl: pdfUrl, icao: wantedIcao };
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
  technique: RenderTechnique = "native",
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

  if (cfg.key === "netherlands") {
    return await runNetherlandsSeleniumFlow(cfg, sessionId, mode, icao, technique);
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
      const techniqueRaw = String(body.technique || "native").trim().toLowerCase();
      const technique: RenderTechnique = techniqueRaw === "html" || techniqueRaw === "snapshot" ? techniqueRaw : "native";
      const icao = String(body.icao || "").trim().toUpperCase();
      const [cookie, browserMeta] = await Promise.all([wdGetCookies(sessionId), wdGetBrowserMeta(sessionId)]);
      if (!cookie && shouldRequireBrowserCookie(cfg.key)) {
        return NextResponse.json({
          ok: false,
          needsHumanVerification: true,
          message: "No browser session cookies yet. Solve captcha in noVNC viewer first.",
          verifyUrl: cfg.entryUrl,
        });
      }
      const result = await runBlockedScrape(cfg, sessionId, cookie, browserMeta.userAgent, browserMeta.language, mode, icao, technique);
      return NextResponse.json(result);
    }

    return NextResponse.json({ ok: false, error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: "Blocked HITL VNC route failed", detail }, { status: 500 });
  }
}

