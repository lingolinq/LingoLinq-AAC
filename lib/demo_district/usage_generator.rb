# Synthetic AAC usage for the Demo School District.
#
# One source of truth for the generator that db/seeds.rb (section 7) uses to build the
# district's 90-day history and that DemoDistrict.refresh! uses to keep that history rolling
# forward. Sessions go through LogSession.process_new, the real ingestion path, so
# data['stats'] is computed by the model exactly as production computes it.
#
# Writing sessions is not enough for Reports: Stats.cached_daily_use reads
# WeeklyStatsSummary once a user has any summaries (see scripts/dev-seed-marcus-usage.rb),
# so callers must run WeeklyStatsSummary.update_now for every week they touch.
module DemoDistrict
  class UsageGenerator
    TIME_ZONE = 'America/Los_Angeles'.freeze
    # School-day window: sessions start between 8:00 and 14:59 local time.
    FIRST_HOUR = 8
    HOUR_SPAN = 7

    LAT_BASE = 45.5231 # Portland, OR
    LONG_BASE = -122.6765

    # The twenty demo communicators. Order matters: the index picks each student's device,
    # heat map and classroom in db/seeds.rb.
    STUDENT_PROFILES = [
      { name: 'Aiden Parker',      user_name: 'aiden_parker',      age: 6,  skill: :beginner,     freq: :low },
      { name: 'Bella Martinez',    user_name: 'bella_martinez',    age: 8,  skill: :intermediate, freq: :high },
      { name: 'Charlie Kim',       user_name: 'charlie_kim',       age: 5,  skill: :beginner,     freq: :medium },
      { name: 'Daisy Johnson',     user_name: 'daisy_johnson',     age: 7,  skill: :intermediate, freq: :medium },
      { name: 'Ethan Brown',       user_name: 'ethan_brown',       age: 9,  skill: :advanced,     freq: :high },
      { name: 'Fiona Davis',       user_name: 'fiona_davis',       age: 6,  skill: :beginner,     freq: :low },
      { name: 'Gabriel Wilson',    user_name: 'gabriel_wilson',    age: 10, skill: :advanced,     freq: :high },
      { name: 'Hannah Lee',        user_name: 'hannah_lee',        age: 7,  skill: :intermediate, freq: :medium },
      { name: 'Isaac Thompson',    user_name: 'isaac_thompson',    age: 5,  skill: :beginner,     freq: :low },
      { name: 'Jasmine Nguyen',    user_name: 'jasmine_nguyen',    age: 8,  skill: :intermediate, freq: :high },
      { name: 'Kevin Anderson',    user_name: 'kevin_anderson',    age: 11, skill: :advanced,     freq: :medium },
      { name: 'Luna Garcia',       user_name: 'luna_garcia',       age: 6,  skill: :beginner,     freq: :medium },
      { name: 'Mason Clark',       user_name: 'mason_clark',       age: 9,  skill: :intermediate, freq: :low },
      { name: 'Nora White',        user_name: 'nora_white',        age: 7,  skill: :intermediate, freq: :high },
      { name: 'Oliver Harris',     user_name: 'oliver_harris',     age: 8,  skill: :advanced,     freq: :high },
      { name: 'Penelope Scott',    user_name: 'penelope_scott',    age: 5,  skill: :beginner,     freq: :low },
      { name: 'Quinn Taylor',      user_name: 'quinn_taylor',      age: 10, skill: :advanced,     freq: :medium },
      { name: 'Ruby Adams',        user_name: 'ruby_adams',        age: 6,  skill: :beginner,     freq: :medium },
      { name: 'Sam Mitchell',      user_name: 'sam_mitchell',      age: 7,  skill: :intermediate, freq: :low },
      { name: 'Tessa Campbell',    user_name: 'tessa_campbell',    age: 9,  skill: :advanced,     freq: :high }
    ].freeze

    # Used for a demo communicator who is not in STUDENT_PROFILES (added to the org later).
    DEFAULT_PROFILE = { skill: :intermediate, freq: :medium }.freeze

    # Parts of speech mapping for core words
    WORD_POS = {
      'yes' => 'other', 'no' => 'other', 'more' => 'adjective', 'help' => 'verb',
      'stop' => 'verb', 'go' => 'verb', 'want' => 'verb', 'eat' => 'verb',
      'drink' => 'verb', 'please' => 'other', 'I' => 'pronoun', 'need' => 'verb',
      'like' => 'verb', 'play' => 'verb', 'happy' => 'adjective', 'sad' => 'adjective',
      'mad' => 'adjective', 'glad' => 'adjective', 'bathroom' => 'noun',
      'all done' => 'other', 'my turn' => 'other', 'thank you' => 'other',
      'that' => 'pronoun', 'this' => 'pronoun', 'is' => 'verb', 'not' => 'other',
      'can' => 'verb', 'do' => 'verb', 'it' => 'pronoun', 'the' => 'other',
      'and' => 'other', 'big' => 'adjective', 'little' => 'adjective',
      'good' => 'adjective', 'bad' => 'adjective', 'water' => 'noun',
      'food' => 'noun', 'home' => 'noun', 'school' => 'noun', 'friend' => 'noun',
      'book' => 'noun', 'outside' => 'noun', 'music' => 'noun', 'movie' => 'noun'
    }.freeze

    # Core word list (AAC core vocabulary)
    CORE_WORDS = %w[I want need like go stop help more yes no eat drink play is not can do it the and that this].freeze

    # Heat map access patterns - simulate different motor abilities
    HEAT_MAP_PROFILES = {
      full_access:    { x_range: 0.05..0.95, y_range: 0.05..0.95 }, # Full board
      left_bias:      { x_range: 0.02..0.55, y_range: 0.05..0.95 }, # Right-hand motor difficulty
      top_left_quad:  { x_range: 0.02..0.50, y_range: 0.02..0.50 }, # Limited reach
      bottom_right:   { x_range: 0.45..0.95, y_range: 0.45..0.95 }, # Physical positioning
      center_cluster: { x_range: 0.25..0.75, y_range: 0.25..0.75 }  # Center access only
    }.freeze

    # Device/system profiles
    DEVICE_PROFILES = [
      { system: 'iOS', browser: 'Safari', name_suffix: 'iPad' },
      { system: 'iOS', browser: 'Safari', name_suffix: 'iPad' },
      { system: 'Web', browser: 'Chrome', name_suffix: 'Chromebook' },
      { system: 'Android', browser: 'Chrome', name_suffix: 'Tablet' },
      { system: 'Web', browser: 'Chrome', name_suffix: 'Desktop' }
    ].freeze

    # Access methods by skill level
    ACCESS_METHODS = {
      beginner:     ['touch'],
      intermediate: ['touch'],
      advanced:     ['touch', 'keyboard']
    }.freeze

    # Core vocabulary used in log events, weighted by frequency
    CORE_VOCAB = {
      beginner: {
        words: %w[yes no more help stop go want eat drink please],
        avg_buttons_per_session: 4,
        avg_utterance_length: 1.5,
        sessions_per_day: { low: 1, medium: 2, high: 3 }
      },
      intermediate: {
        words: %w[I want need like go stop help more yes no eat drink play happy sad please bathroom all\ done my\ turn thank\ you],
        avg_buttons_per_session: 8,
        avg_utterance_length: 2.5,
        sessions_per_day: { low: 2, medium: 3, high: 5 }
      },
      advanced: {
        words: %w[I want need like go stop help more yes no eat drink play happy sad mad glad please thank\ you bathroom all\ done my\ turn that this is not can do it the and],
        avg_buttons_per_session: 14,
        avg_utterance_length: 4.0,
        sessions_per_day: { low: 3, medium: 5, high: 8 }
      }
    }.freeze

    # Modeling rate varies by skill (beginners get more modeling)
    MODELING_RATES = { beginner: 0.20, intermediate: 0.10, advanced: 0.05 }.freeze

    # The seeded history grows from 1.0 to about 1.45 over its 90 days. Rolling days hold the
    # end of that curve so new activity reads as a continuation, not a step change.
    STEADY_GROWTH_FACTOR = 1.45

    def self.time_zone
      ActiveSupport::TimeZone[TIME_ZONE]
    end

    # 0-45% improvement over the 90 seeded days
    def self.seed_growth_factor(days_ago)
      1.0 + (90 - days_ago) * 0.005
    end

    # [index, profile] for a communicator. Unknown users get DEFAULT_PROFILE and an index
    # derived from their id, so their device and heat map stay stable between runs.
    def self.profile_for(user)
      idx = STUDENT_PROFILES.index { |p| p[:user_name] == user.user_name }
      return [idx, STUDENT_PROFILES[idx]] if idx
      [user.id.to_i, DEFAULT_PROFILE.merge(name: user.settings['name'].to_s, user_name: user.user_name)]
    end

    # Creates or refreshes the communicator's seeded device. Idempotent.
    def self.ensure_device!(student, profile, index)
      dev_profile = DEVICE_PROFILES[index % DEVICE_PROFILES.length]
      device = Device.find_or_initialize_by(user: student, developer_key_id: 0)
      # Ensure device_key is always set, even for pre-existing system-generated devices
      device.device_key = "seed-student-#{student.id}" if device.device_key.blank?
      device.settings ||= {}
      first_name = profile[:name].to_s.split.first || student.user_name
      device.settings['name'] = "#{first_name}'s #{dev_profile[:name_suffix]}"
      device.settings['ip_address'] = "10.0.#{index % 256}.1"
      device.settings['system'] = dev_profile[:system]
      device.settings['browser'] = dev_profile[:browser]
      device.save!
      device
    end

    attr_reader :student, :profile, :index, :author, :board, :device, :seed_marker, :errors

    # board is a {'id' => ..., 'key' => ...} reference. seed_marker, when set, is written to
    # data['seed_marker'] on every session so the rows can be found (and skipped) later.
    def initialize(student:, profile:, index:, author:, board:, device:, seed_marker: nil)
      @student = student
      @profile = profile
      @index = index
      @author = author
      @board = board
      @device = device
      @seed_marker = seed_marker
      @errors = []
      @skill = profile[:skill]
      @vocab = CORE_VOCAB[@skill]
      @dev_profile = DEVICE_PROFILES[index % DEVICE_PROFILES.length]
      heat_keys = HEAT_MAP_PROFILES.keys
      @heat_profile_name = heat_keys[index % heat_keys.length]
      @heat_profile = HEAT_MAP_PROFILES[@heat_profile_name]
      methods = ACCESS_METHODS[@skill]
      @access_method = methods[index % methods.length]
      @modeling_rate = MODELING_RATES[@skill]
    end

    def description
      "#{@dev_profile[:name_suffix]}, #{@heat_profile_name}"
    end

    # Generates one school day of sessions and returns the LogSessions created.
    # Weekends produce nothing, and roughly 1 in 10 school days is an absence.
    def generate_day(date, growth_factor: STEADY_GROWTH_FACTOR)
      return [] if date.saturday? || date.sunday?

      # Add some day-to-day randomness
      day_variability = rand(0.5..1.5)
      base_sessions_per_day = @vocab[:sessions_per_day][profile[:freq]]
      sessions_today = [(base_sessions_per_day * day_variability * growth_factor).round, 1].max

      return [] if absent?(date)

      created = []
      sessions_today.times do
        session_start = self.class.time_zone.local(date.year, date.month, date.day, FIRST_HOUR + rand(HOUR_SPAN), rand(60), 0)
        events = build_events(session_start.to_i, day_variability, growth_factor)
        begin
          created << create_session!(events)
        rescue => e
          # Skip individual session errors and keep generating, but record them so a caller
          # that must not advance past a failed day (DemoDistrict.refresh!) can stop.
          errors << [date, "#{e.class}: #{e.message}"]
          Rails.logger.warn("[DemoDistrict] skipped session for #{student.user_name} on #{date}: #{e.message}")
        end
      end
      created
    end

    # Occasional absences (roughly 1 in 10 school days). Decided per student and date rather
    # than by rand, so a rerun over the same day reaches the same answer: an absent day leaves
    # no session to mark it done, and DemoDistrict.refresh! would otherwise fill it on retry.
    def absent?(date)
      Random.new(Zlib.crc32("#{student.id}:#{date.iso8601}")).rand(10) == 0
    end

    private

    def build_events(ts, day_variability, growth_factor)
      events = []
      event_id = 1

      # Generate button presses for this session
      num_buttons = [(@vocab[:avg_buttons_per_session] * day_variability * growth_factor).round, 1].max
      current_utterance_words = []

      num_buttons.times do |btn_idx|
        word = @vocab[:words].sample
        current_utterance_words << word

        # Determine button position using heat map profile
        pct_x = rand(@heat_profile[:x_range])
        pct_y = rand(@heat_profile[:y_range])

        # Depth: mostly home board (0), some sub-board navigation
        depth = (rand < 0.2 && @skill != :beginner) ? rand(1..2) : 0

        is_modeled = rand < @modeling_rate
        pos = WORD_POS[word] || 'other'
        is_core = CORE_WORDS.include?(word)

        # button_id is required by generate_stats to populate all_word_counts and
        # all_button_counts. Without it, words_by_frequency, buttons_by_frequency, and
        # related stats are empty.
        button_id = (btn_idx + 1).to_s

        button_event = {
          'type' => 'button',
          'button' => {
            'label' => word,
            'vocalization' => word,
            'button_id' => button_id,
            'board' => board,
            'spoken' => true,
            'for_speaking' => true,
            'type' => 'speak',
            'depth' => depth,
            'percent_x' => pct_x.round(4),
            'percent_y' => pct_y.round(4),
            'percent_travel' => (depth > 0 ? rand(0.1..0.5).round(3) : rand(0.01..0.15).round(3)),
            'access' => @access_method
          },
          'parts_of_speech' => { 'types' => [pos] },
          'core_word' => is_core,
          'system' => @dev_profile[:system],
          'browser' => @dev_profile[:browser],
          'window_width' => 1024,
          'window_height' => 768,
          'volume' => rand(0.3..0.9).round(2),
          'screen_brightness' => rand(0.5..1.0).round(2),
          'orientation' => { 'alpha' => 0, 'beta' => 0, 'gamma' => 0, 'layout' => 'landscape-primary' },
          'geo' => [LAT_BASE + rand(-0.01..0.01), LONG_BASE + rand(-0.01..0.01)],
          'timestamp' => ts + (btn_idx * rand(2..8)),
          'id' => event_id
        }

        if is_modeled
          button_event['modeling'] = true
          button_event['session_user_id'] = author.global_id
        end

        events << button_event
        event_id += 1

        # Generate utterances at natural breakpoints
        target_length = (@vocab[:avg_utterance_length] * growth_factor).round
        if current_utterance_words.length >= target_length || btn_idx == num_buttons - 1
          if current_utterance_words.any?
            events << {
              'type' => 'utterance',
              'utterance' => {
                'text' => current_utterance_words.join(' '),
                'buttons' => current_utterance_words.map { |w| { 'label' => w } }
              },
              'geo' => [LAT_BASE, LONG_BASE],
              'timestamp' => ts + (btn_idx * rand(2..8)) + 1,
              'id' => event_id
            }
            event_id += 1

            # Add 'clear' action after utterance (realistic AAC usage)
            events << {
              'type' => 'action',
              'action' => { 'action' => 'clear' },
              'timestamp' => ts + (btn_idx * rand(2..8)) + 2,
              'id' => event_id
            }
            event_id += 1

            current_utterance_words = []
          end
        end
      end
      events
    end

    def create_session!(events)
      session = LogSession.process_new(
        { 'events' => events },
        {
          user: student,
          author: author,
          device: device,
          ip_address: "10.0.#{index % 256}.#{rand(1..254)}"
        }
      )
      raise "session not saved: #{session.errors.full_messages.join(', ')}" unless session.persisted?
      if seed_marker
        session.data['seed_marker'] = seed_marker
        begin
          session.save!
        rescue
          # An unmarked session would look like real history and move refresh!'s cursor.
          session.destroy
          raise
        end
      end
      session
    end
  end
end
