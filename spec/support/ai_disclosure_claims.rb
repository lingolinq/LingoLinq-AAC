# frozen_string_literal: true

# Shared definition of the AI disclosure claims LingoLinq must NOT make to users.
#
# WHY THIS IS SHARED
#   The same claims have to be checked against two very different surfaces:
#     - the server-rendered consent page  (spec/controllers/ai_consent/disclosures_controller_spec.rb)
#     - static template + locale files    (spec/lib/lingo_linq/ai_disclosure_surfaces_spec.rb)
#   Keeping one list in one place is the only way those two stay in agreement;
#   two copies of a compliance rule is just a slower way to get a contradiction.
#
# ASSERTIONS, NOT VOCABULARY
#   Every rule here bans a CLAIM, never a word. The disclosures legitimately and
#   deliberately mention these same topics in order to deny them -- the consent
#   page says the runtime path is "not Anthropic's commercial API", and privacy.hbs
#   says LingoLinq does "not currently claim a zero-data-retention guarantee".
#   Both sentences are true, are the accurate description of Bedrock, and must
#   survive. A naive substring ban would delete exactly the honest disclaimers
#   this file exists to protect, so `offending_claims` ignores a match that is
#   negated in the words immediately before it.
module AiDisclosureClaims
  # Words that flip a claim into a disclaimer when they appear just before it.
  NEGATORS = /\b(?:no|not|none|never|neither|nor|without|cannot|don't)\b/i.freeze

  # How far back to look for a negator. Long enough to catch "this is not
  # Anthropic's commercial API" and "so no zero-data-retention guarantee is
  # claimed", short enough not to swallow a negation from a previous, unrelated
  # sentence.
  #
  # KNOWN LIMIT, stated rather than papered over: an unrelated "no" within this
  # window WILL suppress a real violation. This is a cheap backstop against
  # copy drift, not a proof of truthfulness -- compliance-relevant wording still
  # needs human review. It is tuned to avoid false ALARMS, because a guard that
  # cries wolf on accurate disclaimers gets deleted, and then catches nothing.
  NEGATION_WINDOW = 60

  # [human description, pattern that must not be ASSERTED]
  BANNED_CLAIMS = [
    ["names Anthropic's commercial API as the runtime path", /Anthropic'?s commercial API/i],
    ['asserts an active zero-data-retention agreement', /operates? under a zero-data-retention agreement/i],
    ['guarantees zero data retention', /zero[- ]data[- ]retention guarantee/i],
    ['claims the vendor discards data after answering', /(?:does not retain it|does not keep the information) (?:beyond|after) answering/i],
    ['advertises Claude Opus 4.7 as in use', /Claude Opus 4\.7/i],
    ['claims a Google Gemini fallback (disabled 2026-07-09)', /Gemini/i]
  ].freeze

  module_function

  # Returns the descriptions of every banned claim ASSERTED in `text`.
  # A match preceded by a negator within NEGATION_WINDOW characters is treated
  # as a disclaimer and allowed through.
  def offending_claims(text)
    BANNED_CLAIMS.filter_map do |description, pattern|
      description if asserted?(text, pattern)
    end
  end

  def asserted?(text, pattern)
    offset = 0
    while (match = pattern.match(text, offset))
      lead_in = text[[match.begin(0) - NEGATION_WINDOW, 0].max...match.begin(0)].to_s
      return true unless lead_in.match?(NEGATORS)

      offset = match.end(0)
    end
    false
  end
end
