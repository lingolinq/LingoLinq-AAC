module JsonApi::Utterance
  extend JsonApi::Json
  
  TYPE_KEY = 'utterance'
  DEFAULT_PAGE = 10
  MAX_PAGE = 25
    
  def self.build_json(utterance, args={})
    json = {}
    json['id'] = utterance.global_id
    json['created_at'] = utterance.created_at.iso8601
    json['button_list'] = utterance.data['button_list']
    json['private_only'] = utterance.data['private_only']
    if !json['private_only']
      json['link'] = "#{JsonApi::Json.current_host}/utterances/#{utterance.global_id}"
    end
    json['sentence'] = utterance.data['sentence']
    json['image_url'] = utterance.data['image_url'] || "https://opensymbols.s3.amazonaws.com/libraries/noun-project/Person-08e6d794b0.svg"
    json['large_image_url'] = utterance.data['large_image_url']
    if args[:permissions] || args[:reply_code]
      json['permissions'] = utterance.permissions_for(args[:permissions])
      if args[:reply_code]
        json['permissions']['reply'] = true
        json['reply_code'] = args[:reply_code]
        json['id'] = "#{utterance.global_id}x#{args[:reply_code]}"
      end
      share_index = Utterance.from_alpha_code(args[:reply_code].match(/[A-Z]+$/)[0]) rescue nil
      if share_index && utterance.data['reply_ids'] && utterance.data['reply_ids'][share_index.to_s]
        msg = LogSession.find_reply(utterance.data['reply_ids'][share_index.to_s], nil, utterance.user)
        json['prior'] = {
          'text' => msg[:message],
          'author' => DefaultAvatar.contact(msg[:contact].slice('id', 'name', 'image_url'))
        } if msg
      end
    end
    if ((json['permissions'] && json['permissions']['edit']) || utterance.data['show_user'] || args[:reply_code]) && utterance.user
      json['user'] = JsonApi::User.as_json(utterance.user, limited_identity: true)
    end
    json['show_user'] = !!utterance.data['show_user']
    json['show_user'] = true if args[:reply_code]
    json
  end
end