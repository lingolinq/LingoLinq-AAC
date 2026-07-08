require 'spec_helper'

# Multilingual Language Layer -- Phase 2, Plan 03. Proves the flag-gated seam wrapping
# WordData.core_lists/fringe_lists is mechanically zero-behavior-change:
#   - flag OFF (default): unchanged File.read path, deep-equal to the Plan 01 reader golden.
#   - flag ON + Setting['vocab/en'] ingested: reconstructed path, deep-equal to the SAME golden.
#   - flipping the flag with clear_lists between calls yields identical results either way.
#   - downstream readers (default_core_list, basic_core_list, standardized_words) observe
#     identical data on both flag states, by construction (COMPAT-01/02).
describe WordData, "vocab schema-2 seam" do
  let(:vocab_payload) do
    JSON.parse(File.read(Rails.root.join('db', 'language', 'en', 'vocab-en.json')))
  end
  let(:core_golden) do
    JSON.parse(File.read(Rails.root.join('db', 'language', 'en', 'vocab-golden', 'core_lists.reader-golden.json')))['lists']
  end
  let(:fringe_golden) do
    JSON.parse(File.read(Rails.root.join('db', 'language', 'en', 'vocab-golden', 'fringe_lists.reader-golden.json')))['lists']
  end

  def ingest_vocab_setting!
    Setting.set('vocab/en', vocab_payload, true)
  end

  after(:each) do
    Setting.where(key: 'vocab/en').destroy_all
    RedisInit.default.del('setting/vocab/en')
    WordData.clear_lists
  end

  describe "flag OFF (default)" do
    it "core_lists / fringe_lists are deep-equal to the reader golden (unchanged File.read path)" do
      WordData.clear_lists
      expect(WordData.core_lists).to eq(core_golden)
      expect(WordData.fringe_lists).to eq(fringe_golden)
    end
  end

  describe "flag ON + Setting['vocab/en'] ingested" do
    before(:each) do
      allow(FeatureFlags).to receive(:multilingual_grammar_enabled_for?).and_call_original
      allow(FeatureFlags).to receive(:multilingual_grammar_enabled_for?).with(nil).and_return(true)
      ingest_vocab_setting!
      WordData.clear_lists
    end

    it "core_lists / fringe_lists reconstruct to the SAME reader golden" do
      expect(WordData.core_lists).to eq(core_golden)
      expect(WordData.fringe_lists).to eq(fringe_golden)
    end
  end

  describe "flipping the flag with clear_lists between calls" do
    it "yields identical core_lists/fringe_lists on both flag states" do
      allow(FeatureFlags).to receive(:multilingual_grammar_enabled_for?).and_call_original
      allow(FeatureFlags).to receive(:multilingual_grammar_enabled_for?).with(nil).and_return(false)
      WordData.clear_lists
      off_core = WordData.core_lists
      off_fringe = WordData.fringe_lists

      ingest_vocab_setting!
      allow(FeatureFlags).to receive(:multilingual_grammar_enabled_for?).with(nil).and_return(true)
      WordData.clear_lists
      on_core = WordData.core_lists
      on_fringe = WordData.fringe_lists

      allow(FeatureFlags).to receive(:multilingual_grammar_enabled_for?).with(nil).and_return(false)
      WordData.clear_lists
      off_again_core = WordData.core_lists
      off_again_fringe = WordData.fringe_lists

      expect(off_core).to eq(on_core)
      expect(off_fringe).to eq(on_fringe)
      expect(off_core).to eq(off_again_core)
      expect(off_fringe).to eq(off_again_fringe)
    end
  end

  describe "downstream reader parity across flag states" do
    it "default_core_list.first, basic_core_list.first, and a standardized_words key are identical" do
      WordData.clear_lists
      off_default_first = WordData.default_core_list.first
      off_basic_first = WordData.basic_core_list.first
      off_standardized = WordData.standardized_words

      ingest_vocab_setting!
      allow(FeatureFlags).to receive(:multilingual_grammar_enabled_for?).and_call_original
      allow(FeatureFlags).to receive(:multilingual_grammar_enabled_for?).with(nil).and_return(true)
      WordData.clear_lists
      on_default_first = WordData.default_core_list.first
      on_basic_first = WordData.basic_core_list.first
      on_standardized = WordData.standardized_words

      expect(on_default_first).to eq(off_default_first)
      expect(on_basic_first).to eq(off_basic_first)
      expect(on_standardized.keys.sort).to eq(off_standardized.keys.sort)
      expect(on_standardized).to have_key(off_default_first)
    end
  end
end
