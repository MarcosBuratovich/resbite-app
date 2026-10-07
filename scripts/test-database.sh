#!/bin/bash
# No hosted URL accepted: this always creates and destroys its own local cluster.
# Default: every local migration, every SQL test and the concurrency scripts.
# --hosted-baseline [CANDIDATE.sql ...]: only the migrations in
#   supabase/tests/hosted-baseline/migrations.txt (what the hosted project runs), then each
#   candidate with its optional <name>.before.sql / <name>.after.sql checks, then the tests in
#   supabase/tests/hosted-baseline/tests.txt. Run it before applying a migration to hosted.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
pg_bin="${RESBITE_PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
mode=full
candidates=()
if [ "${1:-}" = "--hosted-baseline" ]; then
  mode=hosted
  shift
  candidates=("$@")
fi
work="$(mktemp -d /private/tmp/resbite-pg.XXXXXX)"
cleanup() { "$pg_bin/pg_ctl" -D "$work/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT
"$pg_bin/initdb" -D "$work/data" -A trust -U postgres >/dev/null
"$pg_bin/pg_ctl" -D "$work/data" -l "$work/postgres.log" -o "-k $work -h '' -p 55437" -w start >/dev/null
psql_args=(-X -v ON_ERROR_STOP=1 -h "$work" -p 55437 -U postgres -d postgres)
run_sql() { "$pg_bin/psql" "${psql_args[@]}" -f "$1" >>"$work/tests.log"; }
run_sql "$repo/supabase/tests/local/bootstrap.sql"
if [ "$mode" = full ]; then
  for sql in "$repo"/supabase/migrations/*.sql; do run_sql "$sql"; done
  for sql in "$repo"/supabase/tests/*.sql; do
    run_sql "$sql"
    echo "PASS: $(basename "$sql")"
  done
  "$repo/supabase/tests/local/concurrency.sh" "$pg_bin" "$work" 55437
  "$repo/supabase/tests/local/registration-details-concurrency.sh" "$pg_bin" "$work" 55437
  "$repo/supabase/tests/local/photo-cleanup-concurrency.sh" "$pg_bin" "$work" 55437
  "$repo/supabase/tests/local/avatar-revision-concurrency.sh" "$pg_bin" "$work" 55437
else
  baseline="$repo/supabase/tests/hosted-baseline"
  while read -r name _; do
    case "$name" in '' | '#'*) continue ;; esac
    run_sql "$repo/supabase/migrations/$name"
  done <"$baseline/migrations.txt"
  for candidate in ${candidates[@]+"${candidates[@]}"}; do
    name="$(basename "$candidate" .sql)"
    if [ -f "$baseline/$name.before.sql" ]; then run_sql "$baseline/$name.before.sql"; fi
    run_sql "$repo/supabase/migrations/$name.sql"
    if [ -f "$baseline/$name.after.sql" ]; then run_sql "$baseline/$name.after.sql"; fi
    echo "PASS: $name applies on the hosted baseline"
  done
  while read -r name _; do
    case "$name" in '' | '#'*) continue ;; esac
    run_sql "$repo/supabase/tests/$name"
    echo "PASS: $name (hosted baseline)"
  done <"$baseline/tests.txt"
fi
"$pg_bin/psql" "${psql_args[@]}" -Atc 'select count(*) from private.tester_roster' | while read -r count; do
  test "$count" = 0 || { echo 'Synthetic roster data leaked'; exit 1; }
done
echo "PASS: disposable SQL assertions ($mode); synthetic roster empty. Auth/Storage HTTP integration is separate."
