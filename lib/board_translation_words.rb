# Collects translatable strings from a board tree.
# Action vocalizations (':space', '+q', ':shift', ':suggestion', ...) are
# control protocols, not words — they must never be sent to Google or stored
# as translations.
module BoardTranslationWords
  ACTION_VOCALIZATION = /^[:+]/.freeze
  # Spelling keys compose a letter (`+e`, `+3`). Google treats the visible
  # label as a word or abbreviation (e→mi, g→gramo, n→norte).
  LETTER_COMPOSE = /\A\+[a-z0-9]\z/i.freeze

  def self.letter_compose_key?(btn)
    btn && btn['vocalization'].to_s.match?(LETTER_COMPOSE)
  end

  # Full linked set, not only settings['downstream_board_ids']. That cache is
  # the async track_downstream_boards! closure and can be empty while
  # load_board links (and immediately_downstream_board_ids) still point at
  # children. translate_set also skips any board not listed in board_ids.
  def self.board_ids(root)
    owner_id = root.user_id
    seen = { root.global_id => true }
    ids = [root.global_id]
    queue = [root]
    while (board = queue.shift)
      pending = child_ids_for(board).reject { |cid| seen[cid] }
      next if pending.empty?

      pending.each { |cid| seen[cid] = true }
      Board.find_all_by_global_id(pending).each do |child|
        next unless child.user_id == owner_id

        ids << child.global_id
        queue << child
      end
    end
    ids
  end

  def self.child_ids_for(board)
    ids = []
    if board.respond_to?(:get_immediately_downstream_board_ids)
      ids += board.get_immediately_downstream_board_ids
    end
    settings = board.settings || {}
    ids += Array(settings['immediately_downstream_board_ids'])
    ids += Array(settings['downstream_board_ids'])
    board.buttons.each do |btn|
      lb = btn['load_board']
      next unless lb.is_a?(Hash) && lb['id'].present?
      next if lb['id'] == board.global_id

      ids << lb['id']
    end
    ids.uniq
  end

  def self.collect_entries(board_ids)
    entries = []
    Board.find_all_by_path(board_ids).each do |brd|
      name = brd.settings && brd.settings['name']
      if name.present?
        entries << { board_key: brd.key, button_id: '', field: 'name', en: name }
      end
      brd.buttons.each do |btn|
        label = btn['label']
        if label.present?
          entries << {
            board_key: brd.key,
            button_id: btn['id'].to_s,
            field: 'label',
            en: label,
            identity: letter_compose_key?(btn)
          }
        end
        voc = btn['vocalization']
        next unless voc.present? && voc != label && !voc.to_s.match(ACTION_VOCALIZATION)

        entries << { board_key: brd.key, button_id: btn['id'].to_s, field: 'vocalization', en: voc }
      end
    end
    entries
  end

  def self.collect_words(board_ids)
    collect_entries(board_ids).reject { |e| e[:identity] }.map { |e| e[:en] }.uniq
  end

  # Keep graphemes as themselves so a re-run overwrites bad Google dest hashes.
  def self.apply_identities(translations, origins, entries)
    translations ||= {}
    origins ||= {}
    entries.each do |e|
      next unless e[:identity] && e[:en].present?

      translations[e[:en]] = e[:en]
      origins[e[:en]] = 'identity'
    end
    translations
  end
end
