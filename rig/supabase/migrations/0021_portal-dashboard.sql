-- Portal redesign, stage 3: each person's dashboard — which blocks, in what order, at what width (S, M, L).
-- A JSON list of { "id": "<block>", "size": "S" | "M" | "L" } (lib/dashboard-layout.ts checks it before saving).
-- NULL = never customised, so the default layout shows; [] = every block removed. The page also keeps a copy in the
-- browser, so before this has run a layout still holds on that device but does not follow the person to another.
-- Safe to run more than once.
alter table public.user_preferences
  add column if not exists dashboard_layout jsonb check (dashboard_layout is null or jsonb_typeof(dashboard_layout) = 'array');
