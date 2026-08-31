# Dev-only usage seeder for Marcus Williams' caseload.
#
#   bundle exec rails runner scripts/dev-seed-marcus-usage.rb
#   bundle exec rails runner scripts/dev-seed-marcus-usage.rb dry
#   bundle exec rails runner scripts/dev-seed-marcus-usage.rb teardown
#   bundle exec rails runner scripts/dev-seed-marcus-usage.rb summaries
#
# WHY THIS EXISTS: the seeded demo caseload's LogSession data stops at 2026-07-01,
# so every Reports / caseload view is empty for the current period and nothing
# exercises the "recent usage" paths. This fills 2026-07-02 through 2026-08-17.
#
# VOLUMES VARY BY DESIGN — three tiers, so the caseload shows genuinely high and
# genuinely low communicators rather than one flat rate. The tiers preserve each
# communicator's EXISTING character (measured over their Apr-Jul history: gabriel
# 6.71 sessions/day and ethan 5.97 at the top, aiden 0.75 and fiona 0.79 at the
# bottom), so seeded data reads as a continuation rather than a step change.
#
# Sessions are created through LogSession.process_new — the real ingestion path —
# so `data['stats']` is computed by the model exactly as production would compute
# it. Hand-writing that blob would drift from generate_stats.
#
# WRITING SESSIONS IS NOT ENOUGH. Reports do NOT read LogSession directly once a
# user has any summaries: Stats.cached_daily_use (lib/stats.rb:5-16) falls back to
# raw sessions ONLY when the user has zero WeeklyStatsSummary rows, and these
# users have them from their Apr-Jul history — so new sessions in un-summarised
# weeks are simply invisible in the UI. LogSession's after_save schedules that
# summary work as a Resque job, which never runs without a worker. So this script
# builds the summaries itself (WeeklyStatsSummary.update_now, the same call
# lib/tasks/generate_stats.rake makes) after seeding, and again after teardown so
# removed sessions stop showing.
#
# Idempotent both ways: every session it writes carries data['seed_marker'], and
# teardown deletes only rows carrying it. Pre-existing sessions have no marker and
# are never touched. Follows scripts/dev-seed-caseload-badges.rb.
MARKER = 'MARCUS_USAGE_JUL_AUG_2026'.freeze
SUPERVISOR = 'marcus_williams_slp'.freeze
START_DATE = Date.new(2026, 7, 2)
END_DATE   = Date.new(2026, 8, 17)

# Guard: this writes hundreds of records and must never touch a real database.
unless Rails.env.development?
  abort("REFUSING TO RUN: this is a development-only seeder (Rails.env=#{Rails.env}).")
end

# sessions/day ranges per tier. Low-tier users also skip most days entirely
# (see `active_day?`), which is what makes them read as low-usage rather than
# merely quieter.
TIERS = {
  'high'   => { users: %w[gabriel_wilson ethan_brown kevin_anderson nora_white bella_martinez], per_day: (5..8),  weekend: 0.5, skip: 0.05 },
  'medium' => { users: %w[jasmine_nguyen daisy_johnson hannah_lee charlie_kim mason_clark luna_garcia], per_day: (2..3), weekend: 0.35, skip: 0.20 },
  'low'    => { users: %w[aiden_parker fiona_davis isaac_thompson], per_day: (1..2), weekend: 0.0, skip: 0.65 }
}.freeze

WORDS = {
  'core'    => %w[go stop more want need help please yes no like my turn all done],
  'social'  => %w[hi bye thank you sorry my turn your turn look],
  'feeling' => %w[happy sad mad tired excited]
}.freeze

# Rebuild the weekly summaries Reports actually reads, for every week the seeded
# range touches. Cheap and safe to re-run: update_now recomputes a week from its
# sessions, so it self-corrects whether sessions were added or deleted.
def refresh_summaries(supervisees)
  weekyears = (START_DATE..END_DATE).map { |d| WeeklyStatsSummary.date_to_weekyear(d) }.uniq.sort
  puts "\nrefreshing #{weekyears.length} weekly summaries per user (#{weekyears.first}..#{weekyears.last})"
  built = 0
  supervisees.each do |s|
    ok = 0
    weekyears.each do |wy|
      begin
        WeeklyStatsSummary.update_now(s.id, wy)
        ok += 1
      rescue => e
        puts "    WARN #{s.user_name} #{wy}: #{e.message}"
      end
    end
    built += ok
    puts format('  %-18s %d weeks', s.user_name, ok)
  end
  puts "refreshed #{built} summaries"
end

def tier_for(user_name)
  TIERS.each { |name, cfg| return [name, cfg] if cfg[:users].include?(user_name) }
  [nil, nil]
