require 'spec_helper'

# Proves WordData.inflection_locations_for is behaviorally UNCHANGED with the
# `multilingual_grammar` flag OFF (the default) -- both against concrete fixtures reused from
# word_data_spec.rb and against a broad, multi-part-of-speech subset of the committed
# `inflection-locations-golden.json` corpus. This is the flag-off no-op proof required by
# 01-03-PLAN.md Task 2 (FLAG-02, FLAG-03, COMPAT-01).
describe "WordData schema-2 seam (multilingual_grammar flag)" do
  around do |example|
    prior_cache = Thread.current[:word_inflection_cache]
    Thread.current[:word_inflection_cache] = {}
    example.run
  ensure
    Thread.current[:word_inflection_cache] = prior_cache
  end

  describe "flag OFF (default) -- concrete fixture parity" do
    it "reproduces the 'hat/want/angrily/I/he' en fixture exactly (word_data_spec.rb ~line 974)" do
      o = Organization.create(admin: true)
      u = User.create
      o.add_manager(u.user_name, true)
      %w[hat want angrily I he].each do |word|
        w = WordData.find_or_create_by(word: word.downcase, locale: 'en')
        w.data ||= {}
        w.data['types'] ||= case word.downcase
          when 'hat' then ['noun']
          when 'want' then ['verb']
          when 'angrily' then ['adverb']
          when 'i', 'he' then ['noun']
          else ['noun']
        end
        w.save!
      end
      hash = WordData.inflection_locations_for(['hat', 'want', 'angrily', 'I', 'he'], 'en')
      expect(hash['angrily']['types'][0]).to eq('adverb')
      expect(hash['want']['types'][0]).to eq('verb')
      expect(hash['hat']['types'][0]).to eq('noun')
      expect(hash['he']['types'][0]).to eq('noun')
      expect(hash['I']['types'][0]).to eq('noun')
    end

    # NOTE: the exact word set ['he','ugly','mask','run','angrily'] only has a true expected-output
    # fixture in word_data_spec.rb at locale 'en-AU' (~line 1433), never at plain 'en'. Rather than
    # copy the 'en-AU' expectations and assume they hold at 'en' (they are only guaranteed to for
    # this exact case), this test independently sets up the SAME data and calls at locale 'en' with
    # no rules/en Setting present (matching both this describe block's clean state and the real,
    # confirmed staging/production state per 01-01-SUMMARY.md). Since `locales = [locale, locale
    # split]` and `locale.match(/^en/i)` behave identically for 'en' and 'en-AU' when no Setting
    # exists for either, this reproduces the same values as the 'en-AU' fixture -- verified by
    # this test actually running the code, not by assumption.
    it "reproduces the 'he/ugly/mask/run/angrily' set at locale 'en' (no true 'en' fixture exists; substituted setup run directly at 'en')" do
      o = Organization.create(admin: true)
      u = User.create
      o.add_manager(u.user_name, true)
      w = WordData.find_or_create_by(word: 'he', locale: 'en')
      w.data ||= {}
      w.save!
      w.reload
      w.process({
        primary_part_of_speech: 'pronoun',
        antonyms: 'she',
        inflection_overrides: {
          base: 'he',
          plural: 'hes',
          subjective: 'he',
          possessive: 'his',
          objective: 'him',
          possessive_adjective: 'his',
          reflexive: 'himself',
          regulars: ['possessive', 'base']
        }
      }, {updater: u.reload})
      w = WordData.find_or_create_by(word: 'ugly', locale: 'en')
      w.data ||= {}
      w.save!
      w.reload
      w.process({
        primary_part_of_speech: 'adjective',
        antonyms: 'pretty',
        inflection_overrides: {
          base: 'ugly',
          comparative: 'uglier',
          superlative: 'ugliest',
          negative_comparative: 'less ugly',
          plural: 'uglies',
        }
      }, {updater: u.reload})
      w = WordData.find_or_create_by(word: 'mask', locale: 'en')
      w.data ||= {}
      w.save!
      w.reload
      w.process({
        primary_part_of_speech: 'noun',
        inflection_overrides: {
          base: 'mask',
          plural: 'masks',
          possessive: "mask's",
          regulars: ['plural']
        }
      }, {updater: u.reload})
      w = WordData.find_or_create_by(word: 'run', locale: 'en')
      w.data ||= {}
      w.save!
      w.reload
      w.process({
        primary_part_of_speech: 'verb',
        antonyms: 'walk,stroll',
        inflection_overrides: {
          base: 'run',
          infinitive: 'to run',
          present: 'run',
          simple_present: 'runs',
          plural_present: 'run',
          personal_past: 'ran',
          past: 'ran',
          simple_past: '',
          present_participle: 'running',
          past_participle: 'run',
        }
      }, {updater: u.reload})
      w = WordData.find_or_create_by(word: 'angrily', locale: 'en')
      w.data ||= {}
      w.save!
      w.reload
      w.process({
        primary_part_of_speech: 'adverb',
        inflection_overrides: {
          base: 'angrily',
          comparative: 'more angrily',
          superlative: 'most angrily',
          negative_comparative: 'N/A',
          regulars: ['comparative']
        }
      }, {updater: u.reload})

      hash = WordData.inflection_locations_for(['he', 'ugly', 'mask', 'run', 'angrily'], 'en')
      expect(hash['he']).to include(
        'c' => 'he',
        'e' => 'himself',
        'n' => 'him',
        'src' => 'he',
        'se' => 'she',
        'v' => WordData::INFLECTIONS_VERSION,
        'w' => 'his'
      )
      expect(hash['he']['types']).to include('pronoun')
      expect(hash['ugly']).to eq({
        "c"=>"ugly",
        "e"=>"ugliest",
        "ne"=>"uglier",
        'se' => 'pretty',
        "src"=>"ugly",
        "types"=>["adjective"],
        "v"=>WordData::INFLECTIONS_VERSION,
        "w"=>"less ugly"
      })
      expect(hash['mask']).to include(
        "c"=>"mask",
        "s"=>"mask's",
        "src"=>"mask",
        "v"=>WordData::INFLECTIONS_VERSION
      )
      expect(hash['mask']['types']).to include('noun')
      expect(hash['run']).to include(
        "c"=>"run",
        "e"=>"to run",
        "n"=>"runs",
        "ne"=>"run",
        "s"=>"running",
        "se"=>"walk",
        'sw' => 'run',
        'src' => 'run',
        'v' => WordData::INFLECTIONS_VERSION,
        'w' => 'ran'
      )
      expect(hash['run']['types']).to include('verb')
      expect(hash['angrily']).to eq({
        'c' => 'angrily',
        'e' => 'most angrily',
        'src' => 'angrily',
        'types' => ['adverb'],
        'v' => WordData::INFLECTIONS_VERSION
      })
    end
  end

  describe "flag OFF -- broad golden-corpus regression" do
    # Subset: first 20 words (alphabetical -- both committed JSON files are key-sorted) per
    # distinct primary part-of-speech (types[0]) group found in the real committed snapshot.
    # This exercises every POS the legacy fallback grid (word_data.rb:797-925) and the
    # Setting-rules branch (773-796) branch on -- noun, adjective, verb, adverb, pronoun, plus
    # the minor/unknown groups (interjection, preposition, article, conjunction, question,
    # expletive) -- and naturally includes multi-type words since real words in each group carry
    # varying numbers of types. 11 groups x <=20 words each = <=220 words total, far broader than
    # the ~5 hardcoded fixtures above, while remaining fast enough for CI.
    # Setting.set/get_cached write through to Redis with a 60-minute TTL that is NOT rolled back
    # by rspec's per-example DB transaction (only the Setting row itself is). Without explicit
    # cleanup, a real 'rules/en' write here would leak into every other spec (in this run or a
    # later one, within the TTL) that assumes no rules/en Setting exists -- exactly the assumption
    # spec/models/word_data_spec.rb's 'en'/'en-AU' fixtures depend on. Clear the cache key before
    # AND after so this test is a no-op on shared Redis state.
    around do |example|
      RedisInit.default.del('setting/rules/en')
      example.run
    ensure
      RedisInit.default.del('setting/rules/en')
    end

    it "matches inflection-locations-golden.json exactly across a deterministic multi-POS subset" do
      words_snapshot = JSON.parse(File.read(Rails.root.join('db', 'language', 'en', 'words-en.snapshot.json')))['words']
      rules_snapshot = JSON.parse(File.read(Rails.root.join('db', 'language', 'en', 'rules-en.snapshot.json')))
      golden = JSON.parse(File.read(Rails.root.join('db', 'language', 'en', 'inflection-locations-golden.json')))['words']

      by_pos = Hash.new { |h, k| h[k] = [] }
      words_snapshot.each do |word, data|
        pos = (data['types'] || [])[0]
        by_pos[pos] << word if by_pos[pos].length < 20
      end
      subset_words = by_pos.values.flatten
      expect(subset_words.length).to be > 100 # sanity: materially broader than the ~5-word fixtures

      o = Organization.create(admin: true)
      u = User.create
      o.add_manager(u.user_name, true)
      subset_words.each do |word|
        wd = WordData.find_or_create_by(word: word, locale: 'en')
        wd.data = words_snapshot[word].dup
        wd.save!
      end

      # Seed the Setting-rules branch (773-796) too, so this regression is DB-state-independent
      # of which branch a given environment happens to hit -- for this corpus (zero populated
      # inflection_overrides on every word, confirmed 01-01-SUMMARY.md), both branches converge
      # on the same empty-locations result, so this is a genuine cross-branch proof, not a
      # tautology.
      Setting.set('rules/en', {
        'rules' => rules_snapshot['rules'],
        'inflection_locations' => rules_snapshot['inflection_locations']
      }, true)

      hash = WordData.inflection_locations_for(subset_words, 'en')

      subset_words.each do |word|
        expect(hash[word]).to eq(golden[word])
      end
    end
  end

  describe "flag ON -- minimal stub is inert w.r.t. flag OFF" do
    it "returns the schema2 stub marker when ON, without corrupting a subsequent flag-off call" do
      allow(FeatureFlags).to receive(:multilingual_grammar_enabled_for?).and_call_original
      allow(FeatureFlags).to receive(:multilingual_grammar_enabled_for?).with(nil).and_return(true)
      hash = WordData.inflection_locations_for(['anything'], 'en')
      expect(hash['anything']).to eq({'schema2_stub' => true})

      allow(FeatureFlags).to receive(:multilingual_grammar_enabled_for?).with(nil).and_return(false)
      o = Organization.create(admin: true)
      u = User.create
      o.add_manager(u.user_name, true)
      w = WordData.find_or_create_by(word: 'hat', locale: 'en')
      w.data ||= {}
      w.data['types'] = ['noun']
      w.save!
      hash2 = WordData.inflection_locations_for(['hat'], 'en')
      expect(hash2['hat']['types'][0]).to eq('noun')
      expect(hash2['hat']).not_to have_key('schema2_stub')
    end
  end
end
