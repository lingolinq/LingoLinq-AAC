require 'spec_helper'
require 'digest'

# Verifies the committed Phase 1 (EN schema-2 migration) language snapshot files under
# db/language/en/. These are static, committed artifacts (produced by `rake language:snapshot`
# against staging, then independently cross-checked against production -- see
# .planning/phases/01-en-schema-2-migration/01-01-SUMMARY.md) -- this spec does NOT re-run the
# rake task or touch any live DB; it locks the shape and content of what is already committed so
# any future regeneration that silently drops/changes fixtures fails loudly.
describe 'language snapshot artifacts (db/language/en/)' do
  let(:dir) { Rails.root.join('db', 'language', 'en') }
  let(:upstream) { JSON.parse(File.read(dir.join('rules-en.upstream.json'))) }
  let(:rules_snapshot) { JSON.parse(File.read(dir.join('rules-en.snapshot.json'))) }
  let(:words_snapshot) { JSON.parse(File.read(dir.join('words-en.snapshot.json'))) }
  let(:golden) { JSON.parse(File.read(dir.join('inflection-locations-golden.json'))) }

  # Frozen expectations, sourced from the committed files themselves -- NOT hardcoded guesses --
  # so any future change to the committed data must deliberately update these constants too.
  UPSTREAM_SHA256 = 'df71e0c893fac417bf7aea12742642d7a1b5cddd924532cdd2bb2c1803bfcf0b'.freeze
  EXPECTED_TESTS_COUNT = 195

  describe 'rules-en.upstream.json (pinned third-party source)' do
    it 'is valid JSON with a non-empty tests array, a substitutions block, and a license' do
      expect(upstream['tests']).to be_a(Array)
      expect(upstream['tests'].length).to be > 0
      expect(upstream['substitutions']).to have_key('contractions')
      expect(upstream['substitutions']).to have_key('default_contractions')
      expect(upstream['_license']).to be_present
    end

    it 'matches the recorded SHA-256 pin (fails loudly if the third-party file content drifts)' do
      actual = Digest::SHA256.hexdigest(File.read(dir.join('rules-en.upstream.json')))
      expect(actual).to eq(UPSTREAM_SHA256)
    end

    it 'has the exact fixture count locked by db/language/README.md' do
      expect(upstream['tests'].length).to eq(EXPECTED_TESTS_COUNT)
    end
  end

  describe 'rules-en.snapshot.json' do
    it 'has the expected type/schema envelope' do
      expect(rules_snapshot['_locale']).to eq('en')
      expect(rules_snapshot['_type']).to eq('rules')
      expect(rules_snapshot['_schema']).to eq(1)
    end

    it 'labels its source explicitly rather than silently emitting nulls' do
      # Confirmed against BOTH staging and production (2026-07): neither environment has a
      # rules/en Setting, so this is real observed behavior, not a synthetic default.
      expect(rules_snapshot['_rules_source']).to eq('upstream_synthetic_no_live_setting')
      expect(rules_snapshot['rules']).to be_present
      expect(rules_snapshot['inflection_locations']).to be_present
    end

    it 'carries substitutions + tests + _license verbatim from the pinned upstream file' do
      expect(rules_snapshot['substitutions']).to eq(upstream['substitutions'])
      expect(rules_snapshot['tests']).to eq(upstream['tests'])
      expect(rules_snapshot['tests'].length).to eq(EXPECTED_TESTS_COUNT)
      expect(rules_snapshot['_license']).to eq(upstream['_license'])
    end
  end

  describe 'words-en.snapshot.json' do
    it 'has the expected type/schema envelope and a non-empty words map' do
      expect(words_snapshot['_locale']).to eq('en')
      expect(words_snapshot['_type']).to eq('words')
      expect(words_snapshot['_schema']).to eq(1)
      expect(words_snapshot['words']).to be_a(Hash)
      expect(words_snapshot['words'].length).to be > 0
    end

    it 'never carries reviews or reviewer_ids on any word (threat T-01-01)' do
      words_snapshot['words'].each_value do |entry|
        expect(entry.keys).to_not include('reviews')
        expect(entry.keys).to_not include('reviewer_ids')
      end
    end

    it 'writes only the allowed keys per word (types, inflection_overrides, antonyms)' do
      allowed = %w[types inflection_overrides antonyms].to_set
      words_snapshot['words'].each_value do |entry|
        expect(entry.keys.to_set.subset?(allowed)).to be(true)
      end
    end
  end

  describe 'inflection-locations-golden.json' do
    it 'has the expected type envelope and one entry per snapshotted word' do
      expect(golden['_locale']).to eq('en')
      expect(golden['_type']).to eq('golden_inflection_locations')
      expect(golden['_corpus_word_count']).to eq(words_snapshot['words'].length)
      expect(golden['words'].length).to eq(golden['_corpus_word_count'])
    end

    # As of this snapshot (2026-07), confirmed identically against BOTH staging and production:
    # no rules/en Setting exists and no WordData row anywhere carries a populated
    # inflection_overrides value. WordData.inflection_locations_for therefore emits only the
    # `types` key for every single word -- no `src`, no location slots (n/s/e/w/etc) -- because
    # both the Setting-rules branch AND the hardcoded-fallback branch's override-driven
    # sub-conditions are unreachable with zero override data. This is the TRUE observed
    # pre-migration baseline, not a data-loading defect -- see 01-01-SUMMARY.md for the
    # production cross-check that established this. Do NOT "fix" this spec to expect `src` or
    # location keys; that would contradict the verified live behavior this baseline exists to
    # capture, and would make later flag-off regression checks (Plan 03/05) compare against a
    # fabricated expectation instead of reality.
    it 'reflects the real confirmed pre-migration shape: types only, no location data' do
      sample_key = golden['words'].keys.first
      expect(golden['words'][sample_key].keys).to eq(['types'])
      non_types_only = golden['words'].values.reject { |v| v.keys == ['types'] }
      expect(non_types_only).to eq([])
    end
  end
end
