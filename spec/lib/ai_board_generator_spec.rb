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
  end
end
