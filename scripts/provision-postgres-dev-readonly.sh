#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${LINGOLINQ_DEV_DB_NAME:-lingolinq-development}"
READONLY_ROLE="${LINGOLINQ_MCP_READONLY_ROLE:-lingolinq_mcp_readonly}"
ADMIN_DSN="${LINGOLINQ_DEV_ADMIN_DATABASE_URL:-postgresql:///${DB_NAME}?host=/var/run/postgresql}"
READONLY_PASSWORD="${LINGOLINQ_MCP_READONLY_PASSWORD:-}"
READONLY_DSN="${LINGOLINQ_MCP_READONLY_DATABASE_URL:-postgresql://${READONLY_ROLE}@/${DB_NAME}?host=/var/run/postgresql}"

require_psql() {
  if ! command -v psql >/dev/null 2>&1; then
    echo "ERROR: psql is required." >&2
    exit 1
  fi
}

apply_grants() {
  psql "$ADMIN_DSN" \
    -v ON_ERROR_STOP=1 \
    -v db_name="$DB_NAME" \
    -v readonly_role="$READONLY_ROLE" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN NOINHERIT', :'readonly_role')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'readonly_role') \gexec

SELECT format('ALTER ROLE %I WITH LOGIN NOINHERIT', :'readonly_role') \gexec
SELECT format('ALTER ROLE %I SET default_transaction_read_only = on', :'readonly_role') \gexec
SELECT format('ALTER ROLE %I SET statement_timeout = %L', :'readonly_role', '30s') \gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'db_name', :'readonly_role') \gexec
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SELECT format('REVOKE ALL ON SCHEMA public FROM %I', :'readonly_role') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'readonly_role') \gexec

SELECT format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM %I', :'readonly_role') \gexec
SELECT format('REVOKE USAGE, UPDATE ON ALL SEQUENCES IN SCHEMA public FROM %I', :'readonly_role') \gexec
SELECT format('REVOKE CREATE ON DATABASE %I FROM %I', :'db_name', :'readonly_role') \gexec

SELECT format('GRANT SELECT ON ALL TABLES IN SCHEMA public TO %I', :'readonly_role') \gexec
SELECT format('GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', :'readonly_role') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO %I', :'readonly_role') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO %I', :'readonly_role') \gexec
SQL

  if [ -n "$READONLY_PASSWORD" ]; then
    psql "$ADMIN_DSN" \
      -v ON_ERROR_STOP=1 \
      -v readonly_role="$READONLY_ROLE" \
      -v readonly_password="$READONLY_PASSWORD" <<'SQL'
ALTER ROLE :"readonly_role" WITH PASSWORD :'readonly_password';
SQL
  fi
}

expect_success() {
  local sql="$1"
  psql "$READONLY_DSN" -v ON_ERROR_STOP=1 -tAc "$sql" >/dev/null
}

expect_current_user() {
  local current_user
  current_user="$(psql "$READONLY_DSN" -v ON_ERROR_STOP=1 -tAc "SELECT current_user")"
  if [ "$current_user" != "$READONLY_ROLE" ]; then
    echo "ERROR: readonly DSN authenticated as ${current_user}, expected ${READONLY_ROLE}." >&2
    exit 1
  fi
}

expect_failure() {
  local label="$1"
  local sql="$2"

  if psql "$READONLY_DSN" -v ON_ERROR_STOP=1 -tAc "$sql" >/dev/null 2>&1; then
    echo "ERROR: readonly role unexpectedly allowed ${label}." >&2
    exit 1
  fi

  echo "Verified ${label} is rejected by Postgres grants."
}

verify_role() {
  expect_current_user
  expect_success "SELECT 1"
  expect_failure "DDL" "CREATE TABLE mcp_readonly_probe(id integer); DROP TABLE mcp_readonly_probe"

  local writable_table
  writable_table="$(psql "$ADMIN_DSN" -v ON_ERROR_STOP=1 -tAc \
    "SELECT quote_ident(tablename) FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE 'schema_%' ORDER BY tablename LIMIT 1")"

  if [ -n "$writable_table" ]; then
    expect_failure "DML" "DELETE FROM public.${writable_table} WHERE false"
  else
    echo "Skipped DML rejection probe because no public tables exist yet."
  fi

  local sequence_name
  sequence_name="$(psql "$ADMIN_DSN" -v ON_ERROR_STOP=1 -tAc \
    "SELECT quote_ident(n.nspname) || '.' || quote_ident(c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = 'S' AND n.nspname = 'public' ORDER BY c.relname LIMIT 1")"

  if [ -n "$sequence_name" ]; then
    expect_failure "sequence writes" "SELECT nextval('${sequence_name}'::regclass)"
  else
    echo "Skipped sequence write rejection probe because no public sequences exist yet."
  fi
}

require_psql
apply_grants
verify_role

cat <<EOF
postgres-dev readonly role is ready.

Set this in your private shell env before approving postgres-dev:

  export LINGOLINQ_MCP_READONLY_DATABASE_URL='${READONLY_DSN}'

If your local Postgres requires password auth, set LINGOLINQ_MCP_READONLY_PASSWORD
before running this script and put the matching password-bearing DSN only in your
private .env or shell profile. Never commit it.
EOF
