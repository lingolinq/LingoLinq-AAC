#!/usr/bin/env bash
#
# phase5-delta-check.sh - LingoLinq Render -> GCP Cloud Run migration, Phase 5 (cutover).
#
# The PRE-DNS delta check (PHASE5-CUTOVER-RUNBOOK.md step 7). Immediately before the DNS flip,
# compare MAX(id) and MAX(updated_at) on the high-traffic tables between the LIVE Render prod
# database and the freshly-restored Cloud SQL database. The step-0a/3 reconciliation only compares
# dump-to-restore, so it CANNOT see writes that reached Render after the fresh dump. This script is
# the only thing that catches a writer that slipped past the freeze.
#
#   ANY non-zero delta is a ROLLBACK TRIGGER: it means an external writer or an offline replay
#   wrote to Render after the dump (or something wrote to Cloud SQL early). Go fix the freeze; do
#   NOT flip DNS. The script exits non-zero on drift so it gates an automated cutover step.
#
# It is STRICTLY READ-ONLY: every query runs inside `BEGIN READ ONLY` with
# `default_transaction_read_only = on`, so it physically cannot write to either database. Safe to
# run against live prod (this is the one place the runbook has you touch live Render during the
# window, and it only SELECTs MAX/COUNT).
#
# ---------------------------------------------------------------------------------------------
# MODES
#
#   Forward (default) - the pre-DNS gate:
#     RENDER_DATABASE_URL=...  CLOUDSQL_DATABASE_URL=...  ./scripts/gcp/phase5-delta-check.sh
#       Compares Render vs Cloud SQL per table. Exit 0 = match (safe to proceed to DNS).
#       Exit non-zero = DRIFT (rollback trigger). Add --counts to also compare COUNT(*) (slower).
#
#   Reverse - the rollback reconciliation report (runbook Rollback step 3):
#     CLOUDSQL_DATABASE_URL=...  ./scripts/gcp/phase5-delta-check.sh --since '2026-07-12 06:00:00 UTC'
#       After a rollback, enumerate Cloud SQL rows newer than the DNS-flip timestamp - the
#       cutover-window writes that exist ONLY on GCP and must be replayed/merged back into Render
#       or accepted as lost. Report-only (exit 0) unless --fail-on-rows is given.
#
# ---------------------------------------------------------------------------------------------
# CONNECTIONS  (point each at a TCP DSN; never echoed - the password lives only inside the DSN)
#
#   CLOUDSQL_DATABASE_URL - reach Cloud SQL through the cloud-sql-proxy (the /cloudsql unix socket
#                           only exists inside Cloud Run, not on an operator laptop), e.g.:
#       cloud-sql-proxy --port 5432 lingolinq-prod:us-central1:lingolinq-prod-pg &
#       CLOUDSQL_DATABASE_URL='postgres://lingolinq_app:PASSWORD@127.0.0.1:5432/lingolinq_production'
#   RENDER_DATABASE_URL   - the live Render prod Postgres connection string (forward mode only).
#                           A read-only Render DB user is preferred but not required (this script
#                           is read-only regardless).
#
# ---------------------------------------------------------------------------------------------
# KNOBS (env)
#   TABLES             - space-separated table list. Default: "log_sessions boards board_contents"
#                        (the three the runbook names; offline replay + external writers hit these).
#   STATEMENT_TIMEOUT  - per-statement timeout. Default '60s'. MAX(id) is instant (PK); MAX(updated_at)
#                        may seq-scan a large table - raise this if it times out, do not skip it.
#   PROJECT_ID         - default 'lingolinq-prod' (only used to print the Cloud SQL connection name).
#   SQL_INSTANCE       - default 'lingolinq-prod-pg'.
#
# DRY-RUN locally (no prod): point both DSNs at local DBs via the unix socket, e.g.
#   RENDER_DATABASE_URL='postgresql:///lingolinq-development?host=/var/run/postgresql' \
#   CLOUDSQL_DATABASE_URL='postgresql:///lingolinq-development?host=/var/run/postgresql' \
#     ./scripts/gcp/phase5-delta-check.sh           # same DB both sides => zero delta => exit 0
# Point the two at DIFFERENT local DBs to exercise the drift/exit-non-zero path.
set -euo pipefail

TABLES="${TABLES:-log_sessions boards board_contents}"
STATEMENT_TIMEOUT="${STATEMENT_TIMEOUT:-60s}"
PROJECT_ID="${PROJECT_ID:-lingolinq-prod}"
SQL_INSTANCE="${SQL_INSTANCE:-lingolinq-prod-pg}"

