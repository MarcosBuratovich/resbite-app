#!/usr/bin/env bash
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec docker run --rm -u postgres -e RESBITE_PG_BIN=/usr/lib/postgresql/17/bin \
  -v "$repo:/repo:ro" -w /tmp postgres:17 bash /repo/scripts/test-database.sh "$@"
