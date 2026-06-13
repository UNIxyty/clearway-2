-- Fake/test data for playoff_matches.
-- Assigns real pickem_teams (by short_name) to all 32 match slots
-- and fills in fake scores/winners up through the QF so the full
-- bracket renders end-to-end.
-- Safe to re-run: only UPDATEs, never INSERTs.

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Resolve competition id once
-- ──────────────────────────────────────────────────────────────────────────────
WITH comp AS (
  SELECT id FROM pickem_competitions WHERE slug = 'wc-2026'
),

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Build a handy short_name → id lookup for every team in that competition
-- ──────────────────────────────────────────────────────────────────────────────
t AS (
  SELECT short_name, id
  FROM pickem_teams
  WHERE competition_id = (SELECT id FROM comp)
),

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. R32 assignments  (matchup logic follows wc2026 bracket pairings)
-- ──────────────────────────────────────────────────────────────────────────────
r32 (match_code, home_sn, away_sn) AS (VALUES
  ('R32_M01', 'GER', 'KOR'),   -- 1E  vs 3ABCDF
  ('R32_M02', 'FRA', 'PAR'),   -- 1I  vs 3CDFGH
  ('R32_M03', 'RSA', 'SUI'),   -- 2A  vs 2B
  ('R32_M04', 'NED', 'MAR'),   -- 1F  vs 2C
  ('R32_M05', 'COL', 'CRO'),   -- 2K  vs 2L
  ('R32_M06', 'ESP', 'AUT'),   -- 1H  vs 2J
  ('R32_M07', 'USA', 'HAI'),   -- 1D  vs 3BEFIJ
  ('R32_M08', 'BEL', 'NOR'),   -- 1G  vs 3AEHIJ
  ('R32_M09', 'BRA', 'JPN'),   -- 1C  vs 2F
  ('R32_M10', 'CIV', 'SEN'),   -- 2E  vs 2I
  ('R32_M11', 'MEX', 'ECU'),   -- 1A  vs 3CEFHI
  ('R32_M12', 'ENG', 'NZL'),   -- 1L  vs 3EHIJK
  ('R32_M13', 'ARG', 'URU'),   -- 1J  vs 2H
  ('R32_M14', 'TUR', 'EGY'),   -- 2D  vs 2G
  ('R32_M15', 'CAN', 'IRN'),   -- 1B  vs 3EFGIJ
  ('R32_M16', 'POR', 'SCO')    -- 1K  vs 3DEJIL
),

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. R16 assignments  (winners from R32 — fake: home_sn = predicted winner)
-- ──────────────────────────────────────────────────────────────────────────────
r16 (match_code, home_sn, away_sn) AS (VALUES
  ('R16_M01', 'GER', 'FRA'),   -- W(R32_M01) vs W(R32_M02)
  ('R16_M02', 'NED', 'ESP'),   -- W(R32_M04) vs W(R32_M06)  [note: RSA lost to NED via M03 bracket path - simplified]
  ('R16_M03', 'COL', 'USA'),   -- W(R32_M05) vs W(R32_M07)
  ('R16_M04', 'BEL', 'NOR'),   -- W(R32_M08) placeholder
  ('R16_M05', 'BRA', 'CIV'),   -- W(R32_M09) vs W(R32_M10)
  ('R16_M06', 'MEX', 'ENG'),   -- W(R32_M11) vs W(R32_M12)
  ('R16_M07', 'ARG', 'TUR'),   -- W(R32_M13) vs W(R32_M14)
  ('R16_M08', 'POR', 'CAN')    -- W(R32_M16) vs W(R32_M15)
),

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. QF assignments
-- ──────────────────────────────────────────────────────────────────────────────
qf (match_code, home_sn, away_sn) AS (VALUES
  ('QF_M01', 'FRA', 'NED'),    -- W(R16_M01) vs W(R16_M02)
  ('QF_M02', 'USA', 'COL'),    -- W(R16_M03) vs W(R16_M04) simplified
  ('QF_M03', 'BRA', 'ENG'),    -- W(R16_M05) vs W(R16_M06)
  ('QF_M04', 'ARG', 'POR')     -- W(R16_M07) vs W(R16_M08)
),

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. SF, Third, Final
-- ──────────────────────────────────────────────────────────────────────────────
sf (match_code, home_sn, away_sn) AS (VALUES
  ('SF_M01',    'FRA', 'USA'),
  ('SF_M02',    'BRA', 'ARG')
),
others (match_code, home_sn, away_sn) AS (VALUES
  ('THIRD_M01', 'USA', 'BRA'),
  ('FINAL_M01', 'FRA', 'ARG')
),

-- combine all rounds
all_matches (match_code, home_sn, away_sn) AS (
  SELECT * FROM r32
  UNION ALL SELECT * FROM r16
  UNION ALL SELECT * FROM qf
  UNION ALL SELECT * FROM sf
  UNION ALL SELECT * FROM others
)

-- ──────────────────────────────────────────────────────────────────────────────
-- 7. Apply team assignments
-- ──────────────────────────────────────────────────────────────────────────────
UPDATE playoff_matches pm
SET
  home_team_id = ht.id,
  away_team_id = at.id