end

if ARGV.include?('teardown')
  sup = User.find_by_path(SUPERVISOR)
  abort("supervisor #{SUPERVISOR} not found") unless sup
  removed = 0
  sup.supervisees.each do |s|
    marked = LogSession.where(user_id: s.id).select { |ls| (ls.data || {})['seed_marker'] == MARKER }
    next if marked.empty?
    puts format('  DELETE %-18s %d sessions', s.user_name, marked.length)
    marked.each { |ls| ls.destroy; removed += 1 }
  end
  puts "\nremoved=#{removed}"
  refresh_summaries(sup.supervisees)
  exit
end

if ARGV.include?('summaries')
  sup = User.find_by_path(SUPERVISOR)
  abort("supervisor #{SUPERVISOR} not found") unless sup
  refresh_summaries(sup.supervisees)
  exit
end

DRY = ARGV.include?('dry')
# Seeded so a `dry` run is a good ESTIMATE of a real one — but not an exact one,
# and re-running after teardown does NOT reproduce the previous data byte for
# byte. Measured: dry reported 1619 sessions, the real run created 1595. The gap
# is LogSession.process_new and its callbacks consuming from the same Kernel#rand
# stream, which the dry path skips. Close enough to preview volumes with; don't
# rely on it for reproducibility.
srand(20260817)

sup = User.find_by_path(SUPERVISOR)
abort("supervisor #{SUPERVISOR} not found") unless sup

puts "#{DRY ? 'DRY RUN — ' : ''}seeding #{START_DATE} .. #{END_DATE} for #{SUPERVISOR}'s caseload"
puts

total = 0
sup.supervisees.each do |s|
  tier_name, cfg = tier_for(s.user_name)
  unless cfg
    puts format('  SKIP   %-18s (no tier assigned)', s.user_name)
    next
  end

  # Reuse the communicator's OWN device and board so the seeded rows join their
  # existing history cleanly (board_keys / device breakdowns in Reports stay
  # coherent instead of sprouting a second synthetic device).
  sample = LogSession.where(user_id: s.id, log_type: 'session').order('started_at desc').first
  ev = ((sample&.data || {})['events'] || []).select { |e| e['type'] == 'button' }
  board = ev.map { |e| e.dig('button', 'board') }.compact.first || { 'id' => '1_55', 'key' => 'sarah_chen_slp/demo_district_home' }
  device = sample&.device || Device.where(user_id: s.id).first
  unless device
    puts format('  SKIP   %-18s (no device)', s.user_name)
    next
  end

  made = 0
  (START_DATE..END_DATE).each do |day|
    weekend = [0, 6].include?(day.wday)
    next if rand < cfg[:skip]
    next if weekend && rand > cfg[:weekend]

    count = rand(cfg[:per_day])
    count = [(count * 0.6).round, 1].max if weekend
    next if count < 1

    count.times do
      # School-day window, each session a short burst so the model's
      # split_out_later_sessions never splits one seeded session into several.
      start = Time.new(day.year, day.month, day.day, 8 + rand(8), rand(60), 0)
      words = (WORDS['core'].sample(rand(3..6)) + WORDS.values.flatten.sample(rand(0..2))).uniq
      events = []
      t = start.to_i
      words.each_with_index do |w, i|
        t += rand(4..25)
        events << {
          'type' => 'button',
          'button' => {
            'label' => w, 'vocalization' => w, 'button_id' => i + 1,
            'board' => board, 'spoken' => true, 'for_speaking' => true, 'type' => 'speak',
            'depth' => 0, 'percent_x' => rand.round(4), 'percent_y' => rand.round(4)
          },
          'system' => 'iOS', 'browser' => 'Safari',
          'window_width' => 1024, 'window_height' => 768,
          'timestamp' => t
        }
      end
      t += rand(3..10)
      events << { 'type' => 'utterance', 'utterance' => { 'text' => words.join(' '), 'buttons' => [] }, 'timestamp' => t }

      unless DRY
        LogSession.process_new(
          { 'events' => events },
          { user: s, author: s, device: device, ip_address: '10.0.6.27' }
        ).tap do |ls|
          ls.data['seed_marker'] = MARKER
          ls.save!
        end
      end
      made += 1
    end
  end
  total += made
  puts format('  %-6s %-18s +%-4d sessions', tier_name, s.user_name, made)
end

puts
puts "#{DRY ? 'would create' : 'created'} #{total} sessions"
refresh_summaries(sup.supervisees) unless DRY
puts "\nteardown: bundle exec rails runner scripts/dev-seed-marcus-usage.rb teardown" unless DRY
