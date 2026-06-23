require 'spec_helper'
require 'rake'

# Exercises the Phase 4 sequence reset/verify tasks against the REAL test schema, so the
# scripts/gcp/*.sql single-source-of-truth is validated before it is ever pointed at Cloud SQL.
describe 'db:setval_all_sequences / db:verify_sequences rake tasks' do
  before(:all) do
    Rails.application.load_tasks unless Rake::Task.task_defined?('db:setval_all_sequences')
  end

  before(:each) do
    Rake::Task['db:setval_all_sequences'].reenable
    Rake::Task['db:verify_sequences'].reenable
  end

  let(:conn) { ActiveRecord::Base.connection }

  # snapshot of every public sequence's persisted value, for idempotency comparison
  def seq_snapshot
    conn.select_rows(
      "select sequencename, last_value from pg_sequences where schemaname = 'public' order by sequencename"
    )
  end

  it 'advances every column-owned sequence over the real schema without error' do
    expect { Rake::Task['db:setval_all_sequences'].invoke }.not_to raise_error
    # All 57 app tables carry a column-owned sequence; the dynamic discovery must find them.
    seqs = conn.select_value("select count(*) from pg_sequences where schemaname = 'public'").to_i
    expect(seqs).to be >= 57
  end

  it 'is idempotent: a second run leaves every sequence value unchanged' do
    Rake::Task['db:setval_all_sequences'].invoke
    before = seq_snapshot
    Rake::Task['db:setval_all_sequences'].reenable
    Rake::Task['db:setval_all_sequences'].invoke
    expect(seq_snapshot).to eq(before)
  end

  it 'db:verify_sequences passes after a setval run' do
    Rake::Task['db:setval_all_sequences'].invoke
    expect { Rake::Task['db:verify_sequences'].invoke }.not_to raise_error
  end

  it 'db:verify_sequences raises when a sequence lags its table MAX' do
    begin
      expect {
        # requires_new wraps a SAVEPOINT, so the verify DO block's server-side RAISE rolls back
        # to the savepoint and re-raises WITHOUT aborting the outer fixture transaction.
        conn.transaction(requires_new: true) do
          conn.execute("insert into webhooks (id, created_at, updated_at) values (999999, now(), now())")
          conn.execute("select setval('webhooks_id_seq', 5, true)")
          Rake::Task['db:verify_sequences'].invoke
        end
      }.to raise_error(ActiveRecord::StatementInvalid, /webhooks_id_seq behind/)
    ensure
      # setval is non-transactional, so the forced-low value survives the savepoint rollback;
      # restore the empty-table baseline so no sequence state leaks to other specs.
      conn.execute("select setval('webhooks_id_seq', 1, false)")
    end
  end
end
