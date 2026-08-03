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
  end
end
