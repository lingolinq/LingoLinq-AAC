require 'spec_helper'

describe OffboardingCoppaExpirationWorker do
  around(:each) do |example|
    prior = ENV['COPPA_OFFBOARDING_SWEEP_ENABLED']
    example.run
    if prior.nil?
      ENV.delete('COPPA_OFFBOARDING_SWEEP_ENABLED')
    else
      ENV['COPPA_OFFBOARDING_SWEEP_ENABLED'] = prior
    end
  end

  describe 'mode' do
    it "is :disabled when the env var is unset" do
      ENV.delete('COPPA_OFFBOARDING_SWEEP_ENABLED')
      expect(OffboardingCoppaExpirationWorker.mode).to eq(:disabled)
    end

    it "is :disabled for any value that is not 'true' or 'report'" do
      ['', 'false', '1', 'yes', 'TRUEISH', 'reporting'].each do |val|
        ENV['COPPA_OFFBOARDING_SWEEP_ENABLED'] = val
        expect(OffboardingCoppaExpirationWorker.mode).to eq(:disabled), "expected #{val.inspect} to be :disabled"
      end
    end

    it 'is case- and whitespace-insensitive' do
      ENV['COPPA_OFFBOARDING_SWEEP_ENABLED'] = '  TRUE '
      expect(OffboardingCoppaExpirationWorker.mode).to eq(:run)
      ENV['COPPA_OFFBOARDING_SWEEP_ENABLED'] = ' Report '
      expect(OffboardingCoppaExpirationWorker.mode).to eq(:report)
    end
  end

  describe 'disabled (env unset)' do
    before(:each) { ENV.delete('COPPA_OFFBOARDING_SWEEP_ENABLED') }

    it 'processes nothing and never reaches the sweep' do
      expect(User).not_to receive(:process_expired_offboarding_consents!)
      expect(OffboardingCoppaExpirationWorker.perform).to eq(0)
    end

    it 'does not even scan for candidates' do
      expect(User).not_to receive(:each_expired_offboarding_consent_candidate)
      OffboardingCoppaExpirationWorker.perform
    end

    it 'says it is disabled in the log' do
      expect(Rails.logger).to receive(:info).with(/mode=disabled.*skipping without scanning or mutating/)
      OffboardingCoppaExpirationWorker.perform
    end
  end

  describe 'report (dry run)' do
    before(:each) { ENV['COPPA_OFFBOARDING_SWEEP_ENABLED'] = 'report' }

    let(:candidates) do
      [
        double('user', global_id: '1_101', offboarding_export_reason: 'declined'),
        double('user', global_id: '1_102', offboarding_export_reason: 'expired'),
        double('user', global_id: '1_103', offboarding_export_reason: 'expired')
      ]
    end

    # These doubles exercise the worker's own logging and counting only. They
    # prove NOTHING about which accounts get selected -- that is
    # each_expired_offboarding_consent_candidate's job and it is covered against a
    # real database in spec/models/user_org_offboarding_consent_spec.rb.
    def stub_candidates(list)
      allow(User).to receive(:each_expired_offboarding_consent_candidate) do |&blk|
        list.each { |u| blk.call(u) }
      end
    end

    it 'never schedules anything' do
      stub_candidates(candidates)
      expect(User).not_to receive(:process_expired_offboarding_consents!)
      expect(OffboardingCoppaExpirationWorker.perform).to eq(0)
    end

    it 'logs the count and the declined/expired split' do
      stub_candidates(candidates)
      allow(Rails.logger).to receive(:info)
      expect(Rails.logger).to receive(:info).with(/mode=report DRY RUN: 3 account\(s\) WOULD be exported.*declined=1 expired=2/)
      OffboardingCoppaExpirationWorker.perform
    end

    it 'logs one identifiable line per affected account' do
      stub_candidates(candidates)
      allow(Rails.logger).to receive(:info)
      expect(Rails.logger).to receive(:info).with('[OffboardingCoppaExpiration] mode=report would sweep user_global_id=1_101 reason=declined')
      expect(Rails.logger).to receive(:info).with('[OffboardingCoppaExpiration] mode=report would sweep user_global_id=1_102 reason=expired')
      expect(Rails.logger).to receive(:info).with('[OffboardingCoppaExpiration] mode=report would sweep user_global_id=1_103 reason=expired')
      OffboardingCoppaExpirationWorker.perform
    end

    it 'caps the per-account lines but never the count' do
      many = (1..250).map { |i| double('user', global_id: "1_#{i}", offboarding_export_reason: 'expired') }
      stub_candidates(many)
      logged = []
      allow(Rails.logger).to receive(:info) { |msg| logged << msg }
      OffboardingCoppaExpirationWorker.perform
      expect(logged).to include(a_string_matching(/DRY RUN: 250 account\(s\)/))
      expect(logged).to include(a_string_matching(/\.\.\.and 50 more, not listed/))
      sweep_lines = logged.select { |msg| msg.include?('would sweep') }
      expect(sweep_lines.length).to eq(OffboardingCoppaExpirationWorker::MAX_REPORT_LINES)
      expect(sweep_lines.last).to include('user_global_id=1_200')
      expect(logged.none? { |msg| msg.include?('user_global_id=1_201') }).to eq(true)
    end

    it 'reports zero cleanly when nothing is due' do
      stub_candidates([])
      allow(Rails.logger).to receive(:info)
      expect(Rails.logger).to receive(:info).with(/mode=report DRY RUN: 0 account\(s\)/)
      expect(OffboardingCoppaExpirationWorker.perform).to eq(0)
    end
  end

  describe 'run' do
    before(:each) { ENV['COPPA_OFFBOARDING_SWEEP_ENABLED'] = 'true' }

    it 'calls User.process_expired_offboarding_consents! and returns its count' do
      expect(User).to receive(:process_expired_offboarding_consents!).and_return(2)
      expect(OffboardingCoppaExpirationWorker.perform).to eq(2)
    end
  end

  it 'is assigned to the default queue' do
    expect(OffboardingCoppaExpirationWorker.instance_variable_get(:@queue)).to eq(:default)
  end
end
