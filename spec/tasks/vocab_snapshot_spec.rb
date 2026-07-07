require 'spec_helper'

# Verifies the committed Phase 2 (concept-id namespace + vocab-set migration) Plan 01 vocab
# baseline/manifest files under db/language/en/. These are static, committed artifacts (produced
# by `rake vocab:snapshot` -- see db/language/README-vocab.md and
# .planning/phases/02-concept-id-namespace-vocab-set-migration/02-01-SUMMARY.md) -- this spec does
# NOT re-run the rake task; it locks the shape and content of what is already committed so any
# future regeneration that silently drops/changes entries fails loudly.
describe 'vocab snapshot artifacts (db/language/en/)' do
  let(:dir) { Rails.root.join('db', 'language', 'en') }
  let(:golden_dir) { dir.join('vocab-golden') }

  let(:live_core_lists) { JSON.parse(File.read(Rails.root.join('lib', 'core_lists.json'))) }
  let(:live_fringe) { JSON.parse(File.read(Rails.root.join('lib', 'fringe_suggestions.json'))) }

  let(:core_lists_snapshot) { JSON.parse(File.read(dir.join('core_lists.snapshot.json'))) }
  let(:fringe_snapshot) { JSON.parse(File.read(dir.join('fringe_suggestions.snapshot.json'))) }

  let(:core_lists_golden) { JSON.parse(File.read(golden_dir.join('core_lists.reader-golden.json'))) }
  let(:fringe_lists_golden) { JSON.parse(File.read(golden_dir.join('fringe_lists.reader-golden.json'))) }
  let(:derived_golden) { JSON.parse(File.read(golden_dir.join('derived-readers.reader-golden.json'))) }

  let(:classification) { JSON.parse(File.read(dir.join('non-concept-classification.json'))) }
  let(:duplicates) { JSON.parse(File.read(dir.join('duplicate-concepts.json'))) }

  describe 'pinned source snapshots (guards against silent source drift)' do
    it 'core_lists.snapshot.json parses and is content-equal to the live lib/core_lists.json' do
      expect(core_lists_snapshot).to eq(live_core_lists)
    end

    it 'fringe_suggestions.snapshot.json parses and is content-equal to the live lib/fringe_suggestions.json' do
      expect(fringe_snapshot).to eq(live_fringe)
    end
  end

  describe 'core_lists.reader-golden.json (WordData.core_lists before-image)' do
    it 'has exactly 4 list objects in source order, each with words' do
      ids = core_lists_golden['lists'].map { |l| l['id'] }
      expect(ids).to eq(%w[default project_core unc_common_core basic_core])
      core_lists_golden['lists'].each do |list|
        expect(list['words']).to be_a(Array)
        expect(list['words'].length).to be > 0
      end
    end
  end

  describe 'fringe_lists.reader-golden.json (WordData.fringe_lists before-image)' do
    it 'has a non-empty categories array including animal, body, food' do
      categories = fringe_lists_golden['lists'].first['categories']
      expect(categories).to be_a(Array)
      expect(categories.length).to be > 0
      ids = categories.map { |c| c['id'] }
      expect(ids).to include('animal', 'body', 'food')
    end
  end

  describe 'derived-readers.reader-golden.json (default_core_list / basic_core_list / standardized_words)' do
    it 'default_core_list begins with the default list order (more, i, you, ...)' do
      expect(derived_golden['default_core_list'].first(4)).to eq(%w[more i you help])
    end

    it 'basic_core_list begins with the basic_core list order (go, want, more, ...)' do
      expect(derived_golden['basic_core_list'].first(3)).to eq(%w[go want more])
    end

    it 'standardized_words_keys is a non-empty sorted union' do
      keys = derived_golden['standardized_words_keys']
      expect(keys).to be_a(Array)
      expect(keys.length).to be > 0
      expect(keys).to eq(keys.sort)
    end
  end

  describe 'non-concept-classification.json (VOCAB-03)' do
    it 'morpheme_marker is exactly the known set of leading/trailing "+" markers' do
      expect(classification['morpheme_marker'].sort).to eq(
        %w[+ed +en +er +est +ing +s to+].sort
      )
    end

    it 'pos_label is exactly the known set of POS category labels' do
      expect(classification['pos_label'].sort).to eq(
        %w[adjectives nouns determiners possessive].sort
      )
    end

    it 'contraction includes the known contraction forms don’t and i’m' do
      expect(classification['contraction']).to include("don’t", "i’m")
    end

    it 'slash_form captures do/does as its own category, not as a contraction' do
      expect(classification['slash_form']).to include('do/does')
      expect(classification['contraction']).to_not include('do/does')
    end

    it 'total equals the sum of all category entries' do
      expect(classification['total']).to eq(
        classification['morpheme_marker'].length + classification['pos_label'].length +
        classification['contraction'].length + classification['slash_form'].length
      )
    end
  end

  describe 'duplicate-concepts.json (VOCAB-04)' do
    it 'records the known cross-list duplicates (more, i, you, help)' do
      %w[more i you help].each do |word|
        expect(duplicates['duplicates']).to have_key(word)
        expect(duplicates['duplicates'][word]['count']).to be >= 2
      end
    end

    it 'records an intra-list default duplicate (when)' do
      expect(duplicates['duplicates']).to have_key('when')
      when_occurrences = duplicates['duplicates']['when']['occurrences']
      default_occurrences = when_occurrences.select { |o| o['list_id'] == 'default' }
      expect(default_occurrences.length).to be >= 2
    end

    it 'excludes non-concept surfaces from the main duplicates map and records them separately' do
      expect(duplicates['duplicates']).to_not have_key('+er')
      expect(duplicates['non_concept_repeats']).to have_key('+er')
    end
  end
end
