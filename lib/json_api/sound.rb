module JsonApi::Sound
  extend JsonApi::Json
  
  TYPE_KEY = 'sound'
  DEFAULT_PAGE = 25
  MAX_PAGE = 50
    
  def self.build_json(sound, args={})
    json = {}
    json['id'] = sound.global_id
    json['url'] = sound.best_url
    json['created'] = sound.created_at && sound.created_at.iso8601
    ['pending', 'content_type', 'duration', 'name', 'transcription', 'tags'].each do |key|
      json[key] = sound.settings[key]
    end
    json['untranscribable'] = true if sound.settings['transcription_uncertain']
    json['name'] ||= 'Sound'
    json['protected'] = !!sound.protected?
    json['license'] = OBF::Utils.parse_license(sound.settings['license'])
    if (args[:data] || !sound.url) && sound.data
      json['url'] = sound.data
    end
    if args[:permissions]
      json['permissions'] = sound.permissions_for(args[:permissions])
      if json['permissions']['edit']
        json['boards'] = BoardButtonSound.where(:button_sound_id => sound.id).count
        json['original_board_key'] = sound.board && sound.board.key
      end
    end
    json
  end
  
  def self.meta(sound)
    json = {}
    if sound.pending_upload? && !sound.destroyed?
      params = sound.client_upload_params
      json = {'remote_upload' => params}
    end
    json
  end
end