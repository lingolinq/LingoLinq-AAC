# frozen_string_literal: true

# Import a JSON bundle exported from CoughDrop/LingoLinq API responses
# ({ root, boards: [{ key, data: { board, images, sounds } }] }).
module Converters::ApiJsonBundle
  MAX_BOARDS = 500
  MAX_BUNDLE_BYTES = 50 * 1024 * 1024

  # JSON.parse and synthesized media entries use string keys; always resolve ids safely.
  def self.media_entry_id(item)
    return nil unless item.is_a?(Hash)

    item.with_indifferent_access[:id].presence&.to_s
  end

  def self.load_bundle(source, allowed_importer_global_id: nil)
    case source
    when Hash
      source.with_indifferent_access
    when String
      if source.match?(%r{\Ahttps?://}i)
        download_json_bundle(source, allowed_importer_global_id: allowed_importer_global_id)
      elsif File.exist?(source)
        size = File.size(source)
        if size > MAX_BUNDLE_BYTES
          raise Progress::ProgressError, "bundle exceeds maximum size (#{MAX_BUNDLE_BYTES} bytes)"
        end
        parse_local_bundle(File.read(source))
      else
        parse_local_bundle(source)
      end
    else
      raise Progress::ProgressError, "invalid bundle source"
    end
  end

  def self.download_json_bundle(url, allowed_importer_global_id: nil)
    sanitized = Uploader.sanitize_url(url)
    raise Progress::ProgressError, "invalid bundle URL" unless sanitized

    if allowed_importer_global_id.present?
      unless Uploader.valid_import_bundle_url?(sanitized, allowed_importer_global_id)
        raise Progress::ProgressError, "invalid import bundle URL"
      end
    end

    fetch_url = Uploader.signed_internal_url(sanitized).presence || sanitized
    raise Progress::ProgressError, "invalid bundle URL" unless fetch_url.present?

    head = SafeHttp.head(fetch_url)
    if head.success?
      len = response_content_length(head)
      if len && len > MAX_BUNDLE_BYTES
        raise Progress::ProgressError, "bundle exceeds maximum size (#{MAX_BUNDLE_BYTES} bytes)"
      end
    end

    response = SafeHttp.get(fetch_url)
    raise Progress::ProgressError, "failed to download bundle (#{response.code})" unless response.success?

    body = response.body.to_s
    if body.bytesize > MAX_BUNDLE_BYTES
      raise Progress::ProgressError, "bundle exceeds maximum size (#{MAX_BUNDLE_BYTES} bytes)"
    end

    parse_local_bundle(body)
  end

  def self.parse_local_bundle(raw)
    raw = raw.to_s
    if raw.bytesize > MAX_BUNDLE_BYTES
      raise Progress::ProgressError, "bundle exceeds maximum size (#{MAX_BUNDLE_BYTES} bytes)"
    end
    unless raw.lstrip.start_with?('{', '[')
      raise Progress::ProgressError, "bundle is not valid JSON"
    end

    JSON.parse(raw)
  rescue JSON::ParserError
    raise Progress::ProgressError, "bundle is not valid JSON"
  end

  def self.response_content_length(response)
    raw = response.headers && (response.headers['Content-Length'] || response.headers['content-length'])
    return nil if raw.blank?

    len = raw.to_i
    len.positive? ? len : nil
  end

  def self.validate!(bundle)
    bundle = bundle.with_indifferent_access
    entries = bundle[:boards]
    raise Progress::ProgressError, "bundle missing boards array" unless entries.is_a?(Array) && entries.any?
    raise Progress::ProgressError, "bundle exceeds #{MAX_BOARDS} boards" if entries.length > MAX_BOARDS

    entries.each do |entry|
      payload = entry_payload(entry.with_indifferent_access)
      raise Progress::ProgressError, "each bundle entry needs a board id" unless payload[:board][:id].present?
    end
    bundle
  end

  def self.missing_link_keys(bundle)
    bundle = bundle.with_indifferent_access
    keys = (bundle[:boards] || []).filter_map { |entry| entry[:key].to_s.presence }.to_set
    missing = Set.new

    (bundle[:boards] || []).each do |entry|
      payload = entry_payload(entry.with_indifferent_access)
      (payload[:board][:buttons] || []).each do |btn|
        load_board = btn[:load_board] || btn['load_board']
        next unless load_board.is_a?(Hash)

        target_key = load_board[:key] || load_board['key']
        next if target_key.blank? || keys.include?(target_key.to_s)

        missing << target_key.to_s
      end
    end

    missing.to_a.sort
  end

  def self.import(bundle, user, opts = {})
    bundle = validate!(load_bundle(bundle))
    missing = missing_link_keys(bundle)
    if missing.any?
      Rails.logger.warn("[ApiJsonBundle] bundle missing #{missing.length} linked board(s): #{missing.first(10).join(', ')}")
    end
    content = build_nested_content(bundle)
    boards = Converters::LingoLinq.from_external_nested(content, {
      'user' => user,
      'boards' => {},
      'json_bundle_import' => true
    }.merge(opts.stringify_keys))
    finalize_imported_boards(boards, bundle[:root])
    boards
  end

  def self.build_nested_content(bundle)
    entries = order_entries(bundle[:boards] || [], bundle[:root])
    boards = []
    all_images = []
    all_sounds = []
    seen_images = {}
    seen_sounds = {}

    entries.each do |entry|
      payload = entry_payload(entry)
      source_key = entry[:key].presence || payload[:board][:key]
      obf = api_to_obf(payload, source_key: source_key)
      boards << obf

      (payload[:images] || []).each do |img|
        img_id = media_entry_id(img)
        next if img_id.blank? || seen_images[img_id]

        seen_images[img_id] = true
        all_images << img
      end
      (payload[:sounds] || []).each do |snd|
        snd_id = media_entry_id(snd)
        next if snd_id.blank? || seen_sounds[snd_id]

        seen_sounds[snd_id] = true
        all_sounds << snd
      end
    end

    {
      'boards' => boards,
      'images' => all_images,
      'sounds' => all_sounds
    }
  end

  def self.order_entries(entries, root_key)
    return entries unless root_key.present?

    root_entry = entries.find do |entry|
      key = entry[:key] || entry.dig(:data, :board, :key) || entry.dig(:board, :key)
      key.to_s == root_key.to_s
    end
    return entries unless root_entry

    [root_entry] + entries.reject { |entry| entry.equal?(root_entry) }
  end

  def self.entry_payload(entry)
    entry = entry.with_indifferent_access
    raw = entry[:data] || entry

    if raw[:board].present?
      board_wrapper = raw[:board]
      explicit_images = raw[:images]
      explicit_sounds = raw[:sounds]
    else
      board_wrapper = raw
      explicit_images = raw[:images]
      explicit_sounds = raw[:sounds]
    end

    inner_board = unwrap_board_record(board_wrapper)
    images, sounds = coalesce_media(board_wrapper, inner_board, explicit_images, explicit_sounds)

    {
      board: inner_board,
      images: images,
      sounds: sounds
    }
  end

  # API show responses use skip_subs/simple_refs: top-level images[] and sounds[]
  # are omitted, but board.image_urls / board.sound_urls still list every asset.
  def self.unwrap_board_record(board_field)
    board_field = board_field.with_indifferent_access
    nested = board_field[:board]
    if nested.is_a?(Hash) && board_field[:buttons].blank? && board_field[:grid].blank?
      nested.with_indifferent_access
    else
      board_field
    end
  end

  def self.coalesce_media(board_wrapper, inner_board, explicit_images, explicit_sounds)
    images = Array(explicit_images).select { |item| media_entry_id(item).present? }
    sounds = Array(explicit_sounds).select { |item| media_entry_id(item).present? }

    wrapper = board_wrapper.with_indifferent_access
    board = inner_board.with_indifferent_access
    buttons = board[:buttons] || wrapper[:buttons] || []
    image_urls = wrapper[:image_urls].presence || board[:image_urls].presence || {}
    sound_urls = wrapper[:sound_urls].presence || board[:sound_urls].presence || {}

    if images.empty?
      images = synthesize_images_from_urls(image_urls, buttons)
    else
      # API exports often include stub images[] (id only). Still prefer image_urls.
      images = fill_missing_media_urls(images, image_urls)
    end

    if sounds.empty?
      sounds = synthesize_sounds_from_urls(sound_urls, buttons)
    else
      # Same stub trap as images: non-empty sounds[] without urls used to skip
      # sound_urls synthesis, so rimshot/etc. never imported.
      sounds = fill_missing_media_urls(sounds, sound_urls)
      sounds = merge_media_entries(sounds, synthesize_sounds_from_urls(sound_urls, buttons))
    end

    images = images.map { |img| normalize_image(img.with_indifferent_access) }
    sounds = sounds.map { |snd| normalize_sound(snd.with_indifferent_access) }

    [images, sounds]
  end

  # When an export lists media stubs (id, no url), copy urls from board.*_urls.
  def self.fill_missing_media_urls(entries, url_map)
    return entries if url_map.blank?

    url_map = url_map.with_indifferent_access
    entries.map do |item|
      item = item.with_indifferent_access
      id = media_entry_id(item)
      next item if id.blank?
      next item if item[:url].present? || item[:data].present? || item[:data_url].present? || item[:skin_url].present?

      mapped = url_map[id]
      mapped.present? ? item.merge('url' => mapped) : item
    end
  end

  # Union by id; prefer the entry that already has a fetchable url/data.
  def self.merge_media_entries(primary, extra)
    by_id = {}
    (Array(primary) + Array(extra)).each do |item|
      id = media_entry_id(item)
      next if id.blank?

      item = item.with_indifferent_access
      existing = by_id[id]
      if existing.nil?
        by_id[id] = item
      elsif media_fetchable?(item) && !media_fetchable?(existing)
        by_id[id] = existing.merge(item)
      elsif media_fetchable?(item)
        by_id[id] = existing.merge(item) { |_k, old, new| old.presence || new }
      end
    end
    by_id.values
  end

  def self.media_fetchable?(item)
    item = item.with_indifferent_access
    item[:url].present? || item[:data].present? || item[:data_url].present? || item[:skin_url].present?
  end

  def self.synthesize_images_from_urls(image_urls, buttons)
    return [] if image_urls.blank?

    image_urls = image_urls.with_indifferent_access
    referenced_ids = (buttons || []).filter_map { |btn| btn[:image_id] || btn['image_id'] }.map(&:to_s).uniq
    candidate_ids = (referenced_ids + primary_image_url_keys(image_urls)).uniq

    candidate_ids.filter_map do |img_id|
      url = image_urls[img_id]
      next if url.blank?

      { 'id' => img_id, 'url' => url }
    end
  end

  def self.synthesize_sounds_from_urls(sound_urls, buttons)
    return [] if sound_urls.blank?

    sound_urls = sound_urls.with_indifferent_access
    referenced_ids = (buttons || []).filter_map { |btn| btn[:sound_id] || btn['sound_id'] }.map(&:to_s).uniq
    candidate_ids = (referenced_ids + sound_urls.keys.map(&:to_s)).uniq

    candidate_ids.filter_map do |snd_id|
      url = sound_urls[snd_id]
      next if url.blank?

      { 'id' => snd_id, 'url' => url }
    end
  end

  def self.primary_image_url_keys(image_urls)
    image_urls.keys.map(&:to_s).reject { |key| key.include?('-') }
  end

  def self.api_to_obf(payload, source_key: nil)
    board = payload[:board]
    raise Progress::ProgressError, "board entry missing id" unless board[:id].present?

    obj = {
      'id' => board[:id].to_s,
      'name' => board[:name].presence || 'Imported Board',
      'locale' => board[:locale].presence || 'en',
      'description_html' => board[:description],
      'grid' => board[:grid],
      'buttons' => normalize_buttons(board[:buttons] || []),
      'ext_lingolinq_image_url' => board[:image_url],
      'license' => board[:license],
      'ext_lingolinq_settings' => {
        'key' => source_key || board[:key],
        'private' => board[:public] == false || board[:visibility].to_s == 'private',
        'home_board' => board[:home_board],
        'categories' => board[:categories],
        'word_suggestions' => board[:word_suggestions],
        'text_only' => board[:text_only],
        'hide_empty' => board[:hide_empty]
        # Omit board[:protected] — CoughDrop marks boards that use premium symbols,
        # but that flag blocks cross-user import. JSON bundle migration creates new
        # boards for the importer; protected images are handled per-image instead.
      }.compact
    }

    if board[:background].present?
      obj['ext_lingolinq_background'] = normalize_background(board[:background])
    end

    images = payload[:images] || []
    sounds = payload[:sounds] || []
    obj['images_hash'] = images.each_with_object({}) do |img, memo|
      img_id = media_entry_id(img)
      next if img_id.blank?

      memo[img_id] = img
    end
    obj['sounds_hash'] = sounds.each_with_object({}) do |snd, memo|
      snd_id = media_entry_id(snd)
      next if snd_id.blank?

      memo[snd_id] = snd
    end
    obj
  end

  def self.normalize_buttons(buttons)
    buttons.filter_map do |btn|
      next unless btn.is_a?(Hash)

      normalized = btn.with_indifferent_access.dup
      normalized.keys.each do |key|
        key_s = key.to_s
        if key_s.start_with?('ext_coughdrop_')
          normalized[key_s.sub('ext_coughdrop_', 'ext_lingolinq_')] = normalized.delete(key)
        end
      end
      Converters::LingoLinq::EXT_PARAMS.each do |param|
        next if normalized["ext_lingolinq_#{param}"].present?

        normalized["ext_lingolinq_#{param}"] = normalized[param] if normalized[param].present?
      end
      if normalized[:load_board].is_a?(Hash)
        normalized[:load_board] = normalized[:load_board].slice(:id, :key, :url, :data_url).compact
      end
      normalized
    end
  end

  def self.normalize_background(background)
    bg = background.with_indifferent_access
    {
      'image_url' => bg[:image] || bg[:image_url],
      'ext_lingolinq_image_exclusion' => bg[:ext_lingolinq_image_exclusion] || bg[:ext_coughdrop_image_exclusion],
      'color' => bg[:color],
      'position' => bg[:position],
      'text' => bg[:text],
      'prompt_text' => bg[:prompt] || bg[:prompt_text],
      'delayed_prompts' => bg[:delay_prompts] || bg[:delayed_prompts],
      'delay_prompt_timeout' => bg[:delay_prompt_timeout]
    }.compact
  end

  def self.normalize_image(image)
    img = image.with_indifferent_access
    url = encode_import_url(img[:url] || img[:skin_url])
    {
      'id' => img[:id].to_s,
      'url' => url,
      'width' => img[:width],
      'height' => img[:height],
      'content_type' => img[:content_type],
      'license' => img[:license],
      'protected' => img[:protected],
      'protected_source' => img[:protected_source]
    }.compact
  end

  def self.encode_import_url(url)
    return nil if url.blank?

    uri = Uploader.parse_http_uri(url.to_s)
    return url.to_s unless uri

    port_suffix = ''
    if (uri.scheme == 'http' && uri.port != 80) || (uri.scheme == 'https' && uri.port != 443)
      port_suffix = ":#{uri.port}"
    end
    "#{uri.scheme}://#{uri.host}#{port_suffix}#{uri.path}#{uri.query ? "?#{uri.query}" : ''}"
  end

  def self.normalize_sound(sound)
    snd = sound.with_indifferent_access
    raw_url = snd[:url].presence
    data_url = snd[:data_url].presence || snd[:data].presence

    # Prefer a direct media URL. API data_urls (/api/v1/sounds/…) need auth and
    # are not usable by SafeHttp during import — keep only data: URIs from that field.
    if raw_url.blank? && data_url.present?
      if data_url.to_s.match?(/\Adata:/i)
        # handled below as 'data'
      elsif data_url.to_s.match?(%r{\Ahttps?://}i) && !data_url.to_s.match?(%r{/api/v\d+/sounds/}i)
        raw_url = data_url
      end
    end

    normalized = {
      'id' => snd[:id].to_s,
      'url' => encode_import_url(raw_url),
      'duration' => snd[:duration],
      'content_type' => snd[:content_type],
      'license' => snd[:license],
      'protected' => snd[:protected],
      'protected_source' => snd[:protected_source]
    }.compact
    if data_url.to_s.match?(/\Adata:/i)
      normalized['data'] = data_url
    end
    normalized
  end

  def self.finalize_imported_boards(boards, root_key = nil)
    return [] if boards.blank?

    root = if root_key.present?
      boards.find { |b| b.key == root_key } || boards[0]
    else
      boards[0]
    end
    ordered = [root] + boards.reject { |b| b == root }

    ordered.each do |board|
      board.settings['copy_id'] = root.global_id
      board.save
    end

    root.reload
    root.instance_variable_set(:@buttons_changed, 'import')
    root.instance_variable_set(:@brand_new, true)
    root.generate_stats
    root.save!

    ordered[1..].each do |board|
      board.generate_stats
      board.save_without_post_processing
    end

    ordered
  end
end
