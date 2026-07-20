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
  #
  # Deliberately EXCLUDES the EEA/EFTA states NO/IS/LI: the AI Act is marked "EEA
  # relevant" and is under scrutiny for EEA incorporation (as of 2026-06), after which
  # Art. 50 would bind them with no code change on our side. Leaving them OUT means an
  # EEA org falls through to :unknown (disclose) today, which is the safe direction and
  # removes the time-bomb. Switzerland (CH) is non-EEA and stays a recognized non-EU
  # suppressor. Revisit NO/IS/LI on EEA incorporation.
  RECOGNIZED_NON_EU = %w[US GB CA AU NZ CH JP].freeze

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

  # EU AI Act Article 50 RETENTION stamp for AiApiLog.jurisdiction. Deliberately the
  # OPPOSITE fail-safe direction from disclosure_required?: only a CONFIRMED :eu user is
  # stamped 'EU', because this column drives AiApiLog.purge_old_eu_logs! (5yr delete) and
  # those rows double as a HIPAA six-year audit trail (45 CFR 164.316(b)(2),
  # ai_api_log.rb:236-239). Stamping an unsure user 'EU' would delete HIPAA-covered
  # records a year INSIDE the six-year floor, so both :non_eu AND :unknown map to nil.
  # :unknown users still get the disclosure MODAL (disclosure_required? stays true for
  # them); they simply are not marked for early deletion. D-01 (load-bearing).
  #
  # Do NOT reference disclosure_required? here: the disclosure gate and the retention gate
  # are intentionally decoupled and fail safe in OPPOSITE directions.
  #
  # ASSUMPTION the resolver leans on (adversary L1): a confirmed :eu user who is ALSO
  # HIPAA-covered would, once purge_old_eu_logs! is scheduled, be deleted at 5yr -- inside
  # the six-year floor -- because this resolver stamps them 'EU'. Phase 4 does NOT resolve
  # that; the mutual-exclusivity (EU-school vs US-hospital) is an ASSUMPTION not enforced
  # here. Phase 5 RET-01's tiered purge owns the carve-out (it excludes HIPAA-covered rows
  # before deleting EU rows; see CONTEXT Deferred Ideas).
  def retention_stamp(user)
    status(user) == :eu ? 'EU' : nil
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

    parts = locale.to_s.strip.split(/[-_]/)
    lang = parts.first.to_s.downcase
    subtags = parts[1..] || []

    # Any subtag that is an EU member region wins (handles script subtags, e.g. de-Latn-DE,
    # and variants, e.g. de-AT-1996), not just the second position.
    return true if subtags.any? { |p| EU_MEMBER_STATES.include?(p.to_s.upcase) }

    # A bare EU-primary language (no region/M.49 subtag at all) is an EU hint.
    has_region_subtag = subtags.any? { |p| p.match?(/\A[A-Za-z]{2}\z/) || p.match?(/\A\d{3}\z/) }
    return true if !has_region_subtag && EU_PRIMARY_LANGUAGES.include?(lang)

    false
  end

  def user_jurisdiction(user)
    prefs = user_prefs(user)
    prefs && (prefs['jurisdiction'] || prefs['country'])
  end

  def org_jurisdiction(user)
    return nil unless user.respond_to?(:managing_organization)

    # managing_organization hits the DB (Organization.find_by_global_id); resolve a
    # transient failure to "no signal" so status falls through to :unknown (disclose),
    # fail-safe by construction rather than letting an exception decide the gate.
    org = begin
      user.managing_organization
    rescue StandardError
      nil
    end
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
