require_relative '../../lib/pii_scrubber'
require 'bugsnag'

# COPPA Final Rule (effective 2026-04-22) prohibits silent transmission of
# child data to third-party SDKs. Bugsnag-Rack auto-captures user_id, IP,
# request body, headers, and cookies for every error. This module strips
# that data when the affected user is COPPA-pending (parental consent not
# yet granted). See docs/legal/COPPA_VERIFICATION_2026-04-26.md item 5a.
module CoppaBugsnagScrub
  REDACTED = '[REDACTED]'.freeze
  REDACTED_ID = '[REDACTED_ID]'.freeze
  REDACTED_IP = '[REDACTED_IP]'.freeze

  SENSITIVE_HEADER_KEYS = %w[
    Cookie cookie
    Set-Cookie set-cookie
    Authorization authorization
    X-Forwarded-For x-forwarded-for
    Forwarded forwarded
    X-Real-IP x-real-ip
  ].freeze

  REQUEST_IP_KEYS = %i[clientIp client_ip remoteAddr remote_addr].freeze
  REQUEST_BODY_KEYS = %i[params body query_parameters request_parameters form_params].freeze

  module_function

  def call(report)
    return unless report
    user = lookup_user(report.respond_to?(:user) ? report.user : nil)
    return unless child_user?(user)
    scrub!(report)
  rescue StandardError
    # Never let a scrub failure raise out of bugsnag delivery.
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

  def scrub!(report)
    report.user = {} if report.respond_to?(:user=)
    if report.respond_to?(:meta_data) && report.meta_data.is_a?(Hash)
      scrub_meta_data!(report.meta_data)
    end
    if report.respond_to?(:context=) && report.respond_to?(:context)
      scrubbed_ctx = scrub_context(report.context)
      report.context = scrubbed_ctx unless scrubbed_ctx.equal?(report.context)
    end
  end

  def scrub_meta_data!(meta)
    request = fetch_tab(meta, :request)
    scrub_request!(request) if request.is_a?(Hash)

    %i[headers cookies session].each do |tab_name|
      tab = fetch_tab(meta, tab_name)
      scrub_headers!(tab) if tab.is_a?(Hash)
    end
  end

  def scrub_request!(request)
    REQUEST_IP_KEYS.each { |k| set_if_present(request, k, REDACTED_IP) }
    REQUEST_BODY_KEYS.each { |k| set_if_present(request, k, REDACTED) }
    set_if_present(request, :referer, REDACTED)

    %i[url path].each do |key|
      val = fetch(request, key)
      next unless val.is_a?(String)
      assign(request, key, redact_url(val))
    end
  end

  def scrub_headers!(headers)
    headers.keys.each do |k|
      headers[k] = REDACTED if SENSITIVE_HEADER_KEYS.include?(k.to_s)
    end
  end

  def scrub_context(ctx)
    return ctx unless ctx.is_a?(String)
    return REDACTED if ctx.include?('@')
    return REDACTED if ctx.match?(PiiScrubber::GLOBAL_ID_PATTERN)
    ctx
  end

  def redact_url(url)
    return url unless url.is_a?(String)
    no_query = url.split('?', 2).first
    no_query.gsub(PiiScrubber::GLOBAL_ID_PATTERN, REDACTED_ID)
  end

  def fetch_tab(meta, name)
    meta[name] || meta[name.to_s]
  end

  def fetch(hash, key)
    hash[key] || hash[key.to_s]
  end

  def set_if_present(hash, key, value)
    if hash.key?(key)
      hash[key] = value
    elsif hash.key?(key.to_s)
      hash[key.to_s] = value
    end
  end

  def assign(hash, key, value)
    if hash.key?(key)
      hash[key] = value
    elsif hash.key?(key.to_s)
      hash[key.to_s] = value
    end
  end
end

Bugsnag.configure do |config|
  config.meta_data_filters += PiiScrubber::IDENTITY_STRING_KEYS + ['User-Agent', 'X-Device-Id', 'X-Forwarded-For', 'clientIp', 'client_ip', 'params', 'request.clientIp', 'request.params']
  config.add_on_error(proc { |report| CoppaBugsnagScrub.call(report) })
end
