# frozen_string_literal: true

require 'nokogiri'

module Converters
  ##
  # Converts LingoLinq board HTML (from the speak/edit view) into board params
  # suitable for Board.process_new. Enables creating boards by pasting HTML
  # from an existing board.
  #
  # HTML structure expected:
  # - .board container with .button_row containing .button elements
  # - Each .button has: data-id, .button-label, img[src] for symbol, audio[src/rel] for sound, b_rgb_* classes for colors
  # - action_container.talk vs action_container.folder for button type
  # - link_disabled class for disabled folder buttons
  #
  module HtmlBoard
    class << self
      ##
      # Parse HTML and create a new board for the given user.
      # Returns the created Board or nil on failure.
      #
      # @param html [String] Board HTML from LingoLinq speak/edit view
      # @param user [User] Owner of the new board
      # @param opts [Hash] Additional options
      # @option opts [String] :name Board name (default: "Imported Board")
      # @option opts [String] :key Board key (optional, will be generated if not provided)
      # @option opts [String] :locale Board locale (default: "en")
      # @return [Board, nil]
      def create_from_html(html, user, opts = {})
        params = from_html(html, user, opts)
        return nil unless params

        board_params = opts.slice(:name, :key, :locale).stringify_keys.merge(params)
        board_params['name'] = board_params['name'].presence || opts[:name] || 'Imported Board'
        board_params['locale'] = board_params['locale'].presence || opts[:locale] || 'en'

        board_opts = { user: user, author: user }
        board_opts[:key] = board_params.delete('key') if board_params['key'].present?

        Board.process_new(board_params, board_opts)
      end

      ##
      # Parse HTML and return board params (buttons, grid) without creating the board.
      # Caller can merge with name/key and pass to Board.process_new.
      #
      # @param html [String] Board HTML
      # @param user [User] User for creating ButtonImage records from URLs
      # @param opts [Hash] Options (unused for now)
      # @return [Hash, nil] { buttons: [...], grid: {...} } or nil if parse failed
      def from_html(html, user, _opts = {})
        return nil if html.blank?

        doc = Nokogiri::HTML(html)
        button_elements = doc.css('.button_row .button, .button_row a.button, .board a.button')
        return nil if button_elements.empty?

        # Cache URL -> image_id and URL -> sound_id to avoid duplicate records
        image_url_cache = {}
        sound_url_cache = {}

        # Build button data and grid from DOM order (button_row preserves row order)
        buttons_by_id = {}
        grid_rows = []
        button_id_counter = 1

        # Group by rows using the structure: each .button_row contains buttons
        doc.css('.button_row').each do |row_el|
          row_buttons = row_el.css('.button, a.button')
          row_ids = []

          row_buttons.each do |btn_el|
            parsed = parse_button_element(btn_el, user, button_id_counter, image_url_cache, sound_url_cache)
            next unless parsed

            id = parsed['id']
            buttons_by_id[id] = parsed
            row_ids << id
            button_id_counter = [button_id_counter, id.to_i + 1].max
          end

          grid_rows << row_ids if row_ids.any?
        end

        # Fallback: if no button_row structure, derive rows from position
        if grid_rows.empty?
          buttons_with_pos = []
          button_elements.each do |btn_el|
            parsed = parse_button_element(btn_el, user, button_id_counter, image_url_cache, sound_url_cache)
            next unless parsed

            id = parsed['id']
            style = btn_el['style'].to_s
            top = style.match(/top:\s*([\d.]+)/)&.[](1)&.to_f || 0
            left = style.match(/left:\s*([\d.]+)/)&.[](1)&.to_f || 0
            buttons_with_pos << parsed.merge('_top' => top, '_left' => left)
            button_id_counter = [button_id_counter, id.to_i + 1].max
          end

          # Group by similar top position (same row)
          buttons_with_pos.sort_by! { |b| [b['_top'], b['_left']] }
          rows_hash = {}
          buttons_with_pos.each do |b|
            top_key = (b['_top'] / 50).floor * 50 # group within ~50px
            rows_hash[top_key] ||= []
            rows_hash[top_key] << b.except('_top', '_left')
          end

          grid_rows = rows_hash.keys.sort.map { |k| rows_hash[k].map { |b| b['id'] } }
          buttons_by_id = buttons_with_pos.each_with_object({}) do |b, h|
            b2 = b.except('_top', '_left')
            h[b2['id']] = b2
          end
        end

        return nil if buttons_by_id.empty?

        buttons = grid_rows.flatten.uniq.map { |id| buttons_by_id[id] }.compact
        rows = grid_rows.length
        cols = grid_rows.map(&:length).max || 1

        {
          'buttons' => buttons,
          'grid' => {
            'rows' => rows,
            'columns' => cols,
            'order' => grid_rows
          }
        }
      end

      private

      def parse_button_element(btn_el, user, default_id, image_url_cache = {}, sound_url_cache = {})
        label_el = btn_el.at_css('.button-label')
        label = label_el&.text&.strip.presence || ''

        img_el = btn_el.at_css('img.symbol, img[src*="cloudfront"], img[rel]')
        image_url = img_el && (img_el['src'].present? ? img_el['src'] : img_el['rel'])
        image_url = image_url&.strip
        image_url = nil if image_url.blank? || !image_url.match?(%r{^https?://})

        audio_el = btn_el.at_css('audio[src], audio[rel]')
        sound_url = audio_el && (audio_el['rel'].present? ? audio_el['rel'] : audio_el['src'])
        sound_url = sound_url&.strip
        sound_url = nil if sound_url.blank? || !sound_url.match?(%r{^https?://})

        # Parse colors from b_rgb_R__G__B___rgb_R2__G2__B2_ class
        bg_color = nil
        border_color = nil
        btn_el.classes.each do |cls|
          next unless cls.start_with?('b_rgb_')

          # Format: b_rgb_R__G__B___rgb_R2__G2__B2_ (border first, then background per keyify)
          m = cls.match(/b_rgb_(\d+)_+(\d+)_+(\d+)_+_*rgb_(\d+)_+(\d+)_+(\d+)/)
          if m
            border_color = "rgb(#{m[1]},#{m[2]},#{m[3]})"
            bg_color = "rgb(#{m[4]},#{m[5]},#{m[6]})"
            break
          end
        end

        # Button id from data-id or generate
        btn_id = btn_el['data-id'].presence || default_id
        btn_id = btn_id.to_i if btn_id.to_s.match?(/^\d+$/)

        # Type: folder vs talk
        is_folder = btn_el.at_css('.action_container.folder').present?
        link_disabled = btn_el.classes.include?('link_disabled')

        # Create ButtonImage from URL if we have one (cache by URL to avoid duplicates)
        image_id = nil
        if image_url.present?
          image_id = image_url_cache[image_url]
          unless image_id
            bi = create_button_image_from_url(image_url, label, user)
            image_id = bi&.global_id
            image_url_cache[image_url] = image_id if image_id
          end
        end

        # Create ButtonSound from URL if we have one (cache by URL to avoid duplicates)
        sound_id = nil
        if sound_url.present?
          sound_id = sound_url_cache[sound_url]
          unless sound_id
            bs = create_button_sound_from_url(sound_url, label, user)
            sound_id = bs&.global_id
            sound_url_cache[sound_url] = sound_id if sound_id
          end
        end

        # Folder buttons: HTML doesn't include target board, so create as talk buttons;
        # set link_disabled so they don't navigate; user can add load_board in edit mode
        h = {
          'id' => btn_id,
          'label' => label.presence,
          'vocalization' => label.presence,
          'image_id' => image_id,
          'sound_id' => sound_id,
          'background_color' => bg_color,
          'border_color' => border_color,
          'link_disabled' => link_disabled || is_folder
        }
        h.compact
      end

      def create_button_image_from_url(url, label, user)
        return nil if url.blank? || !url.match?(%r{^https?://})

        content_type = infer_content_type_from_url(url)
        ButtonImage.process_new(
          {
            'url' => url,
            'content_type' => content_type,
            'public' => true,
            'protected' => false,
            'button_label' => label.presence,
            'license' => {
              'type' => 'CC-Unspecified',
              'copyright_notice_url' => nil,
              'source_url' => url,
              'author_name' => nil,
              'author_url' => nil,
              'uneditable' => true
            }
          },
          { user: user, download: false }
        )
      rescue StandardError => e
        Rails.logger.warn("[HtmlBoard] Failed to create ButtonImage from #{url}: #{e.message}")
        nil
      end

      def create_button_sound_from_url(url, label, user)
        return nil if url.blank? || !url.match?(%r{^https?://})

        content_type = infer_audio_content_type_from_url(url)
        ButtonSound.process_new(
          {
            'url' => url,
            'content_type' => content_type,
            'public' => true,
            'protected' => false,
            'name' => label.presence || 'Sound',
            'license' => {
              'type' => 'CC-Unspecified',
              'copyright_notice_url' => nil,
              'source_url' => url,
              'author_name' => nil,
              'author_url' => nil,
              'uneditable' => true
            }
          },
          { user: user, download: false }
        )
      rescue StandardError => e
        Rails.logger.warn("[HtmlBoard] Failed to create ButtonSound from #{url}: #{e.message}")
        nil
      end

      def infer_content_type_from_url(url)
        ext = url.split(/[?#]/).first&.split(/\./)&.last&.downcase
        case ext
        when 'svg' then 'image/svg+xml'
        when 'jpg', 'jpeg' then 'image/jpeg'
        when 'gif' then 'image/gif'
        when 'webp' then 'image/webp'
        else 'image/png'
        end
      end

      def infer_audio_content_type_from_url(url)
        ext = url.split(/[?#]/).first&.split(/\./)&.last&.downcase
        case ext
        when 'mp3' then 'audio/mpeg'
        when 'wav' then 'audio/wav'
        when 'ogg' then 'audio/ogg'
        when 'weba' then 'audio/webm'
        when 'webm' then 'audio/webm'
        when 'm4a', 'mp4' then 'audio/mp4'
        else 'audio/mpeg'
        end
      end
    end
  end
end
