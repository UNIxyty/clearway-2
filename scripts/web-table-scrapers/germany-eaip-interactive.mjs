#!/usr/bin/env node
/**
 * Interactive Germany eAIP downloader.
 *
 * Source:
 * - https://aip.dfs.de/
 */
import { runBlockedScraper } from "./_blocked-country-scraper.mjs";

runBlockedScraper({
  country: "Germany",
  entryUrl: "https://aip.dfs.de/BasicIFR/2026APR20/chapter/279afdc243b210751d2f9f2401e5e4db.html",
  blockReason: "portal serves dynamic chapter pages without stable direct PDF endpoints in unauthenticated automation mode",
}).catch((err) => {
  console.error("[GERMANY] failed:", err?.message || err);
  process.exit(1);
});

