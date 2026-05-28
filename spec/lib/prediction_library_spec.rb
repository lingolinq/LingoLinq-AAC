# frozen_string_literal: true

require 'spec_helper'

describe PredictionLibrary do
  describe '.smart_phrases_as_ngrams' do
    it 'converts smart phrases into ngram entries' do
      ngrams = described_class.smart_phrases_as_ngrams
      expect(ngrams['when']).to eq([
        ['do you', -0.0],
        ['can i', -0.5],
        ['will you', -1.0],
        ['is it', -1.5],
        ['are we', -2.0],
        ['did you', -2.5]
      ])
    end
  end

  describe '.merge_payloads' do
    it 'deduplicates overlapping entries' do
      first = { 'suggestions' => { 'want' => [['to', -0.5], ['more', -1.0]] } }
      second = { 'suggestions' => { 'want' => [['to', -2.0], ['help', -0.5]] } }
      merged = described_class.merge_payloads(first, second)
      words = merged['suggestions']['want'].map(&:first)
      expect(words).to eq(%w[to more help])
    end
  end

  describe '.export_spelling_words!' do
    it 'writes a sorted unique word list for keyboard spelling' do
      path = Rails.root.join('tmp', 'spelling_core_words_test.json')
      FileUtils.rm_f(path)
      words = described_class.export_spelling_words!(
        output_path: path,
        ngrams_payload: { 'suggestions' => { '' => [['zebra', -1.0]] } }
      )
      expect(words).to include('stop', 'street', 'start')
      expect(words).not_to include('i', 'a')
      payload = JSON.parse(File.read(path))
      expect(payload['words']).to eq(words)
    ensure
      FileUtils.rm_f(path)
    end
  end
end
