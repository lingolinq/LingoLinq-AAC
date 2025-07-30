module JsonApi::Badge
  extend JsonApi::Json
  
  TYPE_KEY = 'badge'
  DEFAULT_PAGE = 10
  MAX_PAGE = 25
    
  def self.build_json(badge, args={})
    json = {}
    json['id'] = badge.global_id
    json['user_id'] = badge.related_global_id(badge.user_id)
    json['name'] = badge.data['name'] || 'unnamed badge'
    json['highlighted'] = !!badge.highlighted
    json['image_url'] = badge.data['image_url'] || "https://lingolinq-usercontent.s3.amazonaws.com/images/6/8/8/5/1_6885_5781b0671b2b65ad0b53f2fe-980af0f90c67ef293e98f871270e4bc0096493b2863245a3cff541792acf01050e534135fb96262c22d691132e2721b37b047a02ccaf6931549278719ec8fa08.png"
    json['sound_url'] = badge.data['sound_url']
    json['level'] = badge.level
    json['max_level'] = badge.data['max_level']
    json['goal_id'] = badge.related_global_id(badge.user_goal_id)
    json['global'] = !!badge.data['global_goal']
    if json['global']
      json['global_goal_priority'] = badge.data['global_goal_priority']
    end
    if !badge.earned
      json['progress'] = badge.current_progress
    else
      json['progress'] = 1.0
      json['earned'] = badge.data['earn_recorded'] || badge.updated_at.utc.iso8601
      json['started'] = badge.data['started']
      json['ended'] = badge.data['ended']
    end
    
    if args[:permissions]
      json['permissions'] = badge.permissions_for(args[:permissions])
      json['completion_settings'] = badge.data['badge_level']
      json['user_name'] = badge.user.user_name
      json['avatar_url'] = badge.user.generated_avatar_url
    end
    json
  end
end
