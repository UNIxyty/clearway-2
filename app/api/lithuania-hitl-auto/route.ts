import { NextRequest, NextResponse } from "next/server";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanupStaleSessions, closeSession, createSession, getSession, getChallengeInfo, makeSnapshot } from "@/lib/lithuania-hitl-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENTRY_URL = "https://www.ans.lt/a1/aip/02_16Apr2026/EY-history-en-US.html";
const PROJECT_ROOT = process.cwd();
const OUT_GEN = join(PROJECT_ROOT, "downloads", "lithuania-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "lithuania-eaip", "AD2");
const UA = "Mozilla/5.0 (compatible; clearway-lithuania-hitl-auto/1.0)";

type Mode = "collect" | "gen12" | "ad2";

type Ad2Entry = {
  icao: string;
  label: string;
  htmlUrl: string;
};

function isVerificationPage(html: string): boolean {
  const body = String(html || "").toLowerCase();
  return (
    body.includes("just a moment") ||
    body.includes("cf-challenge") ||
    body.includes("cf-browser-verification") ||
    body.includes("captcha")
  );
}

async function sessionFetchText(session: any, url: string, referer = ""): Promise<string> {
  const headers: HeadersInit = { "User-Agent": UA };
  if (referer) headers.Referer = referer;
  const res = await session.context.request.get(url, { headers, timeout: 90_000 });
  if (!res.ok()) throw new Error(`${res.status()} ${res.statusText()}`);
  return await res.text();
}

async function sessionDownloadPdf(session: any, url: string, outFile: string, referer = "") {
  const headers: HeadersInit = { "User-Agent": UA };
  if (referer) headers.Referer = referer;
  const res = await session.context.request.get(url, { headers, timeout: 120_000 });
  if (!res.ok()) throw new Error(`${res.status()} ${res.statusText()}`);
  const bytes = Buffer.from(await res.body());
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
    const months: Record<string, string> = {
      jan: "01",
      feb: "02",
      mar: "03",
      apr: "04",
      may: "05",
      jun: "06",
      jul: "07",
      aug: "08",
      sep: "09",
      oct: "10",
      nov: "11",
      dec: "12",
    };
    const mm = months[stampMatch[3].toLowerCase()];
    if (mm) effectiveDate = `${stampMatch[4]}-${mm}-${stampMatch[2]}`;
  }
  return { indexUrl, effectiveDate };
}

