module JsonApi::Lesson
  extend JsonApi::Json
  
  TYPE_KEY = 'lesson'
  DEFAULT_PAGE = 10
  MAX_PAGE = 25
    
  def self.build_json(lesson, args={})
    json = {}
    
    json['id'] = lesson.global_id
    json['title'] = lesson.settings['title']
    stored_url = lesson.settings['url']
    json['original_url'] = stored_url
    json['url'] = ::Lesson.normalize_lesson_embed_url(stored_url)
    json['required'] = !!lesson.settings['required']
    json['lesson_code'] = lesson.nonce
    json['due_at'] = lesson.settings['due_at']
    json['due_ts'] = json['due_at'] ? Time.parse(json['due_at']).to_i : nil
    json['description'] = lesson.settings['description']
    json['time_estimate'] = lesson.settings['time_estimate']
    json['past_cutoff'] = lesson.settings['past_cutoff']
    json['badge'] = lesson.settings['badge']
    json['noframe'] = !!(lesson.settings['checked_url'] || {})['noframe']
    cutoff = lesson.settings['past_cutoff'] ? (Time.now.to_i - lesson.settings['past_cutoff']) : nil
    json['completed_users'] = {}

    youtube_regex = (/(?:https?:\/\/)?(?:www\.)?youtu(?:be\.com\/watch\?(?:.*?&(?:amp;)?)?v=|\.be\/)([\w \-]+)(?:&(?:amp;)?[\w\?=]*)?/);
    youtube_match = json['url'] && json['url'].match(youtube_regex);
    youtube_id = youtube_match && youtube_match[1];
    if youtube_id
      json['url'] = "#{JsonApi::Json.current_host}/videos/youtube/#{youtube_id}?controls=true"
      json['video'] = true
    end

    comps = {}
    (lesson.settings['completions'] || []).select{|c| !cutoff || c['ts'] > cutoff }.each do |comp|
      comps[comp['user_id']] = {'rating' => comp['rating']}
    end
    # Filter by args[:obj] to only show completion for related users
    if args[:permissions] && args[:permissions].id == lesson.user_id
      json['completed_users'] = comps
      # check each usage?
    elsif args[:obj]
      if args[:obj].is_a?(User)
        json['editable'] = true if lesson.user_id == args[:obj].id
        json['completed_users'][args[:obj].global_id] = comps[args[:obj].global_id] if comps[args[:obj].global_id]
      elsif args[:obj].is_a?(Organization)
        org = args[:obj]
        owned_by_org = lesson.organization_id == org.id
        assigned_to_org = (lesson.settings['usages'] || []).any? { |u| u['obj'] == Webhook.get_record_code(org) }
        json['editable'] = true if owned_by_org || assigned_to_org
        ids = org.attached_users('all').map(&:global_id)
        ids.each{|user_id| json['completed_users'][user_id] = comps[user_id] if comps[user_id] }
      elsif args[:obj].is_a?(OrganizationUnit)
        unit = args[:obj]
        owned_by_unit = lesson.organization_unit_id == unit.id
        assigned_to_unit = (lesson.settings['usages'] || []).any? { |u| u['obj'] == Webhook.get_record_code(unit) }
        json['editable'] = true if owned_by_unit || assigned_to_unit
        ids = unit.all_user_ids
        ids.each{|user_id| json['completed_users'][user_id] = comps[user_id] if comps[user_id] }
      end
    end

    if args[:obj]
      json['counts'] = lesson.user_counts(args[:obj])
      usage = (lesson.settings['usages'] || []).detect{|u| u['obj'] == Webhook.get_record_code(args[:obj])}
      if usage && args[:obj].is_a?(Organization)
        json['target_types'] = ((args[:obj].settings['lessons'] || []).detect{|l| l['id'] == lesson.global_id } || {})['types'] || ['supervisor']
      elsif usage && args[:obj].is_a?(OrganizationUnit)
        json['target_types'] = (args[:obj].settings['lesson'] || {})['types'] || ['supervisor']
      end
    end
    if args[:extra_user]
      json['id'] = "#{lesson.global_id}:#{lesson.nonce}:#{args[:extra_user].user_token}"
      json['user'] = JsonApi::User.as_json(args[:extra_user], limited_identity: true)
      comp = (lesson.settings['completions'] || []).detect{|c| c['user_id'] == args[:extra_user].global_id }
      json['user']['completion'] = comp if comp
    end

    json
  end
end

