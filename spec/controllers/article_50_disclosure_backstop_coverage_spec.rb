# frozen_string_literal: true

require 'spec_helper'

# LL-6723438462: a static-source regression guard, not a request spec. The five
# per-controller specs (boards, integrations, word_suggestions, words, eval_sessions)
# each prove the guard behaves correctly at ITS OWN call site; none of them can prove
# that every AI-generation call site HAS a guard at all -- that requires scanning the
# whole controller surface, which is exactly what let a sixth ingress ship without one
# in the first place (word_suggestions#create, words#predict, eval_sessions#narrate
# were added over time with no mechanism forcing the new call site to carry the same
# backstop as the first two).
#
# Every app/controllers/api/*.rb file that calls one of the three AI generators
# (AiWordPredictor, AiBoardGenerator, EvalNarrator) must also call the shared
# ApplicationController#require_article_50_disclosure! / #article_50_disclosure_missing?
# guard somewhere in the same file. A new AI call site that omits the guard fails this
# spec instead of silently shipping a sixth unenforced ingress.
describe "Article 50 disclosure backstop coverage (LL-6723438462)" do
  AI_GENERATOR_CALL_PATTERN = /\b(?:AiWordPredictor|AiBoardGenerator|EvalNarrator)\.\w+/.freeze
  # No trailing \b: both alternatives end in a non-word character (! or ?), and \b only
  # fires at a word/non-word transition, so a \b immediately after "!"/"?" would require
  # the NEXT character to be a word character -- never true when the call is followed by
  # whitespace or a newline. The leading \b is sufficient to avoid matching as a substring
  # of a longer identifier.
  GUARD_CALL_PATTERN = /\b(?:require_article_50_disclosure!|article_50_disclosure_missing\?)/.freeze

  controller_files = Dir.glob(Rails.root.join('app', 'controllers', 'api', '*.rb'))
  ai_calling_controllers = controller_files.select { |f| File.read(f).match?(AI_GENERATOR_CALL_PATTERN) }

  it "finds at least the five known AI ingresses (sanity check on the scan itself)" do
    relative = ai_calling_controllers.map { |f| File.basename(f) }
    expect(relative).to include(
      'boards_controller.rb',
      'integrations_controller.rb',
      'word_suggestions_controller.rb',
      'words_controller.rb',
      'eval_sessions_controller.rb'
    )
  end

  ai_calling_controllers.each do |file|
    it "#{File.basename(file)} calls an AI generator AND carries the article_50_disclosure guard" do
      contents = File.read(file)
      expect(contents).to match(GUARD_CALL_PATTERN),
        "#{File.basename(file)} calls an AI generator (#{AI_GENERATOR_CALL_PATTERN.source}) " \
        "but never calls require_article_50_disclosure! / article_50_disclosure_missing? -- " \
        "a new AI ingress must wire the shared EU AI Act Article 50(1) backstop " \
        '(see ApplicationController#require_article_50_disclosure!).'
    end
  end
end
