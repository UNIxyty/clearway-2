"use client";

// The airport view (audit §5.2; portal redesign, stage 3 — "Page Airport"): the entire per-airport experience on one
// page — the header (the airport, its location, Download PDF / Re-sync / Web AIP / ask the agent / ⋯ for GEN and
// "Report a problem", which opens Help & support), the document viewer with AD 2 and GEN tabs (components/portal/airport/DocViewer), NOTAMs
// coloured by the wall's categories and weather in the right column (components/portal/airport/AirportSide), the
// Web AIP modal, and every fetch/cache/SSE flow, extracted verbatim from the old app/page.tsx. State keys
// off the `icao` prop, which comes from the /aip/<ICAO> URL. NOTAMs, weather and the document each load and fail on
// their own, so one source being down leaves the rest of the page usable.

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDownIcon, ChevronUpIcon, GlobeIcon } from "lucide-react";
import AskAboutButton from "@/components/agent/ui/AskAboutButton";
import MaskIcon from "@/components/portal/Icon";
import { Badge, Button, Callout, Card, ErrorState, IconButton, Menu, Modal, Skeleton, Spinner as KitSpinner, type MenuItem } from "@/components/kit";
import DocViewer, { type DocTab } from "@/components/portal/airport/DocViewer";
import { NotamsCard, WeatherCard } from "@/components/portal/airport/AirportSide";
import { PMono, PSectionTitle } from "@/components/portal/ui";
import { getCountryFlagUrl } from "@/lib/country-flags";
import { formatTimesInAipText } from "@/lib/format-aip-time";
import { useBackgroundSearch } from "@/lib/search-context";
import { sendNotification, type NotificationPrefs, DEFAULT_NOTIFICATION_PREFS } from "@/lib/notifications";
import { parseOpmetBullets, stripWxSearchPreamble } from "@/lib/format-opmet-weather";
import { getAsecnaAirportsSet, getAsecnaAirportByIcao, getAsecnaData } from "@/lib/asecna-airports";
import { getScraperCountryByIcao, isScraperCountryName, getScraperWebAipUrlByCountryOrIcao } from "@/lib/scraper-country-config";
import { CaptchaConsentDialog } from "@/components/captcha-consent-dialog";
import { getCaptchaCountryByIcao, useCaptchaConsent } from "@/lib/captcha-consent";
import { getEadWebAipUrlByIcaoOrCountry } from "@/lib/ead-web-aip";
import { resolveGenPrefix } from "@/lib/ead-gen-prefix";
import { USA_WEB_AIP_URL, isUsaAipIcao } from "@/lib/usa-aip";
import eadCountryIcaos from "@/lib/ead-country-icaos.generated.json";

export type NotamItem = {
  location: string;
  number: string;
  class: string;
  startDateUtc: string;
  endDateUtc: string;
  condition: string;
};

type WeatherItem = {
  weather: string;
  error: string | null;
  updatedAt?: string | null;
};


export type RecentEntry = { icao: string; name: string; country: string; ts: number };
export const RECENTS_STORAGE_KEY = "portal-recents";
const RECENTS_MAX = 8;

function getCaptchaViewerHref(country: string): string {
  switch (country.toLowerCase()) {
    case "lithuania":
      return "/lithuania-hitl-auto-test/viewer";
    case "netherlands":
      return "/netherlands-hitl-auto-test/viewer";
    case "greece":
    default:
      return "/greece-hitl-auto-test/viewer";
  }
}

function buildCaptchaViewerUrl(country: string, popupUrl: string, sessionId: string): string {
  const params = new URLSearchParams({
    src: popupUrl,
    sessionId,
    closeOnClear: "1",
  });
  return `${getCaptchaViewerHref(country)}?${params.toString()}`;
}

export type AIPAirport = {
  country: string;
  gen1_2: string;
  gen1_2_point_4: string;
  icao: string;
  name: string;
  publicationDate: string;
  trafficPermitted: string;
  trafficRemarks: string;
  ad22Operator: string;
  ad22Address: string;
  ad22Telephone: string;
  ad22Telefax: string;
  ad22Email: string;
  ad22Afs: string;
  ad22Website: string;
  operator: string;
  customsImmigration: string;
  ats: string;
  atsRemarks: string;
  fireFighting: string;
  runwayNumber: string;
  runwayDimensions: string;
  lat?: number;
  lon?: number;
  sourceType?: string;
  dynamicUpdated?: boolean;
  webAipUrl?: string;
  effectiveDate?: string | null;
};

type ExtractedAirportRow = {
  "Publication Date"?: string;
  "Airport Code"?: string;
  "Airport Name"?: string;
  "AD2.2 Types of Traffic Permitted"?: string;
  "AD2.2 Remarks"?: string;
  "AD2.2 AD Operator"?: string;
  "AD2.2 Address"?: string;
  "AD2.2 Telephone"?: string;
  "AD2.2 Telefax"?: string;
  "AD2.2 E-mail"?: string;
  "AD2.2 AFS"?: string;
  "AD2.2 Website"?: string;
  "AD2.3 AD Operator"?: string;
  "AD 2.3 Customs and Immigration"?: string;
  "AD2.3 ATS"?: string;
  "AD2.3 Remarks"?: string;
  "AD2.6 AD category for fire fighting"?: string;
  "AD2.12 Runway Number"?: string;
  "AD2.12 Runway Dimensions"?: string;
};

// ICAO prefixes for EAD (EU) countries – when user views an airport with this prefix, we show AIP (EAD) and can sync from EC2
const EAD_ICAO_PREFIXES = new Set([
  "LA", "UD", "LO", "UB", "EB", "LQ", "LB", "LD", "LC", "LK", "EK", "EE", "XX", "EF",
  "LF", "UG", "ED", "ET", "LG", "BG", "LH", "BI", "EI", "LI", "OJ", "BK", "UA", "UC", "EV",
  "EY", "EL", "LM", "LU", "EH", "EN", "RP", "EP", "LP", "LW", "LR", "LY", "LZ", "LJ",
  "LE", "ES", "GC", "LS", "LT", "UK", "EG",
]);

const SPAIN_LE_SPECIAL_EAD_ICAOS = (() => {
  const data = eadCountryIcaos as Record<string, Array<{ icao: string; name: string }>>;
  const rows = Array.isArray(data["Spain (LE)"]) ? data["Spain (LE)"] : [];
  return new Set(
    rows
      .map((row) => String(row?.icao || "").trim().toUpperCase())
      .filter((icao) => /^(GC|GE|GS)[A-Z0-9]{2}$/.test(icao)),
  );
})();

const MAIN_PAGE_DISABLE_GEN = false;
const ASECNA_ICAOS = getAsecnaAirportsSet();

export function isEadIcao(icao: string): boolean {
  const up = String(icao || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(up)) return false;
  return EAD_ICAO_PREFIXES.has(up.slice(0, 2)) || SPAIN_LE_SPECIAL_EAD_ICAOS.has(up);
}

const RUSSIA_ICAO_PREFIXES = new Set([
  "UE",
  "UH",
  "UI",
  "UL",
  "UN",
  "UR",
  "US",
  "UU",
  "UW",
]);

function isRussiaIcao(icao: string): boolean {
  if (!/^[A-Z0-9]{4}$/.test(icao.toUpperCase())) return false;
  return RUSSIA_ICAO_PREFIXES.has(icao.slice(0, 2).toUpperCase());
}

function isAsecnaIcao(icao: string): boolean {
  return ASECNA_ICAOS.has(icao.toUpperCase());
}

function isAsecnaAirport(airport: AIPAirport | null): boolean {
  if (!airport) return false;
  if (airport.sourceType === "ASECNA_DYNAMIC") return true;
  if (airport.webAipUrl && /aim\.asecna\.aero/i.test(airport.webAipUrl)) return true;
  const target = String(airport.country || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’]/g, "'")
    .trim()
    .toLowerCase();
  return (getAsecnaData().countries || []).some((c) => {
    const n = String(c.name || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’]/g, "'")
      .trim()
      .toLowerCase();
    return n === target;
  });
}

function isBahrainScraperAirport(airport: AIPAirport | null): boolean {
  if (!airport) return false;
  if (airport.sourceType === "SCRAPER_DYNAMIC") return true;
  if (isScraperCountryName(airport.country || "")) return true;
  return Boolean(getScraperCountryByIcao(airport.icao || ""));
}

function isBahrainScraperIcao(icao: string, airport: AIPAirport | null): boolean {
  if (airport && isBahrainScraperAirport(airport) && airport.icao.toUpperCase() === icao.toUpperCase()) {
    return true;
  }
  return Boolean(getScraperCountryByIcao(icao));
}

function hasAsecnaGen12(icao: string): boolean {
  const airport = getAsecnaAirportByIcao(icao);
  if (!airport) return false;
  const country = (getAsecnaData().countries || []).find((c) => c.code === airport.countryCode);
  return Boolean(country?.gen12?.anchor);
}

function isJapanScraperIcao(icao: string): boolean {
  const cfg = getScraperCountryByIcao(icao);
  return cfg?.country === "Japan";
}

function isKuwaitScraperIcao(icao: string): boolean {
  const cfg = getScraperCountryByIcao(icao);
  return cfg?.country === "Kuwait";
}

function getEadWebAipUrlForAirport(airport: AIPAirport | null): string | null {
  if (!airport) return null;
  if (isRussiaIcao(airport.icao)) {
    return "https://www.caica.ru/common/AirInter/validaip/html/menurus.htm";
  }
  return getEadWebAipUrlByIcaoOrCountry(airport.icao, airport.country);
}

const EAD_BASIC_LOGIN_URL = "https://www.ead.eurocontrol.int/cms-eadbasic/opencms/en/login/ead-basic/";

function pickExtractedAirportRow(list: ExtractedAirportRow[], icao: string): ExtractedAirportRow | null {
  const exact = list.find((a) => String(a["Airport Code"] ?? "").trim().toUpperCase() === icao);
  if (exact) return exact;
  if (list.length === 1) return list[0];
  const loose = list.find((a) => String(a["Airport Code"] ?? "").toUpperCase().includes(icao));
  return loose ?? null;
}

function mapExtractedRowToAirport(
  row: ExtractedAirportRow | null,
  icao: string,
  fallbackCountry: string,
): AIPAirport | null {
  if (!row) return null;
  return {
    country: fallbackCountry,
    gen1_2: "",
    gen1_2_point_4: "",
    icao: String(row["Airport Code"] ?? icao).trim().toUpperCase() || icao,
    name: row["Airport Name"] ?? "",
    publicationDate: row["Publication Date"] ?? "",
    trafficPermitted: row["AD2.2 Types of Traffic Permitted"] ?? "",
    trafficRemarks: row["AD2.2 Remarks"] ?? "",
    ad22Operator: row["AD2.2 AD Operator"] ?? "",
    ad22Address: row["AD2.2 Address"] ?? "",
    ad22Telephone: row["AD2.2 Telephone"] ?? "",
    ad22Telefax: row["AD2.2 Telefax"] ?? "",
    ad22Email: row["AD2.2 E-mail"] ?? "",
    ad22Afs: row["AD2.2 AFS"] ?? "",
    ad22Website: row["AD2.2 Website"] ?? "",
    operator: row["AD2.3 AD Operator"] ?? "",
    customsImmigration: row["AD 2.3 Customs and Immigration"] ?? "",
    ats: row["AD2.3 ATS"] ?? "",
    atsRemarks: row["AD2.3 Remarks"] ?? "",
    fireFighting: row["AD2.6 AD category for fire fighting"] ?? "",
    runwayNumber: row["AD2.12 Runway Number"] ?? "",
    runwayDimensions: row["AD2.12 Runway Dimensions"] ?? "",
  };
}

function supportsSyncedAipIcao(icao: string): boolean {
  return isEadIcao(icao) || isRussiaIcao(icao) || isAsecnaIcao(icao) || isBahrainScraperIcao(icao, null) || isUsaAipIcao(icao);
}

