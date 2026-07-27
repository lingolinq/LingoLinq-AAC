# frozen_string_literal: true

require 'spec_helper'

describe AiWordPredictor do
  def anthropic_response(text)
    usage = double('usage', input_tokens: 10, output_tokens: 5)
    block = double('text_block', type: 'text', text: text)
    double('anthropic_response', content: [block], usage: usage)
  end

  around(:each) do |example|
    # Runtime AI routes via AWS Bedrock (AiClient); enable it by supplying the
    # dedicated Bedrock AWS creds rather than a direct ANTHROPIC_API_KEY.
    old_region = ENV['BEDROCK_AWS_REGION']
    old_key = ENV['BEDROCK_AWS_KEY']
    old_secret = ENV['BEDROCK_AWS_SECRET']
    old_gemini = ENV['GEMINI_API_KEY']
    old_gate = ENV['COPPA_AI_HARD_GATE']
    ENV['BEDROCK_AWS_REGION'] = 'us-west-2'
    ENV['BEDROCK_AWS_KEY'] = 'test-bedrock-key'
    ENV['BEDROCK_AWS_SECRET'] = 'test-bedrock-secret'
    ENV.delete('GEMINI_API_KEY')
    ENV.delete('COPPA_AI_HARD_GATE')
    described_class::CACHE.clear
    PiiScrubber.reset_blocklist!
    example.run
  ensure
    ENV['BEDROCK_AWS_REGION'] = old_region
    ENV['BEDROCK_AWS_KEY'] = old_key
    ENV['BEDROCK_AWS_SECRET'] = old_secret
    ENV['GEMINI_API_KEY'] = old_gemini
    ENV['COPPA_AI_HARD_GATE'] = old_gate
    described_class::CACHE.clear
    PiiScrubber.reset_blocklist!
  end

  before(:each) do
    allow(AiApiLog).to receive(:log_ai_call)
    allow(FeatureFlags).to receive(:ai_feature_enabled_for?).and_return(true)
  end

  describe ".predict" do
    it "returns an empty array when sentence is blank" do
      expect(described_class.predict(sentence: '')).to eq([])
    end

    it "returns an empty array when the AI (Bedrock) route is not configured" do
      allow(AiClient).to receive(:configured?).and_return(false)
      expect(described_class.predict(sentence: 'I want to')).to eq([])
    end

    it "returns predicted words from Anthropic" do
      allow(described_class).to receive(:call_anthropic).and_return(anthropic_response('play, go, eat, help'))

      words = described_class.predict(sentence: 'I want to')

      expect(words).to eq(%w[play go eat help])
      expect(AiApiLog).to have_received(:log_ai_call).with(hash_including(
        provider: 'claude',
        type: 'word_prediction',
        success: true,
        feature_flag: 'ai_word_prediction'
      ))
    end

    it "does not content-mark word-prediction output (Article 50(2) assistive-function carve-out)" do
      allow(described_class).to receive(:call_anthropic).and_return(anthropic_response('play, go, eat, help'))

      result = described_class.predict(sentence: 'I want to')

      # Word prediction produces transient, human-selected suggestions -- not a persisted AI
      # artifact -- so it is out of Article 50(2) content-marking scope. The return is a bare
      # word array (no ai_generated marker), and the audit row never claims content-marking.
      expect(result).to eq(%w[play go eat help])
      expect(AiApiLog).not_to have_received(:log_ai_call).with(hash_including(ai_content_marked: true))
    end

    it "preserves non-English letters in predicted words" do
      allow(described_class).to receive(:call_anthropic).and_return(anthropic_response('sí, también, después, más'))

      words = described_class.predict(sentence: 'quiero', locale: 'es')

      expect(words).to eq(%w[sí también después más])
    end

    it "scrubs PII from the sentence before sending it to the provider" do
      received_sentence = nil
      allow(described_class).to receive(:call_anthropic) do |_config, sentence, _locale, _count, _context|
        received_sentence = sentence
        anthropic_response('today, and, but, because')
      end

      described_class.predict(sentence: 'email me at jane@example.com tomorrow')

      expect(received_sentence).to include('[REDACTED_EMAIL]')
      expect(received_sentence).not_to include('jane@example.com')
      expect(AiApiLog).to have_received(:log_ai_call).with(hash_including(pii_detected: true))
    end

    context "feature flag and consent gates" do
      let(:user) { User.new(settings: {}) }

      it "returns empty when ai_feature_enabled_for? is false" do
        allow(FeatureFlags).to receive(:ai_feature_enabled_for?).with('ai_word_prediction', user).and_return(false)
        allow(described_class).to receive(:call_anthropic)

        result = described_class.predict(sentence: 'I want to', user: user)

        expect(result).to eq([])
        expect(described_class).not_to have_received(:call_anthropic)
        expect(AiApiLog).not_to have_received(:log_ai_call)
      end

      it "returns empty when COPPA hard-gate blocks the user" do
        allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).with(user).and_return(true)
        allow(described_class).to receive(:call_anthropic)

        result = described_class.predict(sentence: 'I want to', user: user)

        expect(result).to eq([])
        expect(described_class).not_to have_received(:call_anthropic)
        expect(AiApiLog).not_to have_received(:log_ai_call)
      end
    end

    it "logs failure when the provider call raises" do
      allow(described_class).to receive(:call_anthropic).and_raise(StandardError.new('boom'))
      allow(Rails.logger).to receive(:error)

      result = described_class.predict(sentence: 'I want to')

      expect(result).to eq([])
      expect(AiApiLog).to have_received(:log_ai_call).with(hash_including(
        success: false,
        error_message: a_string_including('boom')
      ))
    end
  end

  describe "Article 50 jurisdiction + disclosure stamping" do
    before do
      allow(described_class).to receive(:call_anthropic).and_return(anthropic_response('play, go, eat, help'))
      allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).and_return(false)
      allow(FeatureFlags).to receive(:eu_under16_blocks_ai_for?).and_return(false)
    end

    it "stamps jurisdiction 'EU' + article_50_disclosure_shown false for a confirmed EU user" do
      eu_user = User.new(settings: { 'preferences' => { 'jurisdiction' => 'FR' } })

      described_class.predict(sentence: 'I want to', user: eu_user)

      expect(AiApiLog).to have_received(:log_ai_call).with(hash_including(
        jurisdiction: 'EU', article_50_disclosure_shown: false
      ))
    end

    it "leaves jurisdiction nil for a non-EU user (D-01 retention fail-safe)" do
      non_eu_user = User.new(settings: { 'preferences' => { 'jurisdiction' => 'US' } })

      described_class.predict(sentence: 'I want to', user: non_eu_user)

      expect(AiApiLog).to have_received(:log_ai_call).with(hash_including(
        jurisdiction: nil, article_50_disclosure_shown: false
      ))
    end

    it "leaves jurisdiction nil for an :unknown user (NOT 'EU' -- the load-bearing D-01 case)" do
      unknown_user = User.new(settings: { 'preferences' => { 'locale' => 'en' } })

      described_class.predict(sentence: 'I want to', user: unknown_user)

      expect(AiApiLog).to have_received(:log_ai_call).with(hash_including(jurisdiction: nil))
    end
  end

  describe ".predict_from_tokens" do
    it "delegates to predict with joined tokens" do
      expect(described_class).to receive(:predict).with(hash_including(
        sentence: 'when do you',
        count: 5,
        context: { time_of_day: 'morning', topic: 'school' }
      )).and_return(%w[go eat])

      result = described_class.predict_from_tokens(
        words: %w[when do you],
        count: 5,
        context: { time_of_day: 'morning', topic: 'school' }
      )

      expect(result).to eq(%w[go eat])
    end

    it "returns empty when words are blank" do
      expect(described_class.predict_from_tokens(words: [])).to eq([])
    end
  end
end
