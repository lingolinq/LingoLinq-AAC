module JsonApi::UserVersion
  extend JsonApi::Json
  
  TYPE_KEY = 'userversion'
  DEFAULT_PAGE = 25
  MAX_PAGE = 50
  
  def self.build_json(version, args={})
    json = {}
    json['id'] = version.id
    json['action'] = version.event
    json['action'] = 'deleted' if json['action'] == 'destroy'
    json['action'] = 'created' if json['action'] == 'create'
    json['action'] = 'updated' if json['action'] == 'update'
    json['created'] = version.created_at.iso8601

    if version.whodunnit
      if version.whodunnit.match(/^user:/)
        user_id = version.whodunnit.split(/:/)[1]
        args[:user_lookups] ||= {}
        user_json = args[:user_lookups][user_id]
        if !user_json
          user = User.find_by_path(user_id)
          if user
            args[:user_lookups][user_id] = JsonApi::User.as_json(user, :limited_identity => true)
            user_json = args[:user_lookups][user_id]
          end
        end
        if user_json
          json['modifier'] = {
            'description' => user_json['user_name'],
            'user_name' => user_json['user_name'],
            'image' => user_json['avatar_url']
          }
        end
      elsif version.whodunnit.match(/^admin:/)
        json['modifier'] = {
          'description' => 'LingoLinq Admin',
          'image' => "https://www.lingolinq.com/images/logo-big.png"
        }
      end
    end
    json['modifier'] ||= {
      'description' => 'Unknown User',
      'image' => "https://#{ENV['STATIC_S3_BUCKET'] || "coughdrop"}.s3.amazonaws.com/avatars/avatar-0.png"
    }

    json
  end
end
