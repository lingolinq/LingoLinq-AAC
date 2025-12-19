# Demo Data Seeder for LingoLinq-AAC
# This rake task creates demo users with 3 months of realistic usage data
# for training and demonstration purposes.
#
# Usage:
#   rake demo:seed_all           # Create all demo users with data
#   rake demo:seed_user[name]    # Create a specific demo user
#   rake demo:clear              # Remove all demo users and their data
#   rake demo:generate_summaries # Generate weekly stats summaries for demo users

namespace :demo do
  # AAC vocabulary organized by category and complexity
  DEMO_VOCABULARY = {
    core_words: {
      pronouns: %w[I you he she it we they me my your],
      verbs: %w[want need like go help stop more done eat drink play sleep look see hear feel think know make get put take give come have do is are was be],
      descriptors: %w[good bad big little hot cold happy sad tired hungry thirsty sick hurt new old fast slow],
      prepositions: %w[in on up down out off here there with to for],
      social: %w[hi bye please thank you sorry yes no okay help],
      questions: %w[what where when who why how],
      time: %w[now later today tomorrow yesterday morning afternoon night]
    },
    fringe_words: {
      food: %w[apple banana cookie cracker juice milk water pizza sandwich chicken cheese bread cereal yogurt ice\ cream french\ fries hamburger],
      activities: %w[read book movie music game ball swing slide puzzle blocks coloring drawing painting swimming running jumping dancing singing],
      places: %w[home school park store bathroom bedroom kitchen outside car bus playground library hospital doctor],
      people: %w[mom dad grandma grandpa brother sister friend teacher doctor nurse],
      animals: %w[dog cat bird fish horse cow pig duck chicken rabbit],
      objects: %w[phone tablet computer TV toy car truck ball book pencil paper cup plate spoon fork],
      feelings: %w[excited scared angry frustrated confused surprised proud nervous bored lonely]
    }
  }

  # Common AAC utterance patterns
  UTTERANCE_PATTERNS = [
    # Simple requests
    ->(v) { "I want #{v[:food].sample}" },
    ->(v) { "I need #{v[:objects].sample}" },
    ->(v) { "more #{v[:food].sample} please" },
    ->(v) { "help me please" },
    ->(v) { "I want to #{v[:activities].sample}" },
    
    # Statements
    ->(v) { "I feel #{v[:feelings].sample}" },
    ->(v) { "I am #{v[:descriptors].sample}" },
    ->(v) { "I like #{v[:food].sample}" },
    ->(v) { "I see #{v[:animals].sample}" },
    ->(v) { "#{v[:people].sample} is here" },
    
    # Questions
    ->(v) { "where is #{v[:people].sample}" },
    ->(v) { "what is that" },
    ->(v) { "can I have #{v[:food].sample}" },
    ->(v) { "when go #{v[:places].sample}" },
    
    # Social
    ->(v) { "hi #{v[:people].sample}" },
    ->(v) { "bye #{v[:people].sample}" },
    ->(v) { "thank you" },
    ->(v) { "I love you" },
    
    # Complex sentences
    ->(v) { "I want to go to #{v[:places].sample}" },
    ->(v) { "can we #{v[:activities].sample} today" },
    ->(v) { "I don't want #{v[:food].sample}" },
    ->(v) { "#{v[:people].sample} help me #{v[:activities].sample}" }
  ]

  # Demo user profiles with different usage patterns
  DEMO_PROFILES = {
    'demo_emma' => {
      name: 'Emma (Demo)',
      description: 'Beginning AAC user - 6 year old learning to communicate',
      email: 'demo_emma@example.com',
      usage_level: :beginner,
      sessions_per_day: 2..5,
      buttons_per_session: 5..15,
      utterances_per_session: 1..3,
      preferred_vocabulary: [:core_words, :food, :people, :feelings],
      modeling_ratio: 0.4,  # 40% of sessions include modeling
      growth_rate: 0.15     # 15% improvement over time
    },
    'demo_jacob' => {
      name: 'Jacob (Demo)',
      description: 'Intermediate AAC user - 10 year old with growing vocabulary',
      email: 'demo_jacob@example.com',
      usage_level: :intermediate,
      sessions_per_day: 4..8,
      buttons_per_session: 15..35,
      utterances_per_session: 3..8,
      preferred_vocabulary: [:core_words, :activities, :places, :objects],
      modeling_ratio: 0.25,
      growth_rate: 0.10
    },
    'demo_sophia' => {
      name: 'Sophia (Demo)',
      description: 'Advanced AAC user - 14 year old fluent communicator',
      email: 'demo_sophia@example.com',
      usage_level: :advanced,
      sessions_per_day: 6..12,
      buttons_per_session: 30..60,
      utterances_per_session: 8..15,
      preferred_vocabulary: [:core_words, :fringe_words],
      modeling_ratio: 0.1,
      growth_rate: 0.05
    }
  }

  desc "Seed all demo users with 3 months of usage data"
  task seed_all: :environment do
    puts "=" * 60
    puts "LingoLinq Demo Data Seeder"
    puts "=" * 60
    
    DEMO_PROFILES.each do |username, profile|
      puts "\nCreating demo user: #{profile[:name]}"
      Rake::Task['demo:seed_user'].invoke(username)
      Rake::Task['demo:seed_user'].reenable
    end
    
    puts "\n" + "=" * 60
    puts "Demo data seeding complete!"
    puts "=" * 60
    puts "\nDemo users created:"
    DEMO_PROFILES.each do |username, profile|
      puts "  - #{username} (#{profile[:description]})"
    end
    puts "\nYou can now log in as any demo user with password: 'demodemo123'"
    puts "View their reports at: /#{username}/stats"
  end

  desc "Seed a specific demo user with usage data"
  task :seed_user, [:username] => :environment do |t, args|
    username = args[:username] || 'demo_emma'
    profile = DEMO_PROFILES[username]
    
    unless profile
      puts "Unknown demo user: #{username}"
      puts "Available profiles: #{DEMO_PROFILES.keys.join(', ')}"
      next
    end
    
    # Create or find the demo user
    user = User.find_by_path(username)
    if user
      puts "  Found existing user: #{username}"
    else
      puts "  Creating new user: #{username}"
      user = User.process_new({
        name: profile[:name],
        user_name: username,
        email: profile[:email],
        password: 'demodemo123',
        description: profile[:description],
        public: false
      }, {})
      
      # Enable logging and reports
      user.settings ||= {}
      user.settings['preferences'] ||= {}
      user.settings['preferences']['logging'] = true
      user.settings['preferences']['geo_logging'] = true
      user.settings['preferences']['allow_log_reports'] = true
      user.save!
    end
    
    # Create a device for the user
    device = Device.find_or_create_by(user_id: user.id) do |d|
      d.settings = {
        'name' => 'Demo iPad',
        'device_key' => "demo_device_#{username}",
        'system' => 'iOS',
        'browser' => 'Safari'
      }
      d.developer_key_id = 0
    end
    device.settings['name'] ||= 'Demo iPad'
    device.save!
    
    # Create or find a demo board
    board = create_demo_board(user)
    
    # Set as home board
    user.settings['preferences']['home_board'] = {
      'id' => board.global_id,
      'key' => board.key
    }
    user.save!
    
    # Generate 3 months of usage data
    puts "  Generating 3 months of usage data..."
    generate_usage_data(user, device, board, profile)
    
    # Generate weekly stats summaries
    puts "  Generating weekly stats summaries..."
    generate_weekly_summaries(user)
    
    puts "  Done! User #{username} is ready for demos."
  end

  desc "Clear all demo users and their data"
  task clear: :environment do
    puts "Clearing demo data..."
    
    DEMO_PROFILES.keys.each do |username|
      user = User.find_by_path(username)
      if user
        puts "  Removing #{username}..."
        # Delete log sessions
        LogSession.where(user_id: user.id).delete_all
        # Delete weekly summaries
        WeeklyStatsSummary.where(user_id: user.id).delete_all
        # Delete devices
        Device.where(user_id: user.id).delete_all
        # Delete boards
        Board.where(user_id: user.id).delete_all
        # Delete user
        user.destroy
      end
    end
    
    puts "Demo data cleared."
  end

  desc "Generate weekly stats summaries for demo users"
  task generate_summaries: :environment do
    DEMO_PROFILES.keys.each do |username|
      user = User.find_by_path(username)
      if user
        puts "Generating summaries for #{username}..."
        generate_weekly_summaries(user)
      end
    end
  end

  # Helper methods
  def create_demo_board(user)
    board = Board.find_by(user_id: user.id, key: "#{user.user_name}/demo-communication-board")
    return board if board
    
    puts "  Creating demo communication board..."
    
    # Create button images (using placeholder URLs)
    images = {}
    all_words = DEMO_VOCABULARY[:core_words].values.flatten + 
                DEMO_VOCABULARY[:fringe_words].values.flatten
    
    # Create a simple grid board with common words
    buttons = []
    button_id = 1
    
    # Add core words first
    DEMO_VOCABULARY[:core_words].each do |category, words|
      words.first(8).each do |word|
        buttons << {
          'id' => button_id,
          'label' => word,
          'vocalization' => word,
          'background_color' => category_color(category)
        }
        button_id += 1
      end
    end
    
    # Add some fringe words
    DEMO_VOCABULARY[:fringe_words].each do |category, words|
      words.first(4).each do |word|
        buttons << {
          'id' => button_id,
          'label' => word,
          'vocalization' => word,
          'background_color' => category_color(category)
        }
        button_id += 1
      end
    end
    
    # Create grid order (8 columns)
    cols = 8
    rows = (buttons.length.to_f / cols).ceil
    grid_order = []
    buttons.each_slice(cols) do |row_buttons|
      row = row_buttons.map { |b| b['id'] }
      row += [nil] * (cols - row.length) if row.length < cols
      grid_order << row
    end
    
    board = Board.process_new({
      name: 'Demo Communication Board',
      public: false,
      buttons: buttons,
      grid: {
        rows: rows,
        columns: cols,
        order: grid_order
      }
    }, { user: user, key: 'demo-communication-board' })
    
    board
  end

  def category_color(category)
    colors = {
      pronouns: '#ffcccc',      # Light red
      verbs: '#ccffcc',         # Light green
      descriptors: '#ccccff',   # Light blue
      prepositions: '#ffffcc',  # Light yellow
      social: '#ffccff',        # Light pink
      questions: '#ccffff',     # Light cyan
      time: '#ffddcc',          # Light orange
      food: '#ffeedd',          # Peach
      activities: '#ddffdd',    # Mint
      places: '#ddeeff',        # Sky blue
      people: '#ffddff',        # Lavender
      animals: '#ffffdd',       # Cream
      objects: '#ddddff',       # Periwinkle
      feelings: '#ffdddd'       # Rose
    }
    colors[category] || '#ffffff'
  end

  def generate_usage_data(user, device, board, profile)
    # Generate data for the past 3 months
    end_date = Date.today
    start_date = end_date - 90.days
    
    # Build vocabulary pool based on profile preferences
    vocab = build_vocabulary_pool(profile[:preferred_vocabulary])
    
    current_date = start_date
    total_sessions = 0
    
    while current_date <= end_date
      # Calculate growth factor (skills improve over time)
      days_elapsed = (current_date - start_date).to_i
      growth_factor = 1 + (profile[:growth_rate] * (days_elapsed.to_f / 90))
      
      # Vary usage by day of week (less on weekends for school-age users)
      day_multiplier = current_date.saturday? || current_date.sunday? ? 0.6 : 1.0
      
      # Random variation in daily sessions
      num_sessions = (rand(profile[:sessions_per_day]) * day_multiplier).round
      num_sessions = [num_sessions, 1].max if rand < 0.9  # 90% chance of at least 1 session
      
      num_sessions.times do |session_idx|
        # Determine session time (spread throughout the day)
        hour = case session_idx
               when 0 then rand(7..9)    # Morning
               when 1 then rand(10..12)  # Late morning
               when 2 then rand(12..14)  # Lunch
               when 3 then rand(14..16)  # Afternoon
               else rand(16..20)         # Evening
               end
        
        session_time = current_date.to_time + hour.hours + rand(60).minutes
        
        # Generate session events
        events = generate_session_events(
          board, vocab, profile, growth_factor, session_time
        )
        
        # Determine if this is a modeling session
        is_modeling = rand < profile[:modeling_ratio]
        
        # Create the log session
        create_log_session(user, device, board, events, session_time, is_modeling)
        total_sessions += 1
      end
      
      current_date += 1.day
      
      # Progress indicator
      if (current_date - start_date).to_i % 30 == 0
        puts "    Generated #{(current_date - start_date).to_i} days of data (#{total_sessions} sessions)..."
      end
    end
    
    puts "    Total: #{total_sessions} sessions generated"
  end

  def build_vocabulary_pool(preferred_categories)
    vocab = {}
    
    preferred_categories.each do |cat|
      if cat == :core_words
        DEMO_VOCABULARY[:core_words].each do |subcat, words|
          vocab[subcat] = words
        end
      elsif cat == :fringe_words
        DEMO_VOCABULARY[:fringe_words].each do |subcat, words|
          vocab[subcat] = words
        end
      elsif DEMO_VOCABULARY[:core_words][cat]
        vocab[cat] = DEMO_VOCABULARY[:core_words][cat]
      elsif DEMO_VOCABULARY[:fringe_words][cat]
        vocab[cat] = DEMO_VOCABULARY[:fringe_words][cat]
      end
    end
    
    vocab
  end

  def generate_session_events(board, vocab, profile, growth_factor, session_time)
    events = []
    
    # Calculate session parameters with growth
    base_buttons = rand(profile[:buttons_per_session])
    num_buttons = (base_buttons * growth_factor).round
    num_utterances = rand(profile[:utterances_per_session])
    
    current_time = session_time.to_f
    buttons_pressed = []
    
    # Generate button press events
    num_buttons.times do
      # Pick a word (weighted toward core words)
      word = pick_word(vocab, profile[:usage_level])
      
      # Add some delay between presses (0.5 to 5 seconds)
      current_time += rand(0.5..5.0)
      
      event = {
        'type' => 'button',
        'button' => {
          'label' => word,
          'spoken' => rand < 0.8,  # 80% of buttons are spoken
          'board' => { 'id' => board.global_id, 'key' => board.key },
          'percent_x' => rand(0.0..1.0).round(3),
          'percent_y' => rand(0.0..1.0).round(3)
        },
        'timestamp' => current_time
      }
      
      events << event
      buttons_pressed << word
      
      # Occasionally generate an utterance after building up words
      if buttons_pressed.length >= 2 && rand < (0.3 * num_utterances.to_f / num_buttons)
        current_time += rand(0.5..2.0)
        utterance_text = buttons_pressed.join(' ')
        
        events << {
          'type' => 'utterance',
          'utterance' => {
            'text' => utterance_text,
            'buttons' => buttons_pressed.map { |w| { 'label' => w } }
          },
          'timestamp' => current_time
        }
        
        buttons_pressed = []
      end
    end
    
    # Generate any remaining utterance
    if buttons_pressed.length > 0 && rand < 0.7
      current_time += rand(0.5..2.0)
      utterance_text = buttons_pressed.join(' ')
      
      events << {
        'type' => 'utterance',
        'utterance' => {
          'text' => utterance_text,
          'buttons' => buttons_pressed.map { |w| { 'label' => w } }
        },
        'timestamp' => current_time
      }
    end
    
    # Add some navigation actions
    if rand < 0.3
      current_time += rand(1.0..3.0)
      events << {
        'type' => 'action',
        'action' => { 'action' => 'home' },
        'timestamp' => current_time
      }
    end
    
    events
  end

  def pick_word(vocab, usage_level)
    # Weight word selection based on usage level
    case usage_level
    when :beginner
      # Heavily favor simple core words
      categories = vocab.keys
      core_categories = categories.select { |c| [:pronouns, :verbs, :social, :food, :people].include?(c) }
      category = rand < 0.8 ? core_categories.sample : categories.sample
    when :intermediate
      # More balanced selection
      categories = vocab.keys
      category = categories.sample
    when :advanced
      # Use full vocabulary
      categories = vocab.keys
      category = categories.sample
    end
    
    category ||= vocab.keys.sample
    words = vocab[category] || vocab.values.flatten
    words.sample
  end

  def create_log_session(user, device, board, events, session_time, is_modeling)
    return if events.empty?
    
    # Prepare the log session data
    log_data = {
      'events' => events
    }
    
    # Create the log session using the model's process_new method
    begin
      log = LogSession.process_new(log_data, {
        user: user,
        author: user,
        device: device,
        ip_address: "192.168.1.#{rand(1..254)}"
      })
      
      # Set modeling flag if applicable
      if is_modeling && log
        log.data ||= {}
        events.each do |e|
          e['modeling'] = true
        end
        log.data['events'] = events
        log.save
      end
      
      # Force the timestamps
      if log && log.persisted?
        log.update_columns(
          started_at: session_time,
          ended_at: session_time + events.length * 2,
          created_at: session_time,
          updated_at: session_time
        )
      end
    rescue => e
      puts "    Warning: Could not create log session: #{e.message}"
    end
  end

  def generate_weekly_summaries(user)
    # Get date range of log sessions
    first_log = LogSession.where(user_id: user.id).order(:started_at).first
    last_log = LogSession.where(user_id: user.id).order(:started_at).last
    
    return unless first_log && last_log
    
    start_date = first_log.started_at.to_date.beginning_of_week(:sunday)
    end_date = last_log.started_at.to_date.end_of_week(:sunday)
    
    current_week = start_date
    weeks_processed = 0
    
    while current_week <= end_date
      weekyear = WeeklyStatsSummary.date_to_weekyear(current_week)
      
      # Find or create summary
      summary = WeeklyStatsSummary.find_or_create_by(
        user_id: user.id,
        weekyear: weekyear
      )
      
      # Update the summary
      begin
        summary.update!
        weeks_processed += 1
      rescue => e
        puts "    Warning: Could not update summary for week #{weekyear}: #{e.message}"
      end
      
      current_week += 7.days
    end
    
    puts "    Generated #{weeks_processed} weekly summaries"
  end
end
