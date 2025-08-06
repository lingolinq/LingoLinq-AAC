module FeatureFlags
  # TODO: remove unused feature flags after like December 2019
  AVAILABLE_FRONTEND_FEATURES = ['subscriptions', 'assessments', 'custom_sidebar', 
              'canvas_render', 'snapshots', 'enable_all_buttons', 
              'video_recording', 'goals', 'app_connections', 'translation', 'geo_sidebar',
              'modeling', 'edit_before_copying', 'core_reports', 'lessonpix',
              'audio_recordings', 'fast_render', 'badge_progress', 'board_levels', 'premium_symbols',
              'find_multiple_buttons', 'new_speak_menu', 'native_keyboard', 'inflections_overlay',
              'app_store_purchases', 'emergency_boards', 'evaluations', 'swipe_pages', 
              'app_store_monthly_purchases', 'ios_head_tracking', 'vertical_ios_head_tracking',
              'auto_inflections', 'llm_inflections', 'remote_modeling', 'focus_word_highlighting', 'profiles',
              'skin_tones', 'lessons', 'other_menu', 'shallow_clones']
  ENABLED_FRONTEND_FEATURES = ['subscriptions', 'assessments', 'custom_sidebar', 'snapshots',
              'video_recording', 'goals', 'modeling', 'geo_sidebar', 'edit_before_copying',
              'core_reports', 'lessonpix', 'translation', 'fast_render',
              'audio_recordings', 'app_connections', 'enable_all_buttons', 'badge_progress',
              'premium_symbols', 'board_levels', 'native_keyboard', 'app_store_purchases',
              'find_multiple_buttons', 'new_speak_menu', 'swipe_pages', 'inflections_overlay',
              'ios_head_tracking', 'emergency_boards', 'evaluations', 'swipe_pages',
              'vertical_ios_head_tracking', 'remote_modeling', 'auto_inflections', 'focus_word_highlighting',
              'skin_tones', 'lessons', 'profiles', 'other_menu']
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
    'llm_inflections' => 'Aug 6, 2025'
  }
  def self.frontend_flags_for(user)
    flags = {}
    AVAILABLE_FRONTEND_FEATURES.each do |feature|
      if ENABLED_FRONTEND_FEATURES.include?(feature)
        flags[feature] = true
      elsif user && user.settings && user.settings['feature_flags'] && user.settings['feature_flags'][feature]
        flags[feature] = true
      elsif user && user.settings && user.settings['feature_flags'] && user.settings['feature_flags']['canary'] && !DISABLED_CANARY_FEATURES.include?(feature)
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
end