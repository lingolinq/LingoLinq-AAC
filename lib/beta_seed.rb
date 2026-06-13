# Baseline records required for a fresh beta database.
module BetaSeed
  SYSTEM_USER_NAME = 'lingolinq'.freeze
  ADMIN_USER_NAME = 'lingolinq_admin'.freeze
  ADMIN_ORG_NAME = 'LingoLinq Admin Organization'.freeze
  TRUTHY_PATTERN = /^(1|true|yes)$/i.freeze
  FALSEY_PATTERN = /^(0|false|no)$/i.freeze
  REQUIRED_STARTER_BOARD_SLUGS = %w[one two three yesno keyboard inflections].freeze
  REQUIRED_SIGNUP_BOARD_SLUGS = SystemBoardSources::SIGNUP_LIBRARY_SLUGS.freeze

  def self.seed_password(env_key, dev_default)
    if (Rails.env.production? || ENV['RAILS_ENV'] == 'staging') && ENV[env_key].blank?
      raise "Cannot seed: #{env_key} must be set in production/staging. Use strong credentials."
    end
    ENV[env_key].presence || dev_default
  end

  def self.demo_data_enabled?
    ENV['SEED_DEMO_DATA'].to_s =~ TRUTHY_PATTERN
  end

  def self.ensure_baseline!
    puts "\n===== Ensure beta baseline seed data ====="
    content_user = ensure_content_user!
    ensure_admin_user!
    ensure_system_content!(content_user)
  end

  def self.ensure_content_user!
    password = seed_password('SEED_LINGOLINQ_PASSWORD', 'password')
    user = ensure_user!(
      user_name: SYSTEM_USER_NAME,
      name: 'LingoLinq',
      email: 'content@lingolinq.com',
      public: true,
      password: password,
      description: 'Official Lingolinq communication boards',
      location: 'Everywhere'
    )
    ensure_lifetime_subscription!(user)
    puts "  Ensured #{SYSTEM_USER_NAME} content user"
    user
  end

  def self.ensure_admin_user!
    password = seed_password('SEED_ADMIN_PASSWORD', 'admin2025!')
    admin = ensure_user!(
      user_name: ADMIN_USER_NAME,
      name: 'LingoLinq Admin',
      email: 'admin@lingolinq.com',
      public: false,
      password: password,
      description: 'LingoLinq site administrator',
      location: 'Portland, OR'
    )
    ensure_lifetime_subscription!(admin)

    admin_org = ensure_admin_organization!
    unless Organization.admin_manager?(admin)
      admin_org.add_manager(admin.user_name, true)
      puts "  Linked #{ADMIN_USER_NAME} to admin organization as full manager"
    end
    admin
  end

  def self.ensure_admin_organization!
    org = Organization.find_by(admin: true)
    unless org
      org = Organization.create!(admin: true, settings: {'name' => ADMIN_ORG_NAME})
      puts "  Created admin organization"
    end
    org.settings ||= {}
    org.settings['name'] ||= ADMIN_ORG_NAME
    org.save! if org.changed?
    org
  end

  def self.ensure_system_content!(user = nil)
    user ||= SystemBoardSources.owner || ensure_content_user!

    ensure_starter_boards!(user)
    SystemSidebarBoards.ensure_for(user).each do |board|
      puts "  Ensured #{SystemBoardSources.board_key(board.key.split('/').last)} board"
    end

    crisis_board = SystemBoardSources.ensure_crisis_vocabulary!(user)
    if crisis_board
      puts "  Ensured #{SystemBoardSources.board_key(SystemBoardSources::CRISIS_VOCABULARY_SLUG)} board"
    else
      puts "  NOTE: #{SystemBoardSources.board_key(SystemBoardSources::CRISIS_VOCABULARY_SLUG)} not found."
      puts "        Add public/system-boards/crisis-vocabulary.obz or run: bundle exec rake lingolinq:ensure_crisis_vocabulary"
    end

    ensure_openaac_vocabularies_if_requested!(user)
  end

  def self.ensure_starter_boards!(user)
    image1 = ensure_button_image!(user, 'http://mcswhispers.files.wordpress.com/2012/08/yellow_happy11.jpg', download: false)
    image2 = ensure_button_image!(user, 'https://www.clipartmax.com/png/middle/186-1869260_free-family-and-friends-clip-art-by-phillip-martin-action-words-in.png', download: false)
    sound1 = ensure_button_sound!(user, 'https://www.epidemicsound.com/sound-effects/tracks/4f080c7d-45f9-43d2-b063-e4ee506711d3/')

    board1 = Board.find_by_path(SystemBoardSources.board_key('one')) || Board.process_new({}, {key: 'one', user: user})
    board2 = Board.find_by_path(SystemBoardSources.board_key('two')) || Board.process_new({}, {key: 'two', user: user})

    board3 = Board.find_by_path(SystemBoardSources.board_key('three'))
    unless board3
      board3 = Board.process_new({
        name: 'Three',
        public: true,
        buttons: [
          {
            id: 1,
            label: "Want",
            image_id: image1.global_id,
            load_board: {
              id: board1.global_id,
              key: board1.key
            }
          },
          {
            id: 2,
            image_id: image2.global_id,
            label: "Need"
          }
        ],
        grid: {
          rows: 1,
          columns: 2,
          order: [[1, 2]]
        }
      }, {user: user, key: 'three'})
    end

    if board2.settings['buttons'].blank? || board2.settings['buttons'].empty?
      board2.process({
        name: 'Two',
        public: true,
        buttons: [
          {
            id: 1,
            label: "Jump",
            image_id: image1.global_id,
            load_board: {
              id: board3.global_id,
              key: board3.key
            }
          },
          {
            id: 2,
            image_id: image2.global_id,
            label: "Duck"
          }
        ],
        grid: {
          rows: 1,
          columns: 2,
          order: [[1, 2]]
        }
      })
    end

    if board1.settings['buttons'].blank? || board1.settings['buttons'].empty?
      board1.process({
        name: 'One',
        public: true,
        buttons: [
          {
            id: 1,
            label: "Happy",
            image_id: image1.global_id,
            load_board: {
              id: board2.global_id,
              key: board2.key
            }
          },
          {
            id: 2,
            image_id: image2.global_id,
            label: "Sad",
            border_color: "#000"
          },
          {
            id: 3,
            image_id: image2.global_id,
            label: "Glad",
            border_color: "#0aa"
          },
          {
            id: 4,
            image_id: image2.global_id,
            label: "Bad",
            background_color: "#faa"
          },
          {
            id: 5,
            image_id: image2.global_id,
            label: "Mad"
          },
          {
            id: 6,
            image_id: image2.global_id,
            label: "Rad",
            sound_id: sound1.global_id
          }
        ],
        grid: {
          rows: 2,
          columns: 4,
          order: [[1, 2, 3, 4], [0, 5, 9, 6]]
        }
      })
    end

    yes_no = ensure_yes_no_board!(user)
    [board1, board2, board3].each { |board| ensure_public_board!(board) }
    star_boards!(user, [board1, board2, yes_no])
    puts "  Ensured #{SYSTEM_USER_NAME} public starter boards"
    [board1, board2, board3, yes_no]
  end

  def self.ensure_yes_no_board!(user)
    board = Board.find_by_path(SystemBoardSources.board_key('yesno'))
    unless board
      board = Board.process_new({
        name: 'Yes/No',
        public: true,
        buttons: [
          {
            id: 1,
            label: 'Yes',
            image_url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/yes_2.png'
          },
          {
            id: 2,
            label: 'No',
            image_url: 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/no.png'
          }
        ],
        grid: {
          rows: 1,
          columns: 2,
          order: [[1, 2]]
        }
      }, {user: user, key: 'yesno'})
    end
    ensure_public_board!(board)
    board
  end

  def self.ensure_openaac_vocabularies_if_requested!(user)
    return unless user
    return if Board.find_by_path(SystemBoardSources.board_key('quick-core-60'))

    if ENV['SEED_IMPORT_OPENAAC_VOCABULARIES'].to_s =~ TRUTHY_PATTERN
      puts "  Importing OpenAAC vocabulary boards for #{SYSTEM_USER_NAME} (this may take a while)..."
      Rake::Task['openaac:import_vocabularies'].reenable
      ENV['VOCABULARY_USER_NAME'] = SYSTEM_USER_NAME
      Rake::Task['openaac:import_vocabularies'].invoke
    else
      puts "  NOTE: #{SystemBoardSources.board_key('quick-core-60')} not found."
      puts "        Run: VOCABULARY_USER_NAME=#{SYSTEM_USER_NAME} bundle exec rake openaac:import_vocabularies"
      puts "        Or set SEED_IMPORT_OPENAAC_VOCABULARIES=1 before db:seed to import during seed."
    end
  end

  def self.verify_beta_seed(require_library_boards: true)
    missing = []
    content_user = User.find_by(user_name: SYSTEM_USER_NAME)
    admin_user = User.find_by(user_name: ADMIN_USER_NAME)

    missing << "user:#{SYSTEM_USER_NAME}" unless content_user
    missing << "user:#{ADMIN_USER_NAME}" unless admin_user
    missing << 'organization:admin' unless Organization.admin
    missing << "#{ADMIN_USER_NAME}:admin_org_full_manager" unless admin_user && Organization.admin_manager?(admin_user)
    missing << 'user_integrations:core_word_list' unless UserIntegration.find_by(template: true, integration_key: 'core_word_list')

    EvalProtocol::STATIC_PROFILES.each do |code|
      missing << "eval_protocol:#{code}" unless EvalProtocol.find_by(public_protocol_id: code)
    end

    REQUIRED_STARTER_BOARD_SLUGS.each do |slug|
      board = Board.find_by_path(SystemBoardSources.board_key(slug))
      missing << "board:#{SystemBoardSources.board_key(slug)}" unless content_user && board&.public?
    end

    if require_library_boards
      REQUIRED_SIGNUP_BOARD_SLUGS.each do |slug|
        board = Board.find_by_path(SystemBoardSources.board_key(slug))
        missing << "board:#{SystemBoardSources.board_key(slug)}" unless board&.public?
      end
    end

    missing
  end

  def self.ensure_user!(user_name:, name:, email:, public:, password:, description:, location:)
    user = User.find_by(user_name: user_name)
    unless user
      user = User.process_new({
        name: name,
        user_name: user_name,
        email: email,
        public: public,
        password: password,
        description: description,
        location: location
      }, {
        is_admin: false
      })
      raise "Could not create seed user #{user_name}: #{user.processing_errors.inspect}" if user.errored?
    end

    if user.user_name != user_name
      raise "Seed user #{user_name} was created as #{user.user_name}; check reserved routes before seeding."
    end

    user.generate_password(password) if password.present?
    user.settings ||= {}
    user.settings['preferences'] ||= {}
    user.save!
    user
  end

  def self.ensure_lifetime_subscription!(user)
    user.settings ||= {}
    user.settings['subscription'] ||= {}
    user.settings['subscription']['never_expires'] = true
    user.settings['subscription']['plan_id'] = 'slp_monthly_granted'
    user.settings['subscription']['started'] ||= 1.year.ago.iso8601
    user.save!
  end

  def self.ensure_button_image!(user, url, download:)
    ButtonImage.find_by(url: url, user_id: user.id) || ButtonImage.process_new({
      license: {
        type: 'private'
      },
      url: url
    }, {user: user, download: download})
  end

  def self.ensure_button_sound!(user, url)
    ButtonSound.find_by(url: url, user_id: user.id) || ButtonSound.process_new({
      url: url
    }, {user: user, download: false})
  end

  def self.ensure_public_board!(board)
    board.public = true
    board.generate_stats
    board.save_without_post_processing
    board
  end

  def self.star_boards!(user, boards)
    user.reload
    user.settings['starred_board_ids'] ||= []
    existing = user.settings['starred_board_ids'] || []
    ids = boards.compact.map(&:global_id)
    user.settings['starred_board_ids'] = (existing + ids).uniq
    user.save! if user.changed?
  end
end
