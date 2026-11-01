// Ranking for the Clients page's smart search (2026-11-02). Suggestions are real records only — the caller passes what
// exists (operators, the fleet's registrations, trips, the people and companies who asked or were approved); this only
// orders them. A match at the START of a value ranks first, then the start of a word, then anywhere — the "@EV" lesson:
// EVRA before Cevennes. Registrations and trips also match with their punctuation removed (YLPSA finds YL-PSA).
//   rankSuggestions(items, "kla") → [{ kind, value, label, detail, tier }]
//   item: { kind: "operator" | "registration" | "trip" | "client", value, label, detail?, keys: [strings to match] }

export const KIND_ORDER = ["operator", "registration", "trip", "client"];
export const KIND_LABEL = { operator: "Operators", registration: "Aircraft", trip: "Trips", client: "People and companies" };

const fold = (s) => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
const bare = (s) => fold(s).replace(/[^a-z0-9]/g, "");

/** 0 = a value starts with the query, 1 = a word in it does, 2 = it contains it, null = no match. */
export function matchTier(keys, query) {
  const q = fold(query).trim(); if (!q) return null;
  const qb = bare(q);
  let best = null;
  for (const raw of keys) {
    const k = fold(raw); if (!k) continue;
    const kb = bare(raw);
    let t = null;
    if (k.startsWith(q) || (qb && kb.startsWith(qb))) t = 0;
    else if (k.split(/[\s\-_/().,·@]+/).some((w) => w && w.startsWith(q))) t = 1;
    else if (k.includes(q) || (qb.length >= 2 && kb.includes(qb))) t = 2;
    if (t !== null && (best === null || t < best)) best = t;
    if (best === 0) break;
  }
  return best;
}

/** Ranked, at most `perKind` of each kind. Groups stay together (the list is shown grouped); the group holding the best
 *  match comes first, so ↵ on the first suggestion takes the best one. Ties keep the order operators, aircraft, trips,
 *  people and companies. */
export function rankSuggestions(items, query, { perKind = 6, kinds = KIND_ORDER } = {}) {
  const groups = [];
  for (const kind of kinds) {
    const scored = [];
    for (const it of items) {
      if (it.kind !== kind) continue;
      const tier = matchTier(it.keys ?? [it.value, it.label], query);
      if (tier !== null) scored.push({ ...it, tier });
    }
    scored.sort((a, b) => a.tier - b.tier || String(a.value).length - String(b.value).length || String(a.value).localeCompare(String(b.value)));
    if (scored.length) groups.push(scored.slice(0, perKind));
  }
  groups.sort((a, b) => a[0].tier - b[0].tier || kinds.indexOf(a[0].kind) - kinds.indexOf(b[0].kind));
  return groups.flat();
}
