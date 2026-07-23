# Serves the versioned AI data-sharing disclosure (VPC Phase 2) AND, via a
# version-prefix branch, the sibling EU AI Act Article 50(1) transparency
# disclosure (VPC Phase 3, A50-DISC-01). Plain HTML, no authentication
# required to read either disclosure: a parent needs to be able to open this
# page before they have logged into anything, and the future Ember consent /
# ai-disclosure modals fetch these anonymously too.
#
# Rendered WITHOUT a layout so the response is a content fragment, not a
# full HTML document -- see the comment at the top of the v1 / art50_v1 views.
module AiConsent
  class DisclosuresController < ApplicationController
    # Anchored so a crafted param cannot smuggle extra characters past the
    # digits (e.g. 'art50_v1/../../secret'). Only the captured digit group is
    # ever used, and only after being re-validated by
    # Article50Disclosures.known_version? / .metadata below (T-03-01-01).
    ART50_VERSION_PATTERN = /\Aart50_v(\d+)\z/.freeze

    def show
      version = params[:version]

      if (match = version.to_s.match(ART50_VERSION_PATTERN))
        return show_art50(match[1])
      end

      unless LingoLinq::AiConsentDisclosures.known_version?(version)
        return render plain: 'Not Found', status: :not_found
      end

      @metadata = LingoLinq::AiConsentDisclosures.metadata(version)
      render template: "ai_consent/disclosures/v#{@metadata['version']}", layout: false
    end

    private

    # Article 50(1) dispatch branch. `raw_numeric_version` is the digit-only
    # capture from ART50_VERSION_PATTERN, re-validated here against
    # Article50Disclosures itself -- never rendered as-is. Only the Integer
    # `@metadata['version']` (returned by .metadata, never the raw param) is
    # interpolated into the template path, so a crafted version string can
    # never select an arbitrary view (T-03-01-01 / T-03-01-02).
    def show_art50(raw_numeric_version)
      unless LingoLinq::Article50Disclosures.known_version?(raw_numeric_version)
        return render plain: 'Not Found', status: :not_found
      end

      @metadata = LingoLinq::Article50Disclosures.metadata(raw_numeric_version)
      I18n.with_locale(resolve_locale(params[:locale])) do
        render template: "ai_consent/disclosures/art50_v#{@metadata['version']}", layout: false
      end
    end

    # Allowlists against I18n.available_locales (T-03-01-03): an unrecognized
    # or absent locale silently falls back to the default rather than raising
    # I18n::InvalidLocale. Scoped to the art50 branch only, per the plan --
    # the COPPA branch above is left byte-identical to before this change.
    #
    # Falls back through the PRIMARY SUBTAG before giving up ('es-ES' -> 'es'),
    # mirroring the frontend's own i18n.langs.preferred / .fallback pair
    # (initializers/attempt_lang.js sets preferred to the full navigator tag and
    # fallback to the base language). Without this step a browser reporting
    # 'es-ES' -- the common case -- would silently receive the ENGLISH notice
    # even though config/locales/es.yml carries a full Spanish translation of it.
    # Still an allowlist: the derived subtag is checked against
    # I18n.available_locales exactly like the full tag, so an unknown base
    # language falls through to the default rather than being trusted.
    def resolve_locale(raw_locale)
      candidate = raw_locale.to_s.strip
      return I18n.default_locale if candidate.empty?

      available = I18n.available_locales
      symbol = candidate.to_sym
      return symbol if available.include?(symbol)

      base = candidate.split(/[-_]/).first.to_s.downcase
      return I18n.default_locale if base.empty?

      base_symbol = base.to_sym
      available.include?(base_symbol) ? base_symbol : I18n.default_locale
    end
  end
end
