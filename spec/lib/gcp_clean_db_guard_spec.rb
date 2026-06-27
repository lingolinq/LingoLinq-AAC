require 'spec_helper'
require 'rake'
require Rails.root.join('lib', 'gcp_clean_db_guard')

# Validates the clean-DB cutover guard (lib/gcp_clean_db_guard.rb) and the rake wrapper that wires it
# in front of db:schema:load. The guard's whole job is to REFUSE to drop/load a DB that is not the
# expected empty Cloud SQL target, so the key tests assert it raises. db:schema:load is never invoked
# for real here - it would wipe the test schema - so the rake tests stub it.
describe GcpCleanDbGuard do
  describe '.assert_clean_target!' do
    let(:empty_conn) { instance_double('conn', tables: GcpCleanDbGuard::BOOKKEEPING_TABLES.dup) }
    def cfg_double(hash) = instance_double('db_config', configuration_hash: hash)

    it 'fails closed when EXPECTED_CLOUDSQL_HOST is blank' do
      expect {
        described_class.assert_clean_target!(connection: empty_conn,
                                             db_config: cfg_double(host: 'anything'),
                                             expected_host: '')
      }.to raise_error(GcpCleanDbGuard::UnsafeTarget, /EXPECTED_CLOUDSQL_HOST must be set/)
    end

    it 'raises WRONG DB when the connected host does not contain the expected host' do
      expect {
        described_class.assert_clean_target!(connection: empty_conn,
                                             db_config: cfg_double(host: 'some-other-db'),
                                             expected_host: 'lingolinq-prod')
      }.to raise_error(GcpCleanDbGuard::UnsafeTarget, /WRONG DB: connected to some-other-db/)
    end

    it 'raises DB NOT EMPTY against the real populated test schema even when the host matches' do
      # Real connection (the test DB has every app table); stub only the host so it "matches",
      # proving the guard still refuses because the DB is not empty.
      real_conn = ActiveRecord::Base.connection
      expect {
        described_class.assert_clean_target!(connection: real_conn,
                                             db_config: cfg_double(host: 'cloudsql-target'),
                                             expected_host: 'cloudsql-target')
      }.to raise_error(GcpCleanDbGuard::UnsafeTarget, /DB NOT EMPTY/)
    end

    it 'returns the host when the target matches AND is empty (socket form)' do
      socket = '/cloudsql/lingolinq-prod:us-central1:lingolinq-prod-pg'
      result = described_class.assert_clean_target!(connection: empty_conn,
                                                    db_config: cfg_double(socket: socket),
                                                    expected_host: '/cloudsql/lingolinq-prod')
      expect(result).to eq(socket)
    end

    it 'treats a missing host/socket as UNKNOWN and refuses' do
      expect {
        described_class.assert_clean_target!(connection: empty_conn,
                                             db_config: cfg_double({}),
                                             expected_host: 'lingolinq-prod')
      }.to raise_error(GcpCleanDbGuard::UnsafeTarget, /WRONG DB: connected to UNKNOWN/)
    end
  end
end

describe 'gcp:guarded_schema_load rake task' do
  before(:all) do
    Rails.application.load_tasks unless Rake::Task.task_defined?('gcp:guarded_schema_load')
  end

  before(:each) do
    Rake::Task['gcp:guarded_schema_load'].reenable
    # NEVER let the real schema load run in tests - it would drop the test DB.
    allow(Rake::Task['db:schema:load']).to receive(:invoke)
  end

  it 'loads schema only after the guard passes' do
    expect(GcpCleanDbGuard).to receive(:assert_clean_target!).and_return('cloudsql-host')
    Rake::Task['gcp:guarded_schema_load'].invoke
    expect(Rake::Task['db:schema:load']).to have_received(:invoke)
  end

  it 'does NOT load schema when the guard refuses' do
    allow(GcpCleanDbGuard).to receive(:assert_clean_target!)
      .and_raise(GcpCleanDbGuard::UnsafeTarget, 'DB NOT EMPTY')
    expect { Rake::Task['gcp:guarded_schema_load'].invoke }.to raise_error(GcpCleanDbGuard::UnsafeTarget)
    expect(Rake::Task['db:schema:load']).not_to have_received(:invoke)
  end
end
