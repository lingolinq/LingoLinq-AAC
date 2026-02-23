class AiApiLog < ApplicationRecord
  # Validations
  validates :ai_provider, presence: true
  validates :request_type, presence: true
  validates :ai_provider, inclusion: {
    in: %w[openai claude gemini azure_openai anthropic],
    allow_blank: false,
    message: "%{value} is not a recognized AI provider"
  }

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
  #     provider: 'openai',
  #     model: 'gpt-4o-mini',
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
    log.model_name = params[:model]
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
  #   #   calls_by_provider: { "openai" => 800, "claude" => 742 },
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
      model_name: model_name,
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
