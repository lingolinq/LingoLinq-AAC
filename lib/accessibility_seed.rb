# Opt-in seed data for access-method QA accounts (eye gaze, switch scanning).
module AccessibilitySeed
  EYE_GAZE_USER_NAME = 'lingolinq-eyegaze'.freeze
  SWITCH_USER_NAME = 'lingolinq-switchuser'.freeze
  EYE_GAZE_BOARD_SLUGS = %w[home yesno more].freeze

  ACTION_BUTTONS = [
    {id: 16, label: 'Backspace', vocalization: ':backspace', background_color: '#607D8B'},
    {id: 17, label: 'Clear', vocalization: ':clear', background_color: '#F44336'},
    {id: 18, label: 'Back', vocalization: ':back', background_color: '#795548'},
    {id: 19, label: 'Home', vocalization: ':home', background_color: '#2196F3'},
    {id: 20, label: 'Speak', vocalization: ':speak', background_color: '#4CAF50'}
  ].freeze

  YES_IMAGE_URL = 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/yes_2.png'.freeze
  NO_IMAGE_URL = 'https://opensymbols.s3.amazonaws.com/libraries/arasaac/no.png'.freeze

  def self.enabled?
    ENV['SEED_ACCESSIBILITY_USERS'].to_s =~ BetaSeed::TRUTHY_PATTERN
  end

  def self.board_key(slug)
    "#{EYE_GAZE_USER_NAME}/#{slug}"
  end

  def self.ensure_all!
    puts "\n===== Ensure accessibility seed users ====="
    eye_gaze_user = ensure_eye_gaze_user!
    boards = ensure_eye_gaze_boards!(eye_gaze_user)
    wire_eye_gaze_user!(eye_gaze_user, boards)
    ensure_switch_user!
    puts "  Accessibility seed complete"
  end

  def self.ensure_eye_gaze_user!
    password = BetaSeed.seed_password('SEED_EYE_GAZE_PASSWORD', 'password')
    user = BetaSeed.ensure_user!(
      user_name: EYE_GAZE_USER_NAME,
      name: 'LingoLinq Eye Gaze',
      email: 'eyegaze@lingolinq.com',
      public: true,
      password: password,
      description: 'Public eye-gaze test boards and pre-configured dwell settings for QA',
      location: 'Everywhere'
    )
    BetaSeed.ensure_lifetime_subscription!(user)
    apply_eye_gaze_preferences!(user)
    puts "  Ensured #{EYE_GAZE_USER_NAME} user with eye-gaze preferences"
    user
  end

  def self.apply_eye_gaze_preferences!(user)
    user.settings ||= {}
    user.settings['preferences'] ||= {}
    prefs = user.settings['preferences']
    prefs['role'] = 'communicator'
    prefs['auto_open_speak_mode'] = true
    prefs['blank_status'] = true
    prefs['devices'] ||= {}
    prefs['devices']['default'] ||= {}
    device = prefs['devices']['default']
    device.merge!(
      'dwell' => true,
      'dwell_type' => 'eyegaze',
      'dwell_duration' => 1200,
      'dwell_delay' => 100,
      'dwell_cursor' => true,
      'dwell_icon' => 'circle',
      'dwell_gravity' => true,
      'dwell_targeting' => 'shrink',
      'button_spacing' => 'medium',
      'button_text' => 'large',
      'vocalization_height' => 'large'
    )
    User.preference_defaults['device'].each do |attr, val|
      device[attr] = val if device[attr].nil?
    end
    user.settings = {}.merge(user.settings)
    user.save!
    user
  end

  def self.ensure_eye_gaze_boards!(user)
    yesno = ensure_yesno_board!(user)
    more = ensure_more_board!(user)
    home = ensure_home_board!(user, more)
    [home, yesno, more].each { |board| BetaSeed.ensure_public_board!(board) }
    puts "  Ensured #{EYE_GAZE_USER_NAME} public boards: #{EYE_GAZE_BOARD_SLUGS.join(', ')}"
    {home: home, yesno: yesno, more: more}
  end

  def self.ensure_yesno_board!(user)
    board = Board.find_by_path(board_key('yesno'))
    unless board
      board = Board.process_new({
        name: 'Yes/No',
        public: true,
        buttons: [
          {id: 1, label: 'Yes', image_url: YES_IMAGE_URL},
          {id: 2, label: 'No', image_url: NO_IMAGE_URL}
        ],
        grid: {
          rows: 1,
          columns: 2,
          order: [[1, 2]]
        }
      }, {user: user, key: 'yesno'})
    end
    board
  end

  def self.ensure_more_board!(user)
    board = Board.find_by_path(board_key('more'))
    vocabulary = [
      {id: 1, label: 'food', background_color: '#FF9800'},
      {id: 2, label: 'water', background_color: '#03A9F4'},
      {id: 3, label: 'play', background_color: '#4CAF50'},
      {id: 4, label: 'tired', background_color: '#9E9E9E'},
      {id: 5, label: 'hurt', background_color: '#E91E63'},
      {id: 6, label: 'school', background_color: '#673AB7'},
      {id: 7, label: 'friend', background_color: '#FFEB3B'},
      {id: 8, label: 'all done', background_color: '#F44336'}
    ]
    buttons = vocabulary + action_buttons_with_ids(9)
    more_grid = {
      rows: 4,
      columns: 5,
      order: [
        [1, 2, 3, 4, 5],
        [6, 7, 8, 0, 0],
        [0, 0, 0, 0, 0],
        [9, 10, 11, 12, 13]
      ]
    }
    if !board
      board = Board.process_new({
        name: 'More',
        public: true,
        buttons: buttons,
        grid: more_grid
      }, {user: user, key: 'more'})
    elsif board.settings['buttons'].blank? || board.settings['buttons'].empty?
      board.process({
        name: 'More',
        public: true,
        buttons: buttons,
        grid: more_grid
      })
    end
    board
  end

  def self.ensure_home_board!(user, more_board)
    board = Board.find_by_path(board_key('home'))
    vocabulary = [
      {id: 1, label: 'I', background_color: '#FFEB3B'},
      {id: 2, label: 'want', background_color: '#FF9800'},
      {id: 3, label: 'need', background_color: '#FF9800'},
      {id: 4, label: 'help', background_color: '#2196F3'},
      {id: 5, label: 'more', background_color: '#9C27B0', load_board: {id: more_board.global_id, key: more_board.key}},
      {id: 6, label: 'yes', background_color: '#4CAF50'},
      {id: 7, label: 'no', background_color: '#F44336'},
      {id: 8, label: 'please', background_color: '#9C27B0'},
      {id: 9, label: 'stop', background_color: '#F44336'},
      {id: 10, label: 'go', background_color: '#4CAF50'},
      {id: 11, label: 'happy', background_color: '#FFEB3B'},
      {id: 12, label: 'sad', background_color: '#607D8B'},
      {id: 13, label: 'bathroom', background_color: '#795548'},
      {id: 14, label: 'eat', background_color: '#FF9800'},
      {id: 15, label: 'drink', background_color: '#03A9F4'}
    ]
    buttons = vocabulary + ACTION_BUTTONS
    if !board
      board = Board.process_new({
        name: 'Home',
        public: true,
        buttons: buttons,
        grid: {
          rows: 4,
          columns: 5,
          order: [
            [1, 2, 3, 4, 5],
            [6, 7, 8, 9, 10],
            [11, 12, 13, 14, 15],
            [16, 17, 18, 19, 20]
          ]
        }
      }, {user: user, key: 'home'})
    elsif board.settings['buttons'].blank? || board.settings['buttons'].empty?
      board.process({
        name: 'Home',
        public: true,
        buttons: buttons,
        grid: {
          rows: 4,
          columns: 5,
          order: [
            [1, 2, 3, 4, 5],
            [6, 7, 8, 9, 10],
            [11, 12, 13, 14, 15],
            [16, 17, 18, 19, 20]
          ]
        }
      })
    end
    board
  end

  def self.action_buttons_with_ids(start_id)
    ACTION_BUTTONS.map.with_index do |button, idx|
      button.merge(id: start_id + idx)
    end
  end

  def self.wire_eye_gaze_user!(user, boards)
    home = boards[:home]
    yesno = boards[:yesno]
    user.reload
    user.settings['preferences'] ||= {}
    user.settings['preferences']['home_board'] = {
      'id' => home.global_id,
      'key' => home.key
    }
    user.settings['preferences']['progress'] ||= {}
    user.settings['preferences']['progress']['home_board_set'] = true
    existing_stars = user.settings['starred_board_ids'] || []
    ids = [home, yesno].compact.map(&:global_id)
    user.settings['starred_board_ids'] = (existing_stars + ids).uniq
    user.settings = {}.merge(user.settings)
    user.save!
  end

  def self.ensure_switch_user!
    password = BetaSeed.seed_password('SEED_SWITCH_USER_PASSWORD', 'password')
    user = BetaSeed.ensure_user!(
      user_name: SWITCH_USER_NAME,
      name: 'LingoLinq Switch User',
      email: 'switch@lingolinq.com',
      public: true,
      password: password,
      description: 'Public switch-scanning test boards and pre-configured scanning settings for QA',
      location: 'Everywhere'
    )
    BetaSeed.ensure_lifetime_subscription!(user)
    apply_switch_preferences!(user)
    puts "  Ensured #{SWITCH_USER_NAME} user (switch boards not yet defined — user shell only)"
    user
  end

  def self.apply_switch_preferences!(user)
    user.settings ||= {}
    user.settings['preferences'] ||= {}
    prefs = user.settings['preferences']
    prefs['role'] = 'communicator'
    prefs['auto_open_speak_mode'] = true
    prefs['devices'] ||= {}
    prefs['devices']['default'] ||= {}
    device = prefs['devices']['default']
    device.merge!(
      'scanning' => true,
      'scanning_mode' => 'row',
      'scanning_interval' => 1500,
      'scanning_prompt' => true,
      'scanning_select_keycode' => 32,
      'button_spacing' => 'medium',
      'button_text' => 'large'
    )
    User.preference_defaults['device'].each do |attr, val|
      device[attr] = val if device[attr].nil?
    end
    user.settings = {}.merge(user.settings)
    user.save!
    user
  end
end
