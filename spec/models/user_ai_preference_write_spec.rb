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

  # Behavior, not source text. Server/client parity is enforced by the shared
  # case table (spec/fixtures/ai_pref_gate_cases.json), which both suites
  # execute; see spec/lib/feature_flags_ai_prefs_spec.rb. What belongs HERE is
  # the write-vs-read relationship, which is Ruby on both ends.
  describe 'write and read vocabularies' do
    # These were briefly separate lists and the gap was a real consent bug: 0 and
    # "0" were accepted here as an explicit false while the gate did not read
    # them as an opt-out, so a legacy numeric opt-out evaluated as "allowed".
    it 'agrees with the read gate on every value either side recognizes' do
      values = FeatureFlags::AI_PREF_TRUE_VALUES + FeatureFlags::AI_PREF_FALSE_VALUES
      values.each do |v|
        expect(User.normalize_ai_preference_value(v)).to eq(FeatureFlags.ai_pref_value(v)),
          "write/read disagree on #{v.inspect}"
      end
    end

    # The write vocabulary must never be WIDER than the read vocabulary: a value
    # storable as consent that the gate cannot read back is exactly the "" state
    # that caused this changeset.
    it 'stores nothing the read gate cannot interpret' do
      ['', '   ', 'maybe', 2, nil, {}, []].each do |v|
        next if FeatureFlags.ai_pref_value(v) != nil
        expect(User.normalize_ai_preference_value(v)).to eq(nil),
          "#{v.inspect} is writable but unreadable"
      end
    end

    it 'is a pure delegate, so the two cannot drift apart' do
      expect(User.method(:normalize_ai_preference_value).owner).to eq(User.singleton_class)
      [true, false, '', 'maybe', 0, 1, nil].each do |v|
        expect(User.normalize_ai_preference_value(v)).to eq(FeatureFlags.ai_pref_value(v))
      end
    end
  end
end
