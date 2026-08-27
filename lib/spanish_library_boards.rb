# Creates Spanish library boards on the lingolinq content account by copying
# English vocabulary sets and translating in place (preserving image_id).
class SpanishLibraryBoards
  SOURCE_LANG = 'en'
  DEST_LANG = 'es'

  def self.provision_all!(force: false)
    owner = SystemBoardSources.owner
    raise "System board owner #{SystemBoardSources::USER_NAME} not found" unless owner

    SystemBoardSources::SPANISH_SOURCE_MAP.each do |dest_slug, source_slug|
      provision_one!(owner, source_slug: source_slug, dest_slug: dest_slug, force: force)
    end
  end

  def self.provision_one!(owner, source_slug:, dest_slug:, force: false)
    source = Board.find_by_path(SystemBoardSources.board_key(source_slug))
    unless source&.public?
      Rails.logger.warn("[SpanishLibraryBoards] Missing or non-public source: #{source_slug}")
      return nil
    end

    dest_key = SystemBoardSources.board_key(dest_slug)
    board = Board.find_by_path(dest_key)
    if board && !force
      Rails.logger.info("[SpanishLibraryBoards] Skip #{dest_key} — already exists")
      return board
    end

    if board && force
      board.destroy
      board = nil
    end

    board ||= source.copy_for(owner, copier: owner)
    board.key = dest_key
    board.public = true
    board.settings['locale'] = SOURCE_LANG
    board.settings['name'] ||= source.settings['name']
    board.save!

    board_ids = translation_board_ids(board)
    translations = build_translation_map(board, board_ids)
    lang_label = Board.translation_language_label(DEST_LANG)
    if translations[board.settings['name']]
      translated_name = translations[board.settings['name']]
      unless translated_name.match(/\(\s*#{Regexp.escape(lang_label)}/i)
        translations[board.settings['name']] = "#{translated_name} (#{lang_label})"
      end
    end

    board.translate_set(translations, {
      'source' => SOURCE_LANG,
      'dest' => DEST_LANG,
      'board_ids' => board_ids,
      'default' => true,
      'user_key' => "user:#{owner.global_id}",
      'user_local_id' => owner.id,
      'allow_fallbacks' => false,
      'force_update_default' => true,
      'visited_board_ids' => []
    })
    owner.update_available_boards if owner.respond_to?(:update_available_boards)
    board.reload
    board
  end

  def self.translation_board_ids(root)
    ids = [root.global_id]
    (root.downstream_board_ids || []).each do |id|
      ids << id
    end
    ids.uniq
  end

  def self.build_translation_map(root, board_ids)
    words = []
    Board.find_all_by_path(board_ids).each do |brd|
      words << brd.settings['name'] if brd.settings['name'].present?
      brd.buttons.each do |btn|
        words << btn['label'] if btn['label'].present?
        # Action vocalizations (':space', '+q', ...) are control protocols.
        # Translating the token breaks keyboard / prediction buttons.
        if btn['vocalization'].present? && btn['vocalization'] != btn['label'] && !btn['vocalization'].to_s.match(/^[:+]/)
          words << btn['vocalization']
        end
      end
    end
    words.uniq!
    batch = words.map { |w| { text: w } }
    res = WordData.translate_batch(batch, SOURCE_LANG, DEST_LANG)
    res[:translations] || {}
  end
end
