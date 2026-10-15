module JsonApi::Video
  extend JsonApi::Json
  
  TYPE_KEY = 'video'
  DEFAULT_PAGE = 25
  MAX_PAGE = 50
    
  def self.build_json(video, args={})
    json = {}
    json['id'] = video.global_id
    json['url'] = video.url
    ['pending', 'content_type', 'duration'].each do |key|
      json[key] = video.settings[key]
    end
    json['license'] = OBF::Utils.parse_license(video.settings['license'])
    if args[:permissions]
      json['permissions'] = video.permissions_for(args[:permissions])
    end
    json
  end
  
  def self.meta(video)
    json = {}
    # no upload form when S3 is not configured (see JsonApi::Image.meta)
    if video.pending_upload? && Uploader.client_uploads_configured?
      params = video.remote_upload_params
      json = {'remote_upload' => params}
    end
    json
  end
end