-- Allow the Stage-4 r32_projection source type in the points ledger.
--
-- ROOT CAUSE of "all points lost": pickem_points_ledger.source_type had a CHECK
-- constraint allowing only ('group_position','match_outcome','match_score').
-- Once R32 was confirmed, recomputePickemPoints emitted 'r32_projection' rows;
-- replacePointsLedger deleted the ledger and then the INSERT was rejected by this
-- constraint, leaving the ledger empty (predictions were untouched). Widening the
-- constraint lets recompute repopulate group + match + r32_projection points.

ALTER TABLE pickem_points_ledger
  DROP CONSTRAINT IF EXISTS pickem_points_ledger_source_type_check;

ALTER TABLE pickem_points_ledger
  ADD CONSTRAINT pickem_points_ledger_source_type_check
  CHECK (source_type IN ('group_position', 'match_outcome', 'match_score', 'r32_projection'));
