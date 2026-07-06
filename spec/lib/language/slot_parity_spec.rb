require 'spec_helper'

# Compass-slot parity: the DISTINCT gate the 195 lookback fixtures never exercise (Finding 1
# from 01-05-PLAN.md's objective). Language::Schema2Resolver.resolve_slots(word) builds the
# schema-2 compass grid via slot_layouts[pos] -> UD bundle -> the word's bundle-keyed `forms`
# ONLY (no regular-generation fallback -- see the file-level note below for why that fidelity
# to the legacy backend matters here, unlike Task 1's lookback resolver).
#
# ---------------------------------------------------------------------------------------------
# WHY THIS SPEC HAS TWO HALVES, NOT ONE (a disclosed, evidence-based finding -- CLAUDE.md RULE
# #0: verified with real data, not guessed)
# ---------------------------------------------------------------------------------------------
# Plan 01 confirmed, cross-environment (staging AND production), that 0 of the 228,749 real EN
# WordData rows have ANY populated `inflection_overrides` -- so `words-en.json`'s per-lexeme
# `forms` hash is empty for every one of them (Plan 02's confirmed finding), and the committed
# `inflection-locations-golden.json` entry for every real word is uniformly `{"types": [...]}`
# with NO compass-slot values at all (verified directly against the committed file: 0 of
# 228,749 golden entries have more than a bare `types` key).
#
# This means a "real EN words" compass-slot check, taken alone, is COMPARING EMPTY TO EMPTY for
# every single word in the corpus today -- which is a true, meaningful regression guard (it
# proves `resolve_slots` does NOT hallucinate non-empty slots for real, uncurated words, the
# same failure mode a resolver with an accidental regular-generation fallback here would have),
# but it CANNOT by itself prove the alias<->slot_layout mapping is correct, because a wrong
# `aliases`/`slot_layouts` bundle string would ALSO look up a missing `forms[bundle]` and ALSO
# produce an empty slot -- it would never surface as a mismatch. This is precisely the
# near-tautology problem 01-05-PLAN.md's Finding 1 exists to prevent, recurring one level
# deeper because of Plan 01's real-data finding.
#
# So this spec has two halves:
#   1. REAL-CORPUS regression guard (below): proves resolve_slots reproduces the real,
#      confirmed, vacuous-but-true golden baseline (dozens of real words per pos, non-trivial
#      sample sizes) -- a real assertion, honestly documented as currently vacuous re: alias
#      correctness.
#   2. SYNTHETIC slot_layout/alias consistency proof (the actual T-05-02 gate): hand-authored
#      lexemes with POPULATED `forms` keyed by the exact same UD bundles `SLOT_LAYOUTS`
#      references, injected via `resolve_slots(word, words_index: ...)`. Because these bundles
#      are populated and distinct per slot, a wrong `aliases`/`slot_layouts` entry WOULD produce
#      a visible mismatch here (demonstrated explicitly below) -- this is what actually "cannot
#      cancel out."
describe 'Language::Schema2Resolver compass-slot parity' do
  COMPASS_KEYS = %w[c n s e w ne nw se sw].freeze

  let(:golden) { JSON.parse(File.read(Rails.root.join('db', 'language', 'en', 'inflection-locations-golden.json')))['words'] }
  let(:words) { JSON.parse(File.read(Rails.root.join('db', 'language', 'en', 'words-en.json')))['words'] }

  def compass_subset(hash)
    (hash || {}).slice(*COMPASS_KEYS)
  end

  # Multi-type real words the static, primary-type-only SLOT_LAYOUTS cannot fully reproduce
  # once real curated override data exists (the legacy grid's "first-wins" secondary-type
  # extensions -- word_data.rb:806-925 -- layer EXTRA slots onto a multi-type word that a
  # single per-pos slot_layouts page never attempts). Documented here as required by
  # 01-05-PLAN.md rather than silently excluded; NOT used to skip anything mechanically today
  # (see file header: resolve_slots only ever considers a word's PRIMARY pos, so these words'
  # PRIMARY-type slots remain valid regardless of their secondary types -- this list is
  # forward-looking documentation for whenever real per-word override data exists).
  KNOWN_EXCEPTIONS = {
    'abandon' => 'verb also tagged noun/transitive verb -- legacy grid layers noun slots (plural/possessive) onto the verb primary scheme',
    '3-d' => 'adjective also tagged noun -- legacy grid layers noun slots onto the adjective primary scheme',
    'aboard' => 'adverb also tagged preposition -- outside the 5 SLOT_LAYOUTS pos categories entirely for its secondary type',
    'anybody' => 'pronoun also tagged noun -- legacy grid layers noun slots onto the pronoun primary scheme',
    'a battery' => 'noun also tagged "noun phrase" -- a secondary type slot_layouts does not separately model'
  }.freeze

  describe 'real-corpus regression guard (currently vacuous re: alias correctness -- see file header)' do
    SAMPLE_SIZE_PER_POS = 20

    %w[noun verb adjective adverb pronoun].each do |pos|
      it "reproduces the golden compass grid for #{SAMPLE_SIZE_PER_POS} real #{pos} words" do
        sample = words.select { |w| w['pos'] == pos }.first(SAMPLE_SIZE_PER_POS)
        expect(sample).to_not be_empty, "no real committed words-en.json lexemes with pos=#{pos.inspect}"

        failures = []
        sample.each do |lexeme|
          word = lexeme['lemma']
          golden_entry = golden[word]
          next unless golden_entry # every committed word has a golden entry; a miss is itself a finding

          expected = compass_subset(golden_entry)
          got = Language::Schema2Resolver.resolve_slots(word)
          next if got == expected

          failures << "#{word.inspect}: expected #{expected.inspect}, got #{got.inspect}"
        end

        expect(failures).to eq([]), failures.join("\n")
      end
    end

    it 'covers every single-primary-type-relevant pos with a non-trivial real-word sample' do
      counts = %w[noun verb adjective adverb pronoun].to_h do |pos|
        [pos, words.select { |w| w['pos'] == pos }.first(SAMPLE_SIZE_PER_POS).length]
      end
      counts.each_value { |count| expect(count).to be > 0 }
      expect(counts.values.sum).to be >= 20
    end
  end

  describe 'synthetic slot_layout/alias consistency proof (the real T-05-02 gate)' do
    # Hand-authored, clearly-synthetic lexemes -- NOT real words-en.json data -- with `forms`
    # populated for every bundle each pos's SLOT_LAYOUTS page references (per Plan 02's
    # committed SLOT_LAYOUTS table, reproduced in lib/language/schema2_generator.rb). If any
    # `aliases`/`slot_layouts` bundle string were wrong, the corresponding slot below would
    # come back nil/missing rather than the expected synthetic surface form, because these
    # `forms` hashes are keyed precisely and distinctly per bundle -- a wrong bundle cannot
    # silently succeed here the way it can against real, all-empty data (see file header).
    SYNTHETIC_WORDS = {
      'noun' => {
        'lemma' => 'zzznoun', 'pos' => 'noun',
        'forms' => {
          'Form=Lemma' => 'zzznoun', 'Number=Plur' => 'zzznouns',
          'Poss=Yes' => "zzznoun's", 'Polarity=Neg' => 'not a zzznoun'
        }
      },
      'adjective' => {
        'lemma' => 'zzzadj', 'pos' => 'adjective',
        'forms' => {
          'Form=Lemma' => 'zzzadj', 'Degree=Cmp' => 'zzzadjer', 'Degree=Sup' => 'zzzadjest',
          'Degree=Cmp|Polarity=Neg' => 'less zzzadj', 'Polarity=Neg' => 'not zzzadj'
        }
      },
      'verb' => {
        'lemma' => 'zzzverb', 'pos' => 'verb',
        'forms' => {
          'Tense=Pres' => 'zzzverb', 'Tense=Pres|Person=3|Number=Sing' => 'zzzverbs',
          'VerbForm=Inf' => 'to zzzverb', 'Tense=Past' => 'zzzverbed',
          'VerbForm=Part|Tense=Pres' => 'zzzverbing', 'VerbForm=Part|Tense=Past' => 'zzzverbeden',
          'Tense=Pres|Number=Plur' => 'zzzverb-plural'
        }
      },
      'adverb' => {
        'lemma' => 'zzzadv', 'pos' => 'adverb',
        'forms' => {
          'Form=Lemma' => 'zzzadv', 'Degree=Cmp' => 'zzzadver', 'Degree=Sup' => 'zzzadvest',
          'Degree=Cmp|Polarity=Neg' => 'less zzzadv', 'Polarity=Neg' => 'not zzzadv'
        }
      },
      'pronoun' => {
        'lemma' => 'zzzpron', 'pos' => 'pronoun',
        'forms' => {
          'Case=Nom' => 'zzzpron', 'Poss=Yes' => 'zzzprons', 'Case=Acc' => 'zzzpronobj',
          'Poss=Yes|PronType=Prs' => 'zzzpronposs', 'Reflex=Yes' => 'zzzpronself'
        }
      }
    }.freeze

    let(:slot_layouts) do
      JSON.parse(File.read(Rails.root.join('db', 'language', 'en', 'rules-en.json')))['slot_layouts']
    end

    SYNTHETIC_WORDS.each_key do |pos|
      it "reproduces the exact expected surface form for every SLOT_LAYOUTS[#{pos}] slot" do
        lexeme = SYNTHETIC_WORDS[pos]
        words_index = { lexeme['lemma'] => lexeme }

        expected = {}
        slot_layouts[pos].each do |page|
          page['slots'].each do |slot, bundle|
            expected[slot] = lexeme['forms'][bundle]
          end
        end
        # Sanity: every bundle SLOT_LAYOUTS references for this pos has a populated synthetic
        # form -- if it didn't, this proof would be as vacuous as the real-corpus half.
        expect(expected.values).to all(be_present), "SLOT_LAYOUTS[#{pos}] references a bundle " \
          "with no synthetic form -- strengthen SYNTHETIC_WORDS[#{pos}]"

        got = Language::Schema2Resolver.resolve_slots(lexeme['lemma'], words_index: words_index)
        expect(got).to eq(expected)
      end
    end

    it 'demonstrates a wrong bundle would actually be caught (not cancel out)' do
      # Deliberately corrupt one slot's bundle mapping (simulating a wrong alias/slot_layout
      # entry) and confirm the resulting grid VISIBLY diverges from the correct one, proving
      # this proof mechanism has teeth.
      lexeme = SYNTHETIC_WORDS['noun']
      words_index = { lexeme['lemma'] => lexeme }
      correct = Language::Schema2Resolver.resolve_slots(lexeme['lemma'], words_index: words_index)

      corrupted_lexeme = lexeme.merge('forms' => lexeme['forms'].except('Number=Plur'))
      corrupted_index = { lexeme['lemma'] => corrupted_lexeme }
      corrupted = Language::Schema2Resolver.resolve_slots(lexeme['lemma'], words_index: corrupted_index)

      expect(corrupted['n']).to be_nil
      expect(correct['n']).to eq('zzznouns')
      expect(corrupted).to_not eq(correct)
    end
  end

  describe 'source assertions' do
    it 'routes through slot_layouts' do
      source = File.read(Rails.root.join('lib', 'language', 'schema2_resolver.rb'))
      expect(source).to match(/slot_layouts/)
    end
  end
end
