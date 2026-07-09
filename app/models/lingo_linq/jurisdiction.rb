module LingoLinq
  # Small, dependency-free jurisdiction primitive.
  #
  # Determines whether a registration/account context is in the EU (for GDPR
  # purposes, e.g. the Art. 8 digital-consent age) from locale/region/country
  # signals that ALREADY exist on a user or request. It deliberately does NOT
  # perform IP geolocation and pulls in no external gem: it normalizes an
  # explicit country code or a locale's region subtag to an ISO 3166-1 alpha-2
  # country and checks membership in the EU set.
  #
  # Accepted signals (see .country_code): a String (locale like 'pl-PL' /
  # 'pl_PL', a country code like 'PL', or an Accept-Language header value like
  # 'pl-PL,pl;q=0.9'), a User-like object (reads settings country/region/
  # locale), a Hash of { country:/region:/locale: }, or nil.
  #
  # Ambiguity policy: an EXPLICIT country/region field (a Hash 'country'/
  # 'region' key, or the same on a user's settings) is trusted case-insensitive
  # as a country. A LOCALE-derived value only yields a country when it carries a
  # region subtag ('pl-PL' -> PL) or is an uppercase 2-letter country token
  # ('PL'); a bare lowercase language subtag ('pl', 'es', 'fr') is treated as
  # UNKNOWN (nil), because language alone is ambiguous across EU and non-EU
  # countries ('es' -> ES/MX, 'pt' -> PT/BR, 'fr' -> FR/CA). Returning nil there
  # makes .eu? false, which preserves today's (non-EU, age-13) behavior. That is
  # the safe default: over-classifying non-EU users as EU would change their
  # flow, which must stay exactly as today.
  module Jurisdiction
    # EU-27 member states (ISO 3166-1 alpha-2). GDPR Art. 8 lets each member
    # state set its digital-consent age between 13 and 16; the consumer of this
    # primitive applies the EU maximum (16). EEA-but-not-EU states (IS, LI, NO)
    # and the UK are intentionally excluded here; add them when their own
    # consent regimes are in scope.
    EU_COUNTRY_CODES = %w[
      AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK
      SI ES SE
    ].to_set.freeze

    # Normalize a signal to an ISO 3166-1 alpha-2 country code (upcased String)
    # when one can be determined, otherwise nil. Returns non-EU codes too (e.g.
    # 'US') so callers can reason about non-EU countries.
    def self.country_code(signal)
      return nil if signal.nil?

      if signal.respond_to?(:settings)
        return country_from_user(signal)
      end

      if signal.is_a?(Hash)
        h = signal.transform_keys { |k| k.to_s }
        explicit = trusted_country(h['country']) || trusted_country(h['region'])
        return explicit if explicit
        return country_from_locale(h['locale'] || h['default_locale'])
      end

      country_from_locale(signal.to_s)
    end

    # True when the signal resolves to an EU-27 country.
    def self.eu?(signal)
      code = country_code(signal)
      !code.nil? && EU_COUNTRY_CODES.include?(code)
    end

    # An explicit country/region field: trusted as a country case-insensitively.
    def self.trusted_country(val)
      return nil if val.nil?
      token = val.to_s.strip
      return nil unless token.match?(/\A[A-Za-z]{2}\z/)
      token.upcase
    end
    private_class_method :trusted_country

    # A locale/Accept-Language string: only yields a country from a region
    # subtag or an uppercase 2-letter country token (see ambiguity policy).
    def self.country_from_locale(str)
      s = str.to_s.strip
      return nil if s.empty?
      # Accept-Language / multi-tag: take the first tag only.
      s = s.split(/[,;\s]/).first.to_s.strip
      return nil if s.empty?
      # Uppercase 2-letter country token ('PL', 'US').
      return s.upcase if s.match?(/\A[A-Z]{2}\z/)
      # Locale with a region subtag: 'pl-PL', 'de_DE', 'en-US'.
      region = s.split(/[-_]/)[1]
      return region.upcase if region && region.match?(/\A[A-Za-z]{2}\z/)
      # Bare lowercase language subtag ('pl', 'es'): ambiguous -> unknown.
      nil
    end
    private_class_method :country_from_locale

    # Best country signal from a User-like object, using only fields that
    # already exist on the settings blob. No new columns.
    def self.country_from_user(user)
      s = user.settings || {}
      prefs = s['preferences'] || {}
      explicit = trusted_country(s['country']) || trusted_country(prefs['country']) ||
                 trusted_country(s['region']) || trusted_country(prefs['region'])
      return explicit if explicit
      country_from_locale(prefs['locale'] || s['locale'])
    rescue StandardError
      nil
    end
    private_class_method :country_from_user
  end
end
