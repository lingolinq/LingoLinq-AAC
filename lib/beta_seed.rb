# Baseline records required for a fresh beta database.
module BetaSeed
  SYSTEM_USER_NAME = 'lingolinq'.freeze
  ADMIN_USER_NAME = 'lingolinq_admin'.freeze
  ADMIN_ORG_NAME = 'LingoLinq Admin Organization'.freeze
  TRUTHY_PATTERN = /^(1|true|yes)$/i.freeze
  FALSEY_PATTERN = /^(0|false|no)$/i.freeze
  REQUIRED_STARTER_BOARD_SLUGS = %w[one two three yesno keyboard inflections].freeze
  REQUIRED_SIGNUP_BOARD_SLUGS = SystemBoardSources::SIGNUP_LIBRARY_SLUGS.freeze
  # SEED_* env that ensure_baseline! demands in staging/production (it raises if
  # blank). The rebuild flow pre-flights these BEFORE deleting anything.
  REQUIRED_SEED_ENV = %w[SEED_LINGOLINQ_PASSWORD SEED_ADMIN_PASSWORD].freeze

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

    senner_baud = SystemBoardSources.ensure_senner_baud!(user)
    if senner_baud
      puts "  Ensured #{SystemBoardSources.board_key(SystemBoardSources::SENNER_BAUD_SLUG)} social pages set"
    else
      puts "  NOTE: #{SystemBoardSources.board_key(SystemBoardSources::SENNER_BAUD_SLUG)} not found."
      puts "        Upload: bundle exec rake lingolinq:upload_curated_boards ONLY=senner-baud"
      puts "        Then:   bundle exec rake lingolinq:ensure_senner_baud"
      puts "        Or place SennerBaudSocialPages60ll.obz in tmp/seed-boards/ (SENNER_BAUD_OBZ_PATH override OK)."
    end

    ensure_curated_vocabularies_if_requested!(user)
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

  def self.ensure_curated_vocabularies_if_requested!(user)
    return unless user

    if ENV['SEED_IMPORT_CURATED_VOCABULARIES'].to_s =~ TRUTHY_PATTERN
      puts "  Importing curated S3 vocabulary boards for #{SYSTEM_USER_NAME} (prefer over OpenAAC overlaps)..."
      Rake::Task['lingolinq:import_curated_vocabularies'].reenable
      Rake::Task['lingolinq:import_curated_vocabularies'].invoke
    else
      sample = CuratedVocabularySources.importable_entries.first
      return unless sample
      return if Board.find_by_path(SystemBoardSources.board_key(sample[:root_slug]))

      puts "  NOTE: curated gallery vocabularies not imported."
      puts "        Run: bundle exec rake lingolinq:import_curated_vocabularies"
      puts "        Or set SEED_IMPORT_CURATED_VOCABULARIES=1 before db:seed (upload assets first)."
    end
  end

  def self.ensure_openaac_vocabularies_if_requested!(user)
    return unless user
    return if Board.find_by_path(SystemBoardSources.board_key('quick-core-60'))

    if ENV['SEED_IMPORT_OPENAAC_VOCABULARIES'].to_s =~ TRUTHY_PATTERN
      puts "  Importing OpenAAC vocabulary boards for #{SYSTEM_USER_NAME} (this may take a while)..."
      puts "  (Overlaps with curated catalog are skipped — see CuratedVocabularySources.openaac_skip_files)"
      Rake::Task['openaac:import_vocabularies'].reenable
      ENV['VOCABULARY_USER_NAME'] = SYSTEM_USER_NAME
      Rake::Task['openaac:import_vocabularies'].invoke
    else
      puts "  NOTE: #{SystemBoardSources.board_key('quick-core-60')} not found."
      puts "        Run: VOCABULARY_USER_NAME=#{SYSTEM_USER_NAME} bundle exec rake openaac:import_vocabularies"
      puts "        Or set SEED_IMPORT_OPENAAC_VOCABULARIES=1 before db:seed to import during seed."
    end
  end

  # Destroys every board owned by the given content user and returns the count.
  # Used by the rebuild flow so a re-seed actually re-imports (the ensure_*/openaac
  # importers skip boards that already exist). Destructive: deleted boards are
  # recreated with NEW global_ids, so any user copies / home-board references to
  # them break. Safe on staging (no real users); NOT for prod without an
  # in-place refresh. Callers are responsible for confirmation/guards.
  def self.delete_content_boards!(user)
    raise ArgumentError, 'user required' unless user
    scope = Board.where(user_id: user.id)
    expected = scope.count
    scope.find_each(&:destroy)
    remaining = Board.where(user_id: user.id).count
    if remaining.positive?
      raise "Delete incomplete: expected #{expected} board(s) removed, #{remaining} remain"
    end
    expected
  end

  # Required SEED_* env that ensure_baseline! will demand in staging/production.
  # Returned here so the rebuild can abort BEFORE deleting (a missing password
  # otherwise raises mid-reseed, after the delete committed, leaving the library
  # empty with no rollback). Empty in dev/test where defaults apply.
  def self.missing_required_seed_env
    return [] unless Rails.env.production? || ENV['RAILS_ENV'] == 'staging'
    REQUIRED_SEED_ENV.reject { |key| ENV[key].present? }
  end

  # Count of DISTINCT *other* users whose home/sidebar/connections point at the
  # content user's boards. Non-zero means a delete would damage real users:
  # Board#flush_related_records clears their home_board + sidebars (and queues
  # home_board_changed notifications) on destroy. This is the signal that a
  # "staging" DB actually holds real/prod-derived users.
  def self.content_boards_referenced_by_others(user)
    return 0 unless user
    board_ids = Board.where(user_id: user.id).pluck(:id)
    return 0 if board_ids.empty?
    UserBoardConnection.where(board_id: board_ids).where.not(user_id: user.id).distinct.count(:user_id)
  end

  # Full clean rebuild of the content user's premade library: delete all their
  # boards, then re-run the baseline seed (starter + sidebar + crisis +
  # Senner-Baud) and, when import_vocabularies is true, curated gallery sets
  # then OpenAAC (with curated overlaps skipped). Returns the number of boards
  # deleted. Raises BEFORE deleting if required seed env is missing or other
  # users reference these boards, so it can never leave the library empty.
  # Delete + re-seed run in one transaction so a seed failure rolls back the deletes.
  def self.rebuild_content_boards!(user, import_vocabularies: true)
    missing = missing_required_seed_env
    raise "Cannot rebuild: required seed env missing (#{missing.join(', ')})" if missing.any?

    referenced = content_boards_referenced_by_others(user)
    if referenced.positive? && ENV['ALLOW_REFERENCED_DELETE'].to_s !~ TRUTHY_PATTERN
      raise "Cannot rebuild: #{referenced} other user(s) reference these boards (home/sidebar). " \
            'Set ALLOW_REFERENCED_DELETE=1 only if this is throwaway data.'
    end

    expected_count = Board.where(user_id: user.id).count
    deleted = nil
    env_overrides = {}
    if import_vocabularies
      env_overrides['SEED_IMPORT_CURATED_VOCABULARIES'] = '1'
      env_overrides['SEED_IMPORT_OPENAAC_VOCABULARIES'] = '1'
    end

    with_temporary_env(env_overrides) do
      ActiveRecord::Base.transaction do
        deleted = delete_content_boards!(user)
        if deleted != expected_count
          raise "Delete count mismatch: expected #{expected_count}, deleted #{deleted}"
        end
        ensure_baseline!
      end
    end

    deleted
  end

  # Temporarily set ENV keys for the duration of a block, restoring prior values
  # (or deleting keys that were unset) even when the block raises.
  def self.with_temporary_env(overrides)
    return yield if overrides.empty?

    prior = {}
    overrides.each do |key, value|
      prior[key] = ENV.key?(key) ? ENV[key] : :__unset__
      ENV[key] = value.to_s
    end
    yield
  ensure
    prior&.each do |key, old|
      if old == :__unset__
        ENV.delete(key)
      else
        ENV[key] = old
      end
    end
  end
  private_class_method :with_temporary_env

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
