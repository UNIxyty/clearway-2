export const NETHERLANDS_ENTRY_URL = "https://eaip.lvnl.nl/web/eaip/default.html";
export const NETHERLANDS_MENU_URL = "https://eaip.lvnl.nl/web/eaip/html/eAIP/EH-menu-en-GB.html";
export const NETHERLANDS_GEN12_HTML_URL = "https://eaip.lvnl.nl/web/eaip/html/eAIP/EH-GEN-1.2-en-GB.html";

function normalizeText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDateTag(value) {
  const m = String(value || "").match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d{2})\b/);
  if (!m) return null;
  const mm = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  }[String(m[2]).slice(0, 3).toLowerCase()];
  return mm ? `${m[3]}-${mm}-${String(m[1]).padStart(2, "0")}` : null;
}

export function parseNetherlandsCurrentPackageUrl(historyHtml, entryUrl = NETHERLANDS_ENTRY_URL) {
  for (const rowMatch of String(historyHtml || "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = rowMatch[0];
    const isCurrent =
      /background-color\s*:\s*(?:#ADFF2F|greenyellow)/i.test(rowHtml) ||
      /current|effective|active/i.test(rowHtml);
    if (!isCurrent) continue;

    const href =
      rowHtml.match(/href=["']([^"']*(?:html\/eAIP|eAIP|default|index)[^"']*\.html[^"']*)["']/i)?.[1] ||
      rowHtml.match(/onclick=["'][^"']*(?:location(?:\.href)?|window\.open)\s*\(?\s*['"]([^'"]+)['"]/i)?.[1];
    if (!href) continue;

    return {
      url: new URL(href, entryUrl).href,
      effectiveDate: parseDateTag(normalizeText(rowHtml)),
    };
  }
  return null;
}

export function parseNetherlandsMenuUrl(entryHtml, entryUrl = NETHERLANDS_ENTRY_URL) {
  const src =
    String(entryHtml || "").match(/<(?:frame|iframe)\b[^>]*\bsrc=["']([^"']*menu[^"']*)["']/i)?.[1] ||
    String(entryHtml || "").match(/href=["']([^"']*EH-menu[^"']*\.html[^"']*)["']/i)?.[1];
  if (!src) return NETHERLANDS_MENU_URL;
  return new URL(src, entryUrl).href;
}

export function buildNetherlandsMenuCandidates(entryHtml, entryUrl = NETHERLANDS_ENTRY_URL) {
  const out = new Set();
  const add = (value, base = entryUrl) => {
    const raw = String(value || "").trim();
    if (!raw) return;
    try {
      out.add(new URL(raw, base).href);
    } catch {}
  };

  for (const m of String(entryHtml || "").matchAll(/<(?:frame|iframe)\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
    add(m[1]);
  }
  for (const m of String(entryHtml || "").matchAll(/href=["']([^"']*(?:menu|Menu|frameset|index|eAIP)[^"']*\.html[^"']*)["']/gi)) {
    add(m[1]);
  }

  add(parseNetherlandsMenuUrl(entryHtml, entryUrl));
  add("html/eAIP/EH-menu-en-GB.html");
  add("html/eAIP/Menu-en-GB.html");
  add("html/eAIP/menu.html");
  add("html/eAIP/index.html");
  add("html/EH-menu-en-GB.html");
  add("html/menu.html");
  add("EH-menu-en-GB.html");
  add("menu.html");
  return [...out];
}

export function parseNetherlandsGen12HtmlUrl(menuHtml, menuUrl = NETHERLANDS_MENU_URL) {
  const href =
    String(menuHtml || "").match(/href=["']([^"']*EH-GEN-1\.2[^"']*\.html[^"']*)["']/i)?.[1] ||
    String(menuHtml || "").match(/href=["']([^"']*GEN(?:[-_%20\s])*1\.2[^"']*\.html[^"']*)["']/i)?.[1];
  if (!href && /GEN\s*1\.2/i.test(String(menuHtml || "")) && /AIRAC%20AMDT|AIRAC AMDT/i.test(menuUrl)) {
    return new URL("eH-GEN%201.2-en-GB.html", menuUrl).href;
  }
  if (!href) return NETHERLANDS_GEN12_HTML_URL;
  return new URL(href, menuUrl).href;
}

export function parseNetherlandsAd2Icaos(menuHtml) {
  const out = new Set();
  for (const m of String(menuHtml || "").matchAll(/E[Hh][-_ ]AD(?:[-_%20\s])*2\.(EH[A-Z0-9]{2})-en-GB\.html/gi)) {
    out.add(String(m[1]).toUpperCase());
  }
  for (const m of String(menuHtml || "").matchAll(/\bAD\s*2(?:\.|\s+)(EH[A-Z0-9]{2})\b/gi)) {
    out.add(String(m[1]).toUpperCase());
  }
  return [...out].sort();
}

export function resolveNetherlandsAd2HtmlUrl(menuHtml, menuUrl = NETHERLANDS_MENU_URL, icao) {
  const wanted = String(icao || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(wanted)) return "";
  const linkRe = /<a\b[^>]*\bhref=["']([^"']*E[Hh][-_ ]AD(?:[-_%20\s])*2\.(EH[A-Z0-9]{2})-en-GB\.html[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of String(menuHtml || "").matchAll(linkRe)) {
    const linkIcao = String(m[2] || "").toUpperCase();
    if (linkIcao === wanted || normalizeText(m[3]).toUpperCase().includes(wanted)) {
      return new URL(String(m[1]), menuUrl).href;
    }
  }
  return new URL(`eH-AD%202.${wanted}-en-GB.html`, menuUrl).href;
}

export function parseNetherlandsEffectiveDate(entryHtml) {
  const src = normalizeText(entryHtml);
  return parseDateTag(src.match(/\bAIRAC[^0-9]*(\d{1,2}\s+[A-Za-z]{3,9}\s+20\d{2})\b/i)?.[1] || src);
}
