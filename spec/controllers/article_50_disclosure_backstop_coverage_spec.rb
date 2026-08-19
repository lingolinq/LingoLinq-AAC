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
# Scoped per-METHOD, not per-file (P2 follow-up from the chatgpt-codex-connector review
# on PR #829, comment 3815352166): the original version matched the generator call and
# the guard call anywhere in the same file, so a second, unguarded AI action added to an
# already-covered controller would still pass -- the file-level regex would find the
# guard call belonging to the controller's OTHER, already-guarded action. Every method
# that calls an AI generator must carry the guard inside that SAME method body.
#
# Method boundaries are found with RubyVM::AbstractSyntaxTree rather than a hand-rolled
# line/keyword counter: Ruby's own parser already resolves the ambiguity a naive counter
# would get wrong (a modifier `if`/`unless`/`while`/`until` never opens an `end`-closed
# block, but a statement-form one always does), so first_lineno/last_lineno on each :DEFN
# node are the actual, unambiguous method extent.
describe "Article 50 disclosure backstop coverage (LL-6723438462)" do
  AI_GENERATOR_CALL_PATTERN = /\b(?:AiWordPredictor|AiBoardGenerator|EvalNarrator)\.\w+/.freeze
  # No trailing \b: both alternatives end in a non-word character (! or ?), and \b only
  # fires at a word/non-word transition, so a \b immediately after "!"/"?" would require
  # the NEXT character to be a word character -- never true when the call is followed by
  # whitespace or a newline. The leading \b is sufficient to avoid matching as a substring
  # of a longer identifier.
  GUARD_CALL_PATTERN = /\b(?:require_article_50_disclosure!|article_50_disclosure_missing\?)/.freeze

  # Returns [{name:, source:}, ...] for every instance (:DEFN) and singleton
  # (:DEFS) method defined anywhere in +source+, each entry's `source` being
  # exactly the lines from `def` to its matching `end`.
  def self.methods_in_source(source)
    lines = source.lines
    found = []
    walk = lambda do |node|
      next unless node.is_a?(RubyVM::AbstractSyntaxTree::Node)
      case node.type
      when :DEFN
        name = node.children.first
        found << { name: name, source: lines[(node.first_lineno - 1)...node.last_lineno].join }
      when :DEFS
        name = node.children[1]
        found << { name: name, source: lines[(node.first_lineno - 1)...node.last_lineno].join }
      end
      node.children.each { |child| walk.call(child) }
    end
    walk.call(RubyVM::AbstractSyntaxTree.parse(source))
    found
  end

  def self.methods_in_file(file)
    methods_in_source(File.read(file)).map { |m| m.merge(file: File.basename(file)) }
  end

  controller_files = Dir.glob(Rails.root.join('app', 'controllers', 'api', '*.rb'))
  ai_calling_methods = controller_files.flat_map { |f| methods_in_file(f) }
                                        .select { |m| m[:source].match?(AI_GENERATOR_CALL_PATTERN) }

  it "finds at least the five known AI actions (sanity check on the scan itself)" do
    found = ai_calling_methods.map { |m| "#{m[:file]}##{m[:name]}" }
    expect(found).to include(
      'boards_controller.rb#generate_labels',
      'integrations_controller.rb#focus_generate_words',
      'word_suggestions_controller.rb#create',
      'words_controller.rb#predict',
      'eval_sessions_controller.rb#narrate'
    )
  end

  ai_calling_methods.each do |m|
    it "#{m[:file]}##{m[:name]} calls an AI generator AND carries the article_50_disclosure guard in the SAME method" do
      expect(m[:source]).to match(GUARD_CALL_PATTERN),
        "#{m[:file]}##{m[:name]} calls an AI generator (#{AI_GENERATOR_CALL_PATTERN.source}) " \
        "but never calls require_article_50_disclosure! / article_50_disclosure_missing? " \
        "inside that same method -- a new or modified AI action must carry its own " \
        'EU AI Act Article 50(1) backstop (see ApplicationController#require_article_50_disclosure!).'
    end
  end

  # Regression coverage for the scanning algorithm itself (the P2 gap): proves the
  # per-method scoping actually catches the case the old file-level version missed,
  # rather than just re-testing real controllers that happen to already be correct.
  describe "per-method scoping (regression for the file-level false pass)" do
    it "flags an unguarded AI action even when another action in the same file is guarded" do
      source = <<~RUBY
        class FixtureController
          def guarded_action
            return unless require_article_50_disclosure!
            AiWordPredictor.predict
          end

          def unguarded_action
            AiWordPredictor.predict
          end
        end
      RUBY
      methods = self.class.methods_in_source(source).select { |m| m[:source].match?(AI_GENERATOR_CALL_PATTERN) }

      expect(methods.map { |m| m[:name] }).to contain_exactly(:guarded_action, :unguarded_action)
      guarded = methods.find { |m| m[:name] == :guarded_action }
      unguarded = methods.find { |m| m[:name] == :unguarded_action }
      expect(guarded[:source]).to match(GUARD_CALL_PATTERN)
      expect(unguarded[:source]).not_to match(GUARD_CALL_PATTERN)
    end

    it "passes a file where every AI action carries its own guard independently" do
      source = <<~RUBY
        class FixtureController
          def action_one
            return unless require_article_50_disclosure!
            AiWordPredictor.predict
          end

          def action_two
            return unless require_article_50_disclosure!
            AiBoardGenerator.generate
          end
        end
      RUBY
      methods = self.class.methods_in_source(source).select { |m| m[:source].match?(AI_GENERATOR_CALL_PATTERN) }

      expect(methods.length).to eq(2)
      expect(methods).to all(satisfy { |m| m[:source].match?(GUARD_CALL_PATTERN) })
    end

    it "ignores a file with no AI generator invocation at all" do
      source = <<~RUBY
        class FixtureController
          def unrelated_action
            render json: { ok: true }
          end
        end
      RUBY
      methods = self.class.methods_in_source(source).select { |m| m[:source].match?(AI_GENERATOR_CALL_PATTERN) }

      expect(methods).to be_empty
    end
  end
end
