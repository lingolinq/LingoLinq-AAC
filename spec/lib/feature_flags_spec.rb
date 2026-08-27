require 'spec_helper'

describe FeatureFlags do
  describe "frontend_flags_for" do
    it "should gracefully handle no user" do
      stub_const('FeatureFlags::AVAILABLE_FRONTEND_FEATURES', [])
      flags = FeatureFlags.frontend_flags_for(nil)
      expect(flags).to eq({})
    end
    
    it "should return the default set of flags" do
      stub_const('FeatureFlags::AVAILABLE_FRONTEND_FEATURES', ['a', 'b', 'c'])
      stub_const('FeatureFlags::ENABLED_FRONTEND_FEATURES', ['d', 'b', 'c'])
      allow(SystemFeatureSettings).to receive(:effective_enabled_for).and_return(['b', 'c'])
      flags = FeatureFlags.frontend_flags_for(nil)
      expect(flags).to eq({'b' => true, 'c' => true})
    end
    
    it "should consider user-specific flags in the beta opt-in pool" do
      stub_const('FeatureFlags::AVAILABLE_FRONTEND_FEATURES', ['a', 'b', 'c'])
      stub_const('FeatureFlags::ENABLED_FRONTEND_FEATURES', ['b'])
      allow(SystemFeatureSettings).to receive(:effective_enabled_for).and_return(['b'])
      allow(SystemFeatureSettings).to receive(:canary_enabled_features).and_return(['c'])
      allow(SystemFeatureSettings).to receive(:beta_opt_in_features).and_return(['c'])
      u = User.new(:settings => {})
      u.settings['feature_flags'] = {'c' => true, 'd' => true}
      flags = FeatureFlags.frontend_flags_for(u)
      expect(flags).to eq({'b' => true, 'c' => true})
    end
    
    it "should enable canary pool features for canary users" do
      stub_const('FeatureFlags::AVAILABLE_FRONTEND_FEATURES', ['a', 'b', 'c'])
      stub_const('FeatureFlags::ENABLED_FRONTEND_FEATURES', ['b'])
      stub_const('FeatureFlags::DISABLED_CANARY_FEATURES', ['a'])
      allow(SystemFeatureSettings).to receive(:effective_enabled_for).and_return(['b'])
      allow(SystemFeatureSettings).to receive(:canary_enabled_features).and_return(['b', 'c'])
      allow(SystemFeatureSettings).to receive(:beta_opt_in_features).and_return(['c'])
      u = User.new(:settings => {})
      u.enable_feature('canary')
      flags = FeatureFlags.frontend_flags_for(u)
      expect(flags).to eq({'b' => true, 'c' => true})
    end

    it "should ignore per-user flags outside the beta opt-in pool" do
      stub_const('FeatureFlags::AVAILABLE_FRONTEND_FEATURES', ['a', 'b', 'c'])
      allow(SystemFeatureSettings).to receive(:effective_enabled_for).and_return(['b'])
      allow(SystemFeatureSettings).to receive(:canary_enabled_features).and_return([])
      allow(SystemFeatureSettings).to receive(:beta_opt_in_features).and_return(['b'])
      u = User.new(:settings => {})
      u.settings['feature_flags'] = {'c' => true}
      flags = FeatureFlags.frontend_flags_for(u)
      expect(flags).to eq({'b' => true})
    end
  end
  
  describe "user_created_after?" do
    it "should return the correct response" do
      u = User.new
      expect(FeatureFlags.user_created_after?(u, 'word_suggestion_images')).to eq(true)
      u.created_at = Date.parse("Jan 1, 2000")
      expect(FeatureFlags.user_created_after?(u, 'word_suggestion_images')).to eq(false)
      u.created_at = Date.parse("Jan 1, 2020")
      expect(FeatureFlags.user_created_after?(u, 'word_suggestion_images')).to eq(true)
      u.created_at = Date.parse("Jan 1, 2020")
      expect(FeatureFlags.user_created_after?(u, 'bacon')).to eq(false)
      u.created_at = 2.days.ago
      expect(FeatureFlags.user_created_after?(u, 'bacon')).to eq(false)
      u.created_at = nil
      expect(FeatureFlags.user_created_after?(u, 'bacon')).to eq(false)
    end
  end

  describe "coppa_ai_hard_gate_enabled?" do
    around(:each) do |example|
      old = ENV['COPPA_AI_HARD_GATE']
      example.run
    ensure
      ENV['COPPA_AI_HARD_GATE'] = old
    end

    it "defaults to true when env var is unset" do
      ENV.delete('COPPA_AI_HARD_GATE')
      expect(FeatureFlags.coppa_ai_hard_gate_enabled?).to eq(true)
    end

    it "returns true for any value other than 'false'" do
      ENV['COPPA_AI_HARD_GATE'] = 'true'
      expect(FeatureFlags.coppa_ai_hard_gate_enabled?).to eq(true)
      ENV['COPPA_AI_HARD_GATE'] = '1'
      expect(FeatureFlags.coppa_ai_hard_gate_enabled?).to eq(true)
    end

    it "returns false only when explicitly set to 'false'" do
      ENV['COPPA_AI_HARD_GATE'] = 'false'
      expect(FeatureFlags.coppa_ai_hard_gate_enabled?).to eq(false)
      ENV['COPPA_AI_HARD_GATE'] = 'FALSE'
      expect(FeatureFlags.coppa_ai_hard_gate_enabled?).to eq(false)
    end
  end

  describe "coppa_blocks_ai_for?" do
    around(:each) do |example|
      old = ENV['COPPA_AI_HARD_GATE']
      ENV.delete('COPPA_AI_HARD_GATE')
      example.run
    ensure
      ENV['COPPA_AI_HARD_GATE'] = old
    end

    it "returns false when user is nil" do
      expect(FeatureFlags.coppa_blocks_ai_for?(nil)).to eq(false)
    end

    it "returns false when user has no coppa settings" do
      u = User.new(settings: {})
      expect(FeatureFlags.coppa_blocks_ai_for?(u)).to eq(false)
    end

    it "returns true when user has pending parental consent" do
      u = User.new(settings: { 'coppa' => { 'pending_parent_consent' => true } })
      expect(FeatureFlags.coppa_blocks_ai_for?(u)).to eq(true)
    end

    it "returns false when consent has been granted" do
      u = User.new(settings: { 'coppa' => {
        'pending_parent_consent' => true,
        'parent_consent_granted_at' => Time.now.utc.iso8601
      }})
      expect(FeatureFlags.coppa_blocks_ai_for?(u)).to eq(false)
    end

    it "returns false when the hard gate is disabled, even with pending consent" do
      ENV['COPPA_AI_HARD_GATE'] = 'false'
      u = User.new(settings: { 'coppa' => { 'pending_parent_consent' => true } })
      expect(FeatureFlags.coppa_blocks_ai_for?(u)).to eq(false)
    end
  end

  describe "eu_consent_age" do
    it "is registered as available but OFF by default" do
      expect(FeatureFlags::AVAILABLE_FRONTEND_FEATURES).to include('eu_consent_age')
      expect(FeatureFlags::ENABLED_FRONTEND_FEATURES).not_to include('eu_consent_age')
      expect(FeatureFlags.eu_consent_age_enabled?).to eq(false)
    end

    it "reports enabled once added to the enabled list" do
      stub_const('FeatureFlags::ENABLED_FRONTEND_FEATURES', FeatureFlags::ENABLED_FRONTEND_FEATURES + ['eu_consent_age'])
      expect(FeatureFlags.eu_consent_age_enabled?).to eq(true)
    end
  end

  describe "compliance_workflow_kernel" do
    it "is registered as available but OFF by default" do
      expect(FeatureFlags::AVAILABLE_FRONTEND_FEATURES).to include('compliance_workflow_kernel')
      expect(FeatureFlags::ENABLED_FRONTEND_FEATURES).not_to include('compliance_workflow_kernel')
      expect(FeatureFlags.compliance_workflow_kernel_enabled?).to eq(false)
    end

    it "reports enabled once added to the enabled list" do
      stub_const('FeatureFlags::ENABLED_FRONTEND_FEATURES', FeatureFlags::ENABLED_FRONTEND_FEATURES + ['compliance_workflow_kernel'])
      expect(FeatureFlags.compliance_workflow_kernel_enabled?).to eq(true)
    end
  end

  describe "boards_layout preference" do
    # The Boards-page arrangement is persisted per USER so the choice follows them to a
    # new login. Two things have to hold for that: the key must be in the preference
    # whitelist (User#process_params drops anything else SILENTLY — the pref would look
    # saved client-side and be gone on reload), and the value must be constrained.
    it "is an accepted user preference" do
      expect(User::PREFERENCE_PARAMS).to include('boards_layout')
    end

    it "persists a known value" do
      u = User.create
      u.process({'preferences' => {'boards_layout' => 'top-down'}})
      expect(u.settings['preferences']['boards_layout']).to eq('top-down')
      u.process({'preferences' => {'boards_layout' => 'side-by-side'}})
      expect(u.settings['preferences']['boards_layout']).to eq('side-by-side')
    end

    it "DROPS an unknown value rather than storing client JSON" do
      u = User.create
      u.process({'preferences' => {'boards_layout' => 'top-down'}})
      u.process({'preferences' => {'boards_layout' => 'diagonal'}})
      expect(u.settings['preferences']['boards_layout']).to eq(nil)
    end

    it "stores no server-side default — absent means the client default applies" do
      u = User.create
      expect(u.settings['preferences']['boards_layout']).to eq(nil)
    end
  end

  describe "flag list invariants" do
    # A flag forced on for everyone but never registered as available is a typo that
    # frontend_flags_for silently swallows: the intersection with the available pool
    # is what reaches the client, so the misspelled flag is simply never true and the
    # feature looks broken with nothing logged.
    it "every enabled frontend feature is also registered as available" do
      unregistered = FeatureFlags::ENABLED_FRONTEND_FEATURES - FeatureFlags::AVAILABLE_FRONTEND_FEATURES
      expect(unregistered).to eq([]), "enabled but not available (typo?): #{unregistered.inspect}"
    end

    it "registers no duplicates in either list" do
      %w[AVAILABLE_FRONTEND_FEATURES ENABLED_FRONTEND_FEATURES].each do |list_name|
        list = FeatureFlags.const_get(list_name)
        dups = list.select { |f| list.count(f) > 1 }.uniq
        expect(dups).to eq([]), "#{list_name} has duplicates: #{dups.inspect}"
      end
    end
  end

  describe "TEMPORARY forced-ON flags" do
    # THE GO-LIVE CHECKLIST, as a test rather than as memory.
    #
    # A flag in ENABLED_FRONTEND_FEATURES is forced ON for EVERY user, bypassing the
    # per-user beta opt-in that AVAILABLE_FRONTEND_FEATURES exists to provide. Several are
    # annotated TEMPORARY: they were switched on to evaluate a feature in the browser and
    # are meant to return to AVAILABLE-only before production go-live.
    #
    # The failure mode this guards is silence. Nothing forces anyone to revisit these, and
    # they accumulate — an AAC user finding the UI changed under them is disruptive, which
    # is the whole reason the rollout policy exists. So the inventory is asserted:
    #   * adding a TEMPORARY forced-ON flag without listing it here FAILS, so the decision
    #     is made deliberately and is visible in one place;
    #   * removing one at go-live also FAILS, which is the prompt to strike it off the list
    #     here and confirm the feature still behaves with the flag off.
    #
    # This is an INVENTORY, not an endorsement. Shrinking it is the goal.
    TEMPORARY_FORCED_ON = [
      'board_category_grouping',
      'boards_side_by_side_layout',
      'customize_menu',
      'dashboard_drag_layout',
      'edit_sidebar',
      'portrait_orientation_overlay',
      'sentence_bar_editing',
      'session_resume',
      'supervising_context_banner',
      'supervisor_consent_flow'
    ].freeze

    # Parsed from the source rather than hand-listed a second time: a hand-copied mirror is
    # exactly what drifted in User::BOARD_CATEGORY_KEYS.
    def temporary_entries
      src = File.read(Rails.root.join('lib/feature_flags.rb'))
      body = src[/ENABLED_FRONTEND_FEATURES\s*=\s*\[(.*?)DISABLED_CANARY_FEATURES/m, 1]
      raise "could not locate ENABLED_FRONTEND_FEATURES in feature_flags.rb" if body.nil?
      body.scan(/'([a-z_0-9]+)'\]?,?\s*#\s*TEMPORARY/).flatten
    end

    it "extracts a plausible set from the source" do
      # Guards the regex itself, so a formatting change fails HERE with a clear cause
      # rather than as a confusing inventory mismatch below.
      expect(temporary_entries.length).to be >= 5,
        "only found #{temporary_entries.inspect} — the TEMPORARY scan no longer matches the file's shape"
    end

    it "matches the recorded inventory — update this list when you gate one for go-live" do
      expect(temporary_entries.sort).to eq(TEMPORARY_FORCED_ON.sort),
        "TEMPORARY forced-ON flags changed.\n" \
        "  newly TEMPORARY, not in the inventory: #{(temporary_entries - TEMPORARY_FORCED_ON).inspect}\n" \
        "  in the inventory but no longer TEMPORARY: #{(TEMPORARY_FORCED_ON - temporary_entries).inspect}\n" \
        "If you just gated one for production, remove it from TEMPORARY_FORCED_ON here and confirm " \
        "the feature degrades correctly with the flag off."
    end

    it "every one of them is also registered as available, so removal returns it to beta opt-in" do
      unregistered = TEMPORARY_FORCED_ON - FeatureFlags::AVAILABLE_FRONTEND_FEATURES
      expect(unregistered).to eq([]),
        "forced ON but not registered as available, so removing it from ENABLED deletes the feature " \
        "outright instead of returning it to per-user opt-in: #{unregistered.inspect}"
    end

    # home_tour is deliberately NOT in the inventory above — it is permanently ON now that
    # it is the onboarding path. See its own describe block below.
    it "does not list home_tour, which is permanent rather than temporary" do
      expect(TEMPORARY_FORCED_ON).not_to include('home_tour')
      expect(temporary_entries).not_to include('home_tour'),
        "home_tour was re-annotated TEMPORARY — it is the onboarding path now; see the home_tour specs"
    end
  end

  describe "home_tour" do
    # INVERTED TRIPWIRE. boards_side_by_side_layout and board_category_grouping below are
    # pinned so that REMOVING them from ENABLED fails and reminds you to gate the rollout.
    # This one is the opposite: the guided tour is the ONBOARDING PATH now, so removing it
    # from ENABLED is the breaking change.
    #
    # The chain: the setup wizard was retired (routes/setup.js blanket-redirects; the Extras
    # card, the org-People "Run Setup Wizard" toast and the user-index `setup` action are all
    # gone), so the self-serve branch of dashboard/authenticated-view#intro sets
    # `auto_open_home_tour`. Only <GuidedTour /> consumes that flag, and
    # app-navbar-authenticated-inner.hbs renders <GuidedTour /> only when THIS feature flag is
    # on. Drop it and "Learn about LingoLinq" in Getting Started bounces the user to the
    # dashboard with nothing.
    it "is registered as available" do
      expect(FeatureFlags::AVAILABLE_FRONTEND_FEATURES).to include('home_tour')
    end

    it "must stay ON for everyone — it is the onboarding path now that the setup wizard is retired" do
      expect(FeatureFlags::ENABLED_FRONTEND_FEATURES).to include('home_tour'),
        "home_tour was removed from ENABLED_FRONTEND_FEATURES. That is not a rollout gate here -- " \
        "the setup wizard is retired, so this flag is the only thing rendering <GuidedTour />, and " \
        "new users would land on the dashboard with no onboarding. Re-add it, or restore a non-tour " \
        "onboarding path first."
    end

    it "no longer carries the retired 'remove before merging' instruction" do
      # The comment used to say to strip this flag before merging the spike. Following that
      # would now break onboarding; this pins the correction so it cannot silently come back.
      src = File.read(Rails.root.join('lib/feature_flags.rb'))
      home_tour_line = src.lines.find { |l| l.include?("'home_tour',") && l.include?('#') }
      expect(home_tour_line).not_to be_nil, "expected an annotated 'home_tour' entry in feature_flags.rb"
      # Matched narrowly on the STALE DIRECTIVE's own wording, not on the word "remove" --
      # the replacement comment legitimately contains "do NOT remove from this list".
      expect(home_tour_line).not_to match(/REMOVE from this list before merging/i),
        "the home_tour entry still tells a future reader to remove the flag before merging -- that instruction is stale and would break onboarding"
    end
  end

  describe "boards_side_by_side_layout" do
    # TRIPWIRE, not a preference. This flag is TEMPORARILY forced on for everyone
    # (2026-08-16) so the Boards-page layout selector is visible for design comparison
    # without a per-user opt-in. Turning it off before production go-live means REMOVING
    # it from ENABLED_FRONTEND_FEATURES — at which point the second expectation below
    # fails and this spec must be updated to the "available but OFF by default" shape
    # used by compliance_workflow_kernel above. The failure is the reminder.
    it "is registered as available" do
      expect(FeatureFlags::AVAILABLE_FRONTEND_FEATURES).to include('boards_side_by_side_layout')
    end

    it "is currently forced ON for everyone — remove from ENABLED before go-live" do
      expect(FeatureFlags::ENABLED_FRONTEND_FEATURES).to include('boards_side_by_side_layout')
    end
  end

  describe "board_category_grouping" do
    # Same TRIPWIRE shape as boards_side_by_side_layout above, and this is the flag that
    # actually needs it: turning grouping on MOVES vocabulary out of the cells a user has
    # built positional motor memory on. It previously had no spec at all, which is how a
    # default of `enabled => true` reached the branch unnoticed.
    it "is registered as available" do
      expect(FeatureFlags::AVAILABLE_FRONTEND_FEATURES).to include('board_category_grouping')
    end

    it "is currently forced ON for everyone — remove from ENABLED before go-live" do
      expect(FeatureFlags::ENABLED_FRONTEND_FEATURES).to include('board_category_grouping')
    end

    # The clinical guarantee. `generate_defaults` backfills preference_defaults onto EVERY
    # existing user on their next save, so a `true` here silently regroups established
    # communicators' boards — and persists an explicit true that survives removing the
    # flag. Grouping must be opt-in.
    it "defaults to OFF for every user" do
      expect(User.preference_defaults['any_user']['board_category_grouping']['enabled']).to eq(false)
    end

    it "is an accepted user preference" do
      expect(User::PREFERENCE_PARAMS).to include('board_category_grouping')
    end

    it "stores only the three account-wide flags" do
      u = User.create
      u.process({'preferences' => {'board_category_grouping' => {
        'enabled' => 'false', 'order' => ['people', 'bogus_key'], 'junk' => 'x'
      }}})
      stored = u.settings['preferences']['board_category_grouping']
      expect(stored['enabled']).to eq(false)
      expect(stored['show_category_names']).to eq(true)
      expect(stored['vertical_scroll']).to eq(true)
      # `order` is no longer a user preference at all -- it describes the BOARD. Dropped
      # rather than sanitized, so a stale client cannot have one accepted and then
      # silently ignored by the renderer.
      expect(stored).not_to have_key('order')
      expect(stored['junk']).to eq(nil)
    end

    it "drops a non-hash value rather than storing client JSON" do
      u = User.create
      u.process({'preferences' => {'board_category_grouping' => 'nope'}})
      stored = u.settings['preferences']['board_category_grouping']
      # The sanitizer deletes the bad value; generate_defaults then backfills the safe
      # default. The guarantee that matters is that the client string never persists AND
      # the fallback is OFF — not that the key is absent, and NOT the exact shape of the
      # default hash. Asserting the whole hash coupled this spec to preference_defaults,
      # which is how adding show_category_names/vertical_scroll turned it red without any
      # behaviour actually changing. Pin the two guarantees, not the shape.
      expect(stored).to be_a(Hash)
      expect(stored['enabled']).to eq(false)
    end
  end
end
