module FeatureFlags
  # TODO: remove unused feature flags after like December 2019
  # NOTE: 'customize_menu' is currently registered in BOTH lists below —
  # it ships ON for everyone temporarily during the current testing
  # window (per Scot #1 review + Traci's direction 2026-05-27). When
  # testing is complete and we move to the canonical "off by default,
  # beta opt-in per user" pattern, REMOVE 'customize_menu' from
  # ENABLED_FRONTEND_FEATURES (keeping it in AVAILABLE_FRONTEND_FEATURES)
  # so it switches to a per-user-flag. See:
  # app/frontend/app/templates/user/board-detail.hbs ({{#if … customize_menu}})
  # app/frontend/app/controllers/user/board-detail.js set_speak_menu_item_hidden
  AVAILABLE_FRONTEND_FEATURES = ['subscriptions', 'assessments', 'custom_sidebar',
              'canvas_render', 'snapshots', 'enable_all_buttons',
              'video_recording', 'goals', 'app_connections', 'translation', 'geo_sidebar',
              'modeling', 'edit_before_copying', 'core_reports', 'lessonpix',
              'audio_recordings', 'fast_render', 'badge_progress', 'board_levels', 'premium_symbols',
              'find_multiple_buttons', 'new_speak_menu', 'native_keyboard', 'inflections_overlay',
              'app_store_purchases', 'emergency_boards', 'evaluations', 'swipe_pages',
              'app_store_monthly_purchases', 'ios_head_tracking', 'vertical_ios_head_tracking',
              'auto_inflections', 'remote_modeling', 'focus_word_highlighting', 'profiles',
              'skin_tones', 'lessons', 'other_menu', 'shallow_clones', 'ai_board_generation',
              'ai_word_prediction', 'ai_board_suggestions', 'ai_symbol_search',
              'ai_compliance_logging', 'supervisor_consent_flow', 'product_telemetry',
              'telemetry_admin_panel',
              'tarheel_reader', 'auth_spa_transition', 'google_sso', 'quick_screen_eval',
              'comprehensive_eval_ai', 'multi_user_board_import', 'customize_menu',
              'home_tour', 'paste_html_import', 'catalog_board_prefetch',
              'background_board_prefetch',
              'portrait_orientation_overlay', 'signup_default_library_boards',
              'english_first_board_generation', 'signup_spanish_library_boards',
              'dashboard_drag_layout', 'boards_page_owner_dedup', 'edit_sidebar',
              'sentence_bar_editing',
              'text_symbol_fallback',
              # EU launch (GDPR Art. 8): make the registration parental-consent
              # age gate jurisdiction-aware (EU under-16 vs default under-13).
              # AVAILABLE-only => OFF for everyone by default; with it OFF the
              # registration flow is identical to today. Add to
              # ENABLED_FRONTEND_FEATURES to activate (see eu_consent_age_enabled?).
              'eu_consent_age',
              # EU AI Act Article 50(1) first-AI-use disclosure modal (Art50 Phase 5,
              # RLL-01). Reaches the client via frontend_flags_for(user) ->
              # appState.feature_flags.article_50_disclosure, which is the ONLY input
              # utils/article50_gate.js#needsAcknowledgement reads before it will show
              # the modal. AVAILABLE-only => OFF for everyone by default, so the whole
              # Phase 3/4 disclosure path stays inert (the intended pre-2026-08-02
              # state). Enabling it is a HARD release gate for the 2026-08-02 Article 50
              # deadline: add to ENABLED_FRONTEND_FEATURES (or opt individual EU orgs in
              # via per-user beta flag) ONLY on Scot's explicit sign-off, and only after
              # the production deploy of Phases 3-5. Do NOT blanket-enable here.
              'article_50_disclosure',
              # Privacy Compliance Kernel (lib/compliance/): segment + jurisdiction +
              # digital-consent-age profile. AVAILABLE-only => OFF by default so
              # registration / EuJurisdiction / coppa_consent_age stay identical to
              # today. Add to ENABLED_FRONTEND_FEATURES to persist settings.compliance
              # and expose Compliance::Profile in user JSON / domain_settings.
              'compliance_workflow_kernel',
              # Landing-page beta publish: hide Sign In / Register, block auth
              # routes + self-registration API, show "In beta testing" badge.
              # ENABLED while develop/beta publish keeps public auth closed;
              # remove from ENABLED (or drop gates) when opening public auth again.
              'landing_beta_closed']
  ENABLED_FRONTEND_FEATURES = ['subscriptions', 'assessments', 'custom_sidebar', 'snapshots',
              'video_recording', 'goals', 'modeling', 'geo_sidebar', 'edit_before_copying',
              'core_reports', 'lessonpix', 'translation', 'fast_render',
              'audio_recordings', 'app_connections', 'enable_all_buttons', 'badge_progress',
              'premium_symbols', 'board_levels', 'native_keyboard', 'app_store_purchases',
              'find_multiple_buttons', 'new_speak_menu', 'swipe_pages', 'inflections_overlay',
              'ios_head_tracking', 'emergency_boards', 'evaluations',
              'vertical_ios_head_tracking', 'remote_modeling', 'auto_inflections', 'focus_word_highlighting',
              'skin_tones', 'lessons', 'profiles', 'other_menu', 'ai_board_generation', 'ai_word_prediction',
              'google_sso', 'quick_screen_eval', 'multi_user_board_import',
              'customize_menu', # TEMPORARY: forced ON for everyone during testing. Before production go-live, gate for staged rollout — return to AVAILABLE-only (beta opt-in per user) instead of blanket-ON (see the rollout policy above AVAILABLE_FRONTEND_FEATURES).
              'home_tour', # TEMPORARY (spike — 2026-05-27): ON for everyone so Traci can validate the Shepherd.js home-page tour in the browser. REMOVE from this list before merging the spike out of traci/styling/styling-updates — the canonical state is AVAILABLE-only (beta opt-in per user).
              'portrait_orientation_overlay', # TEMPORARY (2026-05-29): forced ON for everyone to validate the ≤640px landscape-orientation overlay + immersive tool consolidation in the browser. Before production go-live, gate for staged rollout — return to AVAILABLE-only (beta opt-in per user) instead of blanket-ON, per the rollout policy above AVAILABLE_FRONTEND_FEATURES.
              'background_board_prefetch',
              'signup_default_library_boards', 'english_first_board_generation',
              'dashboard_drag_layout', # TEMPORARY (2026-06-09): forced ON for everyone pre-production to validate the Getting Started drag-to-swap home layout. Before production go-live, gate for staged rollout — return to AVAILABLE-only (beta opt-in per user) instead of blanket-ON, per the rollout policy above AVAILABLE_FRONTEND_FEATURES.
              'edit_sidebar', # TEMPORARY (2026-06-25): forced ON for everyone so Traci can validate the speak-mode "Edit Sidebar" panel in the browser. Before production go-live, gate for staged rollout — return to AVAILABLE-only (beta opt-in per user) instead of blanket-ON, per the rollout policy above AVAILABLE_FRONTEND_FEATURES.
              'sentence_bar_editing', # TEMPORARY (2026-06-27): forced ON for everyone to validate the speak-bar active-edit controls (remove + reorder chips) in the browser. Before production go-live, gate for staged rollout — return to AVAILABLE-only (beta opt-in per user) instead of blanket-ON, per the rollout policy above AVAILABLE_FRONTEND_FEATURES.
              'text_symbol_fallback', # Default ON so imported OBF text-only buttons render their labels as symbols; keep registered for rollback through system feature settings.
              'landing_beta_closed'] # TEMPORARY: ON while beta keeps Sign In/Register closed. Remove from ENABLED before opening public auth.
  DISABLED_CANARY_FEATURES = []
  FEATURE_DATES = {
    'word_suggestion_images' => 'Jan 21, 2017',
    'hidden_buttons' => 'Feb 2, 2017',
    'browser_no_autosync' => 'Feb 22, 2017',
    'folder_icons' => 'Mar 7, 2017',
    'symbol_background' => 'May 10, 2017',
    'new_index' => 'Feb 17, 2018',
    'click_buttons' => 'May 1, 2019',
    'token_refresh' => 'July 4, 2019',
    'battery_sounds' => 'February 25, 2020',
    'auto_capitalize' => 'May 1, 2021',
    'utterance_interruptions' => 'May 15, 2021',
    'utterance_core_access' => 'May 1, 2021',
    'recent_cleared_phrases' => 'Sep 1, 2021',
    'skin_tones' => 'Feb 14, 2022',
    'ai_board_generation' => 'Feb 1, 2026',
    'ai_word_prediction' => 'Feb 21, 2026',
    'ai_board_suggestions' => 'Feb 21, 2026',
    'ai_symbol_search' => 'Feb 21, 2026',
    'ai_compliance_logging' => 'Feb 21, 2026',
    'supervisor_consent_flow' => 'Mar 22, 2026',
    'tarheel_reader' => 'Apr 14, 2026',
    'auth_spa_transition' => 'Apr 25, 2026',
    'google_sso' => 'May 18, 2026',
    'quick_screen_eval' => 'May 9, 2026',
    'comprehensive_eval_ai' => 'May 12, 2026',
    'multi_user_board_import' => 'May 15, 2026',
    'compliance_workflow_kernel' => 'Jul 23, 2026',
    'text_symbol_fallback' => 'Jul 28, 2026',
    'landing_beta_closed' => 'Jul 14, 2026'
  }
  AI_FEATURES = %w[ai_board_generation ai_word_prediction ai_board_suggestions
                   ai_symbol_search ai_compliance_logging comprehensive_eval_ai].freeze
  # Per-user preference keys that require an explicit true when the master
  # ai_features_enabled pref is on. Other AI_FEATURES follow the master only.
  USER_PREF_AI_FEATURES = %w[ai_board_generation ai_word_prediction
                             ai_board_suggestions ai_symbol_search].freeze
  def self.frontend_flags_for(user)
    flags = {}
    enabled_list = SystemFeatureSettings.effective_enabled_for(user)
    canary_list = SystemFeatureSettings.canary_enabled_features
    beta_list = SystemFeatureSettings.beta_opt_in_features
    user_flags = user && user.settings && user.settings['feature_flags']
    AVAILABLE_FRONTEND_FEATURES.each do |feature|
      if enabled_list.include?(feature)
        flags[feature] = true
      elsif user_flags && user_flags[feature] && beta_list.include?(feature)
        flags[feature] = true
      elsif user_flags && user_flags['canary'] && canary_list.include?(feature)
        flags[feature] = true
      end
    end
    flags
  end
  
  def self.user_created_after?(user, feature)
    return false unless FEATURE_DATES[feature]
    date = Date.parse(FEATURE_DATES[feature]) rescue Date.today
    created = (user.created_at || Time.now).to_date
    return !!(created >= date)
  end
  
  def self.feature_enabled_for?(feature, user)
    flags = frontend_flags_for(user)
    !!flags[feature]
  end

  # Kill-switch for LL-90045bb29c option (b): whether User#lesson_share_token MINTS the new
  # expiring token (default) or reverts to the legacy permanent user_token. Accept points
  # (User.find_by_lesson_share_token) always accept BOTH formats, so this only controls what
  # NEW lesson/board share URLs embed, never what resolves. Default is ON (the hardening);
  # set EXPIRING_LESSON_SHARE_TOKENS=off (or 0/false/no) in the environment to revert
  # construction to the legacy token in one switch, no code deploy.
  def self.expiring_lesson_share_tokens_enabled?(_user = nil)
    return false if ENV['EXPIRING_LESSON_SHARE_TOKENS'].to_s =~ /^(0|false|no|off)$/i
    true
  end

  # Server-side gate for copying default vocab boards into new user libraries.
  def self.signup_default_library_boards_enabled?(_user = nil)
    return true if ENV['SIGNUP_DEFAULT_LIBRARY_BOARDS'].to_s =~ /^(1|true|yes)$/i
    list = _user ? SystemFeatureSettings.effective_enabled_for(_user) : SystemFeatureSettings.default_enabled_features
    list.include?('signup_default_library_boards')
  end

  def self.signup_spanish_library_boards_enabled?(user = nil)
    return true if ENV['SIGNUP_SPANISH_LIBRARY_BOARDS'].to_s =~ /^(1|true|yes)$/i
    list = user ? SystemFeatureSettings.effective_enabled_for(user) : SystemFeatureSettings.default_enabled_features
    return false unless list.include?('signup_spanish_library_boards')
    return true unless user
    prefs = user.settings && user.settings['preferences']
    locale = (prefs && prefs['locale']) || (user.settings && user.settings['locale'])
    locale.to_s.match?(/^es/i)
  end

  # Check if AI features are allowed for a user's organization.
  # Organizations can opt out of all AI processing (required for FERPA/HIPAA compliance).
  def self.ai_enabled_for?(user)
    return true unless user
    org = user.respond_to?(:managing_organization) ? user.managing_organization : nil
    org ||= user.respond_to?(:organization) ? user.organization : nil
    return true unless org
    return false if org.respond_to?(:settings) && org.settings && org.settings['disable_ai_features']
    true
  end

  # Check if a specific AI feature is enabled for a user (combines feature flag +
  # org opt-out + COPPA / EU under-16 parental gates + per-user AI prefs).
  def self.ai_feature_enabled_for?(feature, user)
    return false unless AI_FEATURES.include?(feature)
    return false unless ai_enabled_for?(user)
    return false if coppa_blocks_ai_for?(user)
    return false if eu_under16_blocks_ai_for?(user)
    return false unless user_pref_allows_ai?(feature, user)
    feature_enabled_for?(feature, user)
  end

  # Legacy: injects domain_settings.coppa_consent_age (13 vs 16) when enabled.
  # Registration signup parental consent is ALWAYS under-13 (COPPA account
  # activation) and does not consume this flag. GDPR Art. 8 for EU under-16 is
  # handled post-signup via settings['eu_ai_parental_consent'] (AI prefer-gate),
  # not by blocking account creation. Keep OFF (AVAILABLE-only) unless a
  # non-registration consumer needs the injected age.
  def self.eu_consent_age_enabled?
    ENABLED_FRONTEND_FEATURES.include?('eu_consent_age')
  end

  # Compliance Kernel (lib/compliance/). AVAILABLE-only until rollout; when OFF,
  # User#process_params skips settings['compliance'] persistence and serializers
  # omit the compliance profile blob.
  def self.compliance_workflow_kernel_enabled?
    ENABLED_FRONTEND_FEATURES.include?('compliance_workflow_kernel')
  end

  # Landing-page beta publish: Sign In / Register closed for anonymous visitors.
  # Mirrors eu_consent_age_enabled? — anonymous pages only see ENABLED.
  def self.landing_beta_closed_enabled?
    ENABLED_FRONTEND_FEATURES.include?('landing_beta_closed')
  end

  # COPPA Final Rule (16 CFR 312.5) hard-gate. Default ON.
  # Set COPPA_AI_HARD_GATE=false in env for emergency rollback only.
  def self.coppa_ai_hard_gate_enabled?
    ENV['COPPA_AI_HARD_GATE'].to_s.downcase != 'false'
  end

  # Returns true when AI calls must be blocked for this user because COPPA
  # parental consent is still pending. Used by every AI call site as a
  # short-circuit before PiiScrubber and any provider request.
  def self.coppa_blocks_ai_for?(user)
    return false unless coppa_ai_hard_gate_enabled?
    return false unless user
    return false unless user.respond_to?(:coppa_parental_consent_blocks_access?)
    user.coppa_parental_consent_blocks_access?
  end

  # EU under-16 AI parental-consent hard-gate. Default ON.
  # Set EU_AI_PARENTAL_HARD_GATE=false in env for emergency rollback only.
  def self.eu_ai_parental_hard_gate_enabled?
    ENV['EU_AI_PARENTAL_HARD_GATE'].to_s.downcase != 'false'
  end

  # True when AI must be blocked because the user is EU under-16 without active
  # parental consent for AI enablement.
  def self.eu_under16_blocks_ai_for?(user)
    return false unless eu_ai_parental_hard_gate_enabled?
    return false unless user
    return false unless user.respond_to?(:eu_under_16?)
    return false unless user.respond_to?(:eu_ai_parental_consent_active?)
    user.eu_under_16? && !user.eu_ai_parental_consent_active?
  end

  # Per-user AI preference gate.
  # - Master (ai_features_enabled) nil => grandfather allowed (legacy users).
  # - Master false => block all AI.
  # - Master true => USER_PREF_AI_FEATURES require prefs[feature] == true;
  #   other AI_FEATURES follow the master (allowed).
  def self.user_pref_allows_ai?(feature, user)
    return true unless user
    prefs = user.settings && user.settings['preferences']
    return true unless prefs.is_a?(Hash)
    master = prefs['ai_features_enabled']
    return true if master.nil?
    return false if master == false || master.to_s == 'false'
    return true unless USER_PREF_AI_FEATURES.include?(feature.to_s)
    val = prefs[feature.to_s]
    val == true || val.to_s == 'true'
  end
end
