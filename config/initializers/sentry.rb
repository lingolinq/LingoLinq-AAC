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

  # Query-string keys stripped from breadcrumb URLs for ALL users (not just
  # COPPA-pending). Mirrors filter_parameter_logging plus a few Sentry-specific
  # sources of leakage (email in subscribe links, support reset tokens, etc).
  SENSITIVE_QUERY_KEYS = %w[
    access_token token api_key apikey password secret secret_key auth
    bearer email reset_token confirmation_token tmp_token
  ].freeze

  REQUEST_STORE_KEY = :coppa_sentry_user

  # Sentinel from lookup_user when resolution raises (DB timeout, etc).
  # Distinct from nil (anonymous / no usable user): nil stays non-child;
  # LOOKUP_FAILED is fail-closed so #call scrubs and TRANSACTION_FILTER drops.
  LOOKUP_FAILED = Object.new.freeze

  module_function

  def stash_request_user(user)
    return unless user
    return unless defined?(RequestStore)
    RequestStore.store[REQUEST_STORE_KEY] = user
  rescue StandardError
    nil
  end

  # Top-level before_send hook. Drops ActiveSupport::Cache::* events
  # (noise; see sentry-ruby#1765), then falls through to the COPPA
  # scrubber for everything else. Set keep_cache_error: true on the
  # active Sentry scope (Sentry.with_scope { |scope| scope.set_tags(keep_cache_error: true) })
  # to force a specific cache error through this filter (e.g. when actively
  # debugging a cache outage). Scope tags are merged into event.tags before
  # before_send runs.
  def before_send_event(event, hint)
    return nil if drop_cache_errors?(event)
    call(event, hint)
  end

  def drop_cache_errors?(event)
    return false unless event.respond_to?(:exception) && event.exception
    return false if keep_cache_error_tag?(event)
    first_exception_type(event).to_s.start_with?('ActiveSupport::Cache::')
  end

  # L1 hardening: the docs at the top of #before_send_event read
  #   Sentry.with_scope { |scope| scope.set_tags(keep_cache_error: true) }
  # but Sentry's set_tags happily accepts string-valued tags too, and
  # some callers stringify on their own. Coerce the value so any of
  # true / 'true' / 'True' (with either key flavor) trips the escape hatch.
  # Check symbol and string keys independently — do NOT join with `||` first,
  # or a truthy non-true symbol value (e.g. 'false', 'yes') will shadow a
  # string-key true/'true' and miss the escape hatch.
  def keep_cache_error_tag?(event)
    return false unless event.respond_to?(:tags) && event.tags
    tags = event.tags
    keep_cache_error_value?(tags[:keep_cache_error]) ||
      keep_cache_error_value?(tags['keep_cache_error'])
  end

  def keep_cache_error_value?(raw)
    raw == true || raw.to_s.casecmp('true').zero?
  end

  # Sentry::Event#exception returns a Sentry::ExceptionInterface whose
  # 'values' is an Array of Sentry::SingleExceptionInterface. We poke at
  # the shape defensively so test doubles, partial events, or future SDK
  # changes can't crash before_send.
  def first_exception_type(event)
    return nil unless event.exception.respond_to?(:values)
    event.exception.values.first&.type
  rescue StandardError
    nil
  end

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

  # Fail closed for COPPA: if coppa_parental_consent_pending? raises
  # (corrupt settings blob, decryption failure), treat the user as a child
  # and scrub. Better to scrub an adult's event on a broken record than to
  # leak a child's on one. LOOKUP_FAILED is the same fail-closed signal for
  # when User resolution itself raises (see lookup_user).
  #
  # nil user still returns false: an anonymous / unauthenticated request is
  # not a known child, and scrubbing all anonymous traffic would blind us to
  # the most common failure modes (login, SAML, public board pages). Only
  # the raising / lookup-failed paths are fail-closed.
  def child_user?(user)
    return false if user.nil?
    return true if user.equal?(LOOKUP_FAILED)
    user.respond_to?(:coppa_parental_consent_pending?) && user.coppa_parental_consent_pending?
  rescue StandardError
    true
  end

  # Resolve the User for the active request so the COPPA branch can decide
  # whether to scrub. Sentry's user_hash[:id] is the SHA-512 hex of the
  # request IP (set in ApplicationController#set_sentry_user for grouping)
  # and is NOT a database id, so a User.where(id: hex) lookup never matches.
  # Read the actual user reference stashed via RequestStore in
  # set_sentry_user; fall back to event.user[:id] only if it is numeric
  # (kept for callers that intentionally set a real id, e.g. background
  # jobs using Sentry.with_scope).
  #
  # On raise (e.g. User query timeout), return LOOKUP_FAILED — not nil —
  # so callers can fail closed. Returning nil here would make child_user?
  # treat the failure as anonymous and ship/scrub-skip the event.
  def lookup_user(user_hash)
    stored = current_request_user
    return stored if stored
    return nil unless user_hash.is_a?(Hash)
    user_id = user_hash[:id] || user_hash['id']
    return nil if user_id.nil? || user_id.to_s.empty?
    return nil unless user_id.is_a?(Integer) || user_id.to_s.match?(/\A\d+\z/)
    User.where(id: user_id).first
  rescue StandardError
    LOOKUP_FAILED
  end

  def current_request_user
    return nil unless defined?(RequestStore)
    RequestStore.store[REQUEST_STORE_KEY]
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

  # Scrub breadcrumbs for ALL users, regardless of COPPA status. Targets the
  # outbound HTTP breadcrumbs Sentry-Rails auto-captures via http_logger, where
  # URLs frequently carry access_token, reset_token, etc.
  # This complements (does NOT replace) the COPPA branch in #call which fully
  # nukes the event for under-13 users.
  def scrub_breadcrumb(breadcrumb)
    return breadcrumb unless breadcrumb
    scrub_breadcrumb_data!(breadcrumb)
    scrub_breadcrumb_message!(breadcrumb)
    breadcrumb
  rescue StandardError
    breadcrumb
  end

  def scrub_breadcrumb_data!(breadcrumb)
    data = breadcrumb.respond_to?(:data) ? breadcrumb.data : nil
    return unless data.is_a?(Hash)
    %w[url full_url].each do |k|
      val = data[k] || data[k.to_sym]
      next unless val.is_a?(String)
      cleaned = strip_sensitive_query(val)
      assign(data, k, cleaned)
    end
  end

  def scrub_breadcrumb_message!(breadcrumb)
    return unless breadcrumb.respond_to?(:message=)
    msg = breadcrumb.respond_to?(:message) ? breadcrumb.message : nil
    return unless msg.is_a?(String)
    breadcrumb.message = strip_sensitive_query(msg)
  end

  SENSITIVE_QUERY_PATTERN = /\b(#{Regexp.union(SENSITIVE_QUERY_KEYS).source})=([^&\s"']+)/i.freeze

  def strip_sensitive_query(str)
    return str unless str.is_a?(String) && str.include?('=')
    str.gsub(SENSITIVE_QUERY_PATTERN) { "#{Regexp.last_match(1)}=#{REDACTED}" }
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

  # Transaction-event guard. sentry-ruby's `before_send` callback only fires
  # for ErrorEvent; TransactionEvent (performance traces) routes through
  # `before_send_transaction`. Without this filter, ~SENTRY_TRACES_SAMPLE_RATE
  # of every COPPA-pending child's traces would ship to Sentry carrying:
  #   - event.user.id = SHA512(remote_ip) (a stable per-IP child fingerprint)
  #   - event.request.url containing the child's global_id in path segments
  #   - span descriptions and trace contexts
  # CoppaSentryScrub#scrub! could mutate request/user/contexts in place, but
  # TransactionEvent ALSO carries the transaction name and span descriptions
  # which the existing scrubber does not touch. Simpler+safer: drop the entire
  # transaction event for COPPA-pending users. Adults keep full traces.
  # Fail closed for COPPA (pairs with child_user? above): if the inner lookup
  # chain raises (Sentry SDK regression, RequestStore gone) OR lookup_user
  # returns LOOKUP_FAILED (User query timeout), drop the transaction event
  # rather than ship a potentially-child trace carrying URL global_ids and a
  # stable per-IP fingerprint. Adults lose performance visibility only on
  # these rare exception paths.
  TRANSACTION_FILTER = lambda do |event, _hint|
    user = CoppaSentryScrub.lookup_user(CoppaSentryScrub.event_user(event))
    CoppaSentryScrub.child_user?(user) ? nil : event
  rescue StandardError
    nil
  end
end

# Per-transaction sampling decision invoked by Sentry on every transaction
# start. Extracted from the Sentry.init block so it can be unit-tested
# without booting the SDK (Sentry.init only runs when SENTRY_DSN is set,
# which is never the case in the test environment).
module SentryTracesSampler
  # Matches the no-value paths we never want to spend a trace budget on.
  # The only health endpoint defined in routes.rb is /api/v1/health
  # (session#health), and Render hits it on every probe. Anchor at \A/\z
  # so partial matches like /api/v1/health-check do not fall under the drop.
  # /assets/ is anchored at the start only because the asset pipeline emits
  # arbitrary suffixes.
  IGNORED_TRANSACTION_PATTERN = %r{\A/api/v1/health\z|\A/assets/}

  module_function

  def call(sampling_context)
    return 0.0 if ignored_transaction?(sampling_context)
    return 1.0 if sampling_context[:parent_sampled]
    nil
  end

  def ignored_transaction?(sampling_context)
    transaction_name = sampling_context[:transaction_context]&.[](:name)
    path_info = sampling_context.dig(:env, 'PATH_INFO')
    [transaction_name, path_info].compact.any? do |path|
      path.is_a?(String) && path.match?(IGNORED_TRANSACTION_PATTERN)
    end
  end

  # MUST be a Proc, not a Method. sentry-ruby 6.5 checks
  # `traces_sampler.is_a?(Proc)` (lib/sentry/transaction.rb:144) before
  # invoking. A Method object silently fails the gate and the sampler is
  # never called. Specs assert SentryTracesSampler::PROC.is_a?(Proc) so a
  # future revert to `.method(:call)` breaks CI.
  PROC = ->(ctx) { call(ctx) }
end

# Shared Sentry.init hook wiring. Extracted so specs can assert the Proc
# contract without booting the SDK against a live DSN.
module SentryInitializer
  module_function

  def configure!(config)
    config.breadcrumbs_logger = %i[http_logger]
    config.send_default_pii = false
    config.send_modules = false

    config.traces_sample_rate = (ENV['SENTRY_TRACES_SAMPLE_RATE'] || '0.05').to_f
    config.profiles_sample_rate = (ENV['SENTRY_PROFILES_SAMPLE_RATE'] || '0.0').to_f
    config.traces_sampler = SentryTracesSampler::PROC

    config.before_send = ->(event, hint) { CoppaSentryScrub.before_send_event(event, hint) }
    config.before_send_transaction = CoppaSentryScrub::TRANSACTION_FILTER
    config.before_breadcrumb = ->(breadcrumb, _hint) { CoppaSentryScrub.scrub_breadcrumb(breadcrumb) }
  end
end

if ENV['SENTRY_DSN'].to_s.strip != ''
  Sentry.init do |config|
    config.dsn = ENV['SENTRY_DSN']
    config.environment = ENV['SENTRY_ENVIRONMENT'] || ENV['RAILS_ENV'] || Rails.env
    config.enabled_environments = %w[production staging]
    config.release = ENV['RENDER_GIT_COMMIT'] if ENV['RENDER_GIT_COMMIT'].to_s.strip != ''
    SentryInitializer.configure!(config)
  end
end
