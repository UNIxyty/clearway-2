import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildNetherlandsNativePdfCandidates,
  buildNetherlandsMenuCandidates,
  NETHERLANDS_FALLBACK_AD2_ICAOS,
  parseNetherlandsCurrentPackageUrl,
  parseNetherlandsAd2Icaos,
  parseNetherlandsGen12HtmlUrl,
  parseNetherlandsMenuUrl,
  parseNetherlandsNativePdfUrl,
  parseNetherlandsPackageDate,
  resolveNetherlandsAd2HtmlUrl,
} from "../lib/netherlands-eaip-navigation.mjs";

const ENTRY_URL = "https://eaip.lvnl.nl/web/eaip/default.html";
const MENU_URL = "https://eaip.lvnl.nl/web/eaip/html/eAIP/EH-menu-en-GB.html";

test("Netherlands navigation resolves the active effective-date package from history table", () => {
  const historyHtml = `
    <table class="HISTORY">
      <tbody>
        <tr class="odd-row">
          <td style="background-color:#ADFF2F;text-transform:uppercase;">16 APR 2026</td>
          <td><a href="2026-04-16/html/eAIP/index.html">HTML</a></td>
        </tr>
        <tr><td>20 MAR 2026</td><td><a href="2026-03-20/html/eAIP/index.html">HTML</a></td></tr>
      </tbody>
    </table>
  `;

  assert.equal(
    parseNetherlandsCurrentPackageUrl(historyHtml, ENTRY_URL)?.url,
    "https://eaip.lvnl.nl/web/eaip/2026-04-16/html/eAIP/index.html",
  );
  assert.equal(parseNetherlandsCurrentPackageUrl(historyHtml, ENTRY_URL)?.effectiveDate, "2026-04-16");
});

test("Netherlands navigation resolves menu frame from entry HTML", () => {
  const html = '<frameset><frame name="menu" src="html/eAIP/EH-menu-en-GB.html"></frameset>';
  assert.equal(parseNetherlandsMenuUrl(html, ENTRY_URL), MENU_URL);
});

test("Netherlands navigation builds package-root menu candidates", () => {
  const packageUrl = "https://eaip.lvnl.nl/web/eaip/AIRAC%20AMDT%2004-2026_2026_04_16/index.html";
  const candidates = buildNetherlandsMenuCandidates("<html></html>", packageUrl);

  assert.ok(candidates.includes("https://eaip.lvnl.nl/web/eaip/AIRAC%20AMDT%2004-2026_2026_04_16/html/eAIP/EH-menu-en-GB.html"));
  assert.ok(candidates.includes("https://eaip.lvnl.nl/web/eaip/AIRAC%20AMDT%2004-2026_2026_04_16/html/eAIP/Menu-en-GB.html"));
  assert.ok(candidates.includes("https://eaip.lvnl.nl/web/eaip/AIRAC%20AMDT%2004-2026_2026_04_16/menu.html"));
});

test("Netherlands navigation parses GEN 1.2 and AD2 URLs from menu HTML", () => {
  const menu = `
    <a href="EH-GEN-1.2-en-GB.html">GEN 1.2 Entry, transit and departure of aircraft</a>
    <a href="EH-AD-2.EHAM-en-GB.html">EHAM AMSTERDAM/Schiphol</a>
    <a href="EH-AD-2.EHRD-en-GB.html">EHRD ROTTERDAM/The Hague</a>
  `;

  assert.equal(
    parseNetherlandsGen12HtmlUrl(menu, MENU_URL),
    "https://eaip.lvnl.nl/web/eaip/html/eAIP/EH-GEN-1.2-en-GB.html",
  );
  assert.deepEqual(parseNetherlandsAd2Icaos(menu), ["EHAM", "EHRD"]);
  assert.equal(
    resolveNetherlandsAd2HtmlUrl(menu, MENU_URL, "EHAM"),
    "https://eaip.lvnl.nl/web/eaip/html/eAIP/EH-AD-2.EHAM-en-GB.html",
  );
});

