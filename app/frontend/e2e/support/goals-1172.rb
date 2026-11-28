# Creates (or resets) the synthetic user and goals the goal-chart spec signs in as
# (e2e/goal-chart-labels.spec.js). LOCAL DEV DATABASE ONLY. Every value here is made up.
#
#   DB_USER=... bin/rails runner app/frontend/e2e/support/goals-1172.rb
#
# Re-run it before each spec run: the sessions are placed relative to today, and the
# weekly goal only charts by week while its sessions are inside the last 12 weeks.
require_relative 'local_e2e'
assert_local_e2e_database!

user = e2e_user('e2e_goals_1172', 'board_view_style' => 'modern')
device = Device.where(user_id: user.id).first || Device.create!(user: user)

# Start from nothing each run, so the charts hold only the sessions below.
LogSession.where(user_id: user.id).delete_all
UserGoal.where(user_id: user.id).delete_all

# A goal with one "We did good! (3)" status note at each of times. Saving the goal rebuilds
# its stats from those sessions (UserGoal#generate_stats).
def e2e_goal(user, device, summary, times)
  goal = UserGoal.process_new({ 'summary' => summary, 'active' => true }, { user: user, author: user })
  times.each do |time|
    LogSession.process_new({
      'goal_id' => goal.global_id,
      'goal_status' => 3,
      'note' => { 'text' => 'e2e status note', 'timestamp' => time.to_i }
    }, { user: user, author: user, device: device })
  end
  goal.reload.save!
  goal
end

# Times on either side of a local midnight, so UTC grouping and local grouping disagree:
# 23:30 UTC is already the next day in Berlin (00:30 or 01:30), and 06:30 UTC is still the day
# before in Los Angeles (22:30 or 23:30).
def late_utc(date)
  Time.utc(date.year, date.month, date.day, 23, 30)
end

def early_utc(date)
  Time.utc(date.year, date.month, date.day, 6, 30)
end

today = Time.now.utc.to_date
saturday = today - 17
saturday -= 1 until saturday.saturday?
month_end = (today << 3).end_of_month

# Sessions older than 12 weeks, so the app charts this goal by month. The last pair sits on a
# month boundary: the last day of a month, late, and the 1st of the next, early.
monthly = e2e_goal(user, device, 'E2E Monthly Goal',
  [5.days.ago, 40.days.ago, 130.days.ago, late_utc(month_end), early_utc(month_end + 1)])
# Every session inside the last 12 weeks but none in the last 2, so the app charts it by week. The
# last pair sits on a week boundary: a Saturday, late, and the Sunday after, early.
weekly = e2e_goal(user, device, 'E2E Weekly Goal',
  [16.days.ago, 30.days.ago, 45.days.ago, late_utc(saturday), early_utc(saturday + 1)])
# Every session inside the last 2 weeks, so the app charts it by day, around two midnights.
daily = e2e_goal(user, device, 'E2E Daily Goal',
  [3.days.ago, late_utc(today - 5), early_utc(today - 8)])

puts({ user: user.user_name, monthly: monthly.global_id, weekly: weekly.global_id, daily: daily.global_id,
       levels: [monthly, weekly, daily].map { |g| g.settings['stats'] && g.settings['stats']['suggested_level'] } }.to_json)
