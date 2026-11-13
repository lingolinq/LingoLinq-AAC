# frozen_string_literal: true

require 'spec_helper'

describe AiBoardGenerator do
  def anthropic_response(text, stop_reason: nil)
    usage = double('usage', input_tokens: 10, output_tokens: 20)
    block = double('text_block', type: 'text', text: text)
    attrs = { content: [block], usage: usage }
    attrs[:stop_reason] = stop_reason if stop_reason
    double('anthropic_response', **attrs)
  end

  def numbered(*items, name: 'Snacks', description: 'Snack words.')
    lines = items.each_with_index.map { |w, i| "#{i + 1}. #{w}" }
    (lines + ["NAME: #{name}", "DESCRIPTION: #{description}"]).join("\n")
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

    # Changed 2026-11-13 at Traci's request: a short list is no longer refused. The board is
    # made with the words found and the remaining cells left empty.
    it "returns the words found, with a shortfall, when still short after the top-up" do
      first = "WORDS: apple, banana\nNAME: Snacks\nDESCRIPTION: Snack words."
      second = "WORDS: apple, banana, carrot\nNAME: Snacks\nDESCRIPTION: Snack words."
      allow(described_class).to receive(:call_anthropic).and_return(
        anthropic_response(first),
        anthropic_response(second)
      )

      result = described_class.generate_words(prompt: 'snacks', rows: 2, columns: 2)

      expect(result[:words]).to eq(%w[apple banana carrot])
      expect(result[:shortfall]).to eq(1)
      expect(result[:error]).to eq(nil)
      expect(described_class).to have_received(:call_anthropic).twice
      expect(AiApiLog).to have_received(:log_ai_call).with(hash_including(provider: 'claude', success: true))
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
      # The Article 50 marker records the id that was ACTUALLY invoked (the
      # resolved wire id), not the plane-neutral alias. On the classic Bedrock
      # plane that is the inference-profile id, which is strictly more precise:
      # it pins the dated model version AND the routing scope (a `us.` profile
      # means inference ran in a US region, which is itself relevant to an
      # EU-jurisdiction data-flow record). Asserted through AiClient.bedrock_model
      # so this stays correct on either plane.
      expect(result[:ai_generated]['model']).to eq(AiClient.bedrock_model(AiBoardGenerator::DEFAULT_MODEL))
      expect(logged[:ai_content_marked]).to eq(true)
      expect(logged[:ai_generated_content_id]).to eq(result[:ai_generated]['content_id'])
    end

    # Changed 2026-11-13 with the shortfall rule above: a partial list is delivered AI output, so
    # it carries the Article 50 marker. A reply with no usable words delivers nothing and stays unmarked.
    it "marks a partial list, and leaves a reply with no usable words unmarked" do
      short = "WORDS: apple, banana\nNAME: Snacks\nDESCRIPTION: x."
      allow(described_class).to receive(:call_anthropic).and_return(
        anthropic_response(short), anthropic_response(short)
      )
      result = described_class.generate_words(prompt: 'snacks', rows: 2, columns: 2)
      expect(result[:words]).to eq(%w[apple banana])
      expect(Art50Marker.verify(result[:ai_generated])).to eq(true)

      allow(described_class).to receive(:call_anthropic).and_return(
        anthropic_response("I can't help with that."), anthropic_response("I can't help with that.")
      )
      empty = described_class.generate_words(prompt: 'snacks', rows: 2, columns: 2)
      expect(empty[:words]).to eq(nil)
      expect(empty[:error]).to be_present
      expect(empty[:ai_generated]).to eq(nil)
    end

    describe "numbered replies (2026-11-13: the comma line miscounted, numbering hit the count)" do
      it "reads a numbered list and its NAME and DESCRIPTION in one call" do
        allow(described_class).to receive(:call_anthropic).and_return(anthropic_response(numbered('apple', 'banana', 'carrot', 'drink')))
        result = described_class.generate_words(prompt: 'snacks', rows: 2, columns: 2)
        expect(result[:words]).to eq(%w[apple banana carrot drink])
        expect(result[:name]).to eq('Snacks')
        expect(result[:description]).to eq('Snack words.')
        expect(described_class).to have_received(:call_anthropic).once
      end

      it "asks for a numbered list" do
        prompts = []
        allow(described_class).to receive(:call_anthropic) { |**kw| prompts << kw; anthropic_response(numbered('a1', 'b2', 'c3', 'd4')) }
        described_class.generate_words(prompt: 'snacks', rows: 2, columns: 2)
        expect(prompts.first[:system_prompt]).to match(/numbered list/i)
      end

      it "reads list shapes models actually produce" do
        raw = ["```", "1) apple", "**2.** banana", "- 3. **carrot**", "4、苹果", "５．りんご", "6.drink", "```", "NAME: Snacks"].join("\n")
        allow(described_class).to receive(:call_anthropic).and_return(anthropic_response(raw))
        result = described_class.generate_words(prompt: 'snacks', rows: 2, columns: 3)
        expect(result[:words]).to eq(%w[apple banana carrot 苹果 りんご drink])
      end

      it "never takes a NAME or DESCRIPTION line, numbered or not, as a word" do
        raw = ["1. apple", "2. banana", "3. NAME: Snacks", "4. carrot", "DESCRIPTION: Snack words.", "5. drink"].join("\n")
        allow(described_class).to receive(:call_anthropic).and_return(anthropic_response(raw))
        result = described_class.generate_words(prompt: 'snacks', rows: 2, columns: 2)
        expect(result[:words]).to eq(%w[apple banana carrot drink])
      end

      it "splits an item with a comma so one cell never becomes two later" do
        allow(described_class).to receive(:call_anthropic).and_return(anthropic_response(numbered('apple', 'salt, pepper', 'drink')))
        result = described_class.generate_words(prompt: 'snacks', rows: 2, columns: 2)
        expect(result[:words]).to eq(%w[apple salt pepper drink])
        expect(result[:words].join(', ').split(/,\s*/).length).to eq(4)
      end

      it "removes repeats, ignoring case" do
        allow(described_class).to receive(:call_anthropic).and_return(
          anthropic_response(numbered('apple', 'Apple', 'banana', 'carrot')),
          anthropic_response(numbered('drink'))
        )
        result = described_class.generate_words(prompt: 'snacks', rows: 2, columns: 2)
        expect(result[:words]).to eq(%w[apple banana carrot drink])
      end

      it "drops the last item of a reply cut off at the token limit" do
        allow(described_class).to receive(:call_anthropic).and_return(
          anthropic_response(numbered('apple', 'banana', 'carrot', 'dri'), stop_reason: 'max_tokens'),
          anthropic_response(numbered('drink'))
        )
        result = described_class.generate_words(prompt: 'snacks', rows: 2, columns: 2)
        expect(result[:words]).to eq(%w[apple banana carrot drink])
      end

      it "treats a reply with neither numbered lines nor a WORDS line as unreadable, not as words" do
        bullets = "- apple\n- banana\nNAME: Snacks\nDESCRIPTION: A board for snacks."
        allow(described_class).to receive(:call_anthropic).and_return(anthropic_response(bullets), anthropic_response(bullets))
        result = described_class.generate_words(prompt: 'snacks', rows: 2, columns: 2)
        expect(result[:words]).to eq(nil)
        expect(result[:error]).to be_present
        expect(AiApiLog).to have_received(:log_ai_call).with(hash_including(success: false))
      end
    end

    describe "top-up for the missing words" do
      it "asks only for the missing count, listing the words already chosen" do
        prompts = []
        replies = [anthropic_response(numbered('apple', 'banana')), anthropic_response(numbered('carrot', 'drink'))]
        allow(described_class).to receive(:call_anthropic) { |**kw| prompts << kw; replies.shift }
        result = described_class.generate_words(prompt: 'snacks', rows: 2, columns: 2)
        expect(result[:words]).to eq(%w[apple banana carrot drink])
        expect(result[:shortfall]).to eq(0)
        expect(prompts.length).to eq(2)
        expect(prompts.last[:cell_count]).to eq(2)
        expect(prompts.last[:user_prompt]).to include('apple').and include('banana')
      end

      it "makes at most two calls when every reply is short" do
        allow(described_class).to receive(:call_anthropic).and_return(anthropic_response(numbered('apple')))
        described_class.generate_words(prompt: 'snacks', rows: 2, columns: 2)
        expect(described_class).to have_received(:call_anthropic).twice
      end

      it "keeps the first call's words when the top-up fails" do
        calls = 0
        allow(described_class).to receive(:call_anthropic) do
          calls += 1
          raise Faraday::TimeoutError, 'slow' if calls == 2
          anthropic_response(numbered('apple', 'banana', 'carrot'))
        end
        result = described_class.generate_words(prompt: 'snacks', rows: 2, columns: 2)
        expect(result[:words]).to eq(%w[apple banana carrot])
        expect(result[:shortfall]).to eq(1)
        expect(result[:error]).to eq(nil)
        expect(AiApiLog).to have_received(:log_ai_call).with(hash_including(success: true))
      end

      it "skips the top-up when the first call used up the time budget" do
        allow(described_class).to receive(:call_anthropic).and_return(anthropic_response(numbered('apple', 'banana', 'carrot')))
        allow(described_class).to receive(:topup_time_left?).and_return(false)
        result = described_class.generate_words(prompt: 'snacks', rows: 2, columns: 2)
        expect(described_class).to have_received(:call_anthropic).once
        expect(result[:words]).to eq(%w[apple banana carrot])
      end

      it "adds up token usage from both calls in the audit row" do
        logged = nil
        allow(AiApiLog).to receive(:log_ai_call) { |**kw| logged = kw }
        allow(described_class).to receive(:call_anthropic).and_return(
          anthropic_response(numbered('apple', 'banana')), anthropic_response(numbered('carrot', 'drink'))
        )
        described_class.generate_words(prompt: 'snacks', rows: 2, columns: 2)
        expect(logged[:tokens_sent]).to eq(20)
        expect(logged[:tokens_received]).to eq(40)
      end

      # The email arrives twice: in the person's description, and echoed back by the model inside the
      # words that become the top-up's do-not-repeat list.
      it "sends no unscrubbed email on either call" do
        prompts = []
        replies = [anthropic_response(numbered('apple', 'teacher@example.com')), anthropic_response(numbered('carrot', 'drink'))]
        allow(described_class).to receive(:call_anthropic) { |**kw| prompts << kw; replies.shift }
        described_class.generate_words(prompt: 'snacks for parent@example.com', rows: 2, columns: 2)
        expect(prompts.length).to eq(2)
        prompts.each { |kw| expect(kw[:user_prompt]).not_to include('parent@example.com') }
        expect(prompts.last[:user_prompt]).not_to include('teacher@example.com')
      end

      it "writes the audit row and re-raises when the request runs out of time" do
        allow(described_class).to receive(:call_anthropic).and_raise(Rack::Timeout::RequestTimeoutException.new({}))
        expect {
          described_class.generate_words(prompt: 'snacks', rows: 2, columns: 2)
        }.to raise_error(Rack::Timeout::RequestTimeoutException)
        expect(AiApiLog).to have_received(:log_ai_call).with(hash_including(success: false))
      end
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
      # stamping an unsure row 'EU' would put it in a purge that cannot be undone.
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
