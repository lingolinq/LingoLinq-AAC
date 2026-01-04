#!/usr/bin/env ruby
# Quick verification script for organization setup
# Run in Rails console: load 'verify_org_setup.rb'

puts "\n" + "="*80
puts "VERIFYING ORGANIZATION SETUP FOR mellomellie"
puts "="*80 + "\n"

user = User.find_by(user_name: 'mellomellie')
unless user
  puts "❌ User 'mellomellie' not found!"
  exit
end

puts "✓ User found: #{user.user_name} (ID: #{user.global_id})\n"

# Check organizations
orgs = Organization.attached_orgs(user)
puts "\n1. ORGANIZATIONS ATTACHED TO USER:"
if orgs.empty?
  puts "   ❌ No organizations found!"
  puts "   → This is the problem - user needs to be linked to an organization"
else
  puts "   ✓ Found #{orgs.length} organization(s):"
  orgs.each do |org|
    puts "      - #{org['name']} (#{org['id']})"
    puts "        Type: #{org['type']}"
    puts "        Full Manager: #{org['full_manager']}" if org['type'] == 'manager'
    puts "        Restricted: #{org['restricted']}" if org['restricted']
  end
end

# Check managed orgs specifically
puts "\n2. MANAGED ORGS (for UI link):"
managed_orgs = orgs.select { |o| o['type'] == 'manager' && o['restricted'] != true }
if managed_orgs.empty?
  puts "   ❌ No managed organizations found!"
  puts "   → User needs at least one organization with type='manager' and not restricted"
else
  puts "   ✓ Found #{managed_orgs.length} managed organization(s):"
  managed_orgs.each do |org|
    puts "      - #{org['name']} (#{org['id']})"
  end
end

# Check UserLinks directly
puts "\n3. USERLINKS (database check):"
links = UserLink.links_for(user)
org_links = links.select { |l| ['org_user', 'org_manager', 'org_supervisor'].include?(l['type']) }

if org_links.empty?
  puts "   ❌ No organization UserLinks found in database!"
  puts "   → User is not linked to any organization"
else
  puts "   ✓ Found #{org_links.length} organization link(s):"
  org_links.each do |link|
    org_id = link['record_code'].split(/:/)[1]
    org = Organization.find_by_global_id(org_id)
    org_name = org ? org.settings['name'] : 'Unknown'
    puts "      - #{link['type']} → #{org_name} (#{org_id})"
    puts "        State: #{link['state'].inspect}"
    if link['type'] == 'org_manager'
      puts "        Full Manager: #{link['state']['full_manager']}"
      puts "        Restricted: #{link['state']['restricted']}" if link['state']['restricted']
    end
  end
end

# Check organization_hash
puts "\n4. ORGANIZATION HASH (what API returns):"
org_hash = user.organization_hash
if org_hash.empty?
  puts "   ❌ organization_hash is empty!"
  puts "   → This means organizations won't appear in API response"
else
  puts "   ✓ organization_hash has #{org_hash.length} entry(ies):"
  org_hash.each do |org|
    puts "      - #{org['name']} (#{org['id']})"
    puts "        Type: #{org['type']}"
    puts "        Full Manager: #{org['full_manager']}" if org['type'] == 'manager'
  end
end

# Check specific organization
puts "\n5. CHECKING ORGANIZATIONS IN DATABASE:"
Organization.all.each do |org|
  is_manager = org.manager?(user)
  is_assistant = org.assistant?(user)
  if is_manager || is_assistant
    puts "   Organization: #{org.settings['name']} (#{org.global_id})"
    puts "      Manager: #{is_manager}"
    puts "      Assistant: #{is_assistant}"
    puts "      org_access: #{org.settings['org_access']}"
    perms = org.permissions_for(user)
    puts "      Permissions: #{perms.keys.join(', ')}"
  end
end

# Summary
puts "\n" + "="*80
puts "SUMMARY"
puts "="*80

if managed_orgs.empty?
  puts "❌ ISSUE FOUND: User has no managed organizations"
  puts "\n   TO FIX, run in Rails console:"
  puts "   org = Organization.find_by_global_id('1_1')  # or your org ID"
  puts "   org.add_manager('mellomellie', true)  # true = full manager"
  puts "   user.reload"
else
  puts "✓ User has #{managed_orgs.length} managed organization(s)"
  puts "   → Organization link SHOULD appear on index page"
  puts "\n   If it's still not showing:"
  puts "   1. Log out and log back in (to refresh session)"
  puts "   2. Check browser console: app_state.get('currentUser.organizations')"
  puts "   3. Try hard refresh (Ctrl+Shift+R or Cmd+Shift+R)"
end

puts "\n"

