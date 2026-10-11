-- Portal redesign, stage 4: Settings → Customisation and Preferences, each person's own (lib/user-settings.ts checks
-- every value before it is saved). NULL = never set, so the default applies: comfortable tables, motion that matches
-- the device, the Dashboard as the start page, nothing pinned. The page also keeps density, motion and pins in the
-- browser, so before this has run they hold on that device but do not follow the person to another.
-- Safe to run more than once.
alter table public.user_preferences
  add column if not exists table_density text check (table_density in ('comfortable', 'compact')),
  add column if not exists motion text check (motion in ('system', 'reduce')),
  add column if not exists start_page text check (start_page ~ '^/[a-z/-]{0,40}$'),
  add column if not exists pinned_tabs jsonb check (pinned_tabs is null or (jsonb_typeof(pinned_tabs) = 'array' and jsonb_array_length(pinned_tabs) <= 5));
