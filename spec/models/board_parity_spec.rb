require 'spec_helper'

# Board-level flag-off parity (COMPAT-01/02/03 at board granularity): with `multilingual_grammar`
# OFF (the default), Board#check_for_parts_of_speech_and_inflections must stamp byte-identical
# `inflection_defaults` across a representative sample of EN boards covering distinct parts of
# speech, a board with a `translations` entry, and a board with a manual per-button
# `inflections` array. This complements the fixture-level (parity_spec.rb) and compass-slot
# (slot_parity_spec.rb) proofs with a proof at the granularity real boards are actually stamped
# at -- reusing spec/models/board_schema2_spec.rb's (Plan 03) fixture-building pattern, extended
# to a wider part-of-speech sample per 01-05-PLAN.md Task 3.
#
# All expected values below were captured by running WordData.inflection_locations_for directly
# against the same seeded overrides (not guessed), matching CLAUDE.md RULE #0.
describe 'Board flag-off parity (COMPAT-01/02/03 at board granularity)' do
  # This worktree's local test DB carries a stale, previously-committed `admin: true`
  # Organization row that survives RSpec's per-example transaction rollback (the same class of
  # pre-existing local-environment data hazard documented in
  # docs/task-management/LEARNINGS.md / memory as "Test DB carries orphaned committed rows" --
  # NOT introduced by this plan; spec/models/board_schema2_spec.rb (Plan 03) hits the identical
  # `index_organizations_on_admin` unique-constraint collision when run against this same local
  # DB). `index_organizations_on_admin` allows at most one `admin: true` row ever, so clear it
  # per-example (within this example's own transaction; rolled back afterward, so this has no
  # effect on the DB outside this spec file's own examples) rather than depend on a clean slate.
  before(:each) { Organization.where(admin: true).delete_all }

  # WordData.inflection_locations_for memoizes per-word results in a THREAD-local cache
  # (Thread.current[:word_inflection_cache]) that is NOT reset by RSpec's per-example
  # transaction rollback (it is process/thread state, not a DB row). Several examples below
  # reuse the word "bacon" with DIFFERENT seeded inflection_overrides across examples; without
  # clearing this cache, a later example can read back an earlier example's stale result for
  # "bacon" instead of its own freshly-seeded data. Diagnosed with evidence (confirmed via a
  # direct rails runner reproduction showing the exact stale-cache result appearing verbatim in
  # a later example) before fixing, per CLAUDE.md RULE #0 -- not guessed. This mirrors the
  # Redis-cache isolation hazard 01-03-SUMMARY.md documented for Setting.set, one layer up the
  # stack (in-process memoization rather than Redis).
  before(:each) { Thread.current[:word_inflection_cache] = nil }

  let(:org) { Organization.create(admin: true) }
  let(:user) do
    u = User.create
    org.add_manager(u.user_name, true)
    u.reload
  end

  def seed_word(word, locale, attrs)
    w = WordData.find_by(word: word, locale: locale) || WordData.create(word: word, locale: locale)
    w.process(attrs, updater: user)
    w
  end

  describe 'byte-identical stamped inflection_defaults across distinct parts of speech' do
    it 'stamps a NOUN board (bacon) identically to the legacy path' do
      seed_word('bacon', 'en', {
        'primary_part_of_speech' => 'noun',
        'parts_of_speech' => ['noun'],
        'antonyms' => 'grossness',
        'inflection_overrides' => {
          'plural' => 'bacons',
          'possessive' => "bacon's",
          'regulars' => ['possessive']
        }
      })
      b = Board.create(user: user)
      b.settings['buttons'] = [{ 'id' => 1, 'label' => 'bacon' }]
      b.check_for_parts_of_speech_and_inflections

      expect(b.settings['buttons'][0]['inflection_defaults']).to eq(
        'c' => 'bacon', 'n' => 'bacons', 'se' => 'grossness', 'src' => 'bacon',
        'types' => ['noun'], 'v' => WordData::INFLECTIONS_VERSION
      )
    end

    it 'stamps a VERB board (run) identically to the legacy path' do
      seed_word('run', 'en', {
        'primary_part_of_speech' => 'verb',
        'parts_of_speech' => ['verb'],
        'antonyms' => 'walk',
        'inflection_overrides' => {
          'base' => 'run', 'infinitive' => 'to run', 'present' => 'run',
          'simple_present' => 'runs', 'past' => 'ran',
          'present_participle' => 'running', 'past_participle' => 'run'
        }
      })
      b = Board.create(user: user)
      b.settings['buttons'] = [{ 'id' => 1, 'label' => 'run' }]
      b.check_for_parts_of_speech_and_inflections

      expect(b.settings['buttons'][0]['inflection_defaults']).to eq(
        'w' => 'ran', 's' => 'running', 'sw' => 'run', 'n' => 'runs', 'e' => 'to run',
        'c' => 'run', 'src' => 'run', 'se' => 'walk', 'types' => ['verb'],
        'v' => WordData::INFLECTIONS_VERSION
      )
    end

    it 'stamps an ADJECTIVE board (ugly) identically to the legacy path' do
      seed_word('ugly', 'en', {
        'primary_part_of_speech' => 'adjective',
        'parts_of_speech' => ['adjective'],
        'antonyms' => 'pretty',
        'inflection_overrides' => {
          'base' => 'ugly', 'comparative' => 'uglier', 'superlative' => 'ugliest',
          'negative_comparative' => 'less ugly'
        }
      })
      b = Board.create(user: user)
      b.settings['buttons'] = [{ 'id' => 1, 'label' => 'ugly' }]
      b.check_for_parts_of_speech_and_inflections

      expect(b.settings['buttons'][0]['inflection_defaults']).to eq(
        'ne' => 'uglier', 'e' => 'ugliest', 'w' => 'less ugly', 'c' => 'ugly',
        'src' => 'ugly', 'se' => 'pretty', 'types' => ['adjective'],
        'v' => WordData::INFLECTIONS_VERSION
      )
    end
  end

  it 're-stamping is a genuine no-op once the v-bump stamp already matches (not coincidental agreement)' do
    seed_word('bacon', 'en', {
      'primary_part_of_speech' => 'noun',
      'parts_of_speech' => ['noun'],
      'inflection_overrides' => { 'plural' => 'bacons', 'regulars' => [] }
    })
    b = Board.create(user: user)
    b.settings['buttons'] = [{ 'id' => 1, 'label' => 'bacon' }]
    b.check_for_parts_of_speech_and_inflections
    first_stamp = b.settings['buttons'][0]['inflection_defaults']
    expect(first_stamp['v']).to eq(WordData::INFLECTIONS_VERSION)

    # The already-stamped word must be excluded from the lookup entirely on the second call
    # (the already_updated short-circuit), proving this is a structural skip, not coincidence.
    expect(WordData).to receive(:inflection_locations_for).with([], 'en').and_call_original
    b.check_for_parts_of_speech_and_inflections
    expect(b.settings['buttons'][0]['inflection_defaults']).to eq(first_stamp)
  end

  it 'never overwrites a manually-set per-button inflections array with computed defaults (COMPAT-01)' do
    WordData.create(word: 'hat', locale: 'en', data: { 'types' => ['noun'] })
    b = Board.create(user: user)
    b.settings['buttons'] = [{ 'id' => 1, 'label' => 'hat', 'inflections' => %w[nw w] }]
    b.check_for_parts_of_speech_and_inflections

    expect(b.settings['buttons'][0]['inflections']).to eq(%w[nw w])
    expect(b.settings['buttons'][0]['part_of_speech']).to eq('noun')
  end

  it 'stamps settings["translations"] entries identically across locales (COMPAT-03)' do
    seed_word('bacon', 'en', {
      'primary_part_of_speech' => 'noun',
      'parts_of_speech' => ['noun'],
      'antonyms' => 'grossness',
      'inflection_overrides' => {
        'plural' => 'bacons', 'possessive' => "bacon's", 'regulars' => ['possessive']
      }
    })
    seed_word('chat', 'fr', {
      'primary_part_of_speech' => 'noun',
      'parts_of_speech' => ['noun']
    })

    b = Board.create(user: user)
    b.settings['locale'] = 'fr'
    b.settings['locales'] = %w[en fr]
    b.settings['translations'] = {
      'default' => 'fr', 'current_label' => 'fr', 'current_vocalization' => 'fr',
      '1' => { 'en' => { 'label' => 'bacon' }, 'fr' => { 'label' => 'baconne' } }
    }
    b.settings['buttons'] = [{ 'id' => 1, 'label' => 'baconne' }]
    b.check_for_parts_of_speech_and_inflections

    expect(b.settings['translations']['1']['en']['inflection_defaults']).to eq(
      'c' => 'bacon', 'n' => 'bacons', 'se' => 'grossness', 'src' => 'bacon',
      'types' => ['noun'], 'v' => WordData::INFLECTIONS_VERSION
    )
    expect(b.settings['buttons'][0]['inflection_defaults']).to eq(nil)
  end
end
