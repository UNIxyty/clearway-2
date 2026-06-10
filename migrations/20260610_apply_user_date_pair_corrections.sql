-- Apply explicit fixture corrections requested by user (June 10, 2026)
-- Scope: wc-2026 only

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
      ('K4', 'K', 'COL', 'COD', '2026-06-23T15:00:00.000Z'::timestamptz),
      ('L4', 'L', 'PAN', 'CRO', '2026-06-23T14:00:00.000Z'::timestamptz),
      ('H5', 'H', 'KSA', 'ESP', '2026-06-21T09:00:00.000Z'::timestamptz),
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
