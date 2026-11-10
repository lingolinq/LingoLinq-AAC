# Creates (or resets) the synthetic org and users e2e/menu-positions.spec.js signs in as.
# LOCAL DEV DATABASE ONLY. Every value here is made up.
#
#   DB_USER=... bin/rails runner app/frontend/e2e/support/users-org-nav.rb
#
# Three managers of one org, each measured with its SAVED view and layout rather than one switched
# in the page: Modern Gentle, Modern Focused, and Basic Focused (Basic's rail must not move when the
# Modern rules change). And one supervisor of the org, in Modern, who can view the org but not edit
# it, so gets no org tabs and keeps the account rail.
require_relative 'local_e2e'
assert_local_e2e_database!

ORG_NAME = 'E2E Menu Positions Org'

org = nil
Organization.find_each { |o| org = o if o.settings['name'] == ORG_NAME }
org ||= Organization.create!(settings: { 'name' => ORG_NAME })

{
  'e2e_orgnav_gentle' => { 'board_view_style' => 'modern', 'dashboard_layout' => 'gentle' },
  'e2e_orgnav_focused' => { 'board_view_style' => 'modern', 'dashboard_layout' => 'focused' },
  'e2e_orgnav_basic' => { 'board_view_style' => 'classic', 'dashboard_layout' => 'focused' }
}.each do |user_name, prefs|
  user = e2e_user(user_name, prefs.merge('role' => 'supporter'))
  org.add_manager(user.user_name, true) unless org.manager?(user.reload)
end

viewer = e2e_user('e2e_orgnav_viewer', 'board_view_style' => 'modern', 'dashboard_layout' => 'gentle', 'role' => 'supporter')
org.add_supervisor(viewer.user_name, false) unless org.supervisor?(viewer.reload)
puts "seeded org nav e2e users (org #{org.global_id})"
