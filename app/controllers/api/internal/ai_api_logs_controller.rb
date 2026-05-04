# frozen_string_literal: true

# Internal, machine-to-machine endpoint that exposes a daily rollup of
# AiApiLog activity for the daily-ai-cost-pii-digest n8n workflow.
#
# Auth: shared-secret header `X-Internal-Token` matched against
# ENV['INTERNAL_API_TOKEN'] using a constant-time comparison. The endpoint
# returns no PII -- pii_findings are already redacted at write time by
# PiiScrubber -- but the rollup itself is operationally sensitive so the
# token is required.
class Api::Internal::AiApiLogsController < ApplicationController
  skip_before_action :verify_authenticity_token, raise: false
  skip_before_action :check_api_token, raise: false

  before_action :require_internal_token

  def daily_summary
    date =
      if params[:date].present?
        begin
          Date.parse(params[:date])
        rescue ArgumentError
          return render(json: { error: 'invalid date; use YYYY-MM-DD' }, status: :bad_request)
        end
      else
        Date.current - 1
      end

    render json: AiApiLog.daily_summary(date)
  end

  private

  def require_internal_token
    expected = ENV['INTERNAL_API_TOKEN'].to_s
    if expected.blank?
      render json: { error: 'internal API not configured' }, status: :service_unavailable
      return
    end

    provided = request.headers['X-Internal-Token'].to_s
    expected_hash = Digest::SHA256.hexdigest(expected)
    provided_hash = Digest::SHA256.hexdigest(provided)
    unless ActiveSupport::SecurityUtils.fixed_length_secure_compare(expected_hash, provided_hash)
      render json: { error: 'unauthorized' }, status: :unauthorized
      false
    end
  end
end
