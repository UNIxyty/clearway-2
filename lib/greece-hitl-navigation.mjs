export function shouldUseGreeceAipIndex(url) {
  return /\/cd\/ais\/index\.html(?:$|[?#])/i.test(String(url || ""));
}

export function resolveGreeceAipIndexUrl(url) {
  const current = String(url || "").trim();
  if (!current) return "";
  if (shouldUseGreeceAipIndex(current)) return current;
  if (/\/cd\/ais\/(?:side|mainframe|main|indexaip)\.htm(?:$|[?#])/i.test(current)) {
    return new URL("index.html", current).href;
  }
  return "";
}
