#!/usr/bin/env node
/**
 * CrewBriefing OPMET/NOTAM scraper.
 *
 * Env:
 *  - CREWBRIEFING_USERNAME (required)
 *  - CREWBRIEFING_PASSWORD (required)
 *
 * Usage:
 *  - node scripts/crewbriefing-opmet-notams.mjs EVRA
 *  - node scripts/crewbriefing-opmet-notams.mjs EVRA --mode notam
 *  - node scripts/crewbriefing-opmet-notams.mjs EVRA --mode weather
 *  - node scripts/crewbriefing-opmet-notams.mjs EVRA --mode both --json
 */

import { appendFileSync } from "fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { pathToFileURL } from "node:url";
import { loadEnvFromProjectRoot } from "./tools/_load-env.mjs";
import { saveFile } from "../lib/storage.mjs";

const LOGIN_URL = "https://www.crewbriefing.com/loginssl.aspx";
export const CREWBRIEFING_SEARCH_INPUT_SELECTOR = 'input[type="text"]:visible, textarea:visible';

let globalJsonMode = false;

function progress(message, mode = "both") {
  const line = `PROGRESS:${message}\n`;
  const useNotamFile = mode === "both" || mode === "notam";
  const useWeatherFile = mode === "both" || mode === "weather";
  if (useNotamFile && process.env.NOTAM_PROGRESS_FILE) {
    try {
      appendFileSync(process.env.NOTAM_PROGRESS_FILE, line);
    } catch {}
  }
  if (useWeatherFile && process.env.WEATHER_PROGRESS_FILE) {
    try {
      appendFileSync(process.env.WEATHER_PROGRESS_FILE, line);
    } catch {}
  }
  if (globalJsonMode) console.error(line.trim());
}

function normalizeLines(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function firstIndexAfter(text, candidates, startIndex = 0) {
  let best = -1;
  for (const candidate of candidates) {
    const index =
      candidate instanceof RegExp
        ? text.slice(startIndex).search(candidate)
        : text.indexOf(candidate, startIndex);
    if (index === -1) continue;
    const absoluteIndex = candidate instanceof RegExp ? startIndex + index : index;
    if (best === -1 || absoluteIndex < best) best = absoluteIndex;
  }
  return best;
}

export function extractCrewBriefingNotams(rawText) {
  const text = normalizeLines(rawText);
  const start = text.search(/\|#\d+\|[-]+/);
  if (start === -1) return "";

  const end = firstIndexAfter(
    text,
    [
      "\nNOTAMs excluded in accordance with FSP CLEARWAY company policy",
      "\nUS Military NOTAMs excluded.",
      "\nEnd of NOTAM Search",
    ],
    start
  );

  return normalizeLines(text.slice(start, end === -1 ? undefined : end));
}

export function extractCrewBriefingWeather(rawText) {
  const text = normalizeLines(rawText);
  const start = text.search(/(^|\n)(Airport\s+[A-Z0-9]{4}\b|METAR\s+|SPECI\s+|TAF\s+)/);
  if (start === -1) return "";

  const end = firstIndexAfter(text, ["\nEnd of WX Search"], start);
  return normalizeLines(text.slice(start, end === -1 ? undefined : end));
}

export function normalizeCrewBriefingMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "1" || mode === "n" || mode === "notam" || mode === "notams") return "notam";
  if (mode === "2" || mode === "w" || mode === "wx" || mode === "weather") return "weather";
  if (mode === "3" || mode === "b" || mode === "both" || mode === "all") return "both";
  throw new Error("Invalid mode. Use notam, weather, or both.");
}

export function isCrewBriefingSessionInvalidUrl(url) {
  return /SessionInvalid_ErrorPage\.aspx/i.test(String(url || ""));
}

function formatCrewBriefingNotamItem(item, icao) {
  const text = normalizeLines(item);
  const number = text.match(/^([A-Z]\d+\/\d{2})\b/m)?.[1] || "";
  const klass = text.match(/\bNOTAM([A-Z])\b/m)?.[1] || "N";
  const location = text.match(/\bA\)\s*([A-Z0-9]{4})\b/m)?.[1] || icao;
  const startDateUtc = text.match(/\bB\)\s*([0-9]{10,12}[A-Z]*)\b/m)?.[1] || "";
  const endDateUtc = text.match(/\bC\)\s*([0-9]{10,12}[A-Z]*)\b/m)?.[1] || "";
  return {
    location,
    number,
    class: klass,
    startDateUtc,
    endDateUtc,
    condition: text,
  };
}

