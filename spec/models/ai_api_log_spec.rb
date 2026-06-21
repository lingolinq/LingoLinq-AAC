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
      %w[claude gemini].each do |provider|
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
      expect(log.ai_model).to eq('claude-haiku-4-5-20251001')
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
      expect(log).to be_persisted
      expect(log.success).to eq(true)
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

    # Audit-reports/security-review-2026-05-04 finding #3: response_summary
    # was a latent PII reservoir because raw model output landed verbatim in
    # the DB. The model now scrubs both summary columns on save.
    describe "summary column scrubbing" do
      it "redacts an email address from response_summary" do
        log = AiApiLog.log_ai_call(
          provider: 'claude',
          type: 'board_generation',
          response_summary: 'Welcome jane.doe@example.com to the board'
        )
        expect(log.response_summary).not_to include('jane.doe@example.com')
        expect(log.response_summary).to include('[REDACTED_EMAIL]')
      end

      it "redacts an SSN from response_summary" do
        log = AiApiLog.log_ai_call(
          provider: 'claude',
          type: 'board_generation',
          response_summary: 'Confirm number 123-45-6789 in your records'
        )
        expect(log.response_summary).not_to include('123-45-6789')
        expect(log.response_summary).to include('[REDACTED_SSN]')
      end

      it "redacts an email address from request_summary too" do
        log = AiApiLog.log_ai_call(
          provider: 'claude',
          type: 'word_suggestion',
          request_summary: 'Suggest words for kid@example.com',
          response_summary: 'cat dog tree'
        )
        expect(log.request_summary).not_to include('kid@example.com')
      end

      it "leaves a clean response_summary unchanged" do
        log = AiApiLog.log_ai_call(
          provider: 'claude',
          type: 'board_generation',
          response_summary: 'Returned 12 buttons with symbols'
        )
        expect(log.response_summary).to eq('Returned 12 buttons with symbols')
      end

      it "is idempotent on already-redacted text" do
        log = AiApiLog.log_ai_call(
          provider: 'claude',
          type: 'board_generation',
          response_summary: 'See [REDACTED_EMAIL] for details'
        )
        expect(log.response_summary).to eq('See [REDACTED_EMAIL] for details')
      end

      it "passes nil and empty values through unchanged" do
        log = AiApiLog.log_ai_call(
          provider: 'claude',
          type: 'board_generation',
          response_summary: nil
        )
        expect(log.response_summary).to be_nil

        log = AiApiLog.log_ai_call(
          provider: 'claude',
          type: 'board_generation',
          response_summary: ''
        )
        expect(log.response_summary).to eq('')
      end

      it "uses scrubber result directly when scrubber returns a string" do
        allow(PiiScrubber).to receive(:redact_for_ai).and_return('[REDACTED_EMAIL]')
        log = AiApiLog.log_ai_call(
          provider: 'claude',
          type: 'board_generation',
          response_summary: 'contact me at test@example.com'
        )
        expect(log.response_summary).to eq('[REDACTED_EMAIL]')
      end

      it "falls back to [REDACTED] on non-hash non-string scrubber return" do
        allow(PiiScrubber).to receive(:redact_for_ai).and_return(['unexpected'])
        log = AiApiLog.log_ai_call(
          provider: 'claude',
          type: 'board_generation',
          response_summary: 'contact me at test@example.com'
        )
        expect(log.response_summary).to eq('[REDACTED]')
      end

      it "falls back to [REDACTED] when scrubber hash has no payload" do
        allow(PiiScrubber).to receive(:redact_for_ai).and_return({})
        log = AiApiLog.log_ai_call(
          provider: 'claude',
          type: 'board_generation',
          response_summary: 'contact me at test@example.com'
        )
        expect(log.response_summary).to eq('[REDACTED]')
      end
    end

    describe "safe_pii_findings_for_digest" do
      it "returns only type and position, not value/preview" do
        findings = [
          { type: 'email', position: 5, value: 'jane@example.com', preview: 'j***m' },
          { type: 'ssn', position: 30, value: '123-45-6789' }
        ]
        log = AiApiLog.log_ai_call(
          provider: 'claude',
          type: 'board_generation',
          pii_detected: true,
          pii_findings: findings
        )

        result = log.safe_pii_findings_for_digest
        expect(result.length).to eq(2)
        expect(result.first.keys).to contain_exactly('type', 'position')
        expect(result.first['type']).to eq('email')
        expect(result.first['position']).to eq(5)
        expect(result.first.values.join).not_to include('jane@example.com')
        expect(result.first.values.join).not_to include('j***m')
      end

      it "returns an empty array when there are no findings" do
        log = AiApiLog.log_ai_call(provider: 'claude', type: 'board_generation')
        expect(log.safe_pii_findings_for_digest).to eq([])
      end

      it "returns an empty array when parsed findings are not an array" do
        log = AiApiLog.log_ai_call(
          provider: 'claude',
          type: 'board_generation',
          pii_detected: true,
          pii_findings: { type: 'email', value: 'raw@example.com', position: 1 }.to_json
        )
        expect(log.safe_pii_findings_for_digest).to eq([])
      end

      it "drops non-hash entries from parsed findings" do
        log = AiApiLog.log_ai_call(
          provider: 'claude',
          type: 'board_generation',
          pii_detected: true,
          pii_findings: [{ type: 'email', position: 2 }, 'raw@example.com'].to_json
        )
        expect(log.safe_pii_findings_for_digest).to eq([{ 'type' => 'email', 'position' => 2 }])
      end
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

  describe "daily_summary" do
    let(:target_date) { Date.current - 1 }

    def make_log(attrs = {})
      log = AiApiLog.create!({
        ai_provider: 'claude',
        request_type: 'board_generation',
        tokens_sent: 50,
        tokens_received: 75,
        duration_ms: 1000,
        success: true
      }.merge(attrs))
      log.update_column(:created_at, target_date.beginning_of_day + 4.hours)
      log
    end

    it "returns the date as an ISO string" do
      summary = AiApiLog.daily_summary(target_date)
      expect(summary[:date]).to eq(target_date.iso8601)
    end

    it "totals calls, tokens, and failures for the day" do
      make_log(tokens_sent: 100, tokens_received: 200, success: true)
      make_log(tokens_sent: 50, tokens_received: 75, success: false)

      summary = AiApiLog.daily_summary(target_date)
      expect(summary[:total_calls]).to eq(2)
      expect(summary[:total_failures]).to eq(1)
      expect(summary[:total_tokens_sent]).to eq(150)
      expect(summary[:total_tokens_received]).to eq(275)
    end

    it "groups token usage by provider" do
      make_log(ai_provider: 'claude', tokens_sent: 100, tokens_received: 200)
      make_log(ai_provider: 'gemini', tokens_sent: 30, tokens_received: 40)

      summary = AiApiLog.daily_summary(target_date)
      providers = summary[:by_provider].index_by { |row| row[:provider] }
      expect(providers['claude'][:tokens_sent]).to eq(100)
      expect(providers['gemini'][:tokens_received]).to eq(40)
    end

    it "counts pii_detected rows and includes findings samples" do
      make_log(pii_detected: false)
      make_log(
        pii_detected: true,
        pii_findings: [{ type: 'email', value: 'a****m', position: 5 }].to_json
      )

      summary = AiApiLog.daily_summary(target_date)
      expect(summary[:total_pii_detected]).to eq(1)
      expect(summary[:pii_samples].length).to eq(1)
      expect(summary[:pii_samples].first[:findings].first['type']).to eq('email')
    end

    it "ignores rows from other days" do
      log = AiApiLog.create!(ai_provider: 'claude', request_type: 'board_generation')
      log.update_column(:created_at, (target_date - 3).beginning_of_day)

      summary = AiApiLog.daily_summary(target_date)
      expect(summary[:total_calls]).to eq(0)
    end

    it "defaults to yesterday when no date is given" do
      summary = AiApiLog.daily_summary
      expect(summary[:date]).to eq((Date.current - 1).iso8601)
    end
  end

  describe "redact_old_ip_addresses!" do
    it "should replace ip_address on records older than 90 days with [REDACTED]" do
      old_log = AiApiLog.create!(ai_provider: 'claude', request_type: 'board_generation', ip_address: '10.0.0.1')
      old_log.update_column(:created_at, 100.days.ago)

      count = AiApiLog.redact_old_ip_addresses!
      expect(count).to eq(1)
      expect(old_log.reload.ip_address).to eq('[REDACTED]')
    end

    it "should leave records newer than 90 days alone" do
      recent_log = AiApiLog.create!(ai_provider: 'claude', request_type: 'board_generation', ip_address: '10.0.0.2')
      recent_log.update_column(:created_at, 30.days.ago)

      AiApiLog.redact_old_ip_addresses!
      expect(recent_log.reload.ip_address).to eq('10.0.0.2')
    end

    it "should skip records that are already redacted" do
      already_redacted = AiApiLog.create!(ai_provider: 'claude', request_type: 'board_generation', ip_address: '[REDACTED]')
      already_redacted.update_column(:created_at, 200.days.ago)

      count = AiApiLog.redact_old_ip_addresses!
      expect(count).to eq(0)
    end

    it "should skip records with a nil ip_address" do
      nil_ip_log = AiApiLog.create!(ai_provider: 'claude', request_type: 'board_generation', ip_address: nil)
      nil_ip_log.update_column(:created_at, 200.days.ago)

      count = AiApiLog.redact_old_ip_addresses!
      expect(count).to eq(0)
    end

    it "should accept a custom days argument" do
      mid_log = AiApiLog.create!(ai_provider: 'claude', request_type: 'board_generation', ip_address: '10.0.0.3')
      mid_log.update_column(:created_at, 45.days.ago)

      AiApiLog.redact_old_ip_addresses!(days: 30)
      expect(mid_log.reload.ip_address).to eq('[REDACTED]')
    end

    it "should redact multiple eligible records in one call" do
      log1 = AiApiLog.create!(ai_provider: 'claude', request_type: 'board_generation', ip_address: '10.0.0.4')
      log2 = AiApiLog.create!(ai_provider: 'claude', request_type: 'board_generation', ip_address: '10.0.0.5')
      log1.update_column(:created_at, 120.days.ago)
      log2.update_column(:created_at, 150.days.ago)

      count = AiApiLog.redact_old_ip_addresses!
      expect(count).to eq(2)
      expect(log1.reload.ip_address).to eq('[REDACTED]')
      expect(log2.reload.ip_address).to eq('[REDACTED]')
    end
  end

  describe "Article 50 fields via log_ai_call" do
    it "persists jurisdiction, disclosure, marking, and content id when provided" do
      log = AiApiLog.log_ai_call(
        provider: 'claude', model: 'claude-haiku-4-5-20251001', type: 'board_generation',
        jurisdiction: 'EU', article_50_disclosure_shown: true,
        ai_content_marked: true, ai_generated_content_id: '1_99'
      )
      expect(log).to be_persisted
      expect(log.jurisdiction).to eq('EU')
      expect(log.article_50_disclosure_shown).to eq(true)
      expect(log.ai_content_marked).to eq(true)
      expect(log.ai_generated_content_id).to eq('1_99')
    end

    it "defaults the Article 50 booleans to false for existing callers (backward compatible)" do
      log = AiApiLog.log_ai_call(provider: 'claude', type: 'board_generation')
      expect(log).to be_persisted
      expect(log.jurisdiction).to be_nil
      expect(log.article_50_disclosure_shown).to eq(false)
      expect(log.ai_content_marked).to eq(false)
    end
  end
end
