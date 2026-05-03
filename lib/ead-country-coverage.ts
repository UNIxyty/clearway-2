import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type EadCountryMap = Record<string, string[]>;

type CachedCoverage = {
  byLabel: EadCountryMap;
  allIcaos: string[];
  countryLabelByIcao: Map<string, string>;
};

let coverageCache: CachedCoverage | null = null;

function loadCoverageFile(): EadCountryMap {
  const file = join(process.cwd(), "data", "ead-country-icaos.json");
  if (!existsSync(file)) return {};
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as EadCountryMap;
  } catch {
    return {};
  }
}

function normalizeIcao(value: string): string {
  return String(value || "").trim().toUpperCase();
}

function buildCoverage(): CachedCoverage {
  const byLabel = loadCoverageFile();
  const allSet = new Set<string>();
  const byIcao = new Map<string, string>();
  for (const [label, rows] of Object.entries(byLabel)) {
    for (const row of Array.isArray(rows) ? rows : []) {
      const icao = normalizeIcao(row);
      if (!/^[A-Z0-9]{4}$/.test(icao)) continue;
      allSet.add(icao);
      if (!byIcao.has(icao)) byIcao.set(icao, label);
    }
  }
  return {
    byLabel,
    allIcaos: Array.from(allSet).sort((a, b) => a.localeCompare(b)),
    countryLabelByIcao: byIcao,
  };
}

function getCoverage(): CachedCoverage {
  if (!coverageCache) coverageCache = buildCoverage();
  return coverageCache;
}

export function listAllEadIcaos(): string[] {
  return getCoverage().allIcaos.slice();
}

export function isEadSupportedIcao(icao: string): boolean {
  const up = normalizeIcao(icao);
  if (!/^[A-Z0-9]{4}$/.test(up)) return false;
  return getCoverage().countryLabelByIcao.has(up);
}

export function getEadCountryLabelForIcao(icao: string): string | null {
  const up = normalizeIcao(icao);
  if (!/^[A-Z0-9]{4}$/.test(up)) return null;
  return getCoverage().countryLabelByIcao.get(up) ?? null;
}

export function eadCountryNameFromLabel(label: string): string {
  return String(label || "")
    .replace(/\s*\([A-Z0-9]{2}\)\s*$/, "")
    .trim();
}

export function normalizeCountryName(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[./_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
