# frozen_string_literal: true

module Compliance
  # Highest-common-denominator merge of applicable frameworks into a flat
  # effective_rules hash. Strictest wins per capability. This is intentionally
  # conservative scaffolding — later workflows (B2C VPC, school DPA, clinical
  # BAA) deepen individual rules without changing callers of Profile#effective_rules.
  module FrameworkMerge
    module_function

    def frameworks_for(segment:, jurisdiction_code:)
      list = []
      code = jurisdiction_code.to_s.upcase
      country = code.split('-', 2).first

      case segment.to_s
      when 'school'
        list << 'FERPA' if country == 'US' || country.blank?
        list << 'GDPR' if LingoLinq::Jurisdiction.eu?(country) || country == 'GB'
      when 'clinical'
        list << 'HIPAA' if country == 'US' || country.blank?
        list << 'GDPR' if LingoLinq::Jurisdiction.eu?(country) || country == 'GB'
      else # b2c
        list << 'COPPA' if country == 'US' || country.blank?
        list << 'CCPA' if country == 'US'
        list << 'GDPR' if LingoLinq::Jurisdiction.eu?(country) || country == 'GB'
        list << 'LAW_25' if code == 'CA-QC'
        list << 'PIPEDA' if country == 'CA' && code != 'CA-QC'
      end

      list.uniq
    end

    # @return [Hash] string keys, JSON-safe
    def effective_rules(segment:, jurisdiction_code:, digital_consent_age:)
      frameworks = frameworks_for(segment: segment, jurisdiction_code: jurisdiction_code)
      age = digital_consent_age.to_i

      {
        'digital_consent_age' => age,
        'parental_consent_required_under_age' => age,
        'telemetry_default' => frameworks.include?('GDPR') || frameworks.include?('LAW_25') ? 'opt_in' : 'opt_out_allowed',
        'marketing_default' => segment == 'b2c' ? 'opt_in' : 'off',
        'biometric_consent_separate' => true,
        'school_authorization_allowed' => segment == 'school',
        'contract_gate' => %w[school clinical].include?(segment.to_s) ? 'required' : 'none',
        'frameworks' => frameworks
      }
    end
  end
end
