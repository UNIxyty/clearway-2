-- Sync WC-2026 kickoff times from user-provided wc2026_matches.json
-- Source timezone is parsed per-row (UTC-6, UTC-4, etc) then converted to UTC.

begin;

with competition as (
  select id from pickem_competitions where slug = 'wc-2026' limit 1
), source_rows as (
  select * from (values
    ('A','MEX','RSA','2026-06-11T19:00:00Z'::timestamptz),
    ('A','KOR','CZE','2026-06-12T02:00:00Z'::timestamptz),
    ('A','CZE','RSA','2026-06-18T16:00:00Z'::timestamptz),
    ('A','MEX','KOR','2026-06-19T01:00:00Z'::timestamptz),
    ('A','CZE','MEX','2026-06-25T01:00:00Z'::timestamptz),
    ('A','RSA','KOR','2026-06-25T01:00:00Z'::timestamptz),
    ('B','CAN','BIH','2026-06-12T19:00:00Z'::timestamptz),
    ('B','QAT','SUI','2026-06-13T19:00:00Z'::timestamptz),
    ('B','SUI','BIH','2026-06-18T19:00:00Z'::timestamptz),
    ('B','CAN','QAT','2026-06-18T22:00:00Z'::timestamptz),
    ('B','SUI','CAN','2026-06-24T19:00:00Z'::timestamptz),
    ('B','BIH','QAT','2026-06-24T19:00:00Z'::timestamptz),
    ('C','BRA','MAR','2026-06-13T22:00:00Z'::timestamptz),
    ('C','HAI','SCO','2026-06-14T01:00:00Z'::timestamptz),
    ('C','SCO','MAR','2026-06-19T22:00:00Z'::timestamptz),
    ('C','BRA','HAI','2026-06-20T00:30:00Z'::timestamptz),
    ('C','SCO','BRA','2026-06-24T22:00:00Z'::timestamptz),
    ('C','MAR','HAI','2026-06-24T22:00:00Z'::timestamptz),
    ('D','USA','PAR','2026-06-13T01:00:00Z'::timestamptz),
    ('D','AUS','TUR','2026-06-14T04:00:00Z'::timestamptz),
    ('D','USA','AUS','2026-06-19T19:00:00Z'::timestamptz),
    ('D','TUR','PAR','2026-06-20T03:00:00Z'::timestamptz),
    ('D','TUR','USA','2026-06-26T02:00:00Z'::timestamptz),
    ('D','PAR','AUS','2026-06-26T02:00:00Z'::timestamptz),
    ('E','GER','CUW','2026-06-14T17:00:00Z'::timestamptz),
    ('E','CIV','ECU','2026-06-14T23:00:00Z'::timestamptz),
    ('E','GER','CIV','2026-06-20T20:00:00Z'::timestamptz),
    ('E','ECU','CUW','2026-06-21T00:00:00Z'::timestamptz),
    ('E','CUW','CIV','2026-06-25T20:00:00Z'::timestamptz),
    ('E','ECU','GER','2026-06-25T20:00:00Z'::timestamptz),
    ('F','NED','JPN','2026-06-14T20:00:00Z'::timestamptz),
    ('F','SWE','TUN','2026-06-15T02:00:00Z'::timestamptz),
    ('F','NED','SWE','2026-06-20T17:00:00Z'::timestamptz),
    ('F','TUN','JPN','2026-06-21T04:00:00Z'::timestamptz),
    ('F','JPN','SWE','2026-06-25T23:00:00Z'::timestamptz),
    ('F','TUN','NED','2026-06-25T23:00:00Z'::timestamptz),
    ('G','BEL','EGY','2026-06-15T19:00:00Z'::timestamptz),
    ('G','IRN','NZL','2026-06-16T01:00:00Z'::timestamptz),
    ('G','BEL','IRN','2026-06-21T19:00:00Z'::timestamptz),
    ('G','NZL','EGY','2026-06-22T01:00:00Z'::timestamptz),
    ('G','EGY','IRN','2026-06-27T03:00:00Z'::timestamptz),
    ('G','NZL','BEL','2026-06-27T03:00:00Z'::timestamptz),
    ('H','ESP','CPV','2026-06-15T16:00:00Z'::timestamptz),
    ('H','KSA','URU','2026-06-15T22:00:00Z'::timestamptz),
    ('H','ESP','KSA','2026-06-21T16:00:00Z'::timestamptz),
    ('H','URU','CPV','2026-06-21T22:00:00Z'::timestamptz),
    ('H','CPV','KSA','2026-06-27T00:00:00Z'::timestamptz),
    ('H','URU','ESP','2026-06-27T00:00:00Z'::timestamptz),
    ('I','FRA','SEN','2026-06-16T19:00:00Z'::timestamptz),
    ('I','IRQ','NOR','2026-06-16T22:00:00Z'::timestamptz),
    ('I','FRA','IRQ','2026-06-22T21:00:00Z'::timestamptz),
    ('I','NOR','SEN','2026-06-23T00:00:00Z'::timestamptz),
    ('I','NOR','FRA','2026-06-26T19:00:00Z'::timestamptz),
    ('I','SEN','IRQ','2026-06-26T19:00:00Z'::timestamptz),
    ('J','ARG','ALG','2026-06-17T01:00:00Z'::timestamptz),
    ('J','AUT','JOR','2026-06-17T04:00:00Z'::timestamptz),
    ('J','ARG','AUT','2026-06-22T17:00:00Z'::timestamptz),
    ('J','JOR','ALG','2026-06-23T03:00:00Z'::timestamptz),
    ('J','ALG','AUT','2026-06-28T02:00:00Z'::timestamptz),
    ('J','JOR','ARG','2026-06-28T02:00:00Z'::timestamptz),
    ('K','POR','COD','2026-06-17T17:00:00Z'::timestamptz),
    ('K','UZB','COL','2026-06-18T02:00:00Z'::timestamptz),
    ('K','POR','UZB','2026-06-23T17:00:00Z'::timestamptz),
    ('K','COL','COD','2026-06-24T02:00:00Z'::timestamptz),
    ('K','COL','POR','2026-06-27T23:30:00Z'::timestamptz),
    ('K','COD','UZB','2026-06-27T23:30:00Z'::timestamptz),
    ('L','ENG','CRO','2026-06-17T20:00:00Z'::timestamptz),
    ('L','GHA','PAN','2026-06-17T23:00:00Z'::timestamptz),
    ('L','ENG','GHA','2026-06-23T20:00:00Z'::timestamptz),
    ('L','PAN','CRO','2026-06-23T23:00:00Z'::timestamptz),
    ('L','PAN','ENG','2026-06-27T21:00:00Z'::timestamptz),
    ('L','CRO','GHA','2026-06-27T21:00:00Z'::timestamptz)
  ) as v(group_code, home_code, away_code, kickoff_at)
), resolved as (
  select
    c.id as competition_id,
    sr.group_code,
    sr.home_code,
    sr.away_code,
    sr.kickoff_at,
    ht.id as home_team_id,
    at.id as away_team_id
  from competition c
  join source_rows sr on true
  join pickem_teams ht on ht.competition_id = c.id and ht.short_name = sr.home_code
  join pickem_teams at on at.competition_id = c.id and at.short_name = sr.away_code
)
update pickem_matches pm
set kickoff_at = r.kickoff_at, updated_at = now()
from resolved r
where pm.competition_id = r.competition_id
  and pm.group_code = r.group_code
  and pm.home_team_id = r.home_team_id
  and pm.away_team_id = r.away_team_id;

commit;
