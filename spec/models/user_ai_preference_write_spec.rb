require 'spec_helper'

describe User, 'AI preference write path' do
  # The five AI preference keys are consent-bearing, so process_params does not
  # store them verbatim the way it stores every other preference. A value that is
  # not a recognizable boolean is DROPPED, which keeps a malformed write from
  # creating the un-clearable blank master that blocked board generation in
  # production, and equally keeps it from being read as an opt-in.
  def build_user(prefs = {})
    u = User.new
    u.settings = { 'preferences' => prefs }
    u
  end

  def written_prefs(user)
    user.settings['preferences']
  end

  describe 'blank values' do
    it 'does not persist a blank value for any AI preference key' do
      User::EU_AI_PREF_KEYS.each do |key|
        u = build_user
        u.process_params({ 'preferences' => { key => '' } }, {})
        expect(written_prefs(u)).to_not have_key(key),
          "expected #{key} to be dropped, got #{written_prefs(u)[key].inspect}"
      end
    end

    it 'leaves an existing decision untouched when a blank write arrives' do
      # Dropping rather than coercing matters here: coercing to false would opt
      # the user out of something they had deliberately turned on.
      u = build_user('ai_features_enabled' => true, 'ai_board_generation' => true)
      u.process_params({
        'preferences' => { 'ai_features_enabled' => '', 'ai_board_generation' => '' }
      }, {})
      expect(written_prefs(u)['ai_features_enabled']).to eq(true)
      expect(written_prefs(u)['ai_board_generation']).to eq(true)
    end

    it 'never turns a blank write into an opt-in' do
      u = build_user('ai_features_enabled' => false)
      u.process_params({ 'preferences' => { 'ai_features_enabled' => '' } }, {})
      expect(written_prefs(u)['ai_features_enabled']).to eq(false)
    end

    it 'drops whitespace-only and other unrecognized values' do
      ['   ', 'yes', 'on', 'null'].each do |junk|
        u = build_user
        u.process_params({ 'preferences' => { 'ai_board_generation' => junk } }, {})
        expect(written_prefs(u)).to_not have_key('ai_board_generation'),
          "expected #{junk.inspect} to be dropped"
      end
    end
  end

  describe 'valid boolean values' do
    it 'stores real booleans' do
      u = build_user
      u.process_params({
        'preferences' => { 'ai_features_enabled' => true, 'ai_board_generation' => false }
      }, {})
      expect(written_prefs(u)['ai_features_enabled']).to eq(true)
      expect(written_prefs(u)['ai_board_generation']).to eq(false)
    end

    it 'coerces the form-encoded boolean strings' do
      u = build_user
      u.process_params({
        'preferences' => { 'ai_features_enabled' => 'true', 'ai_board_generation' => 'false' }
      }, {})
      expect(written_prefs(u)['ai_features_enabled']).to eq(true)
      expect(written_prefs(u)['ai_board_generation']).to eq(false)
    end

    it 'accepts the 1/0 boolean forms used by the consent payload' do
      u = build_user
      u.process_params({
        'preferences' => { 'ai_features_enabled' => '1', 'ai_board_generation' => '0' }
      }, {})
      expect(written_prefs(u)['ai_features_enabled']).to eq(true)
      expect(written_prefs(u)['ai_board_generation']).to eq(false)
    end
  end

  describe 'non-AI preferences' do
    it 'still stores non-boolean values verbatim' do
      # The hardening is scoped to EU_AI_PREF_KEYS; unrelated preferences keep
      # their existing pass-through behavior.
      u = build_user
      u.process_params({ 'preferences' => { 'skin' => '' } }, {})
      expect(written_prefs(u)['skin']).to eq('')
    end
  end

  describe '.normalize_ai_preference_value' do
    it 'maps the recognized true forms' do
      [true, 'true', '1', 1].each { |v| expect(User.normalize_ai_preference_value(v)).to eq(true) }
    end

    it 'maps the recognized false forms' do
      [false, 'false', '0', 0].each { |v| expect(User.normalize_ai_preference_value(v)).to eq(false) }
    end

    it 'returns nil for anything else' do
      ['', '  ', 'maybe', nil, [], {}].each do |v|
        expect(User.normalize_ai_preference_value(v)).to eq(nil)
      end
    end
  end

  describe 'server/client parity' do
    # app/frontend/app/utils/ai_feature_gate.js mirrors this gate. If the two
    # drift, the UI offers a control the server then refuses with a 403, which is
    # exactly the failure this PR fixes. The JS half is covered by
    # app/frontend/tests/utils/ai_feature_gate-test.js; this asserts the shared
    # key list the mirror hard-codes.
    it 'keeps the per-feature key list in sync with the frontend mirror' do
      js = File.read(Rails.root.join('app/frontend/app/utils/ai_feature_gate.js'))
      FeatureFlags::USER_PREF_AI_FEATURES.each do |key|
        expect(js).to include("#{key}: true"),
          "ai_feature_gate.js is missing #{key} from USER_PREF_AI_FEATURES"
      end
    end

    it 'keeps the blank-master helper present in the frontend mirror' do
      js = File.read(Rails.root.join('app/frontend/app/utils/ai_feature_gate.js'))
      expect(js).to include('function blankMasterPref')
      expect(js).to include('blankMasterPref(master)')
    end

    # The write path accepts 0 / "0" as an explicit opt-out, so BOTH read gates
    # have to recognize them. When these lists drifted, a legacy numeric opt-out
    # read as "allowed" on both server and client.
    it 'keeps the shared boolean vocabulary present in the frontend mirror' do
      js = File.read(Rails.root.join('app/frontend/app/utils/ai_feature_gate.js'))
      expect(js).to include('function aiPrefValue')
      expect(js).to include("AI_PREF_TRUE_VALUES = [true, 'true', '1', 1]")
      expect(js).to include("AI_PREF_FALSE_VALUES = [false, 'false', '0', 0]")
    end

    it 'mirrors the Ruby vocabulary lists exactly' do
      expect(FeatureFlags::AI_PREF_TRUE_VALUES).to eq([true, 'true', '1', 1])
      expect(FeatureFlags::AI_PREF_FALSE_VALUES).to eq([false, 'false', '0', 0])
    end
  end
end
