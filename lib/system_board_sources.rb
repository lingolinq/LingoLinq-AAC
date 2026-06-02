# Public/system vocabulary boards owned by the lingolinq content account.
module SystemBoardSources
  USER_NAME = ENV.fetch('SYSTEM_BOARD_USER_NAME', 'lingolinq').freeze
  CRISIS_VOCABULARY_SLUG = 'crisis-vocabulary'.freeze
  CRISIS_VOCABULARY_OBZ = Rails.root.join('public/system-boards/crisis-vocabulary.obz').freeze
  SIGNUP_LIBRARY_SLUGS = %w[quick-core-60 vocal-flair-60 vocal-flair-84 crisis-vocabulary].freeze
  SPANISH_LIBRARY_SLUGS = %w[quick-core-60-es vocal-flair-60-es].freeze
  SPANISH_SOURCE_MAP = {
    'quick-core-60-es' => 'quick-core-60',
    'vocal-flair-60-es' => 'vocal-flair-60'
  }.freeze

  def self.board_key(slug)
    "#{USER_NAME}/#{slug}"
  end

  def self.owner
    User.find_by(user_name: USER_NAME)
  end

  # Idempotent: ensures the configured system board user has crisis-vocabulary from the committed OBZ.
  def self.ensure_crisis_vocabulary!(owner = nil)
    owner ||= self.owner
    return nil unless owner

    key = board_key(CRISIS_VOCABULARY_SLUG)
    existing = Board.find_by_path(key)
    if existing
      existing.public = true
      existing.settings['name'] ||= "Crisis Vocabulary"
      existing.settings['unlisted'] = false
      existing.generate_stats
      existing.save_without_post_processing
      return existing
    end

    unless File.exist?(CRISIS_VOCABULARY_OBZ)
      Rails.logger.warn("[SystemBoardSources] Missing #{CRISIS_VOCABULARY_OBZ} — cannot import crisis vocabulary board")
      return nil
    end

    require Rails.root.join('lib', 'converters', 'lingo_linq')
    boards = Converters::LingoLinq.from_obz(CRISIS_VOCABULARY_OBZ.to_s, 'user' => owner, 'boards' => {})
    return nil if boards.blank?

    root = boards.first
    boards.each_with_index do |board, idx|
      if idx.zero?
        board.public = true
        board.key = key if board.user_id == owner.id
        board.settings['name'] ||= "Crisis Vocabulary"
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
  end
end
