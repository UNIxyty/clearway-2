-- Seed all 32 WC 2026 knockout stage fixtures (venue, city, kickoff, match_number, round).
-- home_team_id / away_team_id are left NULL — admin fills those in Bracket Setup
-- as teams qualify from the group stage.
-- Safe to re-run: ON CONFLICT updates static fields only, never touches team assignments or scores.

BEGIN;

INSERT INTO playoff_matches
  (match_number, round, match_code, kickoff_at, venue, city)
VALUES
  -- ── Round of 32 ──────────────────────────────────────────────────────────
  -- Left pathway (feeds into Left side of bracket → SF_M01)
  ( 74, 'R32', 'R32_M01', '2026-06-29T20:30:00Z', 'Gillette Stadium',      'Foxborough'       ),
  ( 77, 'R32', 'R32_M02', '2026-06-30T21:00:00Z', 'MetLife Stadium',       'East Rutherford'  ),
  ( 73, 'R32', 'R32_M03', '2026-06-28T19:00:00Z', 'SoFi Stadium',          'Inglewood'        ),
  ( 75, 'R32', 'R32_M04', '2026-06-30T01:00:00Z', 'Estadio BBVA',          'Guadalupe'        ),
  ( 83, 'R32', 'R32_M05', '2026-07-02T23:00:00Z', 'BMO Field',             'Toronto'          ),
  ( 84, 'R32', 'R32_M06', '2026-07-02T19:00:00Z', 'SoFi Stadium',          'Inglewood'        ),
  ( 81, 'R32', 'R32_M07', '2026-07-02T00:00:00Z', 'Levi''s Stadium',       'Santa Clara'      ),
  ( 82, 'R32', 'R32_M08', '2026-07-01T20:00:00Z', 'Lumen Field',           'Seattle'          ),
  -- Right pathway (feeds into Right side of bracket → SF_M02)
  ( 76, 'R32', 'R32_M09', '2026-06-29T17:00:00Z', 'NRG Stadium',           'Houston'          ),
  ( 78, 'R32', 'R32_M10', '2026-06-30T17:00:00Z', 'AT&T Stadium',          'Arlington'        ),
  ( 79, 'R32', 'R32_M11', '2026-07-01T01:00:00Z', 'Estadio Azteca',        'Mexico City'      ),
  ( 80, 'R32', 'R32_M12', '2026-07-01T16:00:00Z', 'Mercedes-Benz Stadium', 'Atlanta'          ),
  ( 86, 'R32', 'R32_M13', '2026-07-03T22:00:00Z', 'Hard Rock Stadium',     'Miami Gardens'    ),
  ( 88, 'R32', 'R32_M14', '2026-07-03T18:00:00Z', 'AT&T Stadium',          'Arlington'        ),
  ( 85, 'R32', 'R32_M15', '2026-07-03T03:00:00Z', 'BC Place',              'Vancouver'        ),
  ( 87, 'R32', 'R32_M16', '2026-07-04T01:30:00Z', 'Arrowhead Stadium',     'Kansas City'      ),

  -- ── Round of 16 ──────────────────────────────────────────────────────────
  -- Left side (QF_M01 / QF_M02 → SF_M01)
  ( 89, 'R16', 'R16_M01', '2026-07-04T21:00:00Z', 'Lincoln Financial Field','Philadelphia'    ),
  ( 90, 'R16', 'R16_M02', '2026-07-04T17:00:00Z', 'NRG Stadium',            'Houston'         ),
  ( 93, 'R16', 'R16_M03', '2026-07-06T19:00:00Z', 'AT&T Stadium',           'Arlington'       ),
  ( 94, 'R16', 'R16_M04', '2026-07-07T00:00:00Z', 'Lumen Field',            'Seattle'         ),
  -- Right side (QF_M03 / QF_M04 → SF_M02)
  ( 91, 'R16', 'R16_M05', '2026-07-05T20:00:00Z', 'MetLife Stadium',        'East Rutherford' ),
  ( 92, 'R16', 'R16_M06', '2026-07-06T00:00:00Z', 'Estadio Azteca',         'Mexico City'     ),
  ( 95, 'R16', 'R16_M07', '2026-07-07T16:00:00Z', 'Mercedes-Benz Stadium',  'Atlanta'         ),
  ( 96, 'R16', 'R16_M08', '2026-07-07T20:00:00Z', 'BC Place',               'Vancouver'       ),

  -- ── Quarterfinals ────────────────────────────────────────────────────────
  ( 97, 'QF', 'QF_M01', '2026-07-09T20:00:00Z', 'Gillette Stadium',       'Foxborough'        ),
  ( 98, 'QF', 'QF_M02', '2026-07-10T19:00:00Z', 'SoFi Stadium',           'Inglewood'         ),
  ( 99, 'QF', 'QF_M03', '2026-07-11T21:00:00Z', 'Hard Rock Stadium',      'Miami Gardens'     ),
  (100, 'QF', 'QF_M04', '2026-07-12T01:00:00Z', 'Arrowhead Stadium',      'Kansas City'       ),

  -- ── Semifinals ───────────────────────────────────────────────────────────
  (101, 'SF', 'SF_M01', '2026-07-14T19:00:00Z', 'AT&T Stadium',           'Arlington'         ),
  (102, 'SF', 'SF_M02', '2026-07-15T19:00:00Z', 'Mercedes-Benz Stadium',  'Atlanta'           ),

  -- ── Third Place ───────────────────────────────────────────────────────────
  (103, 'THIRD', 'THIRD_M01', '2026-07-18T21:00:00Z', 'Hard Rock Stadium', 'Miami Gardens'    ),

  -- ── Final ────────────────────────────────────────────────────────────────
  (104, 'FINAL', 'FINAL_M01', '2026-07-19T19:00:00Z', 'MetLife Stadium',   'East Rutherford'  )

ON CONFLICT (match_code) DO UPDATE SET
  match_number = EXCLUDED.match_number,
  kickoff_at   = EXCLUDED.kickoff_at,
  venue        = EXCLUDED.venue,
  city         = EXCLUDED.city;
  -- Intentionally NOT updating: round, home_team_id, away_team_id,
  -- home_score, away_score, winner_team_id, is_locked

COMMIT;
