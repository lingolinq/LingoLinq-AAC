class AiApiLog < ApplicationRecord
  # Validations
  validates :ai_provider, presence: true
  validates :request_type, presence: true
  validates :ai_provider, inclusion: {
    in: %w[claude gemini],
    allow_blank: false,
    message: "%{value} is not a recognized AI provider"
  }

  # Scrub PII out of free-form summary columns before persistence. Request
  # summaries are usually built from already-scrubbed prompts, but model
  # responses are raw model output and frequently echo names / emails from
  # the prompt or hallucinate new ones. Audit-reports/security-review-2026-05-04
  # finding #3 flagged response_summary as a latent PII reservoir, one new
  # SQL caller away from leakage. Scrub on assignment so no future caller
  # can store raw output even by accident.
  before_validation :scrub_summary_columns

  def scrub_summary_columns
    self.response_summary = pii_scrub(response_summary)
    self.request_summary = pii_scrub(request_summary)
    nil
  end

  def pii_scrub(value)
    return value unless value.is_a?(String) && !value.empty?
    result = PiiScrubber.redact_for_ai(value)
    scrubbed = result.is_a?(Hash) ? result[:payload] : result
    scrubbed.is_a?(String) ? scrubbed : '[REDACTED]'
  rescue StandardError => e
    Rails.logger.error("AiApiLog: pii_scrub failed: #{e.message}") if defined?(Rails)
    '[REDACTED]'
  end

  # Scopes
  scope :by_provider, ->(provider) { where(ai_provider: provider) }
  scope :by_type, ->(type) { where(request_type: type) }
  scope :recent, -> { where('created_at >= ?', 30.days.ago) }
  scope :failed, -> { where(success: false) }
  scope :with_pii_detected, -> { where(pii_detected: true) }

  # Convenience method to create a log entry for an AI API call.
  # Accepts a hash of parameters and persists the record.
  #
  # Example:
  #   AiApiLog.log_ai_call(
  #     provider: 'claude',
  #     model: 'claude-haiku-4-5-20251001',
  #     type: 'board_generation',
  #     user: current_user,
  #     organization: current_org,
  #     request_summary: 'Generate 3x4 board for greetings',
  #     response_summary: 'Returned 12 buttons with symbols',
  #     tokens_sent: 350,
  #     tokens_received: 420,
  #     duration_ms: 1823,
  #     request_payload_hash: 'abc123...',
  #     pii_detected: false,
  #     pii_findings: nil,
  #     success: true,
  #     error_message: nil,
  #     ip_address: '192.168.1.1',
  #     feature_flag: 'ai_board_gen_v2'
  #   )
  def self.log_ai_call(params = {})
    log = new
    log.ai_provider = params[:provider]
    log.ai_model = params[:model]
    log.request_type = params[:type]
    log.user_global_id = resolve_global_id(params[:user])
    log.organization_global_id = resolve_global_id(params[:organization])
    log.request_summary = params[:request_summary]
    log.response_summary = params[:response_summary]
    log.tokens_sent = params[:tokens_sent]
    log.tokens_received = params[:tokens_received]
    log.duration_ms = params[:duration_ms]
    log.request_payload_hash = params[:request_payload_hash]
    log.pii_detected = params[:pii_detected] || false
    log.pii_findings = params[:pii_findings].is_a?(Array) ? params[:pii_findings].to_json : params[:pii_findings]
    log.success = params.key?(:success) ? params[:success] : true
    log.error_message = params[:error_message]
    log.ip_address = params[:ip_address]
    log.feature_flag = params[:feature_flag]
    log.save!
    log
  rescue ActiveRecord::RecordInvalid => e
    Rails.logger.error "AiApiLog: failed to persist audit log: #{e.message}"
    log
  end

  # Generates aggregate compliance statistics for a given date range.
  # Returns a hash with breakdowns useful for audit and compliance reporting.
  #
  # Example:
  #   AiApiLog.compliance_report(30.days.ago, Time.current)
  #   # => {
  #   #   total_calls: 1542,
  #   #   calls_by_provider: { "claude" => 1542 },
  #   #   calls_by_type: { "board_generation" => 500, ... },
  #   #   calls_with_pii_detected: 23,
  #   #   unique_users: 89,
  #   #   total_failures: 12,
  #   #   failure_rate: 0.78,
  #   #   total_tokens_sent: 523000,
  #   #   total_tokens_received: 612000,
  #   #   date_range: { start: ..., end: ... }
  #   # }
  def self.compliance_report(start_date, end_date)
    scope = where(created_at: start_date..end_date)
    total = scope.count
    failures = scope.where(success: false).count

    {
      total_calls: total,
      calls_by_provider: scope.group(:ai_provider).count,
      calls_by_type: scope.group(:request_type).count,
      calls_with_pii_detected: scope.where(pii_detected: true).count,
      unique_users: scope.where.not(user_global_id: nil).distinct.count(:user_global_id),
      total_failures: failures,
      failure_rate: total > 0 ? (failures.to_f / total * 100).round(2) : 0.0,
      total_tokens_sent: scope.sum(:tokens_sent),
      total_tokens_received: scope.sum(:tokens_received),
      date_range: { start: start_date, end: end_date }
    }
  end

  # Returns a single-day rollup suitable for the daily AI cost + PII digest
  # consumed by the n8n daily-ai-cost-pii-digest workflow.
  #
  # Provider breakdowns include token totals so n8n can cross-check against
  # the upstream Anthropic / OpenAI / Gemini billing APIs and flag drift.
  # PII findings are already redacted by PiiScrubber before persistence, so
  # surfacing them here is safe.
  def self.daily_summary(date = Date.current - 1)
    day_start = date.beginning_of_day
    day_end = date.end_of_day
    scope = where(created_at: day_start..day_end)

    pii_rows = scope.with_pii_detected.order(created_at: :asc).limit(50)

    {
      date: date.iso8601,
      total_calls: scope.count,
      total_failures: scope.where(success: false).count,
      total_pii_detected: scope.where(pii_detected: true).count,
      total_tokens_sent: scope.sum(:tokens_sent).to_i,
      total_tokens_received: scope.sum(:tokens_received).to_i,
      avg_duration_ms: scope.average(:duration_ms).to_f.round(1),
      by_provider: scope.group(:ai_provider).pluck(
        :ai_provider,
        Arel.sql('COUNT(*)'),
        Arel.sql('COALESCE(SUM(tokens_sent), 0)'),
        Arel.sql('COALESCE(SUM(tokens_received), 0)'),
        Arel.sql('SUM(CASE WHEN success = false THEN 1 ELSE 0 END)'),
        Arel.sql('SUM(CASE WHEN pii_detected = true THEN 1 ELSE 0 END)')
      ).map { |provider, calls, sent, received, failures, pii|
        {
          provider: provider,
          calls: calls,
          tokens_sent: sent.to_i,
          tokens_received: received.to_i,
          failures: failures.to_i,
          pii_detected: pii.to_i
        }
      },
      by_request_type: scope.group(:request_type).count,
      pii_samples: pii_rows.map { |row|
        {
          id: row.id,
          provider: row.ai_provider,
          request_type: row.request_type,
          findings: row.safe_pii_findings_for_digest,
          created_at: row.created_at.iso8601
        }
      }
    }
  end

  # Redacts IP addresses on records older than the specified number of days.
  # Supports data minimization requirements (e.g., GDPR, COPPA).
  # Records whose ip_address is already nil or '[REDACTED]' are skipped.
  #
  # Returns the number of records updated.
  def self.redact_old_ip_addresses!(days: 90)
    where('created_at < ?', days.days.ago)
      .where.not(ip_address: [nil, '[REDACTED]'])
      .update_all(ip_address: '[REDACTED]')
  end

  # Returns a hash representation suitable for audit log exports.
  # Excludes raw request/response payloads and any fields that could
  # contain PII beyond the global_id references.
  def to_audit_hash
    {
      id: id,
      ai_provider: ai_provider,
      model_name: ai_model,
      request_type: request_type,
      request_payload_hash: request_payload_hash,
      tokens_sent: tokens_sent,
      tokens_received: tokens_received,
      duration_ms: duration_ms,
      user_global_id: user_global_id,
      organization_global_id: organization_global_id,
      pii_detected: pii_detected,
      pii_findings: parsed_pii_findings,
      success: success,
      error_message: success ? nil : error_message,
      feature_flag: feature_flag,
      created_at: created_at&.iso8601,
      updated_at: updated_at&.iso8601
    }
  end

  # Public, defensively-scrubbed view of pii_findings for the n8n daily
  # digest endpoint. Strips any field that could carry a raw PII value if a
  # future PiiScrubber change started storing it. Whitelist of allowed
  # finding keys: type, position. The :value preview field is dropped
  # entirely; consumers do not need it for digest aggregation.
  def safe_pii_findings_for_digest
    findings = parsed_pii_findings
    return [] unless findings.is_a?(Array)

    findings.filter_map do |f|
      next unless f.is_a?(Hash)
      {
        'type' => f['type'] || f[:type],
        'position' => f['position'] || f[:position]
      }.compact
    end
  end

  private

  # Parses the pii_findings JSON text field into a Ruby array.
  # Returns an empty array if the field is nil or unparseable.
  def parsed_pii_findings
    return [] if pii_findings.blank?
    JSON.parse(pii_findings)
  rescue JSON::ParserError
    []
  end

  # Resolves a user or organization object (or string) to its global_id.
  # Accepts:
  #   - An object that responds to #global_id (e.g., User, Organization)
  #   - A string global_id directly (e.g., "1_12345")
  #   - nil
  def self.resolve_global_id(obj)
    return nil if obj.nil?
    return obj if obj.is_a?(String)
    obj.respond_to?(:global_id) ? obj.global_id : obj.to_s
  end
end
