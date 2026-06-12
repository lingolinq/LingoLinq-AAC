# frozen_string_literal: true

require 'spec_helper'

describe AiBoardGenerator do
  def anthropic_response(text)
    usage = double('usage', input_tokens: 10, output_tokens: 20)
    block = double('text_block', type: 'text', text: text)
    double('anthropic_response', content: [block], usage: usage)
  end

  around(:each) do |example|
    old_anthropic = ENV['ANTHROPIC_API_KEY']
    old_gemini = ENV['GEMINI_API_KEY']
    ENV['ANTHROPIC_API_KEY'] = 'test-anthropic-key'
    ENV.delete('GEMINI_API_KEY')
    example.run
  ensure
    ENV['ANTHROPIC_API_KEY'] = old_anthropic
    ENV['GEMINI_API_KEY'] = old_gemini
  end

  before(:each) do
    allow(AiApiLog).to receive(:log_ai_call)
    allow(FeatureFlags).to receive(:ai_feature_enabled_for?).and_return(true) if defined?(FeatureFlags)
  end

  describe "generate_words" do
    it "retries a short response and returns the first complete word list" do
      first = "WORDS: apple, banana\nNAME: Snacks\nDESCRIPTION: Snack words."
      second = "WORDS: apple, banana, carrot, drink\nNAME: Snacks\nDESCRIPTION: Snack words."
      allow(described_class).to receive(:call_anthropic).and_return(
        anthropic_response(first),
        anthropic_response(second)
      )

      result = described_class.generate_words(prompt: 'snacks', rows: 2, columns: 2)

      expect(result[:words]).to eq(%w[apple banana carrot drink])
      expect(result[:name]).to eq('Snacks')
      expect(result[:error]).to eq(nil)
      expect(described_class).to have_received(:call_anthropic).twice
      expect(AiApiLog).to have_received(:log_ai_call).with(hash_including(provider: 'claude', success: true))
    end

    it "returns an incomplete-list error after both attempts are short" do
      first = "WORDS: apple, banana\nNAME: Snacks\nDESCRIPTION: Snack words."
      second = "WORDS: apple, banana, carrot\nNAME: Snacks\nDESCRIPTION: Snack words."
      allow(described_class).to receive(:call_anthropic).and_return(
        anthropic_response(first),
        anthropic_response(second)
      )

      result = described_class.generate_words(prompt: 'snacks', rows: 2, columns: 2)

      expect(result[:words]).to eq(nil)
      expect(result[:error]).to include('incomplete word list')
      expect(described_class).to have_received(:call_anthropic).twice
      expect(AiApiLog).to have_received(:log_ai_call).with(hash_including(provider: 'claude', success: false))
    end

    context "COPPA Final Rule hard-gate" do
      it "returns a parental-consent error when coppa_blocks_ai_for? is true" do
        u = User.new(settings: { 'coppa' => { 'pending_parent_consent' => true } })
        allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).with(u).and_return(true)
        allow(described_class).to receive(:call_anthropic)

        result = described_class.generate_words(prompt: 'snacks', rows: 2, columns: 2, user: u)

        expect(result[:words]).to eq(nil)
        expect(result[:error]).to include('parental consent')
        expect(described_class).not_to have_received(:call_anthropic)
        expect(AiApiLog).not_to have_received(:log_ai_call)
      end

      it "proceeds when coppa_blocks_ai_for? is false" do
        u = User.new(settings: {})
        allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).with(u).and_return(false)
        complete = "WORDS: apple, banana, carrot, drink\nNAME: Snacks\nDESCRIPTION: Snack words."
        allow(described_class).to receive(:call_anthropic).and_return(anthropic_response(complete))

        result = described_class.generate_words(prompt: 'snacks', rows: 2, columns: 2, user: u)

        expect(result[:words]).to eq(%w[apple banana carrot drink])
        expect(result[:error]).to eq(nil)
      end
    end
  end

  describe "generate_focus_words" do
    it "parses focus words and title" do
      complete = "WORDS: go, stop, more, help, read\nTITLE: Story Time"
      allow(described_class).to receive(:call_anthropic).and_return(anthropic_response(complete))

      result = described_class.generate_focus_words(prompt: 'story time', word_count: 5)

      expect(result[:words]).to eq(%w[go stop more help read])
      expect(result[:title]).to eq('Story Time')
      expect(result[:error]).to eq(nil)
      expect(AiApiLog).to have_received(:log_ai_call).with(hash_including(type: 'focus_word_generation', success: true))
    end

    it "clamps requested word count to fifty" do
      words = (1..50).map { |i| "word#{i}" }
      allow(described_class).to receive(:call_anthropic).and_return(anthropic_response("WORDS: #{words.join(', ')}\nTITLE: Big List"))

      result = described_class.generate_focus_words(prompt: 'big lesson', word_count: 80)

      expect(result[:words].length).to eq(50)
      expect(described_class).to have_received(:call_anthropic).with(hash_including(user_prompt: include('Generate exactly 50 focus words')))
    end

    it "requests only missing words and filters existing duplicates" do
      complete = "WORDS: apple, banana, carrot, drink, eat\nTITLE: Snacks"
      allow(described_class).to receive(:call_anthropic).and_return(anthropic_response(complete))

      result = described_class.generate_focus_words(prompt: 'snacks', word_count: 5, existing_words: ['apple'])

      expect(result[:words]).to eq(%w[banana carrot drink eat])
      expect(described_class).to have_received(:call_anthropic).with(hash_including(user_prompt: include('Generate exactly 4 focus words')))
    end

    it "returns a parental-consent error when coppa_blocks_ai_for? is true" do
      u = User.new(settings: { 'coppa' => { 'pending_parent_consent' => true } })
      allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).with(u).and_return(true)
      allow(described_class).to receive(:call_anthropic)

      result = described_class.generate_focus_words(prompt: 'snacks', word_count: 5, user: u)

      expect(result[:words]).to eq(nil)
      expect(result[:error]).to include('parental consent')
      expect(described_class).not_to have_received(:call_anthropic)
    end
  end
end
