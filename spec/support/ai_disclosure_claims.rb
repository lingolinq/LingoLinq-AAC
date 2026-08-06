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

  # STRUCTURAL RULE, added after the phrase list missed a paraphrase.
  #
  # BANNED_CLAIMS is an exact-phrase denylist, and a denylist only ever knows the
  # wordings someone has already caught. Review found "AI-drafted evaluation
  # summaries use Opus 4.7" on one pass, then on the very next pass found the same
  # false claim written as "using LingoLinq's word prediction and evaluation-summary
  # AI features means sending some information to an outside AI company" -- which
  # names no model, no vendor, and no retention term, so nothing in the list matched.
  #
  # This rule is about SHAPE instead of wording: any sentence that ties evaluation
  # summaries to data leaving LingoLinq must also say the feature is inactive.
  # Rewording the claim does not evade it; only marking the feature inactive, or
  # actually shipping the feature and updating the copy, satisfies it.
  #
  # SECOND KNOWN LIMIT: every pattern here is English. The 13 files in
  # public/locales are currently untranslated English fallbacks (the "*** "
  # prefix), so the guard sees them today -- but the moment any of these strings
  # is genuinely translated, a false claim in that translation passes silently.
  # Translated compliance copy needs human review; this file cannot supply it.
  EVAL_SUMMARY = /evaluation[- ](?:summary|summaries)|evaluation-summary AI/i.freeze
  EGRESS = /\b(?:sending|sends|sent to|send|shared with|goes to|transmit\w*)\b|outside AI company|AI (?:company|vendor|provider)/i.freeze
  # Deliberately STRONG markers only. An earlier version also accepted "on our own
  # systems" and "would require", and a negative test caught the consequence: the
  # claim "evaluation summaries are shared with our AI provider whenever a clinician
  # requests one" passed, because a LATER clause in the same sentence mentioned
  # producing a draft on our own systems. Weak markers let a contradicting clause
  # sit next to the claim and vouch for it. Only an explicit statement that nothing
  # is sent counts.
  INACTIVE_MARKER = /inactive|sends? nothing|nothing is sent|not (?:currently )?sent|never leaves/i.freeze

  module_function

  # Sentences asserting that evaluation data leaves LingoLinq without marking the
  # feature inactive. Returns the offending sentences, trimmed for the failure message.
  def eval_egress_violations(text)
    # Split on sentence enders INCLUDING semicolons, and on the template/JSON
    # boundaries that separate one user-visible string from the next. Semicolons
    # matter: a claim joined by one to a reassuring clause would otherwise borrow
    # that clause's inactivity marker and pass.
    text.split(/(?<=[.!?;])\s+|key="[^"]*"|",\s*"/).filter_map do |sentence|
      next unless sentence =~ EVAL_SUMMARY && sentence =~ EGRESS
      next if sentence =~ INACTIVE_MARKER

      sentence.strip[0, 240]
    end
  end

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
