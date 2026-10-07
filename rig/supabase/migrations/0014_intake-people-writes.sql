-- ── Passengers and crew to Leon (2026-10-07). Idempotent. ───────────────────────────────────────────────────
-- One row per write of a created leg's passengers (Leon's text passenger list) or crew (the flight's OPS notes),
-- written BEFORE the Leon call like intake_leon_writes. Holds a hash and a count, never a name, date or document.
create table if not exists public.intake_leon_people_writes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.intake_requests(id) on delete cascade,
  leg_index int not null,
  kind text not null check (kind in ('pax', 'crew')),
  leon_flight_nid text not null,
  content_sha256 text not null,
  people_count int not null default 0,
  state text not null check (state in ('sending', 'in_leon', 'not_in_leon', 'unknown')),
  leon_error text,                              -- Leon's reason, personal values removed
  http_status int,
  answered_ms int,
  sent_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, leg_index, kind, content_sha256)
);
alter table public.intake_leon_people_writes enable row level security;
