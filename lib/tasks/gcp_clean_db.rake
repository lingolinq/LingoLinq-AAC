# Phase 5 (Render -> GCP Cloud Run, clean-DB cutover) guarded schema load.
#
# `gcp:guarded_schema_load` runs the GcpCleanDbGuard check and THEN db:schema:load, in one process,
# so the empty/host proof binds to the exact DATABASE_URL the destructive load uses. Used only on the
# clean-DB cutover path (prod has no real data); see scripts/gcp/PHASE5-CLEAN-DB-REHEARSAL.md step 3a.
# Single source of truth for the guard logic is lib/gcp_clean_db_guard.rb; do not inline it elsewhere.
require_relative '../gcp_clean_db_guard'

namespace :gcp do
  desc 'Verify the connection is the expected EMPTY Cloud SQL target (EXPECTED_CLOUDSQL_HOST), then db:schema:load. Clean-DB cutover only.'
  task guarded_schema_load: :environment do
    host = GcpCleanDbGuard.assert_clean_target!
    puts "gcp:guarded_schema_load: target verified (host=#{host}, 0 application tables). Loading schema..."
    Rake::Task['db:schema:load'].invoke
    puts 'gcp:guarded_schema_load: db:schema:load complete.'
  end
end
