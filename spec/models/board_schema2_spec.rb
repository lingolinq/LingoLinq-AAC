require 'spec_helper'

# Proves Board#check_for_parts_of_speech_and_inflections is behaviorally UNCHANGED with the
# `multilingual_grammar` flag OFF (the default) -- all schema-2 gating lives inside
# WordData.inflection_locations_for (see word_data_schema2_spec.rb); this method needed no
# behavioral change and none was made. This is the flag-off no-op proof required by
# 01-03-PLAN.md Task 3 (COMPAT-01, COMPAT-02, COMPAT-03).
describe "Board schema-2 seam (multilingual_grammar flag)" do
  it "stamps concrete inflection_defaults values identical to the legacy path, with v == INFLECTIONS_VERSION" do
    o = Organization.create(admin: true)
    u = User.create
    o.add_manager(u.user_name, true)
    w = WordData.find_by(word: 'bacon', locale: 'en') || WordData.create(word: 'bacon', locale: 'en')
    w.process({
      'primary_part_of_speech' => 'noun',
      'parts_of_speech' => ['noun'],
      'antonyms' => 'grossness',
      'inflection_overrides' => {
        'plural' => 'bacons',
        'possessive' => "bacon's",
        'regulars' => ['possessive']
      }
    }, {updater: u.reload})
    b = Board.create(user: u)
    b.settings['buttons'] = [
      {'id' => 1, 'label' => 'bacon'}
    ]
    b.check_for_parts_of_speech_and_inflections
    expect(b.settings['buttons'][0]['inflection_defaults']).to eq({
      'c' => 'bacon',
      'n' => 'bacons',
      'se' => 'grossness',
      'src' => 'bacon',
      'types' => ['noun'],
      'v' => WordData::INFLECTIONS_VERSION
    })
    expect(b.settings['buttons'][0]['inflection_defaults']['v']).to eq(2)
  end

  it "is a no-op on re-run once the v-bump stamp already matches (v-bump skip preserved)" do
    o = Organization.create(admin: true)
    u = User.create
    o.add_manager(u.user_name, true)
    w = WordData.find_by(word: 'bacon', locale: 'en') || WordData.create(word: 'bacon', locale: 'en')
    w.process({
      'primary_part_of_speech' => 'noun',
      'parts_of_speech' => ['noun'],
      'inflection_overrides' => {
        'plural' => 'bacons',
        'regulars' => []
      }
    }, {updater: u.reload})
    b = Board.create(user: u)
    b.settings['buttons'] = [{'id' => 1, 'label' => 'bacon'}]
    b.check_for_parts_of_speech_and_inflections
    first_stamp = b.settings['buttons'][0]['inflection_defaults']
    expect(first_stamp['v']).to eq(WordData::INFLECTIONS_VERSION)

    # A second call should exclude the already-stamped word from the lookup entirely (the
    # already_updated short-circuit at the top of the per-locale loop), so the stamped hash is
    # untouched -- not merely coincidentally identical.
    expect(WordData).to receive(:inflection_locations_for).with([], 'en').and_call_original
    b.check_for_parts_of_speech_and_inflections
    expect(b.settings['buttons'][0]['inflection_defaults']).to eq(first_stamp)
  end

  it "does not overwrite a manually-set per-button 'inflections' array with computed defaults (COMPAT-01)" do
    o = Organization.create(admin: true)
    u = User.create
    o.add_manager(u.user_name, true)
    WordData.create(word: 'hat', locale: 'en', data: {'types' => ['noun']})
    b = Board.create(user: u)
    b.settings['buttons'] = [
      {'id' => 1, 'label' => 'hat', 'inflections' => ['nw', 'w']}
    ]
    b.check_for_parts_of_speech_and_inflections
    expect(b.settings['buttons'][0]['inflections']).to eq(['nw', 'w'])
    expect(b.settings['buttons'][0]['part_of_speech']).to eq('noun')
  end

  it "stamps settings['translations'] entries identically across locales (COMPAT-03)" do
    o = Organization.create(admin: true)
    u = User.create
    o.add_manager(u.user_name, true)
    w = WordData.find_by(word: 'bacon', locale: 'en') || WordData.create(word: 'bacon', locale: 'en')
    w.process({
      'primary_part_of_speech' => 'noun',
      'parts_of_speech' => ['noun'],
      'antonyms' => 'grossness',
      'inflection_overrides' => {
        'plural' => 'bacons',
        'possessive' => "bacon's",
        'regulars' => ['possessive']
      }
    }, {updater: u.reload})
    w = WordData.find_by(word: 'chat', locale: 'fr') || WordData.create(word: 'chat', locale: 'fr')
    w.process({
      'primary_part_of_speech' => 'noun',
      'parts_of_speech' => ['noun']
    }, {updater: u.reload})

    b = Board.create(user: u)
    b.settings['locale'] = 'fr'
    b.settings['locales'] = ['en', 'fr']
    b.settings['translations'] = {
      'default' => 'fr',
      'current_label' => 'fr',
      'current_vocalization' => 'fr',
      '1' => {
        'en' => {'label' => 'bacon'}, 'fr' => {'label' => 'baconne'}
      }
    }
    b.settings['buttons'] = [
      {'id' => 1, 'label' => 'baconne'}
    ]
    b.check_for_parts_of_speech_and_inflections
    expect(b.settings['translations']['1']['en']['inflection_defaults']).to eq({
      'c' => 'bacon',
      'n' => 'bacons',
      'se' => 'grossness',
      'src' => 'bacon',
      'types' => ['noun'],
      'v' => WordData::INFLECTIONS_VERSION
    })
    expect(b.settings['buttons'][0]['inflection_defaults']).to eq(nil)
  end
end
