module JsonApi::Alert
  extend JsonApi::Json
  
  TYPE_KEY = 'alert'
  DEFAULT_PAGE = 10
  MAX_PAGE = 30
    
  def self.build_json(alert, args={})
    json = {}
    json['id'] = ::Webhook.get_record_code(alert)
    if alert.is_a?(LogSession)
      json['note'] = true
      json['type'] = 'note'
      json['text'] = alert.data['note']['text']
      json['sent'] = alert.created_at.iso8601
      json['prior'] = alert.data['note']['prior']
      if alert.data['note'] && alert.data['note']['priot_contact']
        json['prior_author'] = DefaultAvatar.contact(alert.data['note']['prior_contact'].slice('id', 'name', 'image_url'))
      end
      if alert.data['author_contact']
        json['author'] = DefaultAvatar.contact(alert.data['author_contact'].slice('id', 'name', 'image_url'))
      elsif alert.author
        json['author'] = {
          'id' => alert.author.global_id,
          'name' => alert.author.user_name,
          'image_url' => alert.author.generated_avatar_url
        }
      end
      json['unread'] = !!alert.data['unread']
    elsif alert.is_a?(Utterance)
      json['note'] = true
      json['type'] = 'note'
      json['text'] = alert.data['sentence']
      json['author'] = {
        'id' => alert.user.global_id,
        'name' => alert.user.user_name,
        'image_url' => alert.user.generated_avatar_url
      }
    end

    json
  end
end
