# Load and run from Rails console:
#   load Rails.root.join('lib', 'seed_reporting_logs.rb'); seed_reporting_logs('sampleorganization_user_1')
#   seed_reporting_logs('sampleorganization_user_1', sessions_count: 5, include_historic: true)
#
# Or run via rake: rake db:seed_reporting_logs USER_NAME=sampleorganization_user_1
#
# Creates recent sessions (last N days) plus historic sessions (older than 2 months, various
# dates/times) so "Last 2 Months", "2-4 Months Ago", and custom date filters all show data.

# Words that will show up in the word cloud (varied counts for visual interest)
REPORTING_SEED_WORDS = [
  ['hello', 8],
  ['more', 6],
  ['want', 5],
  ['help', 5],
  ['yes', 4],
  ['no', 4],
  ['go', 4],
  ['like', 3],
  ['please', 3],
  ['thank', 3],
  ['you', 3],
  ['I', 3],
  ['water', 2],
  ['eat', 2],
  ['bathroom', 2],
  ['done', 2],
  ['good', 2],
  ['bad', 2],
  ['happy', 1],
  ['sad', 1],
  ['tired', 1],
  ['home', 1],
  ['school', 1],
  ['friend', 1],
  ['mom', 1],
  ['dad', 1],
  ['stop', 1],
  ['wait', 1],
  ['again', 1],
  ['different', 1]
].freeze

# Grid positions for heat map (percent_x, percent_y) - spread across the board
# so the activation heat map shows multiple hot spots
HEAT_MAP_POSITIONS = [
  [0.15, 0.2], [0.25, 0.25], [0.35, 0.15], [0.45, 0.3], [0.55, 0.2], [0.65, 0.35], [0.75, 0.25], [0.85, 0.2],
  [0.2, 0.5], [0.3, 0.55], [0.4, 0.45], [0.5, 0.5], [0.6, 0.55], [0.7, 0.45], [0.8, 0.5],
  [0.15, 0.75], [0.35, 0.7], [0.5, 0.8], [0.65, 0.75], [0.85, 0.7],
  [0.5, 0.5], [0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]  # extra hits for hot spots
].freeze

# Historic sessions: [days_ago, hour_of_day] – older than 2 months, various dates/times
# so "2-4 Months Ago" and date filters show data; hour varies time-of-day heat map
HISTORIC_SESSION_OFFSETS = [
  [65, 9],   # ~2.2 months ago, 9am
  [75, 14],  # ~2.5 months ago, 2pm
  [95, 8],   # ~3.2 months ago, 8am
  [100, 16], # ~3.3 months ago, 4pm
  [120, 10], # ~4 months ago, 10am
  [135, 19], # ~4.5 months ago, 7pm
  [150, 7],  # ~5 months ago, 7am
].freeze

def seed_reporting_logs(user_name = 'sampleorganization_user_1', sessions_count: 5, include_historic: true)
  user = User.find_by(user_name: user_name)
  unless user
    puts "User not found: #{user_name}"
    return nil
  end

  # Ensure reporting is enabled for this user (required for stats page to load data)
  if user.settings['preferences'].nil?
    user.settings['preferences'] = {}
  end
  unless user.settings['preferences']['logging']
    user.settings['preferences']['logging'] = true
    user.save!
    puts "  Enabled preferences.logging for #{user_name}"
  end

  device = Device.find_or_create_by!(user_id: user.id, developer_key_id: 0, device_key: "seed_reporting_#{user.id}") do |d|
    d.settings ||= {}
    d.settings['name'] = "Seed device for #{user.user_name}"
  end

  board_id = '1_1'
  position_idx = 0

  # Build flat list of [word, count] for this seed
  word_events = REPORTING_SEED_WORDS.flat_map { |word, count| [word] * count }

  sessions_created = 0

  # ---- Recent sessions (last few days, within "Last 2 Months") ----
  sessions_count.times do |day_offset|
    base_time = (day_offset + 1).days.ago
    started_at = base_time.to_i
    events = build_reporting_events(word_events, board_id, started_at, position_idx)
    position_idx += events.count { |e| e['type'] == 'button' }

    begin
      LogSession.process_new(
        { 'events' => events },
        { user: user, author: user, device: device, ip_address: '127.0.0.1' }
      )
      sessions_created += 1
      puts "  ✓ Session #{sessions_created} (#{base_time.to_date}) – #{events.count { |e| e['type'] == 'button' }} button events"
    rescue => e
      puts "  ⚠ Session for #{base_time.to_date}: #{e.message}"
    end
  end

  # ---- Historic sessions (older than 2 months, various dates/times) ----
  if include_historic
    HISTORIC_SESSION_OFFSETS.each do |days_ago, hour|
      d = days_ago.days.ago.to_date
      base_time = Time.zone.local(d.year, d.month, d.day, hour, 0, 0)
      started_at = base_time.to_i
      events = build_reporting_events(word_events, board_id, started_at, position_idx)
      position_idx += events.count { |e| e['type'] == 'button' }

      begin
        LogSession.process_new(
          { 'events' => events },
          { user: user, author: user, device: device, ip_address: '127.0.0.1' }
        )
        sessions_created += 1
        puts "  ✓ Historic session #{sessions_created} (#{d}, #{hour}:00) – #{events.count { |e| e['type'] == 'button' }} button events"
      rescue => e
        puts "  ⚠ Historic session for #{d}: #{e.message}"
      end
    end
  end

  # Clear weekly stats summaries so the next stats request uses live session data
  # (cached_daily_use would otherwise use old summaries that don't include these sessions)
  if sessions_created > 0 && defined?(WeeklyStatsSummary) && user.id
    deleted = WeeklyStatsSummary.where(user_id: user.id).delete_all
    puts "\n  Cleared #{deleted} weekly summary rows so reports use new session data."
  end

  puts "\n✓ Created #{sessions_created} session logs for #{user.user_name}"
  puts "  Words in seed: #{REPORTING_SEED_WORDS.map { |w, c| "#{w}(#{c})" }.join(', ')}"
  puts "  View reports at: /#{user.user_name}/stats (Last 2 Months, 2-4 Months Ago, or Custom dates)"
  sessions_created
end

def build_reporting_events(word_events, board_id, started_at, position_idx)
  events = []
  ts = started_at
  words_this_session = word_events.shuffle

  words_this_session.each_with_index do |word, idx|
    pos = HEAT_MAP_POSITIONS[position_idx % HEAT_MAP_POSITIONS.length]
    position_idx += 1
    events << {
      'type' => 'button',
      'timestamp' => ts,
      'button' => {
        'label' => word,
        'vocalization' => word,
        'button_id' => (idx % 20) + 1,
        'board' => { 'id' => board_id, 'key' => 'default' },
        'spoken' => true,
        'for_speaking' => true,
        'percent_x' => pos[0],
        'percent_y' => pos[1]
      }
    }
    ts += 2
  end

  utterance_ts = ts
  words_this_session.first(5).each_slice(2) do |slice|
    text = slice.join(' ')
    events << {
      'type' => 'utterance',
      'timestamp' => utterance_ts,
      'utterance' => { 'text' => text, 'buttons' => [] }
    }
    utterance_ts += 10
  end

  events
end
