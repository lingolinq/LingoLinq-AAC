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

# A goal with one "We did good! (3)" status note per entry in days_ago. Saving the goal
# rebuilds its stats from those sessions (UserGoal#generate_stats).
def e2e_goal(user, device, summary, days_ago)
  goal = UserGoal.process_new({ 'summary' => summary, 'active' => true }, { user: user, author: user })
  days_ago.each do |days|
    LogSession.process_new({
      'goal_id' => goal.global_id,
      'goal_status' => 3,
      'note' => { 'text' => 'e2e status note', 'timestamp' => days.days.ago.to_i }
    }, { user: user, author: user, device: device })
  end
  goal.reload.save!
  goal
end

# Sessions older than 12 weeks, so the app charts this goal by month.
monthly = e2e_goal(user, device, 'E2E Monthly Goal', [5, 40, 130])
# Every session inside the last 12 weeks but none in the last 2, so the app charts it by week.
weekly = e2e_goal(user, device, 'E2E Weekly Goal', [16, 30, 45])

puts({ user: user.user_name, monthly: monthly.global_id, weekly: weekly.global_id,
       monthly_level: monthly.settings['stats'] && monthly.settings['stats']['suggested_level'],
       weekly_level: weekly.settings['stats'] && weekly.settings['stats']['suggested_level'] }.to_json)
