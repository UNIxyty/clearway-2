#!/usr/bin/env node
/**
 * Interactive Slovenia eAIP downloader.
 *
 * Source:
 * - https://aim.sloveniacontrol.si/aim/products/aip/
 */
import { runBlockedScraper } from "./_blocked-country-scraper.mjs";

runBlockedScraper({
  country: "Slovenia",
  entryUrl: "https://aim.sloveniacontrol.si/aim/products/aip/",
  blockReason: "TLS/transport failures prevent stable unattended download sessions from this runtime",
}).catch((err) => {
  console.error("[SLOVENIA] failed:", err?.message || err);
  process.exit(1);
});

