require 'spec_helper'

describe Language::Schema2Generator do
  # The exact legacy inflection name set enumerated in 01-02-PLAN.md's interfaces block, sourced
  # from the hardcoded EN fallback grid (app/models/word_data.rb lines 797-925). DATA-03 requires
  # every one of these resolve to a UD bundle -- hardcoded independently here (not derived from
  # LEGACY_ALIASES.keys) so an accidental deletion from the constant fails this test.
  REQUIRED_LEGACY_NAMES = %w[
    base present simple_present personal_present plural_present past simple_past
    present_participle past_participle infinitive plural possessive comparative
    superlative negation negative_comparative objective subjective
    possessive_adjective reflexive antonym
  ].freeze

  UD_BUNDLE_PATTERN = /\A[A-Za-z]+=[A-Za-z0-9]+(\|[A-Za-z]+=[A-Za-z0-9]+)*\z/

  describe 'LEGACY_ALIASES (DATA-03 completeness)' do
    it 'has an entry for every legacy fallback-grid inflection name' do
      REQUIRED_LEGACY_NAMES.each do |name|
        expect(described_class::LEGACY_ALIASES).to have_key(name)
      end
    end

    it 'every alias value matches the UD feature-bundle pattern' do
      described_class::LEGACY_ALIASES.each do |name, bundle|
        expect(bundle).to match(UD_BUNDLE_PATTERN), "#{name.inspect} => #{bundle.inspect}"
      end
    end
  end

  describe 'SLOT_LAYOUTS (independent of LEGACY_ALIASES)' do
    it 'every slot value matches the UD feature-bundle pattern' do
      described_class::SLOT_LAYOUTS.each do |pos, pages|
        pages.each do |page|
          page['slots'].each_value do |bundle|
            expect(bundle).to match(UD_BUNDLE_PATTERN), "#{pos}: #{bundle.inspect}"
          end
        end
      end
    end

    it 'is authored as literal constants, not computed via LEGACY_ALIASES lookups' do
      source = File.read(Rails.root.join('lib', 'language', 'schema2_generator.rb'))
      slot_layouts_block = source[/SLOT_LAYOUTS = \{.*?\n    \}\.freeze/m]
      expect(slot_layouts_block).to_not include('LEGACY_ALIASES[')
    end

    it 'covers every pos the fallback grid handles' do
      expect(described_class::SLOT_LAYOUTS.keys.to_set).to eq(
        %w[noun adjective verb adverb pronoun].to_set
      )
    end
  end

  describe '.resolve_alias!' do
    it 'resolves a known legacy name to its bundle' do
      expect(described_class.resolve_alias!('plural', 'test')).to eq('Number=Plur')
    end

    it 'returns nil (skips) for a recognized structural key like regulars' do
      expect(described_class.resolve_alias!('regulars', 'test')).to be_nil
    end

    it 'raises for an unknown override key (fail-closed, DATA-03)' do
      expect {
        described_class.resolve_alias!('some_future_unmapped_key', 'lemma="foo"')
      }.to raise_error(/unknown legacy inflection override key/)
    end
  end

  describe '.build_lexeme' do
    it 'builds bundle-keyed forms and a legacy-name aliases sub-map' do
      lexeme = described_class.build_lexeme('cats', {
        'types' => ['noun'],
        'inflection_overrides' => { 'plural' => 'cats', 'base' => 'cat' },
        'antonyms' => []
      })

      expect(lexeme['lemma']).to eq('cats')
      expect(lexeme['pos']).to eq('noun')
      expect(lexeme['aliases']).to eq('plural' => 'Number=Plur', 'base' => 'Form=Lemma')
      expect(lexeme['forms']).to eq('Number=Plur' => 'cats', 'Form=Lemma' => 'cat')
      # Bundle-keyed lookup via the lexeme's own aliases map, per the design's forms contract.
      expect(lexeme['forms'][lexeme['aliases']['plural']]).to eq('cats')
    end

    it 'skips excluded structural keys (regulars) without raising or aliasing them' do
      lexeme = described_class.build_lexeme('run', {
        'types' => ['verb'],
        'inflection_overrides' => { 'past' => 'ran', 'regulars' => ['past'] },
        'antonyms' => []
      })

      expect(lexeme['aliases']).to eq('past' => 'Tense=Past')
      expect(lexeme['forms']).to eq('Tense=Past' => 'ran')
    end

    it 'raises when an override key is not covered by LEGACY_ALIASES (fail-closed)' do
      expect {
        described_class.build_lexeme('foo', {
          'types' => ['noun'],
          'inflection_overrides' => { 'not_a_real_legacy_name' => 'x' }
        })
      }.to raise_error(/unknown legacy inflection override key/)
    end

    it 'raises when two override names collide on the same bundle with different values' do
      # 'past' and 'simple_past' are an intentional same-bundle pairing (Tense=Past) -- if a
      # lexeme genuinely has both with DIFFERING values, that is a real data problem, not
      # something to silently resolve.
      expect {
        described_class.build_lexeme('lie', {
          'types' => ['verb'],
          'inflection_overrides' => { 'past' => 'lay', 'simple_past' => 'lied' }
        })
      }.to raise_error(/colliding override names/)
    end

    it 'does not raise when past/simple_past agree on the same value' do
      lexeme = described_class.build_lexeme('walk', {
        'types' => ['verb'],
        'inflection_overrides' => { 'past' => 'walked', 'simple_past' => 'walked' }
      })
      expect(lexeme['forms']).to eq('Tense=Past' => 'walked')
    end
  end

  describe '.rules_for and .words_for against the committed snapshot' do
    it 'rules_for carries a non-empty tests array and substitutions identical to the snapshot' do
      rules = described_class.rules_for('en')
      snapshot = JSON.parse(File.read(Rails.root.join('db', 'language', 'en', 'rules-en.snapshot.json')))

      expect(rules['_schema']).to eq(2)
      expect(rules['tests']).to eq(snapshot['tests'])
      expect(rules['tests']).to_not be_empty
      expect(rules['substitutions']).to eq(snapshot['substitutions'])
      expect(rules['aliases']).to eq(described_class::LEGACY_ALIASES)
      expect(rules['slot_layouts']).to eq(described_class::SLOT_LAYOUTS)
    end

    it 'words_for emits one lexeme per snapshot word, none raising against real committed data' do
      words = described_class.words_for('en')
      snapshot = JSON.parse(File.read(Rails.root.join('db', 'language', 'en', 'words-en.snapshot.json')))

      expect(words['_schema']).to eq(2)
      expect(words['words'].length).to eq(snapshot['words'].length)
      expect(words['words'].first).to have_key('lemma')
      expect(words['words'].first).to have_key('forms')
    end
  end
end