/** Human name of the live source a force re-sync would hit (mirrors the "Source:" line). */
function aipSyncSourceName(icao: string, airport: AIPAirport | null): string {
  if (isAsecnaIcao(icao)) return "ASECNA Web AIP";
  if (isBahrainScraperIcao(icao, airport)) return `${airport?.country || "Scraper"} Web AIP`;
  if (isUsaAipIcao(icao)) return "FAA USA AIP";
  if (isRussiaIcao(icao)) return "CAICA Russia AIP";
  return "Eurocontrol (EAD)";
}

/** EAD airport that is not in stored data; we show sync UI only, no stored AIP card */
function isEadPlaceholder(airport: AIPAirport | null): boolean {
  return airport?.name === "EAD UNDEFINED";
}

/** User-visible AIP sync error; highlight OpenRouter insufficient credits (402). */
function formatAipSyncError(data: { error?: string; detail?: string; code?: number }): string {
  if (data.code === 402) {
    return `Error 402 — Insufficient API credits. ${data.detail ?? "Add credits at https://openrouter.ai/settings/credits"}`;
  }
  const detail = String(data.detail || "");
  if (/captcha-protected/i.test(detail) || /\[greece\]|\[netherlands\]|\[lithuania\]/i.test(detail)) {
    return "Captcha verification required. Click Continue to open noVNC popup, complete captcha, then retry sync.";
  }
  const combined = `${data.error ?? ""} ${detail}`.toLowerCase();
  if (combined.includes("not found in search results") || combined.includes("may not exist in ead")) {
    return "This airport was not found in EAD. It may not be published in the civilian AIP for this AIRAC cycle.";
  }
  const base = (data.error ?? "Sync failed") + (data.detail ? `: ${data.detail}` : "");
  return base;
}

const AIP_FIELD_LABELS: { key: keyof AIPAirport; section: string; label: string }[] = [
  { key: "country", section: "", label: "State" },
  { key: "publicationDate", section: "", label: "Publication Date" },
  { key: "trafficPermitted", section: "AD 2.2", label: "Types of traffic permitted" },
  { key: "trafficRemarks", section: "AD 2.2", label: "Remarks" },
  { key: "ad22Operator", section: "AD 2.2", label: "AD Operator" },
  { key: "ad22Address", section: "AD 2.2", label: "Address" },
  { key: "ad22Telephone", section: "AD 2.2", label: "Telephone" },
  { key: "ad22Telefax", section: "AD 2.2", label: "Telefax" },
  { key: "ad22Email", section: "AD 2.2", label: "E-mail" },
  { key: "ad22Afs", section: "AD 2.2", label: "AFS" },
  { key: "ad22Website", section: "AD 2.2", label: "Website" },
  { key: "operator", section: "AD 2.3", label: "AD Operator" },
  { key: "customsImmigration", section: "AD 2.3", label: "Customs and immigration" },
  { key: "ats", section: "AD 2.3", label: "ATS" },
  { key: "atsRemarks", section: "AD 2.3", label: "Remarks" },
  { key: "fireFighting", section: "AD 2.6", label: "AD category for fire fighting" },
  { key: "runwayNumber", section: "AD 2.12", label: "Runway Number" },
  { key: "runwayDimensions", section: "AD 2.12", label: "Runway Dimensions" },
];

