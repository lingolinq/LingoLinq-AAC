# Ensures public utility boards used in default sidebars exist on the content account.
class SystemSidebarBoards
  SYSTEM_BOARDS_DIR = Rails.root.join('public/system-boards').freeze

  # keyboard is sourced from the committed Vocal Flair keyboard OBZ (a copy of the
  # Vocal Flair board's keyboard), not the legacy example/keyboard or the plain
  # programmatic KeyboardBoard generator. obz_source takes precedence; the legacy
  # copy and generator remain as fallbacks if the committed file is ever missing.
  UTILITIES = [
    {slug: 'keyboard', obz_source: 'keyboard.obz', legacy_source: 'example/keyboard', generator: :generate_keyboard},
    {slug: 'inflections', legacy_source: 'example/inflections', generator: :generate_inflections}
  ].freeze

  def self.ensure_for(user)
    return [] unless user

    UTILITIES.map do |spec|
      ensure_utility_board(user, spec)
    end.compact
  end

  def self.ensure_utility_board(user, spec)
    existing = Board.find_by_path("#{user.user_name}/#{spec[:slug]}") ||
      Board.find_by(key: spec[:slug], user_id: user.id)
    return repair_utility_board(existing, spec) if existing

    if spec[:obz_source]
      board = import_obz_utility(user, spec)
      # Normalize via the same repair pass the existing-board path uses (e.g.
      # the keyboard OBF ships locale 'en_US'; the utility contract is 'en'),
      # so a fresh import matches a re-run and stays idempotent.
      return repair_utility_board(board, spec) if board
    end

    legacy = Board.find_by_path(spec[:legacy_source])
    if legacy
      board = legacy.copy_for(user)
      board.public = true
      board.settings['name'] ||= spec[:slug].split(/-/).map(&:capitalize).join(' ')
      board.save!
      return board
    end

    send(spec[:generator], user)
  end

  # Imports a committed system-board OBZ (public/system-boards/<obz_source>) and
  # re-keys its root to <user>/<slug>. Mirrors SystemBoardSources.ensure_crisis_vocabulary!.
  # Returns nil (so callers fall back) when the file is missing or import yields nothing.
  def self.import_obz_utility(user, spec)
    path = SYSTEM_BOARDS_DIR.join(spec[:obz_source])
    unless File.exist?(path)
      Rails.logger.warn("[SystemSidebarBoards] Missing #{path} — falling back for #{spec[:slug]}")
      return nil
    end

    require Rails.root.join('lib', 'converters', 'lingo_linq')
    boards = Converters::LingoLinq.from_obz(path.to_s, 'user' => user, 'boards' => {})
    return nil if boards.blank?

    key = "#{user.user_name}/#{spec[:slug]}"
    root = boards.first
    boards.each_with_index do |board, idx|
      if idx.zero?
        board.public = true
        board.key = key if board.user_id == user.id
        board.settings['name'] ||= spec[:slug].split(/-/).map(&:capitalize).join(' ')
        board.settings['unlisted'] = false
      else
        board.public = true
        board.settings['unlisted'] = true
      end
      board.generate_stats
      board.save_without_post_processing
    end

    root.instance_variable_set(:@buttons_changed, 'import')
    root.instance_variable_set(:@brand_new, true)
    root.save!

    Board.find_by_path(key) || root
  rescue ActiveRecord::RecordNotUnique => e
    # A board already occupies <user>/<slug> (concurrent setup, or a partial
    # prior run). Finalize and return it rather than aborting, so sidebar setup
    # stays idempotent and callers never receive a half-published board.
    Rails.logger.warn("[SystemSidebarBoards] re-key collided on #{key} (#{e.message}); returning existing board")
    existing = Board.find_by_path(key)
    if existing
      existing.public = true
      existing.settings['unlisted'] = false
      existing.generate_stats
      existing.save_without_post_processing
      return repair_utility_board(existing, spec)
    end
    existing
  end

  def self.repair_utility_board(board, spec)
    changed = false
    if spec[:slug] == 'keyboard' && board.settings['locale'] != 'en'
      board.settings['locale'] = 'en'
      changed = true
    end
    if spec[:slug] == 'keyboard' && spec[:obz_source]
      changed = true if restore_keyboard_control_vocalizations!(board, spec)
    end
    board.save! if changed
    board
  end

  # System keyboards imported from Vocal Flair-style OBZ files can lose
  # `:shift` / `:space` / `+letter` if a later save drops vocalization.
  # Re-running ensure_for used to no-op on an existing board. Copy the
  # control protocol back from the committed OBZ when the live button
  # has no vocalization (or only repeats the visible label).
  def self.restore_keyboard_control_vocalizations!(board, spec)
    path = SYSTEM_BOARDS_DIR.join(spec[:obz_source])
    return false unless File.exist?(path)
    return false unless keyboard_control_vocalizations_missing?(board)

    require 'obf'
    require Rails.root.join('lib', 'converters', 'lingo_linq')
    content = OBF::External.from_obz(path.to_s, {})
    source_buttons = Array(content.dig('boards', 0, 'buttons'))
    source_by_id = source_buttons.index_by { |b| b['id'].to_s }
    buttons = board.buttons.map { |b| b.dup }
    changed = false
    buttons.each do |button|
      source = source_by_id[button['id'].to_s]
      next unless source
      control = Converters::LingoLinq.vocalization_from_obf_button(source)
      next unless control.to_s.match?(/\A[:+]/)
      current = button['vocalization'].to_s
      next unless current.blank? || current == button['label'].to_s
      button['vocalization'] = control
      changed = true
    end
    return false unless changed

    board.settings['buttons'] = buttons
    board.instance_variable_set('@buttons_changed', 'restored keyboard controls')
    true
  end

  def self.keyboard_control_vocalizations_missing?(board)
    (board.buttons || []).any? do |button|
      label = button['label'].to_s
      next false unless label.match?(/\A(shift|space|[a-z0-9]|[:.])\z/i)
      current = button['vocalization'].to_s
      current.blank? || current == label
    end
  end

  def self.generate_keyboard(user)
    require Rails.root.join('lib', 'templates', 'keyboard_board')
    KeyboardBoard.generate(user)
  end

  def self.generate_inflections(user)
    require Rails.root.join('lib', 'templates', 'inflections_board')
    InflectionsBoard.generate(user)
  end
end
