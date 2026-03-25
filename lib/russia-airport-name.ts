const CYRILLIC_TO_LATIN: Record<string, string> = {
  А: "A", а: "a",
  Б: "B", б: "b",
  В: "V", в: "v",
  Г: "G", г: "g",
  Д: "D", д: "d",
  Е: "E", е: "e",
  Ё: "Yo", ё: "yo",
  Ж: "Zh", ж: "zh",
  З: "Z", з: "z",
  И: "I", и: "i",
  Й: "Y", й: "y",
  К: "K", к: "k",
  Л: "L", л: "l",
  М: "M", м: "m",
  Н: "N", н: "n",
  О: "O", о: "o",
  П: "P", п: "p",
  Р: "R", р: "r",
  С: "S", с: "s",
  Т: "T", т: "t",
  У: "U", у: "u",
  Ф: "F", ф: "f",
  Х: "Kh", х: "kh",
  Ц: "Ts", ц: "ts",
  Ч: "Ch", ч: "ch",
  Ш: "Sh", ш: "sh",
  Щ: "Shch", щ: "shch",
  Ъ: "", ъ: "",
  Ы: "Y", ы: "y",
  Ь: "", ь: "",
  Э: "E", э: "e",
  Ю: "Yu", ю: "yu",
  Я: "Ya", я: "ya",
};

function transliterateCyrillic(text: string): string {
  return Array.from(text).map((ch) => CYRILLIC_TO_LATIN[ch] ?? ch).join("");
}

export function formatRussiaAirportName(rawName: string): string {
  const source = rawName.trim();
  if (!source) return "";
  if (!/[А-Яа-яЁё]/.test(source)) return source;

  const transliterated = transliterateCyrillic(source).replace(/\s{2,}/g, " ").trim();
  if (!transliterated) return source;

  return `${transliterated} (${source})`;
}
