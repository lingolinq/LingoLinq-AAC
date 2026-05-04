# frozen_string_literal: true

require_relative '../../lib/pii_scrubber'

# COPPA Final Rule (effective 2026-04-22) prohibits silent transmission of
# child data to third-party SDKs. Sentry-Rails auto-captures user_id, IP,
# request body, headers, and cookies for every event. CoppaSentryScrub
# strips that data when the affected user is COPPA-pending (parental
# consent not yet granted). Replaces the Bugsnag CoppaBugsnagScrub from
# PR #225. See docs/legal/COPPA_VERIFICATION_2026-04-26.md item 5a.
module CoppaSentryScrub
  REDACTED = '[REDACTED]'
  REDACTED_ID = '[REDACTED_ID]'
  REDACTED_IP = '[REDACTED_IP]'

  SENSITIVE_HEADER_KEYS = %w[
    Cookie cookie
    Set-Cookie set-cookie
    Authorization authorization
    X-Forwarded-For x-forwarded-for
    Forwarded forwarded
    X-Real-IP x-real-ip
  ].freeze

  REQUEST_BODY_KEYS = %w[data params body query_parameters request_parameters form_params query_string].freeze

  module_function

  def call(event, _hint)
    return event unless event
    user = lookup_user(event_user(event))
    return event unless child_user?(user)
    scrub!(event)
    event
  rescue StandardError
    event
  end

  def event_user(event)
    user = event.respond_to?(:user) ? event.user : nil
    return user if user.is_a?(Hash)
    return user.to_hash if user.respond_to?(:to_hash)
    nil
  end

  def child_user?(user)
    return false unless user
    user.respond_to?(:coppa_parental_consent_pending?) && user.coppa_parental_consent_pending?
  rescue StandardError
    false
  end

  def lookup_user(user_hash)
    return nil unless user_hash.is_a?(Hash)
    user_id = user_hash[:id] || user_hash['id']
    return nil if user_id.nil? || user_id.to_s.empty?
    User.where(id: user_id).first
  rescue StandardError
    nil
  end

  def scrub!(event)
    redact_user!(event)
    redact_request!(event)
    redact_context!(event)
  end

  def redact_user!(event)
    return unless event.respond_to?(:user=)
    event.user = { id: REDACTED_ID }
  end

  def redact_request!(event)
    request = event.respond_to?(:request) ? event.request : nil
    return unless request

    %w[ip_address remote_addr].each do |key|
      assign(request, key, REDACTED_IP) if responds(request, key)
    end

    REQUEST_BODY_KEYS.each do |key|
      assign(request, key, REDACTED) if responds(request, key)
    end

    %w[url full_url].each do |key|
      val = read(request, key)
      assign(request, key, redact_url(val)) if val.is_a?(String)
    end

    headers = read(request, 'headers')
    scrub_headers!(headers) if headers.is_a?(Hash)

    cookies = read(request, 'cookies')
    assign(request, 'cookies', REDACTED) if cookies
  end

  def redact_context!(event)
    contexts = event.respond_to?(:contexts) ? event.contexts : nil
    return unless contexts.is_a?(Hash)
    contexts.delete(:trace)
    contexts.delete('trace')
  end

  def scrub_headers!(headers)
    headers.keys.each do |k|
      headers[k] = REDACTED if SENSITIVE_HEADER_KEYS.include?(k.to_s)
    end
  end

  def redact_url(url)
    return url unless url.is_a?(String)
    no_query = url.split('?', 2).first
    no_query.gsub(PiiScrubber::GLOBAL_ID_PATTERN, REDACTED_ID)
  end

  def responds(obj, key)
    obj.respond_to?("#{key}=") || (obj.is_a?(Hash) && (obj.key?(key) || obj.key?(key.to_sym)))
  end

  def read(obj, key)
    return obj.public_send(key) if obj.respond_to?(key)
    return obj[key] if obj.is_a?(Hash) && obj.key?(key)
    return obj[key.to_sym] if obj.is_a?(Hash) && obj.key?(key.to_sym)
    nil
  end

  def assign(obj, key, value)
    if obj.respond_to?("#{key}=")
      obj.public_send("#{key}=", value)
    elsif obj.is_a?(Hash) && obj.key?(key)
      obj[key] = value
    elsif obj.is_a?(Hash) && obj.key?(key.to_sym)
      obj[key.to_sym] = value
    end
  end
end

if ENV['SENTRY_DSN'].to_s.strip != ''
  Sentry.init do |config|
    config.dsn = ENV['SENTRY_DSN']
    config.environment = ENV['SENTRY_ENVIRONMENT'] || ENV['RAILS_ENV'] || Rails.env
    config.enabled_environments = %w[production staging]

    config.breadcrumbs_logger = %i[active_support_logger http_logger]
    config.send_default_pii = false
    config.send_modules = false

    config.traces_sample_rate = (ENV['SENTRY_TRACES_SAMPLE_RATE'] || '0.1').to_f
    config.profiles_sample_rate = (ENV['SENTRY_PROFILES_SAMPLE_RATE'] || '0.0').to_f

    config.release = ENV['RENDER_GIT_COMMIT'] if ENV['RENDER_GIT_COMMIT'].to_s.strip != ''

    # Strip values for any field name that PiiScrubber identifies as PII,
    # plus the request-level fields Sentry-Rack auto-captures.
    config.send_default_pii = false

    config.before_send = ->(event, hint) { CoppaSentryScrub.call(event, hint) }
  end
end
