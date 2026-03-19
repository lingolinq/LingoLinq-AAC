# frozen_string_literal: true

# OBF spec compliance: use ext_lingolinq_ prefix for custom attributes.
# Patches OBF gem to avoid validator warnings for background and image.protected.
# Must be required after 'obf' gem is loaded.
# Set OBF_LINGOLINQ_PATCH=0 to disable (use original OBF gem) if zip validation fails.
if !defined?(OBF::External::LingoLinqPatched) &&
   !ENV['OBF_LINGOLINQ_PATCH'].to_s.match(/\A(0|false|no|off)\z/i)

  require 'obf'

  module OBF
    module External
      module LingoLinqPatch
        def self.to_obf(hash, dest_path, path_hash = nil, to_include = nil)
          to_include ||= { images: true, sounds: true }
          if hash['boards']
            old_hash = hash
            hash = old_hash['boards'][0]
            hash['images'] = old_hash['images'] || []
            hash['sounds'] = old_hash['sounds'] || []
            path_hash = nil
          end

          res = ::OBF::Utils.obf_shell
          res['id'] = hash['id']
          res['locale'] = hash['locale'] || 'en'
          res['format'] = ::OBF::OBF::FORMAT
          res['name'] = hash['name']
          res['default_layout'] = hash['default_layout'] || 'landscape'
          # OBF spec: use ext_lingolinq_background, don't set background when nil
          res['background'] = hash['background'] if hash['background']
          res['url'] = hash['url']
          res['data_url'] = hash['data_url']
          ::OBF::Utils.log("compressing board #{res['name'] || res['id']}")

        res['default_locale'] = hash['default_locale'] if hash['default_locale']
        res['label_locale'] = hash['label_locale'] if hash['label_locale']
        res['vocalization_locale'] = hash['vocalization_locale'] if hash['vocalization_locale']

        res['description_html'] = hash['description_html']
        res['protected_content_user_identifier'] = hash['protected_content_user_identifier'] if hash['protected_content_user_identifier']
        res['license'] = ::OBF::Utils.parse_license(hash['license'])
        hash.each do |key, val|
          if key && key.match(/^ext_/)
            res[key] = val
          end
        end
        grid = []

        images = []
        sounds = []

        res['buttons'] = []
        buttons = hash['buttons']
        button_count = buttons.length

        ::OBF::Utils.as_progress_percent(0.0, 0.3) do
          buttons.each_with_index do |original_button, idx|
            button = {
              'id' => original_button['id'],
              'label' => original_button['label'],
              'vocalization' => original_button['vocalization'],
              'action' => original_button['action'],
              'actions' => original_button['actions'],
              'left' => original_button['left'],
              'top' => original_button['top'],
              'width' => original_button['width'],
              'height' => original_button['height'],
              'border_color' => ::OBF::Utils.fix_color(original_button['border_color'] || '#aaa', 'rgb'),
              'background_color' => ::OBF::Utils.fix_color(original_button['background_color'] || '#fff', 'rgb')
            }
            if original_button['load_board']
              button['load_board'] = {
                'id' => original_button['load_board']['id'],
                'url' => original_button['load_board']['url'],
                'data_url' => original_button['load_board']['data_url']
              }
              if path_hash && path_hash['included_boards'] && path_hash['included_boards'][original_button['load_board']['id']]
                button['load_board']['path'] = "board_#{original_button['load_board']['id']}.obf"
              end
            end
            if original_button['translations']
              original_button['translations'].each do |loc, h|
                next unless h.is_a?(Hash)
                button['translations'] ||= {}
                button['translations'][loc] ||= {}
                button['translations'][loc]['label'] = h['label'].to_s if h['label']
                button['translations'][loc]['vocalization'] = h['vocalization'].to_s if h['vocalization']
                (h['inflections'] || {}).each do |k, v|
                  if k.match(/^ext_/)
                    button['translations'][loc]['inflections'] ||= {}
                    button['translations'][loc]['inflections'][k] = v
                  else
                    button['translations'][loc]['inflections'] ||= {}
                    button['translations'][loc]['inflections'][k] = v.to_s
                  end
                end
                h.keys.each do |k|
                  button['translations'][loc][k] = h[k] if k.to_s.match(/^ext_/)
                end
              end
            end
            if original_button['hidden']
              button['hidden'] = original_button['hidden']
            end
            if original_button['url']
              button['url'] = original_button['url']
            end
            original_button.each do |k, val|
              if k.match(/^ext_/)
                button[k] = val
              end
            end

            if original_button['image_id'] && hash['images']
              image = hash['images'].detect { |i| i['id'] == original_button['image_id'] }
              if image
                images << image
                button['image_id'] = image['id']
              end
            end
            if original_button['sound_id']
              sound = hash['sounds'].detect { |s| s['id'] == original_button['sound_id'] }
              if sound
                sounds << sound
                button['sound_id'] = sound['id']
              end
            end
            res['buttons'] << trim_empties(button)
            ::OBF::Utils.update_current_progress(idx.to_f / button_count.to_f, "generated button #{button['id']} for #{res['id']}")
          end
        end

        ::OBF::Utils.update_current_progress(0.35, "images for board #{res['id']}")

        if to_include[:images]
          hydra = ::OBF::Utils.hydra
          grabs = []
          images.each do |img|
            if path_hash && path_hash['images'] && path_hash['images'][img['id']]
            elsif img['url'] && !img['data']
              got_url = ::OBF::Utils.get_url(img['url'].to_s, true)
              if got_url['request']
                hydra.queue(got_url['request'])
                grabs << { req: got_url['request'], img: img, res: got_url }
              end
            end
          end
          ::OBF::Utils.log("  batch-retrieving #{grabs.length} images for board #{res['name'] || res['id']}")
          hydra.run

          grabs.each do |grab|
            if grab[:res] && grab[:res]['data']
              str = 'data:' + grab[:res]['content_type']
              str += ';base64,' + Base64.strict_encode64(grab[:res]['data'])
              grab[:img]['data'] = str
              grab[:img]['content_type'] ||= grab[:res]['content_type']
            end
          end

          images.each do |original_image|
            image = build_image_for_obf(original_image, path_hash)
            res['images'] << trim_empties(image)
          end
        elsif to_include[:image_urls]
          images.each do |original_image|
            image = build_image_for_obf(original_image, nil)
            res['images'] << trim_empties(image)
          end
        end

        ::OBF::Utils.update_current_progress(0.75, "sounds for board #{res['id']}")
        if to_include[:sounds]
          sounds.each do |original_sound|
            sound = build_sound_for_obf(original_sound, path_hash)
            res['sounds'] << trim_empties(sound)
          end
        elsif to_include[:sound_urls]
          sounds.each do |original_sound|
            sound = build_sound_for_obf(original_sound, nil)
            res['sounds'] << trim_empties(sound)
          end
        end

        ::OBF::Utils.update_current_progress(0.85, "grid for board #{res['id']}")

        res['grid'] = ::OBF::Utils.parse_grid(hash['grid'])
        json_str = JSON.pretty_generate(res)
        json_str = json_str.encode('UTF-8', invalid: :replace, undef: :replace) unless json_str.encoding == Encoding::UTF_8 && json_str.valid_encoding?
        JSON.parse(json_str) # verify round-trip before writing
        if path_hash && path_hash['zip']
          zip_path = "board_#{res['id']}.obf"
          path_hash['boards'] ||= {}
          path_hash['boards'][res['id']] = { 'path' => zip_path }
          path_hash['zip'].add(zip_path, json_str)
        else
          File.open(dest_path, 'w:UTF-8') { |f| f.write(json_str) }
        end
        ::OBF::Utils.log("  done compressing board #{res['name'] || res['id']}")
        ::OBF::Utils.update_current_progress(1.0, "done for board #{res['id']}")
        dest_path
      end

      def self.build_image_for_obf(original_image, path_hash)
        # OBF spec: use ext_lingolinq_protected prefix for custom attributes
        image = {
          'id' => original_image['id'],
          'width' => original_image['width'],
          'height' => original_image['height'],
          'license' => ::OBF::Utils.parse_license(original_image['license']),
          'url' => original_image['url'],
          'data' => original_image['data'],
          'data_url' => original_image['data_url'],
          'content_type' => original_image['content_type']
        }
        if original_image.key?('ext_lingolinq_protected')
          image['ext_lingolinq_protected'] = original_image['ext_lingolinq_protected']
        else
          image['ext_lingolinq_protected'] = original_image['protected']
        end
        if original_image.key?('ext_lingolinq_protected_source')
          image['ext_lingolinq_protected_source'] = original_image['ext_lingolinq_protected_source']
        else
          image['ext_lingolinq_protected_source'] = original_image['protected_source']
        end
        original_image.each { |k, v| image[k] = v if k.to_s.match(/^ext_/) }
        image.delete('protected')
        image.delete('protected_source')
        if !path_hash
          image['data'] ||= ::OBF::Utils.image_base64(image['url']) if image['url']
          if image['data'] && (!image['content_type'] || !image['width'] || !image['height'])
            attrs = ::OBF::Utils.image_attrs(image['data'])
            image['content_type'] ||= attrs['content_type']
            image['width'] ||= attrs['width']
            image['height'] ||= attrs['height']
          end
        else
          if path_hash['images'] && path_hash['images'][image['id']]
            image['path'] = path_hash['images'][image['id']]['path']
            image['content_type'] ||= path_hash['images'][image['id']]['content_type']
            image['width'] ||= path_hash['images'][image['id']]['width']
            image['height'] ||= path_hash['images'][image['id']]['height']
          else
            image_fetch = ::OBF::Utils.image_raw(image['data'] || image['url'])
            if image_fetch && image_fetch['data']
              if !image['content_type'] || !image['width'] || !image['height']
                attrs = ::OBF::Utils.image_attrs(image_fetch['data'])
                image['content_type'] ||= image_fetch['content_type'] || attrs['content_type']
                image['width'] ||= attrs['width']
                image['height'] ||= attrs['height']
              end
              zip_path = "images/image_#{image['id']}#{image_fetch['extension']}"
              path_hash['images'] ||= {}
              path_hash['images'][image['id']] = {
                'path' => zip_path,
                'content_type' => image['content_type'],
                'width' => image['width'],
                'height' => image['height']
              }
              path_hash['zip'].add(zip_path, image_fetch['data'])
              image['path'] = zip_path
              image.delete('data')
            end
          end
        end
        image
      end

      def self.build_sound_for_obf(original_sound, path_hash)
        # OBF spec: use ext_lingolinq_protected prefix for custom attributes
        sound = {
          'id' => original_sound['id'],
          'duration' => original_sound['duration'],
          'license' => ::OBF::Utils.parse_license(original_sound['license']),
          'url' => original_sound['url'],
          'data' => original_sound['data'],
          'data_url' => original_sound['data_url'],
          'content_type' => original_sound['content_type']
        }
        sound['ext_lingolinq_protected'] =
          if original_sound.key?('ext_lingolinq_protected')
            original_sound['ext_lingolinq_protected']
          else
            original_sound['protected']
          end
        sound['ext_lingolinq_protected_source'] =
          if original_sound.key?('ext_lingolinq_protected_source')
            original_sound['ext_lingolinq_protected_source']
          else
            original_sound['protected_source']
          end
        original_sound.each { |k, v| sound[k] = v if k.to_s.match(/^ext_/) }
        sound.delete('protected')
        sound.delete('protected_source')
        if !path_hash
          sound['data'] = ::OBF::Utils.sound_base64(sound['url']) if sound['url']
        else
          if path_hash['sounds'] && path_hash['sounds'][sound['id']]
            sound['path'] = path_hash['sounds'][sound['id']]['path']
          else
            sound_fetch = ::OBF::Utils.sound_raw(sound['url'] || sound['data'])
            if sound_fetch
              zip_path = "sounds/sound_#{sound['id']}#{sound_fetch['extension']}"
              path_hash['sounds'] ||= {}
              path_hash['sounds'][sound['id']] = { 'path' => zip_path }
              path_hash['zip'].add(zip_path, sound_fetch['data'])
              sound['path'] = zip_path
            end
          end
        end
        sound
      end

      def self.trim_empties(hash)
        new_hash = {}
        hash.each do |key, val|
          new_hash[key] = val if val != nil
        end
        new_hash
      end
    end

    class << self
      alias_method :to_obf_original, :to_obf

      def to_obf(hash, dest_path, path_hash = nil, to_include = nil)
        LingoLinqPatch.to_obf(hash, dest_path, path_hash, to_include)
      end

      def trim_empties(hash)
        LingoLinqPatch.trim_empties(hash)
      end
    end

    LingoLinqPatched = true
  end
end

end
