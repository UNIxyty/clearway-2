-- Final WC-2026 fixture corrections + H6 pick migration
-- User-confirmed changes:
-- D2=13.06, J2=16.06, L2/K2=17.06, F4=20.06, L4/K4=23.06,
-- H5=21.06, H6=26.06 with pair CPV vs KSA, L5/L6/K5/K6=27.06
--
-- Also handles prior data issue:
-- - If erroneous "CPV vs URU" H6-style row exists, copy its user picks
--   to canonical H6 (CPV vs KSA), then remove duplicate erroneous row(s).

begin;

with competition as (
  select id
  from pickem_competitions
  where slug = 'wc-2026'
  limit 1
),
canonical as (
  select *
  from (
    values
      ('D2', 'D', 'AUS', 'TUR', '2026-06-13T21:00:00.000Z'::timestamptz),
      ('J2', 'J', 'AUT', 'JOR', '2026-06-16T21:00:00.000Z'::timestamptz),
      ('K2', 'K', 'UZB', 'COL', '2026-06-17T21:00:00.000Z'::timestamptz),
      ('L2', 'L', 'GHA', 'PAN', '2026-06-17T21:00:00.000Z'::timestamptz),
      ('F4', 'F', 'TUN', 'JPN', '2026-06-20T21:00:00.000Z'::timestamptz),
      ('H5', 'H', 'KSA', 'ESP', '2026-06-21T09:00:00.000Z'::timestamptz),
      ('K4', 'K', 'COL', 'COD', '2026-06-23T15:00:00.000Z'::timestamptz),
      ('L4', 'L', 'PAN', 'CRO', '2026-06-23T14:00:00.000Z'::timestamptz),
      ('H6', 'H', 'CPV', 'KSA', '2026-06-26T09:00:00.000Z'::timestamptz),
      ('K5', 'K', 'COL', 'POR', '2026-06-27T15:00:00.000Z'::timestamptz),
      ('K6', 'K', 'COD', 'UZB', '2026-06-27T15:00:00.000Z'::timestamptz),
      ('L5', 'L', 'PAN', 'ENG', '2026-06-27T15:00:00.000Z'::timestamptz),
      ('L6', 'L', 'CRO', 'GHA', '2026-06-27T15:00:00.000Z'::timestamptz)
  ) as x(api_match_id, group_code, home_code, away_code, kickoff_at)
),
resolved as (
  select
    c.id as competition_id,
    k.api_match_id,
    k.group_code,
    ht.id as home_team_id,
    at.id as away_team_id,
    k.kickoff_at
  from competition c
  join canonical k on true
  join pickem_teams ht
    on ht.competition_id = c.id
   and ht.short_name = k.home_code
  join pickem_teams at
    on at.competition_id = c.id
   and at.short_name = k.away_code
)
update pickem_matches pm
set
  group_code = r.group_code,
  home_team_id = r.home_team_id,
  away_team_id = r.away_team_id,
  kickoff_at = r.kickoff_at,
  updated_at = now()
from resolved r
where pm.competition_id = r.competition_id
  and pm.api_match_id = r.api_match_id;

-- Migrate user picks from erroneous CPV vs URU rows into canonical H6 CPV vs KSA.
with competition as (
  select id
  from pickem_competitions
  where slug = 'wc-2026'
  limit 1
),
target as (
  select pm.id as match_id, c.id as competition_id
  from competition c
  join pickem_matches pm
    on pm.competition_id = c.id
   and pm.api_match_id = 'H6'
  limit 1
),
source_rows as (
  select pm.id as match_id, c.id as competition_id
  from competition c
  join pickem_matches pm on pm.competition_id = c.id
  join pickem_teams ht on ht.id = pm.home_team_id
  join pickem_teams at on at.id = pm.away_team_id
  where pm.group_code = 'H'
    and ht.short_name = 'CPV'
    and at.short_name = 'URU'
),
source_picks as (
  select p.*
  from pickem_user_match_predictions p
  join source_rows s
    on s.competition_id = p.competition_id
   and s.match_id = p.match_id
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
  p.user_id,
  p.competition_id,
  t.match_id,
  p.predicted_home_score,
  p.predicted_away_score,
  case
    when p.predicted_home_score = p.predicted_away_score then 'draw'
    when p.predicted_home_score > p.predicted_away_score then 'home'
    else 'away'
  end as predicted_outcome,
  now()
from source_picks p
cross join target t
where not exists (
  select 1
  from pickem_user_match_predictions existing
  where existing.user_id = p.user_id
    and existing.competition_id = p.competition_id
    and existing.match_id = t.match_id
)
on conflict (user_id, competition_id, match_id) do update
set
  predicted_home_score = excluded.predicted_home_score,
  predicted_away_score = excluded.predicted_away_score,
  predicted_outcome = excluded.predicted_outcome,
  updated_at = now();

-- Remove duplicate erroneous CPV vs URU match rows in Group H after migration.
with competition as (
  select id
  from pickem_competitions
  where slug = 'wc-2026'
  limit 1
),
to_delete as (
  select pm.id
  from competition c
  join pickem_matches pm on pm.competition_id = c.id
  join pickem_teams ht on ht.id = pm.home_team_id
  join pickem_teams at on at.id = pm.away_team_id
  where pm.group_code = 'H'
    and ht.short_name = 'CPV'
    and at.short_name = 'URU'
)
delete from pickem_matches
where id in (select id from to_delete);

commit;
