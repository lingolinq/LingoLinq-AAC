# Phase 4 (Render -> GCP Cloud Run migration) sequence tasks.
#
# After a pg_dump -> restore into Cloud SQL, every column-owned sequence is left behind the
# restored MAX(id). Because global_id (app/models/concerns/global_id.rb) encodes the RAW primary
# key, the next INSERT would collide. These tasks wrap the single-source-of-truth SQL in
# scripts/gcp/ so the SAME logic can be rehearsed and unit-tested locally (here) and run against
# Cloud SQL at cutover (scripts/gcp/phase4-setval-sequences.sh). Do not duplicate the SQL logic.
namespace :db do
  # Execute one Phase 4 .sql file via the live connection, printing a clean failure banner on a
  # raised SQL error (e.g. the verify DO block's RAISE EXCEPTION) so a mid-NOTICE failure is not
  # buried in noise. The original error is re-raised so the task exits non-zero.
  def run_phase4_sql(label, filename)
    path = Rails.root.join('scripts', 'gcp', filename)
    raise "Phase 4 SQL file not found: #{path}" unless File.exist?(path)
    ActiveRecord::Base.connection.execute(File.read(path))
  rescue => e
    warn ''
    warn '=' * 60
    warn "FAILED: #{label}"
    warn e.message.to_s.lines.first(8).join
    warn '=' * 60
    raise
  end

  desc 'Advance every column-owned sequence to MAX(owning column) after a restore (idempotent)'
  task setval_all_sequences: :environment do
    run_phase4_sql('db:setval_all_sequences', 'phase4-setval-sequences.sql')
    puts 'db:setval_all_sequences: done.'
  end

  desc 'Verify every column-owned sequence is past its MAX and no identity-PK drift exists'
  task verify_sequences: :environment do
    run_phase4_sql('db:verify_sequences', 'phase4-verify-sequences.sql')
    puts 'db:verify_sequences: OK.'
  end
end
