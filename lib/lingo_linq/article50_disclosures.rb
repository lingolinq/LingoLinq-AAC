# frozen_string_literal: true

module LingoLinq
  # Canonical version source for the EU AI Act Article 50(1) TRANSPARENCY
  # disclosure (VPC Phase 4, PN-02 Option B).
  #
  # `User#article_50_disclosure_shown?(disclosures_version:)` needs an
  # authoritative "current version" to compare a recorded disclosure-shown
  # state against; a version bump re-prompts (the reader checks "shown at the
  # CURRENT version", not "ever shown").
  #
  # WHY a DEDICATED constant, deliberately NOT reusing
  # `LingoLinq::AiConsentDisclosures::CURRENT_VERSION`:
  # that constant is the AI DATA-SHARING consent version (COPPA Item 1b), a
  # semantically DISTINCT disclosure from the Article 50 transparency notice.
  # The two documents bump independently -- an Article 50 copy change must not
  # force an ai_consent re-consent, and an ai_consent change must not re-prompt
  # the Article 50 modal. Single-sourcing each to its own constant keeps the
  # two lifecycles decoupled (PN-02).
  module Article50Disclosures
    CURRENT_VERSION = 1
  end
end
