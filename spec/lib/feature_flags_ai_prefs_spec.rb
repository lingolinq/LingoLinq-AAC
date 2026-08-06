require 'spec_helper'

describe FeatureFlags, 'AI prefs and EU parental gate' do
  around(:each) do |example|
    old_coppa = ENV['COPPA_AI_HARD_GATE']
    old_eu = ENV['EU_AI_PARENTAL_HARD_GATE']
    ENV.delete('COPPA_AI_HARD_GATE')
    ENV.delete('EU_AI_PARENTAL_HARD_GATE')
    example.run
  ensure
    ENV['COPPA_AI_HARD_GATE'] = old_coppa
    ENV['EU_AI_PARENTAL_HARD_GATE'] = old_eu
  end

  describe 'USER_PREF_AI_FEATURES' do
    it 'lists the four per-feature AI prefs' do
      expect(FeatureFlags::USER_PREF_AI_FEATURES).to match_array(%w[
        ai_board_generation ai_word_prediction ai_board_suggestions ai_symbol_search
      ])
    end
  end

  describe '.eu_ai_parental_hard_gate_enabled?' do
    it 'defaults to true' do
      expect(FeatureFlags.eu_ai_parental_hard_gate_enabled?).to eq(true)
    end

    it "returns false only when explicitly set to 'false'" do
      ENV['EU_AI_PARENTAL_HARD_GATE'] = 'false'
      expect(FeatureFlags.eu_ai_parental_hard_gate_enabled?).to eq(false)
    end
  end

  describe '.eu_under16_blocks_ai_for?' do
    it 'returns false for nil user' do
      expect(FeatureFlags.eu_under16_blocks_ai_for?(nil)).to eq(false)
    end

    it 'returns true when eu_under_16 without active consent' do
      u = User.new(settings: {
        'registration' => { 'eu_under_16' => true },
        'eu_ai_parental_consent' => { 'pending_parent_consent' => true }
      })
      expect(FeatureFlags.eu_under16_blocks_ai_for?(u)).to eq(true)
    end

    it 'returns false when consent is active' do
      u = User.new(settings: {
        'registration' => { 'eu_under_16' => true },
        'eu_ai_parental_consent' => { 'parent_consent_granted_at' => Time.now.utc.iso8601 }
      })
      expect(FeatureFlags.eu_under16_blocks_ai_for?(u)).to eq(false)
    end

    it 'returns false when hard gate is disabled' do
      ENV['EU_AI_PARENTAL_HARD_GATE'] = 'false'
      u = User.new(settings: {
        'registration' => { 'eu_under_16' => true }
      })
      expect(FeatureFlags.eu_under16_blocks_ai_for?(u)).to eq(false)
    end
  end

  describe '.user_pref_allows_ai?' do
    it 'grandfathers when master is nil' do
      u = User.new(settings: { 'preferences' => {} })
      expect(FeatureFlags.user_pref_allows_ai?('ai_board_generation', u)).to eq(true)
    end

    it 'blocks all when master is false' do
      u = User.new(settings: { 'preferences' => { 'ai_features_enabled' => false } })
      expect(FeatureFlags.user_pref_allows_ai?('ai_board_generation', u)).to eq(false)
      expect(FeatureFlags.user_pref_allows_ai?('comprehensive_eval_ai', u)).to eq(false)
    end

    it 'requires per-feature true when master is true for USER_PREF_AI_FEATURES' do
      u = User.new(settings: {
        'preferences' => {
          'ai_features_enabled' => true,
          'ai_board_generation' => true,
          'ai_word_prediction' => false
        }
      })
      expect(FeatureFlags.user_pref_allows_ai?('ai_board_generation', u)).to eq(true)
      expect(FeatureFlags.user_pref_allows_ai?('ai_word_prediction', u)).to eq(false)
      expect(FeatureFlags.user_pref_allows_ai?('ai_symbol_search', u)).to eq(false)
    end

    it 'allows non-pref AI features when master is true' do
      u = User.new(settings: { 'preferences' => { 'ai_features_enabled' => true } })
      expect(FeatureFlags.user_pref_allows_ai?('comprehensive_eval_ai', u)).to eq(true)
      expect(FeatureFlags.user_pref_allows_ai?('ai_compliance_logging', u)).to eq(true)
    end

    # Legacy rows stored "" for the master pref, blocking board generation for 9
    # of 31 production users. It is tempting to read "" as "never decided" and
    # grandfather it, but that turns an unreadable value into an ALLOW, and the
    # intent behind those rows is not recoverable: PaperTrail has no
    # object_changes column here and reify raises on secure_serialize'd settings.
    # So "" fails CLOSED like any other unrecognized value, and the affected
    # users recover by ticking the box in preferences, which writes a real
    # boolean. See User.normalize_ai_preference_value for the write half.
    it 'denies an unreadable master rather than grandfathering it' do
      ['', '   ', 'maybe', {}].each do |bad|
        u = User.new(settings: { 'preferences' => { 'ai_features_enabled' => bad } })
        expect(FeatureFlags.user_pref_allows_ai?('ai_board_generation', u)).to eq(false),
          "expected master=#{bad.inspect} to deny"
      end
    end

    # The grandfather path is for rows that have NEVER carried a value, and it
    # stays exactly as wide as it was before this changeset.
    it 'still grandfathers a genuinely absent master' do
      u = User.new(settings: { 'preferences' => {} })
      expect(FeatureFlags.user_pref_allows_ai?('ai_board_generation', u)).to eq(true)
      expect(FeatureFlags.user_pref_allows_ai?('comprehensive_eval_ai', u)).to eq(true)
    end

    # An unreadable master must deny the two features OUTSIDE
    # USER_PREF_AI_FEATURES as well. An earlier revision returned only on an
    # explicit false, so an unrecognized master fell through to the
    # "not a per-feature AI feature, follow the master" line and allowed them —
    # one being comprehensive_eval_ai, narration over student assessment data.
    it 'denies an unreadable master for features outside USER_PREF_AI_FEATURES' do
      ['', 'maybe'].each do |bad|
        u = User.new(settings: { 'preferences' => { 'ai_features_enabled' => bad } })
        expect(FeatureFlags.user_pref_allows_ai?('comprehensive_eval_ai', u)).to eq(false),
          "expected master=#{bad.inspect} to deny comprehensive_eval_ai"
        expect(FeatureFlags.user_pref_allows_ai?('ai_compliance_logging', u)).to eq(false),
          "expected master=#{bad.inspect} to deny ai_compliance_logging"
      end
    end

    it 'denies an unreadable master even when the child is an explicit opt-in' do
      u = User.new(settings: {
        'preferences' => { 'ai_features_enabled' => '', 'ai_board_generation' => true }
      })
      expect(FeatureFlags.user_pref_allows_ai?('ai_board_generation', u)).to eq(false)
    end

    # The three states must stay distinguishable. Guards against a future
    # `master.blank?` refactor: in Rails `false.blank?` is true, so `.blank?`
    # would reclassify an explicit opt-OUT as "never decided" and re-enable AI.
    it 'keeps an explicit false blocking, and does not confuse it with blank' do
      [false, 'false'].each do |off|
        u = User.new(settings: { 'preferences' => { 'ai_features_enabled' => off } })
        expect(FeatureFlags.user_pref_allows_ai?('ai_board_generation', u)).to eq(false)
        expect(FeatureFlags.user_pref_allows_ai?('comprehensive_eval_ai', u)).to eq(false)
      end
    end

    # An explicit master opt-in with a blank/missing child is an INCOMPLETE
    # opt-in, and allowing it would manufacture per-feature consent.
    it 'still blocks when master is true but the child pref is blank or missing' do
      ['', '   ', nil].each do |child|
        prefs = { 'ai_features_enabled' => true }
        prefs['ai_board_generation'] = child unless child.nil?
        u = User.new(settings: { 'preferences' => prefs })
        expect(FeatureFlags.user_pref_allows_ai?('ai_board_generation', u)).to eq(false)
      end
    end

    # A stored 0 / "0" is an explicit opt-OUT that the write path accepts. It was
    # not blank and did not equal false, so it fell through to "allowed", and for
    # AI features outside USER_PREF_AI_FEATURES it was allowed outright. That
    # turned an old numeric opt-out into AI egress. Exercised through the real
    # gate, not just the value helper.
    it 'blocks on a numeric master opt-out for per-feature AI' do
      [0, '0'].each do |off|
        u = User.new(settings: {
          'preferences' => { 'ai_features_enabled' => off, 'ai_board_generation' => true }
        })
        expect(FeatureFlags.user_pref_allows_ai?('ai_board_generation', u)).to eq(false)
      end
    end

    it 'blocks on a numeric master opt-out for non-per-feature AI' do
      [0, '0'].each do |off|
        u = User.new(settings: { 'preferences' => { 'ai_features_enabled' => off } })
        expect(FeatureFlags.user_pref_allows_ai?('comprehensive_eval_ai', u)).to eq(false)
        expect(FeatureFlags.user_pref_allows_ai?('ai_compliance_logging', u)).to eq(false)
      end
    end

    it 'accepts the numeric opt-in forms for master and child' do
      [1, '1'].each do |on|
        u = User.new(settings: {
          'preferences' => { 'ai_features_enabled' => on, 'ai_board_generation' => on }
        })
        expect(FeatureFlags.user_pref_allows_ai?('ai_board_generation', u)).to eq(true)
      end
    end

    it 'blocks a numeric child opt-out under an enabled master' do
      [0, '0'].each do |off|
        u = User.new(settings: {
          'preferences' => { 'ai_features_enabled' => true, 'ai_board_generation' => off }
        })
        expect(FeatureFlags.user_pref_allows_ai?('ai_board_generation', u)).to eq(false)
      end
    end

    # Any value the write path would accept as an opt-out must read as one.
    it 'reads every writable false value as an opt-out' do
      FeatureFlags::AI_PREF_FALSE_VALUES.each do |off|
        u = User.new(settings: {
          'preferences' => { 'ai_features_enabled' => off, 'ai_board_generation' => true }
        })
        expect(FeatureFlags.user_pref_allows_ai?('ai_board_generation', u)).to eq(false),
          "expected master=#{off.inspect} to block"
      end
    end

    it 'reads every writable true value as an opt-in' do
      FeatureFlags::AI_PREF_TRUE_VALUES.each do |on|
        u = User.new(settings: {
          'preferences' => { 'ai_features_enabled' => on, 'ai_board_generation' => on }
        })
        expect(FeatureFlags.user_pref_allows_ai?('ai_board_generation', u)).to eq(true),
          "expected master=#{on.inspect} child=#{on.inspect} to allow"
      end
    end

    # The shared behavior table. The client mirror runs the SAME cases against
    # app/frontend/app/utils/ai_feature_gate.js, so a one-sided behavior change
    # fails that side's own suite. This replaces an earlier set of "parity"
    # specs that grepped the JS source for helper names — those passed on a
    # comment and could not tell a definition from a call site.
    describe 'shared behavior table' do
      gate_cases = JSON.parse(
        File.read(Rails.root.join('spec/fixtures/ai_pref_gate_cases.json'))
      )['cases']

      gate_cases.each do |c|
        it "#{c['name']} (#{c['feature']})" do
          u = User.new(settings: { 'preferences' => c['prefs'] })
          expect(FeatureFlags.user_pref_allows_ai?(c['feature'], u)).to eq(c['expected'])
        end
      end
    end
  end

  describe '.ai_pref_value' do
    it 'maps the recognized true forms' do
      [true, 'true', '1', 1].each { |v| expect(FeatureFlags.ai_pref_value(v)).to eq(true) }
    end

    it 'maps the recognized false forms' do
      [false, 'false', '0', 0].each { |v| expect(FeatureFlags.ai_pref_value(v)).to eq(false) }
    end

    it 'returns nil when no decision is recorded' do
      [nil, '', '  ', 'maybe', 2].each { |v| expect(FeatureFlags.ai_pref_value(v)).to eq(nil) }
    end

    it 'does not confuse the numeric and boolean forms' do
      expect(FeatureFlags.ai_pref_value(1)).to eq(true)
      expect(FeatureFlags.ai_pref_value(0)).to eq(false)
      expect(1 == true).to eq(false)
      expect(0 == false).to eq(false)
    end

    it 'is the single vocabulary shared with the write path' do
      (FeatureFlags::AI_PREF_TRUE_VALUES + FeatureFlags::AI_PREF_FALSE_VALUES).each do |v|
        expect(User.normalize_ai_preference_value(v)).to eq(FeatureFlags.ai_pref_value(v)),
          "write/read disagree on #{v.inspect}"
      end
    end
  end

  # The behavior table only guarantees parity if both suites run the SAME table.
  # This asserts the generated client fixture still carries the canonical payload
  # byte-for-byte, so a hand-edit of one copy fails here instead of quietly
  # leaving the client half testing something else.
  describe 'client fixture mirror' do
    it 'carries the canonical case table verbatim' do
      canonical = File.read(Rails.root.join('spec/fixtures/ai_pref_gate_cases.json'))
      js = File.read(Rails.root.join('app/frontend/tests/fixtures/ai_pref_gate_cases.js'))
      payload = js[/ai-pref-gate-cases:begin\s*\nconst RAW = String\.raw`\n(.*?)`;\n\/\/ ai-pref-gate-cases:end/m, 1]
      expect(payload).not_to be_nil,
        'could not find the delimited payload in ai_pref_gate_cases.js'
      expect(payload).to eq(canonical),
        'ai_pref_gate_cases.js has drifted from spec/fixtures/ai_pref_gate_cases.json'
    end

    it 'parses to the same structure the server suite runs' do
      canonical = JSON.parse(File.read(Rails.root.join('spec/fixtures/ai_pref_gate_cases.json')))
      js = File.read(Rails.root.join('app/frontend/tests/fixtures/ai_pref_gate_cases.js'))
      payload = js[/const RAW = String\.raw`\n(.*?)`;/m, 1]
      expect(JSON.parse(payload)['cases']).to eq(canonical['cases'])
    end
  end

  describe '.ai_feature_enabled_for?' do
    let(:feature) { 'ai_board_generation' }

    it 'returns false when eu_under16 blocks' do
      u = User.new(settings: {
        'registration' => { 'eu_under_16' => true },
        'preferences' => {}
      })
      allow(FeatureFlags).to receive(:ai_enabled_for?).with(u).and_return(true)
      allow(FeatureFlags).to receive(:feature_enabled_for?).with(feature, u).and_return(true)
      expect(FeatureFlags.ai_feature_enabled_for?(feature, u)).to eq(false)
    end

    it 'returns false when master pref is false even if feature flag is on' do
      u = User.new(settings: {
        'preferences' => { 'ai_features_enabled' => false }
      })
      allow(FeatureFlags).to receive(:ai_enabled_for?).with(u).and_return(true)
      allow(FeatureFlags).to receive(:feature_enabled_for?).with(feature, u).and_return(true)
      expect(FeatureFlags.ai_feature_enabled_for?(feature, u)).to eq(false)
    end

    it 'returns true when grandfather prefs, feature flag on, and no consent blocks' do
      u = User.new(settings: { 'preferences' => {} })
      allow(FeatureFlags).to receive(:ai_enabled_for?).with(u).and_return(true)
      allow(FeatureFlags).to receive(:feature_enabled_for?).with(feature, u).and_return(true)
      expect(FeatureFlags.ai_feature_enabled_for?(feature, u)).to eq(true)
    end
  end
end
