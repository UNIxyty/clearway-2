// Reply language, carried as a fact rather than guessed.
//
// The language comes from the STT result and travels as an explicit field. It
// is NOT inferred from the transcript, and that is the whole point: a Russian
// dispatcher's question is full of English aviation vocabulary — "Проверь NOTAM
// по EVRA" is four English tokens in a Russian sentence — and a model asked to
// detect the language from that text will sometimes answer a Russian speaker in
// English. Code-switching is the normal case here, not an edge case.

import { FIXED_AVIATION_TERMS } from "./keyterms.mjs";

const SUPPORTED = new Set(["en", "ru"]);

/**
 * Accepts what STT returns ("ru", "rus", "ru-RU", "Russian") and returns a
 * language this system supports, or null when it is anything else.
 *
 * null is deliberate and means "no directive": the model answers in the
 * language of the question, as it does for typed input. Forcing an unsupported
 * language into one of the two would answer a German speaker in English on
 * purpose, which is worse than not having an opinion.
 */
export function normaliseLanguage(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw.startsWith("ru")) return "ru";
  if (raw.startsWith("en")) return "en";
  if (raw === "russian") return "ru";
  if (raw === "english") return "en";
  return SUPPORTED.has(raw) ? raw : null;
}

const NAMES = { en: "English", ru: "Russian" };

/**
 * The instruction added to the system block for a spoken turn.
 *
 * Three rules, and the second and third matter more than the first:
 *
 *  1. Answer in the language of the question.
 *  2. Codes and aviation vocabulary stay in Latin script, untranslated. A
 *     dispatcher reading "НОТАМ по ЕВРА" back to a controller is reading
 *     something that does not exist, and a transliterated ICAO code cannot be
 *     typed into any system they use.
 *  3. The verbatim tier is never translated. A limitation written in English is
 *     returned in English, exactly as written, whatever language the question
 *     was in. The agent may explain around it — the authoritative text itself is
 *     not the agent's to reword, and a translated restriction is a paraphrase
 *     presented with the authority of a quotation.
 */
export function languageDirective(language) {
  if (!language) return null;
  const name = NAMES[language];
  return [
    `SPOKEN TURN. The dispatcher asked in ${name}, as detected by speech-to-text. Answer in ${name}.`,
    "",
    `Keep these in Latin script exactly as written, never translated and never transliterated into Cyrillic: ` +
      `ICAO codes (EVRA, EYVI), aircraft registrations (YL-ABC), callsigns, and the standard vocabulary — ` +
      `${FIXED_AVIATION_TERMS.slice(0, 24).join(", ")}, and the rest of the standard set. ` +
      `A transliterated code cannot be typed into any system the dispatcher uses, and read back to a controller it is wrong.`,
    "",
    "NEVER translate verbatim source text. A limitation, NOTAM or company instruction quoted word for word is " +
      "reproduced in its original language exactly as written, even when you are answering in " +
      `${name}. Explain around it in ${name} if that helps — do not reword the quotation itself. A translated ` +
      "restriction is a paraphrase wearing the authority of a quotation.",
    "",
    "This will be spoken aloud. Prefer short sentences. Do not read out tables, long documents or raw METAR " +
      "strings — say what they mean and offer to show them on screen.",
  ].join("\n");
}
