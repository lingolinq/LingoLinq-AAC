# frozen_string_literal: true

# Generates a comprehensive word-prediction dictionary using AI.
# Produces a JSON file in the format word_suggestions.js expects:
#   { "suggestions": { "": [["the", -1.0], ...], "want": [["to", -0.3], ...] } }
#
# The AI is called in batches — each batch sends ~50 starter words and
# receives predictions for all of them in one API call, keeping total
# request count low (~100 calls for 5,000 starters).
#
# Output: public/language/ngrams.arpa.trimmed.10.json

module AiPredictionGenerator
  OUTPUT_DIR  = Rails.root.join('public', 'language')
  OUTPUT_FILE = OUTPUT_DIR.join('ngrams.arpa.trimmed.10.json')

  # How many starter words to send per API call
  BATCH_SIZE = 50

  # Pause between API calls to stay within rate limits
  RATE_PAUSE = 4 # seconds (keeps us under 20 req/min for Gemini free tier)

  class << self
    def generate(batch_size: nil)
      api_config = resolve_api_config
      if api_config.blank?
        puts "[predictions] ERROR: No ANTHROPIC_API_KEY or GEMINI_API_KEY configured"
        return
      end
      puts "[predictions] Using provider: #{api_config[:provider]} (#{api_config[:model]})"

      starters = build_starter_list
      puts "[predictions] Generated #{starters.length} starter words/phrases"

      if batch_size
        starters = starters.first(batch_size)
        puts "[predictions] Limited to #{starters.length} starters (batch_size=#{batch_size})"
      end

      ngrams = {}

      # Process in batches
      batches = starters.each_slice(BATCH_SIZE).to_a
      puts "[predictions] Processing #{batches.length} batches of ~#{BATCH_SIZE} words..."

      batches.each_with_index do |batch, idx|
        print "[predictions] Batch #{idx + 1}/#{batches.length}... "
        result = generate_batch(api_config, batch)

        result.each do |word, predictions|
          key = word.downcase.strip
          ngrams[key] = predictions.each_with_index.map do |pred, i|
            # Assign descending probability scores so the order is preserved
            [pred.downcase.strip, -(i * 0.5)]
          end
        end

        puts "got #{result.keys.length} entries"
        sleep(RATE_PAUSE) if idx < batches.length - 1
      end

      # Build the top-level fallback ("" key) from the most common words
      common = %w[I you we they it he she want need like go get make do have
                  is are can will more not the a my your this that what where
                  when how why help please yes no]
      ngrams[""] = common.each_with_index.map { |w, i| [w, -(i * 0.3)] }

      # Write output
      FileUtils.mkdir_p(OUTPUT_DIR)
      payload = { "suggestions" => ngrams }
      File.write(OUTPUT_FILE, JSON.pretty_generate(payload))

      puts "[predictions] Done! Wrote #{ngrams.keys.length} entries to #{OUTPUT_FILE}"
      puts "[predictions] File size: #{(File.size(OUTPUT_FILE) / 1024.0).round(1)} KB"
    end

    def upload_to_s3
      unless File.exist?(OUTPUT_FILE)
        puts "[predictions] ERROR: #{OUTPUT_FILE} not found. Run predictions:generate first."
        return
      end

      bucket = ENV['STATIC_S3_BUCKET'] || ENV['S3_BUCKET'] || 'lingolinq-prod-static'
      s3_key = 'language/ngrams.arpa.trimmed.10.json'

      puts "[predictions] Uploading to s3://#{bucket}/#{s3_key}..."

      require 'aws-sdk-s3'
      s3 = Aws::S3::Client.new
      File.open(OUTPUT_FILE, 'rb') do |file|
        s3.put_object(
          bucket: bucket,
          key: s3_key,
          body: file,
          content_type: 'application/json',
          cache_control: 'public, max-age=86400'
        )
      end
      puts "[predictions] Upload complete!"
    end

    private

    def resolve_api_config
      anthropic_key = ENV['ANTHROPIC_API_KEY'].to_s.strip
      if anthropic_key.present?
        return {
          provider: :claude,
          api_key: anthropic_key,
          model: ENV.fetch('ANTHROPIC_MODEL', 'claude-haiku-4-5-20251001')
        }
      end
      gemini_key = ENV['GEMINI_API_KEY'].to_s.strip
      if gemini_key.present?
        return {
          provider: :gemini,
          api_key: gemini_key,
          model: ENV.fetch('GEMINI_MODEL', 'gemini-2.0-flash')
        }
      end
      nil
    end

    def build_starter_list
      starters = Set.new

      # 1. Core AAC vocabulary from curated lists
      core_file = Rails.root.join('lib', 'core_lists.json')
      if File.exist?(core_file)
        lists = JSON.parse(File.read(core_file))
        lists.each do |list|
          (list['words'] || []).each do |w|
            word = w.to_s.strip.downcase
            next if word.empty? || word.start_with?('+') || word.length > 20
            starters << word
          end
        end
      end

      # 2. Common two-word phrases (high-value for predictions)
      two_word = %w[
        I\ want I\ need I\ like I\ feel I\ am I\ can I\ will I\ don't
        you\ are you\ can you\ want you\ need
        he\ is he\ can he\ wants she\ is she\ can she\ wants
        we\ can we\ are we\ want we\ need
        they\ are they\ can they\ want
        it\ is it\ was
        do\ you can\ you will\ you did\ you are\ you
        don't\ want don't\ like don't\ know
        want\ to need\ to like\ to going\ to have\ to
        let\ me help\ me tell\ me give\ me show\ me watch\ me
        look\ at listen\ to come\ here come\ back go\ to
        play\ with talk\ about think\ about
        how\ about how\ many how\ much
        thank\ you excuse\ me
        a\ lot all\ done
        I\ am\ not
      ]
      two_word.each { |p| starters << p.downcase }

      # 3. Common single-word starters that might not be in core lists
      extras = %w[
        after again also always another any because before between both but
        by could did does each even every far few first from got had has
        him her his how if into its just keep last let long made many
        may might most much must never new next now off often old only
        other our own part please pull push put right said same should
        since still such take tell than then these those through together
        too under until upon very well were what when where which while
        who why will with would yes yet
      ]
      extras.each { |w| starters << w }

      starters.to_a.sort
    end

    def generate_batch(api_config, words)
      prompt = build_batch_prompt(words)

      retries = 0
      max_retries = 5
      begin
        raw = case api_config[:provider]
              when :claude
                call_anthropic(api_config, prompt)
              when :gemini
                call_gemini(api_config, prompt)
              else
                ''
              end
        parse_batch_response(raw, words)
      rescue Faraday::TooManyRequestsError, Faraday::Error => e
        retries += 1
        if retries <= max_retries
          wait = [30, retries * 15].max
          print "(429 — waiting #{wait}s, retry #{retries}/#{max_retries}) "
          sleep(wait)
          retry
        end
        puts "ERROR: rate limit exceeded after #{max_retries} retries"
        {}
      rescue => e
        puts "ERROR: #{e.class}: #{e.message}"
        {}
      end
    end

    def build_batch_prompt(words)
      word_list = words.map { |w| "- #{w}" }.join("\n")
      <<~PROMPT
        You are generating word-prediction data for an AAC (Augmentative and Alternative Communication) app used by people with speech disabilities.

        For each word or phrase below, predict the 8 most likely NEXT words a person would say. These should be common, simple, everyday words appropriate for AAC users of all ages.

        Format your response as one line per word, like this:
        word: next1, next2, next3, next4, next5, next6, next7, next8

        For two-word phrases, use the full phrase as the key:
        I want: to, more, it, that, some, one, this, help

        Rules:
        - Only output the word/phrase and its predictions, nothing else
        - Predictions should be contextually appropriate
        - Prefer high-frequency, simple words
        - Include a mix of verbs, nouns, pronouns, and connectors
        - Each prediction should be a single word (no phrases)
        - Think about what an AAC user communicating basic needs, feelings, activities, and social interactions would most likely say next

        Words to predict for:
        #{word_list}
      PROMPT
    end

    def call_anthropic(config, prompt)
      require 'anthropic'
      client = Anthropic::Client.new(api_key: config[:api_key])
      response = client.messages.create(
        model: config[:model],
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }]
      )
      response.dig('content', 0, 'text') || ''
    end

    def call_gemini(config, prompt)
      require 'openai'
      client = OpenAI::Client.new(
        access_token: config[:api_key],
        uri_base: 'https://generativelanguage.googleapis.com/v1beta/openai/'
      )
      response = client.chat(
        parameters: {
          model: config[:model],
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 4096,
          temperature: 0.3
        }
      )
      response.dig('choices', 0, 'message', 'content') || ''
    end

    def parse_batch_response(raw, expected_words)
      result = {}
      raw.each_line do |line|
        line = line.strip
        next if line.empty?

        # Match "word: pred1, pred2, ..." or "word phrase: pred1, pred2, ..."
        match = line.match(/^(.+?):\s*(.+)$/)
        next unless match

        key = match[1].strip.downcase
        predictions = match[2].split(',').map { |w| w.gsub(/[^a-zA-Z'\- ]/, '').strip }.reject(&:empty?)
        next if predictions.empty?

        result[key] = predictions.first(8)
      end
      result
    end
  end
end
