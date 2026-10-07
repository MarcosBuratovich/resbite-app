#!/bin/bash
# No hosted URL accepted: this always creates and destroys its own local cluster.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
pg_bin="${RESBITE_PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
work="$(mktemp -d /private/tmp/resbite-pg.XXXXXX)"
cleanup() { "$pg_bin/pg_ctl" -D "$work/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT
"$pg_bin/initdb" -D "$work/data" -A trust -U postgres >/dev/null
"$pg_bin/pg_ctl" -D "$work/data" -l "$work/postgres.log" -o "-k $work -h '' -p 55437" -w start >/dev/null
psql_args=(-X -v ON_ERROR_STOP=1 -h "$work" -p 55437 -U postgres -d postgres)
"$pg_bin/psql" "${psql_args[@]}" -f "$repo/supabase/tests/local/bootstrap.sql" >"$work/tests.log"
for sql in "$repo"/supabase/migrations/*.sql; do
  "$pg_bin/psql" "${psql_args[@]}" -f "$sql" >>"$work/tests.log"
done
for sql in "$repo"/supabase/tests/*.sql; do
  "$pg_bin/psql" "${psql_args[@]}" -f "$sql" >>"$work/tests.log"
  echo "PASS: $(basename "$sql")"
done
"$repo/supabase/tests/local/concurrency.sh" "$pg_bin" "$work" 55437
"$repo/supabase/tests/local/registration-details-concurrency.sh" "$pg_bin" "$work" 55437
"$repo/supabase/tests/local/photo-cleanup-concurrency.sh" "$pg_bin" "$work" 55437
"$repo/supabase/tests/local/avatar-revision-concurrency.sh" "$pg_bin" "$work" 55437
"$pg_bin/psql" "${psql_args[@]}" -Atc 'select count(*) from private.tester_roster' | while read -r count; do
  test "$count" = 0 || { echo 'Synthetic roster data leaked'; exit 1; }
done
echo 'PASS: disposable SQL assertions; synthetic roster empty. Auth/Storage HTTP integration is separate.'
