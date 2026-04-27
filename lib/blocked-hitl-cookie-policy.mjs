export function shouldRequireBrowserCookie(countryKey) {
  return String(countryKey || "").trim().toLowerCase() !== "netherlands";
}
