# Creates (or resets) the synthetic org and managers e2e/menu-positions.spec.js signs in as.
# LOCAL DEV DATABASE ONLY. Every value here is made up.
#
#   DB_USER=... bin/rails runner app/frontend/e2e/support/users-org-nav.rb
#
# Two managers of one org, both in Modern: one saved in Gentle, one in Focused, so each layout is
# measured with its saved setting rather than one switched in the page.
require_relative 'local_e2e'
assert_local_e2e_database!

ORG_NAME = 'E2E Menu Positions Org'

org = nil
Organization.find_each { |o| org = o if o.settings['name'] == ORG_NAME }
org ||= Organization.create!(settings: { 'name' => ORG_NAME })

{
  'e2e_orgnav_gentle' => 'gentle',
  'e2e_orgnav_focused' => 'focused'
}.each do |user_name, layout|
  user = e2e_user(user_name, 'board_view_style' => 'modern', 'dashboard_layout' => layout, 'role' => 'supporter')
  org.add_manager(user.user_name, true) unless org.manager?(user.reload)
end
puts "seeded org nav e2e users (org #{org.global_id})"
