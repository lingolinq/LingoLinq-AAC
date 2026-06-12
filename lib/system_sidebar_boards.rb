# Ensures public utility boards used in default sidebars exist on the content account.
class SystemSidebarBoards
  UTILITIES = [
    {slug: 'keyboard', legacy_source: 'example/keyboard', generator: :generate_keyboard},
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

  def self.repair_utility_board(board, spec)
    if spec[:slug] == 'keyboard' && board.settings['locale'] != 'en'
      board.settings['locale'] = 'en'
      board.save!
    end
    board
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
