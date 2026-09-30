-- Flight intake: the agent mailbox (Resend inbound), handling requests, extraction and the Leon write path.
-- Run once in the Supabase SQL editor. Safe to re-run. Service-role only (RLS on, no policies).
--
-- Personal data (passport numbers, dates of birth, names on crew/pax lists) is NEVER stored in these tables'
-- plain columns, indexes or search text. It lives only inside `intake_extractions.personal` (a jsonb the API
-- masks) and inside the raw MIME / attachment files on disk, all of which fall under the retention sweep.

create table if not exists public.intake_messages (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'resend',
  provider_message_id text not null,            -- Resend email_id: the idempotency key for inbound
  rfc_message_id text,                          -- the Message-ID header
  direction text not null check (direction in ('inbound', 'outbound')),
  received_at timestamptz not null,
  from_addr text,
  to_addrs text[] not null default '{}',
  cc_addrs text[] not null default '{}',
  subject text,
  auth jsonb,                                   -- SPF/DKIM/DMARC as computed by the receiving server
  raw_key text,                                 -- storage key of the raw .eml (content-addressed file)
  raw_sha256 text,
  raw_bytes bigint,
  fetch_status text not null default 'pending' check (fetch_status in ('pending', 'stored', 'failed')),
  fetch_error text,
  delivery_status text,                         -- outbound: sent / delivered / delivery_delayed / bounced / complained / failed
  delivery_detail jsonb,
  mailbox_state text not null default 'needs_attention' check (mailbox_state in ('needs_attention', 'handled', 'ignored', 'archived')),
  retention_until timestamptz,                  -- personal data and attachments are purged after this
  purged_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_message_id)
);
create index if not exists idx_intake_messages_received on public.intake_messages (received_at desc);
create index if not exists idx_intake_messages_state on public.intake_messages (mailbox_state, received_at desc);

-- Every webhook delivery, verified, keyed by the Svix message id (a Resend retry reuses it).
create table if not exists public.intake_events (
  id uuid primary key default gen_random_uuid(),
  svix_id text not null unique,
  event_type text not null,
  provider_message_id text,
  occurred_at timestamptz,
  detail jsonb,                                 -- event metadata only; never bodies or attachment content
  created_at timestamptz not null default now()
);
create index if not exists idx_intake_events_msg on public.intake_events (provider_message_id, created_at);

-- Attachments: one row per (message, content). The file itself is content-addressed on disk, so the same
-- GenDec arriving ten times is stored once.
create table if not exists public.intake_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.intake_messages(id) on delete cascade,
  sha256 text not null,
  bytes bigint not null,
  sniffed_type text not null,                   -- from the content's magic bytes, never the declared type
  declared_type text,
  declared_name text,                           -- shown to the user; never used as a path
  storage_key text not null,
  personal_data boolean not null default true,  -- assume yes until extraction says otherwise
  purged_at timestamptz,
  created_at timestamptz not null default now(),
  unique (message_id, sha256)
);
create index if not exists idx_intake_attachments_sha on public.intake_attachments (sha256);

-- One request per inbound message (the unique key is what makes a webhook retry harmless).
create table if not exists public.intake_requests (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.intake_messages(id) on delete cascade,
  request_type text not null check (request_type in ('handling', 'scheduled')),
  status text not null default 'extracting',
  current_extraction_id uuid,
  duplicate_of jsonb,                           -- the Leon flight(s) it matched, when the pipeline stopped
  closed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Every extraction run is kept (reprocess adds a version, never replaces).
create table if not exists public.intake_extractions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.intake_requests(id) on delete cascade,
  version int not null,
  model_id text,
  model_tier text,
  input_tokens int, output_tokens int,
  fields jsonb not null,                        -- our schema: per field value / said / source / confidence / state
  personal jsonb,                               -- crew & pax identities; masked by the API, purged by retention
  created_by text,                              -- user id or 'webhook'
  created_at timestamptz not null default now(),
  unique (request_id, version)
);

-- Edits in the review screen: append-only, so "edited" stays marked with what it was and who changed it.
create table if not exists public.intake_field_edits (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.intake_requests(id) on delete cascade,
  extraction_id uuid not null references public.intake_extractions(id) on delete cascade,
  field_path text not null,                     -- e.g. legs.0.departure.airport
  previous jsonb, value jsonb,
  edited_by text not null, edited_by_email text,
  created_at timestamptz not null default now()
);

