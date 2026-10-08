-- ── Passengers into Leon's passenger database (2026-10-08). Idempotent. ────────────────────────────────────────────
-- Our own duplicate check: a passport (number + issuing country) → the Leon contact and passport we created or found,
-- so the same traveller is never created twice (Leon's searches match names only). The passport number is NOT stored:
-- passport_hmac is an HMAC-SHA256 with a server secret. No name, no date, no document number in this table.
create table if not exists public.intake_leon_contacts (
  id uuid primary key default gen_random_uuid(),
  opr_id text not null,
  passport_hmac text not null,
  issuing_country text not null,              -- Leon's ISO-3 country code
  contact_nid text not null,
  passport_nid text,
  source text not null check (source in ('created', 'found_in_leon')),
  request_id uuid references public.intake_requests(id) on delete set null,
  leg_index int,
  flight_nid text,
  created_at timestamptz not null default now(),
  unique (opr_id, passport_hmac, issuing_country)
);
alter table public.intake_leon_contacts enable row level security;
-- Each contact create is a send-log row too (kind 'contact'), written before its call; the list write (kind 'pax')
-- carries counts and warnings (row numbers and field names only) in `detail`.
alter table public.intake_leon_people_writes add column if not exists leon_contact_nid text;
alter table public.intake_leon_people_writes add column if not exists detail jsonb;
alter table public.intake_leon_people_writes drop constraint if exists intake_leon_people_writes_kind_check;
alter table public.intake_leon_people_writes add constraint intake_leon_people_writes_kind_check check (kind in ('pax', 'crew', 'contact'));
