"use client";

import { Suspense, useState, useCallback, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { PlaneIcon, ChevronDownIcon, ChevronUpIcon, ChevronRightIcon, FileWarningIcon, Trash2Icon, RefreshCwIcon, XIcon, GlobeIcon, Download, SearchIcon, SquareIcon, MapPinIcon, CloudSunIcon, ScrollTextIcon } from "lucide-react";
import PortalShell from "@/components/portal/Shell";
import GenPopover from "@/components/portal/GenPopover";
import { PButton, PCard, PMono, PSectionTitle, PTh } from "@/components/portal/ui";
import { getCountryFlagUrl } from "@/lib/country-flags";
import { formatTimesInAipText } from "@/lib/format-aip-time";
import { useBackgroundSearch, type SyncStage } from "@/lib/search-context";
import { sendNotification, type NotificationPrefs, DEFAULT_NOTIFICATION_PREFS } from "@/lib/notifications";
import { parseOpmetBullets, stripWxSearchPreamble } from "@/lib/format-opmet-weather";
import { getAsecnaAirportsSet, getAsecnaAirportByIcao, getAsecnaData } from "@/lib/asecna-airports";
import { getScraperCountryByIcao, isScraperCountryName, getScraperWebAipUrlByCountryOrIcao } from "@/lib/scraper-country-config";
import { CaptchaConsentDialog } from "@/components/captcha-consent-dialog";
import BugReportModal from "@/components/bug-report-modal";
import BugReportsHoverBanner from "@/components/bug-reports-hover-banner";
import { getCaptchaCountryByIcao, useCaptchaConsent } from "@/lib/captcha-consent";
import { getEadWebAipUrlByIcaoOrCountry } from "@/lib/ead-web-aip";
import { resolveGenPrefix } from "@/lib/ead-gen-prefix";
import { USA_WEB_AIP_URL, isUsaAipIcao } from "@/lib/usa-aip";
import type { BugReportRow } from "@/lib/bug-reports-shared";
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

const AirportMap = dynamic(() => import("@/components/AirportMap"), {
  ssr: false,
  loading: () => <div className="bg-muted/30 rounded-lg flex items-center justify-center min-h-[240px] text-sm text-muted-foreground">Loading map…</div>,
});

const BROWSE_LOADING_STEPS = [
  { id: "browse-1", label: "Loading…", duration: 400 },
  { id: "browse-2", label: "Ready", duration: 250 },
];

type RecentEntry = { icao: string; name: string; country: string; ts: number };
const RECENTS_STORAGE_KEY = "portal-recents";
const RECENTS_MAX = 8;

function formatRecentTimestamp(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} d ago`;
  return new Date(ts).toLocaleDateString();
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

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

type AIPAirport = {
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

function isEadIcao(icao: string): boolean {
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

const USA_STATE_ABBR: Record<string, string> = {
  "Alaska": "AK", "American Samoa": "AS", "Arizona": "AZ", "California": "CA", "Colorado": "CO",
  "Connecticut": "CT", "District of Columbia": "DC", "Florida": "FL", "Georgia": "GA", "Guam": "GU",
  "Hawaii": "HI", "Illinois": "IL", "Indiana": "IN", "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA",
  "Maine": "ME", "Maryland": "MD", "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN",
  "Missouri": "MO", "Nevada": "NV", "New Jersey": "NJ", "New York": "NY", "North Carolina": "NC",
  "Northern Mariana Islands": "MP", "Ohio": "OH", "Oregon": "OR", "Palau Island": "PW",
  "Pennsylvania": "PA", "Puerto Rico": "PR", "Tennessee": "TN", "Texas": "TX", "Utah": "UT",
  "Virgin Islands": "VI", "Washington": "WA", "Wisconsin": "WI",
};

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
      className={`${isSelected ? "rounded-[10px] ring-2 ring-[#2563eb] " : ""}${onSelect ? "cursor-pointer " : ""}`}
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
              className="rounded-sm border border-[#e6e7ea] object-cover"
            />
          ) : (
            <GlobeIcon className="size-4 text-[#9aa0a8]" />
          )}
        </span>
        <span className="whitespace-nowrap font-mono text-[15px] font-semibold text-[#17181c]">{airport.icao}</span>
        {airport.name ? <span className="text-sm text-[#6c7079]">{airport.name}</span> : null}
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
            <section key={section || "general"} className="overflow-hidden rounded-[10px] border border-[#eef0f2]">
              <div className="flex items-center gap-2 border-b border-[#eef0f2] bg-[#fbfbfc] px-3.5 py-2">
                {section ? (
                  <PMono className="text-[11px] font-semibold tracking-wide text-[#2563eb]">{section}</PMono>
                ) : null}
                <PSectionTitle className="tracking-[0.06em]">{sectionTitle}</PSectionTitle>
              </div>
              <dl className="divide-y divide-[#f2f3f5]">
                {normalRows.map(({ key, section: rowSection, label, value }) => (
                  <div
                    key={`${rowSection}-${label}`}
                    className="grid grid-cols-1 gap-1.5 px-3.5 py-2.5 sm:grid-cols-[minmax(160px,190px)_1fr] sm:gap-4"
                  >
                    <dt className="text-[11.5px] leading-5 text-[#9aa0a8]">{label}</dt>
                    <dd className={`flex min-w-0 items-center gap-2 font-mono text-[13px] leading-relaxed text-[#17181c] ${value.includes("\n") ? "whitespace-pre-wrap break-words" : ""}`}>
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
                <div className="border-t border-[#eef0f2] px-3.5 py-3.5">
                  <PSectionTitle className="mb-2.5">Runways</PSectionTitle>
                  <div className="overflow-hidden rounded-[10px] border border-[#eef0f2]">
                    <table className="w-full text-[13px]">
                      <thead className="bg-[#fbfbfc]">
                        <tr>
                          <th className="w-28 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-[#9aa0a8]">Runway</th>
                          <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-[#9aa0a8]">Dimensions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f2f3f5]">
                        {runwayRows.map((r) => (
                          <tr key={`${r.runway}-${r.dimensions}`}>
                            <td className="px-3 py-2 font-mono text-[#17181c]">{r.runway || "—"}</td>
                            <td className="px-3 py-2 font-mono text-[#3a3d44]">{r.dimensions || "—"}</td>
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
        <div className="mt-4 border-t border-[#eef0f2] pt-4">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowGen((v) => !v); }}
            className="flex cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-sm font-semibold text-[#6c7079] hover:text-[#17181c]"
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
                  <p className="mb-1.5 text-sm font-semibold text-[#17181c]">GEN 1.2</p>
                  <p className="text-[13px] leading-6 text-[#3a3d44]">{airport.gen1_2}</p>
                </div>
              )}
              {airport.gen1_2_point_4 && (
                <div className="max-w-none">
                  <p className="mb-1.5 text-sm font-semibold text-[#17181c]">GEN 1.2 Point 4</p>
                  <p className="text-[13px] leading-6 text-[#3a3d44]">{airport.gen1_2_point_4}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type RegionEntry = { region: string; countries: string[] };

function AIPPortalPageInner() {
  const { bgList, startBackground, updateStage, finishBackground, cancelBackground } = useBackgroundSearch();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AIPAirport[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestHighlight, setSuggestHighlight] = useState(-1);
  const [aipEadSyncSteps, setAipEadSyncSteps] = useState<string[]>([]);
  const [results, setResults] = useState<AIPAirport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedIcao, setSelectedIcao] = useState<string | null>(null);
  const [regions, setRegions] = useState<RegionEntry[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string>("");
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const [selectedState, setSelectedState] = useState<string>("");
  const [loadingCountry, setLoadingCountry] = useState(false);
  const [browseMenuOpen, setBrowseMenuOpen] = useState(false);
  const [browseStep, setBrowseStep] = useState<1 | 2 | 3 | 4>(1);
  const [browseSelection, setBrowseSelection] = useState<AIPAirport[]>([]);
  const [browseSelectedCountry, setBrowseSelectedCountry] = useState<string>("");
  const [browseSelectedState, setBrowseSelectedState] = useState<string>("");
  const [usaStates, setUsaStates] = useState<string[]>([]);
  const [browseCountryAirports, setBrowseCountryAirports] = useState<AIPAirport[]>([]);
  const [browseDeletingIcaos, setBrowseDeletingIcaos] = useState<Record<string, boolean>>({});
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseLoadingStepIndex, setBrowseLoadingStepIndex] = useState(0);
  const [browseCountrySearch, setBrowseCountrySearch] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
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
  const [aipPdfReady, setAipPdfReady] = useState<Record<string, boolean>>({});
  const [aipPdfExistsOnServer, setAipPdfExistsOnServer] = useState<Record<string, boolean>>({});
  const [pdfDownloadError, setPdfDownloadError] = useState<string | null>(null);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [genPdfDownloadError, setGenPdfDownloadError] = useState<string | null>(null);
  const [genPdfDownloading, setGenPdfDownloading] = useState(false);
  const [genPdfExistsOnServer, setGenPdfExistsOnServer] = useState<Record<string, boolean>>({});
  type GenPart = { raw: string; rewritten: string };
  const emptyGenPart = (): GenPart => ({ raw: "", rewritten: "" });
  const [genCache, setGenCache] = useState<Record<string, { general: GenPart; nonScheduled: GenPart; privateFlights: GenPart; updatedAt: string | null }>>({});
  const [genLoadingPrefix, setGenLoadingPrefix] = useState<string | null>(null);
  const [genSyncingPrefix, setGenSyncingPrefix] = useState<string | null>(null);
  const [genSyncSteps, setGenSyncSteps] = useState<string[]>([]);
  const [showGenSyncOverlay, setShowGenSyncOverlay] = useState(false);
  const [genViewMode, setGenViewMode] = useState<"raw" | "rewritten">("rewritten");
  const [genPartMode, setGenPartMode] = useState<"general" | "nonScheduled" | "privateFlights">("general");
  const [webAipConsent, setWebAipConsent] = useState<{ url: string; label: string } | null>(null);
  const [bugReports, setBugReports] = useState<BugReportRow[]>([]);
  const [bugModalOpen, setBugModalOpen] = useState(false);
  const [bugReportSubmitting, setBugReportSubmitting] = useState(false);
  const [recents, setRecents] = useState<RecentEntry[]>([]);

  const [bugReportError, setBugReportError] = useState<string | null>(null);
  const [deletingBugReportId, setDeletingBugReportId] = useState<string | null>(null);
  const [pendingCaptchaIcao, setPendingCaptchaIcao] = useState<string | null>(null);
  const {
    dismissed: captchaConsentDismissed,
    dialog: captchaConsentDialog,
    requestConsentForIcao,
    dontShowAgain: dontShowCaptchaConsentAgain,
    close: closeCaptchaConsentDialog,
  } = useCaptchaConsent();
  const selectedAirport = useMemo(() => {
    if (!results?.length || !selectedIcao) return null;
    return results.find((a) => a.icao === selectedIcao) ?? null;
  }, [results, selectedIcao]);

  const viewingAirport = selectedAirport;

  const recentIcao = viewingAirport?.icao ?? null;
  const recentName = viewingAirport?.name ?? "";
  const recentCountry = viewingAirport?.country ?? "";

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

  useEffect(() => {
    let cancelled = false;
    const loadBugReports = async () => {
      try {
        const res = await fetch("/api/bug-reports", { cache: "no-store" });
        if (!res.ok) return;
        const payload = (await res.json().catch(() => ({}))) as { reports?: BugReportRow[] };
        if (!cancelled) setBugReports(Array.isArray(payload.reports) ? payload.reports : []);
      } catch {
        // best effort
      }
    };
    loadBugReports();
    const id = window.setInterval(loadBugReports, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const submitBugReport = useCallback(async (payload: { airportIcao: string; description: string }) => {
    setBugReportSubmitting(true);
    setBugReportError(null);
    try {
      const res = await fetch("/api/bug-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; report?: BugReportRow };
      if (!res.ok || !body.report) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setBugReports((prev) => [body.report!, ...prev]);
      setBugModalOpen(false);
    } catch (err) {
      setBugReportError(err instanceof Error ? err.message : "Failed to send bug report");
    } finally {
      setBugReportSubmitting(false);
    }
  }, []);

  const deleteFixedBugReport = useCallback(async (reportId: string) => {
    if (!reportId) return;
    setDeletingBugReportId(reportId);
    try {
      const res = await fetch(`/api/bug-reports/${encodeURIComponent(reportId)}`, {
        method: "DELETE",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; deleted?: boolean };
      if (!res.ok) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      if (body.deleted) {
        setBugReports((prev) => prev.filter((report) => report.id !== reportId));
      }
    } catch (err) {
      setBugReportError(err instanceof Error ? err.message : "Failed to delete fixed bug report");
    } finally {
      setDeletingBugReportId(null);
    }
  }, []);

  const resultsLengthRef = useRef(0);
  const aipEadInFlightRef = useRef<Set<string>>(new Set());
  const handledIcaoParamRef = useRef<string | null>(null);
  const requestControllersRef = useRef<Map<string, AbortController>>(new Map());
  const genPopoverAnchorRef = useRef<HTMLDivElement | null>(null);
  const suggestAbortRef = useRef<AbortController | null>(null);
  const suggestDebounceRef = useRef<number | null>(null);

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
    setShowGenSyncOverlay(false);
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

  // When results change: clear selection if empty; when tabs are added (search/menu), switch to the new tab
  useEffect(() => {
    if (!results?.length) {
      setSelectedIcao(null);
      resultsLengthRef.current = 0;
      return;
    }
    const prevLen = resultsLengthRef.current;
    resultsLengthRef.current = results.length;
    setSelectedIcao((current) => {
      if (results.length > prevLen) return results[results.length - 1].icao;
      if (current && results.some((a) => a.icao === current)) return current;
      const withCoords = results.find((a) => a.lat != null && a.lon != null);
      return withCoords?.icao ?? results[0].icao;
    });
  }, [results]);

  useEffect(() => {
    fetch("/api/regions", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setRegions(data.regions ?? []))
      .catch(() => setRegions([]));
  }, []);

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

  useEffect(() => {
    fetch("/api/admin/status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { isAdmin: false }))
      .then((data) => setIsAdmin(Boolean(data?.isAdmin)))
      .catch(() => setIsAdmin(false));
  }, []);

  const countriesInRegion = useMemo(() => {
    if (!selectedRegion) return [];
    const r = regions.find((x) => x.region === selectedRegion);
    return r?.countries ?? [];
  }, [regions, selectedRegion]);

  const allCountriesWithRegion = useMemo(() => {
    const out: { country: string; region: string }[] = [];
    for (const r of regions) {
      for (const c of r.countries ?? []) {
        out.push({ country: c, region: r.region });
      }
    }
    return out;
  }, [regions]);

  const countrySearchMatches = useMemo(() => {
    const q = browseCountrySearch.trim().toLowerCase();
    if (!q) return [];
    const scored = allCountriesWithRegion
      .map(({ country, region }) => {
        const cl = country.toLowerCase();
        const rl = region.toLowerCase();
        const inCountry = cl.includes(q);
        const inRegion = rl.includes(q);
        if (!inCountry && !inRegion) return null;
        let score = 0;
        if (cl.startsWith(q)) score += 100;
        else if (inCountry) score += 50;
        if (rl.startsWith(q)) score += 30;
        else if (inRegion) score += 10;
        return { country, region, score };
      })
      .filter(Boolean) as { country: string; region: string; score: number }[];
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.country.localeCompare(b.country, undefined, { sensitivity: "base" });
    });
    const seen = new Set<string>();
    const deduped: { country: string; region: string }[] = [];
    for (const row of scored) {
      const key = row.country.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push({ country: row.country, region: row.region });
      if (deduped.length >= 50) break;
    }
    return deduped;
  }, [allCountriesWithRegion, browseCountrySearch]);

  const applyBrowseCountrySelection = useCallback((country: string, region: string) => {
    setSelectedRegion(region);
    setSelectedCountry("");
    setSelectedState("");
    setBrowseSelectedState("");
    setBrowseSelection([]);
    setBrowseSelectedCountry(country);
    setBrowseCountrySearch("");
    setBrowseStep(3);
  }, []);

  useEffect(() => {
    if (!browseMenuOpen || browseStep !== 1) return;

    function handleKeydown(event: KeyboardEvent) {
      if (isEditableElement(event.target)) return;

      const hasOneMatch = browseCountrySearch.trim().length > 0 && countrySearchMatches.length === 1;
      if (event.key === "Enter" && hasOneMatch) {
        event.preventDefault();
        const only = countrySearchMatches[0];
        applyBrowseCountrySelection(only.country, only.region);
        return;
      }

      if (event.key === "Escape") {
        setBrowseCountrySearch("");
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        setBrowseCountrySearch((prev) => prev.slice(0, -1));
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        // Prevent native key insertion when we programmatically focus the search input.
        event.preventDefault();
        setBrowseCountrySearch((prev) => prev + event.key);
      } else {
        return;
      }

      const input = document.getElementById("browse-country-search");
      if (input instanceof HTMLInputElement) {
        input.focus();
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [applyBrowseCountrySelection, browseCountrySearch, browseMenuOpen, browseStep, countrySearchMatches]);

  const isUSABrowse = browseSelectedCountry === "United States of America";
  const regionHasUSA = countriesInRegion.includes("United States of America");

  useEffect(() => {
    if (isUSABrowse && browseStep === 3) {
      fetch("/api/usa-states")
        .then((res) => res.json())
        .then((data) => setUsaStates(data.states ?? []))
        .catch(() => setUsaStates([]));
    }
  }, [isUSABrowse, browseStep]);

  useEffect(() => {
    const shouldFetchNonUSA = browseStep === 3 && browseSelectedCountry && !isUSABrowse;
    const shouldFetchUSA = browseStep === 4 && browseSelectedCountry === "United States of America" && browseSelectedState;
    if (!shouldFetchNonUSA && !shouldFetchUSA) return;
    setLoadingCountry(true);
    const url = shouldFetchUSA
      ? `/api/airports?country=${encodeURIComponent(browseSelectedCountry)}&state=${encodeURIComponent(browseSelectedState)}`
      : `/api/airports?country=${encodeURIComponent(browseSelectedCountry)}`;
    fetch(url, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        setBrowseCountryAirports(data.results ?? []);
      })
      .catch(() => setBrowseCountryAirports([]))
      .finally(() => setLoadingCountry(false));
  }, [browseStep, browseSelectedCountry, browseSelectedState, isUSABrowse]);

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

  const deleteAirportFromPortal = useCallback(async (airport: AIPAirport) => {
    const icao = airport.icao.toUpperCase();
    setBrowseDeletingIcaos((prev) => ({ ...prev, [icao]: true }));
    try {
      const res = await fetch("/api/airports/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icao }),
      });
      const data = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) throw new Error(data.error || "Failed to hide airport.");

      setBrowseCountryAirports((prev) => prev.filter((a) => a.icao !== icao));
      setBrowseSelection((prev) => prev.filter((a) => a.icao !== icao));
      setResults((prev) => (prev ? prev.filter((a) => a.icao !== icao) : prev));
      setSelectedIcao((prev) => (prev === icao ? null : prev));
    } catch (e) {
      setError((e as { message?: string })?.message || "Failed to hide airport.");
    } finally {
      setBrowseDeletingIcaos((prev) => {
        const next = { ...prev };
        delete next[icao];
        return next;
      });
    }
  }, []);

  const downloadGenPdfWithSync = useCallback(async (icao: string, forceAsecna = false, forceScraper = false) => {
    const allow = await requestConsentForIcao(icao);
    if (!allow) return;

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
        const blob = await pdfRes.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${icao}_USA_GEN_1.2.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        setGenSyncSteps((prev) => [...prev, "Download ready."]);
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
        const blob = await pdfRes.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${icao}_SCRAPER_GEN_1.2.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        setGenSyncSteps((prev) => [...prev, "Download ready."]);
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
        const blob = await pdfRes.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${icao}_ASECNA_GEN_1.2.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        setGenSyncSteps((prev) => [...prev, "Download ready."]);
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

      setGenSyncSteps((prev) => [...prev, "Preparing GEN PDF download…"]);
      const pdfRes = await fetch(`/api/aip/gen/pdf?icao=${encodeURIComponent(icao)}`, { cache: "no-store" });
      if (!pdfRes.ok) {
        const data = await pdfRes.json().catch(() => ({} as { detail?: string; error?: string }));
        throw new Error(data.detail || data.error || "Failed to load GEN PDF");
      }
      const blob = await pdfRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${prefix}_GEN_1.2.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setGenSyncSteps((prev) => [...prev, "Download ready."]);
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

  const runBrowseLoading = useCallback(async (then: () => void) => {
    setBrowseLoading(true);
    setBrowseLoadingStepIndex(0);
    for (let i = 0; i < BROWSE_LOADING_STEPS.length; i++) {
      setBrowseLoadingStepIndex(i);
      await new Promise((r) => setTimeout(r, BROWSE_LOADING_STEPS[i].duration));
    }
    then();
    setBrowseLoading(false);
  }, []);

  const search = useCallback(async (queryOverride?: string) => {
    const q = (queryOverride ?? query).trim();
    if (!q) return;
    const qUpper = q.toUpperCase();

    setLoading(true);
    setError(null);
    startBackground(qUpper);
    updateStage(qUpper, "airport", "running", "Searching…");
    sendNotification("search_start", "Search started", `Looking up ${qUpper}…`, notifPrefs);

    if (queryOverride === undefined && searchParams.get("fromBanner") === "1") {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("fromBanner");
      router.replace(params.toString() ? `/?${params.toString()}` : "/");
    }

    const searchController = beginRequest("airport-search");
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: searchController.signal });
      let data: { results?: AIPAirport[]; error?: string };
      try {
        data = await res.json();
      } catch {
        setError(res.ok ? "Invalid response from server." : "Search failed. Please try again.");
        updateStage(qUpper, "airport", "error", "Search failed");
        return;
      }

      if (!res.ok) {
        setError(data.error || "Search failed");
        updateStage(qUpper, "airport", "error", data.error || "Search failed");
        return;
      }

      let newResults = data.results ?? [];
      if (qUpper.length === 4 && isEadIcao(qUpper) && !newResults.some((r: AIPAirport) => r.icao.toUpperCase() === qUpper)) {
        newResults = [
          ...newResults,
          {
            country: "EAD (EU AIP)",
            gen1_2: "",
            gen1_2_point_4: "",
            icao: qUpper,
            name: "EAD UNDEFINED",
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
          } as AIPAirport,
        ];
      }
      setResults((prev) => {
        const next = [...(prev ?? [])];
        newResults.forEach((a: AIPAirport) => {
          if (!next.some((x) => x.icao === a.icao)) next.push(a);
        });
        return next;
      });
      if (newResults.length > 0) {
        const firstIcao = newResults[0].icao;
        setSelectedIcao(firstIcao);
      }
      updateStage(qUpper, "airport", "done", "Airport loaded");
      sendNotification("search_end", "Search completed", `${qUpper} ready`, notifPrefs);

      // Fire-and-forget search analytics (per-user, Supabase-backed)
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[search/log] sending", { query: q, resultCount: newResults.length });
      }
      fetch("/api/search/log", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, resultCount: newResults.length, source: "search" }),
      })
        .then(async (res) => {
          const text = await res.text();
          const data = (() => {
            try {
              return JSON.parse(text);
            } catch {
              return { raw: text };
            }
          })();
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[search/log] response", res.status, data);
          }
        })
        .catch((err) => {
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[search/log] fetch failed", err);
          }
        });
    } catch (err) {
      if (isAbortError(err)) {
        updateStage(qUpper, "airport", "cancelled", "Search cancelled");
        cancelBackground(qUpper, "Search cancelled");
        return;
      }
      setError("Connection error. Please try again.");
      updateStage(qUpper, "airport", "error", "Connection error");
    } finally {
      finishRequest("airport-search", searchController);
      setLoading(false);
      setHasSearched(true);
    }
  }, [query, notifPrefs, startBackground, updateStage, searchParams, router, beginRequest, finishRequest, isAbortError, cancelBackground]);

  const stopSearch = useCallback(() => {
    stopAllRequests();
    setLoading(false);
    setNotamsLoadingIcao(null);
    setNotamsSyncingIcao(null);
    setNotamsSyncSteps([]);
    setWeatherLoadingIcao(null);
    setWeatherSyncingIcao(null);
    setWeatherSyncSteps([]);
    setAipEadLoadingIcao(null);
    setAipEadSyncingIcao(null);
    setAipEadSyncSteps([]);
    setGenLoadingPrefix(null);
    setGenSyncingPrefix(null);
    setGenSyncSteps([]);
    for (const item of bgList) {
      const hasRunning = Object.values(item.stages).some((s) => s === "running");
      if (hasRunning) {
        for (const [stage, status] of Object.entries(item.stages) as Array<[SyncStage, typeof item.stages[SyncStage]]>) {
          if (status === "running") updateStage(item.icao, stage, "cancelled", "Search cancelled");
        }
        cancelBackground(item.icao, "Search cancelled");
      }
    }
  }, [stopAllRequests, bgList, updateStage, cancelBackground]);

  useEffect(() => {
    const icaoParam = searchParams.get("icao")?.trim().toUpperCase() ?? "";
    if (!icaoParam) {
      handledIcaoParamRef.current = null;
      return;
    }
    if (handledIcaoParamRef.current === icaoParam) return;
    handledIcaoParamRef.current = icaoParam;
    setQuery(icaoParam);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("icao");
    params.delete("fromBanner");
    router.replace(params.toString() ? `/?${params.toString()}` : "/");
    void search(icaoParam);
  }, [searchParams, search, router]);

  useEffect(() => {
    if (loading || notamsLoadingIcao || aipEadLoadingIcao || genLoadingPrefix) return;
    const finishable = bgList.filter((item) => !item.done && (item.stages.airport === "done" || item.stages.airport === "error"));
    for (const item of finishable) {
      finishBackground(item.icao);
    }
  }, [bgList, loading, notamsLoadingIcao, aipEadLoadingIcao, genLoadingPrefix, finishBackground]);

  // Live search suggestions: debounce 250ms, >=2 chars, reuse the existing
  // /api/search endpoint with an AbortController per keystroke.
  const closeSuggestions = useCallback(() => {
    if (suggestDebounceRef.current != null) {
      window.clearTimeout(suggestDebounceRef.current);
      suggestDebounceRef.current = null;
    }
    suggestAbortRef.current?.abort();
    suggestAbortRef.current = null;
    setSuggestOpen(false);
    setSuggestHighlight(-1);
  }, []);

  useEffect(() => {
    return () => {
      if (suggestDebounceRef.current != null) window.clearTimeout(suggestDebounceRef.current);
      suggestAbortRef.current?.abort();
    };
  }, []);

  const rankSuggestions = useCallback((list: AIPAirport[], q: string): AIPAirport[] => {
    const qUp = q.toUpperCase();
    const qLow = q.toLowerCase();
    const score = (a: AIPAirport) => {
      const icao = String(a.icao || "").toUpperCase();
      if (icao === qUp) return 0;
      if (icao.startsWith(qUp)) return 1;
      if (
        String(a.name || "").toLowerCase().includes(qLow) ||
        String(a.country || "").toLowerCase().includes(qLow)
      ) {
        return 2;
      }
      return 3;
    };
    const seen = new Set<string>();
    const deduped = list.filter((a) => {
      const key = String(a.icao || "").toUpperCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return [...deduped].sort((a, b) => score(a) - score(b)).slice(0, 8);
  }, []);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (suggestDebounceRef.current != null) {
      window.clearTimeout(suggestDebounceRef.current);
      suggestDebounceRef.current = null;
    }
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      suggestAbortRef.current?.abort();
      suggestAbortRef.current = null;
      setSuggestions([]);
      setSuggestOpen(false);
      setSuggestHighlight(-1);
      return;
    }
    suggestDebounceRef.current = window.setTimeout(() => {
      suggestDebounceRef.current = null;
      suggestAbortRef.current?.abort();
      const controller = new AbortController();
      suggestAbortRef.current = controller;
      fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { results: [] }))
        .then((data: { results?: AIPAirport[] }) => {
          if (controller.signal.aborted) return;
          const ranked = rankSuggestions(data.results ?? [], trimmed);
          setSuggestions(ranked);
          setSuggestOpen(ranked.length > 0);
          setSuggestHighlight(-1);
        })
        .catch(() => {
          // aborted or network error — leave dropdown as-is
        });
    }, 250);
  }, [rankSuggestions]);

  const pickSuggestion = useCallback((airport: AIPAirport) => {
    closeSuggestions();
    // Same path the ?icao= deep link uses: search() fires /api/search/log exactly as now.
    setQuery(airport.icao);
    void search(airport.icao);
  }, [closeSuggestions, search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (suggestOpen && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSuggestHighlight((h) => (h + 1 >= suggestions.length ? 0 : h + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSuggestHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeSuggestions();
        return;
      }
      if (e.key === "Enter" && suggestHighlight >= 0 && suggestHighlight < suggestions.length) {
        e.preventDefault();
        pickSuggestion(suggestions[suggestHighlight]);
        return;
      }
    }
    if (e.key === "Enter") {
      closeSuggestions();
      search();
    }
  };

  const showMap = !!(results?.length && viewingAirport);

  return (
    <PortalShell>
      <div className="px-4 py-6 pb-12 sm:px-[30px]">
        {!viewingAirport ? (
          <div className="mx-auto w-full max-w-[1560px]">
            {/* Page header */}
            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="mb-1 text-[26px] font-extrabold tracking-[-0.02em]">Search airport data</h1>
                <p className="text-[15px] leading-normal text-[#6c7079]">
                  Look up AIP, GEN, NOTAM and weather data for any aerodrome by ICAO code, name or country.
                </p>
              </div>
              <div className="flex flex-none flex-wrap items-center gap-2">
                <PButton
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setBrowseMenuOpen((o) => !o);
                    if (!browseMenuOpen) {
                      setBrowseStep(1);
                      setBrowseSelection([]);
                      setBrowseSelectedState("");
                      setBrowseCountrySearch("");
                    }
                  }}
                  aria-expanded={browseMenuOpen}
                >
                  <GlobeIcon className="size-4 shrink-0 text-[#6c7079]" />
                  {selectedRegion && selectedCountry
                    ? selectedCountry === "United States of America" && (selectedState || browseSelectedState)
                      ? `${selectedRegion} → ${selectedCountry} → ${selectedState || browseSelectedState}`
                      : `${selectedRegion} → ${selectedCountry}`
                    : "Browse by region & country"}
                  {browseMenuOpen ? <ChevronUpIcon className="size-4 shrink-0" /> : <ChevronDownIcon className="size-4 shrink-0" />}
                </PButton>
                {selectedCountry && getCountryFlagUrl(selectedCountry) && (
                  <img
                    src={getCountryFlagUrl(selectedCountry)!}
                    alt=""
                    width={28}
                    height={21}
                    className="shrink-0 rounded-sm border border-[#e6e7ea] object-cover"
                  />
                )}
                {loadingCountry && <Spinner className="size-5 text-[#9aa0a8]" />}
              </div>
            </div>

            {/* Search card */}
            <PCard className="mb-6 px-5 py-5 sm:px-6">
              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor="search" className="sr-only">
                  Search
                </label>
                <div className="relative flex h-12 min-w-[240px] flex-1 items-center gap-2.5 rounded-[10px] border border-[#d6d8dc] bg-white px-3.5 transition-colors focus-within:border-[#2563eb]">
                  <SearchIcon className="size-[18px] shrink-0 text-[#9aa0a8]" aria-hidden />
                  <input
                    id="search"
                    placeholder="Airport code / name / country..."
                    value={query}
                    onChange={(e) => handleQueryChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={() => {
                      // Suggestion rows use onMouseDown+preventDefault, so row clicks
                      // land before this closes the dropdown.
                      setSuggestOpen(false);
                      setSuggestHighlight(-1);
                    }}
                    role="combobox"
                    aria-expanded={suggestOpen}
                    aria-autocomplete="list"
                    aria-controls="search-suggestions"
                    autoComplete="off"
                    disabled={loading}
                    className="h-full min-w-0 flex-1 border-none bg-transparent font-mono text-[15px] tracking-[0.02em] text-[#17181c] outline-none placeholder:text-[#9aa0a8] disabled:opacity-60"
                  />
                  <PMono className="hidden text-[11px] text-[#c3c7cd] sm:inline">ICAO</PMono>
                  {suggestOpen && suggestions.length > 0 && (
                    <div
                      id="search-suggestions"
                      role="listbox"
                      aria-label="Airport suggestions"
                      className="absolute left-0 right-0 top-[calc(100%+6px)] z-[120] overflow-hidden rounded-[12px] border border-[#e6e7ea] bg-white py-1 shadow-[0_16px_44px_rgba(16,18,22,.16)]"
                    >
                      {suggestions.map((s, i) => {
                        const flagUrl = getCountryFlagUrl(s.country);
                        return (
                          <button
                            key={`${s.icao}-${s.country}`}
                            type="button"
                            role="option"
                            aria-selected={i === suggestHighlight}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickSuggestion(s)}
                            onMouseEnter={() => setSuggestHighlight(i)}
                            className={`flex w-full cursor-pointer items-center gap-2.5 border-none px-3 py-2 text-left text-sm transition-colors ${
                              i === suggestHighlight ? "bg-[#eef4ff]" : "bg-transparent hover:bg-[#f5f6f7]"
                            }`}
                          >
                            <span className="inline-flex w-[22px] flex-none items-center justify-center">
                              {flagUrl ? (
                                <img
                                  src={flagUrl}
                                  alt=""
                                  width={22}
                                  height={16}
                                  className="rounded-sm border border-[#e6e7ea] object-cover"
                                />
                              ) : (
                                <GlobeIcon className="size-4 text-[#9aa0a8]" />
                              )}
                            </span>
                            <PMono className="whitespace-nowrap text-[13.5px] font-semibold text-[#17181c]">
                              {s.icao}
                            </PMono>
                            <span className="min-w-0 flex-1 truncate text-[#3a3d44]">{s.name}</span>
                            <span className="flex-none text-xs text-[#9aa0a8]">{s.country}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <PButton
                  type="button"
                  variant="primary"
                  className="h-12 shrink-0 px-6 text-[15px]"
                  onClick={() => {
                    void search();
                  }}
                  disabled={loading}
                >
                  {loading ? <Spinner className="size-4" /> : "Find"}
                </PButton>
                <PButton
                  type="button"
                  variant="stop"
                  className="h-12 shrink-0 px-5 text-[15px]"
                  onClick={stopSearch}
                  disabled={!loading && !notamsLoading && !weatherLoading && !aipEadLoadingIcao && !genLoadingPrefix}
                >
                  <SquareIcon className="size-3 fill-current" />
                  Stop search
                </PButton>
              </div>

              {loading && (
                <p className="mt-4 flex items-center gap-2 text-sm text-[#6c7079]">
                  <Spinner className="size-4 shrink-0" />
                  Searching…
                </p>
              )}

              {!loading && hasSearched && (
                <div className="mt-4 space-y-3 border-t border-[#eef0f2] pt-4">
                  {error && (
                    <p className="text-sm text-[#e5484d]">{error}</p>
                  )}
                  {!error && results === null && (
                    <p className="text-sm text-[#6c7079]">Search failed. Try again.</p>
                  )}
                  {!error && results !== null && results.length === 0 && (
                    <p className="text-sm text-[#6c7079]">
                      No airports found. Try ICAO (e.g. OIAA), airport name, or country.
                    </p>
                  )}
                  {!error && results !== null && results.length === 1 && (
                    <p className="py-1 text-xs font-semibold uppercase tracking-wider text-[#9aa0a8]">
                      1 result — AIP data below
                    </p>
                  )}
                  {!error && results !== null && results.length > 1 && (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#9aa0a8]">
                        {results.length} airports — switch tab to view
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        {results.map((airport, i) => {
                          const isActive = (viewingAirport as AIPAirport | null)?.icao === airport.icao;
                          const flagUrl = getCountryFlagUrl(airport.country);
                          return (
                            <div
                              key={`${airport.icao}-${airport.country}`}
                              className={`flex items-center overflow-hidden rounded-[10px] border transition-colors ${
                                isActive
                                  ? "border-[#2563eb] bg-[#eef4ff]"
                                  : "border-[#e6e7ea] bg-white hover:bg-[#f5f6f7]"
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedIcao(airport.icao);
                                }}
                                className="flex min-w-0 cursor-pointer items-center gap-2 border-none bg-transparent px-3 py-2 font-mono text-sm font-semibold text-[#17181c]"
                              >
                                <span className="inline-flex w-[22px] flex-none items-center justify-center">
                                  {flagUrl ? (
                                    <img
                                      src={flagUrl}
                                      alt=""
                                      width={22}
                                      height={16}
                                      className="rounded-sm border border-[#e6e7ea] object-cover"
                                    />
                                  ) : (
                                    <GlobeIcon className="size-4 text-[#9aa0a8]" />
                                  )}
                                </span>
                                <span className="whitespace-nowrap">{airport.icao}</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const next = results.filter((_, j) => j !== i);
                                  setResults(next.length ? next : []);
                                  setSelectedIcao(next.length ? (next[0].icao === airport.icao ? next[0].icao : selectedIcao ?? next[0].icao) : null);
                                }}
                                className="shrink-0 cursor-pointer rounded-sm border-none bg-transparent p-2 text-[#9aa0a8] hover:bg-[#f0f1f3] hover:text-[#e5484d]"
                                title="Close tab"
                              >
                                <XIcon className="size-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      {(viewingAirport as AIPAirport | null)?.icao && (
                        <p className="py-2 text-xs text-[#6c7079]">
                          AIP data for {(viewingAirport as AIPAirport | null)?.icao} below.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </PCard>

            {/* Browse wizard */}
            {browseMenuOpen && (
              <PCard className="mb-6 overflow-hidden">
                <div className="border-b border-[#eef0f2] px-5 pb-4 pt-[18px]">
                  <div className="mb-3 flex flex-wrap items-center gap-3.5">
                    {(regionHasUSA
                      ? ([[1, "Region"], [2, "Country"], [3, "State"], [4, "Aerodromes"]] as const)
                      : ([[1, "Region"], [2, "Country"], [3, "Aerodromes"]] as const)
                    ).map(([n, label]) => (
                      <div key={n} className="flex items-center gap-2">
                        <span
                          className={`flex h-[22px] w-[22px] items-center justify-center rounded-full text-xs font-bold ${
                            browseStep >= n ? "bg-[#2563eb] text-white" : "bg-[#eef0f2] text-[#9aa0a8]"
                          }`}
                        >
                          {n}
                        </span>
                        <span className={`text-[13.5px] ${browseStep === n ? "font-bold text-[#17181c]" : "font-medium text-[#9aa0a8]"}`}>
                          {label}
                        </span>
                      </div>
                    ))}
                    <div className="flex-1" />
                    <PMono className="text-[12.5px] text-[#9aa0a8]">
                      STEP {browseStep} / {regionHasUSA ? 4 : 3}
                    </PMono>
                  </div>
                  <div className="h-[5px] overflow-hidden rounded-full bg-[#eef0f2]">
                    <div
                      className="h-full rounded-full bg-[#2563eb] transition-all duration-300"
                      style={{ width: `${Math.min(100, (browseStep / (regionHasUSA ? 4 : 3)) * 100)}%` }}
                    />
                  </div>
                </div>

                {browseLoading ? (
                  <div className="space-y-3 px-5 py-6">
                    <div className="mb-2 flex items-center justify-center gap-3">
                      <PlaneIcon className="size-6 text-[#2563eb] animate-fly" strokeWidth={1.8} aria-hidden />
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#6c7079]">
                        {browseStep === 1 ? "Loading region…" : browseStep === 2 ? "Loading country…" : "Adding airports…"}
                      </p>
                    </div>
                    <div className="mx-auto max-w-sm space-y-2">
                      {BROWSE_LOADING_STEPS.map((step, i) => (
                        <div key={step.id} className="flex items-center gap-2 text-sm">
                          {i < browseLoadingStepIndex ? (
                            <span className="text-[#2563eb]">✓</span>
                          ) : i === browseLoadingStepIndex ? (
                            <Spinner className="size-3.5 text-[#2563eb]" />
                          ) : (
                            <span className="text-[#c3c7cd]">○</span>
                          )}
                          <span className={i <= browseLoadingStepIndex ? "text-[#17181c]" : "text-[#9aa0a8]"}>
                            {step.label}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mx-auto h-[5px] max-w-sm overflow-hidden rounded-full bg-[#eef0f2]">
                      <div
                        className="h-full rounded-full bg-[#2563eb] transition-all duration-300"
                        style={{ width: `${((browseLoadingStepIndex + 1) / BROWSE_LOADING_STEPS.length) * 100}%` }}
                      />
                    </div>
                  </div>
                ) : browseStep === 1 ? (
                  <div className="space-y-4 px-5 py-5">
                    <div className="space-y-2">
                      <label htmlFor="browse-country-search" className="text-sm font-semibold text-[#17181c]">
                        Find country
                      </label>
                      <div className="relative flex max-w-[420px] items-center">
                        <SearchIcon className="pointer-events-none absolute left-3 size-4 text-[#9aa0a8]" aria-hidden />
                        <input
                          id="browse-country-search"
                          type="search"
                          autoComplete="off"
                          placeholder="Type country or region…"
                          value={browseCountrySearch}
                          onChange={(e) => setBrowseCountrySearch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && countrySearchMatches.length === 1) {
                              e.preventDefault();
                              const only = countrySearchMatches[0];
                              applyBrowseCountrySelection(only.country, only.region);
                            }
                          }}
                          className={`h-[42px] w-full rounded-[10px] border border-[#d6d8dc] bg-white pl-9 text-sm text-[#17181c] outline-none transition-colors focus:border-[#2563eb] ${browseCountrySearch.trim() ? "pr-9" : "pr-3"}`}
                          aria-describedby="browse-country-search-hint"
                        />
                        {browseCountrySearch.trim() ? (
                          <button
                            type="button"
                            aria-label="Clear country search"
                            className="absolute right-2 cursor-pointer rounded border-none bg-transparent p-1 text-[#9aa0a8] hover:text-[#17181c]"
                            onClick={() => setBrowseCountrySearch("")}
                          >
                            <XIcon className="size-4" />
                          </button>
                        ) : null}
                      </div>
                      <p id="browse-country-search-hint" className="text-xs text-[#9aa0a8]">
                        {browseCountrySearch.trim()
                          ? "Pick a country below, or browse by region."
                          : "Or choose a region below to list countries."}
                      </p>
                    </div>
                    {browseCountrySearch.trim() ? (
                      <div className="space-y-2">
                        <PSectionTitle>Matches</PSectionTitle>
                        {countrySearchMatches.length === 0 ? (
                          <p className="py-2 text-sm text-[#6c7079]">No countries match.</p>
                        ) : (
                          <div
                            role="listbox"
                            aria-label="Country search results"
                            className="max-h-[min(220px,40vh)] space-y-1 overflow-y-auto rounded-[10px] border border-[#e6e7ea] bg-white p-1.5"
                          >
                            {countrySearchMatches.map(({ country, region }) => (
                              <button
                                key={`${region}::${country}`}
                                type="button"
                                role="option"
                                className="flex w-full cursor-pointer items-center gap-2 rounded-md border-none bg-transparent px-2 py-2 text-left text-sm transition-colors hover:bg-[#f5f6f7] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20"
                                onClick={() => applyBrowseCountrySelection(country, region)}
                              >
                                <span className="inline-flex w-[22px] flex-none items-center justify-center">
                                  {getCountryFlagUrl(country) ? (
                                    <img
                                      src={getCountryFlagUrl(country)!}
                                      alt=""
                                      width={22}
                                      height={16}
                                      className="rounded-sm object-cover"
                                    />
                                  ) : null}
                                </span>
                                <span className="min-w-0 flex-1 truncate font-semibold">{country}</span>
                                <span className="shrink-0 text-xs text-[#9aa0a8]">{region}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                    <div className={browseCountrySearch.trim() ? "space-y-3 border-t border-[#eef0f2] pt-4" : "space-y-3"}>
                      <p className="text-sm font-semibold text-[#17181c]">Select region</p>
                      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
                        {regions.map((r) => (
                          <button
                            key={r.region}
                            type="button"
                            className={`flex cursor-pointer items-center gap-3.5 rounded-xl border px-[18px] py-4 text-left transition-colors hover:border-[#2563eb] hover:bg-[#f8fbff] ${
                              selectedRegion === r.region ? "border-[#2563eb] bg-[#f8fbff]" : "border-[#e6e7ea] bg-white"
                            }`}
                            onClick={() => {
                              setBrowseCountrySearch("");
                              setSelectedRegion(r.region);
                              setSelectedCountry("");
                              setSelectedState("");
                              setBrowseStep(2);
                            }}
                          >
                            <GlobeIcon className="size-5 shrink-0 text-[#2563eb]" />
                            <span className="flex-1 text-[15px] font-bold">{r.region}</span>
                            <ChevronRightIcon className="size-4 shrink-0 text-[#c3c7cd]" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {!browseLoading && browseStep === 2 && (
                  <div className="space-y-4 px-5 py-5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[#17181c]">Select country</p>
                      <PButton
                        type="button"
                        variant="quiet"
                        size="sm"
                        onClick={() => {
                          setBrowseCountrySearch("");
                          setBrowseStep(1);
                        }}
                      >
                        ← Back
                      </PButton>
                    </div>
                    <p className="text-xs text-[#9aa0a8]">{selectedRegion}</p>
                    <div className="grid max-h-[260px] grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-2 overflow-y-auto pr-1">
                      {countriesInRegion.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`flex cursor-pointer items-center gap-3 rounded-[10px] border px-3.5 py-[11px] text-left transition-colors hover:border-[#2563eb] hover:bg-[#f8fbff] ${
                            selectedCountry === c ? "border-[#2563eb] bg-[#f8fbff]" : "border-[#e6e7ea] bg-white"
                          }`}
                          onClick={() => {
                            setBrowseSelectedCountry(c);
                            setBrowseStep(3);
                          }}
                        >
                          <span className="inline-flex w-[22px] flex-none items-center justify-center">
                            {getCountryFlagUrl(c) && (
                              <img
                                src={getCountryFlagUrl(c)!}
                                alt=""
                                width={20}
                                height={15}
                                className="rounded-sm object-cover"
                              />
                            )}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{c}</span>
                          <ChevronRightIcon className="size-4 shrink-0 text-[#c3c7cd]" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {!browseLoading && browseStep === 3 && isUSABrowse && (
                  <div className="space-y-4 px-5 py-5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[#17181c]">Select state or territory</p>
                      <PButton type="button" variant="quiet" size="sm" onClick={() => setBrowseStep(2)}>
                        ← Back
                      </PButton>
                    </div>
                    <p className="text-xs text-[#9aa0a8]">{selectedRegion} → {browseSelectedCountry}</p>
                    <div className="grid max-h-[260px] grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-2 overflow-y-auto pr-1">
                      {usaStates.map((stateName) => (
                        <button
                          key={stateName}
                          type="button"
                          className={`flex cursor-pointer items-center gap-2.5 rounded-[10px] border px-3.5 py-[11px] text-left transition-colors hover:border-[#2563eb] hover:bg-[#f8fbff] ${
                            browseSelectedState === stateName ? "border-[#2563eb] bg-[#f8fbff]" : "border-[#e6e7ea] bg-white"
                          }`}
                          onClick={() => {
                            setBrowseSelectedState(stateName);
                            setBrowseStep(4);
                          }}
                        >
                          {USA_STATE_ABBR[stateName] ? (
                            <PMono className="shrink-0 text-xs text-[#9aa0a8]">({USA_STATE_ABBR[stateName]})</PMono>
                          ) : null}
                          <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{stateName}</span>
                          <ChevronRightIcon className="size-4 shrink-0 text-[#c3c7cd]" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {!browseLoading && (browseStep === 3 && !isUSABrowse || browseStep === 4) && (
                  <div>
                    <div className="flex flex-wrap items-center gap-3 border-b border-[#eef0f2] px-5 py-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#17181c]">Select airport(s)</p>
                        <p className="mt-0.5 text-xs text-[#9aa0a8]">
                          {browseStep === 4
                            ? `${selectedRegion} → ${browseSelectedCountry} → ${browseSelectedState} · Click to toggle, then Done`
                            : `${selectedRegion} → ${browseSelectedCountry} · Click to toggle, then Done`}
                        </p>
                      </div>
                      <div className="flex-1" />
                      {isAdmin && (
                        <PButton
                          type="button"
                          variant="quiet"
                          size="sm"
                          onClick={() => router.push("/admin/airports/deleted")}
                        >
                          Restore deleted airports
                        </PButton>
                      )}
                    </div>
                    <div className="max-h-[320px] overflow-y-auto px-5 py-2">
                      {loadingCountry ? (
                        <div className="flex items-center justify-center py-8">
                          <Spinner className="size-6 text-[#2563eb]" />
                        </div>
                      ) : browseCountryAirports.length > 0 ? (
                        browseCountryAirports.map((airport) => {
                          const isSelected = browseSelection.some((a) => a.icao === airport.icao);
                          const isDeleting = Boolean(browseDeletingIcaos[airport.icao]);
                          return (
                            <div
                              key={airport.icao}
                              onClick={() => {
                                setBrowseSelection((prev) =>
                                  isSelected
                                    ? prev.filter((a) => a.icao !== airport.icao)
                                    : [...prev, airport]
                                );
                              }}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setBrowseSelection((prev) =>
                                    isSelected
                                      ? prev.filter((a) => a.icao !== airport.icao)
                                      : [...prev, airport]
                                  );
                                }
                              }}
                              className="flex w-full cursor-pointer items-center gap-3.5 border-b border-[#f2f3f5] px-1 py-3 text-left last:border-b-0 focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20"
                            >
                              <span
                                className={`flex h-5 w-5 flex-none items-center justify-center rounded-[6px] border text-xs font-medium transition-colors ${
                                  isSelected
                                    ? "border-[#2563eb] bg-[#2563eb] text-white"
                                    : "border-[#d6d8dc] bg-white"
                                }`}
                              >
                                {isSelected ? "✓" : ""}
                              </span>
                              <span className="inline-flex w-[24px] flex-none items-center justify-center">
                                {getCountryFlagUrl(airport.country) && (
                                  <img
                                    src={getCountryFlagUrl(airport.country)!}
                                    alt=""
                                    width={24}
                                    height={18}
                                    className="rounded object-cover"
                                  />
                                )}
                              </span>
                              <PMono className="w-16 flex-none whitespace-nowrap text-[14.5px] font-semibold text-[#17181c]">
                                {airport.icao}
                              </PMono>
                              <span className="min-w-0 flex-1 truncate text-[14.5px] text-[#3a3d44]">
                                {airport.name}
                              </span>
                              <button
                                type="button"
                                aria-label={`Hide ${airport.icao}`}
                                className="flex h-[30px] w-[30px] flex-none cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-[#9aa0a8] hover:bg-[#fdecec] hover:text-[#e5484d] disabled:opacity-50"
                                disabled={isDeleting}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  void deleteAirportFromPortal(airport);
                                }}
                              >
                                <Trash2Icon className="size-4" />
                              </button>
                            </div>
                          );
                        })
                      ) : (
                        <p className="py-4 text-center text-sm text-[#6c7079]">
                          No airports found for this country.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3.5 border-t border-[#eef0f2] bg-[#fbfbfc] px-5 py-4">
                      <span className="text-sm text-[#6c7079]">
                        <strong className="font-bold text-[#17181c]">{browseSelection.length} selected</strong>
                      </span>
                      <div className="flex-1" />
                      <PButton
                        type="button"
                        variant="secondary"
                        onClick={() => browseStep === 4 ? setBrowseStep(3) : setBrowseStep(2)}
                      >
                        Back
                      </PButton>
                      {browseCountryAirports.length > 0 && (
                        <PButton
                          type="button"
                          variant="primary"
                          onClick={() => {
                            if (browseSelection.length > 0) {
                              // Log each selected airport immediately before animation starts
                              for (const airport of browseSelection) {
                                fetch("/api/search/log", {
                                  method: "POST",
                                  credentials: "include",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ query: airport.icao, resultCount: 1, source: "browse" }),
                                }).catch(() => {});
                              }
                              runBrowseLoading(() => {
                                const merged = [...(results ?? []), ...browseSelection];
                                const byIcao = merged.filter((a, i, arr) => arr.findIndex((x) => x.icao === a.icao) === i);
                                setResults(byIcao);
                                const withCoords = byIcao.find((a) => a.lat != null && a.lon != null);
                                const nextIcao = withCoords?.icao ?? browseSelection[0].icao;
                                setSelectedIcao(nextIcao);
                                setSelectedCountry(browseSelectedCountry);
                                setSelectedState(browseSelectedCountry === "United States of America" ? browseSelectedState : "");
                                setBrowseMenuOpen(false);
                                setHasSearched(true);
                              });
                            }
                          }}
                          disabled={browseSelection.length === 0}
                        >
                          Done · open {browseSelection.length}
                        </PButton>
                      )}
                    </div>
                  </div>
                )}
              </PCard>
            )}

            {/* Recently opened */}
            {!results?.length && recents.length > 0 && (
              <div>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-[17px] font-bold">Recently opened</h2>
                  <span className="text-[13px] text-[#9aa0a8]">Stored on this device</span>
                </div>
                <PCard className="overflow-x-auto">
                  <div className="min-w-[680px]">
                    <div className="grid grid-cols-[110px_1.6fr_1fr_150px_90px] items-center border-b border-[#eef0f2] bg-[#fbfbfc] px-[18px] py-[11px]">
                      <PTh>ICAO</PTh>
                      <PTh>AERODROME</PTh>
                      <PTh>COUNTRY</PTh>
                      <PTh>OPENED</PTh>
                      <PTh className="text-right" />
                    </div>
                    {recents.map((r) => (
                      <div
                        key={r.icao}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setQuery(r.icao);
                          void search(r.icao);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setQuery(r.icao);
                            void search(r.icao);
                          }
                        }}
                        className="grid cursor-pointer grid-cols-[110px_1.6fr_1fr_150px_90px] items-center border-b border-[#f2f3f5] px-[18px] py-[13px] last:border-b-0 hover:bg-[#f8fafc] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20"
                      >
                        <div className="flex items-center gap-2">
                          <span className="inline-flex w-[22px] flex-none items-center justify-center">
                            {getCountryFlagUrl(r.country) ? (
                              <img
                                src={getCountryFlagUrl(r.country)!}
                                alt=""
                                width={22}
                                height={16}
                                className="rounded-sm border border-[#e6e7ea] object-cover"
                              />
                            ) : (
                              <GlobeIcon className="size-4 text-[#9aa0a8]" />
                            )}
                          </span>
                          <PMono className="whitespace-nowrap text-[14.5px] font-semibold">{r.icao}</PMono>
                        </div>
                        <div className="truncate pr-3 text-sm text-[#17181c]">{r.name}</div>
                        <div className="truncate pr-3 text-sm text-[#6c7079]">{r.country}</div>
                        <PMono className="text-[12.5px] text-[#9aa0a8]">{formatRecentTimestamp(r.ts)}</PMono>
                        <div className="flex justify-end">
                          <PButton
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="text-[#1d4ed8]"
                            onClick={(e) => {
                              e.stopPropagation();
                              setQuery(r.icao);
                              void search(r.icao);
                            }}
                          >
                            Open
                          </PButton>
                        </div>
                      </div>
                    ))}
                  </div>
                </PCard>
              </div>
            )}
          </div>
        ) : (
          (() => {
            const detailIcao = viewingAirport.icao;
            const detailFlagUrl = getCountryFlagUrl(viewingAirport.country);
            const detailSynced = supportsSyncedAipIcao(detailIcao);
            const detailCacheEntry = aipEadCache[detailIcao];
            return (
              <div className="mx-auto w-full max-w-[1600px]">
                {/* Breadcrumb */}
                <div className="mb-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedIcao(null)}
                    className="cursor-pointer border-none bg-transparent p-0 text-[13px] font-semibold text-[#6c7079] hover:text-[#17181c]"
                  >
                    Search
                  </button>
                  <ChevronRightIcon className="size-3.5 text-[#c3c7cd]" />
                  <PMono className="text-[13px] text-[#17181c]">{detailIcao}</PMono>
                </div>

                {/* Open airport tabs */}
                {results !== null && results.length > 1 && (
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    {results.map((airport, i) => {
                      const isActive = viewingAirport.icao === airport.icao;
                      const flagUrl = getCountryFlagUrl(airport.country);
                      return (
                        <div
                          key={`${airport.icao}-${airport.country}`}
                          className={`flex items-center overflow-hidden rounded-[10px] border transition-colors ${
                            isActive
                              ? "border-[#2563eb] bg-[#eef4ff]"
                              : "border-[#e6e7ea] bg-white hover:bg-[#f5f6f7]"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedIcao(airport.icao);
                            }}
                            className="flex min-w-0 cursor-pointer items-center gap-2 border-none bg-transparent px-3 py-2 font-mono text-sm font-semibold text-[#17181c]"
                          >
                            <span className="inline-flex w-[22px] flex-none items-center justify-center">
                              {flagUrl ? (
                                <img
                                  src={flagUrl}
                                  alt=""
                                  width={22}
                                  height={16}
                                  className="rounded-sm border border-[#e6e7ea] object-cover"
                                />
                              ) : (
                                <GlobeIcon className="size-4 text-[#9aa0a8]" />
                              )}
                            </span>
                            <span className="whitespace-nowrap">{airport.icao}</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const next = results.filter((_, j) => j !== i);
                              setResults(next.length ? next : []);
                              setSelectedIcao(next.length ? (next[0].icao === airport.icao ? next[0].icao : selectedIcao ?? next[0].icao) : null);
                            }}
                            className="shrink-0 cursor-pointer rounded-sm border-none bg-transparent p-2 text-[#9aa0a8] hover:bg-[#f0f1f3] hover:text-[#e5484d]"
                            title="Close tab"
                          >
                            <XIcon className="size-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Header */}
                <div className="mb-[18px] flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-3">
                      {detailFlagUrl ? (
                        <span className="inline-flex w-[24px] flex-none items-center justify-center self-center">
                          <img
                            src={detailFlagUrl}
                            alt=""
                            width={24}
                            height={18}
                            className="rounded-sm border border-[#e6e7ea] object-cover"
                          />
                        </span>
                      ) : null}
                      <h1 className="m-0 whitespace-nowrap font-mono text-[30px] font-semibold tracking-[0.01em]">{detailIcao}</h1>
                      {viewingAirport.name ? (
                        <span className="text-[22px] font-bold tracking-[-0.01em]">{viewingAirport.name}</span>
                      ) : null}
                      {viewingAirport.country ? (
                        <span className="text-[15px] text-[#6c7079]">{viewingAirport.country}</span>
                      ) : null}
                    </div>
                    {detailSynced && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                        {detailCacheEntry?.updatedAt ? (
                          (() => {
                            const cached = new Date(detailCacheEntry.updatedAt!);
                            const ttlMs = detailCacheEntry.cache?.ttlMs ?? 24 * 60 * 60 * 1000;
                            const expires = new Date(cached.getTime() + ttlMs);
                            const isExpired = expires <= new Date();
                            return (
                              <>
                                <PMono className="text-[12.5px] text-[#9aa0a8]">
                                  Cached {cached.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} · expires {expires.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                                </PMono>
                                {isExpired && (
                                  <span className="rounded-full bg-[#fef3e2] px-2.5 py-1 text-xs font-semibold text-[#b45309]">
                                    PDF expired — will refresh on next sync.
                                  </span>
                                )}
                              </>
                            );
                          })()
                        ) : (
                          <span className="text-[13px] text-[#9aa0a8]">
                            {isAsecnaIcao(detailIcao)
                              ? "AD 2 PDF is fetched dynamically from ASECNA. GEN 1.2 is synced separately."
                              : isBahrainScraperIcao(detailIcao, viewingAirport)
                                ? "AD 2 PDF is fetched dynamically from scraper Web AIP. GEN 1.2 is synced from scraper source."
                              : "PDF is fetched automatically."}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {detailSynced && (
                    <div className="flex flex-none flex-wrap items-center gap-2">
                      <PButton
                        type="button"
                        variant="primary"
                        disabled={
                          pdfDownloading ||
                          !(
                            aipPdfReady[viewingAirport.icao] ||
                            aipEadCache[viewingAirport.icao]?.updatedAt ||
                            aipPdfExistsOnServer[viewingAirport.icao]
                          )
                        }
                        title={
                          aipPdfReady[viewingAirport.icao] ||
                          aipEadCache[viewingAirport.icao]?.updatedAt ||
                          aipPdfExistsOnServer[viewingAirport.icao]
                            ? "Download current AIP PDF (AD 2)"
                            : "Sync this airport first to download the PDF"
                        }
                        onClick={async () => {
                          if (!viewingAirport?.icao) return;
                          const icao = viewingAirport.icao;
                          if (getCaptchaCountryByIcao(icao)) {
                            setPdfDownloadError(null);
                            setAipEadSyncSteps([
                              "Captcha verification required. Opened embedded noVNC viewer. Complete it before downloading this AIP PDF.",
                            ]);
                            void openCaptchaNoVncPopup(icao);
                            return;
                          }
                          const pushPdfStep = (step: string) => {
                            setAipEadSyncSteps((prev) => (prev[prev.length - 1] === step ? prev : [...prev, step]));
                          };
                          setPdfDownloadError(null);
                          setPdfDownloading(true);
                          setAipEadLoadingIcao(icao);
                          setAipEadSyncingIcao(icao);
                          setAipEadSyncRequestedIcao(null);
                          setAipEadSyncSteps(["Checking PDF cache on server…"]);
                          let slowHintTimer: number | null = null;
                          try {
                            const pdfRoute = isAsecnaIcao(icao)
                              ? "/api/aip/asecna/pdf"
                              : isBahrainScraperIcao(icao, viewingAirport)
                                ? "/api/aip/scraper/pdf"
                                : "/api/aip/ead/pdf";
                            const pdfSource = isAsecnaIcao(icao) ? "asecna"
                              : isBahrainScraperIcao(icao, viewingAirport) ? "scraper"
                              : isUsaAipIcao(icao) ? "usa"
                              : "ead";

                            // Fetch download time estimate (fire-and-forget, non-blocking)
                            const estimateData = await fetch(
                              `/api/aip/download-estimate?icao=${encodeURIComponent(icao)}&source=${pdfSource}`,
                              { cache: "no-store" }
                            ).then((r) => r.json()).catch(() => null) as { estimate: number | null } | null;
                            const estimateMs = estimateData?.estimate ?? null;
                            const fmtEstimate = (ms: number) => {
                              if (ms < 60_000) return `~${Math.round(ms / 1000)}s`;
                              const m = Math.floor(ms / 60_000);
                              const s = Math.round((ms % 60_000) / 1000);
                              return s > 0 ? `~${m}m ${s}s` : `~${m}m`;
                            };

                            const headRes = await fetch(`${pdfRoute}?icao=${encodeURIComponent(icao)}`, {
                              method: "HEAD",
                              cache: "no-store",
                            }).catch(() => null);
                            if (headRes?.ok) {
                              pushPdfStep("Cached PDF found in storage.");
                            } else {
                              pushPdfStep("PDF missing in cache. Triggering source download…");
                            }
                            slowHintTimer = window.setTimeout(() => {
                              pushPdfStep("Still fetching PDF from source… this may take up to 1-2 minutes.");
                            }, 12000);
                            pushPdfStep(estimateMs !== null
                              ? `Downloading PDF bytes… (estimated ${fmtEstimate(estimateMs)})`
                              : "Downloading PDF bytes…");
                            const downloadStart = Date.now();
                            const res = await fetch(
                              `${pdfRoute}?icao=${encodeURIComponent(icao)}&download=1`
                            );
                            if (!res.ok) {
                              const data = await res.json().catch(() => ({}));
                              const msg = data.detail || data.error || "Failed to load PDF";
                              pushPdfStep(`Failed: ${msg}`);
                              setPdfDownloadError(msg);
                              return;
                            }
                            pushPdfStep("Preparing file for browser download…");
                            const blob = await res.blob();
                            const downloadDurationMs = Date.now() - downloadStart;
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `${icao}_${isAsecnaIcao(icao) ? "ASECNA" : isBahrainScraperIcao(icao, viewingAirport) ? "SCRAPER" : "AIP"}_AD2.pdf`;
                            a.click();
                            URL.revokeObjectURL(url);
                            setAipPdfReady((prev) => ({ ...prev, [icao]: true }));
                            setAipPdfExistsOnServer((prev) => ({ ...prev, [icao]: true }));
                            pushPdfStep(`Download started (took ${fmtEstimate(downloadDurationMs)}).`);
                          } catch (err) {
                            pushPdfStep("Failed to download PDF.");
                            setPdfDownloadError(err instanceof Error ? err.message : "Failed to load PDF");
                          } finally {
                            if (slowHintTimer != null) window.clearTimeout(slowHintTimer);
                            setPdfDownloading(false);
                            window.setTimeout(() => {
                              setAipEadLoadingIcao((prev) => (prev === icao ? null : prev));
                              setAipEadSyncingIcao((prev) => (prev === icao ? null : prev));
                              setAipEadSyncSteps((prev) => (prev.length ? [] : prev));
                            }, 900);
                          }
                        }}
                      >
                        <Download className={`size-4 shrink-0 ${pdfDownloading ? "animate-pulse" : ""}`} />
                        Download PDF
                      </PButton>
                      {(isEadIcao(viewingAirport.icao) || isRussiaIcao(viewingAirport.icao) || isAsecnaIcao(viewingAirport.icao) || isBahrainScraperIcao(viewingAirport.icao, viewingAirport) || isUsaAipIcao(viewingAirport.icao)) && (
                        <div
                          ref={genPopoverAnchorRef}
                          className="relative"
                          onMouseEnter={() => setShowGenSyncOverlay(true)}
                          onMouseLeave={() => setShowGenSyncOverlay(false)}
                        >
                          <PButton
                            type="button"
                            variant="secondary"
                            onClick={() => downloadGenPdfWithSync(viewingAirport.icao, isAsecnaAirport(viewingAirport), isBahrainScraperAirport(viewingAirport))}
                            disabled={
                              genPdfDownloading ||
                              isJapanScraperIcao(viewingAirport.icao) ||
                              (isAsecnaAirport(viewingAirport) && !hasAsecnaGen12(viewingAirport.icao))
                            }
                            title={
                              isJapanScraperIcao(viewingAirport.icao)
                                ? "No GEN files to scrape for Japan"
                                : isAsecnaAirport(viewingAirport) && !hasAsecnaGen12(viewingAirport.icao)
                                ? "GEN 1.2 is not available for this ASECNA country"
                                : "Instantly fetch and download GEN PDF"
                            }
                          >
                            <Download className={`size-4 shrink-0 ${genPdfDownloading ? "animate-pulse" : ""}`} />
                            GEN PDF
                          </PButton>
                          <GenPopover
                            open={showGenSyncOverlay && !isJapanScraperIcao(viewingAirport.icao)}
                            anchorRef={genPopoverAnchorRef}
                            onMouseEnter={() => setShowGenSyncOverlay(true)}
                            onMouseLeave={() => setShowGenSyncOverlay(false)}
                          >
                              {isAsecnaAirport(viewingAirport) && !hasAsecnaGen12(viewingAirport.icao) ? (
                                <>
                                  <PSectionTitle className="mb-1.5">
                                    Not Available
                                  </PSectionTitle>
                                  <p className="text-xs text-[#3a3d44]">
                                    GEN 1.2 is not published on the ASECNA eAIP for this country.
                                  </p>
                                </>
                              ) : (
                                <>
                                  <PSectionTitle className="mb-1.5">
                                    GEN loading steps
                                  </PSectionTitle>
                                  <ul className="space-y-1 text-xs text-[#3a3d44]">
                                    {(genSyncSteps.length > 0
                                      ? genSyncSteps
                                      : [
                                          "Checking GEN PDF cache…",
                                          "Downloading GEN PDF from source…",
                                          "Uploading to storage…",
                                          "Preparing download…",
                                        ]).map((step, i) => (
                                      <li key={`${step}-${i}`} className="flex items-start gap-1.5">
                                        <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-[#2563eb]/70" />
                                        <span>{step}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </>
                              )}
                          </GenPopover>
                        </div>
                      )}
                      {Boolean(
                        viewingAirport.webAipUrl ||
                        getAsecnaAirportByIcao(viewingAirport.icao)?.webAipUrl ||
                        getScraperWebAipUrlByCountryOrIcao(viewingAirport.country, viewingAirport.icao) ||
                        getEadWebAipUrlForAirport(viewingAirport) ||
                        isUsaAipIcao(viewingAirport.icao)
                      ) && (
                        <button
                          type="button"
                          className="inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-[#c9ddff] bg-[#eef4ff] px-4 py-[10px] text-sm font-semibold text-[#1d4ed8] transition-colors hover:bg-[#e0eaff] disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => {
                            const isUsa = isUsaAipIcao(viewingAirport.icao);
                            const isRussia = isRussiaIcao(viewingAirport.icao);
                            const webAip =
                              viewingAirport.webAipUrl ||
                              getAsecnaAirportByIcao(viewingAirport.icao)?.webAipUrl ||
                              getScraperWebAipUrlByCountryOrIcao(viewingAirport.country, viewingAirport.icao) ||
                              getEadWebAipUrlForAirport(viewingAirport) ||
                              (isUsa ? USA_WEB_AIP_URL : null);
                            if (webAip) {
                              if (isUsa || isRussia) {
                                window.open(webAip, "_blank", "noopener,noreferrer");
                                return;
                              }
                              setWebAipConsent({
                                url: webAip,
                                label: viewingAirport.country || viewingAirport.icao || "this airport",
                              });
                            }
                          }}
                          title={
                            isAsecnaIcao(viewingAirport.icao)
                              ? "Open ASECNA Web AIP"
                              : isUsaAipIcao(viewingAirport.icao)
                                ? "Open FAA USA AIP"
                              : `Open ${viewingAirport.country || "Airport"} Web AIP`
                          }
                        >
                          <GlobeIcon className="size-4 shrink-0" />
                          Web AIP
                        </button>
                      )}
                      <span className="hidden h-[26px] w-px bg-[#e6e7ea] sm:block" />
                      <button
                        type="button"
                        className="inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-[#f6cdcf] bg-[#fdecec] px-4 py-[10px] text-sm font-semibold text-[#e5484d] transition-colors hover:bg-[#fadadb] disabled:cursor-not-allowed disabled:opacity-50"
                        title="Report a bug for this airport"
                        onClick={() => {
                          setBugReportError(null);
                          setBugModalOpen(true);
                        }}
                      >
                        <FileWarningIcon className="size-4 shrink-0" />
                        Report a problem
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-start gap-5">
                  {/* Document column */}
                  <div className="min-w-0 flex-1 basis-[560px] space-y-5">
                    {detailSynced ? (
                      <PCard className={`overflow-hidden ${aipEadSyncingIcao === viewingAirport.icao ? "ring-2 ring-[#2563eb]/70" : ""}`}>
                        <div className="flex flex-wrap items-center gap-3.5 border-b border-[#eef0f2] px-[18px] py-3.5">
                          <span className="text-[13.5px] font-semibold text-[#17181c]">PDF Viewer</span>
                          <PMono className="text-[12.5px] text-[#9aa0a8]">
                            AIP ({isAsecnaIcao(viewingAirport.icao) ? "ASECNA" : isBahrainScraperIcao(viewingAirport.icao, viewingAirport) ? "Scraper" : isRussiaIcao(viewingAirport.icao) ? "Russia" : "EAD"}) · {viewingAirport.icao}
                          </PMono>
                        </div>
                        <div className="border-b border-[#dbe6ff] bg-[#f2f7ff] px-[18px] py-[11px] text-[13.5px] text-[#3a5170]">
                          Source:{" "}
                          <strong className="font-bold text-[#1d4ed8]">
                            {isAsecnaIcao(viewingAirport.icao)
                              ? "ASECNA Web AIP (dynamically updated)"
                              : isUsaAipIcao(viewingAirport.icao)
                                ? "FAA USA AIP (hard-coded source PDF set)"
                              : isBahrainScraperIcao(viewingAirport.icao, viewingAirport)
                                ? `${viewingAirport.country || "Scraper"} Web AIP (dynamically updated)`
                              : isRussiaIcao(viewingAirport.icao)
                                ? "CAICA Russia AIP"
                                : "Eurocontrol (EAD)"}
                          </strong>.
                          {" "}
                          {isAsecnaIcao(viewingAirport.icao)
                            ? "PDF is fetched from live ASECNA source and stored to S3."
                            : isUsaAipIcao(viewingAirport.icao)
                              ? "PDF is loaded from hard-coded FAA USA AIP files stored in S3."
                            : isBahrainScraperIcao(viewingAirport.icao, viewingAirport)
                              ? "PDF is fetched from live scraper source and stored to S3."
                            : "PDF is fetched automatically."}
                          {isBahrainScraperIcao(viewingAirport.icao, viewingAirport) && viewingAirport.effectiveDate
                            ? ` Effective: ${viewingAirport.effectiveDate}.`
                            : ""}
                        </div>
                        <div className="p-[18px]">
                          {isKuwaitScraperIcao(viewingAirport.icao) && (
                            <div className="mb-3 rounded-[10px] border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                              Kuwait AIP access is now paid. Review the subscription terms and pricing in the official order form before requesting files.
                              {" "}
                              <a
                                href="https://dgcawebappstg.blob.core.windows.net/upload/AIPItemSub/live/627/AIP%20Subscription%20order%20form%202026.pdf"
                                target="_blank"
                                rel="noreferrer"
                                className="underline underline-offset-2 font-medium"
                              >
                                Open 2026 AIP subscription order form (PDF)
                              </a>
                              {" "}·{" "}
                              <a
                                href="https://dgca.gov.kw/AIP"
                                target="_blank"
                                rel="noreferrer"
                                className="underline underline-offset-2 font-medium"
                              >
                                Open DGCA Kuwait AIP page
                              </a>
                              .
                            </div>
                          )}
                          {isUsaAipIcao(viewingAirport.icao) && (
                            <div className="mb-3 rounded-[10px] border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                              USA AIP here uses hard-coded PDF files extracted from an FAA multi-page document released on 10.11.2016.
                              {" "}
                              <a
                                href={USA_WEB_AIP_URL}
                                target="_blank"
                                rel="noreferrer"
                                className="underline underline-offset-2 font-medium"
                              >
                                Open FAA AIP web publication
                              </a>
                              .
                            </div>
                          )}
                          {pdfDownloadError && (
                            <p className="mb-2 text-sm text-[#e5484d]">{pdfDownloadError}</p>
                          )}
                          {aipEadLoadingIcao !== viewingAirport.icao && (
                            <div className="mb-3 rounded-[10px] border border-[#e6e7ea] bg-[#fbfbfc] p-2">
                              {aipPdfReady[viewingAirport.icao] ||
                              aipPdfExistsOnServer[viewingAirport.icao] ? (
                                <object
                                  data={`${isAsecnaIcao(viewingAirport.icao) ? "/api/aip/asecna/pdf" : isBahrainScraperIcao(viewingAirport.icao, viewingAirport) ? "/api/aip/scraper/pdf" : isUsaAipIcao(viewingAirport.icao) ? "/api/aip/usa/pdf" : "/api/aip/ead/pdf"}?icao=${encodeURIComponent(viewingAirport.icao)}&inline=1`}
                                  type="application/pdf"
                                  className="h-[520px] w-full rounded-md border border-[#e6e7ea] bg-white"
                                  aria-label={`AIP PDF ${viewingAirport.icao}`}
                                >
                                  <div className="p-3 text-sm text-[#6c7079]">
                                    Native PDF preview is not available in this browser.
                                    {" "}
                                    <a
                                      href={`${isAsecnaIcao(viewingAirport.icao) ? "/api/aip/asecna/pdf" : isBahrainScraperIcao(viewingAirport.icao, viewingAirport) ? "/api/aip/scraper/pdf" : isUsaAipIcao(viewingAirport.icao) ? "/api/aip/usa/pdf" : "/api/aip/ead/pdf"}?icao=${encodeURIComponent(viewingAirport.icao)}&inline=1`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="underline underline-offset-2"
                                    >
                                      Open PDF in new tab
                                    </a>
                                    {" "}or{" "}
                                    <a
                                      href={`${isAsecnaIcao(viewingAirport.icao) ? "/api/aip/asecna/pdf" : isBahrainScraperIcao(viewingAirport.icao, viewingAirport) ? "/api/aip/scraper/pdf" : isUsaAipIcao(viewingAirport.icao) ? "/api/aip/usa/pdf" : "/api/aip/ead/pdf"}?icao=${encodeURIComponent(viewingAirport.icao)}&download=1`}
                                      className="underline underline-offset-2"
                                    >
                                      download it
                                    </a>
                                    .
                                  </div>
                                </object>
                              ) : aipEadLoadingIcao === viewingAirport.icao ? null : (
                                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
                                  <div className="flex items-center gap-2">
                                    <Spinner className="size-4 shrink-0 text-amber-700" />
                                    <span className="font-medium">
                                      PDF is still loading from the source website.
                                    </span>
                                  </div>
                                  <p>
                                    Some airports serve large files slowly. The sync is still running unless an error appears.
                                  </p>
                                  {aipEadSyncSteps.length > 0 && (
                                    <div className="rounded border border-amber-300/60 bg-amber-100/40 p-2 font-mono text-[11px] leading-5 whitespace-pre-wrap">
                                      {aipEadSyncSteps.map((step, i) => (
                                        <div key={`${step}-${i}`}>{step}</div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          {aipEadLoadingIcao === viewingAirport.icao && (
                            <div className="flex flex-col gap-4 py-4 animate-fade-in">
                              {aipEadSyncingIcao === viewingAirport.icao ? (
                                <div
                                  className={`space-y-2 rounded-xl border-2 p-4 ${
                                    aipPdfSlowIcao === viewingAirport.icao
                                      ? "border-amber-300 bg-amber-50 text-amber-900"
                                      : "border-[#e6e7ea] bg-[#fbfbfc] text-[#17181c]"
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <Spinner className={`size-4 shrink-0 ${aipPdfSlowIcao === viewingAirport.icao ? "text-amber-700" : "text-[#2563eb]"}`} />
                                    <span className="text-sm font-medium">Fetching AIP PDF…</span>
                                  </div>
                                  <p className={`text-xs ${aipPdfSlowIcao === viewingAirport.icao ? "text-amber-800" : "text-[#6c7079]"}`}>
                                    Live status · elapsed {aipSyncElapsedSec}s
                                  </p>
                                  {aipPdfSlowIcao === viewingAirport.icao && (
                                    <p className="text-xs text-amber-800">
                                      Source is still responding. Sync is running; large files can take extra time.
                                    </p>
                                  )}
                                  {aipEadSyncSteps.length > 0 && (
                                    <div
                                      className={`rounded p-2 font-mono text-[11px] leading-5 whitespace-pre-wrap ${
                                        aipPdfSlowIcao === viewingAirport.icao
                                          ? "border border-amber-200 bg-white/80 text-amber-900"
                                          : "border border-[#e6e7ea] bg-white text-[#6c7079]"
                                      }`}
                                    >
                                      {aipEadSyncSteps.map((step, i) => (
                                        <div key={i}>{step}</div>
                                      ))}
                                    </div>
                                  )}
                                  {aipEadSyncSteps.length === 0 && (
                                    <span className={`text-xs ${aipPdfSlowIcao === viewingAirport.icao ? "text-amber-800" : "text-[#6c7079]"}`}>
                                      Checking cache first, then fetching live PDF if needed…
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2 text-sm text-[#6c7079]">
                                    <Spinner className="size-4 shrink-0 text-[#2563eb]" />
                                    <span>Loading AIP cache…</span>
                                  </div>
                                  <div className="space-y-2 section-loading-skeleton rounded-lg border border-[#e6e7ea] bg-[#fbfbfc] p-4">
                                    <div className="h-4 w-24 rounded bg-[#f0f1f3]" />
                                    <div className="h-3 w-full rounded bg-[#f0f1f3]" />
                                    <div className="h-3 w-5/6 rounded bg-[#f0f1f3]" />
                                    <div className="h-3 w-4/5 rounded bg-[#f0f1f3] mt-3" />
                                    <div className="h-3 w-full rounded bg-[#f0f1f3]" />
                                    <div className="h-3 w-2/3 rounded bg-[#f0f1f3] mt-3" />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          {aipEadLoadingIcao !== viewingAirport.icao && aipEadCache[viewingAirport.icao]?.error && (
                            <p className="py-2 text-sm text-[#e5484d]">{aipEadCache[viewingAirport.icao].error}</p>
                          )}
                        </div>
                      </PCard>
                    ) : (
                      <PCard className="overflow-hidden">
                        <div className="border-b border-[#eef0f2] px-[18px] py-3.5">
                          <div className="text-base font-bold">AIP — {viewingAirport.icao}</div>
                          <p className="mt-0.5 text-sm text-[#6c7079]">
                            Stored AIP data from portal. For EAD/Russia airports, search an ICAO like EDQA or UUEE to use the PDF flow.
                          </p>
                        </div>
                        <div className="p-[18px]">
                          <div className="mb-3 rounded-[10px] border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                            Source:{" "}
                            <strong>
                              {viewingAirport.sourceType === "ASECNA_DYNAMIC"
                                ? "ASECNA (Dynamically Updated)"
                                : "Hard Coded (PDF Based)"}
                            </strong>.
                            {" "}
                            {viewingAirport.sourceType === "ASECNA_DYNAMIC"
                              ? "Data is refreshed from live Web AIP sync."
                              : "This information may be old and inaccurate."}
                          </div>
                          <AIPResultCard airport={viewingAirport} />
                        </div>
                      </PCard>
                    )}
                  </div>

                  {/* Right rail */}
                  {showMap && (
                    <div className="hidden w-[min(380px,36vw)] flex-none flex-col gap-3.5 lg:flex">
                      {/* LOCATION */}
                      <PCard className="overflow-hidden">
                        <div className="flex items-center gap-2 border-b border-[#eef0f2] px-[15px] py-3">
                          <MapPinIcon className="size-[15px] text-[#6c7079]" />
                          <span className="flex-1 text-[11px] font-bold tracking-[0.12em] text-[#6c7079]">LOCATION</span>
                          {viewingAirport.lat != null && viewingAirport.lon != null && (
                            <PMono className="text-[11.5px] text-[#9aa0a8]">
                              {viewingAirport.lat.toFixed(4)} {viewingAirport.lon.toFixed(4)}
                            </PMono>
                          )}
                        </div>
                        <div className="h-[240px]">
                          {viewingAirport.lat != null && viewingAirport.lon != null ? (
                            <AirportMap
                              lat={viewingAirport.lat}
                              lon={viewingAirport.lon}
                              icao={viewingAirport.icao}
                              name={viewingAirport.name}
                              className="w-full h-full"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-[#f5f6f7] p-4 text-center text-sm text-[#6c7079]">
                              Coordinates will appear after AIP sync or when available from data.
                            </div>
                          )}
                        </div>
                      </PCard>

                      {/* NOTAMS */}
                      <PCard className="overflow-hidden">
                        <div className="flex items-center gap-2 border-b border-[#eef0f2] px-[15px] py-3">
                          <ScrollTextIcon className="size-[15px] text-[#6c7079]" />
                          <span className="flex-1 text-[11px] font-bold tracking-[0.12em] text-[#6c7079]">NOTAMS — {viewingAirport.icao}</span>
                          <button
                            type="button"
                            className="flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-[7px] border-none bg-transparent text-[#9aa0a8] hover:bg-[#f0f1f3] hover:text-[#17181c] disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => requestSyncNotams(viewingAirport.icao)}
                            disabled={notamsLoading}
                            title="Refresh NOTAMs"
                          >
                            <RefreshCwIcon className={`size-3.5 ${notamsLoading ? "animate-spin" : ""}`} />
                          </button>
                        </div>
                        {!notamsLoading && notamsUpdatedAt && (
                          <div className="border-b border-[#f2f3f5] px-[15px] py-2">
                            <PMono className="text-[11.5px] text-[#9aa0a8]">
                              updated {new Date(notamsUpdatedAt).toLocaleString()}
                            </PMono>
                          </div>
                        )}
                        <div className="max-h-[340px] overflow-auto px-[15px] py-3">
                          {notamsLoading && (
                            <div className="flex flex-col gap-4 py-2 animate-fade-in">
                              {notamsSyncing ? (
                                <div className="space-y-3 rounded-lg border border-[#e6e7ea] bg-[#fbfbfc] p-4">
                                  <div className="flex items-center gap-2">
                                    <Spinner className="size-4 shrink-0 text-[#6c7079]" />
                                    <span className="text-sm font-medium">Loading steps…</span>
                                  </div>
                                  {notamsSyncSteps.length > 0 && (
                                    <ul className="list-disc space-y-1 pl-5 text-xs text-[#6c7079]">
                                      {notamsSyncSteps.map((step, i) => (
                                        <li key={i}>{step}</li>
                                      ))}
                                    </ul>
                                  )}
                                  {notamsSyncSteps.length === 0 && (
                                    <span className="text-xs text-[#6c7079]">Starting loading steps · can take 1–2 min</span>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2 text-sm text-[#6c7079]">
                                    <Spinner className="size-4 shrink-0 text-[#6c7079]" />
                                    <span>Loading NOTAMs…</span>
                                  </div>
                                  <div className="space-y-2 section-loading-skeleton">
                                    <div className="h-3 w-full rounded bg-[#f0f1f3]" />
                                    <div className="h-3 w-4/5 rounded bg-[#f0f1f3]" />
                                    <div className="h-3 w-3/4 rounded bg-[#f0f1f3]" />
                                    <div className="mt-2 h-12 w-full rounded bg-[#f0f1f3]" />
                                    <div className="h-3 w-2/3 rounded bg-[#f0f1f3]" />
                                    <div className="mt-2 h-12 w-full rounded bg-[#f0f1f3]" />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          {!notamsLoading && notamsError && (
                            <div className="space-y-2 py-2">
                              <p className="text-sm font-medium text-[#e5484d]">NOTAMs unavailable</p>
                              <p className="break-words text-xs text-[#6c7079]">{notamsError}</p>
                              <p className="text-xs text-[#6c7079]">Run locally: <code className="rounded bg-[#f0f1f3] px-1">node scripts/skylink-notams.mjs --json {viewingAirport?.icao}</code> to verify SkyLink NOTAM retrieval.</p>
                            </div>
                          )}
                          {!notamsLoading && !notamsError && notams && notams.length === 0 && (
                            <p className="py-2 text-sm text-[#6c7079]">No NOTAMs returned.</p>
                          )}
                          {!notamsLoading && !notamsError && notams && notams.length > 0 && (
                            <ul className="space-y-3">
                              {notams.slice(0, 50).map((n, i) => (
                                <li key={`${n.number}-${i}`} className="border-b border-[#f2f3f5] pb-2 text-xs last:border-0">
                                  <div className="mb-0.5 flex flex-wrap gap-x-2 gap-y-0.5 font-semibold text-[#17181c]">
                                    <span className="font-mono">{n.number}</span>
                                    <span className="text-[#6c7079]">{n.class}</span>
                                    {(n.startDateUtc || n.endDateUtc) && (
                                      <span className="font-mono font-normal text-[#9aa0a8]">
                                        {[n.startDateUtc, n.endDateUtc].filter(Boolean).join(" → ")}
                                      </span>
                                    )}
                                  </div>
                                  <p className="whitespace-pre-wrap break-words leading-snug text-[#3a3d44]">
                                    {n.condition
                                      .split("\n")
                                      .filter((line) => !/^\|#\d+\|[-\s]+/.test(line) && !/^[A-Z]\d+\/\d+\s+NOTAM[A-Z]?\s/.test(line))
                                      .join("\n")
                                      .trim()}
                                  </p>
                                </li>
                              ))}
                              {notams.length > 50 && (
                                <li className="pt-1 text-xs text-[#9aa0a8]">
                                  +{notams.length - 50} more NOTAMs
                                </li>
                              )}
                            </ul>
                          )}
                        </div>
                      </PCard>

                      {/* WEATHER */}
                      <PCard className="overflow-hidden">
                        <div className="flex items-center gap-2 border-b border-[#eef0f2] px-[15px] py-3">
                          <CloudSunIcon className="size-[15px] text-[#6c7079]" />
                          <span className="flex-1 text-[11px] font-bold tracking-[0.12em] text-[#6c7079]">WEATHER — {viewingAirport.icao}</span>
                          <button
                            type="button"
                            className="flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-[7px] border-none bg-transparent text-[#9aa0a8] hover:bg-[#f0f1f3] hover:text-[#17181c] disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => requestSyncWeather(viewingAirport.icao)}
                            disabled={weatherLoading}
                            title="Refresh weather"
                          >
                            <RefreshCwIcon className={`size-3.5 ${weatherLoading ? "animate-spin" : ""}`} />
                          </button>
                        </div>
                        {!weatherLoading && cachedWeather?.updatedAt && (
                          <div className="border-b border-[#f2f3f5] px-[15px] py-2">
                            <PMono className="text-[11.5px] text-[#9aa0a8]">
                              updated {new Date(cachedWeather.updatedAt).toLocaleString()}
                            </PMono>
                          </div>
                        )}
                        <div className="max-h-[340px] overflow-auto px-[15px] py-3">
                          {weatherLoading && (
                            <div className="space-y-3 rounded-lg border border-[#e6e7ea] bg-[#fbfbfc] p-4">
                              <div className="flex items-center gap-2">
                                <Spinner className="size-4 shrink-0 text-[#6c7079]" />
                                <span className="text-sm font-medium">
                                  {weatherSyncing ? "Loading steps…" : "Loading weather..."}
                                </span>
                              </div>
                              {weatherSyncing && weatherSyncSteps.length > 0 && (
                                <ul className="list-disc space-y-1 pl-5 text-xs text-[#6c7079]">
                                  {weatherSyncSteps.map((step, i) => (
                                    <li key={i}>{step}</li>
                                  ))}
                                </ul>
                              )}
                              {weatherSyncing && weatherSyncSteps.length === 0 && (
                                <div className="space-y-2 section-loading-skeleton">
                                  <div className="h-3 w-full rounded bg-[#f0f1f3]" />
                                  <div className="h-3 w-4/5 rounded bg-[#f0f1f3]" />
                                  <div className="h-3 w-3/4 rounded bg-[#f0f1f3]" />
                                  <div className="mt-2 h-12 w-full rounded bg-[#f0f1f3]" />
                                </div>
                              )}
                            </div>
                          )}
                          {!weatherLoading && cachedWeather?.error && (
                            <p className="break-words text-xs text-[#e5484d]">{cachedWeather.error}</p>
                          )}
                          {!weatherLoading && !cachedWeather?.error && (
                            <>
                              {weatherDisplay.bullets.length > 0 ? (
                                <div className="space-y-3">
                                  {weatherDisplay.airportLine && (
                                    <p className="whitespace-pre-wrap break-words text-xs text-[#6c7079]">
                                      {weatherDisplay.airportLine}
                                    </p>
                                  )}
                                  <ul className="space-y-3">
                                    {weatherDisplay.bullets.map((b, i) => (
                                      <li key={`${b.kind}-${b.id}-${i}`} className="text-xs">
                                        <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                          <PMono className="text-[12.5px] font-semibold text-[#17181c]">{b.id}</PMono>
                                          <span className="text-[11px] font-bold tracking-[0.06em] text-[#6c7079]">{b.kind}</span>
                                        </div>
                                        <p className="whitespace-pre-wrap break-words rounded-lg bg-[#f5f6f7] px-[11px] py-[9px] font-mono text-[12.5px] leading-relaxed text-[#3a3d44]">
                                          {b.body}
                                        </p>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : weatherDisplay.strippedPlain.trim() ? (
                                <pre className="whitespace-pre-wrap break-words rounded-lg bg-[#f5f6f7] px-[11px] py-[9px] font-mono text-[12px] leading-5 text-[#3a3d44]">
                                  {weatherDisplay.strippedPlain}
                                </pre>
                              ) : (
                                <p className="py-2 text-sm text-[#6c7079]">No weather text returned yet.</p>
                              )}
                            </>
                          )}
                        </div>
                      </PCard>
                    </div>
                  )}
                </div>
              </div>
            );
          })()
        )}

        {/* Web AIP consent modal */}
        {webAipConsent && (
          <div className="fixed inset-0 z-[2200] flex items-end justify-center bg-[rgba(16,18,22,.42)] p-3 sm:items-center sm:p-8">
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Web AIP access notice"
              className="w-full max-w-[520px] rounded-2xl bg-white p-5 shadow-[0_24px_70px_rgba(16,18,22,.28)] sm:p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold sm:text-lg">Before opening Web AIP</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#6c7079] sm:text-sm">
                    These links are from official websites and can be paid or inaccessible due to geographical position.
                    If this source is not working, you can always find actual new and free information on{" "}
                    <a
                      href={EAD_BASIC_LOGIN_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium underline underline-offset-2"
                    >
                      EUROCONTROL EAD Basic
                    </a>
                    .
                  </p>
                  <p className="mt-2 text-[11px] text-[#6c7079] sm:text-xs">
                    Target source: <span className="font-medium text-[#17181c]">{webAipConsent.label}</span>
                  </p>
                </div>
                <button
                  type="button"
                  className="flex h-[30px] w-[30px] flex-none cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-[#9aa0a8] hover:bg-[#f0f1f3]"
                  onClick={() => setWebAipConsent(null)}
                >
                  <XIcon className="size-4" />
                </button>
              </div>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <PButton type="button" variant="secondary" onClick={() => setWebAipConsent(null)}>
                  Cancel
                </PButton>
                <PButton
                  type="button"
                  variant="primary"
                  onClick={() => {
                    window.open(webAipConsent.url, "_blank", "noopener,noreferrer");
                    setWebAipConsent(null);
                  }}
                >
                  I understand, open Web AIP
                </PButton>
              </div>
            </div>
          </div>
        )}

        <CaptchaConsentDialog
          open={captchaConsentDialog.open}
          country={captchaConsentDialog.country}
          onContinue={handleCaptchaConsentContinue}
          onDontShowAgain={handleCaptchaConsentDontShowAgain}
          onClose={handleCaptchaConsentClose}
        />

        <BugReportModal
          open={bugModalOpen}
          initialIcao={viewingAirport?.icao || null}
          submitting={bugReportSubmitting}
          error={bugReportError}
          onClose={() => setBugModalOpen(false)}
          onSubmit={submitBugReport}
        />

        <BugReportsHoverBanner
          reports={bugReports}
          onDeleteFixed={deleteFixedBugReport}
          deletingReportId={deletingBugReportId}
        />
      </div>
    </PortalShell>
  );
}

export default function AIPPortalPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center bg-[#f5f6f7]">
          <div className="text-sm text-[#6c7079]">Loading…</div>
        </div>
      }
    >
      <AIPPortalPageInner />
    </Suspense>
  );
}
