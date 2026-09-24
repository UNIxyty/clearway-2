// NOTAM and weather tools.
//
// Source policy is the platform's, not the agent's: NOTAMs come from
// CrewBriefing only (the portal pins `scraper=crewbriefing`), and the wall's
// daily NOTAM check is the safety timer that drives the CHECK/CHECKED sign.
// Neither is reimplemented here.

import { defineTool, S } from "./framework.mjs";
import { portalGet, wallGet } from "./http.mjs";
import { NotFound } from "./errors.mjs";

const up = (icao) => String(icao).toUpperCase();

defineTool({
  name: "get_notams",
  description:
    "Current NOTAMs for one airport by ICAO code, from CrewBriefing. Returns the full NOTAM text of each notice. Use for questions about closures, works in progress, unserviceable equipment or temporary restrictions at an airport. Can be slow on a cache miss because it scrapes the source.",
  permission: "user",
  sourceTier: "web",
  sourceLabel: (input) => `Web · CrewBriefing NOTAMs · ${input.icao}`,
  // NOTAM retrieval is Playwright-backed on a cache miss; the portal's own
  // timeout is generous, so this one has to be too or it fails the slow path.
  timeoutMs: 60_000,
  maxResultBytes: 256 * 1024,
  input: {
    type: "object",
    required: ["icao"],
    additionalProperties: false,
    properties: { icao: S.icao, limit: S.limit(200, 100) },
  },
  output: {
    type: "object",
    required: ["icao", "count", "notams"],
    properties: {
      icao: { type: "string" },
      count: { type: "integer" },
      truncated: { type: "boolean" },
      updatedAt: { type: ["string", "null"] },
      source: { type: "string" },
      notams: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: ["string", "null"] },
            text: { type: "string", description: "The NOTAM exactly as published." },
            from: { type: ["string", "null"] },
            to: { type: ["string", "null"] },
          },
        },
      },
    },
  },
  async handler({ icao, limit }, { user }) {
    const code = up(icao);
    const data = await portalGet(`/api/notams?icao=${encodeURIComponent(code)}&scraper=crewbriefing`, user, { timeoutMs: 55_000 });
    const raw = Array.isArray(data?.notams) ? data.notams : [];
    return {
      icao: code,
      count: raw.length,
      truncated: raw.length > limit,
      updatedAt: data?.updatedAt ?? null,
      source: "crewbriefing",
      notams: raw.slice(0, limit).map((n) => ({
        id: n?.id ?? n?.number ?? null,
        // Verbatim: a NOTAM is a regulatory notice, never reworded by a tool.
        // The portal's cache stores the notice text as `condition` (NotamItem);
        // older shapes used text/message/raw.
        text: String(n?.condition ?? n?.text ?? n?.message ?? n?.raw ?? (typeof n === "string" ? n : "")),
        class: n?.class ?? null,
        location: n?.location ?? null,
        from: n?.from ?? n?.startTime ?? n?.startDateUtc ?? null,
        to: n?.to ?? n?.endTime ?? n?.endDateUtc ?? null,
      })),
    };
  },
});

defineTool({
  name: "get_weather",
  description:
    "Current METAR and TAF for one airport by ICAO code. Use for questions about conditions, visibility, wind or forecast at an airport. Returns the coded reports as published.",
  permission: "user",
  sourceTier: "web",
  sourceLabel: (input) => `Web · METAR/TAF · ${input.icao}`,
  timeoutMs: 40_000,
  input: {
    type: "object",
    required: ["icao"],
    additionalProperties: false,
    properties: { icao: S.icao },
  },
  output: {
    type: "object",
    required: ["icao", "available"],
    properties: {
      icao: { type: "string" },
      available: { type: "boolean" },
      weather: { type: ["string", "null"], description: "The raw coded report(s), verbatim." },
      metar: { type: ["string", "null"] },
      taf: { type: ["string", "null"] },
      updatedAt: { type: ["string", "null"] },
    },
  },
  async handler({ icao }, { user }) {
    const code = up(icao);
    const data = await portalGet(`/api/weather?icao=${encodeURIComponent(code)}`, user, { timeoutMs: 35_000 });
    const weather = data?.weather ?? null;
    if (!weather && !data?.metar && !data?.taf) throw NotFound(`No weather available for ${code}.`);
    return {
      icao: code,
      available: true,
      weather: weather ? String(weather) : null,
      metar: data?.metar ? String(data.metar) : null,
      taf: data?.taf ? String(data.taf) : null,
      updatedAt: data?.updatedAt ?? null,
    };
  },
});

defineTool({
  name: "get_notam_check_status",
  description:
    "State of the daily 10:00 Riga NOTAM check on the ops wall: which airports have been checked today, which are still outstanding, and who acknowledged them. This is the platform's safety timer — use it when asked whether today's NOTAM check is done.",
  permission: "user",
  sourceTier: "internal",
  sourceLabel: () => "Internal · daily NOTAM check",
  input: {
    type: "object",
    additionalProperties: false,
    properties: { date: { ...S.isoDate, description: "Defaults to today." } },
  },
  output: {
    type: "object",
    required: ["checked", "airports"],
    properties: {
      date: { type: ["string", "null"] },
      checked: { type: "boolean", description: "True when the whole day's check is complete." },
      checkHour: { type: ["integer", "null"] },
      outstandingCount: { type: "integer" },
      airports: {
        type: "array",
        items: {
          type: "object",
          properties: {
            icao: { type: "string" },
            checked: { type: "boolean" },
            checkedAt: { type: ["string", "null"] },
            checkedBy: { type: ["string", "null"] },
          },
        },
      },
    },
  },
  async handler({ date }, { user }) {
    const query = date ? `?date=${encodeURIComponent(date)}` : "";
    const data = await wallGet(`/api/notam-check/today${query}`, user, { timeoutMs: 20_000 });
    const airports = Array.isArray(data?.airports)
      ? data.airports
      : Object.entries(data?.status ?? {}).map(([icao, v]) => ({ icao, ...(v ?? {}) }));
    const mapped = airports.map((a) => ({
      icao: String(a.icao ?? "").toUpperCase(),
      checked: Boolean(a.checked ?? a.acked ?? a.at),
      checkedAt: a.at ?? a.checkedAt ?? null,
      checkedBy: a.by ?? a.checkedBy ?? null,
    }));
    return {
      date: data?.day ?? data?.date ?? date ?? null,
      checked: mapped.length > 0 && mapped.every((a) => a.checked),
      checkHour: data?.checkHour ?? null,
      outstandingCount: mapped.filter((a) => !a.checked).length,
      airports: mapped,
    };
  },
});
