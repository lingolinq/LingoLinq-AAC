require 'spec_helper'

describe AiApiLog, :type => :model do
  describe "validations" do
    it "should require ai_provider" do
      log = AiApiLog.new(request_type: 'board_generation')
      expect(log).not_to be_valid
      expect(log.errors[:ai_provider]).to be_present
    end

    it "should require request_type" do
      log = AiApiLog.new(ai_provider: 'claude')
      expect(log).not_to be_valid
      expect(log.errors[:request_type]).to be_present
    end

    it "should only accept recognized ai_provider values" do
      %w[claude].each do |provider|
        log = AiApiLog.new(ai_provider: provider, request_type: 'board_generation')
        log.valid?
        expect(log.errors[:ai_provider]).to be_empty, "Expected #{provider} to be valid"
      end
    end

    it "should reject unrecognized ai_provider values" do
      log = AiApiLog.new(ai_provider: 'deepseek', request_type: 'board_generation')
      expect(log).not_to be_valid
      expect(log.errors[:ai_provider]).to be_present
    end

    it "should be valid with all required fields" do
      log = AiApiLog.new(ai_provider: 'claude', request_type: 'board_generation')
      expect(log).to be_valid
    end
  end

  describe "scopes" do
    describe "by_provider" do
      it "should return records matching the specified provider" do
        AiApiLog.create!(ai_provider: 'claude', request_type: 'board_generation')
        AiApiLog.create!(ai_provider: 'claude', request_type: 'board_generation')
        AiApiLog.create!(ai_provider: 'claude', request_type: 'word_suggestion')

        results = AiApiLog.by_provider('claude')
        expect(results.count).to eq(3)
        expect(results.pluck(:ai_provider).uniq).to eq(['claude'])
      end
    end

    describe "by_type" do
      it "should return records matching the specified request type" do
        AiApiLog.create!(ai_provider: 'claude', request_type: 'board_generation')
        AiApiLog.create!(ai_provider: 'claude', request_type: 'word_suggestion')
        AiApiLog.create!(ai_provider: 'claude', request_type: 'board_generation')

        results = AiApiLog.by_type('board_generation')
        expect(results.count).to eq(2)
        expect(results.pluck(:request_type).uniq).to eq(['board_generation'])
      end
    end

    describe "recent" do
      it "should return records from the last 30 days" do
        recent_log = AiApiLog.create!(ai_provider: 'claude', request_type: 'board_generation')
        old_log = AiApiLog.create!(ai_provider: 'claude', request_type: 'board_generation')
        old_log.update_column(:created_at, 60.days.ago)

        results = AiApiLog.recent
        expect(results).to include(recent_log)
        expect(results).not_to include(old_log)
      end
    end

    describe "failed" do
      it "should return records where success is false" do
        success_log = AiApiLog.create!(ai_provider: 'claude', request_type: 'board_generation', success: true)
        failed_log = AiApiLog.create!(ai_provider: 'claude', request_type: 'board_generation', success: false)

        results = AiApiLog.failed
        expect(results).to include(failed_log)
        expect(results).not_to include(success_log)
      end
    end

    describe "with_pii_detected" do
      it "should return records where pii_detected is true" do
        clean_log = AiApiLog.create!(ai_provider: 'claude', request_type: 'board_generation', pii_detected: false)
        pii_log = AiApiLog.create!(ai_provider: 'claude', request_type: 'board_generation', pii_detected: true)

        results = AiApiLog.with_pii_detected
        expect(results).to include(pii_log)
        expect(results).not_to include(clean_log)
      end
    end
  end

  describe "log_ai_call" do
    it "should create and persist a log record" do
      log = AiApiLog.log_ai_call(
        provider: 'claude',
        model: 'claude-haiku-4-5-20251001',
        type: 'board_generation',
        request_summary: 'Generate 3x4 board',
        response_summary: 'Returned 12 buttons',
        tokens_sent: 350,
        tokens_received: 420,
        duration_ms: 1823,
        success: true
      )
      expect(log).to be_persisted
      expect(log.ai_provider).to eq('claude')
      expect(log.model_name).to eq('claude-haiku-4-5-20251001')
      expect(log.request_type).to eq('board_generation')
      expect(log.request_summary).to eq('Generate 3x4 board')
      expect(log.response_summary).to eq('Returned 12 buttons')
      expect(log.tokens_sent).to eq(350)
      expect(log.tokens_received).to eq(420)
      expect(log.duration_ms).to eq(1823)
      expect(log.success).to eq(true)
    end

    it "should default success to true when not specified" do
      log = AiApiLog.log_ai_call(provider: 'claude', type: 'board_generation')
      expect(log).to eq(true)
    end

    it "should allow recording a failed call with error message" do
      log = AiApiLog.log_ai_call(
        provider: 'claude',
        type: 'board_generation',
        success: false,
        error_message: 'Rate limit exceeded'
      )
      expect(log).to be_persisted
      expect(log.success).to eq(false)
      expect(log.error_message).to eq('Rate limit exceeded')
    end

    it "should resolve user global_id from an object" do
      user_obj = OpenStruct.new(global_id: '1_12345')
      log = AiApiLog.log_ai_call(
        provider: 'claude',
        type: 'board_generation',
        user: user_obj
      )
      expect(log.user_global_id).to eq('1_12345')
    end

    it "should accept a string global_id directly" do
      log = AiApiLog.log_ai_call(
        provider: 'claude',
        type: 'board_generation',
        user: '1_99999'
      )
      expect(log.user_global_id).to eq('1_99999')
    end

    it "should handle nil user gracefully" do
      log = AiApiLog.log_ai_call(
        provider: 'claude',
        type: 'board_generation',
        user: nil
      )
      expect(log.user_global_id).to eq(nil)
    end

    it "should resolve organization global_id" do
      org_obj = OpenStruct.new(global_id: '1_org_500')
      log = AiApiLog.log_ai_call(
        provider: 'claude',
        type: 'word_suggestion',
        organization: org_obj
      )
      expect(log.organization_global_id).to eq('1_org_500')
    end

    it "should store pii_findings as JSON when given an array" do
      findings = [{ type: :email, value: 'a****m', position: 5 }]
      log = AiApiLog.log_ai_call(
        provider: 'claude',
        type: 'board_generation',
        pii_detected: true,
        pii_findings: findings
      )
      expect(log.pii_findings).to be_a(String)
      parsed = JSON.parse(log.pii_findings)
      expect(parsed).to be_a(Array)
      expect(parsed.first['type']).to eq('email')
    end

    it "should store pii_findings as-is when given a string" do
      json_str = '[{"type":"email"}]'
      log = AiApiLog.log_ai_call(
        provider: 'claude',
        type: 'board_generation',
        pii_findings: json_str
      )
      expect(log.pii_findings).to eq(json_str)
    end

    it "should default pii_detected to false" do
      log = AiApiLog.log_ai_call(provider: 'claude', type: 'board_generation')
      expect(log.pii_detected).to eq(false)
    end

    it "should store IP address and feature flag" do
      log = AiApiLog.log_ai_call(
        provider: 'claude',
        type: 'board_generation',
        ip_address: '192.168.1.1',
        feature_flag: 'ai_board_gen_v2'
      )
      expect(log.ip_address).to eq('192.168.1.1')
      expect(log.feature_flag).to eq('ai_board_gen_v2')
    end

    it "should store the request payload hash" do
      log = AiApiLog.log_ai_call(
        provider: 'claude',
        type: 'board_generation',
        request_payload_hash: 'sha256_abc123def45'
      )
      expect(log.request_payload_hash).to eq('sha256_abc123def45')
    end
  end
end
