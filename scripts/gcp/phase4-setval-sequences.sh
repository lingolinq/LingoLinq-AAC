#!/usr/bin/env bash
#
# phase4-setval-sequences.sh - LingoLinq Render -> GCP Cloud Run migration, Phase 4 (cutover).
#
# Runs the sequence reset + verification against Cloud SQL immediately AFTER the Render dump has
# been restored, and BEFORE any traffic reaches the new database. Because global_id encodes the
# raw primary key, a sequence left behind its table's MAX(id) means the next INSERT collides.
#
#   Step 1: phase4-setval-sequences.sql  - advance every column-owned sequence (idempotent).
#   Step 2: phase4-verify-sequences.sql  - fail non-zero if any sequence is still behind, or an
#                                          identity-PK has drifted past the SERIAL-only reset.
#
# The .sql files are the single source of truth (the same files `rake db:setval_all_sequences`
# runs). This wrapper only resolves the connection, prints WHERE it is about to run (operators
# run this months later), and executes the two files with ON_ERROR_STOP so a failure halts.
#
# CONNECTION: point DATABASE_URL at a TCP DSN that reaches Cloud SQL through the cloud-sql-proxy
# (the /cloudsql unix socket only exists inside Cloud Run, not on an operator laptop), e.g.:
#
#   cloud-sql-proxy --port 5432 lingolinq-prod:us-central1:lingolinq-prod-pg &
#   DATABASE_URL='postgres://lingolinq_app:PASSWORD@127.0.0.1:5432/lingolinq_production' \
#     ./scripts/gcp/phase4-setval-sequences.sh
#
# If DATABASE_URL is unset, psql falls back to the standard libpq PG* env vars (PGHOST/PGDATABASE/
# PGUSER/...). Either way the script prints the resolved db/host/user before touching anything.
# No secret is ever echoed (the password lives only inside DATABASE_URL, which is not printed).
#
# Safe to re-run: setval is idempotent and verify is read-only.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-lingolinq-prod}"
SQL_INSTANCE="${SQL_INSTANCE:-lingolinq-prod-pg}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETVAL_SQL="$SCRIPT_DIR/phase4-setval-sequences.sql"
VERIFY_SQL="$SCRIPT_DIR/phase4-verify-sequences.sql"

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }

command -v psql >/dev/null 2>&1 || { echo "ERROR: psql not found." >&2; exit 1; }
[ -f "$SETVAL_SQL" ] || { echo "ERROR: $SETVAL_SQL not found." >&2; exit 1; }
[ -f "$VERIFY_SQL" ] || { echo "ERROR: $VERIFY_SQL not found." >&2; exit 1; }

# Build the psql connection argument. An empty array => psql uses the libpq PG* env defaults.
PSQL_TARGET=()
[ -n "${DATABASE_URL:-}" ] && PSQL_TARGET=("$DATABASE_URL")

# Print exactly where this will run BEFORE mutating anything, so the operator can confirm the
# target. Resolve the Cloud SQL connection name for cross-checking against the proxy invocation.
log "Phase 4 setval target"
echo "    GCP project : $PROJECT_ID"
if command -v gcloud >/dev/null 2>&1; then
  CONN="$(gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT_ID" --format='value(connectionName)' 2>/dev/null || true)"
  if [ -n "$CONN" ]; then
    echo "    Cloud SQL   : $SQL_INSTANCE ($CONN)"
  else
    echo "    Cloud SQL   : $SQL_INSTANCE (connection name unresolved; relying on DATABASE_URL)"
  fi
fi
# Show psql's resolved db/host/user (never the password) as a final sanity check.
SAFE_CONN="$(PGCONNECT_TIMEOUT=5 psql "${PSQL_TARGET[@]}" -tAc \
  "select 'db='||current_database()||' host='||coalesce(host(inet_server_addr()),'local')||' user='||current_user;" 2>&1 || true)"
echo "    psql target : ${SAFE_CONN:-<could not connect>}"

log "Step 1: advance all column-owned sequences (idempotent)"
psql "${PSQL_TARGET[@]}" -v ON_ERROR_STOP=1 -f "$SETVAL_SQL"

log "Step 2: verify (exits non-zero if any sequence is behind or an identity PK drifted)"
psql "${PSQL_TARGET[@]}" -v ON_ERROR_STOP=1 -f "$VERIFY_SQL"

log "Phase 4 setval + verify complete."
