module JsonApi::Image
  extend JsonApi::Json
  
  TYPE_KEY = 'image'
  DEFAULT_PAGE = 25
  MAX_PAGE = 50
  PROTECTED_SOURCES = ['lessonpix', 'pcs', 'symbolstix']

  def self.build_json(image, args={})
    json = {}
    json['id'] = image.global_id
    json['url'] = image.best_url
    allowed_sources = args[:allowed_sources]
    allowed_sources ||= args[:permissions] && args[:permissions].enabled_protected_sources(true)
    allowed_sources ||= []
    settings = image.settings_for(args[:permissions], allowed_sources, args[:preferred_source])
    settings['protected_source'] ||= 'lessonpix' if settings['license'] && settings['license']['source_url'] && settings['license']['source_url'].match(/lessonpix/)
    json['url'] = settings['url'] if settings['used_library'] != image.image_library
    protected_source = settings['protected']
    if settings && protected_source && args[:original_and_fallback]
      fb = settings['fallback'] || {}
      json['fallback_url'] = Uploader.fronted_url(fb['url'])
    elsif settings && protected_source && !allowed_sources.include?(settings['protected_source'])
      settings = settings['fallback'] || {}
      json['url'] = Uploader.fronted_url(settings['url'])
      json['fallback'] = true
      protected_source = false
    end
    ['pending', 'content_type', 'width', 'height', 'source_url', 'hc'].each do |key|
      json[key] = settings[key]
    end
    json['protected'] = protected_source
    json['protected_source'] = settings['protected_source'] if json['protected']
    json['license'] = OBF::Utils.parse_license(settings['license'])
    if (args[:data] || !image.url) && image.data
      json['url'] = image.data
    end
    if args[:permissions]
      json['permissions'] = image.permissions_for(args[:permissions])
    end
    if args[:include_other_sources] || (json['permissions'] || {})['edit']
      json['alternates'] = []
      libs = {}.merge(image.settings['library_alternates'] || {})
      best_url = image.best_url
      libs.delete('original') if libs['original'] && libs['original']['url'] != best_url
      il = image.image_library
      if settings['used_library'] != 'original' || !libs['original'] || !libs[il]
        lib = {
          'library' => il,
          'url' => best_url,
          'license' => OBF::Utils.parse_license(image.settings['license']),
          'content_type' => image.settings['content_type']
        }
        libs['original'] ||= lib
        libs[il] ||= lib
      end

      main_license = OBF::Utils.parse_license(image.settings['license'])
      libs.each do |lib, alternate|
        if allowed_sources.include?(lib) || !PROTECTED_SOURCES.include?(lib)
          # Inherit main image license when alternate has none (e.g. rasterized/cached copies)
          alt_license = alternate['license'].present? ? OBF::Utils.parse_license(alternate['license']) : main_license
          json['alternates'] << {
            'library' => lib,
            'url' => alternate['url'],
            'license' => alt_license,
            'content_type' => alternate['content_type']
          }
        end
      end
      json.delete('alternates') if json['alternates'] && json['alternates'].length == 0
    end

    json
  end
  
  def self.meta(image)
    json = {}
    if image.pending_upload?
      params = image.remote_upload_params
      json = {'remote_upload' => params}
    end
    json
  end
end