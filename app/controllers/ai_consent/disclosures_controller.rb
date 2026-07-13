# Serves the versioned AI data-sharing disclosure (VPC Phase 2). Plain HTML,
# no authentication required to read the disclosure itself: a parent needs
# to be able to open this page before they have logged into anything, and
# the future Ember consent modal (VPC Phase 3) fetches it anonymously too.
#
# Rendered WITHOUT a layout so the response is a content fragment, not a
# full HTML document -- see the comment at the top of the v1 view.
module AiConsent
  class DisclosuresController < ApplicationController
    def show
      version = params[:version]
      unless LingoLinq::AiConsentDisclosures.known_version?(version)
        return render plain: 'Not Found', status: :not_found
      end

      @metadata = LingoLinq::AiConsentDisclosures.metadata(version)
      render template: "ai_consent/disclosures/v#{@metadata['version']}", layout: false
    end
  end
end
