require 'json'
# To generate a new english strings file:
# ruby i18n_generator.rb --generate  
# To merge any new strings from the english file into other locales:
# ruby i18n_generator.rb --merge
# To generate translations for a language, open a rails console:
# nopes = WordData.translate_locale_batch(locale, [])
# (for repeat calls, pass nopes as 2nd arg to prevent repeating failed attempts)

files = Dir.glob('app/frontend/app/**/*.js')
strings = {}
dups = 0
missing = 0
priority_presets = [
  {level: 10, regex: /app\/controllers\/organization/},
  {level: 10, regex: /app\/templates\/organization/},
  {level: 4, regex: /app\/controllers\/board/},
  {level: 4, regex: /app\/templates\/board/},
  {level: 8, regex: /app\/controllers\/goals/},
  {level: 8, regex: /app\/templates\/goals/},
  {level: 5, regex: /app\/controllers\/user/},
  {level: 5, regex: /app\/templates\/user/},
]
english_plurals = {
  'buffalo': 'buffaloes',
  'domino': 'dominoes',
  'echo': 'echoes',
  'embargo': 'embargoes',
  'hero': 'heroes',
  'mosquito': 'mosquitoes',
  'potato': 'potatoes',
  'tomato': 'tomatoes',
  'torpedo': 'torpedoes',
  'veto': 'vetoes',
  'alga': 'algae',
  'alumnus': 'alumni',
  'larva': 'larvae',
  'mouse': 'mice',
  'goose': 'geese',
  'day': 'days',
  'man': 'men',
  'woman': 'women',
  'person': 'people',
  'foot': 'feet',
  'tooth': 'teeth',
  'leaf': 'leaves',
  'sheep': 'sheep',
  'deer': 'deer',
  'moose': 'moose',
  'stomach': 'stomachs',
  'epoch': 'epochs'
}
files.each do |fn|
  next unless File.file?(fn)
  # puts fn
  File.readlines(fn).each do |line|
    # i18n.t('seconds_ago', "second", {hash: {count: seconds}});
    # i18n.t('n_boards', "board", {count: starters.length})
    position = 0
    while position != nil
      idx = line.index(/i18n\.t\(/, position)
      if !idx
        position = nil
        next
      end
      idx += 6
      while line[idx] && line[idx] != "'"
        idx += 1
      end
      key = ''
      idx += 1
      while line[idx] && line[idx] != "'"
        key += line[idx]
        idx += 1
      end
      # puts key if key.length > 0
      if key.length > 0
        while line[idx] && line[idx] != ","
          idx += 1
        end
        while line[idx] && line[idx] != "\""
          idx += 1
        end
        if line[idx]
          str = ""
          idx += 1
          while line[idx] && line[idx] != "\""
            str += line[idx]
            idx += 1
            if line[idx] == "\\"
              idx += 1
              str += line[idx]
              idx += 1
            end
          end
          while line[idx] && line[idx] != ")"
            idx += 1
          end
          if line[idx] && str.length > 0
            if strings[key] && strings[key]['string'] != str
              puts "DUPLICATE #{key} #{fn}"
              puts "  #{str}"
              puts "  #{strings[key]['string']}"
              dups += 1
            else
              preset = priority_presets.detect{|preset| fn.match(preset[:regex]) }
              level = [(strings[key] || {})['level'] || 10, (preset || {})[:level] || 7].min
              strings[key] = {'string' => str, 'level' => level}
            end
            # puts str
          else
            missing += 1
            puts "== MISSING == #{key}"
          end
        end
      end
      position = idx
    end
  end
end.length
files = Dir.glob('app/frontend/app/**/*.hbs')
files.each do |fn|
  next unless File.file?(fn)
  File.readlines(fn).each do |line|
    position = 0
    while position != nil
      idx = line.index(/\{\{t\s+/, position)
      if !idx
        position = nil
        next
      end
      idx = line.index(/\"|\'/, idx)
      end_bracket = nil
      count_idx = nil
      str = ""
      if idx
        idx += 1
        while line[idx] && line[idx] != "\""
          str += line[idx]
          idx += 1
          if line[idx] == "\\"
            idx += 1
            str += line[idx]
            idx += 1
          end
        end
        end_bracket = line.index(/\}\}/, idx)
        count_idx = line.index(/count=/, idx)
        idx = line.index(/key=(\'|\")/, idx)
      end
      if end_bracket
        count_key = false
        if count_idx && count_idx < end_bracket
          count_key = true
        end
        if idx && idx < end_bracket
          idx += 5
          key = ""
          while line[idx] && line[idx] != "\"" && line[idx] != "\'"
            key += line[idx]
            idx += 1
          end
          idx = line.index(/\}\}/, idx)
          if str.length > 0 && key.length > 0
            if strings[key] && strings[key]['string'] != str && strings[key]['original'] != str
              puts "DUPLICATE #{key} #{fn}"
              puts "  #{str}"
              puts "  #{strings[key]['string']}"
              dups += 1
            else
              if count_key
                check = str.downcase
                plural_form = str
                original = str
                if english_plurals[check]
                  plural_form = english_plurals[check]
                elsif check.length > 5 && check.match(/is$/)
                  plural_form = str.substring[0, str.length - 2] + "es"
                elsif check.match(/(s|ch|sh|x|z)$/)
                  plural_form = str + "es"
                elsif check.match(/[^aeiouy]y$/)
                  plural_form = str[0, str.length - 1] + "ies"
                elsif !check.match(/[aeiouy][aeiouy]f$/) && check.match(/[^f]fe?$/)
                  plural_form = str.sub(/fe?$/i, "ves")
                else
                  plural_form = str + "s"
                end
                str = "0 #{plural_form} || 1 #{str} || %{n} #{plural_form}"
              end
              preset = priority_presets.detect{|preset| fn.match(preset[:regex]) }
              level = [(strings[key] || {})['level'] || 10, (preset || {})[:level] || 7].min
              strings[key] = {'string' => str, 'original' => original, 'level' => level}
            end
          end
        end
      end
      position = idx
    end
    #   puts line
    #   puts line.match(/\{\{t\s+\"([^\}\"]+)\"[^\}]+key=\'([^\}\']+)\'.*}}/)
    #   puts line.match(/\{\{t\s+\"((?:(?!\}\}).)+)\"(?:(?!\}\}).)+key=\'((?:(?!\}\}).)+)\'(?:(?!\}\}).)*\}\}/)[1]
    #   line.scan(      /\{\{t\s+\"([^\}\"]+)\"[^\}]+key=\'([^\}\']+)\'.*}}/) do |match|
    #     puts "#{match[1]} #{match[0]}"
    #   end
    # end
  end
end
levels = []
levels << ["private_license","cc_by_license","cc_by_sa_license","public_domain_license","private","public","unlisted","robust_vocabularies","cause_and_effect","simple_starters","functional_communication","phrase_based","keyboards","pick_type","registration_type_communicator","registration_type_parent_communicator","registration_type_slp","registration_type_parent","registration_type_eval","registration_type_teacher","registration_type_other","unspecified_empty","level_1","level_2","level_3","level_4","level_5","level_6","level_7","level_8","level_9","level_10","unspecified","noun","verb","adjective","pronoun","adverb","question","conjunction","negation","preposition","interjection","article","determiner","number","social_phrase","other_word_type","custom_1","custom_2","custom_3","white","yellow","people","green","actions_lower","orange","nouns","blue","describing_words","purple","questions","red","negations","pink","social_words","brown","adverbs","gray","determiners","bluish","other_lower","black","contrast_lower","clear_utterance","jump_to_current_home","go_back_one_board","erase_last_button","beep","speak_full_utterance","stop_speaking","find_buttons","share_window","copy_sentence","past_sentence","alerts_window","repairs_window","speak_louder","speak_quieter","phrases_window","hold_that_thought","toggle_board_lock","suggestion","pluralize","singularize","add_comparative","add_superlative","ordinal","negate_the_word","add_possessive","past_tense","make_present_participle","beep_sound","current_calendar_date","current_time","current_day","yesterday_calendar_date",
  "yesterday_day","tomorrow_calendar_date","tomorrow_day","current_month","next_month","last_month","battery_level","set_volume","random_dice_number","pick_random_number","random_spinner_number","launch_native_keyboard","app_name_upper","go","dashboard","my_account","find_board","create_a_new_board","minimal_1","extra_small_2","small_5","medium_10","larg_20e","huge_45","none","small_1","medium_2","thick_5","huge_10","small_14","medium_18","large_22","huge_35","no_text","on_top","on_bottom","text_only","show_grid","show_dim","hide_complete","allow_external_buttons","confirm_custom_external_buttons","confirm_all_external_buttons","prevent_external_buttons","limit_logging_by_cutoff","dont_highlight","highlight_all","highlight_spoken","default_font","default_font_caps","default_font_small","arial","arial_caps","arial_small","comic_sans","comic_sans_caps","comic_sans_small","open_dyslexic","open_dyslexic_caps","open_dyslexic_small","architects_daughter","architects_daughter_caps","architects_daughter_small","default_audio","headset","speaker","headset_or_earpiece","earpiece","dont_stretch","prefer_tall","prefer_wide","clear","communicator_view","supporter_view","row_based","column_based","button_based","region_based","axis_based","moderate_3","quick_2","Speedy_1","slow_5","really_slow_8","moderate","slow","quick","Speedy","really_slow","dot","red_circle","arrow","medium_circle","large_circle","normal","more_sensitive","even_more_sensitive","less_sensitive","small_10","medium_30","large_50","spinning_pie","shrinking_dot","select","next","tiny_50","small_70","medium_100",
  "large_150","huge_200","preferences","messages","logout","home_colon","sync_if_planning_offline","org_management","reload","actions","communicators","boards","updates","people_i_supervise","model_for","speak_as","usage","reports","modeling","ideas","extras","home_board","account","new_note","quick_assessment","run_evaluation","remote_modeling","no_goal_set","set_a_goal","app_name","about","pricing","support","general_info","sales","tech_support","contact","developers","jobs","privacy","terms","blog","twitter","facebook","more_resources","web_site","speak_mode","modeling_ideas_two_lines","speak_as_which_user","switch_communicators","go_to_users_home_board","stay_on_this_board","cancel","me","logging_enabled","talk_lower","home","percent_battery","charging","speak_options","backspace_lower","clear_lower","exit_speak_mode","settings_etc","show_all_buttons","find_a_button","stay_on_board","pause_logging","copy_to_button_stash","view_word_data","sidebar","user_apostrophe","current_goal","share","repeats","repairs","alerts","phrases","hold_thought","say_colon","share_text","copy","button","link","share_via_facebook","share_via_twitter","quiet","back","loud","Button","flip_text","up","down","close","speak","wait","modify_and_repair_message","no_words_to_repair","insert_text","update","messages_and_alerts","no_messages_or_alerts_to_show","clear_all","loading_messages","saved_phrases","no_phrases","add_phrase","journal","done","with_boards","in_board_set","speak_as_me","model_for_ellipsis","speak_as_ellipsis","original","edit_board","star_this_board","star","more",
  "board_details","make_copy","set_as_home_board","add_to_sidebar","download_board","print_board","loading","not_signed_in","login","register","critical_access","two_month_trial","gift_purchase","did_you_know","lifetime_purpose","communication_is_for_everyone","empowers_hearing","what_is_app","every_voice_should_be_heard","app_lets_you","app_lets_you_2","learn_more","more_download_options","personalize","personalize_text","work_offline","offline_text","empower_the_team","insights_text","pricing_per_communicator","cloud_extras_credit","whats_it_cost","see_how","right_now","for_families","for_schools","try_app","sign_up_for_free","allow_cookies","sign_up","already_registered","see_exmaples","popular_boards","by","critical_access_lower","private_data_reminder","forgot_password_lower","sign_up_lower","login_required","join_app","ready_to_try_app","name","username","email","password","type","logging_in","success","browse_boards","suggested","mine","community","recent","current_home_board","see_all_my_boards","notifications","board_contents_changed","history","dash","used_by","you","comma_space","recent_sessions_for_supervisees","button_count","app_support","support_intro","support_resources","how_to_link","how_to_videos","problem_or_feedback","subject","message","send_message","javascript","javscript_info","local_storage","local_storage_info","speech_synthesis","speech_synthesis_info","speech_synthesis_voices","speech_synthesis_info2","file_uploads","file_uploads_info","file_storage","file_storage_info","indexed_db",
  "indexed_db_info","sqlite","sqlite_info","media_recording","media_recording_info","xhr_cors","xhr_cors_info","canvas","canvas_info","audio_playback","audio_playback_info","drag_and_drop","drag_and_drop_info","file_reader","file_reader_info","geolocation","geolocation_info","speech_to_text","speech_to_text_info","online","online_info","wakelock","wakelock_info","fullscreen","fullscreen_info","troubleshooting","enable_cookies","disable_cookies","summary","summary_lower","reports_lower","goals_lower","recordings_lower","email_shares","text_shares","app_shares","no_notifications","weekly_notifications","bi_weekly_reports","monthly_reports","email_goal_completion","dont_email_goal_completion","profile","preferences_lower","billing_lower","logs_messages","joined","used","today","home_board_colon","goals","supervision","getting_started_wizard","available_boards_colon","root","starred","more_ellipsis","shared_with_me","prior_home","delete_lower","support_actions","reset_password","change_user_name","edit_history","subscription_colon","paid_for_n_years","premium_voices_count","comma_premium_voices_used","plus_extras_enabled","plus_p","supervisor_credits_available","modify_subscription","set_as_eval","set_as_free_forever","set_as_free_modeler","set_as_free_supporter","set_as_free_trial_communicator","add_one_month","enable_premium_symbols","add_supporter_credit","restore_disabled_purchase","add_premium_voice","add_five_years","force_logout","recent usage","devices_colon","V","user_agent","ip","date","expires_after","comma_or","of_inactivity",
  "general_preferences","basics","role","long_token","enable_long_token","auto_inflections","enable_auto_inflections","editing","require_speak_mode_pin","preferred_language","english_default","styling","selection_settings","logging_and_sync","startup_and_extras","core_phrases_and_modeling","sidebar_and_shortcuts","device_preferences","device_layout","scanning_settings","dwell_eye_tracking","voice_settings","save_preferences","board_background","symbol_background","hidden_buttons","prevent_hide_buttons","status","blank_status","keyboard_suggestions","word_suggestion_images","high_contrast","high_contrast_images","dim_header","dim_header_long","stretch_buttons","on_select","vocalize_buttons","vocalize_linked_buttons","silence_spelling_buttons","click_buttons","vibrate_buttons","auto_home_return","highlighted_buttons","highlighted_popup_text","popup_for_sight_reading","activation_on_start","select_immediately","swipe_pages","swipe_pages_enabled","long_press","inflections_overlay","activation_location","pointer_release","pointer_start","tap_and_swipe_inflections","activation_cutoff","milliseconds","activation_minimum","ignore_repeat_hits","logging","log_all_actions","restrict_log_access","logging_pin","confirm_logging_code","check_logging_code","logging_opt_in","allow_log_reports","include_geo_in_logs","logging_uses_google","analytics","allow_cookies_checkbox","auto_sync","auto_sync_if_changes_and_online","syncing","skip_supervisee_sync","full_screen","full_screen_speak_mode","on_vocalize","clear_on_vocalize","repair_on_vocalize","battery_alerts",
  "play_battery_sounds","speak_on_speak_mode","board_jump_delay","external_links","sharing","allow_sharing","external_keyboard","allow_external_keyboard","folder_icons","show_folder_icons","new_dashboard","new_index","enable_remote_modeling","core_word_list","saved_phrase_types","phrase_categories_explainer","manage_phrases","multi_touch_modeling","quick_actions","always_show_quick_sidebar","never_show_quick_sidebar","links_and_buttons","edit_sidebar_links_and_buttons","add_to_sidebar_hint","nfc_tags","no_tags_saved","clear_tags","vocalization_height","button_spacing","button_border","button_text","button_text_position","vocalization_box_text","utterance_text_only","flipped_vocalization_box_text","flipped_override","flipped_height","flipped_text","button_style","this_is_a_text_sample","back_button","always_show_back","scanning","enable_scanning","eyegaze","scanning_mode","scanning_header","scanning_skip_header","auto_start","scanning_wait_for_input","scanning_interval","zero_to_prevent_scanning","scanning_prompt","speak_audio_prompts","scanning_voice","use_scanning_voice","secondary_options_below","psuedo-switch","scanning_select_on_any_event","scanning_select_keycode","scanning_next_keycode","scanning_prev_keycode","scanning_cancel_keycode","scanning_auto_select","auto_select_after_delay","scan_modeling","touch_as_modeling","dwell_type","eye_gaze","mouse_dwell","joystick_key_dwell","test_dwell","dwell_cursor","show_dwell_cursor","dwell_icon","dwell_selection","time_on_target","button_select","dwell_cutoff","dwell_no_cutoff","dwell_duration",
  "milliseconds_to_select","dwell_delay","milliseconds_delay","dwell_release","move_after_select","dwell_targeting","dwell_gravity","enable_dwell_gravity","dwell_modeling","system_default_voice","select_a_voice","voiceURI","premium_voices","voice_rate","voice_pitch","voice_volume","test_voice","secondary_voice","use_different_prompting_voice","alternate_voice_purpose","use_for_scanning","use_for_fishing","use_for_integrations","use_for_buttons","use_for_messages","alternate_voice_rate","secondary_voice_pitch","alternate_voice_volume"]
levels << ["private_license","cc_by_license","cc_by_sa_license","public_domain_license","private","public","unlisted","robust_vocabularies","cause_and_effect","simple_starters","functional_communication","phrase_based","keyboards","pick_type","registration_type_communicator","registration_type_parent_communicator","registration_type_slp","registration_type_parent","registration_type_eval","registration_type_teacher","registration_type_other","unspecified_empty","level_1","level_2","level_3","level_4","level_5","level_6","level_7","level_8","level_9","level_10","unspecified","noun","verb","adjective","pronoun","adverb","question","conjunction","negation","preposition","interjection","article","determiner","number","social_phrase","other_word_type","custom_1","custom_2","custom_3","white","yellow","people","green","actions_lower","orange","nouns","blue","describing_words","purple","questions","red","negations","pink","social_words","brown","adverbs","gray","determiners","bluish","other_lower","black","contrast_lower","clear_utterance","jump_to_current_home","go_back_one_board","erase_last_button","beep","speak_full_utterance","stop_speaking","find_buttons","share_window","copy_sentence","past_sentence","alerts_window","repairs_window","speak_louder","speak_quieter","phrases_window","hold_that_thought","toggle_board_lock","suggestion","pluralize","singularize","add_comparative","add_superlative","ordinal","negate_the_word","add_possessive","past_tense","make_present_participle","beep_sound","current_calendar_date","current_time","current_day","yesterday_calendar_date",
  "yesterday_day","tomorrow_calendar_date","tomorrow_day","current_month","next_month","last_month","battery_level","set_volume","random_dice_number","pick_random_number","random_spinner_number","launch_native_keyboard","app_name_upper","go","dashboard","my_account","find_board","create_a_new_board","minimal_1","extra_small_2","small_5","medium_10","larg_20e","huge_45","none","small_1","medium_2","thick_5","huge_10","small_14","medium_18","large_22","huge_35","no_text","on_top","on_bottom","text_only","show_grid","show_dim","hide_complete","allow_external_buttons","confirm_custom_external_buttons","confirm_all_external_buttons","prevent_external_buttons","limit_logging_by_cutoff","dont_highlight","highlight_all","highlight_spoken","default_font","default_font_caps","default_font_small","arial","arial_caps","arial_small","comic_sans","comic_sans_caps","comic_sans_small","open_dyslexic","open_dyslexic_caps","open_dyslexic_small","architects_daughter","architects_daughter_caps","architects_daughter_small","default_audio","headset","speaker","headset_or_earpiece","earpiece","dont_stretch","prefer_tall","prefer_wide","clear","communicator_view","supporter_view","row_based","column_based","button_based","region_based","axis_based","moderate_3","quick_2","Speedy_1","slow_5","really_slow_8","moderate","slow","quick","Speedy","really_slow","dot","red_circle","arrow","medium_circle","large_circle","normal","more_sensitive","even_more_sensitive","less_sensitive","small_10","medium_30","large_50","spinning_pie","shrinking_dot","select","next","tiny_50","small_70","medium_100",
  "large_150","huge_200","preferences","messages","logout","home_colon","sync_if_planning_offline","org_management","reload","actions","communicators","boards","updates","people_i_supervise","model_for","speak_as","usage","reports","modeling","ideas","extras","home_board","account","new_note","quick_assessment","run_evaluation","remote_modeling","no_goal_set","set_a_goal","app","about","pricing","support","general_info","sales","tech_support","contact","developers","jobs","privacy","terms","blog","twitter","facebook","more_resources","web_site","speak_mode","modeling_ideas_two_lines","speak_as_which_user","switch_communicators","go_to_users_home_board","stay_on_this_board","cancel","me","logging_enabled","talk_lower","home","percent_battery","charging","speak_options","backspace_lower","clear_lower","exit_speak_mode","settings_etc","show_all_buttons","find_a_button","stay_on_board","pause_logging","copy_to_button_stash","view_word_data","sidebar","user_apostrophe","current_goal","share","repeats","repairs","alerts","phrases","hold_thought","say_colon","share_text","copy","button","link","share_via_facebook","share_via_twitter","quiet","back","loud","Button","flip_text","up","down","close","speak","wait","modify_and_repair_message","no_words_to_repair","insert_text","update","messages_and_alerts","no_messages_or_alerts_to_show","clear_all","loading_messages","saved_phrases","no_phrases","add_phrase","journal","done","with_boards","in_board_set","speak_as_me","model_for_ellipsis","speak_as_ellipsis","original","edit_board","star_this_board","star","more",
  "board_details","make_copy","set_as_home_board","add_to_sidebar","download_board","print_board","loading","not_signed_in","login","register","critical_access","two_month_trial","gift_purchase","did_you_know","lifetime_purpose","communication_is_for_everyone","empowers_hearing","what_is_app","every_voice_should_be_heard","app_lets_you","app_lets_you_2","learn_more","more_download_options","personalize","personalize_text","work_offline","offline_text","empower_the_team","insights_text","pricing_per_communicator","cloud_extras_credit","whats_it_cost","see_how","right_now","for_families","for_schools","try_app","sign_up_for_free","allow_cookies","sign_up","already_registered","see_exmaples","popular_boards","by","critical_access_lower","private_data_reminder","forgot_password_lower","sign_up_lower","login_required","join_app","ready_to_try_app","name","username","email","password","type","logging_in","success"]
levels.each do |list|
  list.each do |str|
    if !strings[str]
      missing += 1
      puts "== MISSING == #{str}" 
    end
  end
end
puts "TOTAL DUPS #{dups}"
puts "TOTAL MISSING #{missing}"
puts "TOTAL STRINGS #{strings.keys.length}"
# To approve manually-reviewed translations above a specific line number
# (i.e. to mark them at not computed-generated translations)
# ruby i18n_generator.rb --confirm [locale] [approve-up-to-line]
if ARGV.index('--confirm')
  idx = ARGV.index('--confirm')
  locale = ARGV[idx + 1]
  line_number = ARGV[idx + 2].to_i
  str = File.read("public/locales/#{locale}.json")
  lines = []
  str.split(/\n/).each_with_index do |line, idx|
    if line_number == 0 || (idx + 1) <= line_number
      lines << line.sub(/\s+\[\[.+\",/, "\",")
    else
      lines << line
    end
  end
  f = File.open("public/locales/#{locale}.json", 'w')
  f.write lines.join("\n")
  f.close
# To generate a new english strings file:
# ruby i18n_generator.rb --generate  
# To merge any new strings from the english file into other locales:
# ruby i18n_generator.rb --merge
elsif ARGV.index('--generate') || ARGV.index('--merge')
  if dups > 0 || missing > 0
    puts "FOUND ISSUES, SO NO GENERATION"
  else
    strings = strings.to_a
    strings.each_with_index{|a, idx| 
      a[1]['idx'] = idx 
      levels.each_with_index do |list, idx|
        if list.index(a[0])
          a[1]['level'] = (levels.length - idx) 
        end
      end
    }
    strings = strings.sort_by{|a| [a[1]['level'], a[1]['idx']]}
    res = {}
    last_level = nil
    res["=== LOCALE: en ======="] = ""
    strings.each{|a| 
      if last_level != a[1]['level']
        res["==== lvl#{a[1]['level']} ============"] = "Below are all words for priority level #{a[1]['level']} (this string does not need to be translated)"
      end
      res[a[0]] = a[1]['string'] 
    }
    puts "GENERATING en.json"
    f = File.open('public/locales/en.json', 'w')
    f.write JSON.pretty_generate(res)
    f.close
    if ARGV.index('--merge')
      puts "LOOKING FOR MERGES"
      Dir.glob('public/locales/*.json').each do |fn|
        if !fn.match(/en\.json$/)
          puts "  processing #{fn}"
          json = JSON.parse(File.read(fn))
          new_json = {}
          current_level = 0
          json.to_a.each do |arr|
            key, string = arr
            prior_level = current_level
            loc = fn.match(/locales\/(\w+)\.json/)[1]
            skip_string = false
            if key.match(/==\sLOCALE:\s(\w+)\s==/)
              skip_string = true
              loc = key.match(/==\sLOCALE:\s(\w+)\s==/)[1]
            elsif key.match(/==\slvl(\d+)\s==/)
              current_level = key.match(/==\slvl(\d+)\s==/)[1].to_i
            end
            if new_json.keys.length == 0
              new_json["=== LOCALE: #{loc} ======="] = ""
            end
            if prior_level != current_level
              # iterate through strings and look for any of the current level or
              # higher that have not been added yet
              strings.each do |arr|
                if !new_json[arr[0]] && arr[1]['level'] <= prior_level
                  new_json[arr[0]] = json[arr[0]] || "*** #{arr[1]['string']}"
                end
              end
            end
            new_json[key] ||= string unless skip_string
          end
          strings.each do |arr|
            if arr[1]['level'] > current_level
              current_level = arr[1]['level']
              new_json["==== lvl#{current_level} ============"] = "Below are all words for priority level #{current_level} (this string does not need to be translated)"
            end
            if !new_json[arr[0]]
              new_json[arr[0]] = json[arr[0]] || "*** #{arr[1]['string']}"
            end
          end
          f = File.open(fn, 'w')
          f.write JSON.pretty_generate(new_json)
          f.close
        end
      end
    end
  end
end