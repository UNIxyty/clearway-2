// What the voice is allowed to SAY about a reply (design spec §4.25, §3 rules
// 9 and 10). Pure: a stored assistant message in, a speech plan out.
//
// The plan is built from the reply's BLOCKS, not by reading the prose and
// hoping: a verbatim block (approved limitation text) is never spoken — its
// words are removed from the prose wherever the model echoed them, and the
// voice says "The limitation is on screen." instead. Content that cannot be
// heard (tables, documents, files, raw METAR/TAF/NOTAM) is named in one line;
// a pending confirmation is only ever pointed at — the voice never confirms.
//
// Decision table (§4.25, verbatim from the design):
//   Short, factual                    spoken + transcript, under ~15 s
//   Tables, docs, charts, raw codes   always shown; one line naming what is on screen
//   Long                              a summary written for the ear; full answer on screen
//   Verbatim limitation               never read aloud: "The limitation is on screen."
//   Needs confirmation                always shown; voice never confirms a change

export const LIMITATION_ON_SCREEN = "The limitation is on screen.";
export const CONFIRM_ON_SCREEN = "Please confirm on screen.";
export const FIXED_PHRASES = {
  confirm_on_screen: CONFIRM_ON_SCREEN,
  answer_first: "Answer the confirmation on screen first.",
};

const WORDS_PER_SECOND = 2.5; // ~150 wpm, the usual TTS pace
const SHORT_SECONDS = 15;
const SUMMARY_OVER_SECONDS = 20;

/** Markdown → plain sentences for the ear. Code fences and tables are not speakable at all. */
export function speakableProse(markdown) {
  return String(markdown ?? "")
    .replace(/```[\s\S]*?```/g, " ")            // fenced code: raw METAR/TAF/NOTAM
    .split("\n")
    .filter((line) => !/^\s*\|/.test(line))      // markdown tables
    .filter((line) => !/^\s*>/.test(line))       // block quotes: quoted source text
    .join("\n")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s*\[\^?\d+(?:[,\s]+\d+)*\]/g, "")     // citation markers [1] [^2] [1, 3]
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/(\*\*|__|\*|_)(\S[\s\S]*?)\1/g, "$2")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n+\s*/g, "\n")
    .trim();
}

export function sentencesOf(text) {
  const out = [];
  for (const line of String(text ?? "").split("\n")) {
    const parts = line.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) ?? [];
    for (const p of parts) { const s = p.trim(); if (s) out.push(/[.!?]$/.test(s) ? s : `${s}.`); }
  }
  return out;
}

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9а-яё]+/gi, " ").trim().split(/\s+/).filter(Boolean);

/** Five-word shingles of every verbatim clause: any prose sentence that shares one is echoing approved text. */
function verbatimShingles(verbatim) {
  const set = new Set();
  for (const v of verbatim) {
    const w = norm(v?.text);
    for (let i = 0; i + 5 <= w.length; i += 1) set.add(w.slice(i, i + 5).join(" "));
    // A very short clause (under five words) is matched whole.
    if (w.length > 0 && w.length < 5) set.add(w.join(" "));
  }
  return set;
}
function echoesVerbatim(sentence, shingles) {
  if (!shingles.size) return false;
  const w = norm(sentence);
  const joined = w.join(" ");
  for (let i = 0; i + 5 <= w.length; i += 1) if (shingles.has(w.slice(i, i + 5).join(" "))) return true;
  for (const s of shingles) if (s.split(" ").length < 5 && s.length >= 8 && joined.includes(s)) return true;
  return false;
}

const NUMBER_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
const count = (n, one, many) => `${NUMBER_WORDS[n] ?? String(n)} ${n === 1 ? one : many}`;

/** What is on screen that cannot be heard, most specific first: [line, badge]. */
function mustShow(blocks) {
  const b = blocks ?? {};
  if (b.tables?.length) {
    const t = b.tables[0];
    const rows = Array.isArray(t.rows) ? t.rows.length : 0;
    const what = /flight/i.test(`${t.title ?? ""} ${(t.columns ?? []).join(" ")}`) ? count(rows, "flight", "flights") : count(rows, "row", "rows");
    return [`${what}. It's on screen.`, "TABLE"];
  }
  if (b.mono?.length) {
    const kind = /taf/i.test(b.mono[0].title ?? "") ? "TAF" : /notam/i.test(b.mono[0].title ?? "") ? "NOTAM" : "METAR";
    return [`The raw ${kind} is on screen.`, kind];
  }
  if (b.documents?.length) return [b.documents.length === 1 ? "The document is on screen." : `${count(b.documents.length, "document", "documents")}. They're on screen.`, "DOCUMENT"];
  if (b.files?.length) return [b.files.length === 1 ? "The file is ready on screen." : `${count(b.files.length, "file", "files")} are ready on screen.`, "FILE"];
  if ((b.flights?.length ?? 0) > 2) return [`${count(b.flights.length, "flight", "flights")}. It's on screen.`, "FLIGHTS"];
  return null;
}

