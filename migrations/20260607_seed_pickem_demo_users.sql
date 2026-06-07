-- Seed 3 demo pickem users with full predictions for wc-2026.
-- This is safe to run multiple times (uses upserts / conflict handling).

with competition as (
  select id
  from pickem_competitions
  where slug = 'wc-2026'
  limit 1
),
demo_users as (
  select *
  from (
    values
      ('11111111-1111-4111-8111-111111111111'::uuid, 'Alex North'),
      ('22222222-2222-4222-8222-222222222222'::uuid, 'Mila East'),
      ('33333333-3333-4333-8333-333333333333'::uuid, 'Rico West')
  ) as u(user_id, display_name)
),
group_base as (
  select
    t.group_code,
    t.id as team_id,
    t.sort_order
  from competition c
  join pickem_teams t
    on t.competition_id = c.id
),
group_predictions as (
  -- user 1: mostly natural order
  select
    u.user_id,
    c.id as competition_id,
    gb.group_code,
    gb.team_id,
    gb.sort_order as predicted_position,
    now() as updated_at
  from demo_users u
  cross join competition c
  join group_base gb on true
  where u.user_id = '11111111-1111-4111-8111-111111111111'::uuid

  union all

  -- user 2: reverse order in each group
  select
    u.user_id,
    c.id as competition_id,
    gb.group_code,
    gb.team_id,
    (5 - gb.sort_order) as predicted_position,
    now() as updated_at
  from demo_users u
  cross join competition c
  join group_base gb on true
  where u.user_id = '22222222-2222-4222-8222-222222222222'::uuid

  union all

  -- user 3: rotate by one position
  select
    u.user_id,
    c.id as competition_id,
    gb.group_code,
    gb.team_id,
    case when gb.sort_order = 4 then 1 else gb.sort_order + 1 end as predicted_position,
    now() as updated_at
  from demo_users u
  cross join competition c
  join group_base gb on true
  where u.user_id = '33333333-3333-4333-8333-333333333333'::uuid
)
insert into pickem_user_group_predictions (
  user_id,
  competition_id,
  group_code,
  team_id,
  predicted_position,
  updated_at
)
select
  gp.user_id,
  gp.competition_id,
  gp.group_code,
  gp.team_id,
  gp.predicted_position,
  gp.updated_at
from group_predictions gp
on conflict (user_id, competition_id, group_code, team_id) do update
set
  predicted_position = excluded.predicted_position,
  updated_at = excluded.updated_at;

with competition as (
  select id
  from pickem_competitions
  where slug = 'wc-2026'
  limit 1
),
demo_users as (
  select *
  from (
    values
      ('11111111-1111-4111-8111-111111111111'::uuid, 1),
      ('22222222-2222-4222-8222-222222222222'::uuid, 2),
      ('33333333-3333-4333-8333-333333333333'::uuid, 3)
  ) as u(user_id, seed)
),
match_predictions as (
  select
    u.user_id,
    c.id as competition_id,
    m.id as match_id,
    ((ascii(left(coalesce(m.api_match_id, 'A1'), 1)) + u.seed) % 4) as predicted_home_score,
    ((coalesce(substring(coalesce(m.api_match_id, 'A1') from '[0-9]+')::int, 1) + u.seed * 2) % 4) as predicted_away_score,
    now() as updated_at
  from competition c
  cross join demo_users u
  join pickem_matches m
    on m.competition_id = c.id
   and m.stage = 'group'
)
insert into pickem_user_match_predictions (
  user_id,
  competition_id,
  match_id,
  predicted_home_score,
  predicted_away_score,
  predicted_outcome,
  updated_at
)
select
  mp.user_id,
  mp.competition_id,
  mp.match_id,
  mp.predicted_home_score,
  mp.predicted_away_score,
  case
    when mp.predicted_home_score = mp.predicted_away_score then 'draw'
    when mp.predicted_home_score > mp.predicted_away_score then 'home'
    else 'away'
  end as predicted_outcome,
  mp.updated_at
from match_predictions mp
on conflict (user_id, competition_id, match_id) do update
set
  predicted_home_score = excluded.predicted_home_score,
  predicted_away_score = excluded.predicted_away_score,
  predicted_outcome = excluded.predicted_outcome,
  updated_at = excluded.updated_at;

with competition as (
  select id
  from pickem_competitions
  where slug = 'wc-2026'
  limit 1
),
demo_users as (
  select *
  from (
    values
      ('11111111-1111-4111-8111-111111111111'::uuid),
      ('22222222-2222-4222-8222-222222222222'::uuid),
      ('33333333-3333-4333-8333-333333333333'::uuid)
  ) as u(user_id)
)
insert into pickem_prediction_submissions (
  user_id,
  competition_id,
  submitted_at,
  updated_at
)
select
  u.user_id,
  c.id,
  now(),
  now()
from demo_users u
cross join competition c
on conflict (user_id, competition_id) do update
set
  submitted_at = excluded.submitted_at,
  updated_at = excluded.updated_at;

-- Optional display names in user_preferences.
-- If your schema enforces FK to auth.users and demo UUIDs don't exist there, safely ignore.
do $$
begin
  begin
    insert into user_preferences (user_id, display_name)
    values
      ('11111111-1111-4111-8111-111111111111'::uuid, 'Alex North'),
      ('22222222-2222-4222-8222-222222222222'::uuid, 'Mila East'),
      ('33333333-3333-4333-8333-333333333333'::uuid, 'Rico West')
    on conflict (user_id) do update
    set display_name = excluded.display_name;
  exception
    when foreign_key_violation then
      null;
    when undefined_table then
      null;
    when undefined_column then
      null;
  end;
end $$;
