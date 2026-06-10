-- Clean/safe fixture correction for wc-2026 group stage.
-- Purpose:
-- 1) Remove accidental extra group fixtures (K7/K8/L7/L8)
-- 2) Enforce canonical Group K/L fixtures and kickoff times
-- 3) Keep scope strictly to competition slug = 'wc-2026'

with competition as (
  select id
  from pickem_competitions
  where slug = 'wc-2026'
  limit 1
)
delete from pickem_matches pm
using competition c
where pm.competition_id = c.id
  and pm.api_match_id in ('K7', 'K8', 'L7', 'L8');

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
      -- Group K
      ('K1', 'K', 'POR', 'COD', '2026-06-17T17:00:00.000Z'::timestamptz),
      ('K2', 'K', 'UZB', 'COL', '2026-06-18T02:00:00.000Z'::timestamptz),
      ('K3', 'K', 'POR', 'UZB', '2026-06-23T17:00:00.000Z'::timestamptz),
      ('K4', 'K', 'COL', 'COD', '2026-06-24T02:00:00.000Z'::timestamptz),
      ('K5', 'K', 'COL', 'POR', '2026-06-27T23:30:00.000Z'::timestamptz),
      ('K6', 'K', 'COD', 'UZB', '2026-06-27T23:30:00.000Z'::timestamptz),
      -- Group L
      ('L1', 'L', 'ENG', 'CRO', '2026-06-17T20:00:00.000Z'::timestamptz),
      ('L2', 'L', 'GHA', 'PAN', '2026-06-17T23:00:00.000Z'::timestamptz),
      ('L3', 'L', 'ENG', 'GHA', '2026-06-23T20:00:00.000Z'::timestamptz),
      ('L4', 'L', 'PAN', 'CRO', '2026-06-23T23:00:00.000Z'::timestamptz),
      ('L5', 'L', 'PAN', 'ENG', '2026-06-27T21:00:00.000Z'::timestamptz),
      ('L6', 'L', 'CRO', 'GHA', '2026-06-27T21:00:00.000Z'::timestamptz)
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
