module JsonApi::User
  extend JsonApi::Json
  
  TYPE_KEY = 'user'
  DEFAULT_PAGE = 25
  MAX_PAGE = 50

  def self.paginate_meta(params, json)
    meta = {}
    meta[:sort_by] = params['sort_by'] if params['sort_by'].present?
    meta[:sort_order] = params['sort_order'] if params['sort_order'].present?
    filter_val = params['filter'].presence || params['q'].presence
    meta[:filter] = filter_val if filter_val
    meta[:recent] = params['recent'] if params['recent'].present?
    meta
  end
    
  def self.build_json(user, args={})
    json = {}
    
    json['id'] = user.global_id
    json['user_name'] = user.user_name

    # Primary avatar must reflect settings['avatar_url'] when set; passing 'fallback'
    # to generated_avatar_url forces the default slot/gravatar path and would hide custom pics.
    json['avatar_url'] = user.generated_avatar_url
    json['fallback_avatar_url'] = user.generated_avatar_url('fallback')
    json['link'] = "#{JsonApi::Json.current_host}/#{user.user_name}"
    
    
    if args.key?(:permissions)
      json['permissions'] = user.permissions_for(args[:permissions])
      json['admin'] = true if ::Organization.admin_manager?(user)
    end
        
    if json['permissions'] && json['permissions']['model']
      json['needs_billing_update'] = !!user.settings['purchase_bounced']
      json['sync_stamp'] = (user.sync_stamp || user.updated_at).utc.iso8601
      json['unread_messages'] = user.settings['unread_messages'] || 0
      json['unread_alerts'] = user.settings['unread_alerts'] || 0
      json['user_token'] = user.user_token
      json['access_methods'] = user.access_methods
      if user.settings['external_device']
        json['external_device'] = user.settings['external_device']
      end
      journal_cutoff = 2.weeks.ago.to_i
      json['vocalizations'] = (user.settings['vocalizations'] || []).select{|v| v['category'] != 'journal' || (v['ts'] && v['ts'] > journal_cutoff) }
      if json['permissions']['delete']
        json['valet_login'] = true if user.valet_allowed?
        json['valet_password_set'] = true if user.settings['valet_password']
        json['valet_disabled'] = true if user.settings['valet_password'] && !user.valet_allowed?
        json['valet_long_term'] = true if user.settings['valet_long_term']
        json['valet_prevent_disable'] = true if user.settings['valet_prevent_disable']
        if user.settings['activation_settings']
          json['start_codes'] = Organization.start_codes(user)
        end
  
      else
        json['vocalizations'] = json['vocalizations'].select{|v| v['category'] != 'journal' }
      end
      if json['permissions']['supervise']
        json['state_2fa'] = user.state_2fa
        json['external_nonce'] = ExternalNonce.for_user(user)
      end
      json['contacts'] = user.settings['contacts'] || []
      json['global_integrations'] = UserIntegration.global_integrations
      json['preferences'] = {}
      ::User::PREFERENCE_PARAMS.each do |attr|
        json['preferences'][attr] = user.settings['preferences'][attr]
      end
      json['has_logging_code'] = !json['preferences']['logging_code'].blank?
      json['preferences'].delete('logging_code')
      json['target_words'] = user.settings['target_words'].slice('generated', 'list') if user.settings['target_words']
      json['preferences']['home_board'] = user.settings['preferences']['home_board']
      json['home_board_key'] = user.settings['preferences'] && user.settings['preferences']['home_board'] && user.settings['preferences']['home_board']['key']
      # Omit default so setup shows "Mix of Tones" until user picks a skin; image code uses skin || 'default'
