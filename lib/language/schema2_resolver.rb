# frozen_string_literal: true

# Multilingual Language Layer -- Phase 1 (EN schema-2 migration), Plan 05.
#
# STANDALONE parity resolver. This module is exercised ONLY by the Plan 05 parity specs
# (spec/lib/language/parity_spec.rb, spec/lib/language/slot_parity_spec.rb). It is NOT wired
# into any flag-ON runtime seam (app/models/word_data.rb, app/models/board.rb, i18n.js,
# edit_manager.js) -- those remain minimal stubs per Plan 03/04. See db/language/en/PARITY.md's
# "Known gap: flag-ON runtime is a stub" section. Wiring this resolver into runtime is Phase 2
# work, not this milestone's.
#
# Reads ONLY the committed db/language/en/rules-en.json and words-en.json via JSON.parse (no
# dynamic code execution of any kind on that data, no ActiveRecord, no network) -- T-05-03.
#
# ---------------------------------------------------------------------------------------------
# TASK 1 -- resolve(prior, word, locale): lookback parity (TEST-01)
# ---------------------------------------------------------------------------------------------
# Reproduces every committed rules-en.snapshot.json `tests[]` fixture
# ([prior, word, expected, {rule_id?}]) by:
#   1. Using the carried lookback `rules[]` ONLY to decide which rule applies to [prior, word]:
#      - "override" rules apply ONLY when their own `overrides` hash has `word` as a literal key
#        (these are the to-be/do/have subject-verb-agreement idioms -- e.g. "you_are" corrects
#        "is" -> "are" after "you"). No alias/bundle involved; this is the genuinely idiomatic
#        path the plan's objective explicitly permits to stay rule-driven.
#      - otherwise, the rule's own `type` ('verb'/'noun'/'pronoun') must equal the CURRENT
#        WORD's own part of speech (mirroring how the real app's `inflection_for_types` buckets
#        results by the part of speech of the button about to be pressed, not the prior
#        context) -- this is the fix that made "he_is_looking_to_go" (a VERB rule) stop
#        incorrectly winning over "i_am_thinking_he" (a PRONOUN rule) for a pronoun word.
#   2. For a matched non-override rule: `name = rule['inflection']` -> `bundle =
#      aliases[name]` (the alias table is ON THE CRITICAL PATH here -- a wrong alias changes
#      `bundle` and breaks the fixture) -> surface form via `words-en.json`'s bundle-keyed
#      `forms[bundle]` for that word if a curated form exists, else regular EN morphological
#      generation keyed OFF THE BUNDLE (not the legacy name) so the alias table cannot be
#      bypassed.
#   3. If no rule matches at all, the word passes through unchanged (the committed `no_rule`
#      fixtures).
#
# The word-type classifier (WORD_TYPES) and the small irregular-verb/pronoun-paradigm tables
# below are intentionally scoped to the ~140 closed-class/context words and the one irregular
# verb ("think"/"thought") that the 195 committed fixtures actually exercise -- "Keep it
# EN-scoped and only as broad as the fixtures require" per 01-05-PLAN.md. They were derived by
# cross-referencing the existing `app/frontend/tests/utils/edit_manager-test.js` `lookups` fixture
# (the closest existing reference classification in this codebase) and then verifying every one
# of the 195 committed fixtures resolves correctly -- not invented, and re-runnable.
#
# ---------------------------------------------------------------------------------------------
# TASK 2 -- resolve_slots(word, locale:): compass-slot parity (the Finding-1 fix)
# ---------------------------------------------------------------------------------------------
# Builds the schema-2 compass grid for a word: for the word's `pos` (from its words-en.json
# lexeme), for each slot in `slot_layouts[pos]`'s page-1 `slots` map, resolve the UD bundle's
# surface form via the lexeme's bundle-keyed `forms` ONLY (no regular-generation fallback here
# -- this mirrors `WordData.inflection_locations_for`'s real, curated-data-only, legacy
# behavior; see the file-level note in slot_parity_spec.rb for why this matters and what it
# does/doesn't prove given today's real data).
module Language
  module Schema2Resolver
    extend self

    # -------------------------------------------------------------------------------------
    # Data loading -- JSON.parse only, memoized per locale (words-en.json is ~28MB; parsing it
    # once per process, not once per fixture, keeps the parity suite fast).
    # -------------------------------------------------------------------------------------

    def data_dir(locale)
      Rails.root.join('db', 'language', locale.to_s)
    end

    def rules_data(locale = 'en')
      @rules_data ||= {}
      @rules_data[locale] ||= JSON.parse(File.read(data_dir(locale).join("rules-#{locale}.json")))
    end

    def words_data(locale = 'en')
      @words_data ||= {}
      @words_data[locale] ||= JSON.parse(File.read(data_dir(locale).join("words-#{locale}.json")))
    end

    def lexeme_index(locale = 'en')
      @lexeme_index ||= {}
      @lexeme_index[locale] ||= words_data(locale)['words'].each_with_object({}) do |lexeme, hash|
        hash[lexeme['lemma'].to_s.downcase] = lexeme
      end
    end

    def lexeme_for(word, locale = 'en')
      lexeme_index(locale)[word.to_s.downcase]
    end

    # -------------------------------------------------------------------------------------
    # Word-type classifier for lookback matching (see file header). Only the parts of speech
    # actually checked via a `type`-only lookback item (no `words` list) across the committed
    # rules[] array need an entry: pronoun, verb, noun, adverb, preposition, determiner,
    # question. A handful of possessive-adjective words (my/his/her/our/their/your/its) are
    # classified 'pronoun' here (their own-word part of speech when they are the CURRENT WORD
    # undergoing inflection, e.g. "your" -> objective -> "you") EXCEPT 'my', which the
    # committed fixtures need classified as 'determiner' in the "my cat" -> dog_looks context
    # (its only committed-fixture appearance as a PRIOR context word); this dual concern is
    # real English grammar (possessive determiners vs. personal pronouns) and does not
    # conflict for the specific 195 fixtures.
    # -------------------------------------------------------------------------------------
    WORD_TYPES = {
      'i' => 'pronoun', 'you' => 'pronoun', 'he' => 'pronoun', 'she' => 'pronoun', 'it' => 'pronoun',
      'we' => 'pronoun', 'they' => 'pronoun', 'me' => 'pronoun', 'him' => 'pronoun', 'her' => 'pronoun',
      'them' => 'pronoun', 'us' => 'pronoun', 'his' => 'pronoun', 'our' => 'pronoun',
      'their' => 'pronoun', 'your' => 'pronoun', 'its' => 'pronoun', 'mine' => 'pronoun', 'hers' => 'pronoun',
      'theirs' => 'pronoun', 'ours' => 'pronoun', 'yours' => 'pronoun', 'myself' => 'pronoun',
      'himself' => 'pronoun', 'herself' => 'pronoun', 'themselves' => 'pronoun', 'ourselves' => 'pronoun',
      'yourself' => 'pronoun', 'itself' => 'pronoun', 'somebody' => 'pronoun', 'someone' => 'pronoun',
      'nobody' => 'pronoun', 'everybody' => 'pronoun', 'everyone' => 'pronoun',

      'sometimes' => 'adverb', 'usually' => 'adverb', 'always' => 'adverb', 'never' => 'adverb',
      'often' => 'adverb', 'barely' => 'adverb', 'still' => 'adverb', 'down' => 'adverb',

      'did' => 'verb', 'do' => 'verb', 'does' => 'verb', 'is' => 'verb', 'am' => 'verb', 'are' => 'verb',
      'was' => 'verb', 'were' => 'verb', 'be' => 'verb', 'been' => 'verb', 'being' => 'verb',
      'might' => 'verb', 'would' => 'verb', 'could' => 'verb', 'can' => 'verb', 'will' => 'verb',
      'may' => 'verb', 'must' => 'verb', 'shall' => 'verb', 'should' => 'verb',
      'like' => 'verb', 'likes' => 'verb', 'liked' => 'verb', 'see' => 'verb', 'ask' => 'verb',
      'hate' => 'verb', 'hates' => 'verb', 'thinks' => 'verb', 'think' => 'verb', 'wish' => 'verb',
      'want' => 'verb', 'wants' => 'verb', 'wanted' => 'verb', 'wanting' => 'verb', 'feel' => 'verb',
      'feels' => 'verb', 'looking' => 'verb', 'looks' => 'verb', 'look' => 'verb', 'helped' => 'verb',
      'have' => 'verb', 'has' => 'verb', 'had' => 'verb', 'love' => 'verb',
      'give' => 'verb', 'put' => 'verb', 'view' => 'verb', 'going' => 'verb', 'saw' => 'verb',
      'tells' => 'verb', 'tell' => 'verb', 'eat' => 'verb', 'jump' => 'verb',
      'write' => 'verb', 'get' => 'verb', 'keep' => 'verb', 'talking' => 'verb', 'thinking' => 'verb',
      'thought' => 'verb', 'go' => 'verb', 'wait' => 'verb', 'walk' => 'verb', 'dance' => 'verb',
      'talk' => 'verb', 'smell' => 'verb', 'wash' => 'verb',

      'why' => 'question', 'what' => 'question', 'when' => 'question', 'who' => 'question',

      'dog' => 'noun', 'dogs' => 'noun', 'cat' => 'noun', 'frog' => 'noun',

      'to' => 'preposition', 'about' => 'preposition', 'with' => 'preposition', 'for' => 'preposition',
      'over' => 'preposition', 'on' => 'preposition', 'by' => 'preposition', 'of' => 'preposition',
      'before' => 'preposition', 'at' => 'preposition', 'than' => 'preposition',

      'the' => 'determiner', 'that' => 'determiner', 'these' => 'determiner', 'those' => 'determiner',
      'all' => 'determiner', 'this' => 'determiner', 'some' => 'determiner', 'many' => 'determiner',
      'my' => 'determiner',

      'not' => 'negation'
    }.freeze

    def word_type_of(word)
      WORD_TYPES[word.to_s.downcase]
    end

    # -------------------------------------------------------------------------------------
    # English personal-pronoun paradigm (a small, closed, formally-fixed grammar table -- not
    # derived from words-en.json, which has no lexeme entries at all for these closed-class
    # words). REVERSE_LOOKUP maps ANY surface form back to its family so a word already in an
    # inflected form (e.g. "hers", "them", "your") can still be re-inflected to a DIFFERENT
    # requested form (e.g. "hers" + objective -> "her").
    # -------------------------------------------------------------------------------------
    PRONOUN_FAMILIES = {
      'i' => { base: 'I', objective: 'me', possessive_adjective: 'my', possessive: 'mine', reflexive: 'myself' },
      'you' => { base: 'you', objective: 'you', possessive_adjective: 'your', possessive: 'yours', reflexive: 'yourself' },
      'he' => { base: 'he', objective: 'him', possessive_adjective: 'his', possessive: 'his', reflexive: 'himself' },
      'she' => { base: 'she', objective: 'her', possessive_adjective: 'her', possessive: 'hers', reflexive: 'herself' },
      'it' => { base: 'it', objective: 'it', possessive_adjective: 'its', possessive: 'its', reflexive: 'itself' },
      'we' => { base: 'we', objective: 'us', possessive_adjective: 'our', possessive: 'ours', reflexive: 'ourselves' },
      'they' => { base: 'they', objective: 'them', possessive_adjective: 'their', possessive: 'theirs', reflexive: 'themselves' }
    }.freeze

    REVERSE_PRONOUN_LOOKUP = PRONOUN_FAMILIES.each_with_object({}) do |(family, forms), hash|
      forms.each_value { |surface| hash[surface.to_s.downcase] = family }
    end.freeze

    # Intentionally partial irregular-verb table -- ported from (a subset of)
    # app/frontend/app/utils/i18n.js's `substitutions.tenses` table, scoped to the ONE
    # irregular verb ("think"/"thought") the 195 committed fixtures exercise. The full i18n.js
    # table has hundreds of entries; porting all of them is out of this plan's scope (no
    # committed fixture needs them), but this table's shape is deliberately the same
    # [simple_present, past, past_participle, present_participle] so it is a drop-in subset,
    # not a divergent format.
    IRREGULAR_VERBS = {
      'think' => { simple_present: 'thinks', past: 'thought', past_participle: 'thought', present_participle: 'thinking' }
    }.freeze

    # Modal auxiliaries never take a 3rd-person "-s" ("he can", never "he cans").
    MODAL_VERBS = %w[can could will would shall should may might must].freeze

    def base_form(word)
      family = REVERSE_PRONOUN_LOOKUP[word.to_s.downcase]
      return PRONOUN_FAMILIES[family][:base] if family

      irregular_lemma_of(word) || word
    end

    def irregular_lemma_of(word)
      IRREGULAR_VERBS.each do |lemma, forms|
        return lemma if forms.values.map(&:downcase).include?(word.to_s.downcase)
      end
      nil
    end

    def pronoun_form(word, kind)
      family = REVERSE_PRONOUN_LOOKUP[word.to_s.downcase]
      return word unless family

      PRONOUN_FAMILIES[family][kind]
    end

    def pluralize(word)
      check = word.downcase
      if check.match?(/(s|ch|sh|x|z)$/)
        word + 'es'
      elsif check.match?(/[^aeiouy]y$/)
        word[0..-2] + 'ies'
      else
        word + 's'
      end
    end

    def simple_present(word)
      base = base_form(word)
      irregular = IRREGULAR_VERBS[base.downcase]
      return irregular[:simple_present] if irregular
      return base if MODAL_VERBS.include?(base.downcase)

      check = base.downcase
      if check.match?(/(s|ch|sh|x|z)$/)
        base + 'es'
      elsif check.match?(/[^aeiouy]y$/)
        base[0..-2] + 'ies'
      else
        base + 's'
      end
    end

    def add_ing(word)
      check = word.downcase
      if check[-1] == 'e' && check[-2] != 'e'
        word[0..-2] + 'ing'
      else
        word + 'ing'
      end
    end

    def present_participle(word)
      base = base_form(word)
      irregular = IRREGULAR_VERBS[base.downcase]
      return irregular[:present_participle] if irregular

      add_ing(base)
    end

    def add_ed(word)
      check = word.downcase
      check[-1] == 'e' ? "#{word}d" : "#{word}ed"
    end

    def past_participle(word)
      irregular = IRREGULAR_VERBS[word.to_s.downcase]
      return irregular[:past_participle] if irregular

      add_ed(word)
    end

    # Dispatches on the UD BUNDLE (never the legacy name directly) so the alias table stays on
    # the critical path -- a wrong `aliases[name]` entry changes `bundle` and breaks the
    # fixture that exercises it.
    def inflect_by_bundle(word, bundle)
      case bundle
      when 'Form=Lemma', 'Tense=Pres'
        base_form(word)
      when 'Tense=Pres|Person=3|Number=Sing'
        simple_present(word)
      when 'VerbForm=Part|Tense=Pres'
        present_participle(word)
      when 'VerbForm=Part|Tense=Past'
        past_participle(word)
      when 'VerbForm=Inf'
        "to #{base_form(word)}"
      when 'Number=Plur'
        pluralize(word)
      when 'Case=Acc'
        pronoun_form(word, :objective)
      when 'Poss=Yes|PronType=Prs'
        pronoun_form(word, :possessive_adjective)
      when 'Reflex=Yes'
        pronoun_form(word, :reflexive)
      else
        word
      end
    end

    # Curated-form-first: a real per-word `forms[bundle]` override (once real data exists) wins
    # over generated morphology; today every real lexeme's `forms` is empty (Plan 01/02's
    # confirmed finding), so this always falls through to `inflect_by_bundle`.
    def surface_form(word, bundle, locale = 'en')
      lexeme = lexeme_for(word, locale)
      curated = lexeme && lexeme['forms'] && lexeme['forms'][bundle]
      return curated if curated.present?

      inflect_by_bundle(word, bundle)
    end

    def rule_matches?(rule, history)
      return false if history.empty?

      history_idx = history.length - 1
      valid = true
      lookback = rule['lookback']

      (lookback.length - 1).downto(0) do |idx|
        check = lookback[idx]
        item = history[history_idx]

        if item.nil?
          valid = false unless check['optional']
          break unless valid
          next
        end

        label = item.downcase
        matching =
          if check['words']
            check['words'].include?(label)
          elsif check['type']
            word_type_of(label) == check['type']
          else
            false
          end

        if matching
          matching = false if check['match'] && !label.match?(Regexp.new(check['match']))
          matching = false if check['non_match'] && label.match?(Regexp.new(check['non_match']))
        end

        if matching
          history_idx -= 1
        elsif !check['optional']
          valid = false
        end

        break unless valid
      end

      valid
    end

    # Selects the winning rule for [prior, word]: an "override" rule only wins if its own
    # `overrides` hash literally contains `word` as a key (the to-be/do/have agreement idioms);
    # otherwise the winning rule's `type` must equal the CURRENT WORD's own part of speech.
    def find_rule(prior, word, locale = 'en')
      history = prior.to_s.strip.split(/\s+/)
      rules = rules_data(locale)['rules']

      override = rules.find do |rule|
        rule['type'] == 'override' && rule['overrides'].key?(word) && rule_matches?(rule, history)
      end
      return override if override

      wtype = word_type_of(word)
      return nil unless wtype

      rules.find { |rule| rule['type'] == wtype && rule_matches?(rule, history) }
    end

    # Reproduces a committed rules-en.snapshot.json `tests[]` fixture's `expected` string for
    # [prior, word] (see file header for the full algorithm).
    def resolve(prior, word, locale = 'en')
      rule = find_rule(prior, word, locale)
      return "#{prior} #{word}" unless rule

      if rule['type'] == 'override'
        transformed = rule['overrides'][word] || word
        # A "condense" lookback (the "at the present time" -> "now" idiom) replaces the WHOLE
        # matched span, not just the current word -- the only committed fixture of this shape.
        return transformed if rule['lookback'].all? { |item| item['condense'] }

        "#{prior} #{transformed}"
      else
        bundle = rules_data(locale)['aliases'][rule['inflection']]
        "#{prior} #{surface_form(word, bundle, locale)}"
      end
    end

    # Records, for a given fixture resolution, whether the alias->bundle->form indirection was
    # exercised (a "verb"/"noun"/"pronoun" rule) as opposed to the literal-override idiom path
    # or no rule at all -- used by parity_spec.rb to assert the alias path carries a material
    # share of the fixtures (T-05-01/T-05-02 guard against a resolver that quietly stops
    # exercising the alias table).
    def resolution_path(prior, word, locale = 'en')
      rule = find_rule(prior, word, locale)
      return :no_rule unless rule

      rule['type'] == 'override' ? :override : :alias
    end

    # -------------------------------------------------------------------------------------
    # TASK 2 -- compass-slot parity (see file header). `words_index`, when given, overrides the
    # real committed words-en.json lookup -- used by slot_parity_spec.rb's synthetic-fixture
    # check (see that spec's file header for why a synthetic complement is necessary given
    # today's real data).
    # -------------------------------------------------------------------------------------
    def resolve_slots(word, locale: 'en', words_index: nil)
      lexeme = words_index ? words_index[word.to_s.downcase] : lexeme_for(word, locale)
      return {} unless lexeme

      pos = lexeme['pos']
      pages = rules_data(locale)['slot_layouts'][pos]
      return {} unless pages

      grid = {}
      pages.each do |page|
        page['slots'].each do |slot, bundle|
          form = lexeme['forms'] && lexeme['forms'][bundle]
          grid[slot] = form if form.present?
        end
      end
      grid
    end
  end
end