/**
 * @param {{ content?: string, blocks?: object|null }} message  the stored assistant reply
 * @returns {{ kind: "short"|"long"|"shown"|"confirm"|"empty", spoken: string, display: string, sentences: string[], badge: string|null, room: boolean, summarised: boolean, verbatimIds: string[], withheldSentences: number, fullSeconds: number }}
 */
export function speechPlan(message) {
  const blocks = message?.blocks ?? {};
  const verbatim = Array.isArray(blocks.verbatim) ? blocks.verbatim : [];
  const verbatimIds = verbatim.map((v) => String(v?.id ?? "")).filter(Boolean);
  const shingles = verbatimShingles(verbatim);

  const all = sentencesOf(speakableProse(message?.content));
  const kept = all.filter((s) => !echoesVerbatim(s, shingles));
  const withheldSentences = all.length - kept.length;
  const limitationLine = verbatim.length || withheldSentences ? LIMITATION_ON_SCREEN : null;
  const words = kept.join(" ").split(/\s+/).filter(Boolean).length;
  const fullSeconds = Math.round(words / WORDS_PER_SECOND);
  const base = { verbatimIds, withheldSentences, fullSeconds };

  // Needs confirmation: always shown, the voice only points at it (rule 9).
  const pending = (blocks.confirmations ?? []).filter((c) => !c?.status || c.status === "pending");
  if (pending.length) {
    const spoken = ["I need your confirmation before I change anything. It's on screen.", limitationLine].filter(Boolean).join(" ");
    return { kind: "confirm", spoken, display: spoken, sentences: sentencesOf(spoken), badge: "CONFIRMATION", room: true, summarised: false, ...base };
  }

  // Tables, documents, raw codes: always shown, one line naming them.
  const shown = mustShow(blocks);
  if (shown) {
    const lead = kept[0] && kept[0].split(/\s+/).length <= 14 ? kept[0] : null;
    const spoken = [lead, shown[0], limitationLine].filter(Boolean).join(" ");
    return { kind: "shown", spoken, display: spoken, sentences: sentencesOf(spoken), badge: `SHOWN · ${shown[1]}`, room: true, summarised: false, ...base };
  }

  if (!kept.length) {
    const spoken = limitationLine ?? "";
    return { kind: spoken ? "short" : "empty", spoken, display: spoken, sentences: sentencesOf(spoken), badge: null, room: Boolean(verbatim.length), summarised: false, ...base };
  }

  // Long: a summary for the ear, and it SAYS it is summarising.
  if (fullSeconds > SUMMARY_OVER_SECONDS) {
    const head = [];
    let n = 0;
    for (const s of kept) { const w = s.split(/\s+/).length; if (head.length && n + w > 35) break; head.push(s); n += w; if (head.length >= 2) break; }
    const spoken = ["In short:", ...head, "The full answer is on screen.", limitationLine].filter(Boolean).join(" ");
    return { kind: "long", spoken, display: kept.join(" "), sentences: sentencesOf(spoken), badge: null, room: true, summarised: true, ...base };
  }

  const spoken = [...kept, limitationLine].filter(Boolean).join(" ");
  const sentences = sentencesOf(spoken);
  // A short answer fits the card above the bar; more than two sentences, or
  // anything verbatim, opens the panel (§4.23 "needs room").
  return { kind: "short", spoken, display: spoken, sentences, badge: null, room: kept.length > 2 || Boolean(verbatim.length) || fullSeconds > SHORT_SECONDS, summarised: false, ...base };
}

/** Rule 9 — does this utterance read as a spoken "yes"? Used only to answer "Please confirm on screen." */
export function isSpokenYes(text) {
  const t = String(text ?? "").toLowerCase().replace(/[^a-zа-яё' ]+/gi, " ").trim();
  return /^(yes|yeah|yep|yup|sure|ok|okay|confirm(ed)?|go ahead|do it|apply( it)?|approved?|affirmative|correct|да|подтверждаю|давай)(?=\s|$)/.test(t);
}
