// Passenger-manifest flight picker — the matching rules, pure (no React) so they can be tested on their own.
//
// One query matches callsign, registration, route (ICAO, airport name or city), operator and date/time words, all at
// once: every meaningful word must match something on the flight. "the Riga one this evening" → riga (city) + this
// evening (today, departing 17:00–23:59Z). Rows carry enough to tell legs apart: callsign, registration, route, date
// and departure time.

export type PickerFlight = {
  key: string;
  callsign: string;
  registration: string;
  adep: string;
  ades: string;
  adepPlace: string;
  adesPlace: string;
  operator: string;
  std: number | null; // ms
  cancelled: boolean;
};

type Raw = {
  key?: string; registration?: string | null; operatorName?: string | null;
  flight?: { flightNo?: string | null; startTimeUTC?: string | null; isCnl?: boolean; adep?: { icao?: string | null; name?: string | null; city?: string | null } | null; ades?: { icao?: string | null; name?: string | null; city?: string | null } | null } | null;
};

export function toPickerFlight(r: Raw): PickerFlight | null {
  const key = String(r.key ?? "");
  if (!/^[a-z0-9-]+:\d+$/i.test(key)) return null;
  const t = Date.parse(r.flight?.startTimeUTC ?? "");
  return {
    key,
    callsign: String(r.flight?.flightNo ?? "").trim(),
    registration: String(r.registration ?? "").trim(),
    adep: String(r.flight?.adep?.icao ?? "").toUpperCase(),
    ades: String(r.flight?.ades?.icao ?? "").toUpperCase(),
    adepPlace: [r.flight?.adep?.city, r.flight?.adep?.name].filter(Boolean).join(" "),
    adesPlace: [r.flight?.ades?.city, r.flight?.ades?.name].filter(Boolean).join(" "),
    operator: String(r.operatorName ?? "").trim(),
    std: Number.isFinite(t) ? t : null,
    cancelled: Boolean(r.flight?.isCnl),
  };
}

const STOP = new Set(["the", "a", "an", "one", "ones", "flight", "flights", "leg", "for", "to", "from", "this", "that", "pax", "passenger", "passengers", "manifest", "manifests", "please", "on", "at", "of", "in", "make", "generate", "build", "me", "with", "and", "via", "z", "utc"]);
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const PERIODS: Record<string, [number, number]> = { morning: [5, 12], afternoon: [12, 17], evening: [17, 24], tonight: [17, 24], night: [20, 24] };
const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const dayStart = (ms: number) => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };

/** Does one word of the query match this flight? */
function wordMatches(f: PickerFlight, w: string, now: number): boolean {
  const fw = flat(w);
  if (!fw) return true;
  if (flat(f.callsign).includes(fw) || flat(f.registration).includes(fw)) return true;
  if (f.adep.toLowerCase().startsWith(fw) || f.ades.toLowerCase().startsWith(fw)) return true;
  if (fw.length >= 3 && (flat(f.adepPlace).includes(fw) || flat(f.adesPlace).includes(fw) || flat(f.operator).includes(fw))) return true;
  if (f.std == null) return false;
  const d = new Date(f.std);
  const today = dayStart(now);
  if (fw === "today") return dayStart(f.std) === today;
  if (fw === "tomorrow") return dayStart(f.std) === today + 86_400_000;
  if (fw === "yesterday") return dayStart(f.std) === today - 86_400_000;
  if (PERIODS[fw]) { const h = d.getUTCHours(); return h >= PERIODS[fw][0] && h < PERIODS[fw][1]; }
  const mi = MONTHS.findIndex((m) => fw.startsWith(m) && fw.length <= 9);
  if (mi >= 0 && /^[a-z]+$/.test(fw)) return d.getUTCMonth() === mi;
  const di = DAYS.findIndex((x) => fw.startsWith(x) && /^[a-z]+$/.test(fw) && fw.length <= 9);
  if (di >= 0) return d.getUTCDay() === di;
  if (/^\d{1,2}$/.test(fw)) return d.getUTCDate() === Number(fw);
  const dm = /^(\d{1,2})([a-z]{3})/.exec(fw); // 29sep, 29-sep
  if (dm) return d.getUTCDate() === Number(dm[1]) && MONTHS[d.getUTCMonth()] === dm[2];
  const iso = /^(\d{4})(\d{2})(\d{2})$/.exec(fw); // 2026-09-29
  if (iso) return d.getUTCFullYear() === Number(iso[1]) && d.getUTCMonth() + 1 === Number(iso[2]) && d.getUTCDate() === Number(iso[3]);
  const hm = /^(\d{1,2})(\d{2})$/.exec(fw); // 0630, 18:30
  if (hm && w.includes(":")) return d.getUTCHours() === Number(hm[1]) && d.getUTCMinutes() === Number(hm[2]);
  return false;
}

/** The words that must all match ("this evening" → "evening"; route arrows and dashes are spacing). */
export function queryWords(q: string): string[] {
  return q.toLowerCase()
    .replace(/\bthis (morning|afternoon|evening|night)\b/g, "$1 today").replace(/\btonight\b/g, "tonight today")
    .replace(/→|->|–|—|\//g, " ").split(/[\s,]+/).map((w) => w.trim()).filter((w) => w && !STOP.has(w));
}

/**
 * The rows to show. No query: upcoming flights (departing from two hours ago on), soonest first — the one people
 * want is usually in the first few rows. With a query: every flight matching all words, upcoming first (soonest
 * first), then earlier ones (most recent first).
 */
export function pickRows(flights: PickerFlight[], q: string, now = Date.now()): PickerFlight[] {
  const words = queryWords(q);
  const seen = new Set<string>();
  const unique = flights.filter((f) => (seen.has(f.key) ? false : (seen.add(f.key), true)));
  const cut = now - 2 * 3600_000;
  const upcoming = (f: PickerFlight) => (f.std ?? -Infinity) >= cut;
  const matches = words.length ? unique.filter((f) => words.every((w) => wordMatches(f, w, now))) : unique.filter(upcoming);
  return [
    ...matches.filter(upcoming).sort((a, b) => (a.std ?? 0) - (b.std ?? 0)),
    ...matches.filter((f) => !upcoming(f)).sort((a, b) => (b.std ?? 0) - (a.std ?? 0)),
  ];
}

const pad = (n: number) => String(n).padStart(2, "0");
/** "Tue 29 Sep · 06:30Z" — the date WITH the time, so two legs on one day differ. */
export function whenLabel(ms: number | null): string {
  if (ms == null) return "no time";
  const d = new Date(ms);
  return `${DAYS[d.getUTCDay()].replace(/^./, (c) => c.toUpperCase())} ${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()].replace(/^./, (c) => c.toUpperCase())} · ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}Z`;
}

/** Server-side filters worth asking for when typing reaches past what the first load holds. */
export function serverFilters(q: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const w of queryWords(q)) {
    const up = w.toUpperCase();
    if (/^[A-Z]{1,2}-[A-Z0-9]{2,5}$/.test(up)) out.push({ registration: up });
    else if (/^[A-Z]{4}$/.test(up)) out.push({ icao: up });
    else if (/^[A-Z0-9]{2,4}\d{1,5}[A-Z]?$/.test(up) && /\d/.test(up)) out.push({ callsign: up });
  }
  return out.slice(0, 2);
}
