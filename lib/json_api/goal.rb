module JsonApi::Goal
  extend JsonApi::Json
  
  TYPE_KEY = 'goal'
  DEFAULT_PAGE = 30
  MAX_PAGE = 50
    
  def self.build_json(goal, args={})
    json = {}
    json['id'] = goal.global_id
    json['has_video'] = goal.settings['video_id']
    
    if !args[:permissions] && args[:lookups] != false && goal.template_header && goal.settings['goal_advances_at'] && goal.settings['linked_template_ids']
      current_goal = goal.current_template
      if current_goal && current_goal != goal
        json['currently_running_template'] = JsonApi::Goal.build_json(current_goal)
      end
    end
    
    if goal.template 
      ['active', 'template', 'template_header'].each do |key|
        json[key] = goal.send(key)
      end
      ['next_template_id', 'template_header_id'].each do |key|
        json[key] = goal.settings[key]
      end
      json['date_based'] = !!goal.settings['goal_advances_at']
      if goal.settings['template_stats']
        json['template_stats'] = goal.settings['template_stats']
      end
      if goal.template_header
        json['sequence'] = !!(goal.settings['template_stats'] && goal.settings['template_stats']['goals'] && goal.settings['template_stats']['goals'] > 1)
        ['sequence_description', 'sequence_summary'].each do |key|
          json[key] = goal.settings[key]
        end
      end
    else
      ['active', 'primary'].each do |key|
        json[key] = goal.send(key)
      end
    end
    json['global'] = true if goal.global

    ['summary', 'description', 'badge_image_url'].each do |key|
      json[key] = goal.settings[key]
    end
    json['started'] = goal.settings['started_at']
    json['ended'] = goal.settings['ended_at']
    json['uneditable'] = goal.settings['uneditable']
    if args[:lookups] != false && goal.settings['organization_unit_id']
      unit = OrganizationUnit.find_by_global_id(goal.settings['organization_unit_id'])
      if unit
        json['unit_id'] = unit.global_id
        json['unit_name'] = unit.settings['name']
        json['unit_org_id'] = unit.related_global_id(unit.organization_id)
      end
    end
    json['duration'] = goal.settings['goal_duration'] if goal.settings['goal_duration']
    json['advance'] = goal.goal_advance && goal.goal_advance.iso8601
    if !goal.template && goal.settings['template_id'] && goal.settings['next_template_id']
      json['advance'] = goal.advance_at && goal.advance_at.iso8601
    end
    if (goal.settings['organization_unit_id'] || !goal.settings['template_id']) && goal.advance_at
      json['expires'] = goal.advance_at.iso8601
    end
    
    if goal.settings['stats']
      json['stats'] = {}
      # A viewer's time zone regroups the day, week and month buckets at their own midnight (#1196).
      stats = (args[:time_zone] && goal.stats_in_zone(args[:time_zone])) || goal.settings['stats']
      stats.each do |key, val|
        if val.respond_to?(:round)
          json['stats'][key] = val.round(2)
        else
          json['stats'][key] = val
        end
      end
    end
    

    if args[:permissions]
      json['permissions'] = goal.permissions_for(args[:permissions])
      json['badge_name'] = goal.settings['badge_name'] if goal.settings['badge_name']
      json['badges'] = goal.settings['badges'] if goal.settings['badges']
      json['assessment_badge'] = goal.settings['assessment_badge'] if goal.settings['assessment_badge']
      if goal.template
        if goal.settings['template_header_id']
          header = goal if goal.settings['template_header_id'] == goal.global_id
          header ||= UserGoal.find_by_path(goal.settings['template_header_id'])
          linked_goals = UserGoal.find_all_by_global_id(header.settings['linked_template_ids']) if header && header.settings['linked_template_ids']
          next_template = linked_goals.detect{|g| goal.settings['next_template_id'] == g.global_id } if linked_goals
          previous_template = linked_goals.detect{|g| g.settings['next_template_id'] == goal.global_id } if linked_goals
          json['related'] ||= {}
          json['related']['next'] = JsonApi::Goal.build_json(next_template, :lookups => false) if next_template
          json['related']['previous'] = JsonApi::Goal.build_json(previous_template, :lookups => false) if previous_template
          json['related']['header'] = JsonApi::Goal.build_json(header, :lookups => false) if header
        end
        if goal.settings['goal_advances_at']
          json['goal_advances_at'] = goal.settings['goal_advances_at']
        elsif goal.settings['goal_duration']
          if goal.settings['goal_duration'] >= 1.month
            json['goal_duration_number'] = (goal.settings['goal_duration'].to_f / 1.month).round(2)
            json['goal_duration_unit'] = 'month'
          elsif goal.settings['goal_duration'] >= 1.week
            json['goal_duration_number'] = (goal.settings['goal_duration'].to_f / 1.week).round(2)
            json['goal_duration_unit'] = 'week'
          else
            json['goal_duration_number'] = (goal.settings['goal_duration'].to_f / 1.day).round(2)
            json['goal_duration_unit'] = 'day'
          end
        end
      end
      if json['permissions']['view']
        video_ids = []
        video_ids << goal.settings['video_id'] if goal.settings['video_id']
        
        user_ids = []
        user_ids << goal.related_global_id(:user_id) if goal.user_id
        user_ids << goal.settings['author_id']
        (goal.settings['comments'] || []).each do |comment| 
          user_ids << comment['user_id'] if comment['user_id']
          video_ids << comment['video_id'] if comment['video_id']
        end
        users_hash = {}
        User.find_all_by_global_id(user_ids).each{|user| users_hash[user.global_id] = user }
        videos_hash = {}
        UserVideo.find_all_by_global_id(video_ids).each{|video| videos_hash[video.global_id] = video }

        video = videos_hash[goal.settings['video_id']]
        json['video'] = video.summary_hash if video        

        user = users_hash[goal.related_global_id(:user_id)]
        json['user'] = JsonApi::User.as_json(user, limited_identity: true) if user
        author = users_hash[goal.settings['author_id']]
        json['author'] = JsonApi::User.as_json(author, limited_identity: true) if author
        json['comments'] = []
        (goal.settings['comments'] || []).each do |comment|
          commenter = users_hash[comment['user_id']]
          res = {
            'id' => comment['id'],
            'created' => comment['created'],
            'text' => comment['text']
          }
          video = comment['video_id'] && videos_hash[comment['video_id']]
          res['video'] = video.summary_hash if video
          res['user'] = JsonApi::User.as_json(commenter, limited_identity: true) if commenter
          
          json['comments'] << res
        end
      end
    elsif goal.template
      author = goal.user
      json['author'] = JsonApi::User.as_json(author, limited_identity: true) if author
    end
    json
  end
end
