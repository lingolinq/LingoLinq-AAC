require 'spec_helper'

# Concept-attribution + reachability parity (TEST-01, this migration's concept-namespace hard
# gate): for EVERY word/phrase in EVERY legacy core array and EVERY fringe category (read from
# the committed `.snapshot.json` baselines -- the exhaustive source surfaces, not a sample),
# proves it is reachable through `vocab-en.json` and is EITHER attributed to exactly one
# `concept_id` in the registry OR explicitly present in the Plan 01 non-concept classification
# manifest -- never silently absent. Mirrors Phase 1's `parity_spec.rb` count-locking discipline:
# a frozen, file-independent expected count catches a corrupted/truncated baseline, and a closed
# coverage equation (computed live from the committed artifacts) catches any future add/drop of a
# source surface.
describe 'vocab-en.json concept-attribution + reachability parity (TEST-01)' do
  # Frozen at Plan 02 (02-02-SUMMARY.md: "2285 distinct concepts" / Plan 01's
  # non-concept-classification.json: "total": 40). These constants are hardcoded independently of
  # the committed files' own lengths so a corrupted or truncated baseline fails these assertions
  # instead of silently redefining "the baseline".
  COMMITTED_REGISTRY_CONCEPT_COUNT = 2285
  COMMITTED_NON_CONCEPT_COUNT = 40
  COMMITTED_DISTINCT_SOURCE_SURFACE_COUNT = 2325

  let(:core_lists_snapshot) do
    JSON.parse(File.read(Rails.root.join('db', 'language', 'en', 'core_lists.snapshot.json')))
  end
  let(:fringe_snapshot) do
    JSON.parse(File.read(Rails.root.join('db', 'language', 'en', 'fringe_suggestions.snapshot.json')))
  end
  let(:vocab) do
    JSON.parse(File.read(Rails.root.join('db', 'language', 'en', 'vocab-en.json')))
  end
  let(:non_concept_classification) do
    JSON.parse(File.read(Rails.root.join('db', 'language', 'en', 'non-concept-classification.json')))
  end
  let(:duplicate_concepts) do
    JSON.parse(File.read(Rails.root.join('db', 'language', 'en', 'duplicate-concepts.json')))
  end

  let(:core_by_id) { core_lists_snapshot.each_with_object({}) { |l, h| h[l['id']] = l['words'] } }
  let(:fringe_by_id) { fringe_snapshot.first['categories'].each_with_object({}) { |c, h| h[c['id']] = c['words'] } }

  let(:vocab_sets_by_id) { vocab['sets'].each_with_object({}) { |s, h| h[s['id']] = s } }
  let(:vocab_concepts) { vocab['concepts'] }

  # Every (surface, source-list-or-category) occurrence across every core array and every fringe
  # category -- the exhaustive source surface set this spec iterates (not a sample).
  let(:all_source_occurrences) do
    occurrences = []
    core_lists_snapshot.each do |list|
      list['words'].each { |w| occurrences << [w, "core:#{list['id']}"] }
    end
    fringe_snapshot.first['categories'].each do |cat|
      cat['words'].each { |w| occurrences << [w, "fringe:#{cat['id']}"] }
    end
    occurrences
  end

  let(:non_concept_all) do
    %w[contraction morpheme_marker pos_label slash_form].flat_map { |k| non_concept_classification[k] }.to_set
  end

  describe 'reachability + attribution (every legacy surface accounted for)' do
    it 'every surface in every core array and every fringe category is either a registry concept or a classified non-concept' do
      failures = []

      all_source_occurrences.each do |surface, source|
        next if vocab_concepts.key?(surface)
        next if non_concept_all.include?(surface)

        failures << "surface=#{surface.inspect} source=#{source} is neither a vocab-en.json " \
                    "concept nor a classified non-concept"
      end

      expect(failures).to eq([]), "#{failures.length} unaccounted surface(s):\n#{failures.join("\n")}"
    end
  end

  describe 'verbatim preservation (ext_members never mutated from source)' do
    it "every core set's ext_members deep-equals its core_lists.snapshot.json array" do
      failures = []
      core_by_id.each do |id, words|
        set = vocab_sets_by_id[id]
        next failures << "core set #{id.inspect} missing from vocab-en.json" unless set

        failures << "core set #{id.inspect} ext_members diverged from snapshot" unless set['ext_members'] == words
      end
      expect(failures).to eq([]), failures.join("\n")
    end

    it "every fringe set's ext_members deep-equals its fringe_suggestions.snapshot.json category array" do
      failures = []
      fringe_by_id.each do |id, words|
        set = vocab_sets_by_id[id]
        next failures << "fringe set #{id.inspect} missing from vocab-en.json" unless set

        failures << "fringe set #{id.inspect} ext_members diverged from snapshot" unless set['ext_members'] == words
      end
      expect(failures).to eq([]), failures.join("\n")
    end
  end

  describe 'VOCAB-04 single-id dedup (confirmed at the parity layer)' do
    it 'every duplicate-manifest surface maps to exactly one registry entry' do
      failures = []
      duplicate_concepts['duplicates'].each_key do |surface|
        unless vocab_concepts.key?(surface)
          failures << "duplicate surface #{surface.inspect} missing from the concepts registry"
          next
        end
        count = vocab_concepts.keys.count(surface)
        failures << "duplicate surface #{surface.inspect} appears #{count} times in the registry (expected 1)" unless count == 1
      end
      expect(failures).to eq([]), failures.join("\n")
      expect(duplicate_concepts['duplicates'].keys).to_not be_empty
    end
  end

  describe 'VOCAB-03 non-concept exclusion (confirmed at the parity layer)' do
    it 'every non-concept-manifest entry is absent from the concepts registry' do
      failures = []
      non_concept_all.each do |surface|
        failures << "non-concept surface #{surface.inspect} unexpectedly present in the concepts registry" if vocab_concepts.key?(surface)
      end
      expect(failures).to eq([]), failures.join("\n")
    end
  end

  describe 'coverage counts (closed equation, frozen + live-derived)' do
    it 'the registry concept count matches the frozen Plan 02 baseline' do
      expect(vocab_concepts.keys.length).to eq(COMMITTED_REGISTRY_CONCEPT_COUNT)
    end

    it 'the distinct non-concept count matches the frozen Plan 01 baseline' do
      expect(non_concept_all.length).to eq(COMMITTED_NON_CONCEPT_COUNT)
      expect(non_concept_classification['total']).to eq(COMMITTED_NON_CONCEPT_COUNT)
    end

    it 'the distinct source surface count (union of every core + fringe entry) matches the frozen baseline' do
      distinct_source_surface_count = all_source_occurrences.map(&:first).to_set.length
      expect(distinct_source_surface_count).to eq(COMMITTED_DISTINCT_SOURCE_SURFACE_COUNT)
    end

    it 'registry_concept_count + distinct_non_concept_count == distinct_source_surface_count (no silent loss or gain)' do
      distinct_source_surface_count = all_source_occurrences.map(&:first).to_set.length
      registry_concept_count = vocab_concepts.keys.length
      distinct_non_concept_count = non_concept_all.length

      expect(registry_concept_count + distinct_non_concept_count).to eq(distinct_source_surface_count)
    end
  end
end