WITH_COUNTS=0
SINCE=""
FAIL_ON_ROWS=0

usage() {
  sed -n '2,60p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --counts)       WITH_COUNTS=1; shift ;;
    --since)        SINCE="${2:?--since needs a timestamp}"; shift 2 ;;
    --fail-on-rows) FAIL_ON_ROWS=1; shift ;;
    -h|--help)      usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage 1 ;;
  esac
done

# Colors only when stdout is a TTY.
if [ -t 1 ]; then C_HEAD='\033[1;34m'; C_OK='\033[0;32m'; C_BAD='\033[1;31m'; C_OFF='\033[0m'
else C_HEAD=''; C_OK=''; C_BAD=''; C_OFF=''; fi
log()  { printf "\n${C_HEAD}==>${C_OFF} %s\n" "$*"; }
ok()   { printf "${C_OK}%s${C_OFF}"  "$*"; }
bad()  { printf "${C_BAD}%s${C_OFF}" "$*"; }

command -v psql >/dev/null 2>&1 || { echo "ERROR: psql not found." >&2; exit 1; }

# A NULL marker that compares cleanly when a table is empty on BOTH sides (both -> same marker).
NULLMARK='(none)'

# Print a DSN's resolved db/host/user (NEVER the password) as a sanity check before querying.
safe_conn() {
  PGCONNECT_TIMEOUT=8 psql "$1" -tAc \
    "select 'db='||current_database()||' host='||coalesce(host(inet_server_addr()),'local')||' user='||current_user;" 2>&1 || true
}

# Build the read-only probe SQL for forward mode. One round-trip: a UNION ALL over the table list,
# wrapped in a read-only transaction with a statement timeout. Emits pipe-separated tuples:
#   tbl|max_id|max_updated_at|count_or_dash
build_forward_sql() {
  printf "SET statement_timeout = '%s';\n" "$STATEMENT_TIMEOUT"
  printf "SET default_transaction_read_only = on;\nBEGIN READ ONLY;\n"
  local first=1 t cnt
  for t in $TABLES; do
    [ $first -eq 1 ] || printf "UNION ALL\n"; first=0
    if [ "$WITH_COUNTS" = 1 ]; then cnt="COUNT(*)::text"; else cnt="'-'"; fi
    printf "SELECT '%s' AS tbl, COALESCE(MAX(id)::text,'%s') AS max_id, COALESCE(MAX(updated_at)::text,'%s') AS max_upd, %s AS n FROM \"%s\"\n" \
      "$t" "$NULLMARK" "$NULLMARK" "$cnt" "$t"
  done
  printf "ORDER BY tbl;\nCOMMIT;\n"
}

