require 'spec_helper'

describe AiApiLog, :type => :model do
  describe "validations" do
    it "should require ai_provider" do
      log = AiApiLog.new(request_type: 'board_generation')
      expect(log).not_to be_valid
      expect(log.errors[:ai_provider]).to be_present
    end

    it "should require request_type" do
      log = AiApiLog.new(ai_provider: 'openai')
      expect(log).not_to be_valid
      expect(log.errors[:request_type]).to be_present
    end

    it "should only accept recognized ai_provider values" do
      %w[openai claude gemini azure_openai anthropic].each do |provider|
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
      log = AiApiLog.new(ai_provider: 'openai', request_type: 'board_generation')
      expect(log).to be_valid
    end
  end

  describe "scopes" do
    describe "by_provider" do
      it "should return records matching the specified provider" do
        AiApiLog.create!(ai_provider: 'openai', request_type: 'board_generation')
        AiApiLog.create!(ai_provider: 'claude', request_type: 'board_generation')
        AiApiLog.create!(ai_provider: 'openai', request_type: 'word_suggestion')

        results = AiApiLog.by_provider('openai')
        expect(results.count).to eq(2)
        expect(results.pluck(:ai_provider).uniq).to eq(['openai'])
      end
    end

    describe "by_type" do
      it "should return records matching the specified request type" do
        AiApiLog.create!(ai_provider: 'openai', request_type: 'board_generation')
        AiApiLog.create!(ai_provider: 'claude', request_type: 'word_suggestion')
        AiApiLog.create!(ai_provider: 'openai', request_type: 'board_generation')

        results = AiApiLog.by_type('board_generation')
        expect(results.count).to eq(2)
        expect(results.pluck(:request_type).uniq).to eq(['board_generation'])
      end
    end

    describe "recent" do
      it "should return records from the last 30 days" do
        recent_log = AiApiLog.create!(ai_provider: 'openai', request_type: 'board_generation')
        old_log = AiApiLog.create!(ai_provider: 'openai', request_type: 'board_generation')
        old_log.update_column(:created_at, 60.days.ago)

        results = AiApiLog.recent
        expect(results).to include(recent_log)
        expect(results).not_to include(old_log)
      end
    end

    describe "failed" do
      it "should return records where success is false" do
        success_log = AiApiLog.create!(ai_provider: 'openai', request_type: 'board_generation', success: true)
        failed_log = AiApiLog.create!(ai_provider: 'openai', request_type: 'board_generation', success: false)

        results = AiApiLog.failed
        expect(results).to include(failed_log)
        expect(results).not_to include(success_log)
      end
    end

    describe "with_pii_detected" do
      it "should return records where pii_detected is true" do
        clean_log = AiApiLog.create!(ai_provider: 'openai', request_type: 'board_generation', pii_detected: false)
        pii_log = AiApiLog.create!(ai_provider: 'openai', request_type: 'board_generation', pii_detected: true)

        results = AiApiLog.with_pii_detected
        expect(results).to include(pii_log)
        expect(results).not_to include(clean_log)
      end
    end
  end

  describe "log_ai_call" do
    it "should create and persist a log record" do
      log = AiApiLog.log_ai_call(
        provider: 'openai',
        model: 'gpt-4o-mini',
        type: 'board_generation',
        request_summary: 'Generate 3x4 board',
        response_summary: 'Returned 12 buttons',
        tokens_sent: 350,
        tokens_received: 420,
        duration_ms: 1823,
        success: true
      )
      expect(log).to be_persisted
      expect(log.ai_provider).to eq('openai')
      expect(log.model_name).to eq('gpt-4o-mini')
      expect(log.request_type).to eq('board_generation')
      expect(log.request_summary).to eq('Generate 3x4 board')
      expect(log.response_summary).to eq('Returned 12 buttons')
      expect(log.tokens_sent).to eq(350)
      expect(log.tokens_received).to eq(420)
      expect(log.duration_ms).to eq(1823)
      expect(log.success).to eq(true)
    end

    it "should default success to true when not specified" do
      log = AiApiLog.log_ai_call(provider: 'openai', type: 'board_generation')
      expect(log.success).to eq(true)
    end

    it "should allow recording a failed call with error message" do
      log = AiApiLog.log_ai_call(
        provider: 'openai',
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
        provider: 'openai',
        type: 'board_generation',
        user: user_obj
      )
      expect(log.user_global_id).to eq('1_12345')
    end

    it "should accept a string global_id directly" do
      log = AiApiLog.log_ai_call(
        provider: 'openai',
        type: 'board_generation',
        user: '1_99999'
      )
      expect(log.user_global_id).to eq('1_99999')
    end

    it "should handle nil user gracefully" do
      log = AiApiLog.log_ai_call(
        provider: 'openai',
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
        provider: 'openai',
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
        provider: 'openai',
        type: 'board_generation',
        pii_findings: json_str
      )
      expect(log.pii_findings).to eq(json_str)
    end

    it "should default pii_detected to false" do
      log = AiApiLog.log_ai_call(provider: 'openai', type: 'board_generation')
      expect(log.pii_detected).to eq(false)
    end

    it "should store IP address and feature flag" do
      log = AiApiLog.log_ai_call(
        provider: 'openai',
        type: 'board_generation',
        ip_address: '192.168.1.1',
        feature_flag: 'ai_board_gen_v2'
      )
      expect(log.ip_address).to eq('192.168.1.1')
      expect(log.feature_flag).to eq('ai_board_gen_v2')
    end

    it "should store the request payload hash" do
      log = AiApiLog.log_ai_call(
        provider: 'openai',
        type: 'board_generation',
        request_payload_hash: 'sha256_abc123def456'
      )
      expect(log.request_payload_hash).to eq('sha256_abc123def456')
    end
  end

  describe "compliance_report" do
    before(:each) do
      # Create a mix of log records for the report
      AiApiLog.log_ai_call(provider: 'openai', type: 'board_generation', user: '1_100',
                           tokens_sent: 100, tokens_received: 200, success: true, pii_detected: false)
      AiApiLog.log_ai_call(provider: 'openai', type: 'word_suggestion', user: '1_100',
                           tokens_sent: 50, tokens_received: 75, success: true, pii_detected: false)
      AiApiLog.log_ai_call(provider: 'claude', type: 'board_generation', user: '1_200',
                           tokens_sent: 200, tokens_received: 300, success: false,
                           error_message: 'Timeout', pii_detected: true)
    end

    it "should return total call count" do
      report = AiApiLog.compliance_report(1.hour.ago, Time.current)
      expect(report[:total_calls]).to eq(3)
    end

    it "should break down calls by provider" do
      report = AiApiLog.compliance_report(1.hour.ago, Time.current)
      expect(report[:calls_by_provider]['openai']).to eq(2)
      expect(report[:calls_by_provider]['claude']).to eq(1)
    end

    it "should break down calls by type" do
      report = AiApiLog.compliance_report(1.hour.ago, Time.current)
      expect(report[:calls_by_type]['board_generation']).to eq(2)
      expect(report[:calls_by_type]['word_suggestion']).to eq(1)
    end

    it "should count calls with PII detected" do
      report = AiApiLog.compliance_report(1.hour.ago, Time.current)
      expect(report[:calls_with_pii_detected]).to eq(1)
    end

    it "should count unique users" do
      report = AiApiLog.compliance_report(1.hour.ago, Time.current)
      expect(report[:unique_users]).to eq(2)
    end

    it "should report failure count and rate" do
      report = AiApiLog.compliance_report(1.hour.ago, Time.current)
      expect(report[:total_failures]).to eq(1)
      expect(report[:failure_rate]).to eq(33.33)
    end

    it "should sum token counts" do
      report = AiApiLog.compliance_report(1.hour.ago, Time.current)
      expect(report[:total_tokens_sent]).to eq(350)
      expect(report[:total_tokens_received]).to eq(575)
    end

    it "should include the date range" do
      start_date = 1.hour.ago
      end_date = Time.current
      report = AiApiLog.compliance_report(start_date, end_date)
      expect(report[:date_range][:start]).to eq(start_date)
      expect(report[:date_range][:end]).to eq(end_date)
    end

    it "should only include records within the date range" do
      old_log = AiApiLog.log_ai_call(provider: 'gemini', type: 'board_generation',
                                     tokens_sent: 999, tokens_received: 999)
      old_log.update_column(:created_at, 60.days.ago)

      report = AiApiLog.compliance_report(1.hour.ago, Time.current)
      expect(report[:total_calls]).to eq(3)
      expect(report[:calls_by_provider]).not_to have_key('gemini')
    end

    it "should handle empty date ranges gracefully" do
      report = AiApiLog.compliance_report(2.years.ago, 1.year.ago)
      expect(report[:total_calls]).to eq(0)
      expect(report[:failure_rate]).to eq(0.0)
      expect(report[:unique_users]).to eq(0)
    end
  end

  describe "redact_old_ip_addresses!" do
    it "should redact IP addresses on records older than the specified days" do
      old_log = AiApiLog.log_ai_call(provider: 'openai', type: 'board_generation',
                                     ip_address: '192.168.1.1')
      old_log.update_column(:created_at, 100.days.ago)

      recent_log = AiApiLog.log_ai_call(provider: 'openai', type: 'board_generation',
                                        ip_address: '10.0.0.1')

      count = AiApiLog.redact_old_ip_addresses!(days: 90)
      expect(count).to eq(1)

      old_log.reload
      recent_log.reload
      expect(old_log.ip_address).to eq('[REDACTED]')
      expect(recent_log.ip_address).to eq('10.0.0.1')
    end

    it "should skip records that already have nil IP addresses" do
      old_log = AiApiLog.log_ai_call(provider: 'openai', type: 'board_generation',
                                     ip_address: nil)
      old_log.update_column(:created_at, 100.days.ago)

      count = AiApiLog.redact_old_ip_addresses!(days: 90)
      expect(count).to eq(0)
    end

    it "should skip records that already have [REDACTED] as IP address" do
      old_log = AiApiLog.log_ai_call(provider: 'openai', type: 'board_generation',
                                     ip_address: '[REDACTED]')
      old_log.update_column(:created_at, 100.days.ago)

      count = AiApiLog.redact_old_ip_addresses!(days: 90)
      expect(count).to eq(0)
    end

    it "should use 90 days as the default cutoff" do
      log_89_days = AiApiLog.log_ai_call(provider: 'openai', type: 'board_generation',
                                         ip_address: '10.0.0.1')
      log_89_days.update_column(:created_at, 89.days.ago)

      log_91_days = AiApiLog.log_ai_call(provider: 'openai', type: 'board_generation',
                                         ip_address: '10.0.0.2')
      log_91_days.update_column(:created_at, 91.days.ago)

      count = AiApiLog.redact_old_ip_addresses!
      expect(count).to eq(1)

      log_89_days.reload
      log_91_days.reload
      expect(log_89_days.ip_address).to eq('10.0.0.1')
      expect(log_91_days.ip_address).to eq('[REDACTED]')
    end

    it "should accept a custom number of days" do
      old_log = AiApiLog.log_ai_call(provider: 'openai', type: 'board_generation',
                                     ip_address: '10.0.0.1')
      old_log.update_column(:created_at, 40.days.ago)

      count = AiApiLog.redact_old_ip_addresses!(days: 30)
      expect(count).to eq(1)
      old_log.reload
      expect(old_log.ip_address).to eq('[REDACTED]')
    end
  end

  describe "to_audit_hash" do
    it "should return a hash with all expected audit fields" do
      log = AiApiLog.log_ai_call(
        provider: 'openai',
        model: 'gpt-4o-mini',
        type: 'board_generation',
        user: '1_12345',
        organization: '1_org_500',
        request_summary: 'Generate board',
        response_summary: 'Returned 12 buttons',
        tokens_sent: 350,
        tokens_received: 420,
        duration_ms: 1823,
        request_payload_hash: 'sha256_abc',
        pii_detected: false,
        success: true,
        feature_flag: 'ai_board_gen_v2'
      )

      audit = log.to_audit_hash
      expect(audit[:id]).to eq(log.id)
      expect(audit[:ai_provider]).to eq('openai')
      expect(audit[:model_name]).to eq('gpt-4o-mini')
      expect(audit[:request_type]).to eq('board_generation')
      expect(audit[:request_payload_hash]).to eq('sha256_abc')
      expect(audit[:tokens_sent]).to eq(350)
      expect(audit[:tokens_received]).to eq(420)
      expect(audit[:duration_ms]).to eq(1823)
      expect(audit[:user_global_id]).to eq('1_12345')
      expect(audit[:organization_global_id]).to eq('1_org_500')
      expect(audit[:pii_detected]).to eq(false)
      expect(audit[:success]).to eq(true)
      expect(audit[:feature_flag]).to eq('ai_board_gen_v2')
      expect(audit[:created_at]).to be_a(String)
      expect(audit[:updated_at]).to be_a(String)
    end

    it "should hide error_message when the call was successful" do
      log = AiApiLog.log_ai_call(
        provider: 'openai',
        type: 'board_generation',
        success: true,
        error_message: 'should not appear'
      )
      audit = log.to_audit_hash
      expect(audit[:error_message]).to eq(nil)
    end

    it "should include error_message when the call failed" do
      log = AiApiLog.log_ai_call(
        provider: 'openai',
        type: 'board_generation',
        success: false,
        error_message: 'Rate limit exceeded'
      )
      audit = log.to_audit_hash
      expect(audit[:error_message]).to eq('Rate limit exceeded')
    end

    it "should parse pii_findings from JSON" do
      findings = [{ 'type' => 'email', 'value' => 'a****m', 'position' => 5 }]
      log = AiApiLog.log_ai_call(
        provider: 'openai',
        type: 'board_generation',
        pii_detected: true,
        pii_findings: findings
      )
      audit = log.to_audit_hash
      expect(audit[:pii_findings]).to be_a(Array)
      expect(audit[:pii_findings].first['type']).to eq('email')
    end

    it "should return empty array for nil pii_findings" do
      log = AiApiLog.log_ai_call(
        provider: 'openai',
        type: 'board_generation',
        pii_findings: nil
      )
      audit = log.to_audit_hash
      expect(audit[:pii_findings]).to eq([])
    end

    it "should return empty array for malformed pii_findings JSON" do
      log = AiApiLog.log_ai_call(
        provider: 'openai',
        type: 'board_generation',
        pii_findings: 'not valid json {'
      )
      audit = log.to_audit_hash
      expect(audit[:pii_findings]).to eq([])
    end

    it "should not include raw request or response payloads" do
      log = AiApiLog.log_ai_call(
        provider: 'openai',
        type: 'board_generation',
        request_summary: 'Generate board',
        response_summary: 'Returned buttons'
      )
      audit = log.to_audit_hash
      expect(audit).not_to have_key(:request_summary)
      expect(audit).not_to have_key(:response_summary)
      expect(audit).not_to have_key(:ip_address)
    end

    it "should format timestamps as ISO 8601" do
      log = AiApiLog.log_ai_call(provider: 'openai', type: 'board_generation')
      audit = log.to_audit_hash
      expect { Time.iso8601(audit[:created_at]) }.not_to raise_error
      expect { Time.iso8601(audit[:updated_at]) }.not_to raise_error
    end
  end
end
