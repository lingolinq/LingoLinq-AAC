# frozen_string_literal: true

# EU AI Act Article 50 jurisdiction resolution, used ONLY to gate the visible
# Article 50(1) disclosure modal. It must NOT be used to gate Article 50(2)
# machine-readable marking, which is unconditional (an output property that reaches
# the EU extraterritorially under Art. 2(1)(c)).
#
# Fail-safe by design: under-disclosure is the violating direction, so ambiguity
# resolves to "disclosure required". An authoritative non-EU signal (an explicit
# user setting or the org/DPA record) is the ONLY thing that suppresses the modal.
# Locale is treated as an additive hint that can ADD EU but can never EXCLUDE a user.
module EuJurisdiction
  # ISO 3166-1 alpha-2 codes for the 27 EU member states (post-Brexit; UK excluded).
  EU_MEMBER_STATES = %w[
    AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE
  ].freeze

  # Languages whose use is overwhelmingly an EU member state, so a bare language tag
  # (no region) is a reasonable EU hint. Broad languages that span non-EU regions
  # (en, es, pt) are intentionally EXCLUDED here; for them, only an explicit EU region
  # suffix (e.g. en-IE, pt-PT) yields EU, otherwise they fall through to :unknown
  # (which still requires disclosure, fail-safe).
  EU_PRIMARY_LANGUAGES = %w[
    bg hr cs da et fi el hu lt lv mt nl pl ro sk sl sv de fr it ga
  ].freeze

  # Recognized non-EU jurisdiction codes that are authoritative enough to SUPPRESS the
  # disclosure. Intentionally conservative: a code that is neither an EU member nor in
  # this set falls through to :unknown (disclose), so an unfamiliar or malformed value
  # (e.g. "XX", "ZZ", a full country name) can never suppress the modal. Fail-safe by
  # construction; expand this list as real non-EU jurisdictions are onboarded.
  RECOGNIZED_NON_EU = %w[US GB CA AU NZ CH NO IS LI JP].freeze

  module_function

  # Returns :eu, :non_eu, or :unknown.
  def status(user)
    return :unknown if user.nil?

    explicit = explicit_status(user)
    return explicit if explicit

    return :eu if locale_is_eu?(user_locale(user))

    :unknown
  end

  # The disclosure gate. Fail-safe: only an authoritative :non_eu suppresses the modal;
  # :eu and :unknown both require disclosure.
  def disclosure_required?(user)
    status(user) != :non_eu
  end

  def eu?(user)
    status(user) == :eu
  end

  # --- internals ---

  # Authoritative signals from both the org/DPA record AND the explicit user setting.
  # EU-inclusive + fail-safe: if EITHER signal says EU, resolve :eu (a personal user
  # pref can never override an EU org to suppress a district-level obligation, and a
  # user can voluntarily ADD EU). Resolve :non_eu only when every authoritative code is
  # a RECOGNIZED non-EU code. Anything else (mixed, unrecognized, garbage) returns nil
  # and falls through to locale / :unknown (disclose). Locale is excluded here.
  def explicit_status(user)
    codes = [org_jurisdiction(user), user_jurisdiction(user)].map { |raw| normalized_code(raw) }.compact
    return nil if codes.empty?
    return :eu if codes.any? { |code| eu_code?(code) }
    return :non_eu if codes.all? { |code| RECOGNIZED_NON_EU.include?(code) }

    nil
  end

  # Normalizes a raw jurisdiction value to 'EU' or a clean ISO 3166-1 alpha-2 code,
  # or nil if it is blank / not a clean code (e.g. a full country name). A clean but
  # unrecognized 2-letter code (XX) normalizes through here but is NOT in EU_MEMBER_STATES
  # or RECOGNIZED_NON_EU, so explicit_status returns nil for it (fail-safe disclose).
  def normalized_code(raw)
    return nil if blank_value?(raw)

    code = raw.to_s.strip.upcase
    return code if code == 'EU' || code.match?(/\A[A-Z]{2}\z/)

    nil
  end

  def eu_code?(code)
    code == 'EU' || EU_MEMBER_STATES.include?(code)
  end

  def locale_is_eu?(locale)
    return false if blank_value?(locale)

    lang, region = locale.to_s.strip.split(/[-_]/, 2)
    return true if region && EU_MEMBER_STATES.include?(region.strip.upcase)
    return true if (region.nil? || region.strip.empty?) && EU_PRIMARY_LANGUAGES.include?(lang.to_s.downcase)

    false
  end

  def user_jurisdiction(user)
    prefs = user_prefs(user)
    prefs && (prefs['jurisdiction'] || prefs['country'])
  end

  def org_jurisdiction(user)
    org = user.respond_to?(:managing_organization) ? user.managing_organization : nil
    return nil unless org.respond_to?(:settings) && org.settings.is_a?(Hash)

    org.settings['jurisdiction'] || org.settings['country']
  end

  def user_locale(user)
    prefs = user_prefs(user)
    prefs && prefs['locale']
  end

  def user_prefs(user)
    return nil unless user.respond_to?(:settings) && user.settings.is_a?(Hash)

    user.settings['preferences']
  end

  def blank_value?(value)
    value.nil? || value.to_s.strip.empty?
  end
end
