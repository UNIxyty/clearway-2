-- Seed FIFA WC 2026 groups, teams, and group-stage matches
-- Source files:
-- - /Users/whae/Downloads/wc2026_groups.json
-- - /Users/whae/Downloads/wc2026_matches_group_stage.json

insert into pickem_competitions (slug, name, starts_at, group_lock_at)
values (
  'wc-2026',
  'FIFA World Cup 2026',
  '2026-06-11T18:00:00Z',
  '2026-06-11T19:20:00Z'
)
on conflict (slug) do update
set
  name = excluded.name,
  starts_at = excluded.starts_at,
  group_lock_at = excluded.group_lock_at;

with competition as (
  select id
  from pickem_competitions
  where slug = 'wc-2026'
  limit 1
),
group_rows as (
  select
    c.id as competition_id,
    g.code,
    g.name
  from competition c
  cross join (
    values
      ('A', 'Group A'),
      ('B', 'Group B'),
      ('C', 'Group C'),
      ('D', 'Group D'),
      ('E', 'Group E'),
      ('F', 'Group F'),
      ('G', 'Group G'),
      ('H', 'Group H'),
      ('I', 'Group I'),
      ('J', 'Group J'),
      ('K', 'Group K'),
      ('L', 'Group L')
  ) as g(code, name)
)
insert into pickem_groups (competition_id, code, name)
select competition_id, code, name
from group_rows
on conflict (competition_id, code) do update
set name = excluded.name;

with competition as (
  select id
  from pickem_competitions
  where slug = 'wc-2026'
  limit 1
),
team_rows as (
  select
    c.id as competition_id,
    t.group_code,
    t.code,
    t.name,
    t.sort_order
  from competition c
  cross join (
    values
      ('A', 'MEX', 'Mexico', 1),
      ('A', 'RSA', 'South Africa', 2),
      ('A', 'KOR', 'Korea Republic', 3),
      ('A', 'CZE', 'Czechia', 4),
      ('B', 'CAN', 'Canada', 1),
      ('B', 'BIH', 'Bosnia and Herzegovina', 2),
      ('B', 'QAT', 'Qatar', 3),
      ('B', 'SUI', 'Switzerland', 4),
      ('C', 'BRA', 'Brazil', 1),
      ('C', 'MAR', 'Morocco', 2),
      ('C', 'HAI', 'Haiti', 3),
      ('C', 'SCO', 'Scotland', 4),
      ('D', 'USA', 'United States', 1),
      ('D', 'PAR', 'Paraguay', 2),
      ('D', 'AUS', 'Australia', 3),
      ('D', 'TUR', 'Türkiye', 4),
      ('E', 'GER', 'Germany', 1),
      ('E', 'CUW', 'Curaçao', 2),
      ('E', 'CIV', 'Côte d''Ivoire', 3),
      ('E', 'ECU', 'Ecuador', 4),
      ('F', 'NED', 'Netherlands', 1),
      ('F', 'JPN', 'Japan', 2),
      ('F', 'SWE', 'Sweden', 3),
      ('F', 'TUN', 'Tunisia', 4),
      ('G', 'BEL', 'Belgium', 1),
      ('G', 'EGY', 'Egypt', 2),
      ('G', 'IRN', 'IR Iran', 3),
      ('G', 'NZL', 'New Zealand', 4),
      ('H', 'ESP', 'Spain', 1),
      ('H', 'CPV', 'Cabo Verde', 2),
      ('H', 'KSA', 'Saudi Arabia', 3),
      ('H', 'URU', 'Uruguay', 4),
      ('I', 'FRA', 'France', 1),
      ('I', 'SEN', 'Senegal', 2),
      ('I', 'IRQ', 'Iraq', 3),
      ('I', 'NOR', 'Norway', 4),
      ('J', 'ARG', 'Argentina', 1),
      ('J', 'ALG', 'Algeria', 2),
      ('J', 'AUT', 'Austria', 3),
      ('J', 'JOR', 'Jordan', 4),
      ('K', 'POR', 'Portugal', 1),
      ('K', 'COD', 'DR Congo', 2),
      ('K', 'UZB', 'Uzbekistan', 3),
      ('K', 'COL', 'Colombia', 4),
      ('L', 'ENG', 'England', 1),
      ('L', 'CRO', 'Croatia', 2),
      ('L', 'GHA', 'Ghana', 3),
      ('L', 'PAN', 'Panama', 4)
  ) as t(group_code, code, name, sort_order)
)
insert into pickem_teams (
  competition_id,
  group_code,
  fifa_team_id,
  name,
  short_name,
  crest_url,
  sort_order
)
select
  competition_id,
  group_code,
  null,
  name,
  code,
  null,
  sort_order