FROM all_matches am
JOIN t ht ON ht.short_name = am.home_sn
JOIN t at ON at.short_name = am.away_sn
WHERE pm.match_code = am.match_code;


-- ──────────────────────────────────────────────────────────────────────────────
-- 8. Fake R32 RESULTS  (so R16 slots show their bracket source)
--    Scores chosen so bracket propagation logic has something to follow.
-- ──────────────────────────────────────────────────────────────────────────────
WITH comp AS (SELECT id FROM pickem_competitions WHERE slug = 'wc-2026'),
t AS (SELECT short_name, id FROM pickem_teams WHERE competition_id = (SELECT id FROM comp))

UPDATE playoff_matches pm
SET
  home_score     = r.hs,
  away_score     = r.as_,
  winner_team_id = w.id,
  is_locked      = TRUE
FROM (VALUES
  ('R32_M01', 'GER', 2, 'KOR', 1, 'GER'),
  ('R32_M02', 'FRA', 1, 'PAR', 0, 'FRA'),
  ('R32_M03', 'RSA', 1, 'SUI', 2, 'SUI'),
  ('R32_M04', 'NED', 3, 'MAR', 0, 'NED'),
  ('R32_M05', 'COL', 2, 'CRO', 0, 'COL'),
  ('R32_M06', 'ESP', 2, 'AUT', 1, 'ESP'),
  ('R32_M07', 'USA', 3, 'HAI', 0, 'USA'),
  ('R32_M08', 'BEL', 1, 'NOR', 0, 'BEL'),
  ('R32_M09', 'BRA', 2, 'JPN', 0, 'BRA'),
  ('R32_M10', 'CIV', 1, 'SEN', 0, 'CIV'),
  ('R32_M11', 'MEX', 2, 'ECU', 1, 'MEX'),
  ('R32_M12', 'ENG', 3, 'NZL', 0, 'ENG'),
  ('R32_M13', 'ARG', 2, 'URU', 0, 'ARG'),
  ('R32_M14', 'TUR', 1, 'EGY', 0, 'TUR'),
  ('R32_M15', 'CAN', 2, 'IRN', 0, 'CAN'),
  ('R32_M16', 'POR', 2, 'SCO', 1, 'POR')
) AS r(mc, hsn, hs, asn, as_, wsn)
JOIN t ht ON ht.short_name = r.hsn
JOIN t at ON at.short_name = r.asn
JOIN t w  ON w.short_name  = r.wsn
WHERE pm.match_code = r.mc;


-- ──────────────────────────────────────────────────────────────────────────────
-- 9. Fake R16 RESULTS
-- ──────────────────────────────────────────────────────────────────────────────
WITH comp AS (SELECT id FROM pickem_competitions WHERE slug = 'wc-2026'),
t AS (SELECT short_name, id FROM pickem_teams WHERE competition_id = (SELECT id FROM comp))

UPDATE playoff_matches pm
SET
  home_score     = r.hs,
  away_score     = r.as_,
  winner_team_id = w.id,
  is_locked      = TRUE
FROM (VALUES
  ('R16_M01', 'GER', 0, 'FRA', 1, 'FRA'),
  ('R16_M02', 'NED', 2, 'ESP', 3, 'ESP'),
  ('R16_M03', 'COL', 1, 'USA', 2, 'USA'),
  ('R16_M04', 'BEL', 1, 'NOR', 0, 'BEL'),
  ('R16_M05', 'BRA', 3, 'CIV', 1, 'BRA'),
  ('R16_M06', 'MEX', 0, 'ENG', 2, 'ENG'),
  ('R16_M07', 'ARG', 2, 'TUR', 1, 'ARG'),
  ('R16_M08', 'POR', 3, 'CAN', 0, 'POR')
) AS r(mc, hsn, hs, asn, as_, wsn)
JOIN t ht ON ht.short_name = r.hsn
JOIN t at ON at.short_name = r.asn
JOIN t w  ON w.short_name  = r.wsn
WHERE pm.match_code = r.mc;


-- ──────────────────────────────────────────────────────────────────────────────
-- 10. Fake QF RESULTS
-- ──────────────────────────────────────────────────────────────────────────────
WITH comp AS (SELECT id FROM pickem_competitions WHERE slug = 'wc-2026'),
t AS (SELECT short_name, id FROM pickem_teams WHERE competition_id = (SELECT id FROM comp))

UPDATE playoff_matches pm
SET
  home_score     = r.hs,
  away_score     = r.as_,
  winner_team_id = w.id,
  is_locked      = TRUE
FROM (VALUES
  ('QF_M01', 'FRA', 2, 'NED', 0, 'FRA'),
  ('QF_M02', 'USA', 1, 'ESP', 0, 'USA'),
  ('QF_M03', 'BRA', 2, 'ENG', 1, 'BRA'),
  ('QF_M04', 'ARG', 2, 'POR', 1, 'ARG')
) AS r(mc, hsn, hs, asn, as_, wsn)
JOIN t ht ON ht.short_name = r.hsn
JOIN t at ON at.short_name = r.asn
JOIN t w  ON w.short_name  = r.wsn
WHERE pm.match_code = r.mc;

-- SF / FINAL / THIRD remain with teams assigned but no scores,
-- so you can test the "enter result" flow on those.

COMMIT;
