#!/usr/bin/env node
/**
 * Interactive Romania eAIP downloader.
 *
 * Source:
 * - https://www.aisro.ro/
 */
import { runBlockedScraper } from "./_blocked-country-scraper.mjs";

runBlockedScraper({
  country: "Romania",
  entryUrl: "https://www.aisro.ro/",
  blockReason: "publication pages are not exposed with stable direct PDF endpoints to this non-interactive runtime",
}).catch((err) => {
  console.error("[ROMANIA] failed:", err?.message || err);
  process.exit(1);
});

