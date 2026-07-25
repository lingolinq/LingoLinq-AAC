# frozen_string_literal: true

module Compliance
  # Immutable-ish snapshot of compliance routing for a user or anonymous request.
  # Build via Profile.for(...). to_h is JSON-safe for domain_settings / user API.
  class Profile
    attr_reader :segment, :jurisdiction, :digital_consent_age, :effective_rules,
                :birth_month, :birth_year, :age_band

    def self.for(subject = nil, request: nil, declaration: nil, org: nil,
                 birth_month: nil, birth_year: nil, segment_opts: {})
      user = subject.respond_to?(:settings) ? subject : nil

      jurisdiction = JurisdictionResolver.resolve(
        user: user,
        declaration: declaration || stored_declaration(user),
        org: org,
        request: request
      )

      segment = SegmentResolver.resolve(user, segment_opts.merge(org: org))
      age = DigitalConsentAge.for_code(jurisdiction['code'])

      bm = birth_month || stored_birth(user, 'birth_month')
      by = birth_year || stored_birth(user, 'birth_year')
      band = DigitalConsentAge.classify_age(
        birth_month: bm,
        birth_year: by,
        consent_age: age
      )

      rules = FrameworkMerge.effective_rules(
        segment: segment,
        jurisdiction_code: jurisdiction['code'],
        digital_consent_age: age
      )

      new(
        segment: segment,
        jurisdiction: jurisdiction,
        digital_consent_age: age,
        effective_rules: rules,
        birth_month: bm,
        birth_year: by,
        age_band: band
      )
    end

    def self.stored_declaration(user)
      return nil unless user && user.respond_to?(:settings) && user.settings.is_a?(Hash)

      user.settings.dig('compliance', 'jurisdiction', 'code') ||
        user.settings['country']
    end

    def self.stored_birth(user, key)
      return nil unless user && user.respond_to?(:settings) && user.settings.is_a?(Hash)

      user.settings.dig('compliance', key)
    end
    private_class_method :stored_declaration, :stored_birth

    def initialize(segment:, jurisdiction:, digital_consent_age:, effective_rules:,
                   birth_month: nil, birth_year: nil, age_band: nil)
      @segment = segment
      @jurisdiction = jurisdiction
      @digital_consent_age = digital_consent_age
      @effective_rules = effective_rules
      @birth_month = birth_month
      @birth_year = birth_year
      @age_band = age_band
    end

    def under_digital_consent_age?
      age_band == 'under_threshold'
    end

    def telemetry_allowed_default?
      effective_rules['telemetry_default'] != 'opt_in'
    end

    def to_h
      h = {
        'segment' => segment,
        'jurisdiction' => jurisdiction,
        'digital_consent_age' => digital_consent_age,
        'effective_rules' => effective_rules,
        'frameworks' => effective_rules['frameworks']
      }
      h['birth_month'] = birth_month if birth_month.present?
      h['birth_year'] = birth_year if birth_year.present?
      h['age_band'] = age_band if age_band
      h
    end
  end
end
