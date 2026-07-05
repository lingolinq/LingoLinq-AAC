# frozen_string_literal: true

# Multilingual Language Layer -- Phase 1 (EN schema-2 migration), Plan 02.
#
# Pure Ruby transform: Plan 01's committed schema-1 snapshot -> schema-2 rules-en.json /
# words-en.json, per docs/architecture/MULTILINGUAL_LANGUAGE_LAYER_SCHEMA.md Section 4. No
# ActiveRecord, no network, no file writes -- reads only the committed snapshot JSON and returns
# plain hashes. lib/tasks/language_schema2.rake is the only writer.
#
# RESIDUAL JUDGMENT CALL (see 01-02-SUMMARY.md for the full table + rationale): the two
# authoritative constants below (LEGACY_ALIASES, SLOT_LAYOUTS) encode a linguistic decision --
# which Universal Dependencies (UD v2) feature bundle each legacy OpenAAC inflection name means.
# The mechanical gates this file/spec enforce (completeness, fail-closed on an unknown name,
# bundle-keyed forms, slot_layouts independence) prove STRUCTURAL correctness, not ABSOLUTE
# UD-semantic correctness of each bundle string. That sign-off is a Plan 05 human/SLP checkpoint.
#
# Two deliberate same-bundle pairings ('past'/'simple_past' -> "Tense=Past";
# 'personal_present'/'simple_present' -> "Tense=Pres|Person=3|Number=Sing") reflect that English
# has only one true surface form for each of those grammatical categories -- the legacy code just
# read them from two different override key names in different branches. If a future lexeme ever
# has both names populated with DIFFERING values, forms-building below RAISES (a genuine data
# problem, not something to silently pick a winner on) rather than merging them.
#
# Two custom, non-official-UD bundles ('base' -> "Form=Lemma", 'antonym' -> "Lexical=Antonym")
# exist because neither concept has a real UD morphological feature (citation form and lexical
# antonymy are not inflectional categories) but the Task 1 acceptance criteria requires every
# alias/slot_layout value to match the `Feat=Val` pattern. Flagged explicitly for Plan 05 review.
module Language
  module Schema2Generator
    # Every legacy inflection name that appears in WordData#inflection_overrides today, per the
    # hardcoded EN fallback grid (app/models/word_data.rb lines 797-925) -- this is the exact list
    # the 01-02-PLAN.md interfaces block enumerates. DATA-03 requires none of these ever be
    # dropped or silently renamed.
    LEGACY_ALIASES = {
      'base'                 => 'Form=Lemma',
      'present'               => 'Tense=Pres',
      'simple_present'        => 'Tense=Pres|Person=3|Number=Sing',
      'personal_present'      => 'Tense=Pres|Person=3|Number=Sing',
      'plural_present'        => 'Tense=Pres|Number=Plur',
      'past'                  => 'Tense=Past',
      'simple_past'           => 'Tense=Past',
      'present_participle'    => 'VerbForm=Part|Tense=Pres',
      'past_participle'       => 'VerbForm=Part|Tense=Past',
      'infinitive'            => 'VerbForm=Inf',
      'plural'                => 'Number=Plur',
      'possessive'            => 'Poss=Yes',
      'comparative'           => 'Degree=Cmp',
      'superlative'           => 'Degree=Sup',
      'negation'              => 'Polarity=Neg',
      'negative_comparative'  => 'Degree=Cmp|Polarity=Neg',
      'objective'             => 'Case=Acc',
      'subjective'            => 'Case=Nom',
      'possessive_adjective'  => 'Poss=Yes|PronType=Prs',
      'reflexive'             => 'Reflex=Yes',
      'antonym'               => 'Lexical=Antonym'
    }.freeze

    # Structural/control keys that can legitimately appear in a stored inflection_overrides hash
    # but are NOT themselves inflection forms (see app/models/word_data.rb line 761:
    # `overrides['regulars'] ||= []` -- a list of OTHER override names that equal the base form,
    # used to suppress redundant slot display). Recognized and skipped, never aliased/raised on.
    EXCLUDED_OVERRIDE_KEYS = %w[regulars].freeze

    # Independent authoritative slot->bundle map (Section 4.5), one page per pos, matching the
    # legacy fallback grid's PRIMARY (single-type) slot scheme (word_data.rb lines 806-925).
    # Authored directly as literal bundle strings -- NOT computed via LEGACY_ALIASES[name] --
    # so Plan 05's compass-slot cross-check actually exercises whether the alias table and this
    # table agree (a wrong entry in either one fails parity instead of cancelling out).
    SLOT_LAYOUTS = {
      'noun' => [
        { 'page' => 1, 'slots' => {
          'c'  => 'Form=Lemma',
          'n'  => 'Number=Plur',
          's'  => 'Poss=Yes',
          'nw' => 'Polarity=Neg'
        } }
      ],
      'adjective' => [
        { 'page' => 1, 'slots' => {
          'c'  => 'Form=Lemma',
          'ne' => 'Degree=Cmp',
          'e'  => 'Degree=Sup',
          'w'  => 'Degree=Cmp|Polarity=Neg',
          'nw' => 'Polarity=Neg'
        } }
      ],
      'verb' => [
        { 'page' => 1, 'slots' => {
          'c'  => 'Tense=Pres',
          'n'  => 'Tense=Pres|Person=3|Number=Sing',
          'e'  => 'VerbForm=Inf',
          'w'  => 'Tense=Past',
          's'  => 'VerbForm=Part|Tense=Pres',
          'sw' => 'VerbForm=Part|Tense=Past',
          'nw' => 'Tense=Past',
          'ne' => 'Tense=Pres|Number=Plur'
        } }
      ],
      'adverb' => [
        { 'page' => 1, 'slots' => {
          'c'  => 'Form=Lemma',
          'ne' => 'Degree=Cmp',
          'e'  => 'Degree=Sup',
          'w'  => 'Degree=Cmp|Polarity=Neg',
          'nw' => 'Polarity=Neg'
        } }
      ],
      'pronoun' => [
        { 'page' => 1, 'slots' => {
          'c' => 'Case=Nom',
          's' => 'Poss=Yes',
          'n' => 'Case=Acc',
          'w' => 'Poss=Yes|PronType=Prs',
          'e' => 'Reflex=Yes'
        } }
      ]
    }.freeze

    PROFILE = {
      'locale' => 'en',
      'morphology' => 'fusional',
      'script' => { 'code' => 'Latn', 'rtl' => false, 'spaces' => true },
      'features' => {
        'Number'   => %w[Sing Plur],
        'Person'   => %w[1 2 3],
        'Tense'    => %w[Pres Past],
        'Degree'   => %w[Pos Cmp Sup],
        'VerbForm' => %w[Inf Part Fin],
        'Case'     => %w[Nom Acc],
        'Poss'     => %w[Yes],
        'Polarity' => %w[Pos Neg],
        'Reflex'   => %w[Yes],
        # Custom, non-official-UD extensions -- see file header note.
        'Form'     => %w[Lemma],
        'Lexical'  => %w[Antonym]
      },
      'inherent_features' => { 'noun' => [], 'pronoun' => %w[Person Number] },
      'utterance' => { 'contractions_apply' => true, 'tokenizer' => 'space' }
    }.freeze

    module_function

    def snapshot_dir(locale)
      Rails.root.join('db', 'language', locale.to_s)
    end

    def load_snapshot(filename, locale)
      path = snapshot_dir(locale).join(filename)
      JSON.parse(File.read(path))
    end

    # Raises if `name` is not a recognized legacy inflection name and not a recognized
    # structural/control key -- fail closed rather than silently drop a name (DATA-03).
    def resolve_alias!(name, context)
      return nil if EXCLUDED_OVERRIDE_KEYS.include?(name)

      bundle = LEGACY_ALIASES[name]
      raise "Schema2Generator: unknown legacy inflection override key #{name.inspect} " \
            "(#{context}) has no entry in LEGACY_ALIASES -- add it rather than dropping it " \
            '(DATA-03 forbids silently losing a legacy name).' unless bundle

      bundle
    end

    def rules_for(locale)
      snapshot = load_snapshot("rules-#{locale}.snapshot.json", locale)

      {
        '_locale' => locale.to_s,
        '_schema' => 2,
        '_type' => 'rules',
        'profile' => PROFILE,
        'aliases' => LEGACY_ALIASES,
        'slot_layouts' => SLOT_LAYOUTS,
        'rules' => snapshot['rules'],
        'inflection_locations' => snapshot['inflection_locations'],
        'substitutions' => snapshot['substitutions'],
        'tests' => snapshot['tests'],
        '_license' => snapshot['_license']
      }
    end

    # Builds one schema-2 lexeme from a schema-1 word's snapshot data. Pure function, no I/O --
    # extracted separately from words_for so the fail-closed and collision behavior can be
    # exercised directly against synthetic data in specs, without faking snapshot files on disk.
    def build_lexeme(word, data)
      overrides = data['inflection_overrides'] || {}
      aliases = {}
      forms = {}

      overrides.each_key do |name|
        bundle = resolve_alias!(name, "lemma=#{word.inspect}")
        next unless bundle

        aliases[name] = bundle

        value = overrides[name]
        next if value.blank?

        if forms.key?(bundle) && forms[bundle] != value
          raise "Schema2Generator: lexeme #{word.inspect} has colliding override names for " \
                "the same UD bundle #{bundle.inspect} (existing value #{forms[bundle].inspect}, " \
                "new value #{value.inspect} from #{name.inspect}) -- the alias table is too " \
                'coarse for this lexeme and must be fixed, not silently overwritten.'
        end

        forms[bundle] = value
      end

      {
        'lemma' => word,
        'pos' => (data['types'] || []).first,
        'aliases' => aliases,
        'forms' => forms,
        'antonyms' => data['antonyms'] || []
      }
    end

    def words_for(locale)
      snapshot = load_snapshot("words-#{locale}.snapshot.json", locale)

      lexemes = snapshot['words'].map { |word, data| build_lexeme(word, data) }

      {
        '_locale' => locale.to_s,
        '_schema' => 2,
        '_type' => 'words',
        'words' => lexemes
      }
    end
  end
end
