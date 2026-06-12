create table if not exists pickem_user_lock_overrides (
  user_id uuid not null,
  competition_id uuid not null references pickem_competitions(id) on delete cascade,
  unlock_until timestamptz not null,
  reason text,
  updated_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, competition_id)
);

create index if not exists pickem_user_lock_overrides_competition_idx
  on pickem_user_lock_overrides (competition_id, unlock_until desc);
