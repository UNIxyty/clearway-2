create table if not exists pickem_competitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  starts_at timestamptz not null,
  group_lock_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists pickem_groups (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references pickem_competitions(id) on delete cascade,
  code text not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (competition_id, code)
);

create table if not exists pickem_teams (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references pickem_competitions(id) on delete cascade,
  group_code text not null,
  fifa_team_id text,
  name text not null,
  short_name text not null,
  crest_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (competition_id, group_code, name)
);

create index if not exists pickem_teams_competition_group_idx
  on pickem_teams (competition_id, group_code, sort_order);

create table if not exists pickem_matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references pickem_competitions(id) on delete cascade,
  api_match_id text,
  stage text not null check (stage in ('group', 'knockout')),
  round_label text,
  group_code text,
  home_team_id uuid not null references pickem_teams(id) on delete cascade,
  away_team_id uuid not null references pickem_teams(id) on delete cascade,
  kickoff_at timestamptz not null,
  venue text,
  home_score integer,
  away_score integer,
  status text not null default 'scheduled',
  updated_at timestamptz not null default now(),
  unique (competition_id, api_match_id)
);

create index if not exists pickem_matches_competition_kickoff_idx
  on pickem_matches (competition_id, kickoff_at);

create table if not exists pickem_user_group_predictions (
  user_id uuid not null,
  competition_id uuid not null references pickem_competitions(id) on delete cascade,
  group_code text not null,
  team_id uuid not null references pickem_teams(id) on delete cascade,
  predicted_position integer not null check (predicted_position between 1 and 4),
  updated_at timestamptz not null default now(),
  primary key (user_id, competition_id, group_code, team_id),
  unique (user_id, competition_id, group_code, predicted_position)
);

create index if not exists pickem_user_group_predictions_competition_idx
  on pickem_user_group_predictions (competition_id, user_id);

create table if not exists pickem_user_match_predictions (
  user_id uuid not null,
  competition_id uuid not null references pickem_competitions(id) on delete cascade,
  match_id uuid not null references pickem_matches(id) on delete cascade,
  predicted_home_score integer not null check (predicted_home_score >= 0),
  predicted_away_score integer not null check (predicted_away_score >= 0),
  predicted_outcome text not null check (predicted_outcome in ('home', 'away', 'draw')),
  updated_at timestamptz not null default now(),
  primary key (user_id, competition_id, match_id)
);

create index if not exists pickem_user_match_predictions_competition_idx
  on pickem_user_match_predictions (competition_id, user_id);

create table if not exists pickem_prediction_submissions (
  user_id uuid not null,
  competition_id uuid not null references pickem_competitions(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, competition_id)
);

create table if not exists pickem_group_results (
  competition_id uuid not null references pickem_competitions(id) on delete cascade,
  group_code text not null,
  team_id uuid not null references pickem_teams(id) on delete cascade,
  final_position integer not null check (final_position between 1 and 4),
  created_at timestamptz not null default now(),
  primary key (competition_id, group_code, team_id),
  unique (competition_id, group_code, final_position)
);

create table if not exists pickem_points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  competition_id uuid not null references pickem_competitions(id) on delete cascade,
  source_type text not null check (source_type in ('group_position', 'match_outcome', 'match_score')),
  source_id text not null,
  points integer not null,
  details jsonb not null default '{}'::jsonb,
  awarded_at timestamptz not null default now()
);

create index if not exists pickem_points_ledger_competition_user_idx
  on pickem_points_ledger (competition_id, user_id);

insert into pickem_competitions (slug, name, starts_at, group_lock_at)
values (
  'wc-2026',
  'FIFA World Cup 2026',
  '2026-06-11T18:00:00Z',
  '2026-06-11T19:01:00Z'
)
on conflict (slug) do nothing;
