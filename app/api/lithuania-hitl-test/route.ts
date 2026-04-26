import { NextRequest, NextResponse } from "next/server";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ENTRY_URL = "https://www.ans.lt/a1/aip/02_16Apr2026/EY-history-en-US.html";
const PROJECT_ROOT = process.cwd();
const OUT_GEN = join(PROJECT_ROOT, "downloads", "lithuania-eaip", "GEN");
const OUT_AD2 = join(PROJECT_ROOT, "downloads", "lithuania-eaip", "AD2");
const UA = "Mozilla/5.0 (compatible; clearway-lithuania-hitl-test/1.0)";

type Mode = "collect" | "gen12" | "ad2";

type Ad2Entry = {
  icao: string;
  label: string;
  htmlUrl: string;
};

function buildHeaders(cookie: string) {
  const headers: HeadersInit = { "User-Agent": UA };
  const clean = String(cookie || "").trim();
  if (clean) headers.Cookie = clean;
  return headers;
}

function isVerificationPage(html: string): boolean {
  const body = String(html || "").toLowerCase();
  return (
    body.includes("just a moment") ||
    body.includes("cf-challenge") ||
    body.includes("cf-browser-verification") ||
    body.includes("captcha")
  );
}

async function fetchText(url: string, cookie: string, referer = ""): Promise<string> {
  const headers = buildHeaders(cookie);
  if (referer) headers.Referer = referer;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return await res.text();
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

async function downloadPdf(url: string, cookie: string, outFile: string, referer = "") {
  const headers = buildHeaders(cookie);
  if (referer) headers.Referer = referer;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Downloaded payload is not a PDF");
  writeFileSync(outFile, bytes);
}

async function resolveContext(cookie: string) {
  const entryHtml = await fetchText(ENTRY_URL, cookie);
  if (isVerificationPage(entryHtml)) {
    return { needsVerification: true as const };
  }
  const { indexUrl, effectiveDate } = parseIssueIndexUrl(entryHtml, ENTRY_URL);
  const indexHtml = await fetchText(indexUrl, cookie, ENTRY_URL);
  if (isVerificationPage(indexHtml)) return { needsVerification: true as const };
  const tocUrl = parseTocUrl(indexHtml, indexUrl);
  const tocHtml = await fetchText(tocUrl, cookie, indexUrl);
  if (isVerificationPage(tocHtml)) return { needsVerification: true as const };
  const menuUrl = parseMenuUrl(tocHtml, tocUrl);
  const menuHtml = await fetchText(menuUrl, cookie, tocUrl);
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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { cookie?: string; mode?: Mode; icao?: string };
    const cookie = String(body.cookie || "").trim();
    const mode: Mode = body.mode === "gen12" || body.mode === "ad2" ? body.mode : "collect";
    const wantedIcao = String(body.icao || "").trim().toUpperCase();

    const ctx = await resolveContext(cookie);
    if (ctx.needsVerification) {
      return NextResponse.json({
        ok: false,
        needsHumanVerification: true,
        message: "Lithuania source requires Cloudflare/captcha verification before scraping.",
        verifyUrl: ENTRY_URL,
      });
    }

    if (mode === "collect") {
      return NextResponse.json({
        ok: true,
        effectiveDate: ctx.effectiveDate,
        ad2Icaos: ctx.ad2Entries.map((x) => x.icao),
      });
    }

    if (mode === "gen12") {
      const pageHtml = await fetchText(ctx.genHtmlUrl, cookie, ENTRY_URL);
      if (isVerificationPage(pageHtml)) {
        return NextResponse.json({
          ok: false,
          needsHumanVerification: true,
          message: "Verification expired during GEN fetch. Re-run captcha and retry.",
          verifyUrl: ENTRY_URL,
        });
      }
      const candidates = parsePdfLinks(pageHtml, ctx.genHtmlUrl);
      if (!candidates.length) throw new Error("No GEN 1.2 PDF links found on Lithuania GEN page.");
      const outName = `${ctx.effectiveDate || "unknown-date"}_GEN-1.2.pdf`;
      const outFile = join(OUT_GEN, outName);
      mkdirSync(OUT_GEN, { recursive: true });
      let lastError = "";
      for (const url of candidates) {
        try {
          await downloadPdf(url, cookie, outFile, ctx.genHtmlUrl);
          return NextResponse.json({ ok: true, file: outFile, sourceUrl: url });
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
        }
      }
      throw new Error(lastError || "All GEN 1.2 PDF candidates failed.");
    }

    if (!/^[A-Z0-9]{4}$/.test(wantedIcao)) {
      return NextResponse.json({ ok: false, error: "Provide a valid ICAO for AD2 mode." }, { status: 400 });
    }
    const row = ctx.ad2Entries.find((x) => x.icao === wantedIcao);
    if (!row) {
      return NextResponse.json({ ok: false, error: `ICAO not found in Lithuania AD2 menu: ${wantedIcao}` }, { status: 404 });
    }
    const adHtml = await fetchText(row.htmlUrl, cookie, ENTRY_URL);
    if (isVerificationPage(adHtml)) {
      return NextResponse.json({
        ok: false,
        needsHumanVerification: true,
        message: "Verification expired during AD2 fetch. Re-run captcha and retry.",
        verifyUrl: ENTRY_URL,
      });
    }
    const candidates = parsePdfLinks(adHtml, row.htmlUrl);
    if (!candidates.length) throw new Error(`No AD2 PDF links found for ${row.icao}.`);
    const outName = `${ctx.effectiveDate || "unknown-date"}_${row.icao}_AD2.pdf`;
    const outFile = join(OUT_AD2, outName);
    mkdirSync(OUT_AD2, { recursive: true });
    let lastError = "";
    for (const url of candidates) {
      try {
        await downloadPdf(url, cookie, outFile, row.htmlUrl);
        return NextResponse.json({ ok: true, file: outFile, sourceUrl: url, icao: row.icao });
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
    throw new Error(lastError || `All AD2 PDF candidates failed for ${row.icao}.`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: "Lithuania HITL test failed", detail }, { status: 500 });
  }
}

