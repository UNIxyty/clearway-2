import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildNetherlandsMenuCandidates,
  parseNetherlandsCurrentPackageUrl,
  parseNetherlandsAd2Icaos,
  parseNetherlandsGen12HtmlUrl,
  parseNetherlandsMenuUrl,
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