function parseTocUrl(indexHtml: string, indexUrl: string): string {
  const src = String(indexHtml || "").match(/<frame[^>]*name=['"]eAISNavigationBase['"][^>]*src=['"]([^'"]+)['"]/i)?.[1] || "";
  if (!src) throw new Error("Could not resolve Lithuania TOC URL.");
  return new URL(src, indexUrl).href;
}

function parseMenuUrl(tocHtml: string, tocUrl: string): string {
  const src = String(tocHtml || "").match(/<frame[^>]*name=['"]eAISNavigation['"][^>]*src=['"]([^'"]+)['"]/i)?.[1] || "";
  if (!src) throw new Error("Could not resolve Lithuania menu URL.");
  return new URL(src, tocUrl).href;
}

function parseAd2Entries(menuHtml: string, menuUrl: string): Ad2Entry[] {
  const byIcao = new Map<string, Ad2Entry>();
  for (const m of String(menuHtml || "").matchAll(/href=['"]([^'"]*EY-AD-2\.([A-Z0-9]{4})-[^'"]*\.html#[^'"]*)['"]/gi)) {
    const icao = m[2].toUpperCase();
    if (byIcao.has(icao)) continue;
    byIcao.set(icao, {
      icao,
      label: icao,
      htmlUrl: new URL(m[1], menuUrl).href,
    });
  }
  return [...byIcao.values()].sort((a, b) => a.icao.localeCompare(b.icao));
}

function parsePdfLinks(pageHtml: string, pageUrl: string): string[] {
  return [...String(pageHtml || "").matchAll(/href=['"]([^'"]+\.pdf[^'"]*)['"]/gi)].map((m) => new URL(m[1], pageUrl).href);
}

async function resolveContext(session: any) {
  const entryHtml = await sessionFetchText(session, ENTRY_URL);
  if (isVerificationPage(entryHtml)) return { needsVerification: true as const };

  const { indexUrl, effectiveDate } = parseIssueIndexUrl(entryHtml, ENTRY_URL);
  const indexHtml = await sessionFetchText(session, indexUrl, ENTRY_URL);
  if (isVerificationPage(indexHtml)) return { needsVerification: true as const };

  const tocUrl = parseTocUrl(indexHtml, indexUrl);
  const tocHtml = await sessionFetchText(session, tocUrl, indexUrl);
  if (isVerificationPage(tocHtml)) return { needsVerification: true as const };

  const menuUrl = parseMenuUrl(tocHtml, tocUrl);
  const menuHtml = await sessionFetchText(session, menuUrl, tocUrl);
  if (isVerificationPage(menuHtml)) return { needsVerification: true as const };

  const ad2Entries = parseAd2Entries(menuHtml, menuUrl);
  const genHtmlUrl = new URL("eAIP/EY-GEN-1.2-en-US.html", new URL("html/", new URL("../", indexUrl))).href;
  return {
    needsVerification: false as const,
    effectiveDate,
    genHtmlUrl,
    ad2Entries,
  };
}

async function runLithuaniaScrape(session: any, mode: Mode, icao: string) {
  const ctx = await resolveContext(session);
  if (ctx.needsVerification) {
    return {
      ok: false,
      needsHumanVerification: true,
      message: "Lithuania source still requires verification in the popup session.",
      verifyUrl: ENTRY_URL,
    };
  }

  if (mode === "collect") {
    return {
      ok: true,
      effectiveDate: ctx.effectiveDate,
      ad2Icaos: ctx.ad2Entries.map((x) => x.icao),
    };
  }

  if (mode === "gen12") {
    const genHtml = await sessionFetchText(session, ctx.genHtmlUrl, ENTRY_URL);
    if (isVerificationPage(genHtml)) {
      return {
        ok: false,
        needsHumanVerification: true,
        message: "Verification expired during GEN fetch. Re-verify and retry.",
        verifyUrl: ENTRY_URL,
      };
    }
    const candidates = parsePdfLinks(genHtml, ctx.genHtmlUrl);
    if (!candidates.length) throw new Error("No GEN 1.2 PDF links found on Lithuania GEN page.");
    mkdirSync(OUT_GEN, { recursive: true });
    const outFile = join(OUT_GEN, `${ctx.effectiveDate || "unknown-date"}_GEN-1.2.pdf`);
    let lastError = "";
    for (const url of candidates) {
      try {
        await sessionDownloadPdf(session, url, outFile, ctx.genHtmlUrl);
        return { ok: true, file: outFile, sourceUrl: url };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
    throw new Error(lastError || "All GEN 1.2 candidates failed.");
  }

  const wantedIcao = String(icao || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(wantedIcao)) {
    return { ok: false, error: "Provide a valid ICAO for AD2 mode." };
  }
  const row = ctx.ad2Entries.find((x) => x.icao === wantedIcao);
  if (!row) return { ok: false, error: `ICAO not found in Lithuania AD2 menu: ${wantedIcao}` };

  const adHtml = await sessionFetchText(session, row.htmlUrl, ENTRY_URL);
  if (isVerificationPage(adHtml)) {
    return {
      ok: false,
      needsHumanVerification: true,
      message: "Verification expired during AD2 fetch. Re-verify and retry.",
      verifyUrl: ENTRY_URL,
    };
  }
  const candidates = parsePdfLinks(adHtml, row.htmlUrl);
  if (!candidates.length) throw new Error(`No AD2 PDF links found for ${row.icao}.`);
  mkdirSync(OUT_AD2, { recursive: true });
  const outFile = join(OUT_AD2, `${ctx.effectiveDate || "unknown-date"}_${row.icao}_AD2.pdf`);
  let lastError = "";
  for (const url of candidates) {
    try {
      await sessionDownloadPdf(session, url, outFile, row.htmlUrl);
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
      const session = await createSession();
      return NextResponse.json({
        ok: true,
        sessionId: session.id,
        verifyUrl: ENTRY_URL,
        popupPath: `/lithuania-hitl-auto-test/popup?sessionId=${encodeURIComponent(session.id)}`,
      });
    }

    const sessionId = String(body.sessionId || "").trim();
    if (!sessionId) return NextResponse.json({ ok: false, error: "sessionId is required" }, { status: 400 });
    const session = getSession(sessionId);
    if (!session) return NextResponse.json({ ok: false, error: "Session not found or expired" }, { status: 404 });

    if (action === "snapshot") {
      const snap = await makeSnapshot(session);
      return NextResponse.json({ ok: true, ...snap });
    }

    if (action === "click") {
      const x = Number(body.x);
      const y = Number(body.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return NextResponse.json({ ok: false, error: "x and y are required numeric values" }, { status: 400 });
      }
      await session.page.mouse.click(x, y);
      const snap = await makeSnapshot(session);
      return NextResponse.json({ ok: true, ...snap });
    }

    if (action === "type") {
      const text = String(body.text || "");
      if (!text) return NextResponse.json({ ok: false, error: "text is required" }, { status: 400 });
      await session.page.keyboard.type(text, { delay: 15 });
      const snap = await makeSnapshot(session);
      return NextResponse.json({ ok: true, ...snap });
    }

    if (action === "press") {
      const key = String(body.key || "");
      if (!key) return NextResponse.json({ ok: false, error: "key is required" }, { status: 400 });
      await session.page.keyboard.press(key);
      const snap = await makeSnapshot(session);
      return NextResponse.json({ ok: true, ...snap });
    }

    if (action === "status") {
      const info = await getChallengeInfo(session.page);
      return NextResponse.json({ ok: true, ...info });
    }

    if (action === "scrape") {
      const mode = String(body.mode || "collect") as Mode;
      const icao = String(body.icao || "").trim().toUpperCase();
      const result = await runLithuaniaScrape(session, mode, icao);
      return NextResponse.json(result);
    }

    if (action === "close") {
      await closeSession(sessionId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: "Lithuania HITL auto route failed", detail }, { status: 500 });
  }
}

