desc "Generate WeeklyStatsSummary records for all users with existing LogSession data"
task :generate_weekly_stats => :environment do
  puts "Generating WeeklyStatsSummary records for users with log data..."

  # Find all users who have session-type log data
  user_ids_with_sessions = LogSession.where(log_type: 'session')
    .where('started_at IS NOT NULL')
    .where('data IS NOT NULL')
    .distinct.pluck(:user_id)

  if user_ids_with_sessions.empty?
    puts "No users found with session data."
    next
  end

  users = User.where(id: user_ids_with_sessions)
  puts "Found #{users.count} users with session data."

  total_summaries = 0
  total_updated_prefs = 0

  users.find_each do |user|
    # Ensure user preferences are set for reports
    user.settings ||= {}
    user.settings['preferences'] ||= {}
    changed = false

    unless user.settings['preferences']['allow_log_reports']
      user.settings['preferences']['allow_log_reports'] = true
      changed = true
    end
    unless user.settings['preferences']['logging']
      user.settings['preferences']['logging'] = true
      changed = true
    end
    if changed
      user.save(touch: false)
      total_updated_prefs += 1
    end

    # Find all unique weekyears for this user's sessions
    sessions = LogSession.where(user_id: user.id, log_type: 'session')
      .where('started_at IS NOT NULL')

    # First ensure generate_stats has been called on sessions that might be missing stats
    sessions_without_stats = sessions.select { |s| s.data && (!s.data['stats'] || s.data['stats'].empty?) }
    if sessions_without_stats.any?
      puts "  #{user.user_name}: regenerating stats for #{sessions_without_stats.length} sessions..."
      sessions_without_stats.each do |session|
        begin
          session.generate_stats
          session.save(touch: false)
        rescue => e
          puts "    Warning: failed to generate stats for session #{session.global_id}: #{e.message}"
        end
      end
    end

    weekyears = sessions.map { |s|
      WeeklyStatsSummary.date_to_weekyear(s.started_at.utc.to_date)
    }.uniq.sort

    if weekyears.empty?
      puts "  #{user.user_name}: no sessions found, skipping"
      next
    end

    puts "  #{user.user_name}: generating summaries for #{weekyears.length} weeks (#{weekyears.first}..#{weekyears.last})"

    weekyears.each do |weekyear|
      begin
        WeeklyStatsSummary.update_now(user.id, weekyear)
        total_summaries += 1
      rescue => e
        puts "    Warning: failed to generate summary for weekyear #{weekyear}: #{e.message}"
      end
    end
  end

  puts "\nDone!"
  puts "  Updated preferences for #{total_updated_prefs} users"
  puts "  Generated #{total_summaries} WeeklyStatsSummary records"
end

desc "Generate WeeklyStatsSummary records for Demo School District seeded users only"
task :generate_demo_stats => :environment do
  puts "Generating WeeklyStatsSummary records for Demo School District..."

  demo_org = Organization.where(admin: false).detect { |o|
    o.settings && o.settings['name'] == 'Demo School District'
  }

  unless demo_org
    puts "Demo School District organization not found. Run db:seed first."
    next
  end

  puts "Found org: #{demo_org.settings['name']} (#{demo_org.global_id})"

  # Get all users attached to this org (communicators)
  org_users = demo_org.users
  if org_users.empty?
    puts "No users found in the organization."
    next
  end

  puts "Found #{org_users.count} users in the organization."

  total_summaries = 0
  total_updated_prefs = 0
  total_events_patched = 0
  total_stats_regenerated = 0

  org_users.find_each do |user|
    # Ensure user preferences are set for reports
    user.settings ||= {}
    user.settings['preferences'] ||= {}
    changed = false

    unless user.settings['preferences']['allow_log_reports']
      user.settings['preferences']['allow_log_reports'] = true
      changed = true
    end
    unless user.settings['preferences']['logging']
      user.settings['preferences']['logging'] = true
      changed = true
    end
    unless user.settings['preferences']['role'] == 'communicator'
      user.settings['preferences']['role'] = 'communicator'
      changed = true
    end
    if changed
      user.save(touch: false)
      total_updated_prefs += 1
    end

    # Find all sessions for this user
    sessions = LogSession.where(user_id: user.id, log_type: 'session')
      .where('started_at IS NOT NULL')

    session_count = sessions.count
    if session_count == 0
      puts "  #{user.user_name}: no sessions, skipping"
      next
    end

    # Patch + regenerate stats for all sessions
    # Early seeded data was missing button_id on button events, which
    # caused generate_stats to skip all word/button counting. This patches
    # the raw event data to add the missing button_id, then regenerates.
    sessions.find_each do |session|
      needs_patch = false
      needs_regen = false

      if session.data && session.data['events']
        session.data['events'].each_with_index do |event, idx|
          if event['type'] == 'button' && event['button'] && !event['button']['button_id']
            event['button']['button_id'] = (idx + 1).to_s
            needs_patch = true
          end
          # Also add percent_travel if missing (for word travel stats)
          if event['type'] == 'button' && event['button'] && !event['button']['percent_travel']
            depth = event['button']['depth'] || 0
            event['button']['percent_travel'] = depth > 0 ? rand(0.1..0.5).round(3) : rand(0.01..0.15).round(3)
            needs_patch = true
          end
        end
      end

      # Check if stats are missing word counts (sign of the button_id bug)
      if session.data && session.data['stats']
        word_counts = session.data['stats']['all_word_counts'] || {}
        if word_counts.empty? && session.data['events'] && session.data['events'].any? { |e| e['type'] == 'button' }
          needs_regen = true
        end
      else
        needs_regen = true
      end

      if needs_patch || needs_regen
        begin
          total_events_patched += 1 if needs_patch
          # Call generate_stats first (before setting skip flag, since
          # skip_extra_data_processing? checks @skip_extra_data_update)
          session.generate_stats
          # Now set the skip flag to prevent after_save callbacks from
          # scheduling background jobs we don't need
          session.instance_variable_set(:@skip_extra_data_update, true)
          session.save(touch: false)
          session.instance_variable_set(:@skip_extra_data_update, false)
          total_stats_regenerated += 1
        rescue => e
          session.instance_variable_set(:@skip_extra_data_update, false)
          # Skip individual failures
        end
      end
    end

    # Collect unique weekyears
    weekyears = Set.new
    sessions.find_each do |session|
      weekyears << WeeklyStatsSummary.date_to_weekyear(session.started_at.utc.to_date)
    end
    weekyears = weekyears.to_a.sort

    puts "  #{user.user_name}: #{session_count} sessions across #{weekyears.length} weeks"

    weekyears.each do |weekyear|
      begin
        WeeklyStatsSummary.update_now(user.id, weekyear)
        total_summaries += 1
        print "."
      rescue => e
        print "x"
        puts "\n    Warning: weekyear #{weekyear} failed: #{e.message}"
      end
    end
    puts ""
  end

  puts "\nDone!"
  puts "  Updated preferences for #{total_updated_prefs} users"
  puts "  Patched events in #{total_events_patched} sessions (added missing button_id)"
  puts "  Regenerated stats for #{total_stats_regenerated} sessions"
  puts "  Generated #{total_summaries} WeeklyStatsSummary records"
  puts "\nStats should now be visible in the dashboard for all Demo School District students."
end
