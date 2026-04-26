#!/usr/bin/env node
/**
 * Interactive Greece eAIP downloader.
 *
 * Source:
 * - https://aisgr.hasp.gov.gr/main.php
 */
import { runBlockedScraper } from "./_blocked-country-scraper.mjs";

runBlockedScraper({
  country: "Greece",
  entryUrl: "https://aisgr.hasp.gov.gr/main.php?rand=0.7276487307378027#publications",
  blockReason: "captcha-protected publication flow blocks unattended fetch/download requests",
}).catch((err) => {
  console.error("[GREECE] failed:", err?.message || err);
  process.exit(1);
});

