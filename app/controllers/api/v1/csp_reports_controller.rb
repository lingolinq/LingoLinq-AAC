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

  # CSP report payloads are tiny (<2 KB in practice); reject anything larger
  # to prevent memory/CPU abuse on this unauthenticated endpoint.
  MAX_REPORT_BYTES = 8_192

  def create
    body = parse_report_body
    violation = extract_violation(body)
    sanitized = sanitize_violation(violation)

    if sentry_available?
      forward_to_sentry(sanitized)
    else
      Rails.logger.warn("[CSP] violation directive=#{sanitized['violated-directive'].inspect} blocked=#{sanitized['blocked-uri'].inspect}")
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
    content_length = request.content_length.to_i
    if content_length > MAX_REPORT_BYTES
      Rails.logger.warn("[CSP] oversized report (#{content_length} bytes), ignoring")
      return {}
    end

    raw = request.body.read(MAX_REPORT_BYTES).to_s
    return {} if raw.blank?

    raw = raw.dup
    raw.force_encoding(Encoding::UTF_8)
    raw = raw.scrub('') unless raw.valid_encoding?

    parsed = JSON.parse(raw)
    parsed.is_a?(Hash) || parsed.is_a?(Array) ? parsed : {}
  rescue JSON::ParserError => e
    Rails.logger.warn("[CSP] malformed report JSON: #{e.message}")
    {}
  end

  # Normalize the report payload into a flat hash regardless of format.
  # report-uri (legacy) posts: {"csp-report" => {...}}
  # Reporting API posts:       [{"type" => "csp-violation", "body" => {...}}, ...]
  # Reporting API uses camelCase keys; legacy uses hyphen-case. Normalize to
  # hyphen-case so the rest of the controller can use a single key set.
  def extract_violation(body)
    raw =
      case body
      when Array
        first = body.find { |r| r.is_a?(Hash) } || {}
        first['body'].is_a?(Hash) ? first['body'] : first
      when Hash
        body['csp-report'].is_a?(Hash) ? body['csp-report'] : body
      else
        {}
      end

    normalize_violation(raw)
  end

  def normalize_violation(violation)
    return {} unless violation.is_a?(Hash)

    v = violation.dup
    # Map Reporting API camelCase keys to legacy hyphen-case equivalents so
    # downstream code only needs to look up one key per field.
    v['violated-directive']  ||= v['violatedDirective']  || v['effectiveDirective'] || v['effective-directive']
    v['effective-directive']  ||= v['effectiveDirective'] || v['violatedDirective']  || v['violated-directive']
    v['blocked-uri']          ||= v['blockedURL']         || v['blockedUri']
    v['document-uri']         ||= v['documentURL']        || v['documentUri']
    v['original-policy']      ||= v['originalPolicy']
    v['status-code']          ||= v['statusCode']
    v
  end

  # Return a copy of the violation hash with full URLs reduced to
  # scheme://host/path (query strings and fragments stripped) to prevent
  # tokens or PII from leaking into logs or the error tracker.
  def sanitize_violation(violation)
    return {} unless violation.is_a?(Hash)

    url_keys = %w[document-uri blocked-uri referrer documentURL blockedURL blockedUri documentUri]
    violation.each_with_object({}) do |(k, v), h|
      h[k] = url_keys.include?(k) ? strip_url_sensitive_parts(v) : v
    end
  end

  def strip_url_sensitive_parts(value)
    return value unless value.is_a?(String) && value =~ /\Ahttps?:/

    uri = URI.parse(value)
    default_port = { 'http' => 80, 'https' => 443 }[uri.scheme]
    port = uri.port == default_port ? nil : uri.port
    URI::Generic.build(scheme: uri.scheme, host: uri.host, port: port, path: uri.path).to_s
  rescue URI::InvalidURIError
    # Return origin only (scheme + host) as a safe fallback; strip query and fragment
    value.split(/[?#]/).first
  end

  def sentry_available?
    defined?(Sentry) && Sentry.respond_to?(:capture_event)
  end

  def forward_to_sentry(violation)
    directive   = violation['violated-directive'] || violation['effective-directive'] || 'unknown'
    blocked_uri = violation['blocked-uri']

    event_data = {
      message: "CSP violation: #{directive}",
      level: 'warning',
      logger: 'csp',
      tags: {
        directive:   directive,
        blocked_uri: blocked_uri,
        disposition: violation['disposition'] || 'report'
      },
      extra: {
        csp_report: violation
        # raw_payload, referer, and user_agent are intentionally omitted to
        # avoid forwarding full URLs with query params or PII to the error
        # tracker. The sanitized violation hash above is sufficient for triage.
      }
    }
    Sentry.capture_event(event_data)
  rescue => e
    Rails.logger.warn("[CSP] Sentry forward failed, falling back to logger: #{e.class}: #{e.message}")
    Rails.logger.warn("[CSP] violation directive=#{violation['violated-directive'].inspect} blocked=#{violation['blocked-uri'].inspect}")
  end
end
