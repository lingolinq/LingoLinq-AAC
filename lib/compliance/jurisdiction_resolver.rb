# frozen_string_literal: true

module Compliance
  # Hybrid jurisdiction resolution for the Compliance Kernel.
  # Precedence (first authoritative wins):
  #   1. Explicit declaration (signup param / settings.compliance.jurisdiction)
  #   2. Org settings.jurisdiction / settings.country
  #   3. User settings.country / preferences.jurisdiction / preferences.country
  #   4. Locale / Accept-Language (via LingoLinq::Jurisdiction)
  # IP geolocation is intentionally deferred (tracked follow-up).
  #
  # Returns a Hash suitable for settings['compliance']['jurisdiction']:
  #   { 'code' => 'US'|'DE'|'CA-QC'|nil, 'source' => 'declaration'|'org'|..., 'resolved_at' => iso8601 }
  module JurisdictionResolver
    module_function

    def resolve(user: nil, declaration: nil, org: nil, locale: nil, request: nil)
      resolved_at = Time.now.utc.iso8601

      if (code = normalize_code(declaration))
        return result(code, 'declaration', resolved_at)
      end

      if user && user.respond_to?(:settings) && user.settings.is_a?(Hash)
        stored = user.settings.dig('compliance', 'jurisdiction')
        if stored.is_a?(Hash) && (code = normalize_code(stored['code']))
          return result(code, stored['source'].presence || 'stored', resolved_at)
        end
      end

      org ||= org_for(user)
      if org && org.respond_to?(:settings) && org.settings.is_a?(Hash)
        if (code = normalize_code(org.settings['jurisdiction'] || org.settings['country']))
          return result(code, 'org', resolved_at)
        end
      end

      if user
        code = LingoLinq::Jurisdiction.country_code(user)
        return result(code, 'user', resolved_at) if code
      end

      locale_signal = locale.presence
      locale_signal ||= request_locale(request) if request
      if locale_signal
        code = LingoLinq::Jurisdiction.country_code(locale_signal)
        return result(code, 'locale', resolved_at) if code
      end

      result(nil, 'unknown', resolved_at)
    end

    # Accepts ISO alpha-2 ('US'), subdivision ('CA-QC'), or bare locale-ish strings
    # that LingoLinq::Jurisdiction can parse to a country.
    def normalize_code(raw)
      return nil if raw.nil?

      s = raw.to_s.strip.upcase
      return nil if s.empty?

      # Subdivision form: CA-QC (Quebec Law 25)
      if s.match?(/\A[A-Z]{2}-[A-Z0-9]{1,3}\z/)
        return s
      end

      # Explicit ISO country
      trusted = LingoLinq::Jurisdiction.trusted_country(s)
      return trusted if trusted

      # Locale / Accept-Language
      LingoLinq::Jurisdiction.country_code(raw)
    end

    def result(code, source, resolved_at)
      {
        'code' => code,
        'source' => source,
        'resolved_at' => resolved_at
      }
    end

    def org_for(user)
      return nil unless user && user.respond_to?(:managing_organization)

      begin
        user.managing_organization
      rescue StandardError
        nil
      end
    end

    def request_locale(request)
      return nil unless request

      if request.respond_to?(:params) && request.params[:locale].present?
        return request.params[:locale]
      end
      if request.respond_to?(:headers)
        return request.headers['Accept-Language']
      end

      nil
    end
    private_class_method :org_for, :request_locale
  end
end