json['preferences']['skin'] = user.settings['preferences']['skin']
      json['preferences']['progress'] = user.settings['preferences']['progress']
      json['preferences']['protected_usage'] = !user.external_email_allowed?
      if json['preferences']['cookies'] == nil
        json['preferences']['cookies'] = true
      end
      if FeatureFlags.user_created_after?(user, 'word_suggestion_images')
        json['preferences']['word_suggestion_images'] = true if user.settings['preferences']['word_suggestion_images'] == nil
      end
      if json['preferences']['speak_mode_edit'] == nil
        json['preferences']['speak_mode_edit'] = !!user.supporter_role?
      end
      if json['preferences']['symbol_background'] == nil
        json['preferences']['symbol_background'] = FeatureFlags.user_created_after?(user, 'symbol_background') ? 'clear' : 'white'
      end
      json['feature_flags'] = FeatureFlags.frontend_flags_for(user)
      json['prior_avatar_urls'] = user.prior_avatar_urls
      
      json['goal'] = user.settings['primary_goal']
      json['cell_phone'] = user.settings['cell_phone']
      
      json['preferences']['sidebar_boards'] = user.sidebar_boards
      
      user.settings['preferences']['devices'] ||= {}
      nearest_device = nil
      if user.settings['preferences']['devices'].keys.length > 0
        devices = ::Device.where(:user_id => user.id, :user_integration_id => nil).order('updated_at DESC').limit(10).sort_by{|d| (d.settings['token_history'] || [])[-1] || 0 }.reverse
        last_access = devices.map(&:last_used_at).compact.max
        json['last_access'] = last_access && last_access.iso8601
        if args[:device]
          nearest_device = devices.detect{|d| d != args[:device] && d.settings['name'] == args[:device].settings['name'] && user.settings['preferences']['devices'][d.unique_device_key] }
        end
        nearest_device ||= devices.detect{|d| d.settings['token_history'] && d.settings['token_history'].length > 3 && user.settings['preferences']['devices'][d.unique_device_key] }
        if !nearest_device && user.settings['preferences']['devices'].keys.length == 2
          nearest_device ||= devices.detect{|d| user.settings['preferences']['devices'][d.unique_device_key] }
        end
        json['devices'] = devices.select{|d| !d.hidden? }.map{|d| JsonApi::Device.as_json(d, :current_device => args[:device]) }
      end
      nearest_device_key = (nearest_device && nearest_device.unique_device_key) || 'default'
      
      json['premium_voices'] = user.refresh_premium_voices
      json['premium_voices'] = {}.merge(json['premium_voices']) if json['premium_voices']
      json['premium_voices']['always_allowed'] = true if json['premium_voices'] && ((json['premium_voices']['allowed'] || 0) > 0 || (json['premium_voices']['claimed'] || []).length > 0)
      json['premium_voices'] ||= {}.merge(user.default_premium_voices)
      json['premium_voices'].delete('expired_state')
      json['preferences']['device'] = {}.merge(user.settings['preferences']['devices'][nearest_device_key] || {})
      json['preferences']['device'].delete('ever_synced')
      if args[:device] && user.settings['preferences']['devices'][args[:device].unique_device_key]
        json['preferences']['device'] = json['preferences']['device'].merge(user.settings['preferences']['devices'][args[:device].unique_device_key])
        json['preferences']['device']['id'] = args[:device].global_id
        json['preferences']['device']['name'] = args[:device].settings['name'] || json['preferences']['device']['name']
        json['preferences']['device']['long_token'] = args[:device].settings['long_token']
      end
      if !args[:device] || FeatureFlags.user_created_after?(args[:device], 'browser_no_autosync')
        json['preferences']['device']['ever_synced'] ||= false
      else
        json['preferences']['device']['ever_synced'] = true if json['preferences']['device']['ever_synced'] == nil
      end
      if user.eval_account?
        json['preferences']['eval'] = user.settings['eval_reset']
      end

      json['preferences']['folder_icons'] ||= false
      json['preferences']['device']['voice'] ||= {}
      json['preferences']['device']['alternate_voice'] ||= {}
      if json['preferences']['device']['alternate_voice']['enabled']
        if json['preferences']['device']['alternate_voice']['for_scanning'] == nil
          json['preferences']['device']['alternate_voice']['for_scanning'] = true
        end
        ['for_scanning', 'for_fishing', 'for_buttons'].each do |key|
          json['preferences']['device']['alternate_voice'][key] ||= false
        end
      end

      json['prior_home_boards'] = (user.settings['all_home_boards'] || []).reverse
      if user.settings['preferences']['home_board']
        json['prior_home_boards'] = json['prior_home_boards'].select{|b| b['key'] != user.settings['preferences']['home_board']['key'] }
      end
      
      user_topics = []
      json['premium'] = user.any_premium_or_grace_period?
      json['terms_agree'] = !!user.settings['terms_agreed']
      json['subscription'] = user.subscription_hash
      json['organizations'] = user.organization_hash
      json['purchase_duration'] = (user.purchase_credit_duration / 1.year.to_f).round(1)
      json['pending_board_shares'] = UserLink.links_for(user).select{|l| l['user_id'] == user.global_id && l['state'] && l['state']['pending'] }.map{|link|
        {
          'user_name' => link['state']['sharer_user_name'] || (link['state']['board_key'] || '').split(/\//)[0],
          'board_key' => link['state']['board_key'],
          'board_id' => link['record_code'].split(/:/)[1],
          'include_downstream' => !!link['state']['include_downstream'],
          'allow_editing' => !!link['state']['allow_editing'],
          'pending' => !!link['state']['pending'],
          'user_id' => link['user_id']
        }
      }

      if !args[:paginated]
        extra = user.user_extra
        if extra
          json['lesson_ids'] = (extra.settings['lessons'] || []).map{|l| l['id'] }
          user_topics += extra.settings['topics'] || []
          board_tags_hash = (extra.settings['board_tags'] || {})
          tags = board_tags_hash.to_a.map(&:first).sort
          json['board_tags'] = tags if !tags.blank?
          if !board_tags_hash.blank?
            json['board_tag_map'] = board_tags_hash.transform_values { |v| v || [] }
          end
          json['focus_words'] = extra.active_focus_words
          if json['permissions']['supervise']
            soonest = nil
            (extra.settings['recent_profiles'] || {}).each do |profile_id, list|
              if list.length > 0 && (!soonest || list[-1]['added'] > soonest['added'])
                soonest = {'profile_id' => profile_id}.merge(list[-1] || {})
              end 
            end
            json['last_profile'] = soonest
          end
        end
        if json['organizations'].length > 0
          unit_ids = UserLink.links_for(user).select{|l| l['record_code'].match(/OrganizationUnit/) }.map{|l| l['record_code'].split(/:/, 2)[1] }
          OrganizationUnit.find_all_by_global_id(unit_ids).each do |unit|
            user_topics += unit.settings['topics'] || []
            json['lesson_ids'] ||= []
            json['lesson_ids'] << unit.settings['lesson']
          end
        end
  
      end
      
      supervisors = user.supervisors
      supervisees = user.supervisees
      if supervisors.length > 0
        json['supervisors'] = supervisors[0, 10].map{|u| JsonApi::User.as_json(u, limited_identity: true, supervisee: user) }
      end
      if supervisees.length > 0
        json['premium_voices']['claimed'] ||= []
        # Supervisors can download voices activated by supervisees
        supervisees.each do |sup|
          json['premium_voices']['claimed'] = json['premium_voices']['claimed'] | ((sup.settings['premium_voices'] || {})['claimed'] || [])
        end
        json['supervisees'] = supervisees[0, 10].map{|u| JsonApi::User.as_json(u, limited_identity: true, supervisor: user) }
        json['supervised_units'] = OrganizationUnit.supervised_units(user).map{|ou|
          {
            'id' => ou.global_id,
            'organization_id' => ou.related_global_id(ou.organization_id),
            'name' => ou.settings['name'],
            'lesson_ids' => (ou.settings['lessons'] || []).map{|l| l['id']},
          }
        }
        if json['supervised_units'].empty?
          # If a parent is supervising some communicators,
          # then they should be assigned org/unit-level lessons as well
          json['supervisee_lesson_ids'] = []
          user_ids = supervisees[0, 10].map(&:global_id)
          unit_links = UserLink.where(user_id: User.local_ids(user_ids)).select{|l| l.record_code.match(/OrganizationUnit/)}
          user_links = {}
          sup_links = {}
          ids = []
          unit_links.each do |link|
            id = link.record_code.split(/:/)[1]
            ids << id
            if link.data['type'] == 'org_unit_communicator'
              user_links[id] = true 
            elsif link.data['type'] == 'org_unit_supervisor'
              sup_links[id] = true
            end
          end
          OrganizationUnit.find_all_by_global_id(ids.uniq).each do |unit|
            if user_links[unit.global_id] && unit.settings['lesson'] && unit.settings['lesson']['types'].include?('user')
              json['supervisee_lesson_ids'] << unit.settings['lesson']['id']
            elsif sup_links[unit.global_id] && unit.settings['lesson'] && unit.settings['lesson']['types'].include?('supervisor')
              json['supervisee_lesson_ids'] << unit.settings['lesson']['id']
            end
          end
          supervisees.each do |sup|
            json['supervisee_lesson_ids'] += (sup.organization_hash.map{|h| h['lesson_ids'] || []})
          end
        end
      elsif user.supporter_role?
        json['supervisees'] = []
      end

      if json['subscription'] && json['subscription']['premium_supporter']
        json['subscription']['limited_supervisor'] = true
        # in case you get stuck on the comparator again, this is saying for anybody who signed up
        # less than 2 months ago
        json['subscription']['limited_supervisor'] = false if user.created_at > 2.months.ago 
        json['subscription']['limited_supervisor'] = false if json['subscription']['limited_supervisor'] && Organization.supervisor?(user)
        json['subscription']['limited_supervisor'] = false if json['subscription']['limited_supervisor'] && supervisees.any?{|u| u.any_premium_or_grace_period? }
      end
      
      if user.settings['user_notifications'] && user.settings['user_notifications'].length > 0
        cutoff = 6.weeks.ago.iso8601
        unread_cutoff = user.settings['user_notifications_cutoff'] || user.created_at.utc.iso8601
        json['notifications'] = user.settings['user_notifications'].select{|n| n['added_at'] > cutoff }
        json['notifications'].each{|n| n['unread'] = true if n['added_at'] > unread_cutoff }
      end
      json['read_notifications'] = false
    elsif json['permissions'] && json['permissions']['admin_support_actions']
      json['subscription'] = user.subscription_hash
      ::Device.where(:user_id => user.id).sort_by{|d| (d.settings['token_history'] || [])[-1] || 0 }.reverse
      json['devices'] = devices.select{|d| !d.hidden? }.map{|d| JsonApi::Device.as_json(d, :current_device => args[:device]) }
    elsif args[:include_subscription]
      json['subscription'] = user.subscription_hash
    end

    if json['permissions'] && json['permissions']['model'] && !args[:paginate]
      all_lesson_ids = []
      sources = {}
      json['organizations'].each{|o| 
        (o['lesson_ids'] || []).each do |id|
          all_lesson_ids << id
          sources[id] = 'org'
        end
      }
      all_lesson_ids += 
      (json['lesson_ids'] || []).each do |id|
        sources[id] = 'user'
        all_lesson_ids << id
      end
      (json['supervised_units'] || []).each{|o| 
        (o['lesson_ids'] || []).each do |id|
          sources[id] = 'unit'
          all_lesson_ids << id
        end
      }
      (json['supervisee_lesson_ids'] || []).each do |id|
        sources[id] = 'supervisee'
        all_lesson_ids << id
      end
      lessons = []
      if all_lesson_ids.length > 0
        lessons = ::Lesson.find_all_by_global_id(all_lesson_ids.uniq)
      end
      json['lessons'] = lessons.map{|l| JsonApi::Lesson.as_json(l) }
      if json['lessons'].length > 0
        json['lessons'].each{|l| l['source'] = sources[l['id']] || 'unknown' }
        json['lessons'] = ::Lesson.decorate_completion(user, json['lessons'])
      end
      json['topics'] = user_topics
    end
    
    
    if args[:limited_identity]
      json['name'] = user.settings['name']
      json['avatar_url'] = user.generated_avatar_url
      json['unread_messages'] = user.settings['unread_messages'] || 0
      json['unread_alerts'] = user.settings['unread_alerts'] || 0
      json['email'] = user.settings['email'] if args[:include_email]
      json['remote_modeling'] = !!user.settings['preferences']['remote_modeling']
      if user.settings['external_device']
        json['external_device'] = user.settings['external_device']
      end
      json['preferred_symbols'] = user.settings['preferences']['preferred_symbols']
      if args[:supervisor]
        json['edit_permission'] = args[:supervisor].edit_permission_for?(user)
        json['modeling_only'] = args[:supervisor].modeling_only_for?(user)
        json['premium'] = user.any_premium_or_grace_period?
        json['skin'] = user.settings['preferences']['skin']
        json['symbols'] = user.settings['preferences']['preferred_symbols']
        json['goal'] = user.settings['primary_goal']
        json['target_words'] = user.settings['target_words'].slice('generated', 'list') if user.settings['target_words']
        json['home_board_key'] = user.settings['preferences'] && user.settings['preferences']['home_board'] && user.settings['preferences']['home_board']['key']
      elsif args[:supervisee]
        json['edit_permission'] = user.edit_permission_for?(args[:supervisee])
        json['modeling_only'] = user.modeling_only_for?(args[:supervisee])
        org_unit = (user.org_units_for_supervising(args[:supervisee]) || [])[0]
        if org_unit
          # json['organization_unit_name'] = org_unit.settings['name']
          json['organization_unit_id'] = org_unit.global_id
        end
      elsif args[:include_goal]
        json['goal'] = user.settings['primary_goal']
      end
      sub_hash = user.subscription_hash
      json['extras_enabled'] = true if sub_hash['extras_enabled']
      if args[:subscription]
        json['subscription'] = sub_hash
        json['subscription']['lessonpix'] = true if UserIntegration.integration_keys_for(user).include?('lessonpix')
      end
      if args[:organization]
        links = UserLink.links_for(user)
        org_code = Webhook.get_record_code(args[:organization])

        manager = !!links.detect{|l| l['type'] == 'org_manager' && l['record_code'] == org_code }
        sup = links.detect{|l| l['type'] == 'org_supervisor' && l['record_code'] == org_code }
        org_user = links.detect{|l| l['type'] == 'org_user' && l['record_code'] == org_code } 
        mngd = !!org_user
    
        if args[:profile_type]
          args[:cutoff] ||= args[:organization].profile_frequency(args[:profile_type])          
          link = links.detect{|l| l['type'] == (args[:profile_type] == 'supervisor' ? 'org_supervisor' : 'org_user') && l['record_code'] == org_code}
          if link && link['state']['profile_history'] && link['state']['profile_history'][0]
            if link['state']['profile_history'][0]['added'] > (Time.now - args[:cutoff]).to_i
              json['recent_org_profile'] = true
            end
          end
        end
        if args[:organization_manager]
          json['goal'] = user.settings['primary_goal']
        end
        if manager
          json['org_manager'] = args[:organization].manager?(user)
          json['org_assistant'] = args[:organization].assistant?(user)
        end
        if sup
          json['org_supervision_pending'] = args[:organization].pending_supervisor?(user)
          json['org_premium_supervisor'] = true if sup['state']['premium']
          if !json['org_supervision_pending']
            supervisees = []
            if args[:paginated]
              if !args[:org_users]
                hash = {}
                args[:organization].users.select('id', 'user_name').each{|u| hash[u.global_id] = {'id' => u.global_id, 'user_name' => u.user_name } }
                args[:org_users] ||= hash
              end
              json['org_supervisees'] = []
              user.supervised_user_ids.each{|uid| json['org_supervisees'] << args[:org_users][uid] if args[:org_users][uid] }
              json['org_supervisees'].sort_by{|u| u['user_name'] }
            else
              supervisees = args[:organization].users.select('id', 'user_name').limit(10).find_all_by_global_id(user.supervised_user_ids)
              if supervisees.length > 0
                json['org_supervisees'] = supervisees[0, 10].map{|u| 
                  {'id' => u.global_id, 'user_name' => u.user_name }
              }.sort_by{|u| u['user_name'] }
              end
            end
          end
        end
        if mngd
          json['org_pending'] = args[:organization].pending_user?(user)
          json['org_sponsored'] = args[:organization].sponsored_user?(user)
          json['org_eval'] = args[:organization].eval_user?(user)
          json['org_status'] = org_user['state']['status']
          json['org_status'] ||= {'state' => (user.settings['preferences'] && user.settings['preferences']['home_board'] ? 'tree-deciduous' : 'unchecked')}
          json['joined'] = user.created_at.iso8601
        end
      end
    elsif user.settings['public'] || (json['permissions'] && json['permissions']['view_detailed'])
      json['avatar_url'] = user.generated_avatar_url
      json['joined'] = user.created_at.iso8601
      json['email'] = user.settings['email'] 
      json.merge! user.settings.slice('name', 'public', 'description', 'details_url', 'location')
      json['pending'] = true if user.settings['pending']

      json['membership_type'] = user.any_premium_or_grace_period? ? 'premium' : 'free'
      json['membership_type'] = 'lapsed' if json['membership_type'] == 'free' && user.fully_purchased?

      json['stats'] = {}
      json['stats']['starred_boards'] = user.settings['starred_boards'] || 0
      if json['permissions'] && json['permissions']['supervise']
        brds = {}
        json['stats']['starred_board_refs'] = user.starred_board_refs
      end
      board_ids = user.board_set_ids
      # json['stats']['board_set'] = board_ids.uniq.length
      json['stats']['user_boards'] = Board.where(:user_id => user.id).select('id').limit(1)[0] ? 1 : 0
      if json['permissions'] && json['permissions']['view_detailed']
        json['stats']['board_set_ids'] = board_ids.uniq
        if json['supervisees']
          json['stats']['board_set_ids_including_supervisees'] = user.board_set_ids(:include_supervisees => true)
        else 
          json['stats']['board_set_ids_including_supervisees'] = json['stats']['board_set_ids']
        end
      end
    end
    json
  end
end
