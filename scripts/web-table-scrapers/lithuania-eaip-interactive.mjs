#!/usr/bin/env node
/**
 * Interactive Lithuania eAIP downloader.
 *
 * Source:
 * - https://www.ans.lt/a1/aip/
 */
import { runBlockedScraper } from "./_blocked-country-scraper.mjs";

runBlockedScraper({
  country: "Lithuania",
  entryUrl: "https://www.ans.lt/a1/aip/02_16Apr2026/EY-history-en-US.html",
  blockReason: "Cloudflare anti-bot checks reject automated non-browser downloads from this runtime",
}).catch((err) => {
  console.error("[LITHUANIA] failed:", err?.message || err);
  process.exit(1);
});

