#!/usr/bin/env bash
# Every role permission back to the defaults (docs/supabase-permissions.sql), and the rig's accounts approved again. The
# runner does this before the permission suites; permissions-browser does it itself first (2026-11-09: in a shuffled
# run temporary-access-check ran before it, and the screen did not open on the defaults). The rig's database only.
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)" || exit 2
docker exec supabase_db_rig psql -U postgres -q -c "alter table permission_changes disable trigger permission_changes_append_only; delete from permission_grants; alter table permission_changes enable trigger permission_changes_append_only;" || { echo "permissions-reset: the rig database did not answer"; exit 2; }
docker exec -i supabase_db_rig psql -U postgres -q < docs/supabase-permissions.sql > /dev/null || { echo "permissions-reset: docs/supabase-permissions.sql did not apply"; exit 2; }
bash rig/approve-rig-accounts.sh
