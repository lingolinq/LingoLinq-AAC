# Dev-only seeder for the caseload badge click-tests (findings H5 and M9).
#
#   bundle exec rails runner scripts/dev-seed-caseload-badges.rb
#   bundle exec rails runner scripts/dev-seed-caseload-badges.rb teardown
#
# WHY THIS EXISTS: the seeded demo caseload has 16 communicators and exactly ONE
# UserBadge between them, so neither finding can be exercised against it —
#   M9 (badges capped at 10 for the whole caseload) needs >10 badges;
#   H5 (badge race captions one communicator's badge with another's name) needs
#      two rows whose badges are DISTINGUISHABLE, which one badge cannot give.
# db/seeds.rb creates no badges at all, so there is no seed pattern to extend;
# this follows the spec suite's construction instead
# (spec/controllers/api/badges_controller_spec.rb:26).
#
# Idempotent both ways: every row it writes carries data['seed_marker'], and
# teardown deletes only rows carrying it. The pre-existing aiden_parker badge has
# no marker and is never touched.
MARKER = 'M9H5_CLICKTEST'.freeze
NAME_PREFIX = 'Seed Badge for '.freeze

USER_NAMES = %w[
  aiden_parker bella_martinez charlie_kim daisy_johnson ethan_brown
  fiona_davis gabriel_wilson oliver_harris penelope_scott quinn_taylor
  ruby_adams sam_mitchell tessa_campbell
].freeze

def seeded?(badge)
  data = badge.data || {}
  data['seed_marker'] == MARKER || data['name'].to_s.start_with?(NAME_PREFIX)
end

if ARGV.include?('teardown')
  removed = 0
  UserBadge.where(user_id: User.where(user_name: USER_NAMES).pluck(:id)).each do |badge|
    next unless seeded?(badge)
    puts format('  DELETE %-18s -> %-34s id=%s', badge.user&.user_name.to_s, (badge.data || {})['name'].to_s, badge.global_id)
    badge.destroy
    removed += 1
  end
  puts "\nremoved=#{removed}  total UserBadge rows now: #{UserBadge.count}"
  exit 0
end

created = 0
skipped = 0
missing = []

USER_NAMES.each_with_index do |user_name, idx|
  user = User.find_by(user_name: user_name)
  if user.nil?
    missing << user_name
    puts "  MISSING USER: #{user_name}"
    next
  end

  # `data` is secure_serialize'd (user_badge.rb:26) so it cannot be filtered in
  # SQL; the dev badge table is tiny, so filter in Ruby.
  existing = UserBadge.where(user_id: user.id).detect { |b| seeded?(b) }
  if existing
    skipped += 1
    puts format('  SKIP   %-18s -> %-34s id=%s', user_name, existing.data['name'], existing.global_id)
    next
  end

  badge = UserBadge.new
  badge.user = user
  # Goal-less on purpose: user_goal is optional (user_badge.rb:12), and attaching
  # one would let update_badge_data overwrite data['name'] (user_badge.rb:160),
  # destroying the per-user name this test identifies rows by.
  badge.user_goal = nil
  badge.level = 1 + (idx % 3)
  # earned:false keeps json_api/badge.rb emitting `progress`, satisfies the Ember
  # in-progress filter (models/badge.js:321), and means notify_on_earned never
  # schedules a background job (user_badge.rb:70) — safe with Redis down.
  badge.earned = false
  # Explicit false, not nil: both columns are nullable with no default
  # (db/schema.rb:648,655) and the index filters use `where(... => false)`,
  # which does not match NULL (badges_controller.rb:18,28).
  badge.superseded = false
  badge.disabled = false
  # Sorts first under `highlighted DESC, id DESC` (badges_controller.rb:36), so
  # this badge deterministically wins best_next_badge over any pre-existing one.
  badge.highlighted = true
  badge.data = {
    'name' => "#{NAME_PREFIX}#{user_name}",
    # Distinct per user so a cross-communicator mix-up is visible in the progress
    # bar as well as the name — two independent signals for H5.
    'percent' => (0.15 + (idx * 0.05)).round(2),
    # No 'progress_expires' (a past one zeroes progress, user_badge.rb:183) and
    # no 'earn_recorded' (that would mark it earned, user_badge.rb:40).
    'badge_level' => {
      'level' => 1 + (idx % 3),
      'instance_count' => 25,
      'word_instances' => true,
      'matching_units' => 5,
      'interval' => 'date'
    },
    'seed_marker' => MARKER
  }
  badge.save!
  created += 1
  puts format('  CREATE %-18s -> %-34s id=%-6s progress=%.2f', user_name, badge.data['name'], badge.global_id, badge.current_progress)
end

puts "\ncreated=#{created} skipped=#{skipped} missing=#{missing.inspect}"
puts "total UserBadge rows now: #{UserBadge.count}"