export function adaptCrewBriefingNotamText(rawText, icao) {
  const text = normalizeLines(rawText);
  if (!text) return [];
  const numberedParts = text
    .split(/\n(?=\|#\d+\|[-]+)/)
    .map((part) => normalizeLines(part))
    .filter(Boolean);
  const parsed = numberedParts.map((part) => formatCrewBriefingNotamItem(part, icao));
  if (parsed.length > 0) return parsed;
  return [{
    location: icao,
    number: "CREWBRIEFING-RAW",
    class: "N",
    startDateUtc: "",
    endDateUtc: "",
    condition: text,
  }];
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    icao: "",
    mode: "",
    json: false,
    headed: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--headed") {
      options.headed = true;
    } else if (arg === "--mode") {
      options.mode = args[++i] || "";
    } else if (arg.startsWith("--mode=")) {
      options.mode = arg.slice("--mode=".length);
    } else if (!arg.startsWith("--") && !options.icao) {
      options.icao = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.icao = options.icao.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(options.icao)) {
    throw new Error("Usage: node scripts/crewbriefing-opmet-notams.mjs <ICAO> [--mode notam|weather|both] [--json]");
  }
  if (options.mode) options.mode = normalizeCrewBriefingMode(options.mode);
  if (options.json && !options.mode) options.mode = "both";
  return options;
}

async function promptMode() {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question("Choose data to fetch: 1) NOTAM  2) Weather  3) Both [3]: ");
    return normalizeCrewBriefingMode(answer || "3");
  } finally {
    rl.close();
  }
}

async function clickView(page) {
  const viewButton = page.locator('input[type="submit"][value*="View"], input[type="button"][value*="View"], button:has-text("View")').first();
  if (await viewButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await viewButton.click();
  } else {
    await page.keyboard.press("Enter");
  }
}

async function fillSearchAndView(page, icao, completionText) {
  if (isCrewBriefingSessionInvalidUrl(page.url())) {
    throw new Error("CrewBriefing Extra session is invalid. Open Extra WX/Charts/NOTAMs from the logged-in main page.");
  }
  const searchInput = page.locator(CREWBRIEFING_SEARCH_INPUT_SELECTOR).first();
  try {
    await searchInput.waitFor({ state: "visible", timeout: 15000 });
  } catch (err) {
    const body = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
    throw new Error(
      [
        `Could not find CrewBriefing search input on ${page.url()}.`,
        `Page title: ${await page.title().catch(() => "unknown")}`,
        `Body preview: ${normalizeLines(body).slice(0, 500) || "(empty)"}`,
        err.message,
      ].join("\n")
    );
  }
  await searchInput.fill(icao);
  await clickView(page);
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);
  await page.getByText(completionText, { exact: false }).waitFor({ timeout: 20000 }).catch(() => {});
  return page.locator("body").innerText();
}

async function login(context, username, password) {
  const page = await context.newPage();
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator('input[type="text"]').first().fill(username);
  await page.locator('input[type="password"]').first().fill(password);
  const loginButton = page.locator('input[type="submit"], input[type="button"], button').filter({ hasText: /login/i }).first();
  if (await loginButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await loginButton.click();
  } else {
    await page.keyboard.press("Enter");
  }
  await page.waitForURL(/Main\.aspx/i, { timeout: 30000 });
  return page;
}

async function openExtraPageFromMain(mainPage) {
  const extraLink = mainPage.locator("#lnk_cbx").or(mainPage.getByRole("link", { name: /Extra WX\/\s*Charts\/NOTAMs/i })).first();
  await extraLink.waitFor({ state: "visible", timeout: 15000 });

  const popupPromise = mainPage.waitForEvent("popup", { timeout: 15000 });
  await extraLink.click();
  const extraPage = await popupPromise;
  await extraPage.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});

  if (isCrewBriefingSessionInvalidUrl(extraPage.url())) {
    throw new Error("CrewBriefing opened an invalid Extra session. Close other CrewBriefing windows and run the scraper again.");
  }
  return extraPage;
}

async function openExtraSection(extraPage, section) {
  const linkName = section === "notam" ? "NOTAM" : "OPMET";
  await extraPage.getByRole("link", { name: linkName, exact: true }).click();
  await extraPage.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
  await extraPage.waitForTimeout(500);

  if (isCrewBriefingSessionInvalidUrl(extraPage.url())) {
    throw new Error(`CrewBriefing ${linkName} session is invalid. Close other CrewBriefing windows and run the scraper again.`);
  }
}

