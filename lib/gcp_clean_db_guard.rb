# frozen_string_literal: true

# Guard for the clean-DB GCP cutover (Render -> Cloud Run).
#
# `db:schema:load` loads db/schema.rb with `force: :cascade`, which DROPS every table. That is
# correct against a fresh empty Cloud SQL DB and catastrophic against a populated one (e.g. the
# still-authoritative Render prod DB, if DATABASE_URL is mis-pointed). The committed migrate Job
# (.github/workflows/deploy-cloudrun.yml) deliberately runs db:migrate ONLY and forbids schema-load
# for exactly this reason; the clean-DB path re-introduces schema-load, so it MUST be guarded.
#
# This module is the guard. `rake gcp:guarded_schema_load` calls it IN THE SAME PROCESS as the
# schema load, so the proof binds to the exact DATABASE_URL the destructive command uses (a separate
# earlier check does not bind: the secret could rotate, or the job could re-run). See
# scripts/gcp/PHASE5-CLEAN-DB-REHEARSAL.md step 3a.
module GcpCleanDbGuard
  # Rails-owned tables that do not count as application data.
  BOOKKEEPING_TABLES = %w[schema_migrations ar_internal_metadata].freeze

  # Raised when the connected DB is NOT a safe clean-DB target.
  class UnsafeTarget < StandardError; end

  module_function

  # Raises UnsafeTarget unless the current connection is BOTH:
  #   1. the expected Cloud SQL host (its host/socket contains ENV['EXPECTED_CLOUDSQL_HOST']), and
  #   2. empty of application tables.
  # Returns the connected host string on success. Fail-closed: a blank EXPECTED_CLOUDSQL_HOST is an
  # error, not a skip, so the load can never run without the operator naming the intended target.
  def assert_clean_target!(connection: ActiveRecord::Base.connection,
                           db_config: ActiveRecord::Base.connection_db_config,
                           expected_host: ENV['EXPECTED_CLOUDSQL_HOST'])
    expected = expected_host.to_s.strip
    if expected.empty?
      raise UnsafeTarget,
            'EXPECTED_CLOUDSQL_HOST must be set to the host/socket the clean-DB target resolves to ' \
            '(fail-closed: refusing to load schema without a named target).'
    end

    cfg  = db_config.configuration_hash
    host = (cfg[:host] || cfg[:socket] || 'UNKNOWN').to_s
    unless host.include?(expected)
      raise UnsafeTarget,
            "WRONG DB: connected to #{host}, expected it to contain #{expected}. " \
            'Refusing to load schema (DATABASE_URL may be mis-pointed).'
    end

    tables = connection.tables - BOOKKEEPING_TABLES
    unless tables.empty?
      raise UnsafeTarget,
            "DB NOT EMPTY: #{tables.size} application tables present " \
            "(e.g. #{tables.first(5).join(', ')}). Refusing to drop/load - this is not a clean-DB target."
    end

    host
  end
end
