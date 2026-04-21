# frozen_string_literal: true

# Receives browser-generated Content-Security-Policy violation reports.
#
# Wired from config/initializers/content_security_policy.rb via
# policy.report_uri '/api/v1/csp-reports'.
#
# Content types the browser may send:
#   - application/csp-report          (legacy, report-uri directive)
#   - application/reports+json        (Reporting API, report-to directive)
#
# Both are parsed leniently; a malformed body is logged but still returns 204
# so browsers do not retry or spam the endpoint.
#
# Forwarding:
#   - If the Sentry Ruby SDK is loaded (constant Sentry is defined and
#     responds to :capture_event), the violation is sent as a Sentry event
#     with the report body attached as context.
#   - Otherwise, the violation is emitted via Rails.logger.warn so it still
#     lands in the centralized log stream for triage.
class Api::V1::CspReportsController < ApplicationController
  # Browsers post CSP reports without credentials or a CSRF token; the base
  # controller already uses protect_from_forgery with: :null_session, so this
  # works, but we make the intent explicit.
  skip_before_action :verify_authenticity_token, raise: false
  skip_before_action :check_api_token, raise: false

  def create
    body = parse_report_body
    violation = extract_violation(body)

    if sentry_available?
      forward_to_sentry(violation, body)
    else
      Rails.logger.warn("[CSP] violation #{violation.to_json}")
    end

    head :no_content
  rescue => e
    # Never let report ingestion raise: a noisy endpoint is worse than a
    # silent one. Log and swallow.
    Rails.logger.warn("[CSP] report ingest error: #{e.class}: #{e.message}")
    head :no_content
  end

  private

  def parse_report_body
    raw = request.body.read
    return {} if raw.blank?

    parsed = JSON.parse(raw)
    parsed.is_a?(Hash) || parsed.is_a?(Array) ? parsed : {}
  rescue JSON::ParserError
    {}
  end

  # Normalize the report payload into a flat hash regardless of format.
  # report-uri (legacy) posts: {"csp-report" => {...}}
  # Reporting API posts:       [{"type" => "csp-violation", "body" => {...}}, ...]
  def extract_violation(body)
    case body
    when Array
      first = body.find { |r| r.is_a?(Hash) } || {}
      first['body'].is_a?(Hash) ? first['body'] : first
    when Hash
      body['csp-report'].is_a?(Hash) ? body['csp-report'] : body
    else
      {}
    end
  end

  def sentry_available?
    defined?(Sentry) && Sentry.respond_to?(:capture_event)
  end

  def forward_to_sentry(violation, raw_body)
    event_data = {
      message: "CSP violation: #{violation['violated-directive'] || violation['effective-directive'] || 'unknown'}",
      level: 'warning',
      logger: 'csp',
      tags: {
        directive: violation['violated-directive'] || violation['effective-directive'],
        blocked_uri: violation['blocked-uri'],
        disposition: violation['disposition'] || 'report'
      },
      extra: {
        csp_report: violation,
        raw_payload: raw_body,
        user_agent: request.user_agent,
        referer: request.referer
      }
    }
    Sentry.capture_event(event_data)
  rescue => e
    Rails.logger.warn("[CSP] Sentry forward failed, falling back to logger: #{e.class}: #{e.message}")
    Rails.logger.warn("[CSP] violation #{violation.to_json}")
  end
end
