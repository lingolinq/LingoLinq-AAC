# Diagnostic for geo/location stats pipeline.
# Run: bundle exec rake diagnose_geo
# Or for a specific user: bundle exec rake diagnose_geo[username]

def run_geo_diagnostic(user_name = 'example')
  puts "\n" + "=" * 60
  puts "Geo/Location Stats Diagnostic for user: #{user_name}"
  puts "=" * 60

  user = User.find_by(user_name: user_name)
  unless user
    puts "\n❌ User '#{user_name}' not found."
    return
  end
  puts "\n✓ User found: #{user.global_id}"

  # 1. Geo logging preference
  geo_logging = user.settings.dig('preferences', 'geo_logging')
  puts "\n--- Geo Logging ---"
  puts "  preferences.geo_logging: #{geo_logging.inspect}"
  if !geo_logging
    puts "  ⚠️  Geo logging is OFF - the Locations map section is HIDDEN in the UI!"
    puts "     Fix: bundle exec rails runner \"u=User.find_by(user_name:'#{user_name}'); u.settings['preferences']||={}; u.settings['preferences']['geo_logging']=true; u.save!\""
  end

  # 2. Sessions with geo data
  puts "\n--- Log Sessions ---"
  total_sessions = LogSession.where(user_id: user.id, log_type: 'session').count
  puts "  Total session logs: #{total_sessions}"

  cutoff = ClusterLocation.clusterize_cutoff
  puts "  Clusterize cutoff (sessions must be after): #{cutoff}"

  sessions_with_geo = LogSession.where(user_id: user.id, log_type: 'session')
    .select { |s| s.data && s.data['geo'] }
  puts "  Sessions with data['geo']: #{sessions_with_geo.length}"

  sessions_with_geo_cluster = LogSession.where(user_id: user.id, log_type: 'session')
    .where.not(geo_cluster_id: [nil, -1])
  puts "  Sessions with geo_cluster_id set: #{sessions_with_geo_cluster.count}"

  recent_sessions = LogSession.where(user_id: user.id, log_type: 'session')
    .where(['started_at > ?', cutoff])
  puts "  Sessions after cutoff (eligible for clustering): #{recent_sessions.count}"

  if sessions_with_geo_cluster.any?
    sample = sessions_with_geo_cluster.first
    puts "  Sample session geo_cluster_id: #{sample.geo_cluster_id}, started_at: #{sample.started_at}"
  end

  # 3. ClusterLocation records
  puts "\n--- Cluster Locations ---"
  geo_clusters = ClusterLocation.where(user_id: user.id, cluster_type: 'geo')
  ip_clusters = ClusterLocation.where(user_id: user.id, cluster_type: 'ip_address')
  puts "  Geo clusters: #{geo_clusters.count}"
  puts "  IP clusters: #{ip_clusters.count}"

  geo_clusters.each_with_index do |c, i|
    geo = c.data && c.data['geo']
    lat_lng = geo ? "#{geo[0]}, #{geo[1]}" : 'nil'
    session_count = LogSession.where(geo_cluster_id: c.id).count
    puts "    Geo cluster #{i + 1}: id=#{c.global_id}, data['geo']=#{lat_lng}, sessions=#{session_count}"
  end

  # 4. Stats API response
  puts "\n--- Stats API (daily_use) ---"
  start_at = 2.months.ago
  end_at = Time.now + 1.day
  options = { start_at: start_at, end_at: end_at }
  Stats.sanitize_find_options!(options, user)

  begin
    if WeeklyStatsSummary.where(user_id: user.id).count > 0
      res = Stats.cached_daily_use(user.global_id, options)
      puts "  Used cached_daily_use (WeeklyStatsSummary exists)"
    else
      res = Stats.daily_use(user.global_id, options)
      puts "  Used daily_use (no WeeklyStatsSummary)"
    end

    locations = res[:locations] || []
    geo_locs = locations.select { |l| l[:type] == 'geo' }
    ip_locs = locations.select { |l| l[:type] == 'ip_address' }

    puts "  locations in response: #{locations.length} total"
    puts "  geo locations: #{geo_locs.length}"
    puts "  ip locations: #{ip_locs.length}"

    if geo_locs.any?
      puts "  Geo location sample: #{geo_locs.first.inspect}"
    else
      puts "  ⚠️  No geo locations in API response - map will show no markers"
    end
  rescue => e
    puts "  ❌ Error: #{e.message}"
    puts e.backtrace.first(3).join("\n")
  end

  # 5. Summary
  puts "\n--- Summary ---"
  issues = []
  issues << "Enable geo_logging for user" if !geo_logging
  issues << "No sessions with geo data - re-run db:seed or create sessions with geo events" if sessions_with_geo.empty?
  issues << "Sessions not clustered - run ClusterLocation.clusterize_geos('#{user.global_id}')" if sessions_with_geo.any? && geo_clusters.empty?
  issues << "Geo clusters missing data['geo'] - run cluster.generate_stats(true) on each" if geo_clusters.any? && geo_clusters.any? { |c| !c.data || !c.data['geo'] }

  if issues.empty?
    puts "  ✓ Pipeline looks healthy. If map still empty, check date range and browser console."
  else
    puts "  Issues to fix:"
    issues.each { |i| puts "    - #{i}" }
  end

  puts "\n" + "=" * 60
end

namespace :diagnose do
  desc "Diagnose geo/location stats pipeline for example user (or rake diagnose:geo[username])"
  task :geo, [:user_name] => :environment do |_t, args|
    user_name = args[:user_name] || 'example'
    run_geo_diagnostic(user_name)
  end
end

# Allow: rake diagnose_geo or rake diagnose_geo[example]
task :diagnose_geo, [:user_name] => :environment do |_t, args|
  user_name = args[:user_name] || 'example'
  run_geo_diagnostic(user_name)
end
