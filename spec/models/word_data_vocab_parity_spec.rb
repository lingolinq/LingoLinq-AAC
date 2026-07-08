require 'spec_helper'
require 'tmpdir'

# Reader-output parity (COMPAT-side confirmation, gates TEST-01): proves WordData.core_lists,
# fringe_lists, default_core_list, basic_core_list, and standardized_words -- plus the two
# direct-file callers (prediction_library starter list, ai_prediction_generator starter set) --
# return output deep-equal to the committed Plan 01 pre-migration reader golden on BOTH flag
# states (flag OFF via the unchanged flat files, flag ON via Setting['vocab/en'] reconstruction).
# Mechanical equality against a frozen baseline, per CLAUDE.md RULE #0.
describe 'vocab-en.json reader-output parity (TEST-01 gate confirmation)' do
  let(:vocab_payload) do
    JSON.parse(File.read(Rails.root.join('db', 'language', 'en', 'vocab-en.json')))
  end
  let(:core_golden) do
    JSON.parse(File.read(Rails.root.join('db', 'language', 'en', 'vocab-golden', 'core_lists.reader-golden.json')))['lists']
  end
  let(:fringe_golden) do
    JSON.parse(File.read(Rails.root.join('db', 'language', 'en', 'vocab-golden', 'fringe_lists.reader-golden.json')))['lists']
  end
  let(:derived_golden) do
    JSON.parse(File.read(Rails.root.join('db', 'language', 'en', 'vocab-golden', 'derived-readers.reader-golden.json')))
  end

  def ingest_vocab_setting!
    Setting.set('vocab/en', vocab_payload, true)
  end

  def stub_flag(enabled)
    allow(FeatureFlags).to receive(:multilingual_grammar_enabled_for?).and_call_original
    allow(FeatureFlags).to receive(:multilingual_grammar_enabled_for?).with(nil).and_return(enabled)
  end

  # Scoped to this describe block (not global) per CLAUDE.md's "AuditEvent escapes RSpec txn" /
  # "Test DB carries orphaned rows" notes -- avoid leaking the vocab/en Setting or WordData's
  # memoized list state into other specs.
  after(:each) do
    Setting.where(key: 'vocab/en').destroy_all
    RedisInit.default.del('setting/vocab/en')
    WordData.clear_lists
  end

  shared_examples 'the five vocab readers deep-equal the frozen golden' do
    it 'core_lists deep-equals the core reader golden' do
      expect(WordData.core_lists).to eq(core_golden)
    end

    it 'fringe_lists deep-equals the fringe reader golden' do
      expect(WordData.fringe_lists).to eq(fringe_golden)
    end

    it 'default_core_list deep-equals the derived-readers golden' do
      expect(WordData.default_core_list).to eq(derived_golden['default_core_list'])
    end

    it 'basic_core_list deep-equals the derived-readers golden' do
      expect(WordData.basic_core_list).to eq(derived_golden['basic_core_list'])
    end

    it 'standardized_words keys deep-equal the derived-readers golden keys' do
      expect(WordData.standardized_words.keys.sort).to eq(derived_golden['standardized_words_keys'].sort)
    end
  end

  describe 'flag OFF (default, unchanged File.read path)' do
    before(:each) do
      stub_flag(false)
      WordData.clear_lists
    end

    include_examples 'the five vocab readers deep-equal the frozen golden'
  end

  describe 'flag ON (Setting[\'vocab/en\'] ingested, reconstructed path)' do
    before(:each) do
      stub_flag(true)
      ingest_vocab_setting!
      WordData.clear_lists
    end

    include_examples 'the five vocab readers deep-equal the frozen golden'
  end

  describe 'the two direct-file callers (COMPAT-02 end to end)' do
    it 'PredictionLibrary.export_spelling_words! output is identical flag-OFF vs flag-ON' do
      stub_flag(false)
      WordData.clear_lists
      off_output = Dir.mktmpdir do |dir|
        PredictionLibrary.export_spelling_words!(
          output_path: File.join(dir, 'spelling_core_words.json'),
          ngrams_payload: { 'suggestions' => {} }
        )
      end

      ingest_vocab_setting!
      stub_flag(true)
      WordData.clear_lists
      on_output = Dir.mktmpdir do |dir|
        PredictionLibrary.export_spelling_words!(
          output_path: File.join(dir, 'spelling_core_words.json'),
          ngrams_payload: { 'suggestions' => {} }
        )
      end

      expect(off_output).to_not be_empty
      expect(on_output).to eq(off_output)
    end

    it 'AiPredictionGenerator starter list (core-vocab portion) is identical flag-OFF vs flag-ON' do
      stub_flag(false)
      WordData.clear_lists
      off_starters = AiPredictionGenerator.send(:build_starter_list)

      ingest_vocab_setting!
      stub_flag(true)
      WordData.clear_lists
      on_starters = AiPredictionGenerator.send(:build_starter_list)

      expect(off_starters).to_not be_empty
      expect(on_starters).to eq(off_starters)
    end
  end
end
