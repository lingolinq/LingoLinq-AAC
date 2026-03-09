module JsonApi::Unit
  extend JsonApi::Json
  
  TYPE_KEY = 'unit'
  DEFAULT_PAGE = 10
  MAX_PAGE = 25
    
  def self.build_json(unit, args={})
    json = {}
    
    json['id'] = unit.global_id
    json['name'] = unit.settings['name'] || "Unnamed Room"
    
    users_hash = args[:page_data] && args[:page_data][:users_hash]
    if !users_hash
      users = ::User.find_all_by_global_id(unit.all_user_ids)
      users_hash = {}
      users.each{|u| users_hash[u.global_id] = u }
    end
    
    json['supervisors'] = []
    json['communicators'] = []
    org = unit.organization
    premium_org = org && ((org.settings || {})['premium'] || org.admin)
    org_links = UserLink.links_for(org).select{|l| ['org_supervisor', 'org_user'].include?(l['type']) && users_hash[l['user_id']]}    
    UserLink.links_for(unit).each do |link|
      user = users_hash[link['user_id']]
      if user
        if link['type'] == 'org_unit_supervisor'
          hash = JsonApi::User.as_json(user, limited_identity: true)
          hash['org_unit_edit_permission'] = !!(link['state'] && link['state']['edit_permission'])
          org_link = org_links.detect{|l| l['type'] == 'org_supervisor' && l['user_id'] == user.global_id && l['state']['profile_id'] }
          if premium_org && org_link && org_link['state']['profile_history'] && org.matches_profile_id('supervisor', org_link['state']['profile_id'], org_link['state']['profile_template_id'])
            hash['profile_history'] = org_link['state']['profile_history']
          end
          json['supervisors'] << hash
        elsif link['type'] == 'org_unit_communicator'
          hash = JsonApi::User.as_json(user, limited_identity: true, include_goal: true)
          org_link = org_links.detect{|l| l['type'] == 'org_user' && l['user_id'] == user.global_id }
          if org_link && org_link['state']['status']
            hash['org_status'] = org_link['state']['status']
          end
          if user.settings['external_device']
            hash['device'] = {external_device: true}.merge(user.settings['external_device'].is_a?(Hash) ? user.settings['external_device'] : {})
          elsif user.settings['preferences'] && user.settings['preferences']['home_board']
            hash['device'] = {device_name: "LingoLinq", default_device: true, board_key: user.settings['preferences']['home_board']['key']}
          end
          hash['org_status'] ||= {'state' => (user.settings['preferences'] && user.settings['preferences']['home_board'] ? 'tree-deciduous' : 'unchecked')}
          if premium_org && org_link && org_link['state']['profile_id'] && org_link['state']['profile_history'] && org.matches_profile_id('communicator', org_link['state']['profile_id'], org_link['state']['profile_template_id'])
            hash['profile_history'] = org_link['state']['profile_history']
          end
          json['communicators'] << hash
        end
      end
    end
    if args[:permissions].is_a?(User) && FeatureFlags.feature_enabled_for?('profiles', args[:permissions]) && premium_org
      prof_id = (org.settings['communicator_profile'] || {'profile_id' => 'none'})['profile_id']
      prof_id = ProfileTemplate.default_profile_id('communicator') if prof_id == 'default'
      json['org_communicator_profile'] = !!(prof_id && prof_id != 'none')
      prof_id = (org.settings['supervisor_profile'] || {'profile_id' => 'none'})['profile_id']
      prof_id = ProfileTemplate.default_profile_id('supervisor') if prof_id == 'default'
      json['org_supervisor_profile'] = (org.settings['supervisor_profile'] || {'profile_id' => 'none'})['profile_id'] != 'none'
      json['org_profile'] = !!(json['org_supervisor_profile'] || json['org_communicator_profile'])
    end
    json['goal'] = nil
    if unit.user_goal
      json['goal'] = JsonApi::Goal.as_json(unit.user_goal, :lookups => false)
    end
    if unit.settings['lesson']
      lesson = ::Lesson.find_by_path(unit.settings['lesson']['id'])
      cutoff = nil
      if lesson
        json['lesson'] = JsonApi::Lesson.as_json(lesson)
        json['lesson']['types'] = unit.settings['lesson']['types']
        cutoff = lesson.settings['past_cutoff'] ? (Time.now.to_i - lesson.settings['past_cutoff']) : nil
      end
      if args[:permissions]
        comps = {}
        (lesson.settings['completions'] || []).select{|c| !cutoff || c['ts'] > cutoff }.each do |comp|
          comps[comp['user_id']] = {'rating' => comp['rating']}
        end
    
        json['lesson']['completed_users'] = {}
        ids = unit.all_user_ids
        ids.each{|user_id| json['lesson']['completed_users'][user_id] = comps[user_id] if comps[user_id] }
      end
    end
    json['topics'] = unit.settings['topics']
    json['prior_goals'] = (unit.settings['goal_assertions'] || {})['prior']

    if args.key?(:permissions)
      json['permissions'] = unit.permissions_for(args[:permissions])
    end
    
    json
  end
  
  def self.page_data(results, args)
    res = {}
    ids = results.map(&:all_user_ids).flatten.uniq
    users = User.find_all_by_global_id(ids)
    res[:users_hash] = {}
    users.each{|u| res[:users_hash][u.global_id] = u }
    res
  end
end
