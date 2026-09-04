module SystemFeatureRegistry
  METADATA = {
    'subscriptions' => { name: 'Subscriptions', category: 'Billing', description: 'Subscription and billing UI' },
    'assessments' => { name: 'Assessments', category: 'Evaluations', description: 'Assessment tools' },
    'custom_sidebar' => { name: 'Custom sidebar', category: 'Boards', description: 'Customizable board sidebar' },
    'canvas_render' => { name: 'Canvas render', category: 'Boards', description: 'Canvas-based board rendering' },
    'snapshots' => { name: 'Snapshots', category: 'Boards', description: 'Board snapshot feature' },
    'enable_all_buttons' => { name: 'Enable all buttons', category: 'Speak mode', description: 'Speak mode option to enable all buttons' },
    'video_recording' => { name: 'Video recording', category: 'Media', description: 'Video recording in logs' },
    'goals' => { name: 'Goals', category: 'Reports', description: 'Goals and badges' },
    'app_connections' => { name: 'App connections', category: 'Integrations', description: 'Third-party app connections' },
    'translation' => { name: 'Translation', category: 'Boards', description: 'Board translation tools' },
    'geo_sidebar' => { name: 'Geo sidebar', category: 'Boards', description: 'Geographic sidebar boards' },
    'modeling' => { name: 'Modeling', category: 'Speak mode', description: 'Remote modeling sessions' },
    'edit_before_copying' => { name: 'Edit before copying', category: 'Boards', description: 'Edit boards before copying' },
    'core_reports' => { name: 'Core reports', category: 'Reports', description: 'Core reporting features' },
    'lessonpix' => { name: 'LessonPix', category: 'Integrations', description: 'LessonPix integration' },
    'audio_recordings' => { name: 'Audio recordings', category: 'Media', description: 'Audio recording on buttons' },
    'fast_render' => { name: 'Fast render', category: 'Boards', description: 'Faster board rendering path' },
    'badge_progress' => { name: 'Badge progress', category: 'Reports', description: 'Badge progress indicators' },
    'board_levels' => { name: 'Board levels', category: 'Boards', description: 'Board level paint and locks' },
    'premium_symbols' => { name: 'Premium symbols', category: 'Boards', description: 'Premium symbol libraries' },
    'find_multiple_buttons' => { name: 'Find multiple buttons', category: 'Boards', description: 'Multi-button find feature' },
    'new_speak_menu' => { name: 'New speak menu', category: 'Speak mode', description: 'Updated speak menu layout' },
    'native_keyboard' => { name: 'Native keyboard', category: 'Speak mode', description: 'Native on-screen keyboard' },
    'inflections_overlay' => { name: 'Inflections overlay', category: 'Speak mode', description: 'Inflection overlay in speak mode' },
    'app_store_purchases' => { name: 'App store purchases', category: 'Billing', description: 'In-app store purchases' },
    'emergency_boards' => { name: 'Emergency boards', category: 'Boards', description: 'Emergency board quick access' },
    'evaluations' => { name: 'Evaluations', category: 'Evaluations', description: 'Evaluation workflows' },
    'swipe_pages' => { name: 'Swipe pages', category: 'Boards', description: 'Swipe between board pages' },
    'app_store_monthly_purchases' => { name: 'Monthly app store purchases', category: 'Billing', description: 'Monthly in-app subscriptions' },
    'ios_head_tracking' => { name: 'iOS head tracking', category: 'Accessibility', description: 'Head tracking on iOS' },
    'vertical_ios_head_tracking' => { name: 'Vertical iOS head tracking', category: 'Accessibility', description: 'Vertical head tracking on iOS' },
    'auto_inflections' => { name: 'Auto inflections', category: 'Speak mode', description: 'Automatic inflection selection' },
    'remote_modeling' => { name: 'Remote modeling', category: 'Speak mode', description: 'Remote modeling for supervisors' },
    'focus_word_highlighting' => { name: 'Focus word highlighting', category: 'Speak mode', description: 'Highlight focus words in speak mode' },
    'profiles' => { name: 'Profiles', category: 'Evaluations', description: 'User profile assessments' },
    'skin_tones' => { name: 'Skin tones', category: 'Boards', description: 'Symbol skin tone options' },
    'lessons' => { name: 'Trainings', category: 'Organization', description: 'Organization training lessons' },
    'other_menu' => { name: 'Other menu', category: 'Speak mode', description: 'Other menu in speak mode' },
    'shallow_clones' => { name: 'Shallow clones', category: 'Boards', description: 'Shallow board cloning' },
    'ai_board_generation' => { name: 'AI board generation', category: 'AI', description: 'AI-assisted board generation', ai_feature: true },
    'ai_word_prediction' => { name: 'AI word prediction', category: 'AI', description: 'AI word prediction', ai_feature: true },
    'ai_board_suggestions' => { name: 'AI board suggestions', category: 'AI', description: 'AI board suggestions', ai_feature: true },
    'ai_symbol_search' => { name: 'AI symbol search', category: 'AI', description: 'AI symbol search', ai_feature: true },
    'ai_compliance_logging' => { name: 'AI compliance logging', category: 'AI', description: 'AI compliance audit logging', ai_feature: true },
    'supervisor_consent_flow' => { name: 'Supervisor consent flow', category: 'Supervisors', description: 'Supervisor consent workflow' },
    'product_telemetry' => { name: 'Product telemetry', category: 'Admin', description: 'Product telemetry collection' },
    'telemetry_admin_panel' => { name: 'Telemetry admin panel', category: 'Admin', description: 'Org telemetry dashboard' },
    'tarheel_reader' => { name: 'Tar Heel Reader', category: 'Integrations', description: 'Tar Heel Reader integration' },
    'auth_spa_transition' => { name: 'Auth SPA transition', category: 'Account', description: 'SPA auth transition flow' },
    'google_sso' => { name: 'Google SSO', category: 'Account', description: 'Google single sign-on' },
    'quick_screen_eval' => { name: 'Quick screen eval', category: 'Evaluations', description: 'Quick screen evaluation' },
    'comprehensive_eval_ai' => { name: 'Comprehensive eval AI', category: 'AI', description: 'AI comprehensive evaluation', ai_feature: true },
    'multi_user_board_import' => { name: 'Multi-user board import', category: 'Boards', description: 'Import boards for multiple users' },
    'customize_menu' => { name: 'Customize menu', category: 'Speak mode', description: 'Customize speak menu items' },
    'home_tour' => { name: 'Home tour', category: 'Onboarding', description: 'Home page guided tour' },
    'paste_html_import' => { name: 'Paste HTML import', category: 'Boards', description: 'Paste HTML or JSON bundle board import (CoughDrop page-set migration)' },
    'catalog_board_prefetch' => { name: 'Catalog board prefetch', category: 'Boards', description: 'Prefetch catalog boards' },
    'background_board_prefetch' => { name: 'Background board prefetch', category: 'Boards', description: 'Background board prefetch' },
    'portrait_orientation_overlay' => { name: 'Portrait orientation overlay', category: 'UI', description: 'Portrait orientation overlay on small screens' },
    'signup_default_library_boards' => { name: 'Signup default library boards', category: 'Signup', description: 'Copy default library boards on signup', server_gated: true, env_override: 'SIGNUP_DEFAULT_LIBRARY_BOARDS' },
    'english_first_board_generation' => { name: 'English-first board generation', category: 'Boards', description: 'Look up symbols and POS in English; persist English as a stored locale' },
    'signup_spanish_library_boards' => { name: 'Signup Spanish library boards', category: 'Signup', description: 'Spanish library boards on signup for es locale', server_gated: true, env_override: 'SIGNUP_SPANISH_LIBRARY_BOARDS' },
    'eu_consent_age' => { name: 'EU consent age injection', category: 'Compliance', description: 'Inject jurisdiction-aware coppa_consent_age into domain_settings' },
    'article_50_disclosure' => { name: 'Article 50 disclosure', category: 'Compliance', description: 'EU AI Act Article 50(1) first-AI-use disclosure modal' },
    'compliance_workflow_kernel' => { name: 'Compliance workflow kernel', category: 'Compliance', description: 'Segment/jurisdiction/digital-consent-age Compliance::Profile (lib/compliance/)' },
    'text_symbol_fallback' => { name: 'Text symbol fallback', category: 'Boards', description: 'Render text-only buttons (label, no image) with their label as the symbol in speak/view mode, instead of a square.svg placeholder plus a duplicate label below' }
  }.freeze

  ENV_LOCKED = {
    'signup_default_library_boards' => 'SIGNUP_DEFAULT_LIBRARY_BOARDS',
    'signup_spanish_library_boards' => 'SIGNUP_SPANISH_LIBRARY_BOARDS'
  }.freeze

  def self.all
    FeatureFlags::AVAILABLE_FRONTEND_FEATURES.map do |key|
      meta = METADATA[key] || {}
      {
        key: key,
        name: meta[:name] || key.humanize,
        description: meta[:description] || '',
        category: meta[:category] || 'Other',
        ai_feature: !!meta[:ai_feature] || FeatureFlags::AI_FEATURES.include?(key),
        server_gated: !!meta[:server_gated],
        env_override: meta[:env_override] || ENV_LOCKED[key],
        env_locked: env_locked?(key),
        code_enabled: FeatureFlags::ENABLED_FRONTEND_FEATURES.include?(key)
      }
    end
  end

  def self.env_locked?(key)
    var = ENV_LOCKED[key]
    return false unless var

    ENV[var].to_s =~ /^(1|true|yes)$/i
  end

  def self.categories
    all.map { |f| f[:category] }.uniq.sort
  end
end