# Build the read-only reverse SQL: per table, rows on Cloud SQL with updated_at > SINCE.
build_reverse_sql() {
  printf "SET statement_timeout = '%s';\n" "$STATEMENT_TIMEOUT"
  printf "SET default_transaction_read_only = on;\nBEGIN READ ONLY;\n"
  local first=1 t
  for t in $TABLES; do
    [ $first -eq 1 ] || printf "UNION ALL\n"; first=0
    printf "SELECT '%s' AS tbl, COUNT(*)::text AS n, COALESCE(MAX(id)::text,'%s') AS max_id, COALESCE(MAX(updated_at)::text,'%s') AS max_upd FROM \"%s\" WHERE updated_at > %s\n" \
      "$t" "$NULLMARK" "$NULLMARK" "$t" "$(printf "'%s'" "${SINCE//\'/\'\'}")"
  done
  printf "ORDER BY tbl;\nCOMMIT;\n"
}

# Run a probe SQL against a DSN, returning only the data tuples (tuples-only, pipe-separated).
probe() { build="$1"; dsn="$2"; "$build" | psql "$dsn" -v ON_ERROR_STOP=1 -qtA -F '|'; }

# ---------------------------------------------------------------------------------------------

[ -n "${CLOUDSQL_DATABASE_URL:-}" ] || { echo "ERROR: CLOUDSQL_DATABASE_URL is required." >&2; exit 1; }

if [ -n "$SINCE" ]; then
  # ---- REVERSE / rollback-reconciliation report ----
  log "Phase 5 reverse delta check (rollback reconciliation)"
  echo "    Cloud SQL : $(safe_conn "$CLOUDSQL_DATABASE_URL")"
  echo "    Tables    : $TABLES"
  echo "    Since     : $SINCE  (rows NEWER than this exist only on Cloud SQL)"

  total=0; rows="$(probe build_reverse_sql "$CLOUDSQL_DATABASE_URL")"
  log "Cloud SQL rows written after the DNS-flip timestamp (replay-or-accept-loss candidates)"
  printf "    %-22s %10s  %-12s  %s\n" "TABLE" "ROWS" "MAX_ID" "MAX_UPDATED_AT"
  while IFS='|' read -r tbl n max_id max_upd; do
    [ -z "$tbl" ] && continue
    printf "    %-22s %10s  %-12s  %s\n" "$tbl" "$n" "$max_id" "$max_upd"
    total=$(( total + n ))
  done <<< "$rows"

  echo
  if [ "$total" -gt 0 ]; then
    printf "    %s %s row(s) on Cloud SQL are newer than the flip timestamp; replay/merge into Render or accept as lost.\n" "$(bad '!!')" "$total"
    [ "$FAIL_ON_ROWS" = 1 ] && exit 2
  else
    printf "    %s No Cloud SQL rows newer than the flip timestamp; nothing to reconcile.\n" "$(ok 'OK')"
  fi
  exit 0
fi

# ---- FORWARD / pre-DNS gate ----
[ -n "${RENDER_DATABASE_URL:-}" ] || { echo "ERROR: RENDER_DATABASE_URL is required for the forward (pre-DNS) check." >&2; exit 1; }

log "Phase 5 pre-DNS delta check (Render vs Cloud SQL)"
echo "    Render    : $(safe_conn "$RENDER_DATABASE_URL")"
echo "    Cloud SQL : $(safe_conn "$CLOUDSQL_DATABASE_URL")"
echo "    Tables    : $TABLES"
echo "    Counts    : $([ "$WITH_COUNTS" = 1 ] && echo 'comparing COUNT(*) too' || echo 'MAX(id) + MAX(updated_at) only (add --counts for COUNT(*))')"

ren="$(probe build_forward_sql "$RENDER_DATABASE_URL")"
cs="$(probe build_forward_sql "$CLOUDSQL_DATABASE_URL")"

# Index both result sets by table name.
declare -A R_ID R_UP R_N C_ID C_UP C_N
while IFS='|' read -r tbl id up n; do [ -z "$tbl" ] && continue; R_ID["$tbl"]="$id"; R_UP["$tbl"]="$up"; R_N["$tbl"]="$n"; done <<< "$ren"
while IFS='|' read -r tbl id up n; do [ -z "$tbl" ] && continue; C_ID["$tbl"]="$id"; C_UP["$tbl"]="$up"; C_N["$tbl"]="$n"; done <<< "$cs"

log "Per-table comparison"
drift=0
for t in $TABLES; do
  t_drift=0
  [ "${R_ID[$t]:-MISSING}" = "${C_ID[$t]:-MISSING}" ] || t_drift=1
  [ "${R_UP[$t]:-MISSING}" = "${C_UP[$t]:-MISSING}" ] || t_drift=1
  if [ "$WITH_COUNTS" = 1 ]; then [ "${R_N[$t]:-MISSING}" = "${C_N[$t]:-MISSING}" ] || t_drift=1; fi

  if [ "$t_drift" = 0 ]; then status="$(ok '[OK]')"; else status="$(bad '[DRIFT]')"; drift=1; fi
  printf "\n  %s  %s\n" "$t" "$status"
  printf "      max_id          render=%-14s cloudsql=%-14s\n" "${R_ID[$t]:-MISSING}" "${C_ID[$t]:-MISSING}"
  printf "      max_updated_at  render=%-26s cloudsql=%-26s\n" "${R_UP[$t]:-MISSING}" "${C_UP[$t]:-MISSING}"
  [ "$WITH_COUNTS" = 1 ] && printf "      count           render=%-14s cloudsql=%-14s\n" "${R_N[$t]:-MISSING}" "${C_N[$t]:-MISSING}"
done

echo
if [ "$drift" = 0 ]; then
  printf "%s All %s table(s) match. No post-dump drift detected; safe to proceed to the DNS flip.\n" "$(ok '==> OK:')" "$(echo $TABLES | wc -w)"
  exit 0
else
  printf "%s Drift detected. A writer reached Render after the dump (or Cloud SQL was written early).\n" "$(bad '==> ROLLBACK TRIGGER:')"
  printf "    Do NOT flip DNS. Fix the freeze (find the writer), re-dump/re-restore, and re-run this check.\n"
  exit 1
fi
