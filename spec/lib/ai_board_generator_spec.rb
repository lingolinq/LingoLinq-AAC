# frozen_string_literal: true

require 'spec_helper'

describe AiBoardGenerator do
  def anthropic_response(text)
    usage = double('usage', input_tokens: 10, output_tokens: 20)
    block = double('text_block', type: 'text', text: text)
    double('anthropic_response', content: [block], usage: usage)
  end

  around(:each) do |example|
    # Runtime AI routes via AWS Bedrock (AiClient); enable it with the dedicated
    # Bedrock AWS creds rather than a direct ANTHROPIC_API_KEY.
    old_region = ENV['BEDROCK_AWS_REGION']
    old_key = ENV['BEDROCK_AWS_KEY']
    old_secret = ENV['BEDROCK_AWS_SECRET']
    old_gemini = ENV['GEMINI_API_KEY']
    ENV['BEDROCK_AWS_REGION'] = 'us-west-2'
    ENV['BEDROCK_AWS_KEY'] = 'test-bedrock-key'
    ENV['BEDROCK_AWS_SECRET'] = 'test-bedrock-secret'
    ENV.delete('GEMINI_API_KEY')
    example.run
  ensure
    ENV['BEDROCK_AWS_REGION'] = old_region
    ENV['BEDROCK_AWS_KEY'] = old_key
    ENV['BEDROCK_AWS_SECRET'] = old_secret
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

    it "scrubs PII from the model response before it reaches AiApiLog" do
      logged = nil
      allow(AiApiLog).to receive(:log_ai_call) { |**kw| logged = kw }
      raw = "WORDS: apple, banana, carrot, drink\nNAME: Snacks\nDESCRIPTION: Email parent@example.com for help."
      allow(described_class).to receive(:call_anthropic).and_return(anthropic_response(raw))

      result = described_class.generate_words(prompt: 'snacks', rows: 2, columns: 2)

      expect(result[:error]).to eq(nil)
      expect(logged[:response_summary]).to include('[REDACTED_EMAIL]')
      expect(logged[:response_summary]).not_to include('parent@example.com')
    end

    it "marks the AI-generated output with a verifiable Article 50 marker and records it in the audit log" do
      logged = nil
      allow(AiApiLog).to receive(:log_ai_call) { |**kw| logged = kw }
      complete = "WORDS: apple, banana, carrot, drink\nNAME: Snacks\nDESCRIPTION: Snack words."
      allow(described_class).to receive(:call_anthropic).and_return(anthropic_response(complete))

      result = described_class.generate_words(prompt: 'snacks', rows: 2, columns: 2)

      expect(result[:ai_generated]).to be_a(Hash)
      expect(Art50Marker.verify(result[:ai_generated])).to eq(true)
      expect(result[:ai_generated]['provider']).to eq('claude')
      expect(result[:ai_generated]['model']).to eq(AiClient.bedrock_model(AiBoardGenerator::DEFAULT_MODEL))
      expect(logged[:ai_content_marked]).to eq(true)
      expect(logged[:ai_generated_content_id]).to eq(result[:ai_generated]['content_id'])
    end

    it "does not attach a marker to a shortfall (no AI content delivered)" do
      short = "WORDS: apple, banana\nNAME: Snacks\nDESCRIPTION: x."
      allow(described_class).to receive(:call_anthropic).and_return(
        anthropic_response(short), anthropic_response(short)
      )

      result = described_class.generate_words(prompt: 'snacks', rows: 2, columns: 2)

      expect(result[:words]).to eq(nil)
      expect(result[:ai_generated]).to eq(nil)
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

    it "marks the AI-generated focus list with a verifiable Article 50 marker and records it in the audit log" do
      logged = nil
      allow(AiApiLog).to receive(:log_ai_call) { |**kw| logged = kw }
      complete = "WORDS: go, stop, more, help, read\nTITLE: Story Time"
      allow(described_class).to receive(:call_anthropic).and_return(anthropic_response(complete))

      result = described_class.generate_focus_words(prompt: 'story time', word_count: 5)

      expect(result[:ai_generated]).to be_a(Hash)
      expect(Art50Marker.verify(result[:ai_generated])).to eq(true)
      expect(result[:ai_generated]['provider']).to eq('claude')
      expect(logged[:ai_content_marked]).to eq(true)
      expect(logged[:ai_generated_content_id]).to eq(result[:ai_generated]['content_id'])
    end

    it "does not attach a marker to a focus-word shortfall (no AI content delivered)" do
      short = "WORDS: go, stop\nTITLE: Too Few"
      allow(described_class).to receive(:call_anthropic).and_return(anthropic_response(short), anthropic_response(short))

      result = described_class.generate_focus_words(prompt: 'story time', word_count: 5)

      expect(result[:ai_generated]).to eq(nil)
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

  describe "Article 50 jurisdiction + disclosure stamping" do
    let(:complete) { "WORDS: apple, banana, carrot, drink\nNAME: Snacks\nDESCRIPTION: Snack words." }

    before do
      allow(described_class).to receive(:call_anthropic).and_return(anthropic_response(complete))
      allow(FeatureFlags).to receive(:coppa_blocks_ai_for?).and_return(false)
      allow(FeatureFlags).to receive(:eu_under16_blocks_ai_for?).and_return(false)
    end

    it "stamps jurisdiction 'EU' + article_50_disclosure_shown false for a confirmed EU user" do
      eu_user = User.new(settings: { 'preferences' => { 'jurisdiction' => 'FR' } })

      described_class.generate_words(prompt: 'snacks', rows: 2, columns: 2, user: eu_user)

      expect(AiApiLog).to have_received(:log_ai_call).with(hash_including(
        jurisdiction: 'EU', article_50_disclosure_shown: false
      ))
    end

    it "leaves jurisdiction nil for a non-EU/unknown user (D-01 retention fail-safe)" do
      # An authoritative US signal AND an :unknown user must both stamp nil, never 'EU' --
      # stamping an unsure (potentially HIPAA-covered) row 'EU' would delete it early.
      non_eu_user = User.new(settings: { 'preferences' => { 'jurisdiction' => 'US' } })
      unknown_user = User.new(settings: { 'preferences' => { 'locale' => 'en' } })

      described_class.generate_words(prompt: 'snacks', rows: 2, columns: 2, user: non_eu_user)
      described_class.generate_words(prompt: 'snacks', rows: 2, columns: 2, user: unknown_user)

      expect(AiApiLog).to have_received(:log_ai_call).with(hash_including(
        jurisdiction: nil, article_50_disclosure_shown: false
      )).twice
    end
  end
end
