-- Apply fixes from /Users/whae/Downloads/wc2026_fixes.json
-- Note in source file: dates are EEST (Europe/Riga). We keep each match's local kickoff time
-- and shift only the local date where a fix is provided.

with competition as (
  select id
  from pickem_competitions
  where slug = 'wc-2026'
  limit 1
),
team_map as (
  select
    t.competition_id,
    t.id,
    t.short_name
  from pickem_teams t
  join competition c on c.id = t.competition_id
),
match_fixes as (
  select *
  from (
    values
      -- ADD / CHANGE fixtures
      ('K1', 'K', 'POR', 'COD', date '2026-06-17'),
      ('K2', 'K', 'UZB', 'COL', date '2026-06-17'),
      ('L1', 'L', 'ENG', 'CRO', date '2026-06-17'),
      ('L2', 'L', 'GHA', 'PAN', date '2026-06-17'),
      -- FIX_DATE fixtures
      ('D2', 'D', 'AUS', 'TUR', date '2026-06-14'),
      ('K4', 'K', 'COL', 'COD', date '2026-06-23'),
      ('L4', 'L', 'PAN', 'CRO', date '2026-06-23')
  ) as x(api_match_id, group_code, home_code, away_code, local_date)
),
existing as (
  select
    m.competition_id,
    m.api_match_id,
    m.kickoff_at,
    m.venue
  from pickem_matches m
  join competition c on c.id = m.competition_id
),
prepared as (
  select
    c.id as competition_id,
    f.api_match_id,
    'group'::text as stage,
    ('Group ' || f.group_code)::text as round_label,
    f.group_code,
    ht.id as home_team_id,
    at.id as away_team_id,
    (
      (
        f.local_date + coalesce((e.kickoff_at at time zone 'Europe/Riga')::time, time '15:00')
      ) at time zone 'Europe/Riga'
    ) as kickoff_at,
    coalesce(e.venue, 'TBD') as venue,
    'scheduled'::text as status
  from competition c
  join match_fixes f on true
  join team_map ht
    on ht.competition_id = c.id
   and ht.short_name = f.home_code
  join team_map at
    on at.competition_id = c.id
   and at.short_name = f.away_code
  left join existing e
    on e.competition_id = c.id
   and e.api_match_id = f.api_match_id
)
insert into pickem_matches (
  competition_id,
  api_match_id,
  stage,
  round_label,
  group_code,
  home_team_id,
  away_team_id,
  kickoff_at,
  venue,
  status,
  updated_at
)
select
  competition_id,
  api_match_id,
  stage,
  round_label,
  group_code,
  home_team_id,
  away_team_id,
  kickoff_at,
  venue,
  status,
  now()
from prepared
on conflict (competition_id, api_match_id) do update
set
  stage = excluded.stage,
  round_label = excluded.round_label,
  group_code = excluded.group_code,
  home_team_id = excluded.home_team_id,
  away_team_id = excluded.away_team_id,
  kickoff_at = excluded.kickoff_at,
  venue = excluded.venue,
  status = excluded.status,
  updated_at = now();