test("Netherlands navigation parses rendered single-page package links", () => {
  const packageUrl = "https://eaip.lvnl.nl/web/eaip/AIRAC%20AMDT%2004-2026_2026_04_16/index.html";
  const renderedNav = `
    <a href="eH-GEN%201.2-en-GB.html">GEN 1.2 Entry, transit and departure of aircraft</a>
    <a href="eH-AD%202.EHAM-en-GB.html">EHAM AMSTERDAM/Schiphol</a>
    <a href="eH-AD%202.EHRD-en-GB.html">EHRD ROTTERDAM/The Hague</a>
  `;

  assert.equal(
    parseNetherlandsGen12HtmlUrl(renderedNav, packageUrl),
    "https://eaip.lvnl.nl/web/eaip/AIRAC%20AMDT%2004-2026_2026_04_16/eH-GEN%201.2-en-GB.html",
  );
  assert.deepEqual(parseNetherlandsAd2Icaos(renderedNav), ["EHAM", "EHRD"]);
  assert.equal(
    resolveNetherlandsAd2HtmlUrl(renderedNav, packageUrl, "EHAM"),
    "https://eaip.lvnl.nl/web/eaip/AIRAC%20AMDT%2004-2026_2026_04_16/eH-AD%202.EHAM-en-GB.html",
  );
});

test("Netherlands navigation parses expanded rendered tree text", () => {
  const packageUrl = "https://eaip.lvnl.nl/web/eaip/AIRAC%20AMDT%2004-2026_2026_04_16/index.html";
  const renderedTree = `
    <span>Part 1 GENERAL (GEN)</span>
    <span>GEN 1 NATIONAL REGULATIONS AND REQUIREMENTS</span>
    <span>GEN 1.2 Entry, transit and departure of aircraft</span>
    <span>Part 3 AERODROMES (AD)</span>
    <span>AD 2 AERODROMES</span>
    <span>AD 2 EHAM AMSTERDAM/Schiphol</span>
    <span>AD 2 EHRD ROTTERDAM/The Hague</span>
  `;

  assert.equal(
    parseNetherlandsGen12HtmlUrl(renderedTree, packageUrl),
    "https://eaip.lvnl.nl/web/eaip/AIRAC%20AMDT%2004-2026_2026_04_16/eH-GEN%201.2-en-GB.html",
  );
  assert.deepEqual(parseNetherlandsAd2Icaos(renderedTree), ["EHAM", "EHRD"]);
});

test("Netherlands navigation falls back to package-relative GEN URL", () => {
  const packageUrl = "https://eaip.lvnl.nl/web/eaip/AIRAC%20AMDT%2004-2026_2026_04_16/index.html";

  assert.ok(NETHERLANDS_FALLBACK_AD2_ICAOS.includes("EHAM"));
  assert.equal(
    parseNetherlandsGen12HtmlUrl("<html></html>", packageUrl),
    "https://eaip.lvnl.nl/web/eaip/AIRAC%20AMDT%2004-2026_2026_04_16/eH-GEN%201.2-en-GB.html",
  );
});

test("Netherlands navigation parses effective date from package URL", () => {
  assert.equal(
    parseNetherlandsPackageDate("https://eaip.lvnl.nl/web/eaip/AIRAC%20AMDT%2004-2026_2026_04_16/index.html"),
    "2026-04-16",
  );
});

test("Netherlands navigation resolves native PDF button links", () => {
  const pageUrl = "https://eaip.lvnl.nl/web/eaip/AIRAC%20AMDT%2004-2026_2026_04_16/eH-AD%202.EHAM-en-GB.html";

  assert.equal(
    parseNetherlandsNativePdfUrl('<a class="pdf" href="pdf/eH-AD 2.EHAM-en-GB.pdf">PDF</a>', pageUrl),
    "https://eaip.lvnl.nl/web/eaip/AIRAC%20AMDT%2004-2026_2026_04_16/pdf/eH-AD%202.EHAM-en-GB.pdf",
  );
  assert.equal(
    parseNetherlandsNativePdfUrl(`<button onclick="window.open('pdf/eH-GEN 1.2-en-GB.pdf')">PDF</button>`, pageUrl),
    "https://eaip.lvnl.nl/web/eaip/AIRAC%20AMDT%2004-2026_2026_04_16/pdf/eH-GEN%201.2-en-GB.pdf",
  );
});

test("Netherlands navigation builds native PDF candidates from section HTML URLs", () => {
  const candidates = buildNetherlandsNativePdfCandidates(
    "https://eaip.lvnl.nl/web/eaip/AIRAC%20AMDT%2004-2026_2026_04_16/eAIP/EH-AD%202%20EHAM%201-en-GB.html#AD-2-EHAM-1",
  );

  assert.ok(candidates.includes("https://eaip.lvnl.nl/web/eaip/AIRAC%20AMDT%2004-2026_2026_04_16/pdf/EH-AD%202%20EHAM%201-en-GB.pdf"));
  assert.ok(candidates.includes("https://eaip.lvnl.nl/web/eaip/AIRAC%20AMDT%2004-2026_2026_04_16/pdf/EH-AD-2-EHAM-1-en-GB.pdf"));
});
