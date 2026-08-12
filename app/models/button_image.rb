class ButtonImage < ApplicationRecord
  include Processable
  include Permissions
  include Uploadable
  include Async
  include GlobalId
  include SecureSerialize
  protect_global_id
  belongs_to :board, optional: true
  has_many :board_button_images
  belongs_to :user, optional: true
  before_save :generate_defaults
  after_create :track_image_use_later
  after_create :assert_raster
  after_destroy :remove_connections
  include Replicate

  has_paper_trail :on => [:destroy] #:only => [:settings, :board_id, :user_id, :public, :path, :url, :data]
  secure_serialize :settings
  
  add_permissions('view', ['*']) { true }
  add_permissions('view', 'edit') {|user| self.user_id == user.id || (self.user && self.user.allows?(user, 'edit')) }
  cache_permissions

  def generate_defaults
    self.settings ||= {}
    self.settings['license'] ||= {
      'type' => 'private'
    }
    self.public ||= false
    true
  end
  
  def remove_connections
    # TODO: sharding
    BoardButtonImage.where(:button_image_id => self.id).delete_all
  end
  
  def protected?
    # Must use process_boolean — clients (and some legacy writes) can store the
    # string "false". `!!"false"` is true in Ruby, which made JsonApi::Image treat
    # ordinary symbol picks / uploads as gated and blank their URL in speak mode.
    process_boolean(self.settings && self.settings['protected'])
  end
  
  def track_image_use_later
    self.settings ||= {}
    # Only public boards call back to opensymbols, to prevent private user information leakage
    return if RedisInit.any_queue_pressure?
    if !self.settings['suggestion'] && (self.settings['label'] || self.settings['search_term']) && !self.settings['skip_tracking']
      # TODO: don't track image uses for board copies, only for user edits
      Worker.schedule_for(:slow, ButtonImage, :perform_action, {
        'id' => self.id,
        'method' => 'track_image_use',
        'arguments' => []
      })
    end
    if self.settings['protected_source'] && self.user
      if !(user.settings['activated_sources'] || []).include?(self.settings['protected_source'])
        self.user.schedule(:track_protected_source,self.settings['protected_source'])
      end
    end
    if self.settings && self.protected? && !self.settings['fallback']
      if self.settings['button_label'] || self.settings['search_term']
        Worker.schedule_for(:slow, ButtonImage, :perform_action, {
          'id' => self.id,
          'method' => 'generate_fallback',
          'arguments' => []
        })
      end
    end
    true
  end

  def assert_fallback(button_image)
    # When swapping images, user the fallback image after the swap if one wasn't already defined
    changed = false
    if button_image && !button_image.protected?
      if self.protected? && !self.settings['fallback']
        self.settings['fallback'] = button_image.settings.slice('pending', 'content_type', 'width', 'height', 'source_url', 'hc', 'license')
        self.settings['fallback']['url'] = button_image.url
        changed = true
      end
    end
    if button_image && button_image.settings['library_alternates']
      button_image.settings['library_alternates'].each do |library, hash|
        self.settings['library_alternates'] ||= {}
        if !self.settings['library_alternates'][library]
          self.settings['library_alternates'][library] = hash
          changed = true
        end
      end
    end
    self.save if changed
  end

  def generate_fallback(force=false)
    if self.protected? && (!self.settings['fallback'] || force)
      term = self.settings['button_label'] || self.settings['search_term']
      if !term
        # fallback for legacy button images
        bbi = BoardButtonImage.where(button_image_id: self.id).order('id').first
        board = bbi && bbi.board
        button = board && board.buttons.detect{|b| b['image_id'] == self.global_id}
        term = button && button['label']
      end
      if term
        image = (Uploader.default_images('opensymbols', [term], 'en', self.user) || {})[term]
        image ||= (Uploader.find_images(term, 'opensymbols', 'en', self.user) || [])[0]
        if image
          self.settings['fallback'] = image
          self.save
        end
      end
    end
  end
  
  def track_image_use
    self.settings ||= {}
    # Only public boards call back to opensymbols, to prevent private user information leakage
    if !self.settings['suggestion'] && (self.settings['label'] || self.settings['search_term']) && self.board && self.board.public
      ButtonImage.track_image_use({
        :search_term => self.settings['search_term'],
        :locale => (self.board && self.board.settings['locale']) || 'en',
        :label => self.settings['label'],
        :suggestion => self.settings['suggestion'],
        :external_id => self.settings['external_id'],
        :user_id => self.user.global_id
      })
    end
  end
  
  def self.track_image_use(options)
    options = options.with_indifferent_access
    label = options[:search_term] || options[:label]
    if label && options[:external_id] && ENV['OPENSYMBOLS_TOKEN'] && options[:user_id]
      id = options[:external_id]
      # TODO: don't hard-code to this URL
      Typhoeus.post("https://www.opensymbols.org/api/v1/symbols/#{id}/use", body: {
        access_token: ENV['OPENSYMBOLS_TOKEN'],
        user_id: GoSecure.sha512(options[:user_id], 'global_user_id')[0, 10],
        locale: options[:locale],
        keyword: label
      }, timeout: 10)
    end
  end
  
  def self.track_images(images_to_track)
    images_to_track.each do |img|
      self.track_image_use(img)
    end
  end

  def image_library
    bi = self
    lib = 'unknown'
    return bi.settings['protected_source'] if bi.settings['protected_source']
    if bi.settings['license'] && bi.settings['license']['uneditable'] && bi.settings['license']['author_name'] && bi.settings['license']['author_url']
      lib = 'arasaac' if bi.settings['license']['author_url'].match(/arasaac/i)
      lib = 'twemoji' if bi.settings['license']['author_name'].match(/twitter/i)
      lib = 'mulberry' if bi.settings['license']['author_name'].match(/paxtoncrafts/i)
      lib = 'noun-project' if bi.settings['license']['author_url'].match(/thenounproject/i)
      lib = 'sclera' if bi.settings['license']['author_name'].match(/sclera/i)
      lib = 'tawasol' if bi.settings['license']['author_name'].match(/mada/i)
      lib = 'symbolstix' if bi.settings['license']['author_name'].match(/news2you/i)
      lib = 'pcs' if bi.settings['license']['author_name'].match(/tobii/i)
      lib = 'lessonpix' if bi.settings['license']['author_name'].match(/lessonpix/i)
    end
    lib
  end
  
  # Sanitize a stored image data: URL (including content-type spoofing).
  def self.sanitize_stored_data_url(data_url)
    payload = SvgSanitizer.decode_image_data_uri_payload(data_url)
    return nil unless payload
    return data_url unless data_url.to_s.match?(/\Adata:image\/svg\+xml/i) || SvgSanitizer.looks_like_svg?(payload)

    result = SvgSanitizer.sanitize(payload)
    return nil unless result[:ok]

    base64 = data_url.to_s.match?(/;base64,/i)
    return data_url if !result[:changed] && data_url.to_s.match?(/\Adata:image\/svg\+xml/i)

    SvgSanitizer.encode_data_uri_payload(result[:bytes], base64: base64)
  end

  def process_params(params, non_user_params)
    raise "user required as image author" unless self.user_id || non_user_params[:user] || non_user_params[:no_author]
    self.user ||= non_user_params[:user] if non_user_params[:user]
    self.settings ||= {}
    if params['alternates']
      alt_hash = {}
      # Client may send alternates as array of hashes (each with 'library') or as hash (library => data)
      alts = params['alternates']
      alts = alts.map { |lib, data| (data || {}).merge('library' => lib.to_s) } if alts.is_a?(Hash)
      (alts || []).each do |alt|
        lib = alt.is_a?(Hash) ? alt['library'] : nil
        next if lib == 'original' || lib.blank?
        alt = alt.dup if alt.is_a?(Hash)
        alt.delete('library') if alt.is_a?(Hash)
        alt_hash[lib] = alt if alt.is_a?(Hash)
      end
      self.settings['library_alternates'] = alt_hash
    end
    if !self.url
      # Data URLs (word art, file upload, webcam) are not processed by process_url (http only).
      # Store in data column so JsonApi can return them before S3 upload completes.
      data_url = params['data_url'].presence || (params['url'] if params['url'].to_s.match(/^data:/))
      # Security: a ButtonImage must be an image. Drop a data: URI whose own MIME
      # isn't image/* (e.g. data:text/html — a stored-XSS payload were the bytes
      # ever served / opened as a document) so it's never stored.
      data_url = nil if data_url.to_s.match(/\Adata:/i) && !data_url.to_s.match(/\Adata:image\//i)
      # Sanitize SVG data: URIs — strip scriptable content while keeping static symbols.
      if data_url.present?
        data_url = ButtonImage.sanitize_stored_data_url(data_url)
      end
      if data_url.present?
        self.data = data_url
        self.settings['data_uri'] = data_url
      end
      process_url(params['url'], non_user_params) if params['url'] && params['url'].match(/^http/)
      # Security: only ever store an image/* content type. Anything else
      # (text/html, application/*, …) is coerced to image/png so a client-supplied
      # type can't ride through to the S3 object's Content-Type and get served
      # inline as a document. SVG passes (a legit symbol-library type); active
      # content is stripped by SvgSanitizer on store and before S3 upload.
      if params['content_type'].present?
        ct = params['content_type'].to_s
        self.settings['content_type'] = ct.match(/\Aimage\//i) ? ct : 'image/png'
      end
      self.settings['width'] = params['width'].to_i if params['width']
      self.settings['height'] = params['height'].to_i if params['height']
      self.settings['hc'] = !!params['hc'] if params['hc']
      
      # TODO: when cleaning up orphan images, don't delete avatar images
      self.settings['avatar'] = !!params['avatar'] if params['avatar'] != nil
      self.settings['badge'] = !!params['badge'] if params['badge'] != nil
      self.settings['authorless'] = true if non_user_params[:no_author]

      process_license(params['license']) if params['license']
      # Cast through process_boolean so string "false" / "true" from form-encoded
      # or legacy clients never land in settings (see protected?).
      self.settings['protected'] = process_boolean(params['protected']) if params['protected'] != nil
      self.settings['protected_source'] = params['protected_source'] if params['protected_source'] != nil
      self.settings['protected'] = process_boolean(params['ext_lingolinq_protected']) if params['ext_lingolinq_protected'] != nil
      self.settings['protected_source'] = params['ext_lingolinq_protected_source'] if params['ext_lingolinq_protected_source'] != nil
      self.settings['finding_user_name'] = params['finding_user_name'] if params['finding_user_name']
      self.settings['suggestion'] = params['suggestion'] if params['suggestion']
      self.settings['button_label'] = params['button_label'] if params['button_label']
      self.settings['search_term'] = params['search_term'] if params['search_term']
      self.settings['external_id'] = params['external_id'] if params['external_id']
      self.public = params['public'] if params['public'] != nil
    end
    true
  end

  def library_url_for_skin
    candidates = [
      settings['library_url_for_skin'],
      settings['library_skin_base_url'],
      settings['source_url'],
      settings['pre_variant_url'],
      url
    ]
    (settings['library_alternates'] || {}).each_value do |alt|
      candidates << alt['url'] if alt.is_a?(Hash)
    end
    candidates.compact.find { |u| u.to_s.match(/\/libraries\//) }
  end

  def preserve_source_image?
    !!settings['preserve_source_image']
  end

  def needs_library_url_enrichment?
    return false if preserve_source_image?
    return false if library_url_for_skin
    return false if settings['library_url_lookup_attempted']
    !!(url.to_s.match(/amazonaws|lingolinq.*uploads/i))
  end

  # Re-resolve a plain S3 copy to the canonical OpenSymbols/library URL so
  # check_for_variants and client skin_image_map can apply skin tones.
  def ensure_library_url_for_skin!(label: nil, force: false)
    return false if preserve_source_image? && !force
    return true if library_url_for_skin && !force
    return false if settings['library_url_lookup_attempted'] && !force

    settings['library_url_lookup_attempted'] = true
    settings['button_label'] ||= label if label.present?
    changed = false
    lib = image_library
    search_label = settings['button_label'] || settings['search_term']
    libraries = []
    libraries << lib if lib && lib != 'unknown'
    libraries << 'arasaac' if libraries.empty? && settings.dig('license', 'author_url').to_s.match(/arasaac/i)
    libraries << 'opensymbols' if libraries.empty?

    if search_label.present? && libraries.any?
      libraries.uniq.each do |library|
        image_data = (Uploader.find_images(search_label, library, 'en', user, nil, true) || [])[0]
        next unless image_data && image_data['url'].to_s.match(/\/libraries\//)
        settings['library_url_for_skin'] = Uploader.fronted_url(image_data['url'])
        settings['external_id'] ||= image_data['external_id'] if image_data['external_id']
        settings['library_alternates'] ||= {}
        settings['library_alternates'][library] ||= {
          'url' => settings['library_url_for_skin'],
          'license' => image_data['license'],
          'content_type' => image_data['content_type']
        }
        changed = true
        break
      end
    end

    if changed
      check_for_variants(true)
      save
      return true
    end
    save if settings['library_url_lookup_attempted']
    false
  end

  def skin_capable_url
    # Imported images (preserve_source_image): never use enrichment-sourced
    # library_url_for_skin matches (those replace custom art by label search).
    # If the imported URL itself is already a skinnable /libraries/ asset,
    # still allow skin-tone variants of that same asset.
    if preserve_source_image?
      [settings['library_skin_base_url'], url].compact.each do |candidate|
        fronted = Uploader.fronted_url(candidate)
        return fronted if url_skinnable?(fronted)
      end
      return nil
    end

    if settings['library_skin_base_url']
      url = Uploader.fronted_url(settings['library_skin_base_url'])
      return url if url_skinnable?(url)
    end
    lib_url = library_url_for_skin
    if lib_url
      url = Uploader.fronted_url(lib_url)
      return url if url_skinnable?(url)
    end
    nil
  end

  def url_skinnable?(url)
    return false unless url
    url.match(/\.varianted-skin\.\w+$/) ||
      (url.match(/\/libraries\/twemoji\//) && url.match(/-var\w+UNI/))
  end

  def check_for_variants(force=false)
    return false if self.settings['checked_for_variants'] && !force
    variant_target = library_url_for_skin || self.url
    if variant_target && !variant_target.match(/\.varianted-skin\./) && !variant_target.match(/-var\w+UNI/)
      if variant_target.match(/\/libraries\/twemoji\//) && self.settings['external_id']
        token = ENV['OPENSYMBOLS_TOKEN']
        url = "https://www.opensymbols.org/api/v2/symbols/twemoji/#{self.settings['external_id']}"
        res = Typhoeus.get(url + "?search_token=#{token}", headers: { 'Accept-Encoding' => 'application/json' }, timeout: 10)
        json = JSON.parse(res.body) rescue nil
        if json && json['symbol'] && json['symbol']['image_url'] && json['symbol']['image_url'] != variant_target
          self.settings['pre_variant_url'] ||= variant_target
          if variant_target == self.url
            self.url = json['symbol']['image_url']
          else
            self.settings['library_skin_base_url'] = json['symbol']['image_url']
          end
          self.settings['checked_for_variants'] = true
          self.save
          return true
        end
      elsif variant_target.match(/\/libraries\//)
        extension = (variant_target.split(/\//)[-1] || '').split(/\./)[-1]
        new_url = variant_target + '.varianted-skin.' + extension
        req = Typhoeus.head(URI.escape(new_url), timeout: 5)
        if req.success?
          self.settings['pre_variant_url'] ||= variant_target
          if variant_target == self.url
            self.url = new_url
          else
            self.settings['library_skin_base_url'] = new_url
          end
          self.settings['checked_for_variants'] = true
          self.save
          return true
        end
      end
    end
    self.settings['checked_for_variants'] = true
    self.save
    return false
  end

  SKIN_UNIS = {
    'light' => '1f3fb',
    'medium-light' => '1f3fc',
    'medium' => '1f3fd',
    'medium-dark' => '1f3fe',
    'dark' => '1f3ff',
  }

  def self.which_skinner(skin)
    which_skin = proc{|url| next skin || 'default'; }
    if skin == 'original'
      which_skin = proc{|url| next 'default'; }
    elsif skin && !skin.match(/default|light|medium-light|medium|medium-dark|dark/)
      weights = skin.match(/-(\d)(\d)(\d)(\d)(\d)(\d)$/);
      df = weights ? weights[1].to_i : 2;
      d = weights ? weights[2].to_i : 2;
      md = weights ? weights[3].to_i : 2;
      m = weights ? weights[4].to_i : 2;
      ml = weights ? weights[5].to_i : 2;
      l = weights ? weights[6].to_i : 2;
      sum = (df + d + md + m + ml + l).to_f;
      df = df.to_f / sum * 100;
      d = d.to_f / sum * 100;
      md = md.to_f / sum * 100;
      m = m.to_f / sum * 100;
      ml = ml.to_f / sum * 100;
      l = l.to_f / sum * 100;
      which_skin = proc{|url|
        sum = (url + "::" + skin).each_char.map(&:ord).sum
        mod = sum % 100;
        if mod < df
          next 'default'
        elsif mod < df + d
          next 'dark'
        elsif mod < df + d + md
          next 'medium-dark'
        elsif mod < df + d + md + m
          next 'medium'
        elsif mod < df + d + md + m + ml
          next 'medium-light'
        else
          next 'light'
        end
      }
    end
    return which_skin
  end

  def settings_for(user, allowed_sources, pref)
    settings = {}.merge(self.settings)
    settings['url'] = self.best_url
    settings['protected_source'] ||= 'lessonpix' if settings['license'] && settings['license']['source_url'] && settings['license']['source_url'].match(/lessonpix/)
    settings['protected'] = !!self.protected?
    settings.delete('library_alternates')
    used_library = 'original'
    if preserve_source_image?
      settings['used_library'] = 'original'
      settings['url'] = self.best_url
      settings['url'] = Uploadable.tokenize_protected_image_url(settings['url'], user)
      return settings
    end
    if self.settings['library_alternates']
      pref ||= user && ((user.settings || {})['preferences'] || {})['preferred_symbols']
      allowed_sources ||= user && user.enabled_protected_sources(true)
      allowed_sources ||= []
      if pref && pref != 'default' && pref != 'original'
        if JsonApi::Image::PROTECTED_SOURCES.include?(pref) && !allowed_sources.include?(pref)
        else
          lib = self.image_library
          pref = nil if pref == 'default' || pref == 'original'
          if lib == pref || !pref
            used_library = lib
          elsif self.settings['library_alternates'] && self.settings['library_alternates'][pref]
            used_library = pref
            settings = self.settings['library_alternates'][pref]
            if JsonApi::Image::PROTECTED_SOURCES.include?(used_library)
              settings['protected'] = true 
              settings['protected_source'] = pref
            end
          elsif pref == 'opensymbols' && self.settings['library_alternates'] && self.settings['library_alternates']['arasaac']
            used_library = pref
            settings = self.settings['library_alternates']['arasaac']
          elsif pref == 'opensymbols' && self.settings['library_alternates'] && self.settings['library_alternates']['twemoji']
            used_library = pref
            settings = self.settings['library_alternates']['twemoji']
          end
        end
      end
    end
    settings['used_library'] = used_library
    settings['url'] = Uploadable.tokenize_protected_image_url(settings['url'], user)
    settings
  end

  def self.skinned_url(url, which_skin)
    return url unless url
    if url.match(/varianted-skin\.\w+$/)
      which = which_skin.call(url)
      if which != 'default' && SKIN_UNIS[which]
        return url.sub(/varianted-skin\./, 'variant-' + which + '.');
      else
        return url
      end
    elsif url.match(/\/libraries\/twemoji\//) && url.match(/-var\w+UNI/)
      which = which_skin.call(url)
      uni = SKIN_UNIS[which];
      if which != 'default' && uni
        return url.gsub(/-var\w+UNI/, '-' + uni);
      else
        return url;
      end
    else
      return url;
    end
  end
end