async function fetchNotams(extraPage, icao) {
  await openExtraSection(extraPage, "notam");
  const raw = await fillSearchAndView(extraPage, icao, "NOTAM search performed");
  return extractCrewBriefingNotams(raw);
}

async function fetchWeather(extraPage, icao) {
  await openExtraSection(extraPage, "weather");
  const raw = await fillSearchAndView(extraPage, icao, "WX search performed");
  return extractCrewBriefingWeather(raw);
}

async function runScraper(options) {
  loadEnvFromProjectRoot();
  const username = process.env.CREWBRIEFING_USERNAME;
  const password = process.env.CREWBRIEFING_PASSWORD;
  if (!username || !password) {
    throw new Error("CREWBRIEFING_USERNAME and CREWBRIEFING_PASSWORD are required.");
  }

  const { chromium } = await import("playwright");
  const headed = options.headed || process.env.CREWBRIEFING_HEADED === "1" || process.env.USE_HEADED === "1";
  progress("Opening CrewBriefing login", options.mode || "both");

  const commonArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
  ];

  const launchAttempts = [
    {
      label: "channel launch",
      options: {
        headless: !headed,
        channel: process.env.CHROME_CHANNEL || "chromium",
        args: commonArgs,
      },
    },
    {
      label: "bundled launch",
      options: {
        headless: !headed,
        args: commonArgs,
      },
    },
    {
      label: "system chromium launch",
      options: {
        headless: !headed,
        executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium-browser",
        args: commonArgs,
      },
    },
  ];

  let browser = null;
  let lastLaunchError = "";
  for (const attempt of launchAttempts) {
    try {
      browser = await chromium.launch(attempt.options);
      progress(`Browser started via ${attempt.label}`, options.mode || "both");
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastLaunchError = `${attempt.label}: ${msg}`;
      progress(`Browser launch failed (${attempt.label})`, options.mode || "both");
    }
  }
  if (!browser) {
    throw new Error(`CrewBriefing browser launch failed. ${lastLaunchError}`);
  }

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: headed ? { width: 1280, height: 900 } : null,
    });
    const mainPage = await login(context, username, password);
    progress("Logged in", options.mode || "both");
    const extraPage = await openExtraPageFromMain(mainPage);
    progress("Opening Extra WX/Charts/NOTAMs", options.mode || "both");

    const result = {
      icao: options.icao,
      notam: "",
      notams: [],
      weather: "",
      updatedAt: new Date().toISOString(),
    };

    if (options.mode === "notam" || options.mode === "both") {
      progress(`Searching NOTAMs for ${options.icao}`, "notam");
      result.notam = await fetchNotams(extraPage, options.icao);
      result.notams = adaptCrewBriefingNotamText(result.notam, options.icao);
      progress("NOTAM search complete", "notam");
    }
    if (options.mode === "weather" || options.mode === "both") {
      progress(`Searching weather for ${options.icao}`, "weather");
      result.weather = await fetchWeather(extraPage, options.icao);
      progress("Weather search complete", "weather");
    }

    if (options.mode === "notam" || options.mode === "both") {
      const key = `notam/${options.icao}.json`;
      progress(`Writing ${key}`, "notam");
      await saveFile(
        key,
        JSON.stringify({
          icao: options.icao,
          notams: result.notams,
          updatedAt: result.updatedAt,
        }),
      );
    }

    if (options.mode === "weather" || options.mode === "both") {
      const key = `weather/${options.icao}.json`;
      progress(`Writing ${key}`, "weather");
      await saveFile(
        key,
        JSON.stringify({
          icao: options.icao,
          weather: result.weather,
          updatedAt: result.updatedAt,
        }),
      );
    }
    progress("CrewBriefing sync complete", options.mode || "both");
    return result;
  } finally {
    await browser.close();
  }
}

function printResult(result, mode, jsonMode) {
  if (jsonMode) {
    console.log(JSON.stringify(result));
    return;
  }
  if (mode === "notam" || mode === "both") {
    console.log(result.notam || `No NOTAM text extracted for ${result.icao}.`);
  }
  if (mode === "both") console.log("\n--- WEATHER ---\n");
  if (mode === "weather" || mode === "both") {
    console.log(result.weather || `No weather text extracted for ${result.icao}.`);
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  globalJsonMode = options.json;
  if (!options.mode) options.mode = options.json ? "both" : await promptMode();
  const result = await runScraper(options);
  printResult(result, options.mode, options.json);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