-- The Leon side: one row per leg send. `payload_sha256` is the hash of the exact payload shown in the
-- confirmation; the one-time token is bound to it.
create table if not exists public.intake_leon_writes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.intake_requests(id) on delete cascade,
  leg_index int not null,
  confirmation_token text,
  payload_sha256 text not null,
  state text not null check (state in ('not_sent', 'sending', 'in_leon', 'not_in_leon', 'unknown')),
  leon_flight_nid text,
  leon_error text,                              -- Leon's own reason, in plain words
  checklist jsonb,                              -- per item: set / failed, separately from `state`
  sent_by text, sent_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, leg_index, payload_sha256)
);


-- ── Build 2 additions (pipeline, review screen, mailbox, send log). Idempotent. ─────────────────────────
-- Mailbox status: what the agent did with the message (status before content, §M2).
alter table public.intake_messages add column if not exists status text not null default 'waiting';
alter table public.intake_messages add column if not exists status_reason text;       -- agent-written, never email text
alter table public.intake_messages add column if not exists understood jsonb;         -- { kind, title, body, checks[], hint } — counts, never values
alter table public.intake_messages add column if not exists search_text text;         -- PII-free: sender, subject, refs, regs, callsigns, routes, scrubbed body
alter table public.intake_messages add column if not exists has_personal_data boolean not null default false;
alter table public.intake_messages add column if not exists ignored_by text;
alter table public.intake_messages add column if not exists ignored_reason text;
alter table public.intake_messages add column if not exists ignored_note text;
alter table public.intake_messages add column if not exists history jsonb not null default '[]';  -- earlier results on reprocess
alter table public.intake_messages add column if not exists request_id uuid;
alter table public.intake_messages add column if not exists sent_kind text;           -- outbound: E2 / E3 / E4 / Forward
alter table public.intake_messages add column if not exists sent_html text;           -- outbound: as sent (no personal data by design)
alter table public.intake_messages add column if not exists delivery_events jsonb not null default '[]';
do $$ begin
  alter table public.intake_messages drop constraint if exists intake_messages_status_check;
  alter table public.intake_messages add constraint intake_messages_status_check check (status in ('waiting','processed','not_recognised','failed','reply','ignored','sent'));
end $$;
create index if not exists idx_intake_messages_status on public.intake_messages (status, received_at desc);

-- Requests: the thread reference, the pipeline, the review working copy.
alter table public.intake_requests add column if not exists reference text;
alter table public.intake_requests add column if not exists reference_built boolean not null default false;
alter table public.intake_requests add column if not exists stages jsonb not null default '[]';
alter table public.intake_requests add column if not exists review jsonb;             -- current values after people's edits (non-personal)
alter table public.intake_requests add column if not exists attachment_roles jsonb;   -- per attachment: role, why, override
alter table public.intake_requests add column if not exists duplicate jsonb;          -- match evidence (Leon ids, fields that differ)
alter table public.intake_requests add column if not exists duplicate_resolution jsonb;
alter table public.intake_requests add column if not exists sender_name text;
alter table public.intake_requests add column if not exists route text;
alter table public.intake_requests add column if not exists registration text;
alter table public.intake_requests add column if not exists first_std timestamptz;
alter table public.intake_requests add column if not exists legs_count int;
alter table public.intake_requests add column if not exists status_reason text;
alter table public.intake_requests add column if not exists updated_by text;
create index if not exists idx_intake_requests_updated on public.intake_requests (updated_at desc);
create index if not exists idx_intake_requests_reference on public.intake_requests (reference);

-- Send log: written BEFORE the Leon call (state 'sending' + the exact payload), updated after.
-- A row still 'sending' after a restart is 'unknown': a person checks Leon; nothing retries it.
alter table public.intake_leon_writes add column if not exists payload jsonb;
alter table public.intake_leon_writes add column if not exists marker text;
alter table public.intake_leon_writes add column if not exists leon_trip_nid text;
alter table public.intake_leon_writes add column if not exists http_status int;
alter table public.intake_leon_writes add column if not exists answered_ms int;
alter table public.intake_leon_writes add column if not exists resolved_by text;
alter table public.intake_leon_writes add column if not exists resolved_note text;

alter table public.intake_messages enable row level security;
alter table public.intake_events enable row level security;
alter table public.intake_attachments enable row level security;
alter table public.intake_requests enable row level security;
alter table public.intake_extractions enable row level security;
alter table public.intake_field_edits enable row level security;
alter table public.intake_leon_writes enable row level security;