from team_rows
on conflict (competition_id, group_code, name) do update
set
  short_name = excluded.short_name,
  sort_order = excluded.sort_order;

with competition as (
  select id
  from pickem_competitions
  where slug = 'wc-2026'
  limit 1
),
match_rows as (
  select
    c.id as competition_id,
    m.api_match_id,
    m.group_code,
    m.home_code,
    m.away_code,
    m.kickoff_at,
    m.venue
  from competition c
  cross join (
    values
      ('A1', 'A', 'MEX', 'RSA', '2026-06-11T12:00:00.000Z'::timestamptz, 'Estadio Azteca, Mexico City, Mexico'),
      ('A2', 'A', 'KOR', 'CZE', '2026-06-11T19:00:00.000Z'::timestamptz, 'Estadio Akron, Guadalajara, Mexico'),
      ('A3', 'A', 'CZE', 'RSA', '2026-06-18T09:00:00.000Z'::timestamptz, 'Mercedes-Benz Stadium, Atlanta, USA'),
      ('A4', 'A', 'MEX', 'KOR', '2026-06-18T18:00:00.000Z'::timestamptz, 'Estadio Akron, Guadalajara, Mexico'),
      ('A5', 'A', 'CZE', 'MEX', '2026-06-24T18:00:00.000Z'::timestamptz, 'Estadio Azteca, Mexico City, Mexico'),
      ('A6', 'A', 'RSA', 'KOR', '2026-06-24T18:00:00.000Z'::timestamptz, 'Estadio BBVA, Monterrey, Mexico'),
      ('B1', 'B', 'CAN', 'BIH', '2026-06-12T12:00:00.000Z'::timestamptz, 'BMO Field, Toronto, Canada'),
      ('B2', 'B', 'QAT', 'SUI', '2026-06-13T12:00:00.000Z'::timestamptz, 'Levi''s Stadium, Santa Clara, USA'),
      ('B3', 'B', 'SUI', 'BIH', '2026-06-18T12:00:00.000Z'::timestamptz, 'SoFi Stadium, Inglewood, USA'),
      ('B4', 'B', 'CAN', 'QAT', '2026-06-18T15:00:00.000Z'::timestamptz, 'BC Place, Vancouver, Canada'),
      ('B5', 'B', 'SUI', 'CAN', '2026-06-24T12:00:00.000Z'::timestamptz, 'BC Place, Vancouver, Canada'),
      ('B6', 'B', 'BIH', 'QAT', '2026-06-24T12:00:00.000Z'::timestamptz, 'Lumen Field, Seattle, USA'),
      ('C1', 'C', 'BRA', 'MAR', '2026-06-13T15:00:00.000Z'::timestamptz, 'MetLife Stadium, East Rutherford, USA'),
      ('C2', 'C', 'HAI', 'SCO', '2026-06-13T18:00:00.000Z'::timestamptz, 'Gillette Stadium, Foxboro, USA'),
      ('C3', 'C', 'SCO', 'MAR', '2026-06-19T15:00:00.000Z'::timestamptz, 'Gillette Stadium, Foxboro, USA'),
      ('C4', 'C', 'BRA', 'HAI', '2026-06-19T17:30:00.000Z'::timestamptz, 'Lincoln Financial Field, Philadelphia, USA'),
      ('C5', 'C', 'SCO', 'BRA', '2026-06-24T15:00:00.000Z'::timestamptz, 'Hard Rock Stadium, Miami, USA'),
      ('C6', 'C', 'MAR', 'HAI', '2026-06-24T15:00:00.000Z'::timestamptz, 'Mercedes-Benz Stadium, Atlanta, USA'),
      ('D1', 'D', 'USA', 'PAR', '2026-06-12T18:00:00.000Z'::timestamptz, 'SoFi Stadium, Inglewood, USA'),
      ('D2', 'D', 'AUS', 'TUR', '2026-06-13T21:00:00.000Z'::timestamptz, 'BC Place, Vancouver, Canada'),
      ('D3', 'D', 'USA', 'AUS', '2026-06-19T12:00:00.000Z'::timestamptz, 'Lumen Field, Seattle, USA'),
      ('D4', 'D', 'TUR', 'PAR', '2026-06-19T20:00:00.000Z'::timestamptz, 'Levi''s Stadium, Santa Clara, USA'),
      ('D5', 'D', 'TUR', 'USA', '2026-06-25T19:00:00.000Z'::timestamptz, 'SoFi Stadium, Inglewood, USA'),
      ('D6', 'D', 'PAR', 'AUS', '2026-06-25T19:00:00.000Z'::timestamptz, 'Levi''s Stadium, Santa Clara, USA'),
      ('E1', 'E', 'GER', 'CUW', '2026-06-14T10:00:00.000Z'::timestamptz, 'NRG Stadium, Houston, USA'),
      ('E2', 'E', 'CIV', 'ECU', '2026-06-14T16:00:00.000Z'::timestamptz, 'Lincoln Financial Field, Philadelphia, USA'),
      ('E3', 'E', 'GER', 'CIV', '2026-06-20T13:00:00.000Z'::timestamptz, 'BMO Field, Toronto, Canada'),
      ('E4', 'E', 'ECU', 'CUW', '2026-06-20T17:00:00.000Z'::timestamptz, 'Arrowhead Stadium, Kansas City, USA'),
      ('E5', 'E', 'CUW', 'CIV', '2026-06-25T13:00:00.000Z'::timestamptz, 'Lincoln Financial Field, Philadelphia, USA'),
      ('E6', 'E', 'ECU', 'GER', '2026-06-25T13:00:00.000Z'::timestamptz, 'MetLife Stadium, East Rutherford, USA'),
      ('F1', 'F', 'NED', 'JPN', '2026-06-14T13:00:00.000Z'::timestamptz, 'AT&T Stadium, Arlington, USA'),
      ('F2', 'F', 'SWE', 'TUN', '2026-06-14T19:00:00.000Z'::timestamptz, 'Estadio BBVA, Monterrey, Mexico'),
      ('F3', 'F', 'NED', 'SWE', '2026-06-20T10:00:00.000Z'::timestamptz, 'NRG Stadium, Houston, USA'),
      ('F4', 'F', 'TUN', 'JPN', '2026-06-20T21:00:00.000Z'::timestamptz, 'Estadio BBVA, Monterrey, Mexico'),
      ('F5', 'F', 'JPN', 'SWE', '2026-06-25T16:00:00.000Z'::timestamptz, 'AT&T Stadium, Arlington, USA'),
      ('F6', 'F', 'TUN', 'NED', '2026-06-25T16:00:00.000Z'::timestamptz, 'Arrowhead Stadium, Kansas City, USA'),
      ('G1', 'G', 'BEL', 'EGY', '2026-06-15T12:00:00.000Z'::timestamptz, 'Lumen Field, Seattle, USA'),
      ('G2', 'G', 'IRN', 'NZL', '2026-06-15T18:00:00.000Z'::timestamptz, 'SoFi Stadium, Inglewood, USA'),
      ('G3', 'G', 'BEL', 'IRN', '2026-06-21T12:00:00.000Z'::timestamptz, 'SoFi Stadium, Inglewood, USA'),
      ('G4', 'G', 'NZL', 'EGY', '2026-06-21T18:00:00.000Z'::timestamptz, 'BC Place, Vancouver, Canada'),
      ('G5', 'G', 'EGY', 'IRN', '2026-06-26T12:00:00.000Z'::timestamptz, 'Lumen Field, Seattle, USA'),
      ('G6', 'G', 'NZL', 'BEL', '2026-06-26T12:00:00.000Z'::timestamptz, 'BC Place, Vancouver, Canada'),
      ('H1', 'H', 'ESP', 'CPV', '2026-06-15T10:00:00.000Z'::timestamptz, 'Mercedes-Benz Stadium, Atlanta, USA'),
      ('H2', 'H', 'KSA', 'URU', '2026-06-15T15:00:00.000Z'::timestamptz, 'Hard Rock Stadium, Miami, USA'),
      ('H3', 'H', 'ESP', 'KSA', '2026-06-21T09:00:00.000Z'::timestamptz, 'Mercedes-Benz Stadium, Atlanta, USA'),
      ('H4', 'H', 'URU', 'CPV', '2026-06-21T15:00:00.000Z'::timestamptz, 'Hard Rock Stadium, Miami, USA'),
      ('H5', 'H', 'KSA', 'ESP', '2026-06-21T09:00:00.000Z'::timestamptz, 'Mercedes-Benz Stadium, Atlanta, USA'),
      ('H6', 'H', 'CPV', 'KSA', '2026-06-26T09:00:00.000Z'::timestamptz, 'Hard Rock Stadium, Miami, USA'),
      ('I1', 'I', 'FRA', 'SEN', '2026-06-16T12:00:00.000Z'::timestamptz, 'MetLife Stadium, East Rutherford, USA'),
      ('I2', 'I', 'IRQ', 'NOR', '2026-06-16T15:00:00.000Z'::timestamptz, 'Gillette Stadium, Foxboro, USA'),
      ('I3', 'I', 'FRA', 'IRQ', '2026-06-22T14:00:00.000Z'::timestamptz, 'Lincoln Financial Field, Philadelphia, USA'),
      ('I4', 'I', 'NOR', 'SEN', '2026-06-22T17:00:00.000Z'::timestamptz, 'MetLife Stadium, East Rutherford, USA'),
      ('I5', 'I', 'SEN', 'IRQ', '2026-06-26T15:00:00.000Z'::timestamptz, 'Lincoln Financial Field, Philadelphia, USA'),
      ('I6', 'I', 'NOR', 'FRA', '2026-06-26T15:00:00.000Z'::timestamptz, 'MetLife Stadium, East Rutherford, USA'),
      ('J1', 'J', 'ARG', 'ALG', '2026-06-16T18:00:00.000Z'::timestamptz, 'Arrowhead Stadium, Kansas City, USA'),
      ('J2', 'J', 'AUT', 'JOR', '2026-06-16T21:00:00.000Z'::timestamptz, 'Levi''s Stadium, Santa Clara, USA'),
      ('J3', 'J', 'ARG', 'AUT', '2026-06-22T10:00:00.000Z'::timestamptz, 'AT&T Stadium, Arlington, USA'),
      ('J4', 'J', 'JOR', 'ALG', '2026-06-22T20:00:00.000Z'::timestamptz, 'Levi''s Stadium, Santa Clara, USA'),
      ('J5', 'J', 'ALG', 'AUT', '2026-06-27T12:00:00.000Z'::timestamptz, 'Arrowhead Stadium, Kansas City, USA'),
      ('J6', 'J', 'JOR', 'ARG', '2026-06-27T12:00:00.000Z'::timestamptz, 'AT&T Stadium, Arlington, USA'),
      ('K1', 'K', 'POR', 'COD', '2026-06-17T12:00:00.000Z'::timestamptz, 'NRG Stadium, Houston, USA'),
      ('K2', 'K', 'UZB', 'COL', '2026-06-17T21:00:00.000Z'::timestamptz, 'Estadio Akron, Guadalajara, Mexico'),
      ('K3', 'K', 'POR', 'COL', '2026-06-27T15:00:00.000Z'::timestamptz, 'NRG Stadium, Houston, USA'),
      ('K4', 'K', 'COL', 'COD', '2026-06-23T15:00:00.000Z'::timestamptz, 'Estadio Akron, Guadalajara, Mexico'),
      ('K5', 'K', 'COL', 'POR', '2026-06-27T15:00:00.000Z'::timestamptz, 'AT&T Stadium, Arlington, USA'),
      ('K6', 'K', 'COD', 'UZB', '2026-06-27T15:00:00.000Z'::timestamptz, 'Levi''s Stadium, Santa Clara, USA'),
      ('L1', 'L', 'ENG', 'CRO', '2026-06-17T18:00:00.000Z'::timestamptz, 'Gillette Stadium, Foxboro, USA'),
      ('L2', 'L', 'GHA', 'PAN', '2026-06-17T21:00:00.000Z'::timestamptz, 'BMO Field, Toronto, Canada'),
      ('L3', 'L', 'ENG', 'PAN', '2026-06-28T14:00:00.000Z'::timestamptz, 'Gillette Stadium, Foxboro, USA'),
      ('L4', 'L', 'PAN', 'CRO', '2026-06-23T14:00:00.000Z'::timestamptz, 'BMO Field, Toronto, Canada'),
      ('L5', 'L', 'PAN', 'ENG', '2026-06-27T15:00:00.000Z'::timestamptz, 'Arrowhead Stadium, Kansas City, USA'),
      ('L6', 'L', 'CRO', 'GHA', '2026-06-27T15:00:00.000Z'::timestamptz, 'MetLife Stadium, East Rutherford, USA')
  ) as m(api_match_id, group_code, home_code, away_code, kickoff_at, venue)
),
mapped as (
  select
    mr.competition_id,
    mr.api_match_id,
    'group'::text as stage,
    ('Group ' || mr.group_code)::text as round_label,
    mr.group_code,
    ht.id as home_team_id,
    at.id as away_team_id,
    mr.kickoff_at,
    mr.venue,
    'scheduled'::text as status
  from match_rows mr
  join pickem_teams ht
    on ht.competition_id = mr.competition_id
   and ht.short_name = mr.home_code
  join pickem_teams at
    on at.competition_id = mr.competition_id
   and at.short_name = mr.away_code
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
from mapped
on conflict (competition_id, api_match_id) do update
set
  group_code = excluded.group_code,
  home_team_id = excluded.home_team_id,
  away_team_id = excluded.away_team_id,
  kickoff_at = excluded.kickoff_at,
  venue = excluded.venue,
  status = excluded.status,
  updated_at = now();
