require 'spec_helper'
require 'rake'

describe 'scheduler:dispatch rake task' do
  before(:all) do
    Rails.application.load_tasks unless Rake::Task.task_defined?('scheduler:dispatch')
  end

  before(:each) do
    Rake::Task['scheduler:dispatch'].reenable
  end

  let(:goal_count_double) { double('UserGoal::AdvanceRelation', count: 0) }

  def stub_hourly_collaborators
    allow(LogSession).to receive(:generate_log_summaries).and_return({ found: 0, notified: 0 })
    allow(LogSession).to receive(:push_logs_remotely).and_return(0)
    allow(LogSession).to receive(:check_possible_mergers).and_return(0)
    allow(Uploader).to receive(:remote_remove_batch)
    allow(UserGoal).to receive(:advance_goals).and_return(goal_count_double)
    allow(ButtonImage).to receive(:schedule_for)
    allow(ButtonSound).to receive(:schedule_for)
  end

  def stub_daily_collaborators
    allow(User).to receive(:check_for_subscription_updates).and_return({})
    allow(User).to receive(:schedule_for)
    allow(BoardContent).to receive(:schedule_for)
    allow(ButtonSound).to receive(:schedule_missing_transcodings).and_return(0)
    allow(Flusher).to receive(:flush_deleted_users).and_return(0)
    allow(Utterance).to receive(:clear_old_nonces)
    allow(Worker).to receive(:schedule)
    allow(Worker).to receive(:schedule_for)
    allow(DeletedBoard).to receive(:flush_old_records).and_return(0)
    allow(JobStash).to receive(:flush_old_records)
    allow(DataPolicyEnforcer).to receive(:enforce_retention!).and_return(0)
    allow(SupervisorConsentExpirationWorker).to receive(:perform).and_return(0)
    allow(OffboardingCoppaExpirationWorker).to receive(:perform).and_return(0)
    allow(License).to receive(:expire_stale_licenses!).and_return(0)
  end

  context 'when run at 6 AM UTC (daily window)' do
    before do
      allow(Time).to receive(:now).and_return(Time.utc(2026, 4, 27, 6, 0, 0))
      stub_hourly_collaborators
      stub_daily_collaborators
    end

    it 'invokes AiApiLog.redact_old_ip_addresses! to scrub IPs older than 90 days' do
      expect(AiApiLog).to receive(:redact_old_ip_addresses!).and_return(0)
      Rake::Task['scheduler:dispatch'].invoke
    end

    it 'invokes DemoDistrict.refresh! to roll the demo organization forward' do
      expect(DemoDistrict).to receive(:refresh!).and_return({ skipped_org: true })
      expect { Rake::Task['scheduler:dispatch'].invoke }.not_to raise_error
    end

    # Another demo run (a manual rake demo:refresh or create_district!) holds the lock and is
    # doing the work, so this one skips without failing the dispatch.
    it 'treats a demo refresh skipped for another run in progress as done, not failed' do
      expect(DemoDistrict).to receive(:refresh!).and_return({ skipped_busy: true })
      expect {
        expect { Rake::Task['scheduler:dispatch'].invoke }.not_to raise_error
      }.to output(/refresh_demo_district\] done: another demo run is in progress/).to_stdout
    end
  end

  # These cover the failure-handling contract added on 2026-09-04, which previously shipped
  # untested: the run must go non-zero when a task fails, must keep running the REMAINING
  # tasks, and must survive a ScriptError (a LoadError from an in-task require is not a
  # StandardError, so a bare `rescue` would let it kill the whole dispatch and silently skip
  # the retention purges queued after it).
  context 'failure handling in the daily window' do
    before do
      allow(Time).to receive(:now).and_return(Time.utc(2026, 4, 27, 6, 0, 0))
      stub_hourly_collaborators
      stub_daily_collaborators
    end

    # Asserts STDERR and the exit STATUS, not stdout. The first version of this example matched
    # /enforce_data_retention_policies/ on STDOUT, which cannot fail: run_task puts
    # "[<name>] starting..." unconditionally before the block runs, so the pattern is present in
    # every daily-window example whether or not anything failed. Proven by stubbing the task to
    # SUCCEED and watching the assertion still pass. `abort` writes to stderr, and the status is
    # the thing Cloud Run Jobs actually reads.
    it 'aborts with status 1 and names the failed task in the failure summary' do
      allow(DataPolicyEnforcer).to receive(:enforce_retention!).and_raise(StandardError, 'boom')
      expect { Rake::Task['scheduler:dispatch'].invoke }
        .to raise_error(SystemExit) { |e| expect(e.status).to eq(1) }
        .and output(/task\(s\) FAILED:.*enforce_data_retention_policies/).to_stderr
    end

    it 'still runs the tasks queued AFTER a failing one' do
      allow(DataPolicyEnforcer).to receive(:enforce_retention!).and_raise(StandardError, 'boom')
      expect(License).to receive(:expire_stale_licenses!).and_return(0)
      expect { Rake::Task['scheduler:dispatch'].invoke }.to raise_error(SystemExit)
    end

    it 'survives a ScriptError and still runs the later retention purges' do
      allow(DataPolicyEnforcer).to receive(:enforce_retention!).and_raise(LoadError, 'cannot load such file')
      expect(OffboardingCoppaExpirationWorker).to receive(:perform).and_return(0)
      expect { Rake::Task['scheduler:dispatch'].invoke }.to raise_error(SystemExit)
    end

    it 'enqueues the failed-upload retry sweep at 6 AM too' do
      expect(ButtonImage).to receive(:schedule_for).with(:slow, :retry_failed_uploads)
      expect(ButtonSound).to receive(:schedule_for).with(:slow, :retry_failed_uploads)
      Rake::Task['scheduler:dispatch'].invoke
    end

    it 'exits zero when every task succeeds' do
      expect { Rake::Task['scheduler:dispatch'].invoke }.not_to raise_error
    end
  end

  context 'when run outside the 6 AM UTC daily window' do
    before do
      allow(Time).to receive(:now).and_return(Time.utc(2026, 4, 27, 14, 0, 0))
      stub_hourly_collaborators
    end

    it 'does not invoke AiApiLog.redact_old_ip_addresses!' do
      expect(AiApiLog).not_to receive(:redact_old_ip_addresses!)
      Rake::Task['scheduler:dispatch'].invoke
    end

    it 'does not invoke DemoDistrict.refresh!' do
      expect(DemoDistrict).not_to receive(:refresh!)
      Rake::Task['scheduler:dispatch'].invoke
    end

    # The sweep loads embedded pictures, so it runs on a worker, never inside this Job.
    it 'enqueues the failed-upload retry sweep without running it' do
      expect(ButtonImage).to receive(:schedule_for).with(:slow, :retry_failed_uploads)
      expect(ButtonSound).to receive(:schedule_for).with(:slow, :retry_failed_uploads)
      expect(ButtonImage).not_to receive(:retry_failed_uploads)
      expect(ButtonSound).not_to receive(:retry_failed_uploads)
      Rake::Task['scheduler:dispatch'].invoke
    end
  end
end
