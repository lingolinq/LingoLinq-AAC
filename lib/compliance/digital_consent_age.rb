# frozen_string_literal: true

module Compliance
  # Digital age of consent by jurisdiction for parental-consent / VPC gates.
  # Conservative defaults: when a jurisdiction is unknown, returns US COPPA age 13
  # (matches today's signup gate). When a country is EU but the exact Art. 8 age
  # is unlisted, returns the EU maximum of 16 (highest common denominator).
  #
  # Sources (engineering table — counsel should confirm before production use of
  # per-state ages as a legal control):
  #   US COPPA → 13
  #   Quebec Law 25 → 14
  #   UK (post-Brexit) → 13
  #   GDPR Art. 8 member-state ages (commonly published summaries)
  module DigitalConsentAge
    DEFAULT_AGE = 13
    EU_MAX_AGE = 16
    QUEBEC_AGE = 14

    # ISO 3166-1 alpha-2 → age. Only EU members with a documented Art. 8 age
    # below the maximum need an entry; others fall through to EU_MAX_AGE when
    # LingoLinq::Jurisdiction.eu? is true.
    EU_MEMBER_AGES = {
      'AT' => 14, # Austria
      'BE' => 13, # Belgium
      'BG' => 14, # Bulgaria
      'HR' => 16, # Croatia
      'CY' => 14, # Cyprus
      'CZ' => 15, # Czechia
      'DK' => 13, # Denmark
      'EE' => 13, # Estonia
      'FI' => 13, # Finland
      'FR' => 15, # France
      'DE' => 16, # Germany
      'GR' => 15, # Greece
      'HU' => 16, # Hungary
      'IE' => 16, # Ireland
      'IT' => 14, # Italy
      'LV' => 13, # Latvia
      'LT' => 14, # Lithuania
      'LU' => 16, # Luxembourg
      'MT' => 13, # Malta
      'NL' => 16, # Netherlands
      'PL' => 16, # Poland
      'PT' => 13, # Portugal
      'RO' => 16, # Romania
      'SK' => 16, # Slovakia
      'SI' => 15, # Slovenia
      'ES' => 14, # Spain
      'SE' => 13  # Sweden
    }.freeze

    NON_EU_AGES = {
      'US' => 13,
      'GB' => 13,
      'CA' => 13, # federal default; CA-QC overrides below
      'AU' => 13,
      'NZ' => 13
    }.freeze

    module_function

    # @param jurisdiction_code [String, nil] e.g. 'US', 'DE', 'CA-QC'
    # @return [Integer]
    def for_code(jurisdiction_code)
      code = jurisdiction_code.to_s.strip.upcase
      return DEFAULT_AGE if code.empty?

      # Subdivision: CA-QC (Quebec Law 25)
      if code == 'CA-QC' || code.start_with?('CA-QC')
        return QUEBEC_AGE
      end

      country = code.split('-', 2).first

      return NON_EU_AGES[country] if NON_EU_AGES.key?(country)
      return EU_MEMBER_AGES[country] if EU_MEMBER_AGES.key?(country)

      # Unknown EU member (should not happen for EU-27) → HCD EU max
      return EU_MAX_AGE if LingoLinq::Jurisdiction.eu?(country)

      DEFAULT_AGE
    end

    # Age from a user / hash / locale signal (via JurisdictionResolver + for_code).
    def for_signal(signal)
      if signal.is_a?(Hash) && signal['code']
        return for_code(signal['code'])
      end

      code = JurisdictionResolver.normalize_code(signal) ||
             LingoLinq::Jurisdiction.country_code(signal)
      for_code(code)
    end

    # Classify birth month/year against a consent age.
    # Ambiguous birthday month: treat as under threshold until exact day known
    # (same rule as register.js _classifyCommunicatorAge).
    # @return [String] 'under_threshold' | 'over_threshold' | nil if incomplete
    def classify_age(birth_month:, birth_year:, consent_age:, as_of: Time.now.utc)
      month = birth_month.to_i
      year = birth_year.to_i
      age = consent_age.to_i
      return nil if month < 1 || month > 12 || year < 1900 || age < 1

      cutoff_year = as_of.year - age
      cutoff_month = as_of.month
      if year > cutoff_year || (year == cutoff_year && month >= cutoff_month)
        'under_threshold'
      else
        'over_threshold'
      end
    end
  end
end
