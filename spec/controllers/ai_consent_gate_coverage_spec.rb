# frozen_string_literal: true

require 'spec_helper'

# AI data-sharing consent (#1136): a static guard that every place able to return AI
# output checks the consent first. The behaviour at each known site is proven in
# spec/lib/ai_consent_gate_spec.rb and spec/controllers/ai_consent_gate_spec.rb; this
# file exists so that a NEW site cannot ship without the check.
#
# It reads the syntax tree (spec/support/ai_call_scan.rb), not the text: a comment that
# names the check does not count as the check, and the check must come BEFORE the first
# call that can return AI output, not merely appear somewhere in the method.
describe 'AI data-sharing consent coverage (#1136)' do
  # A controller action returns AI output when it calls a generator, or reads the
  # stored focus-word sets (a hit returns generated words without calling a generator).
  CONTROLLER_SINK = lambda do |c|
    %i[AiWordPredictor AiBoardGenerator].include?(c[:receiver]) ||
      (c[:receiver] == :AiFocusWordSet && c[:name] == :find_for)
  end
  CONTROLLER_GUARD = ->(c) { c[:receiver].nil? && %i[require_ai_consent! ai_consent_missing?].include?(c[:name]) }

  controller_methods = Dir.glob(Rails.root.join('app', 'controllers', '**', '*.rb')).flat_map do |f|
    AiCallScan.methods_in_source(File.read(f)).map { |m| m.merge(file: Pathname.new(f).relative_path_from(Rails.root).to_s) }
  end
  ai_actions = controller_methods.select { |m| m[:calls].any?(&CONTROLLER_SINK) }

  it 'finds the four known generator actions (sanity check on the scan itself)' do
    expect(ai_actions.map { |m| "#{m[:file]}##{m[:name]}" }).to include(
      'app/controllers/api/words_controller.rb#predict',
      'app/controllers/api/word_suggestions_controller.rb#create',
      'app/controllers/api/boards_controller.rb#generate_labels',
      'app/controllers/api/integrations_controller.rb#focus_generate_words'
    )
  end

  ai_actions.each do |m|
    it "#{m[:file]}##{m[:name]} checks the consent before it can return AI output" do
      expect(AiCallScan.guard_precedes_sink?(m[:calls], guard: CONTROLLER_GUARD, sink: CONTROLLER_SINK)).to eq(true),
        "#{m[:file]}##{m[:name]} reaches an AI generator or the stored focus-word sets without first calling " \
        'require_ai_consent! or ai_consent_missing? (ApplicationController). Add the check above that call.'
    end
  end

  # Narration is the one site whose consent belongs to someone other than the caller (the
  # student), so its check lives in the library, and the controller must go through it.
  it 'narration reaches the model only through EvalNarrator.ai_allowed_for?, which checks the consent' do
    methods = AiCallScan.methods_in_source(File.read(Rails.root.join('lib', 'eval_narrator.rb')))
    draft = methods.find { |m| m[:name] == :draft_narrative }
    allowed = methods.find { |m| m[:name] == :ai_allowed_for? }
    refuses = methods.find { |m| m[:name] == :ai_consent_refuses? }
    expect(AiCallScan.guard_precedes_sink?(draft[:calls],
      guard: ->(c) { c[:name] == :ai_allowed_for? }, sink: ->(c) { c[:name] == :draft_via_anthropic })).to eq(true)
    expect(draft[:calls].any? { |c| c[:name] == :draft_via_anthropic }).to eq(true)
    expect(allowed[:calls].any? { |c| c[:name] == :ai_consent_refuses? }).to eq(true)
    expect(refuses[:calls].any? { |c| c[:receiver] == :FeatureFlags && c[:name] == :ai_consent_blocks_ai_for? }).to eq(true)
  end

  # Library entry points: the check comes before the response cache and the model call.
  LIBRARY_GUARD = ->(c) { c[:receiver] == :FeatureFlags && c[:name] == :ai_consent_blocks_ai_for? }
  {
    'lib/ai_word_predictor.rb' => { predict: %i[cache_fetch call_anthropic] },
    'lib/ai_board_generator.rb' => { generate_words: %i[call_anthropic], generate_focus_words: %i[call_anthropic] }
  }.each do |file, entries|
    methods = AiCallScan.methods_in_source(File.read(Rails.root.join(file)))
    entries.each do |name, sinks|
      it "#{file}##{name} checks the consent before #{sinks.join(' / ')}" do
        m = methods.find { |x| x[:name] == name }
        expect(m).not_to eq(nil)
        expect(m[:calls].any?(&LIBRARY_GUARD)).to eq(true)
        expect(AiCallScan.guard_precedes_sink?(m[:calls], guard: LIBRARY_GUARD, sink: ->(c) { sinks.include?(c[:name]) })).to eq(true)
      end
    end
  end

  # A new file that builds the AI client is a new call site. It must be listed here,
  # which forces whoever adds it to decide where its consent check goes.
  it 'no file outside the known four builds the AI client' do
    known = %w[lib/ai_board_generator.rb lib/ai_word_predictor.rb lib/eval_narrator.rb lib/ai_prediction_generator.rb]
    builders = (Dir.glob(Rails.root.join('lib', '**', '*.rb')) + Dir.glob(Rails.root.join('app', '**', '*.rb'))).select do |f|
      next false if f.include?('/app/frontend/')
      src = File.read(f)
      next false unless src.include?('AiClient')
      AiCallScan.methods_in_source(src).any? { |m| m[:calls].any? { |c| c[:receiver] == :AiClient && c[:name] == :build! } }
    end
    expect(builders.map { |f| Pathname.new(f).relative_path_from(Rails.root).to_s }.sort).to eq(known.sort)
  end

  describe 'the scan itself' do
    it 'does not count a check that is only named in a comment, and requires it before the sink' do
      source = <<~RUBY
        class FixtureController
          def comment_only
            # return unless require_ai_consent!
            AiWordPredictor.predict
          end

          def check_after
            AiWordPredictor.predict
            return unless require_ai_consent!
          end

          def cache_hit_before_check
            set = AiFocusWordSet.find_for(a: 1)
            return unless require_ai_consent!
            AiBoardGenerator.generate_focus_words
          end

          def guarded
            return unless require_ai_consent!
            AiFocusWordSet.find_for(a: 1)
            AiBoardGenerator.generate_focus_words
          end
        end
      RUBY
      result = AiCallScan.methods_in_source(source).to_h do |m|
        [m[:name], AiCallScan.guard_precedes_sink?(m[:calls], guard: CONTROLLER_GUARD, sink: CONTROLLER_SINK)]
      end
      expect(result).to eq(comment_only: false, check_after: false, cache_hit_before_check: false, guarded: true)
    end
  end
end