function AIPResultCard({
  airport,
  isSelected,
  onSelect,
}: {
  airport: AIPAirport;
  isSelected?: boolean;
  onSelect?: () => void;
}) {
  const [showGen, setShowGen] = useState(false);

  const SECTION_TITLE_BY_KEY: Record<string, string> = {
    "": "General Information",
    "AD 2.2": "Aerodrome Data",
    "AD 2.3": "Operational Hours",
    "AD 2.6": "Rescue and Fire Fighting",
    "AD 2.12": "Runway Physical Characteristics",
  };
  const SECTION_RENDER_ORDER = ["", "AD 2.2", "AD 2.3", "AD 2.6", "AD 2.12"];

  const rows = AIP_FIELD_LABELS
    .map(({ key, section, label }) => {
      const value = airport[key];
      if (typeof value !== "string" || !value.trim()) return null;
      return { key, section, label, value: value.trim() };
    })
    .filter((r): r is { key: keyof AIPAirport; section: string; label: string; value: string } => r !== null);

  const parseRunwayRows = (runwayNumberRaw: string, runwayDimensionsRaw: string) => {
    const runwayNumbers = runwayNumberRaw
      .split(/[,;\n]+/)
      .map((v) => v.trim())
      .filter(Boolean);

    const dimEntries = runwayDimensionsRaw
      .split(/;\s*|\n+/)
      .map((v) => v.trim())
      .filter(Boolean);

    const dimsByRunway = new Map<string, string>();
    const unnamedDims: string[] = [];

    for (const entry of dimEntries) {
      const tagged = entry.match(/^([^:]+):\s*(.+)$/);
      if (tagged) {
        const runway = tagged[1].trim();
        const dims = tagged[2].trim();
        if (runway && dims) dimsByRunway.set(runway, dims);
      } else {
        unnamedDims.push(entry);
      }
    }

    const parsed = runwayNumbers.map((runway, idx) => ({
      runway,
      dimensions: dimsByRunway.get(runway) || unnamedDims[idx] || "",
    }));

    for (const [runway, dimensions] of dimsByRunway.entries()) {
      if (!parsed.some((r) => r.runway === runway)) parsed.push({ runway, dimensions });
    }

    return parsed.filter((r) => r.runway || r.dimensions);
  };

  const rowsBySection = rows.reduce<Record<string, typeof rows>>((acc, row) => {
    if (!acc[row.section]) acc[row.section] = [];
    acc[row.section].push(row);
    return acc;
  }, {});

  const orderedSectionKeys = [
    ...SECTION_RENDER_ORDER.filter((section) => rowsBySection[section]?.length),
    ...Object.keys(rowsBySection).filter((section) => !SECTION_RENDER_ORDER.includes(section)),
  ];

  const flagUrl = getCountryFlagUrl(airport.country);

  const hasGen = airport.gen1_2 || airport.gen1_2_point_4;

  return (
    <div
      className={`${isSelected ? "rounded-[10px] ring-2 ring-cw-primary " : ""}${onSelect ? "cursor-pointer " : ""}`}
      role={onSelect ? "button" : undefined}
      onClick={onSelect}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <span className="inline-flex w-[22px] flex-none items-center justify-center">
          {flagUrl ? (
            <img
              src={flagUrl}
              alt=""
              width={22}
              height={16}
              className="rounded-sm border border-cw-border object-cover"
            />
          ) : (
            <GlobeIcon className="size-4 text-cw-text-muted" />
          )}
        </span>
        <span className="whitespace-nowrap font-mono text-[15px] font-semibold text-cw-text">{airport.icao}</span>
        {airport.name ? <span className="text-sm text-cw-text-muted">{airport.name}</span> : null}
      </div>
      <div className="flex flex-col gap-4">
        {orderedSectionKeys.map((section) => {
          const sectionRows = rowsBySection[section];
          const sectionTitle = SECTION_TITLE_BY_KEY[section] || section || "Section";
          const isRunwaySection = section === "AD 2.12";
          const runwayNumberRow = isRunwaySection
            ? sectionRows.find((row) => row.key === "runwayNumber")
            : undefined;
          const runwayDimensionsRow = isRunwaySection
            ? sectionRows.find((row) => row.key === "runwayDimensions")
            : undefined;
          const runwayRows = (runwayNumberRow?.value || runwayDimensionsRow?.value)
            ? parseRunwayRows(runwayNumberRow?.value ?? "", runwayDimensionsRow?.value ?? "")
            : [];
          const normalRows = isRunwaySection
            ? sectionRows.filter((row) => row.key !== "runwayNumber" && row.key !== "runwayDimensions")
            : sectionRows;

          return (
            <section key={section || "general"} className="overflow-hidden rounded-[10px] border border-cw-divider">
              <div className="flex items-center gap-2 border-b border-cw-divider bg-cw-bg-page px-3.5 py-2">
                {section ? (
                  <PMono className="text-[11px] font-semibold tracking-wide text-cw-text-link">{section}</PMono>
                ) : null}
                <PSectionTitle className="tracking-[0.06em]">{sectionTitle}</PSectionTitle>
              </div>
              <dl className="divide-y divide-cw-divider">
                {normalRows.map(({ key, section: rowSection, label, value }) => (
                  <div
                    key={`${rowSection}-${label}`}
                    className="grid grid-cols-1 gap-1.5 px-3.5 py-2.5 sm:grid-cols-[minmax(160px,190px)_1fr] sm:gap-4"
                  >
                    <dt className="text-[11.5px] leading-5 text-cw-text-muted">{label}</dt>
                    <dd className={`flex min-w-0 items-center gap-2 font-mono text-[13px] leading-relaxed text-cw-text ${value.includes("\n") ? "whitespace-pre-wrap break-words" : ""}`}>
                      {key === "country" && flagUrl ? (
                        <>
                          <img
                            src={flagUrl}
                            alt=""
                            width={28}
                            height={21}
                            className="shrink-0 rounded-sm object-cover align-middle"
                          />
                          <span>{value}</span>
                        </>
                      ) : (
                        formatTimesInAipText(value)
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              {isRunwaySection && runwayRows.length > 0 && (
                <div className="border-t border-cw-divider px-3.5 py-3.5">
                  <PSectionTitle className="mb-2.5">Runways</PSectionTitle>
                  <div className="overflow-hidden rounded-[10px] border border-cw-divider">
                    <table className="w-full text-[13px]">
                      <thead className="bg-cw-bg-page">
                        <tr>
                          <th className="w-28 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-cw-text-muted">Runway</th>
                          <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-cw-text-muted">Dimensions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cw-divider">
                        {runwayRows.map((r) => (
                          <tr key={`${r.runway}-${r.dimensions}`}>
                            <td className="px-3 py-2 font-mono text-cw-text">{r.runway || "—"}</td>
                            <td className="px-3 py-2 font-mono text-cw-text-body">{r.dimensions || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
      {hasGen && (
        <div className="mt-4 border-t border-cw-divider pt-4">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowGen((v) => !v); }}
            className="flex cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-sm font-semibold text-cw-text-muted hover:text-cw-text"
          >
            {showGen ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
            {flagUrl && (
              <img
                src={flagUrl}
                alt=""
                width={22}
                height={16}
                className="inline-block shrink-0 rounded-sm object-cover align-middle"
              />
            )}
            GEN (General — {airport.country})
          </button>
          {showGen && (
            <div className="mt-3 space-y-4">
              {airport.gen1_2 && (
                <div className="max-w-none">
                  <p className="mb-1.5 text-sm font-semibold text-cw-text">GEN 1.2</p>
                  <p className="text-[13px] leading-6 text-cw-text-body">{airport.gen1_2}</p>
                </div>
              )}
              {airport.gen1_2_point_4 && (
                <div className="max-w-none">
                  <p className="mb-1.5 text-sm font-semibold text-cw-text">GEN 1.2 Point 4</p>
                  <p className="text-[13px] leading-6 text-cw-text-body">{airport.gen1_2_point_4}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Fallback airport row when /api/search has no exact match for the ICAO in
 *  the URL. EAD-prefixed codes keep the existing "EAD UNDEFINED" placeholder
 *  behaviour (sync UI only, no stored AIP card). */
function emptyAirportForIcao(icao: string): AIPAirport {
  return {
    country: isEadIcao(icao) ? "EAD (EU AIP)" : "",
    gen1_2: "",
    gen1_2_point_4: "",
    icao,
    name: isEadIcao(icao) ? "EAD UNDEFINED" : "",
    publicationDate: "",
    trafficPermitted: "",
    trafficRemarks: "",
    ad22Operator: "",
    ad22Address: "",
    ad22Telephone: "",
    ad22Telefax: "",
    ad22Email: "",
    ad22Afs: "",
    ad22Website: "",
    operator: "",
    customsImmigration: "",
    ats: "",
    atsRemarks: "",
    fireFighting: "",
    runwayNumber: "",
    runwayDimensions: "",
  };
}

export default function AirportView({ icao }: { icao: string }) {
  const { bgList, updateStage, finishBackground } = useBackgroundSearch();
  const searchParams = useSearchParams();
  const [airport, setAirport] = useState<AIPAirport | null>(null);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [aipEadSyncSteps, setAipEadSyncSteps] = useState<string[]>([]);
  const [, setError] = useState<string | null>(null);
  const [notamsCache, setNotamsCache] = useState<Record<string, { notams: NotamItem[]; error: string | null; detail?: string; updatedAt?: string | null }>>({});
  const [notamsLoadingIcao, setNotamsLoadingIcao] = useState<string | null>(null);
  const [notamsSyncingIcao, setNotamsSyncingIcao] = useState<string | null>(null);
  const [notamsSyncSteps, setNotamsSyncSteps] = useState<string[]>([]);
  const [syncRequestedIcao, setSyncRequestedIcao] = useState<string | null>(null);
  const [weatherCache, setWeatherCache] = useState<Record<string, WeatherItem>>({});
  const [weatherLoadingIcao, setWeatherLoadingIcao] = useState<string | null>(null);
  const [weatherSyncingIcao, setWeatherSyncingIcao] = useState<string | null>(null);
  const [weatherSyncSteps, setWeatherSyncSteps] = useState<string[]>([]);
  const [weatherSyncRequestedIcao, setWeatherSyncRequestedIcao] = useState<string | null>(null);
  const [aipEadCache, setAipEadCache] = useState<Record<string, { airport: AIPAirport | null; error: string | null; updatedAt?: string | null; cache?: { ttlMs?: number; staleAfterMs?: number } | null }>>({});
  const [aipEadLoadingIcao, setAipEadLoadingIcao] = useState<string | null>(null);
  const [aipEadSyncingIcao, setAipEadSyncingIcao] = useState<string | null>(null);
  const [aipEadSyncRequestedIcao, setAipEadSyncRequestedIcao] = useState<string | null>(null);
  const [aipPdfSlowIcao, setAipPdfSlowIcao] = useState<string | null>(null);
  const [aipSyncStartedAt, setAipSyncStartedAt] = useState<number | null>(null);
  const [aipSyncElapsedSec, setAipSyncElapsedSec] = useState(0);
  // Manual force re-sync (Phase 4): per-icao in-flight state + persistent
  // failure banner. The banner keeps the previous cached document visible.
  const [resyncingIcao, setResyncingIcao] = useState<string | null>(null);
  const [resyncError, setResyncError] = useState<Record<string, { message: string; cachedAt: string | null }>>({});
  const [aipPdfReady, setAipPdfReady] = useState<Record<string, boolean>>({});
  const [aipPdfExistsOnServer, setAipPdfExistsOnServer] = useState<Record<string, boolean>>({});
  const [pdfDownloadError, setPdfDownloadError] = useState<string | null>(null);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [genPdfDownloadError, setGenPdfDownloadError] = useState<string | null>(null);
  // The GEN 1.2 PDF opened in the viewer's GEN tab, per airport (a blob URL, revoked when replaced).
  const [genView, setGenView] = useState<Record<string, { url: string; filename: string }>>({});
  const [genPdfDownloading, setGenPdfDownloading] = useState(false);
  const [genPdfExistsOnServer, setGenPdfExistsOnServer] = useState<Record<string, boolean>>({});
  type GenPart = { raw: string; rewritten: string };
  const emptyGenPart = (): GenPart => ({ raw: "", rewritten: "" });
  const [genCache, setGenCache] = useState<Record<string, { general: GenPart; nonScheduled: GenPart; privateFlights: GenPart; updatedAt: string | null }>>({});
  const [genLoadingPrefix, setGenLoadingPrefix] = useState<string | null>(null);
  const [genSyncingPrefix, setGenSyncingPrefix] = useState<string | null>(null);
  const [genSyncSteps, setGenSyncSteps] = useState<string[]>([]);
  const [genViewMode, setGenViewMode] = useState<"raw" | "rewritten">("rewritten");
  const [genPartMode, setGenPartMode] = useState<"general" | "nonScheduled" | "privateFlights">("general");
  const [webAipConsent, setWebAipConsent] = useState<{ url: string; label: string } | null>(null);
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const [pendingCaptchaIcao, setPendingCaptchaIcao] = useState<string | null>(null);
  const {
    dismissed: captchaConsentDismissed,
    dialog: captchaConsentDialog,
    requestConsentForIcao,
    dontShowAgain: dontShowCaptchaConsentAgain,
    close: closeCaptchaConsentDialog,
  } = useCaptchaConsent();
  const viewingAirport = airport;

  const recentIcao = viewingAirport?.icao ?? null;
  const recentName = viewingAirport?.name ?? "";
  const recentCountry = viewingAirport?.country ?? "";

  // Airport row metadata (name/country/flag/lat/lon) comes from the same
  // GET /api/search the search page uses — exact-match pick on the ICAO.
  useEffect(() => {
    let cancelled = false;
    setAirport(null);
    fetch(`/api/search?q=${encodeURIComponent(icao)}`)
      .then((res) => (res.ok ? res.json() : { results: [] }))
      .then((data: { results?: AIPAirport[] }) => {
        if (cancelled) return;
        const exact =
          (data.results ?? []).find((a) => String(a.icao || "").trim().toUpperCase() === icao) ?? null;
        setAirport(exact ?? emptyAirportForIcao(icao));
      })
      .catch(() => {
        if (cancelled) return;
        setAirport(emptyAirportForIcao(icao));
      });
    return () => {
      cancelled = true;
    };
  }, [icao]);

  // Load "Recently opened" entries once on mount (client-only localStorage list).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENTS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as RecentEntry[];
      if (Array.isArray(parsed)) {
        setRecents(parsed.filter((r) => r && typeof r.icao === "string"));
      }
    } catch {
      // corrupt or unavailable localStorage — start with an empty list
    }
  }, []);

  // Record every opened airport into the "Recently opened" list.
  useEffect(() => {
    if (!recentIcao) return;
    setRecents((prev) => {
      const entry: RecentEntry = { icao: recentIcao, name: recentName, country: recentCountry, ts: Date.now() };
      const next = [entry, ...prev.filter((r) => r.icao !== recentIcao)].slice(0, RECENTS_MAX);
      try {
        window.localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore quota / availability errors
      }
      return next;
    });
  }, [recentIcao, recentName, recentCountry]);

  const aipEadInFlightRef = useRef<Set<string>>(new Set());
  // Synchronous double-click guard for the force re-sync button: state updates
  // are async, so a fast second click could start a second run without this.
  const resyncInFlightRef = useRef<Set<string>>(new Set());
  const requestControllersRef = useRef<Map<string, AbortController>>(new Map());

  const beginRequest = useCallback((key: string) => {
    const prev = requestControllersRef.current.get(key);
    if (prev) prev.abort();
    const controller = new AbortController();
    requestControllersRef.current.set(key, controller);
    return controller;
  }, []);

  const finishRequest = useCallback((key: string, controller: AbortController) => {
    if (requestControllersRef.current.get(key) === controller) {
      requestControllersRef.current.delete(key);
    }
  }, []);

  const isAbortError = useCallback((err: unknown) => {
    const msg = String((err as { message?: string })?.message || "").toLowerCase();
    const name = String((err as { name?: string })?.name || "").toLowerCase();
    return name === "aborterror" || msg.includes("aborted") || msg.includes("aborterror");
  }, []);

  const stopAllRequests = useCallback(() => {
    for (const controller of requestControllersRef.current.values()) controller.abort();
    requestControllersRef.current.clear();
  }, []);

  useEffect(() => {
    return () => stopAllRequests();
  }, [stopAllRequests]);

  useEffect(() => {
    setPdfDownloadError(null);
    setGenPdfDownloadError(null);
    setGenSyncSteps([]);
  }, [viewingAirport?.icao]);

  useEffect(() => {
    const icao = viewingAirport?.icao ?? null;
    if (!icao || (!isEadIcao(icao) && !isAsecnaIcao(icao))) return;
    if (isAsecnaIcao(icao)) return;
    const prefix = resolveGenPrefix(icao);
    if (prefix in genPdfExistsOnServer) return;
    fetch(`/api/aip/gen/pdf/exists?icao=${encodeURIComponent(icao)}&prefix=${encodeURIComponent(prefix)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { exists?: boolean }) => {
        setGenPdfExistsOnServer((prev) => ({ ...prev, [prefix]: Boolean(data?.exists) }));
      })
      .catch(() => {
        setGenPdfExistsOnServer((prev) => ({ ...prev, [prefix]: false }));
      });
  }, [viewingAirport?.icao, genPdfExistsOnServer]);

  const cachedNotams = viewingAirport ? notamsCache[viewingAirport.icao] : null;
  const notamsLoading = viewingAirport ? notamsLoadingIcao === viewingAirport.icao : false;
  const notamsSyncing = viewingAirport ? notamsSyncingIcao === viewingAirport.icao : false;
  const notams = cachedNotams?.notams ?? null;
  const notamsError = cachedNotams?.error ?? null;
  const notamsUpdatedAt = cachedNotams?.updatedAt ?? null;
  const cachedWeather = viewingAirport ? weatherCache[viewingAirport.icao] : null;
  const weatherLoading = viewingAirport ? weatherLoadingIcao === viewingAirport.icao : false;
  const weatherSyncing = viewingAirport ? weatherSyncingIcao === viewingAirport.icao : false;

  const weatherDisplay = useMemo(() => {
    const raw = cachedWeather?.weather ?? "";
    const { airportLine, bullets } = parseOpmetBullets(raw);
    const strippedPlain = stripWxSearchPreamble(raw);
    return { airportLine, bullets, strippedPlain };
  }, [cachedWeather?.weather]);

  useEffect(() => {
    fetch("/api/user/preferences")
      .then((res) => res.json())
      .then((data) => {
        if (data.preferences) {
          const p = data.preferences;
          setNotifPrefs((prev) => ({
            ...prev,
            notify_enabled: p.notify_enabled ?? prev.notify_enabled,
            notify_search_start: p.notify_search_start ?? prev.notify_search_start,
            notify_search_end: p.notify_search_end ?? prev.notify_search_end,
            notify_notam: p.notify_notam ?? prev.notify_notam,
            notify_aip: p.notify_aip ?? prev.notify_aip,
            notify_gen: p.notify_gen ?? prev.notify_gen,
          }));
        }
      })
      .catch(() => {});
  }, []);

  const requestSyncNotams = useCallback((icao: string) => {
    setSyncRequestedIcao(icao);
  }, []);

  const requestSyncWeather = useCallback((icao: string) => {
    setWeatherSyncRequestedIcao(icao);
  }, []);

  const openCaptchaNoVncPopup = useCallback(async (icao: string | null) => {
    if (!icao) return;
    const country = (getCaptchaCountryByIcao(icao) || "").toLowerCase();
    if (!country) return;

    const popup = window.open("about:blank", `captcha-${country}-${Date.now()}`, "popup=yes,width=1040,height=820,resizable=yes");
    if (!popup) {
      setError("Popup blocked. Allow popups for this site to continue captcha verification.");
      return;
    }

    const endpoint =
      country === "lithuania" ? "/api/lithuania-hitl-vnc" : "/api/blocked-hitl-vnc";
    const payload =
      country === "lithuania"
        ? { action: "start" }
        : { action: "start", country };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(
        () => ({} as { popupUrl?: string; sessionId?: string; error?: string; detail?: string }),
      );
      if (!res.ok || !data.popupUrl) {
        popup.close();
        const msg = data.error || data.detail || "Failed to start noVNC captcha session.";
        setError(msg);
        return;
      }
      popup.location.href = buildCaptchaViewerUrl(country, String(data.popupUrl), String(data.sessionId || ""));
    } catch (err) {
      popup.close();
      setError(err instanceof Error ? err.message : "Failed to start noVNC captcha session.");
    }
  }, []);

  const requestSyncAipEad = useCallback(async (icao: string) => {
    const captchaCountry = getCaptchaCountryByIcao(icao);
    if (captchaCountry && captchaConsentDismissed) {
      void openCaptchaNoVncPopup(icao);
      setAipEadSyncSteps(["Captcha verification required. Opened embedded noVNC viewer. Complete it, then run the country HITL scrape."]);
      return;
    }
    if (captchaCountry) {
      setPendingCaptchaIcao(icao);
    }
    const allow = await requestConsentForIcao(icao);
    if (!allow) {
      setPendingCaptchaIcao((prev) => (prev === icao ? null : prev));
      return;
    }
    const cachedAirport = aipEadCache[icao]?.airport;
    if (cachedAirport) {
      setAipEadSyncRequestedIcao(null);
      return;
    }
    setPendingCaptchaIcao((prev) => (prev === icao ? null : prev));
    setAipEadSyncRequestedIcao(icao);
  }, [aipEadCache, requestConsentForIcao, captchaConsentDismissed, openCaptchaNoVncPopup]);

  // Force re-sync (Phase 4): bypass every cache layer and refetch the AIP from
  // the live source. Reuses the exact SSE mechanism the page already uses
  // (GET /api/aip/<source>?icao=..&sync=1&stream=1&extract=0) with force=1 so
  // the sync worker overwrites the stored JSON/PDF. On failure the previous
  // cached document stays on screen and a loud banner shows the real error.
  const forceResyncAip = useCallback(async (icao: string) => {
    if (isUsaAipIcao(icao)) return; // USA is a static PDF set — no live sync
    if (resyncInFlightRef.current.has(icao)) return; // double-click race guard (sync check)
    resyncInFlightRef.current.add(icao);

    const previousEntry = aipEadCache[icao];
    const previousCachedAt = previousEntry?.updatedAt ?? null;
    const previousCacheMeta = previousEntry?.cache ?? null;

    setResyncingIcao(icao);
    setResyncError((prev) => {
      if (!(icao in prev)) return prev;
      const next = { ...prev };
      delete next[icao];
      return next;
    });
    aipEadInFlightRef.current.add(icao); // block the regular sync effect for this icao
    setAipEadLoadingIcao(icao);
    setAipEadSyncingIcao(icao);
    setAipSyncStartedAt(Date.now());
    setAipEadSyncSteps(["Refetching from source… (cache bypassed)"]);
    updateStage(icao, "aip", "running", "Refetching from source…");

    const aipApiBase = isAsecnaIcao(icao)
      ? "/api/aip/asecna"
      : isBahrainScraperIcao(icao, viewingAirport)
        ? "/api/aip/scraper"
        : "/api/aip/ead";
    // extract=0: the re-sync refetches the DOCUMENT from the source. AI
    // extraction is a retired feature (the tab was removed) and the worker's
    // extract path still wants an Anthropic key — requesting it made the
    // button fail. PDF-first, exactly like the normal sync flow.
    const url = `${aipApiBase}?icao=${encodeURIComponent(icao)}&sync=1&stream=1&extract=0&force=1&_t=${Date.now()}`;
    const controller = beginRequest(`aip-resync-${icao}`);

    let settled = false;
    const fail = (msg: string) => {
      settled = true;
      // LOUD failure: persistent banner with the source's real error text.
      // Do NOT touch aipEadCache — the previous cached copy stays displayed.
      setResyncError((prev) => ({ ...prev, [icao]: { message: msg, cachedAt: previousCachedAt } }));
      updateStage(icao, "aip", "error", msg);
    };

    try {
      const res = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: string; code?: number };
        fail(formatAipSyncError(data));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const events = buf.split(/\n\n/);
          buf = events.pop() ?? "";
          for (const event of events) {
            const dataLine = event.split("\n").find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            let data: {
              step?: string;
              done?: boolean;
              error?: string;
              detail?: string;
              code?: number;
              airports?: unknown[];
              updatedAt?: string | null;
              pdfReady?: boolean;
            };
            try {
              data = JSON.parse(dataLine.slice(6));
            } catch {
              continue;
            }
            if (data.pdfReady) {
              setAipPdfReady((prev) => ({ ...prev, [icao]: true }));
              setAipPdfExistsOnServer((prev) => ({ ...prev, [icao]: true }));
            }
            if (data.step) {
              const step = data.step;
              setAipEadSyncSteps((prev) => [...prev, step]);
              updateStage(icao, "aip", "running", step);
            } else if (data.done) {
              // extract=0: the done event carries no airports — success means
              // the DOCUMENT was refetched. Keep whatever extract data the
              // cache already holds; refresh updatedAt so the "Cached …" line
              // moves. (If a worker still sends airports, use them.)
              const updatedAt = typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString();
              let freshAirport: ReturnType<typeof mapExtractedRowToAirport> | null = null;
              if (Array.isArray(data.airports) && data.airports.length > 0) {
                const list = data.airports as ExtractedAirportRow[];
                const match = pickExtractedAirportRow(list, icao);
                const fallbackCountry = isAsecnaIcao(icao)
                  ? (viewingAirport?.country || "ASECNA")
                  : isBahrainScraperIcao(icao, viewingAirport)
                    ? (viewingAirport?.country || "Scraper")
                  : isRussiaIcao(icao)
                    ? "Russia"
                    : "EAD (EU AIP)";
                freshAirport = mapExtractedRowToAirport(match, icao, fallbackCountry);
              }
              setAipEadCache((c) => ({
                ...c,
                [icao]: {
                  airport: freshAirport ?? c[icao]?.airport ?? null,
                  error: null,
                  updatedAt,
                  cache: previousCacheMeta,
                },
              }));
              setAipPdfReady((prev) => ({ ...prev, [icao]: true }));
              setAipPdfExistsOnServer((prev) => ({ ...prev, [icao]: true }));
              settled = true;
              updateStage(icao, "aip", "done", "AIP re-synced from source");
              sendNotification("aip", "AIP re-synced", `${icao}`, notifPrefs);
              // EAD route: refresh the "Cached … expires …" line from the
              // server's REAL TTL (cache.ttlMs). meta=1 is a pure storage read
              // — never an external request.
              if (aipApiBase === "/api/aip/ead") {
                fetch(`/api/aip/ead?icao=${encodeURIComponent(icao)}&meta=1&_t=${Date.now()}`, { cache: "no-store" })
                  .then((r) => (r.ok ? r.json() : null))
                  .then((meta: { updatedAt?: string | null; cache?: { ttlMs?: number; staleAfterMs?: number } } | null) => {
                    if (!meta?.cache?.ttlMs || !meta.updatedAt) return;
                    setAipEadCache((c) => {
                      const entry = c[icao];
                      if (!entry) return c;
                      return { ...c, [icao]: { ...entry, updatedAt: meta.updatedAt ?? entry.updatedAt, cache: meta.cache ?? entry.cache } };
                    });
                  })
                  .catch(() => {});
              }
              return;
            } else if (data.error) {
              fail(formatAipSyncError(data));
              return;
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
      if (!settled) {
        fail("Sync stream ended without a result from the source.");
      }
    } catch (err) {
      if (isAbortError(err)) {
        updateStage(icao, "aip", "cancelled", "AIP re-sync cancelled");
        return;
      }
      fail(`Re-sync request failed: ${(err as Error | undefined)?.message ?? "network error"}`);
    } finally {
      finishRequest(`aip-resync-${icao}`, controller);
      resyncInFlightRef.current.delete(icao);
      aipEadInFlightRef.current.delete(icao);
      setResyncingIcao((prev) => (prev === icao ? null : prev));
      setAipEadLoadingIcao((prev) => (prev === icao ? null : prev));
      setAipEadSyncingIcao((prev) => (prev === icao ? null : prev));
      setAipSyncStartedAt(null);
      setAipPdfSlowIcao((prev) => (prev === icao ? null : prev));
      setAipEadSyncSteps([]);
    }
  }, [aipEadCache, viewingAirport, notifPrefs, updateStage, beginRequest, finishRequest, isAbortError]);

  const handleCaptchaConsentContinue = useCallback(() => {
    void openCaptchaNoVncPopup(pendingCaptchaIcao);
    setPendingCaptchaIcao(null);
    closeCaptchaConsentDialog();
  }, [closeCaptchaConsentDialog, openCaptchaNoVncPopup, pendingCaptchaIcao]);

  const handleCaptchaConsentDontShowAgain = useCallback(() => {
    void openCaptchaNoVncPopup(pendingCaptchaIcao);
    setPendingCaptchaIcao(null);
    void dontShowCaptchaConsentAgain();
    closeCaptchaConsentDialog();
  }, [closeCaptchaConsentDialog, dontShowCaptchaConsentAgain, openCaptchaNoVncPopup, pendingCaptchaIcao]);

  const handleCaptchaConsentClose = useCallback(() => {
    setPendingCaptchaIcao(null);
    closeCaptchaConsentDialog();
  }, [closeCaptchaConsentDialog]);

  // deliver "download" saves the file (the GEN 1.2 PDF item in the ⋯ menu); "view" hands it to the GEN tab of the
  // document viewer as a blob URL. Same sync and source in both cases.
  const downloadGenPdfWithSync = useCallback(async (icao: string, forceAsecna = false, forceScraper = false, deliver: "download" | "view" = "download") => {
    const allow = await requestConsentForIcao(icao);
    if (!allow) return;
    const hand = (blob: Blob, filename: string) => {
      const url = URL.createObjectURL(blob);
      if (deliver === "view") {
        setGenView((prev) => {
          if (prev[icao]) URL.revokeObjectURL(prev[icao].url);
          return { ...prev, [icao]: { url, filename } };
        });
        return;
      }
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    };

    if (isUsaAipIcao(icao)) {
      setGenPdfDownloadError(null);
      setGenPdfDownloading(true);
      setGenSyncingPrefix("US");
      setGenSyncSteps(["Fetching USA GEN 1.2 PDF…"]);
      try {
        const pdfRes = await fetch(`/api/aip/usa/gen/pdf?icao=${encodeURIComponent(icao)}`, {
          cache: "no-store",
        });
        if (!pdfRes.ok) {
          const data = await pdfRes.json().catch(() => ({} as { detail?: string; error?: string }));
          throw new Error(data.detail || data.error || "Failed to load USA GEN PDF");
        }
        hand(await pdfRes.blob(), `${icao}_USA_GEN_1.2.pdf`);
        setGenSyncSteps((prev) => [...prev, deliver === "view" ? "Ready." : "Download ready."]);
      } catch (err) {
        setGenPdfDownloadError(
          err instanceof Error ? err.message : "USA GEN PDF download failed",
        );
      } finally {
        setGenPdfDownloading(false);
        setGenSyncingPrefix(null);
      }
      return;
    }

    if (forceScraper || isBahrainScraperIcao(icao, null)) {
      setGenPdfDownloadError(null);
      setGenPdfDownloading(true);
      setGenSyncingPrefix("OB");
      setGenSyncSteps(["Fetching scraper GEN 1.2 PDF…"]);
      try {
        const pdfRes = await fetch(`/api/aip/scraper/gen/pdf?icao=${encodeURIComponent(icao)}`, {
          cache: "no-store",
        });
        if (!pdfRes.ok) {
          const data = await pdfRes.json().catch(() => ({} as { detail?: string; error?: string }));
          throw new Error(data.detail || data.error || "Failed to load scraper GEN PDF");
        }
        hand(await pdfRes.blob(), `${icao}_SCRAPER_GEN_1.2.pdf`);
        setGenSyncSteps((prev) => [...prev, deliver === "view" ? "Ready." : "Download ready."]);
      } catch (err) {
        setGenPdfDownloadError(
          err instanceof Error ? err.message : "Scraper GEN PDF download failed",
        );
      } finally {
        setGenPdfDownloading(false);
        setGenSyncingPrefix(null);
      }
      return;
    }

    const useAsecnaGen = forceAsecna || isAsecnaIcao(icao);
    if (useAsecnaGen) {
      setGenPdfDownloadError(null);
      setGenPdfDownloading(true);
      setGenSyncingPrefix("AS");
      setGenSyncSteps(["Fetching ASECNA GEN 1.2 PDF…"]);
      try {
        const pdfRes = await fetch(`/api/aip/asecna/gen/pdf?icao=${encodeURIComponent(icao)}`, {
          cache: "no-store",
        });
        if (!pdfRes.ok) {
          const data = await pdfRes.json().catch(() => ({} as { detail?: string; error?: string }));
          throw new Error(data.detail || data.error || "Failed to load ASECNA GEN PDF");
        }
        hand(await pdfRes.blob(), `${icao}_ASECNA_GEN_1.2.pdf`);
        setGenSyncSteps((prev) => [...prev, deliver === "view" ? "Ready." : "Download ready."]);
      } catch (err) {
        setGenPdfDownloadError(
          err instanceof Error ? err.message : "ASECNA GEN PDF download failed",
        );
      } finally {
        setGenPdfDownloading(false);
        setGenSyncingPrefix(null);
      }
      return;
    }

    const prefix = resolveGenPrefix(icao);
    setGenPdfDownloadError(null);
    setGenPdfDownloading(true);
    setGenSyncingPrefix(prefix);
    setGenSyncSteps(["Checking GEN PDF cache…"]);
    try {
      if (!genPdfExistsOnServer[prefix]) {
        const res = await fetch(`/api/aip/gen/sync?icao=${encodeURIComponent(icao)}&stream=1`, { cache: "no-store" });
        if (!res.ok || !res.body) {
          throw new Error("GEN sync failed");
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const events = buf.split(/\n\n/);
            buf = events.pop() ?? "";
            for (const event of events) {
              const dataLine = event.split("\n").find((l) => l.startsWith("data: "));
              if (!dataLine) continue;
              try {
                const data = JSON.parse(dataLine.slice(6)) as { step?: string; done?: boolean; error?: string; pdfReady?: boolean };
                if (typeof data.step === "string") {
                  setGenSyncSteps((prev) => [...prev, data.step!]);
                }
                if (data.pdfReady) {
                  setGenPdfExistsOnServer((prev) => ({ ...prev, [prefix]: true }));
                }
                if (data.error) {
                  throw new Error(data.error);
                }
                if (data.done) {
                  setGenPdfExistsOnServer((prev) => ({ ...prev, [prefix]: true }));
                }
              } catch (e) {
                if (e instanceof Error) throw e;
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      }

      setGenSyncSteps((prev) => [...prev, deliver === "view" ? "Opening the GEN PDF…" : "Preparing GEN PDF download…"]);
      const pdfRes = await fetch(`/api/aip/gen/pdf?icao=${encodeURIComponent(icao)}`, { cache: "no-store" });
      if (!pdfRes.ok) {
        const data = await pdfRes.json().catch(() => ({} as { detail?: string; error?: string }));
        throw new Error(data.detail || data.error || "Failed to load GEN PDF");
      }
      hand(await pdfRes.blob(), `${prefix}_GEN_1.2.pdf`);
      setGenSyncSteps((prev) => [...prev, deliver === "view" ? "Ready." : "Download ready."]);
    } catch (err) {
      setGenPdfDownloadError(err instanceof Error ? err.message : "GEN PDF download failed");
    } finally {
      setGenPdfDownloading(false);
      setGenSyncingPrefix(null);
    }
  }, [genPdfExistsOnServer, requestConsentForIcao]);

  // Fetch synced AIP (EAD + Russia). Default flow is PDF-first (extract=0).
  // AI extraction runs only when explicitly requested (extract=1).
  useEffect(() => {
    if (!aipSyncStartedAt) {
      setAipSyncElapsedSec(0);
      return;
    }
    const tick = () => setAipSyncElapsedSec(Math.max(0, Math.floor((Date.now() - aipSyncStartedAt) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [aipSyncStartedAt]);

  useEffect(() => {
    const icao = viewingAirport?.icao ?? null;
    if (!icao || !supportsSyncedAipIcao(icao)) return;
    if (aipEadInFlightRef.current.has(icao)) return;
    const cacheEntry = aipEadCache[icao];
    const hasCacheEntry = icao in aipEadCache;
    const hasExtractCache = Boolean(cacheEntry?.airport);
    const syncRequested = aipEadSyncRequestedIcao === icao;
    if (syncRequested && hasExtractCache) {
      setAipEadSyncRequestedIcao((prev) => (prev === icao ? null : prev));
      return;
    }

    const shouldExtractSync = syncRequested && !hasExtractCache;
    const shouldPdfSync =
      !syncRequested &&
      !hasCacheEntry &&
      !aipPdfReady[icao] &&
      aipPdfExistsOnServer[icao] === false;

    // Wait for HEAD probe to complete before deciding sync path.
    // Without this guard, a premature non-sync fetch populates aipEadCache
    // and the subsequent shouldPdfSync check is blocked by hasCacheEntry=true.
    if (!hasCacheEntry && !syncRequested && aipPdfExistsOnServer[icao] === undefined) return;

    const needsCaptchaConsent = Boolean(getCaptchaCountryByIcao(icao));
    if (needsCaptchaConsent && !captchaConsentDismissed && !syncRequested) return;

    if (hasCacheEntry && !syncRequested && !shouldPdfSync) return;
    const doSync = shouldExtractSync || shouldPdfSync;
    const useStream = shouldExtractSync;
    let slowPdfTimer: number | null = null;
    aipEadInFlightRef.current.add(icao);
    setAipEadLoadingIcao(icao);
    if (doSync) {
      setAipEadSyncingIcao(icao);
      setAipSyncStartedAt(Date.now());
      setAipEadSyncSteps([
        shouldExtractSync
          ? "Connecting to AIP sync server (live stream)…"
          : "Checking cache and PDF status…",
      ]);
      if (shouldPdfSync) {
        setAipPdfSlowIcao((prev) => (prev === icao ? prev : null));
        slowPdfTimer = window.setTimeout(() => {
          setAipPdfSlowIcao(icao);
        }, 10_000);
      } else {
        setAipPdfSlowIcao((prev) => (prev === icao ? null : prev));
      }
      updateStage(
        icao,
        "aip",
        "running",
        shouldExtractSync ? "Extracting AIP data…" : "Fetching AIP PDF…"
      );
    }

    const syncParams = doSync
      ? `&sync=1${useStream ? "&stream=1" : ""}&extract=${shouldExtractSync ? "1" : "0"}`
      : "";
    const aipApiBase = isAsecnaIcao(icao)
      ? "/api/aip/asecna"
      : isBahrainScraperIcao(icao, viewingAirport)
        ? "/api/aip/scraper"
        : isUsaAipIcao(icao)
          ? "/api/aip/usa"
        : "/api/aip/ead";
    const url = `${aipApiBase}?icao=${encodeURIComponent(icao)}${syncParams}&_t=${Date.now()}`;
    const controller = beginRequest(`aip-${icao}`);
    fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        if (doSync && useStream && res.ok && res.body) {
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              const events = buf.split(/\n\n/);
              buf = events.pop() ?? "";
              for (const event of events) {
                const dataLine = event.split("\n").find((l) => l.startsWith("data: "));
                if (!dataLine) continue;
                try {
                  const data = JSON.parse(dataLine.slice(6)) as {
                    step?: string;
                    done?: boolean;
                    error?: string;
                    detail?: string;
                    code?: number;
                    airports?: unknown[];
                    pdfReady?: boolean;
                  };
                  if (data.pdfReady) {
                    setAipPdfReady((prev) => ({ ...prev, [icao]: true }));
                  }
                  if (data.step) {
                    const step = data.step;
                    setAipEadSyncSteps((prev) => [...prev, step]);
                    updateStage(icao, "aip", "running", step);
                  } else if (data.done && Array.isArray(data.airports)) {
                    const list = data.airports as ExtractedAirportRow[];
                    const updatedAt = new Date().toISOString();
                    const match = pickExtractedAirportRow(list, icao);
                    const fallbackCountry = isAsecnaIcao(icao)
                      ? (viewingAirport?.country || "ASECNA")
                      : isBahrainScraperIcao(icao, viewingAirport)
                        ? (viewingAirport?.country || "Scraper")
                      : isRussiaIcao(icao)
                        ? "Russia"
                        : "EAD (EU AIP)";
                    const airport = mapExtractedRowToAirport(match, icao, fallbackCountry);
                    setAipEadCache((c) => ({ ...c, [icao]: { airport, error: null, updatedAt } }));
                    setAipPdfReady((prev) => ({ ...prev, [icao]: true }));
                    setAipEadSyncRequestedIcao((prev) => (prev === icao ? null : prev));
                    setAipEadSyncSteps([]);
                    updateStage(icao, "aip", "done", "AIP retrieved");
                    sendNotification("aip", "AIP retrieved", `${icao}`, notifPrefs);
                    return;
                  } else if (data.error) {
                    const errMsg = formatAipSyncError(data);
                    setAipEadCache((c) => ({
                      ...c,
                      [icao]: { airport: null, error: errMsg, updatedAt: null },
                    }));
                    setAipEadSyncRequestedIcao((prev) => (prev === icao ? null : prev));
                    updateStage(icao, "aip", "error", errMsg);
                    return;
                  }
                } catch (_) {}
              }
            }
          } finally {
            reader.releaseLock();
          }
          return;
        }
        const data = await res.json().catch(() => ({})) as {
          error?: string;
          detail?: string;
          code?: number;
          airports?: unknown[];
          updatedAt?: string | null;
          cache?: { served?: boolean; stale?: boolean; ageMs?: number | null; refreshStarted?: boolean; ttlMs?: number; staleAfterMs?: number };
        };
        if (!res.ok) {
          const msg = formatAipSyncError(data);
          setAipEadCache((c) => ({ ...c, [icao]: { airport: null, error: msg, updatedAt: null } }));
          setAipEadSyncRequestedIcao((prev) => (prev === icao ? null : prev));
          updateStage(icao, "aip", "error", msg);
          return;
        }
        const list = (data.airports ?? []) as ExtractedAirportRow[];
        const updatedAt = data.updatedAt ?? new Date().toISOString();
        const match = pickExtractedAirportRow(list, icao);
        const fallbackCountry = isAsecnaIcao(icao)
          ? (viewingAirport?.country || "ASECNA")
          : isBahrainScraperIcao(icao, viewingAirport)
            ? (viewingAirport?.country || "Scraper")
          : isRussiaIcao(icao)
            ? "Russia"
            : "EAD (EU AIP)";
        const airport = mapExtractedRowToAirport(match, icao, fallbackCountry);
        setAipEadCache((c) => ({ ...c, [icao]: { airport, error: null, updatedAt, cache: data.cache ?? null } }));
        setAipPdfReady((prev) => ({ ...prev, [icao]: true }));
        setAipEadSyncRequestedIcao((prev) => (prev === icao ? null : prev));
        if (doSync && !useStream && data.cache?.served) {
          const ageSec = typeof data.cache.ageMs === "number" ? Math.max(0, Math.round(data.cache.ageMs / 1000)) : null;
          const live = data.cache.stale && data.cache.refreshStarted
            ? " Background refresh started."
            : data.cache.stale
              ? " Cached data may be stale."
              : "";
          const msg = `Served cached AIP${ageSec !== null ? ` (${ageSec}s old).` : "."}${live}`;
          setAipEadSyncSteps((prev) => [...prev, msg]);
          updateStage(icao, "aip", "running", msg);
        }
        if (shouldExtractSync) {
          updateStage(icao, "aip", "done", "AIP retrieved");
          sendNotification("aip", "AIP retrieved", `${icao}`, notifPrefs);
        } else if (doSync) {
          updateStage(icao, "aip", "done", "AIP PDF ready");
        }
      })
      .catch((err) => {
        if (isAbortError(err)) {
          updateStage(icao, "aip", "cancelled", "AIP sync cancelled");
          return;
        }
        setAipEadCache((c) => ({ ...c, [icao]: { airport: null, error: `Failed to load AIP: ${err?.message ?? "network error"}`, updatedAt: null } }));
        setAipEadSyncRequestedIcao((prev) => (prev === icao ? null : prev));
        updateStage(icao, "aip", "error", "AIP sync failed");
      })
      .finally(() => {
        finishRequest(`aip-${icao}`, controller);
        if (slowPdfTimer != null) window.clearTimeout(slowPdfTimer);
        aipEadInFlightRef.current.delete(icao);
        setAipEadLoadingIcao((prev) => (prev === icao ? null : prev));
        setAipEadSyncingIcao((prev) => (prev === icao ? null : prev));
        setAipSyncStartedAt(null);
        setAipPdfSlowIcao((prev) => (prev === icao ? null : prev));
        setAipEadSyncSteps([]);
      });
  }, [
    viewingAirport?.icao,
    aipEadSyncRequestedIcao,
    aipEadCache,
    aipPdfReady,
    aipPdfExistsOnServer,
    notifPrefs,
    updateStage,
    searchParams,
    beginRequest,
    finishRequest,
    isAbortError,
    captchaConsentDismissed,
  ]);

  // Probe S3 for EAD PDF (enables download/viewer as soon as the file exists, without waiting for AI extract).
  useEffect(() => {
    const icao = viewingAirport?.icao ?? null;
    if (!icao || !supportsSyncedAipIcao(icao)) return;
    let cancelled = false;
    const pdfApiBase = isAsecnaIcao(icao)
      ? "/api/aip/asecna/pdf"
      : isBahrainScraperIcao(icao, viewingAirport)
        ? "/api/aip/scraper/pdf"
        : isUsaAipIcao(icao)
          ? "/api/aip/usa/pdf"
        : "/api/aip/ead/pdf";
    const controller = beginRequest(`aip-head-${icao}`);
    fetch(`${pdfApiBase}?icao=${encodeURIComponent(icao)}`, { method: "HEAD", signal: controller.signal })
      .then((r) => {
        if (cancelled) return;
        if (r.ok) setAipPdfExistsOnServer((c) => ({ ...c, [icao]: true }));
        else if (r.status === 404) setAipPdfExistsOnServer((c) => ({ ...c, [icao]: false }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      controller.abort();
      finishRequest(`aip-head-${icao}`, controller);
    };
  }, [viewingAirport?.icao, beginRequest, finishRequest]);

  // Fetch GEN (scraped GEN 1.2) when viewing any airport.
  // EAD + Russia use /api/aip/gen (sync-server-backed PDF cache),
  // other countries use /api/aip/gen-non-ead.
  useEffect(() => {
    if (MAIN_PAGE_DISABLE_GEN) return;
    const icao = viewingAirport?.icao ?? null;
    if (!icao) return;
    if (isAsecnaIcao(icao)) {
      const prefix = icao.slice(0, 2).toUpperCase();
      if (!(prefix in genCache)) {
        setGenCache((c) => ({
          ...c,
          [prefix]: {
            general: emptyGenPart(),
            nonScheduled: emptyGenPart(),
            privateFlights: emptyGenPart(),
            updatedAt: null,
          },
        }));
      }
      updateStage(icao, "gen", "done", "ASECNA GEN available via GEN PDF button");
      return;
    }
    const prefix = resolveGenPrefix(icao);
    if (prefix in genCache || genLoadingPrefix === prefix) return;
    setGenLoadingPrefix(prefix);
    const useSyncedGen = isEadIcao(icao) || isRussiaIcao(icao) || isAsecnaIcao(icao) || isBahrainScraperIcao(icao, viewingAirport) || isUsaAipIcao(icao);
    if (useSyncedGen) updateStage(icao, "gen", "running", "Loading GEN…");
    else updateStage(icao, "gen-non-ead", "running", "Rewriting non-EAD GEN…");
    const genUrl = useSyncedGen
      ? `/api/aip/gen?icao=${encodeURIComponent(icao)}`
      : `/api/aip/gen-non-ead?prefix=${encodeURIComponent(prefix)}`;
    const controller = beginRequest(`gen-${prefix}`);
    fetch(genUrl, { cache: "no-store", signal: controller.signal })
      .then((res) => res.json())
      .then((data: { general?: GenPart; nonScheduled?: GenPart; privateFlights?: GenPart; part4?: GenPart; updatedAt?: string | null }) => {
        const g = data.general && typeof data.general === "object" ? data.general : emptyGenPart();
        const ns = data.nonScheduled && typeof data.nonScheduled === "object" ? data.nonScheduled : emptyGenPart();
        const pf = (data.privateFlights && typeof data.privateFlights === "object" ? data.privateFlights : data.part4 && typeof data.part4 === "object" ? data.part4 : null) ?? emptyGenPart();
        setGenCache((c) => ({
          ...c,
          [prefix]: { general: g, nonScheduled: ns, privateFlights: pf, updatedAt: data.updatedAt ?? null },
        }));
        if (useSyncedGen) updateStage(icao, "gen", "done", "GEN retrieved");
        else {
          updateStage(icao, "gen-non-ead", "done", "GEN retrieved");
          sendNotification("gen", "GEN retrieved", `Prefix ${prefix}`, notifPrefs);
        }
      })
      .catch((err) => {
        if (isAbortError(err)) {
          if (useSyncedGen) updateStage(icao, "gen", "cancelled", "GEN cancelled");
          else updateStage(icao, "gen-non-ead", "cancelled", "GEN cancelled");
          return;
        }
        setGenCache((c) => ({ ...c, [prefix]: { general: emptyGenPart(), nonScheduled: emptyGenPart(), privateFlights: emptyGenPart(), updatedAt: null } }));
        if (useSyncedGen) updateStage(icao, "gen", "error", "GEN load failed");
        else updateStage(icao, "gen-non-ead", "error", "Non-EAD GEN load failed");
      })
      .finally(() => {
        finishRequest(`gen-${prefix}`, controller);
        setGenLoadingPrefix((p) => (p === prefix ? null : p));
      });
  }, [viewingAirport?.icao, genCache, genLoadingPrefix, notifPrefs, updateStage, beginRequest, finishRequest, isAbortError]);

  // Fetch NOTAMs when an airport is selected (search or browse). Load/sync even without coords so map + NOTAMs show after user initiates.
  useEffect(() => {
    const icao = viewingAirport?.icao ?? null;
    if (!icao) return;
    const fromBanner = searchParams.get("fromBanner") === "1";

    const hasCache = icao in notamsCache;
    const syncRequested = syncRequestedIcao === icao;
    if (hasCache && !syncRequested) return; // re-entering tab: use cached NOTAMs, do not scrape

    const isSync = fromBanner ? syncRequested : (syncRequested || !hasCache);
    setNotamsLoadingIcao(icao);
    if (isSync) {
      setNotamsSyncingIcao(icao);
      setNotamsSyncSteps([]);
      updateStage(icao, "notam", "running", "Loading NOTAMs…");
    }

    if (isSync) {
      // Stream sync: get progress steps from server, then final result
      const url = `/api/notams?icao=${encodeURIComponent(icao)}&sync=1&stream=1&_t=${Date.now()}`;
      const controller = beginRequest(`notam-${icao}`);
      fetch(url, { cache: "no-store", signal: controller.signal })
        .then(async (res) => {
          if (!res.ok || !res.body) {
            const text = await res.text();
            const data = (() => { try { return JSON.parse(text); } catch { return {}; } })();
            const msg = data.detail ? `${data.error ?? "Sync failed"}: ${data.detail}` : (data.error ?? (text || "Sync failed"));
            setNotamsCache((c) => ({ ...c, [icao]: { notams: [], error: msg, detail: data.detail, updatedAt: null } }));
            return;
          }
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              const events = buf.split(/\n\n/);
              buf = events.pop() ?? "";
              for (const event of events) {
                const dataLine = event.split("\n").find((l) => l.startsWith("data: "));
                if (!dataLine) continue;
                try {
                  const data = JSON.parse(dataLine.slice(6));
                  if (data.step) {
                    setNotamsSyncSteps((prev) => [...prev, data.step]);
                    updateStage(icao, "notam", "running", data.step);
                  } else if (data.done) {
                    setNotamsCache((c) => ({
                      ...c,
                      [icao]: { notams: data.notams ?? [], error: null, updatedAt: data.updatedAt ?? null },
                    }));
                    updateStage(icao, "notam", "done", "NOTAMs retrieved");
                    sendNotification("notam", "NOTAMs retrieved", `${icao}`, notifPrefs);
                    return;
                  } else if (data.error) {
                    setNotamsCache((c) => ({
                      ...c,
                      [icao]: { notams: [], error: data.error + (data.detail ? ": " + data.detail : ""), updatedAt: null },
                    }));
                    updateStage(icao, "notam", "error", data.error);
                    return;
                  }
                } catch (_) {}
              }
            }
          } finally {
            reader.releaseLock();
          }
        })
        .catch((err) => {
          if (isAbortError(err)) {
            updateStage(icao, "notam", "cancelled", "NOTAM sync cancelled");
            return;
          }
          setNotamsCache((c) => ({
            ...c,
            [icao]: { notams: [], error: `Failed to load NOTAMs: ${err?.message ?? "network or server error"}`, updatedAt: null },
          }));
          updateStage(icao, "notam", "error", "NOTAM sync failed");
        })
        .finally(() => {
          finishRequest(`notam-${icao}`, controller);
          setNotamsLoadingIcao(null);
          setNotamsSyncingIcao(null);
          setNotamsSyncSteps([]);
          setSyncRequestedIcao((prev) => (prev === icao ? null : prev));
        });
      return;
    }

    // Non-sync: plain JSON fetch
    const url = `/api/notams?icao=${encodeURIComponent(icao)}`;
    const controller = beginRequest(`notam-${icao}`);
    fetch(url, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          const msg = data.detail ? `${data.error}: ${data.detail}` : (data.error ?? "Failed");
          setNotamsCache((c) => ({ ...c, [icao]: { notams: [], error: msg, detail: data.detail, updatedAt: null } }));
          updateStage(icao, "notam", "error", msg);
        } else {
          setNotamsCache((c) => ({ ...c, [icao]: { notams: data.notams ?? [], error: null, updatedAt: data.updatedAt ?? null } }));
          updateStage(icao, "notam", "done", "NOTAMs loaded");
        }
      })
      .catch((err) => {
        if (isAbortError(err)) {
          updateStage(icao, "notam", "cancelled", "NOTAM load cancelled");
          return;
        }
        setNotamsCache((c) => ({ ...c, [icao]: { notams: [], error: `Failed to load NOTAMs: ${err?.message ?? "network or server error"}`, updatedAt: null } }));
        updateStage(icao, "notam", "error", "NOTAM load failed");
      })
      .finally(() => {
        finishRequest(`notam-${icao}`, controller);
        setNotamsLoadingIcao(null);
        setSyncRequestedIcao((prev) => (prev === icao ? null : prev));
      });
  }, [viewingAirport?.icao, syncRequestedIcao, notamsCache, notifPrefs, updateStage, searchParams, beginRequest, finishRequest, isAbortError]);

  useEffect(() => {
    const icao = viewingAirport?.icao ?? null;
    if (!icao) return;
    const fromBanner = searchParams.get("fromBanner") === "1";
    const hasCache = icao in weatherCache;
    const syncRequested = weatherSyncRequestedIcao === icao;
    if (hasCache && !syncRequested) return;

    const isSync = fromBanner ? syncRequested : (syncRequested || !hasCache);
    setWeatherLoadingIcao(icao);
    if (isSync) {
      setWeatherSyncingIcao(icao);
      setWeatherSyncSteps([]);
      updateStage(icao, "weather", "running", "Loading weather…");
    }

    if (isSync) {
      const url = `/api/weather?icao=${encodeURIComponent(icao)}&sync=1&stream=1&_t=${Date.now()}`;
      const controller = beginRequest(`weather-${icao}`);
      fetch(url, { cache: "no-store", signal: controller.signal })
        .then(async (res) => {
          if (!res.ok || !res.body) {
            const text = await res.text();
            const data = (() => { try { return JSON.parse(text); } catch { return {}; } })();
            const msg = data.detail ? `${data.error ?? "Sync failed"}: ${data.detail}` : (data.error ?? (text || "Sync failed"));
            setWeatherCache((c) => ({ ...c, [icao]: { weather: "", error: msg, updatedAt: null } }));
            return;
          }
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              const events = buf.split(/\n\n/);
              buf = events.pop() ?? "";
              for (const event of events) {
                const dataLine = event.split("\n").find((l) => l.startsWith("data: "));
                if (!dataLine) continue;
                try {
                  const data = JSON.parse(dataLine.slice(6));
                  if (data.step) {
                    setWeatherSyncSteps((prev) => [...prev, data.step]);
                    updateStage(icao, "weather", "running", data.step);
                  } else if (data.done) {
                    setWeatherCache((c) => ({
                      ...c,
                      [icao]: { weather: data.weather ?? "", error: null, updatedAt: data.updatedAt ?? null },
                    }));
                    updateStage(icao, "weather", "done", "Weather retrieved");
                    return;
                  } else if (data.error) {
                    setWeatherCache((c) => ({
                      ...c,
                      [icao]: { weather: "", error: data.error + (data.detail ? ": " + data.detail : ""), updatedAt: null },
                    }));
                    updateStage(icao, "weather", "error", data.error);
                    return;
                  }
                } catch (_) {}
              }
            }
          } finally {
            reader.releaseLock();
          }
        })
        .catch((err) => {
          if (isAbortError(err)) {
            updateStage(icao, "weather", "cancelled", "Weather sync cancelled");
            return;
          }
          setWeatherCache((c) => ({
            ...c,
            [icao]: { weather: "", error: `Failed to load weather: ${err?.message ?? "network or server error"}`, updatedAt: null },
          }));
          updateStage(icao, "weather", "error", "Weather sync failed");
        })
        .finally(() => {
          finishRequest(`weather-${icao}`, controller);
          setWeatherLoadingIcao(null);
          setWeatherSyncingIcao(null);
          setWeatherSyncSteps([]);
          setWeatherSyncRequestedIcao((prev) => (prev === icao ? null : prev));
        });
      return;
    }

    const controller = beginRequest(`weather-${icao}`);
    fetch(`/api/weather?icao=${encodeURIComponent(icao)}`, { cache: "no-store", signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setWeatherCache((c) => ({ ...c, [icao]: { weather: "", error: data.error, updatedAt: null } }));
          updateStage(icao, "weather", "error", data.error);
        } else {
          setWeatherCache((c) => ({ ...c, [icao]: { weather: data.weather ?? "", error: null, updatedAt: data.updatedAt ?? null } }));
          updateStage(icao, "weather", "done", "Weather loaded");
        }
      })
      .catch((err) => {
        if (isAbortError(err)) {
          updateStage(icao, "weather", "cancelled", "Weather load cancelled");
          return;
        }
        setWeatherCache((c) => ({ ...c, [icao]: { weather: "", error: `Failed to load weather: ${err?.message ?? "network or server error"}`, updatedAt: null } }));
        updateStage(icao, "weather", "error", "Weather load failed");
      })
      .finally(() => {
        finishRequest(`weather-${icao}`, controller);
        setWeatherLoadingIcao(null);
        setWeatherSyncRequestedIcao((prev) => (prev === icao ? null : prev));
      });
  }, [viewingAirport?.icao, weatherSyncRequestedIcao, weatherCache, updateStage, searchParams, beginRequest, finishRequest, isAbortError]);

  useEffect(() => {
    if (notamsLoadingIcao || aipEadLoadingIcao || genLoadingPrefix) return;
    const finishable = bgList.filter((item) => !item.done && (item.stages.airport === "done" || item.stages.airport === "error"));
    for (const item of finishable) {
      finishBackground(item.icao);
    }
  }, [bgList, notamsLoadingIcao, aipEadLoadingIcao, genLoadingPrefix, finishBackground]);

  // ── Render (portal redesign, stage 3 — "Page Airport", §3.9) ─────────────────────────────────────────────────────
  // Header: the airport on one line, where it is on the next, the actions on the right. Below, the document viewer
  // (AD 2 and GEN tabs) beside NOTAMs and weather; each of those loads and fails on its own.
  const [docTab, setDocTab] = useState<"ad2" | "gen">("ad2");
  useEffect(() => setDocTab("ad2"), [viewingAirport?.icao]);

  const pdfRouteFor = (icao: string, a: AIPAirport | null) =>
    isAsecnaIcao(icao) ? "/api/aip/asecna/pdf" : isBahrainScraperIcao(icao, a) ? "/api/aip/scraper/pdf" : isUsaAipIcao(icao) ? "/api/aip/usa/pdf" : "/api/aip/ead/pdf";
  const sourceTag = (icao: string, a: AIPAirport | null) =>
    isAsecnaIcao(icao) ? "ASECNA" : isUsaAipIcao(icao) ? "FAA" : isBahrainScraperIcao(icao, a) ? "Web AIP" : isRussiaIcao(icao) ? "CAICA" : "EAD";
  const genApplicable = (a: AIPAirport) =>
    (isEadIcao(a.icao) || isRussiaIcao(a.icao) || isAsecnaIcao(a.icao) || isBahrainScraperIcao(a.icao, a) || isUsaAipIcao(a.icao)) &&
    !isJapanScraperIcao(a.icao) && !(isAsecnaAirport(a) && !hasAsecnaGen12(a.icao));
  const webAipFor = (a: AIPAirport) =>
    a.webAipUrl || getAsecnaAirportByIcao(a.icao)?.webAipUrl || getScraperWebAipUrlByCountryOrIcao(a.country, a.icao) || getEadWebAipUrlForAirport(a) || (isUsaAipIcao(a.icao) ? USA_WEB_AIP_URL : null);
  const utc = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}Z`;

  // The GEN tab opens a GEN 1.2 PDF already in storage by itself; one that has to be fetched from the source waits
  // for "Get GEN 1.2" (it is an outside request and can be slow).
  const genPrefixNow = viewingAirport && !isAsecnaIcao(viewingAirport.icao) && !isUsaAipIcao(viewingAirport.icao) && !isBahrainScraperIcao(viewingAirport.icao, viewingAirport) ? resolveGenPrefix(viewingAirport.icao) : null;
  useEffect(() => {
    const a = viewingAirport;
    if (!a || docTab !== "gen" || genView[a.icao] || genPdfDownloading || genPdfDownloadError) return;
    if (genPrefixNow && genPdfExistsOnServer[genPrefixNow]) void downloadGenPdfWithSync(a.icao, isAsecnaAirport(a), isBahrainScraperAirport(a), "view");
  }, [docTab, viewingAirport, genView, genPdfDownloading, genPdfDownloadError, genPrefixNow, genPdfExistsOnServer, downloadGenPdfWithSync]);

  async function downloadAd2(a: AIPAirport) {
    const icao = a.icao;
    if (getCaptchaCountryByIcao(icao)) {
      setPdfDownloadError(null);
      setAipEadSyncSteps(["Captcha verification required. Opened embedded noVNC viewer. Complete it before downloading this AIP PDF."]);
      void openCaptchaNoVncPopup(icao);
      return;
    }
    const pushPdfStep = (step: string) => setAipEadSyncSteps((prev) => (prev[prev.length - 1] === step ? prev : [...prev, step]));
    setPdfDownloadError(null);
    setPdfDownloading(true);
    setAipEadSyncSteps(["Checking PDF cache on server…"]);
    let slowHintTimer: number | null = null;
    try {
      const pdfRoute = isAsecnaIcao(icao) ? "/api/aip/asecna/pdf" : isBahrainScraperIcao(icao, a) ? "/api/aip/scraper/pdf" : "/api/aip/ead/pdf";
      const pdfSource = isAsecnaIcao(icao) ? "asecna" : isBahrainScraperIcao(icao, a) ? "scraper" : isUsaAipIcao(icao) ? "usa" : "ead";
      const estimateData = await fetch(`/api/aip/download-estimate?icao=${encodeURIComponent(icao)}&source=${pdfSource}`, { cache: "no-store" })
        .then((r) => r.json()).catch(() => null) as { estimate: number | null } | null;
      const estimateMs = estimateData?.estimate ?? null;
      const fmtEstimate = (ms: number) => {
        if (ms < 60_000) return `~${Math.round(ms / 1000)}s`;
        const m = Math.floor(ms / 60_000);
        const s = Math.round((ms % 60_000) / 1000);
        return s > 0 ? `~${m}m ${s}s` : `~${m}m`;
      };
      const headRes = await fetch(`${pdfRoute}?icao=${encodeURIComponent(icao)}`, { method: "HEAD", cache: "no-store" }).catch(() => null);
      pushPdfStep(headRes?.ok ? "Cached PDF found in storage." : "PDF missing in cache. Triggering source download…");
      slowHintTimer = window.setTimeout(() => pushPdfStep("Still fetching PDF from source… this may take up to 1-2 minutes."), 12000);
      pushPdfStep(estimateMs !== null ? `Downloading PDF bytes… (estimated ${fmtEstimate(estimateMs)})` : "Downloading PDF bytes…");
      const downloadStart = Date.now();
      const res = await fetch(`${pdfRoute}?icao=${encodeURIComponent(icao)}&download=1`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data.detail || data.error || "Failed to load PDF";
        pushPdfStep(`Failed: ${msg}`);
        setPdfDownloadError(msg);
        return;
      }
      pushPdfStep("Preparing file for browser download…");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${icao}_${isAsecnaIcao(icao) ? "ASECNA" : isBahrainScraperIcao(icao, a) ? "SCRAPER" : "AIP"}_AD2.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      setAipPdfReady((prev) => ({ ...prev, [icao]: true }));
      setAipPdfExistsOnServer((prev) => ({ ...prev, [icao]: true }));
      pushPdfStep(`Download started (took ${fmtEstimate(Date.now() - downloadStart)}).`);
    } catch (err) {
      pushPdfStep("Failed to download PDF.");
      setPdfDownloadError(err instanceof Error ? err.message : "Failed to load PDF");
    } finally {
      if (slowHintTimer != null) window.clearTimeout(slowHintTimer);
      setPdfDownloading(false);
      window.setTimeout(() => setAipEadSyncSteps((prev) => (prev.length ? [] : prev)), 900);
    }
  }

  const steps = (title: string, list: string[], foot?: string) => (
    <div role="status" className="flex w-full max-w-[440px] flex-col gap-3 rounded-[12px] border border-cw-border bg-cw-bg-surface p-5">
      <div className="text-[14px] font-bold text-cw-text">{title}</div>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {(list.length ? list : ["Checking the cache…"]).map((s, i, arr) => {
          const last = i === arr.length - 1;
          return (
            <li key={`${s}-${i}`} className={`flex items-start gap-2.5 text-[13.5px] ${last ? "text-cw-text" : "text-cw-text-body"}`}>
              <span className="mt-0.5 flex h-[18px] w-[18px] flex-none items-center justify-center">{last ? <KitSpinner size={14} /> : <MaskIcon name="circle-check" size={16} color="var(--cw-success)" />}</span>
              <span className="min-w-0 break-words">{s}</span>
            </li>
          );
        })}
      </ol>
      {foot && <div className="text-[12.5px] leading-normal text-cw-text-muted">{foot}</div>}
    </div>
  );

  return (
    <div style={{ padding: "24px var(--cw-page-pad) 40px" }}>
      {!viewingAirport ? (
        <div className="flex flex-col gap-5" aria-busy="true">
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="font-mono text-[30px] font-semibold text-cw-text">{icao}</span>
            <span className="self-center"><Skeleton w={260} h={18} round={5} /></span>
          </div>
          <div className="grid gap-5 min-[1100px]:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)]">
            <div className="h-[520px] rounded-[14px] border border-cw-border bg-cw-bg-surface shadow-cw-1" />
            <div className="flex flex-col gap-5"><div className="h-[240px] rounded-[14px] border border-cw-border bg-cw-bg-surface shadow-cw-1" /><div className="h-[160px] rounded-[14px] border border-cw-border bg-cw-bg-surface shadow-cw-1" /></div>
          </div>
        </div>
      ) : (
        (() => {
          const a = viewingAirport;
          const detailIcao = a.icao;
          const detailFlagUrl = getCountryFlagUrl(a.country);
          const detailSynced = supportsSyncedAipIcao(detailIcao);
          const detailCacheEntry = aipEadCache[detailIcao];
          const hasLiveSync = !isUsaAipIcao(detailIcao);
          const loadingAd2 = aipEadLoadingIcao === detailIcao;
          const pdfThere = Boolean(aipPdfReady[detailIcao] || aipPdfExistsOnServer[detailIcao]);
          const canDownload = Boolean(pdfThere || detailCacheEntry?.updatedAt);
          const webAip = webAipFor(a);
          const pdfUrl = `${pdfRouteFor(detailIcao, a)}?icao=${encodeURIComponent(detailIcao)}&inline=1`;
          const ad2Name = `${detailIcao}_${isAsecnaIcao(detailIcao) ? "ASECNA" : isBahrainScraperIcao(detailIcao, a) ? "SCRAPER" : "AIP"}_AD2.pdf`;
          const genOk = detailSynced && genApplicable(a);
          const gen = genView[detailIcao];
          const fetched = detailCacheEntry?.updatedAt ? new Date(detailCacheEntry.updatedAt) : null;
          const expires = fetched ? new Date(fetched.getTime() + (detailCacheEntry?.cache?.ttlMs ?? 24 * 60 * 60 * 1000)) : null;

          const ad2Body = loadingAd2
            ? steps(resyncingIcao === detailIcao ? `Re-syncing the AD 2 PDF from ${aipSyncSourceName(detailIcao, a)}` : `Getting the AD 2 PDF from ${aipSyncSourceName(detailIcao, a)}`,
                aipEadSyncingIcao === detailIcao ? aipEadSyncSteps : ["Loading the AIP cache…"],
                aipEadSyncingIcao === detailIcao ? `${aipPdfSlowIcao === detailIcao ? "The source is still responding — large files take longer. " : "Some sources serve large files slowly. "}This keeps going unless an error appears here. ${aipSyncElapsedSec}s so far.` : undefined)
            : detailCacheEntry?.error
              ? <ErrorState title="Couldn't get the AD 2 PDF" detail={detailCacheEntry.error} onRetry={hasLiveSync ? () => void forceResyncAip(detailIcao) : undefined} />
              : steps(`Getting the AD 2 PDF from ${aipSyncSourceName(detailIcao, a)}`, aipEadSyncSteps, "Some sources serve large files slowly. This keeps going unless an error appears here.");

          const genBody = genSyncingPrefix
            ? steps(`Getting GEN 1.2 for ${a.country || detailIcao}`, genSyncSteps, "GEN is fetched from the same source as the AIP and kept for next time.")
            : genPdfDownloadError
              ? <ErrorState title="Couldn't get GEN 1.2" detail={genPdfDownloadError} onRetry={() => { setGenPdfDownloadError(null); void downloadGenPdfWithSync(detailIcao, isAsecnaAirport(a), isBahrainScraperAirport(a), "view"); }} />
              : (
                <div className="flex max-w-[400px] flex-col items-center gap-2 text-center">
                  <MaskIcon name="file-text" size={22} color="var(--cw-text-muted)" />
                  <div className="text-[15px] font-bold text-cw-text">GEN 1.2 for {a.country || detailIcao}</div>
                  <div className="text-[13.5px] leading-normal text-cw-text-muted">Entry, transit and departure rules for the country. It is fetched from {aipSyncSourceName(detailIcao, a)} the first time, which can take a minute.</div>
                  <Button variant="primary" icon="download" className="mt-1.5" onClick={() => void downloadGenPdfWithSync(detailIcao, isAsecnaAirport(a), isBahrainScraperAirport(a), "view")}>Get GEN 1.2</Button>
                </div>
              );

          const tabs: DocTab[] = [
            { id: "ad2", label: `AD 2 · ${detailIcao}`, meta: sourceTag(detailIcao, a), pdf: pdfThere && !loadingAd2 ? { url: pdfUrl, filename: ad2Name } : null, body: ad2Body, onDownload: () => void downloadAd2(a), downloading: pdfDownloading },
            ...(genOk ? [{ id: "gen", label: `GEN · ${a.country || "Country"}`, pdf: gen && !genSyncingPrefix ? { url: gen.url, filename: gen.filename } : null, body: genBody, onDownload: () => void downloadGenPdfWithSync(detailIcao, isAsecnaAirport(a), isBahrainScraperAirport(a)), downloading: genPdfDownloading } as DocTab] : []),
          ];

          const more: MenuItem[] = [
            ...(genOk ? [{ id: "gen", label: "Download GEN 1.2 PDF", icon: "download", onSelect: () => void downloadGenPdfWithSync(detailIcao, isAsecnaAirport(a), isBahrainScraperAirport(a)) }] : []),
            // Bug reports are filed in Help & support (the developers' inbox), with this airport as the page.
            { id: "report", label: "Report a problem…", icon: "file-warning", onSelect: () => { window.location.assign(`/help/new?type=bug&page=${encodeURIComponent(`/aip/${detailIcao}`)}`); } },
          ];

          return (
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-end gap-4">
                <div className="min-w-[300px] flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    {detailFlagUrl && <img src={detailFlagUrl} alt="" width={24} height={18} className="self-center rounded-sm border border-cw-border object-cover" />}
                    <h1 className="m-0 font-mono text-[30px] font-semibold tracking-[-0.01em] text-cw-text">{detailIcao}</h1>
                    {a.name && <span className="text-[20px] font-bold text-cw-text">{a.name}</span>}
                    {a.country && <span className="text-[15px] text-cw-text-muted">{a.country}</span>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-cw-text-muted">
                    {a.lat != null && a.lon != null && (
                      <span className="flex items-center gap-1.5">
                        <MaskIcon name="map-pin" size={13} />
                        <span className="font-mono">{a.lat.toFixed(4)} {a.lon.toFixed(4)}</span>
                        <a href={`https://www.openstreetmap.org/?mlat=${a.lat}&mlon=${a.lon}#map=14/${a.lat}/${a.lon}`} target="_blank" rel="noreferrer" className="font-semibold text-cw-text-link no-underline hover:text-cw-primary-hover">Map</a>
                      </span>
                    )}
                    {detailSynced && fetched && expires && (
                      <span>AIP fetched <span className="font-mono">{utc(fetched)}</span> · expires <span className="font-mono">{utc(expires)}</span>{expires <= new Date() && <span className="ml-2"><Badge tone="warning">Expired — refreshes on the next sync</Badge></span>}</span>
                    )}
                    {pdfDownloading && aipEadSyncSteps.length > 0 && <span role="status" className="flex items-center gap-1.5 text-cw-text-body"><KitSpinner size={12} />{aipEadSyncSteps[aipEadSyncSteps.length - 1]}</span>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {detailSynced && <Button variant="primary" icon="download" loading={pdfDownloading} loadingLabel="Downloading…" disabled={!canDownload} title={canDownload ? "Download the AD 2 PDF" : "The PDF appears once it has been fetched"} onClick={() => void downloadAd2(a)}>Download PDF</Button>}
                  {detailSynced && hasLiveSync && (
                    <Button icon="refresh-cw" loading={resyncingIcao === detailIcao} loadingLabel="Re-syncing…" disabled={loadingAd2 && resyncingIcao !== detailIcao}
                      title={`Bypasses the cache and fetches the AIP again from ${aipSyncSourceName(detailIcao, a)}. Slow — it makes an outside request.`} onClick={() => void forceResyncAip(detailIcao)}>Re-sync</Button>
                  )}
                  {webAip && (
                    <Button icon="globe" onClick={() => {
                      if (isUsaAipIcao(detailIcao) || isRussiaIcao(detailIcao)) { window.open(webAip, "_blank", "noopener,noreferrer"); return; }
                      setWebAipConsent({ url: webAip, label: a.country || detailIcao || "this airport" });
                    }}>Web AIP</Button>
                  )}
                  {/* Ops Agent entry for this record (design spec §6.1); renders only for allowlisted users. */}
                  <AskAboutButton label={detailIcao} gate />
                  <Menu items={more} label={`More for ${detailIcao}`} />
                </div>
              </div>

              {detailSynced && resyncError[detailIcao] && (
                <Callout tone="danger" icon="file-warning" title={`Re-sync failed — the document shown is the previous copy from ${resyncError[detailIcao].cachedAt ? utc(new Date(resyncError[detailIcao].cachedAt!)) : "an earlier sync (time unknown)"}.`}
                  action={<IconButton icon="x" label="Dismiss" size="sm" onClick={() => setResyncError((prev) => { const next = { ...prev }; delete next[detailIcao]; return next; })} />}>
                  <span className="break-words font-mono text-[12.5px]">{resyncError[detailIcao].message}</span>
                </Callout>
              )}
              {pdfDownloadError && <Callout tone="danger" title="Couldn't download the PDF">{pdfDownloadError}</Callout>}
              {isKuwaitScraperIcao(detailIcao) && (
                <Callout tone="warning" title="Kuwait's AIP is paid">
                  Review the subscription terms in the official order form before requesting files.{" "}
                  <a href="https://dgcawebappstg.blob.core.windows.net/upload/AIPItemSub/live/627/AIP%20Subscription%20order%20form%202026.pdf" target="_blank" rel="noreferrer" className="font-semibold text-cw-text-link">2026 subscription order form (PDF)</a>{" · "}
                  <a href="https://dgca.gov.kw/AIP" target="_blank" rel="noreferrer" className="font-semibold text-cw-text-link">DGCA Kuwait AIP page</a>
                </Callout>
              )}
              {isUsaAipIcao(detailIcao) && (
                <Callout tone="warning" title="A fixed set of FAA files">
                  The USA AIP here is PDF files extracted from an FAA document released on 10.11.2016.{" "}
                  <a href={USA_WEB_AIP_URL} target="_blank" rel="noreferrer" className="font-semibold text-cw-text-link">FAA AIP web publication</a>
                </Callout>
              )}

              <div className="grid items-start gap-5 min-[1100px]:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)]">
                {detailSynced ? (
                  <DocViewer tabs={tabs} active={docTab} onTab={(id) => setDocTab(id === "gen" ? "gen" : "ad2")} />
                ) : (
                  <Card title={`AIP — ${detailIcao}`} icon="file-text" description="Stored AIP data">
                    <div className="mb-3">
                      <Callout tone="warning" title={a.sourceType === "ASECNA_DYNAMIC" ? "ASECNA (dynamically updated)" : "Hard coded (PDF based)"}>
                        {a.sourceType === "ASECNA_DYNAMIC" ? "Data is refreshed from live Web AIP sync." : "This information may be old and inaccurate."}
                      </Callout>
                    </div>
                    <AIPResultCard airport={a} />
                  </Card>
                )}
                <div className="flex min-w-0 flex-col gap-5">
                  <NotamsCard icao={detailIcao} notams={notams} loading={notamsLoading} steps={notamsSyncing ? notamsSyncSteps : []} error={notamsError} updatedAt={notamsUpdatedAt} onRefresh={() => requestSyncNotams(detailIcao)} />
                  <WeatherCard icao={detailIcao} loading={weatherLoading} steps={weatherSyncing ? weatherSyncSteps : []} error={cachedWeather?.error ?? null} updatedAt={cachedWeather?.updatedAt ?? null}
                    airportLine={weatherDisplay.airportLine ?? null} bullets={weatherDisplay.bullets} plain={weatherDisplay.strippedPlain} onRefresh={() => requestSyncWeather(detailIcao)} />
                </div>
              </div>
            </div>
          );
        })()
      )}

      <Modal open={Boolean(webAipConsent)} onClose={() => setWebAipConsent(null)} title="Before opening Web AIP" icon="globe"
        actions={<>
          <Button onClick={() => setWebAipConsent(null)}>Cancel</Button>
          <Button variant="primary" onClick={() => { if (webAipConsent) window.open(webAipConsent.url, "_blank", "noopener,noreferrer"); setWebAipConsent(null); }}>I understand, open Web AIP</Button>
        </>}>
        <p className="m-0">
          These links go to official websites, which can be paid or unreachable from some countries. If this source does not work, current information is free on{" "}
          <a href={EAD_BASIC_LOGIN_URL} target="_blank" rel="noreferrer" className="font-semibold text-cw-text-link">EUROCONTROL EAD Basic</a>.
        </p>
        {webAipConsent && <p className="m-0 mt-2 text-[13px] text-cw-text-muted">Opens: <span className="font-medium text-cw-text">{webAipConsent.label}</span></p>}
      </Modal>

      <CaptchaConsentDialog
        open={captchaConsentDialog.open}
        country={captchaConsentDialog.country}
        onContinue={handleCaptchaConsentContinue}
        onDontShowAgain={handleCaptchaConsentDontShowAgain}
        onClose={handleCaptchaConsentClose}
      />

    </div>
  );
}
