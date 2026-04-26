#!/usr/bin/env node
/**
 * Interactive Netherlands eAIP downloader.
 *
 * Source:
 * - https://eaip.lvnl.nl/web/eaip/default.html
 */
import { runBlockedScraper } from "./_blocked-country-scraper.mjs";

runBlockedScraper({
  country: "Netherlands",
  entryUrl: "https://eaip.lvnl.nl/web/eaip/default.html",
  blockReason: "anti-bot challenge blocks scripted access to publication assets",
}).catch((err) => {
  console.error("[NETHERLANDS] failed:", err?.message || err);
  process.exit(1);
});

