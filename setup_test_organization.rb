#!/usr/bin/env ruby
# Setup script to create a test organization and link a user as manager
# Run this in Rails console: load 'setup_test_organization.rb'

puts "\n" + "="*80
puts "SETUP TEST ORGANIZATION"
puts "="*80 + "\n"

# Get username
puts "Enter username to make a manager (or press Enter for 'example'):"
username = STDIN.gets.chomp
username = 'example' if username.empty?

user = User.find_by(user_name: username)
unless user
  puts "❌ User '#{username}' not found!"
  puts "Available users:"
  User.limit(10).each { |u| puts "  - #{u.user_name}" }
  exit
end

puts "\n✓ Found user: #{user.user_name} (#{user.global_id})"

# Check if admin org exists
admin_org = Organization.where(admin: true).first
if admin_org
  puts "\n✓ Found admin organization: #{admin_org.settings['name']} (#{admin_org.global_id})"
  use_admin = false
  puts "Use admin organization? (y/n, default: n):"
  use_admin = STDIN.gets.chomp.downcase == 'y'
  
  if use_admin
    org = admin_org
  else
    # Create new org
    puts "\nCreating new test organization..."
    org = Organization.create(
      settings: {
        'name' => 'Test Organization',
        'org_access' => true,
        'premium' => true
      }
    )
    puts "✓ Created organization: #{org.settings['name']} (#{org.global_id})"
  end
else
  # Create new org
  puts "\nCreating new test organization..."
  org = Organization.create(
    settings: {
      'name' => 'Test Organization',
      'org_access' => true,
      'premium' => true
    }
  )
  puts "✓ Created organization: #{org.settings['name']} (#{org.global_id})"
end

# Check if user is already a manager
if org.manager?(user)
  puts "\n⚠ User is already a manager of this organization"
  puts "Do you want to re-add them? (y/n, default: n):"
  re_add = STDIN.gets.chomp.downcase == 'y'
  unless re_add
    puts "Skipping..."
  else
    org.remove_manager(user.user_name)
    org.reload
  end
end

# Add user as manager
unless org.manager?(user)
  puts "\nAdding user as full manager..."
  result = org.add_manager(user.user_name, true)  # true = full manager
  if result
    puts "✓ Successfully added #{user.user_name} as manager"
  else
    puts "❌ Failed to add manager"
    exit
  end
else
  puts "\n✓ User is already a manager"
end

# Verify org_access is enabled
if org.settings['org_access'] != false
  puts "✓ org_access is enabled"
else
  puts "⚠ Enabling org_access..."
  org.settings['org_access'] = true
  org.save
  puts "✓ org_access enabled"
end

# Reload user to get updated organizations
user.reload
orgs = Organization.attached_orgs(user)
managed_orgs = orgs.select { |o| o['type'] == 'manager' && o['restricted'] != true }

puts "\n" + "="*80
puts "SETUP COMPLETE"
puts "="*80

puts "\n✓ Organization: #{org.settings['name']}"
puts "  ID: #{org.global_id}"
puts "  URL: /organizations/#{org.global_id}"

puts "\n✓ User: #{user.user_name}"
puts "  Managed orgs: #{managed_orgs.length}"

# Check permissions
perms = org.permissions_for(user)
puts "\n✓ Permissions: #{perms.keys.join(', ')}"

if perms['edit'] || perms['manage']
  puts "  → Settings button should appear!"
else
  puts "  ⚠ Missing edit/manage permission"
end

puts "\n" + "-"*80
puts "NEXT STEPS:"
puts "-"*80
puts "1. In browser, log out and log back in"
puts "2. Check index page for 'Organization Management' link"
puts "3. Or navigate directly to: /organizations/#{org.global_id}"
puts "4. In browser console, verify:"
puts "   app_state.get('currentUser.organizations')"
puts "   app_state.get('currentUser.managed_orgs')"
puts "   app_state.get('currentUser.has_management_responsibility')"
puts "\n"

