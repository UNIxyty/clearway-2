// Saving a theme choice to the account (user_preferences.theme). Loaded only when someone changes the theme
// (components/portal/theme.ts), so pages that never do — a client's, a signed-out visitor's — never download it.
export function saveThemeChoice(choice: string) {
  return fetch("/api/user/preferences", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ theme: choice }) }).catch(() => {});
}
