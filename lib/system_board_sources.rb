# Public/system vocabulary boards owned by the lingolinq content account.
module SystemBoardSources
  USER_NAME = ENV.fetch('SYSTEM_BOARD_USER_NAME', 'lingolinq').freeze
  SIGNUP_LIBRARY_SLUGS = %w[quick-core-60 vocal-flair-60 vocal-flair-84].freeze
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
end
