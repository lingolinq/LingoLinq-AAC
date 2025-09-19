# Only require obf gem when not disabled (for asset precompilation)
require 'obf' unless ENV['DISABLE_OBF_GEM'] == 'true'

module Converters::CoughDrop
  EXT_PARAMS = ['link_disabled', 'add_to_vocalization', 'add_vocalization', 'hide_label', 'home_lock', 'blocking_speech', 'part_of_speech', 'external_id', 'video', 'book']

  def self.to_obf(board, dest_path, path_hash=nil)
    # Return early if OBF gem is disabled
    if ENV['DISABLE_OBF_GEM'] == 'true'
      raise "OBF functionality disabled during asset compilation"
    end
    json = nil
    Progress.as_percent(0, 0.1) do
      json = to_external(board, {})
    end
    Progress.as_percent(0.1, 1.0) do
      OBF::External.to_obf(json, dest_path, path_hash)
    end
  end

  def self.to_external(board, opts)
    # Return early if OBF gem is disabled
    if ENV['DISABLE_OBF_GEM'] == 'true'
      raise "OBF functionality disabled during asset compilation"
    end

    res = OBF::Utils.obf_shell
    res['id'] = board.global_id
    res['name'] = board.settings['name']
    res['locale'] = board.settings['locale'] || 'en'
    res['default_layout'] = 'landscape'
    res['image_url'] = board.settings['image_url']
    res['ext_sweetsuite_image_url'] = board.settings['image_url']
    res['url'] = "#{JsonApi::Json.current_host}/#{board.key}"
    if opts && opts['simple']
      res['data_url'] = "#{JsonApi::Json.current_host}/api/v1/boards/#{board.key}/simple.obf"
    else
      res['data_url'] = "#{JsonApi::Json.current_host}/api/v1/boards/#{board.key}"
    end
    res['description_html'] = board.settings['description'] || "built with CoughDrop"
    res['license'] = OBF::Utils.parse_license(board.settings['license'])
    if !opts || !opts['simple']
      trans = BoardContent.load_content(board, 'translations')
      if trans
        res['default_locale'] = trans['default']
        res['label_locale'] = trans['current_label']
        res['vocalization_locale'] = trans['current_vocalization']
      end
      bg = BoardContent.load_content(board, 'background')
      if bg
        res['background'] = {
          'image_url' => bg['image'] || bg['image_url'],
          'ext_sweetsuite_image_exclusion' => bg['ext_sweetsuite_image_exclusion'],
          'color' => bg['color'],
          'position' => bg['position'],
          'text' => bg['text'],
          'prompt_text' => bg['prompt'] || bg['prompt_text'],
          'delayed_prompts' => bg['delay_prompts'] || bg['delayed_prompts'],
          'delay_prompt_timeout' => bg['delay_prompt_timeout']
        }
        res['background'].keys.each{|key| res['background'].delete(key) unless res['background'][key] }
      end

      res['ext_sweetsuite_settings'] = {
        'private' => !board.public,
        'key' => board.key,
        'word_suggestions' => !!board.settings['word_suggestions'],
        'protected' => board.protected_material?,
        'home_board' => board.settings['home_board'],
        'categories' => board.settings['categories'],
        'text_only' => board.settings['text_only'],
        'hide_empty' => board.settings['hide_empty']
      }
      if board.unshareable? 
        res['protected_content_user_identifier'] = board.user ? board.user.settings['email'] : "nobody@example.com"
        res['ext_sweetsuite_settings']['protected_user_id'] = board.user.global_id if board.user
      end
    end
    grid = []
    res['buttons'] = []
    button_count = board.buttons.length
    locs = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']
    which_skinner = ButtonImage.which_skinner(opts && opts['user'] && opts['user'].settings && opts['user'].settings['preferences']['skin'])
    Progress.update_current_progress(0.3, "externalizing board #{board.global_id}")
    Progress.as_percent(0.3, 1.0) do
      board.buttons.each_with_index do |original_button, idx|
        button = {
          'id' => original_button['id'],
          'label' => original_button['label'],
          'left' => original_button['left'],
          'top' => original_button['top'],
          'width' => original_button['width'],
          'height' => original_button['height'],
          'border_color' => original_button['border_color'] || "#aaa",
          'background_color' => original_button['background_color'] || "#fff",
          'hidden' => original_button['hidden'],
        }
        button['ext_sweetsuite_rules'] = original_button['rules'] if original_button['rules']
        if !opts || !opts['simple']
          inflection_defaults = nil
          trans = {}
          (BoardContent.load_content(board, 'translations') || {}).each do |loc, hash|
            next unless hash && hash.is_a?(Hash)
            if hash[original_button['id']]
              trans[loc] = hash[original_button['id']]
            end
          end
          trans[board.settings['locale']] ||= original_button if original_button['inflections']
          trans.each do |loc, hash|
            button['translations'] ||= {}
            button['translations'][loc] ||= {}
            button['translations'][loc] ||= {}
            button['translations'][loc]['label'] = hash['label']
            button['translations'][loc]['vocalization'] = hash['vocalization'] if !hash['vocalization'].to_s.match(/^(\:|=+)/) || !hash['vocalization'].to_s.match(/&&/)
            button['translations'][loc]['ext_sweetsuite_rules'] = hash['rules'] if hash['rules']
            (hash['inflections'] || []).each_with_index do |str, idx| 
              next unless str
              button['translations'][loc]['inflections'] ||= {}
              button['translations'][loc]['inflections'][locs[idx]] = str
            end
            (hash['inflection_defaults'] || []).each do |key, str|
              if button['translations'][loc]['inflections'][key]
              elsif locs.include?(key)
                button['translations'][loc]['inflections'][key] = str
                button['translations'][loc]['inflections']['ext_sweetsuite_defaults'] ||= []
                button['translations'][loc]['inflections']['ext_sweetsuite_defaults'].push(key)
              end
            end
          end
          if original_button['vocalization']
            if original_button['vocalization'].match(/^(\:|\+)/) || original_button['vocalization'].match(/&&/)
              if original_button['vocalization'].match(/&&/)
                button['actions'] = original_button['vocalization'].split(/&&/).map{|v| v.strip }
                vocs = button['actions'].select{|a| !a.match(/^(\+|:)/)}
                button['actions'] -= vocs
                button['vocalization'] = vocs.join(' ') if vocs.length > 0
                button['action'] = button['actions'][0]
              else
                button['action'] = original_button['vocalization']
              end
            else
              button['vocalization'] = original_button['vocalization']
            end
          end
        end
          
        if original_button['load_board']
          button['load_board'] = {
            'id' => original_button['load_board']['id'],
            'url' => "#{JsonApi::Json.current_host}/#{original_button['load_board']['key']}",
            'data_url' => "#{JsonApi::Json.current_host}/api/v1/boards/#{original_button['load_board']['key']}"
          }
          if opts && opts['simple']
            button['load_board']['data_url'] = "#{JsonApi::Json.current_host}/api/v1/boards/#{original_button['load_board']['key']}/simple.obf"
          end
        end

        if !opts || !opts['simple']
          if original_button['url']
            button['url'] = original_button['url']
          end
          EXT_PARAMS.each do |param|
            if original_button[param]
              button["ext_sweetsuite_#{param}"] = original_button[param]
            end
          end

          if original_button['apps']
            button['ext_sweetsuite_apps'] = original_button['apps']
            if original_button['apps']['web'] && original_button['apps']['web']['launch_url']
              button['url'] = original_button['apps']['web']['launch_url']
            end
          end
        end
        if original_button['image_id']
          image = board.known_button_images.detect{|i| i.global_id == original_button['image_id'] }
          if image
            image_settings = image.settings_for(opts['user'], nil, nil)
            
            skinned_url = ButtonImage.skinned_url(Uploader.fronted_url(image_settings['url']), which_skinner)
            image_record = image
            image = {
              'id' => image.global_id,
              'width' => image_settings['width'],
              'height' => image_settings['height'],
              'protected' => image_settings['protected'],
              'protected_source' => image_settings['protected_source'],
              'license' => OBF::Utils.parse_license(image_settings['license']),
              'url' => Uploader.fronted_url(image_settings['url']),
              'data_url' => "#{JsonApi::Json.current_host}/api/v1/images/#{image.global_id}",
              'content_type' => image_settings['content_type']
            }
            if skinned_url && skinned_url != image['url']
              image['ext_sweetsuite_unskinned_url'] = image['url']
              image['url'] = Uploader.fronted_url(skinned_url)
            end
            alt_urls = []
            if image['protected_source'] == 'pcs' && image['url'] && image['url'].match(/\.svg$/)
              if image['url'].match(/varianted-skin/)
                alt_urls << image['url'].sub(/varianted-skin\.svg/, '') + 'png'
                alt_urls << image['url'].sub(/varianted-skin\.svg/, '') + 'raster.png'
              elsif image['url'].match(/variant-/)
                alt_urls << image['url'] + '.raster.png'
              else
                # apparently some are raster.png, some are .png
                alt_urls << image['url'] + '.raster.png'
                alt_urls << image['url'] + '.png'
              end
            elsif opts['for_pdf'] && image_record.raster_url
              alt_urls << Uploader.fronted_url(image_record.raster_url(skinned_url != image['url'] ? skinned_url : nil))
            elsif opts['for_pdf'] && image_record.possible_raster
              alt_urls << Uploader.fronted_url(image_record.possible_raster)
            end
            if alt_urls.length > 0
              found = false
              alt_urls.each do |alt_url|
                next if found
                req = Typhoeus.head(alt_url)
                if req.success?
                  image['fallback_url'] ||= image['url']
                  image['url'] = alt_url
                  image['content_type'] = 'image/png'
                  image['width'] = 400
                  image['height'] = 400
                  found = true
                end
              end
            end

            res['images'] << image
            button['image_id'] = image['id']
          end
        end
        if !opts || !opts['simple']
          if original_button['sound_id']
            sound = board.known_button_sounds.detect{|i| i.global_id == original_button['sound_id'] }
            if sound
              sound = {
                'id' => sound.global_id,
                'duration' => sound.settings['duration'],
                'protected' => sound.settings['protected'],
                'protected_source' => sound.settings['protected_source'],
                'license' => OBF::Utils.parse_license(sound.settings['license']),
                'url' => sound.url_for(opts['user']),
                'data_url' => "#{JsonApi::Json.current_host}/api/v1/sounds/#{sound.global_id}",
                'content_type' => sound.settings['content_type']
              }
            
              res['sounds'] << sound
              button['sound_id'] = original_button['sound_id']
            end
          end
        end
        res['buttons'] << button
        Progress.update_current_progress(idx.to_f / button_count.to_f, "hashify button #{button['id']} from #{board.global_id}")
      end
    end
    res['grid'] = BoardContent.load_content(board, 'grid')
    res
  end
  
  def self.from_obf(obf_json_or_path, opts)
    json = OBF::External.from_obf(obf_json_or_path, opts)
    from_external(json, opts)
  end
  
  def self.from_external(json, opts)
    obj = OBF::Utils.parse_obf(json)

    raise "user required" unless opts['user']
    raise "missing id" unless obj['id']
    protected_sources = opts['user'] ? opts['user'].enabled_protected_sources(true) : []
    if obj['ext_sweetsuite_settings'] && obj['ext_sweetsuite_settings']['protected'] && obj['ext_sweetsuite_settings']['key']
      user_name = obj['ext_sweetsuite_settings']['key'].split(/\//)[0]
      if user_name != opts['user'].user_name
        if obj['ext_sweetsuite_settings']['protected_user_id'] != opts['user'].global_id
          raise "can't import protected boards to a different user"
        end
      end
    end

    hashes = {}
    hashes['images_hash_ids'] = obj['buttons'].map{|b| b && b['image_id'] }.compact
    hashes['sounds_hash_ids'] = obj['buttons'].map{|b| b && b['sound_id'] }.compact
    [['images_hash', ButtonImage], ['sounds_hash', ButtonSound]].each do |list, klass|
      (obj[list] || {}).each do |id, item|
        next unless hashes["#{list}_ids"].include?(item['id'])
        record = Converters::Utils.find_by_data_url(item['data_url'])
        if item['protected'] && item['protected_source'] && !protected_sources.include?(item['protected_source'])
          # If the image/sound is protected and the user doesn't have permission
          # to access the source, then skip importing it rather than failing
          next
        end
        if record
          obj[list][item['id']]['id'] = record.global_id
          hashes[item['id']] = record.global_id
        elsif item['data']
          record = klass.create(:user => opts['user'])
          item['ref_url'] = item['data']
        elsif item['url']
          record = klass.create(:user => opts['user'])
          item['ref_url'] = item['ext_sweetsuite_unskinned_url'] || item['url']
        end
        if record && !hashes[item['id']]
          item.delete('data')
          item.delete('url')

          if Uploader.valid_remote_url?(item['ref_url'])
            item['url'] = item['ref_url']
            item.delete('ref_url')
          end

          record.process(item)

          if item['ref_url']
            record.upload_to_remote(item['ref_url']) if item['ref_url']
          end
          hashes[item['id']] = record.global_id
          obj[list][item['id']]['id'] = record.global_id
        end
      end
    end

    params = {}
    non_user_params = {'user' => opts['user']}
    params['name'] = obj['name']
    params['description'] = obj['description_html']
    params['image_url'] = obj['image_url']
    params['license'] = OBF::Utils.parse_license(obj['license'])
    params['locale'] = obj['locale'] || 'en'

    if obj['default_locale']
      params['translations'] ||= {}
      params['translations']['default'] = obj['default_locale'] if obj['default_locale']
      params['translations']['current_label'] = obj['label_locale'] if obj['label_locale']
      params['translations']['current_vocalization'] = obj['vocalization_locale'] if obj['vocalization_locale']
    end

    loc_hash = {'nw' => 0, 'n' => 1, 'ne' => 2, 'w' => 3, 'e' => 4, 'sw' => 5, 's' => 6, 'se' => 7};
    params['buttons'] = obj['buttons'].map do |button|
      new_button = {
        'id' => button['id'],
        'label' => button['label'],
        'left' => button['left'],
        'top' => button['top'],
        'width' => button['width'],
        'height' => button['height'],
        'border_color' => button['border_color'],
        'background_color' => button['background_color'],
        'hidden' => button['hidden']
      }
      if button['actions']
        new_button['vocalization'] = button['actions'].join(' && ')
        if button['vocalization']
          new_button['vocalization'] = button['vocalization'] + " && " + new_button['vocalization']
        end
      elsif button['action']
        new_button['vocalization'] = button['action']
      elsif button['vocalization']
        new_button['vocalization'] = button['vocalization']
      end
      if button['image_id']
        new_button['image_id'] = hashes[button['image_id']]
      end
      if button['sound_id']
        new_button['sound_id'] = hashes[button['sound_id']]
      end
      EXT_PARAMS.each do |param|
        if button["ext_sweetsuite_#{param}"]
          new_button[param] = button["ext_sweetsuite_#{param}"]
        end
      end

      if button['translations']
        new_button['translations'] ||= {}
        button['translations'].each do |loc, hash|
          ref = nil
          if button['translations'].keys == [params['locale']] && (hash['label'] || button['label']) == button['label'] && (hash['vocalization'] || button['vocalization']) == button['vocalization']
            ref = button
          else
            new_button['translations'][loc] ||= {'locale' => loc}
            ref = new_button['translations'][loc]
          end
          ref['label'] ||= hash['label'] if hash['label']
          ref['vocalization'] ||= hash['vocalization'] if hash['vocalization']
          ref['rules'] ||= hash['ext_sweetsuite_rules'] if hash['ext_sweetsuite_rules']
          (hash['inflections'] || {}).each do |key, str|
            if str == 'ext_sweetsuite_defaults'
            elsif loc_hash[key] && !(hash['inflections']['ext_sweetsuite_defaults'] || []).include?(key)
              ref['inflections'] ||= []
              ref['inflections'][loc_hash[key]] = str.to_s if str
            end
          end
        end
      end

      if button['load_board']
        if opts['boards'] && opts['boards'][button['load_board']['id']]
          new_button['load_board'] = opts['boards'][button['load_board']['id']]
        else
          link = Board.find_by_path(button['load_board']['key'] || button['load_board']['id'])
          if link
            new_button['load_board'] = {
              'id' => link.global_id,
              'key' => link.key
            }
          end
        end
      elsif button['url']
        if button['ext_sweetsuite_apps']
          new_button['apps'] = button['ext_sweetsuite_apps']
        else
          new_button['url'] = button['url']
        end
      end
      new_button
    end
    params['grid'] = obj['grid']
    params['public'] = !(obj['ext_sweetsuite_settings'] && obj['ext_sweetsuite_settings']['private'])
    params['home_board'] = (obj['ext_sweetsuite_settings'] || {})['home_board'] || false
    params['categories'] = (obj['ext_sweetsuite_settings'] || {})['categories'] || []
    params['word_suggestions'] = obj['ext_sweetsuite_settings'] && obj['ext_sweetsuite_settings']['word_suggestions']
    params['text_only'] = (obj['ext_sweetsuite_settings'] || {})['text_only'] || false
    params['hide_empty'] = (obj['ext_sweetsuite_settings'] || {})['hide_empty'] || false

    if obj['background']
      params['background'] = obj['background']
    end

    non_user_params[:key] = (obj['ext_sweetsuite_settings'] && obj['ext_sweetsuite_settings']['key'] && obj['ext_sweetsuite_settings']['key'].split(/\//)[-1])
    board = nil
    if opts['boards'] && opts['boards'][obj['id']]
      board = Board.find_by_path(opts['boards'][obj['id']]['id']) || Board.find_by_path(opts['boards'][obj['id']]['key'])
      board.process(params, non_user_params)
    else
      board = Board.process_new(params, non_user_params)
    end
    opts['boards'] ||= {}
    opts['boards'][obj['id']] = {
      'id' => board.global_id,
      'key' => board.key
    }
    board
  end
  
  def self.to_obz(board, dest_path, opts)
    content = nil
    Progress.as_percent(0, 0.1) do
      content = to_external_nested(board, opts)
    end
    Progress.as_percent(0.1, 1.0) do
      OBF::External.to_obz(content, dest_path, opts)
    end
  end
  
  def self.to_external_nested(board, opts)
    boards = []
    images = []
    sounds = []
    
    board.track_downstream_boards!
    Progress.update_current_progress(0.1, 'tracked downstreams')

    lookup_boards = [board]
    board.downstream_board_ids.each do |id|
      b = Board.find_by_path(id)
      if b && b.allows?(opts['user'], 'view')
        lookup_boards << b
      end
    end

    incr = (1.0 / lookup_boards.length.to_f) * 0.9
    tally = 0.1
    lookup_boards.each do |b|
      if b
        Progress.as_percent(tally, tally + incr) do
          res = to_external(b, opts)
          images += res['images']
          res.delete('images')
          sounds += res['sounds']
          res.delete('sounds')
          boards << res
        end
        tally += incr
      end
    end
      
    return {
      'boards' => boards,
      'images' => images.uniq,
      'sounds' => sounds.uniq
    }
  end
  
  def self.from_obz(obz_path, opts)
    content = OBF::External.from_obz(obz_path, opts)
    from_external_nested(content, opts)
  end
  
  def self.from_external_nested(content, opts)
    result = []
    
    # pre-load all the boards so they already exist when we go to look for them as links
    content['boards'].each do |obj|
      if opts['boards'] && opts['boards'][obj['id']]
        board = Board.find_by_path(opts['boards'][obj['id']]['id']) || Board.find_by_path(opts['boards'][obj['id']]['key'])
      else
        non_user_params = {'user' => opts['user']}
        non_user_params[:key] = (obj['ext_sweetsuite_settings'] && obj['ext_sweetsuite_settings']['key'] && obj['ext_sweetsuite_settings']['key'].split(/\//)[-1])
        params = {}
        params['name'] = obj['name']
        board = Board.process_new(params, non_user_params)
      end
      if board
        board.reload
        opts['boards'] ||= {}
        opts['boards'][obj['id']] = {
          'id' => board.global_id,
          'key' => board.key
        }
      end
    end
    
    # Removed sleep 10 - was causing 10+ second delays for multi-board conversions
    # TODO: Investigate if this was masking a race condition that needs proper fix
    
    content['boards'].each do |board|
      board['images'] = content['images'] || []
      board['sounds'] = content['sounds'] || []
      result << from_obf(board, opts)
    end
    return result
  end
  
  def self.to_pdf(board, dest_path, opts)
    # TODO: option to select locale for printing
    json = nil
    Progress.as_percent(0, 0.5) do
      opts['for_pdf'] = true
      if opts['packet']
        json = to_external_nested(board, opts)
      else
        json = to_external(board, opts)
      end
    end
    res = nil
    Progress.as_percent(0.5, 1.0) do
      res = OBF::External.to_pdf(json, dest_path, opts)
    end
    return res
  end
  
  def self.to_png(board, dest_path)
    json = to_external(board, {})
    OBF::External.to_png(json, dest_path)
  end
end