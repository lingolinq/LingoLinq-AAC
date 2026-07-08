# frozen_string_literal: true

# Utilities for building and merging the global word-prediction library.
module PredictionLibrary
  OUTPUT_DIR  = Rails.root.join('public', 'language')
  OUTPUT_FILE = OUTPUT_DIR.join('ngrams.arpa.trimmed.10.json')
  SPELLING_WORDS_FILE = OUTPUT_DIR.join('spelling_core_words.json')
  CORE_LISTS_FILE = Rails.root.join('lib', 'core_lists.json')
  SMART_PHRASES_FILE = Rails.root.join('lib', 'smart_phrases.json')
  LIBRARY_VERSION = '1'

  class << self
    def smart_phrases
      return @smart_phrases if @smart_phrases

      raw = File.exist?(SMART_PHRASES_FILE) ? JSON.parse(File.read(SMART_PHRASES_FILE)) : {}
      @smart_phrases = raw.transform_keys { |k| k.to_s.downcase.strip }
    end

    def smart_phrases_as_ngrams
      smart_phrases.each_with_object({}) do |(prefix, words), ngrams|
        ngrams[prefix] = Array.wrap(words).each_with_index.map do |word, idx|
          [word.to_s.downcase.strip, -(idx * 0.5)]
        end
      end
    end

    def load_existing_payload(path = OUTPUT_FILE)
      return { 'suggestions' => {} } unless File.exist?(path)

      JSON.parse(File.read(path))
    rescue JSON::ParserError
      { 'suggestions' => {} }
    end

    def merge_payloads(*payloads)
      merged = { 'suggestions' => {} }
      payloads.each do |payload|
        next unless payload.is_a?(Hash)

        suggestions = payload['suggestions'] || payload[:suggestions] || {}
        suggestions.each do |prefix, entries|
          key = prefix.to_s.downcase.strip
          merged['suggestions'][key] ||= []
          merged['suggestions'][key].concat(Array.wrap(entries))
        end
      end

      merged['suggestions'].each do |prefix, entries|
        seen = {}
        deduped = []
        entries.each do |entry|
          word = entry.is_a?(Array) ? entry[0] : entry
          word = word.to_s.downcase.strip
          next if word.blank? || seen[word]

          seen[word] = true
          score = entry.is_a?(Array) && entry[1] ? entry[1] : -(deduped.length * 0.5)
          deduped << [word, score]
        end
        merged['suggestions'][prefix] = deduped
      end

      merged
    end

    def with_metadata(payload)
      payload = payload.with_indifferent_access
      payload[:version] = LIBRARY_VERSION
      payload[:generated_at] = Time.now.utc.iso8601
      payload
    end

    def export_spelling_words!(output_path: SPELLING_WORDS_FILE, ngrams_payload: nil)
      words = Set.new
      # Multilingual Language Layer -- Phase 2, Plan 03. Routed through WordData.core_lists
      # (the shared flag-gated accessor) instead of reading CORE_LISTS_FILE directly, so this
      # observes identical output through Setting['vocab/en'] once the schema-2 vocab source is
      # active (COMPAT-02); flag-OFF behavior is byte-identical since the accessor reads this
      # same flat file. CORE_LISTS_FILE stays defined for other callers/tests.
      WordData.core_lists.each do |list|
        Array.wrap(list['words']).each do |word|
          normalized = word.to_s.downcase.strip
          next if normalized.blank? || normalized.start_with?('+') || normalized.length > 30

          words << normalized
        end
      end

      payload = ngrams_payload || load_existing_payload
      (payload['suggestions'] || {}).each_value do |entries|
        Array.wrap(entries).each do |entry|
          normalized = (entry.is_a?(Array) ? entry[0] : entry).to_s.downcase.strip
          next if normalized.blank? || normalized.include?(' ')

          words << normalized
        end
      end

      filtered = words.select { |word| word.length > 1 }.sort
      FileUtils.mkdir_p(File.dirname(output_path))
      File.write(output_path, JSON.pretty_generate(with_metadata({ 'words' => filtered })))

      puts "[predictions] Spelling core words written to #{output_path} (#{filtered.length} words)"
      filtered
    end

    def merge_and_write!(output_path: OUTPUT_FILE)
      existing = load_existing_payload(output_path)
      smart = { 'suggestions' => smart_phrases_as_ngrams }
      merged = merge_payloads(existing, smart)
      merged = with_metadata(merged)

      FileUtils.mkdir_p(File.dirname(output_path))
      File.write(output_path, JSON.pretty_generate(merged))
      export_spelling_words!(ngrams_payload: merged)

      puts "[predictions] Merged library written to #{output_path}"
      puts "[predictions] Entries: #{merged['suggestions'].keys.length}"
      merged
    end
  end
end
