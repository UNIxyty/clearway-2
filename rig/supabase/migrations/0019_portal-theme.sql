-- Portal redesign, stage 1: the account's appearance choice (Settings → Appearance; the top bar's theme shortcut).
-- "system" = match this device (the default when the row or column has no value), "light", "dark".
-- The choice is also mirrored to the browser's localStorage key cw-theme, which the page reads before first paint;
-- the account copy is what follows the person to another device. Safe to run more than once.
alter table public.user_preferences
  add column if not exists theme text check (theme in ('system', 'light', 'dark'));
