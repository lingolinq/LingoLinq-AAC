#!/usr/bin/env ruby
# Diagnostic script to check why organization UI is not displaying
# Run this in Rails console: load 'check_organization_ui.rb'

puts "\n" + "="*80
puts "ORGANIZATION UI DIAGNOSTIC CHECK"
puts "="*80 + "\n"

# Get current user (you may need to change this)
puts "Enter your username to check (or press Enter to check all users):"
username = STDIN.gets.chomp

if username.empty?
  puts "Checking all users..."
  users = User.all.limit(10)
else
  users = [User.find_by(user_name: username)]
  users.compact!
  if users.empty?
    puts "❌ User '#{username}' not found!"
    exit
  end
end

users.each do |user|
  puts "\n" + "-"*80
  puts "Checking User: #{user.user_name} (ID: #{user.global_id})"
  puts "-"*80
  
  # Check 1: User's organizations
  puts "\n1. CHECKING USER'S ORGANIZATIONS:"
  orgs = Organization.attached_orgs(user)
  if orgs.empty?
    puts "   ❌ No organizations found for this user"
    puts "   → This is why the organization link doesn't show!"
  else
    puts "   ✓ Found #{orgs.length} organization(s):"
    orgs.each do |org|
      puts "      - #{org['name']} (#{org['id']})"
      puts "        Type: #{org['type']}"
      puts "        Full Manager: #{org['full_manager']}" if org['type'] == 'manager'
      puts "        Restricted: #{org['restricted']}" if org['restricted']
      puts "        Pending: #{org['pending']}" if org['pending']
    end
  end
  
  # Check 2: Managed orgs specifically
  puts "\n2. CHECKING MANAGED ORGS (for UI link):"
  managed_orgs = orgs.select { |o| o['type'] == 'manager' && o['restricted'] != true }
  if managed_orgs.empty?
    puts "   ❌ No managed organizations found"
    puts "   → User needs to be a manager (type='manager' and not restricted)"
  else
    puts "   ✓ Found #{managed_orgs.length} managed organization(s):"
    managed_orgs.each do |org|
      puts "      - #{org['name']} (#{org['id']})"
    end
  end
  
  # Check 3: Organization permissions
  puts "\n3. CHECKING ORGANIZATION PERMISSIONS:"
  orgs.each do |org_hash|
    org = Organization.find_by_global_id(org_hash['id'])
    next unless org
    
    puts "\n   Organization: #{org.settings['name']} (#{org.global_id})"
    perms = org.permissions_for(user)
    puts "   Permissions: #{perms.keys.join(', ')}"
    
    if perms['edit'] || perms['manage']
      puts "   ✓ Has edit/manage permission - Settings button should show"
    else
      puts "   ❌ No edit/manage permission - Settings button won't show"
      puts "      Checking why..."
      
      # Check org_access setting
      if org.settings['org_access'] == false
        puts "      ❌ org_access is disabled"
        puts "      → Fix: org.settings['org_access'] = true; org.save"
      else
        puts "      ✓ org_access is enabled"
      end
      
      # Check if user is manager
      if org.manager?(user)
        puts "      ✓ User is a manager"
      elsif org.assistant?(user)
        puts "      ⚠ User is an assistant (not full manager)"
        puts "      → Assistants have limited permissions"
      else
        puts "      ❌ User is not a manager or assistant"
        puts "      → Fix: org.add_manager('#{user.user_name}', true)"
      end
    end
  end
  
  # Check 4: UserLinks directly
  puts "\n4. CHECKING USERLINKS (direct database check):"
  links = UserLink.links_for(user)
  org_links = links.select { |l| ['org_user', 'org_manager', 'org_supervisor'].include?(l['type']) }
  
  if org_links.empty?
    puts "   ❌ No organization UserLinks found"
  else
    puts "   ✓ Found #{org_links.length} organization link(s):"
    org_links.each do |link|
      org_id = link['record_code'].split(/:/)[1]
      org = Organization.find_by_global_id(org_id)
      org_name = org ? org.settings['name'] : 'Unknown'
      puts "      - #{link['type']} → #{org_name} (#{org_id})"
      puts "        State: #{link['state'].inspect}"
    end
  end
  
  # Check 5: API response structure
  puts "\n5. CHECKING API RESPONSE STRUCTURE:"
  org_hash = user.organization_hash
  if org_hash.empty?
    puts "   ❌ organization_hash is empty"
    puts "   → This means organizations won't appear in API response"
  else
    puts "   ✓ organization_hash has #{org_hash.length} entry(ies)"
    puts "   Sample structure:"
    puts "   #{org_hash.first.inspect}" if org_hash.first
  end
  
  # Summary
  puts "\n" + "="*80
  puts "SUMMARY FOR #{user.user_name}:"
  puts "="*80
  
  if managed_orgs.empty?
    puts "❌ ISSUE: User has no managed organizations"
    puts "   → Organization link will NOT appear on index page"
    puts "\n   TO FIX:"
    puts "   org = Organization.find_by_global_id('org_id')"
    puts "   org.add_manager('#{user.user_name}', true)"
    puts "   user.reload"
  else
    puts "✓ User has #{managed_orgs.length} managed organization(s)"
    puts "   → Organization link SHOULD appear on index page"
    
    # Check if org_access is enabled
    managed_orgs.each do |org_hash|
      org = Organization.find_by_global_id(org_hash['id'])
      next unless org
      
      perms = org.permissions_for(user)
      if perms['edit'] || perms['manage']
        puts "✓ Organization '#{org.settings['name']}' has proper permissions"
        puts "   → Settings button SHOULD appear"
      else
        puts "❌ Organization '#{org.settings['name']}' missing permissions"
        puts "   → Settings button will NOT appear"
        if org.settings['org_access'] == false
          puts "   Fix: org.settings['org_access'] = true; org.save"
        end
      end
    end
  end
  
  puts "\n"
end

puts "\n" + "="*80
puts "DIAGNOSTIC COMPLETE"
puts "="*80
puts "\nNext steps:"
puts "1. If user has no managed orgs, run the setup script: load 'setup_test_organization.rb'"
puts "2. After making changes, reload the user: user.reload"
puts "3. In the browser, log out and log back in to refresh the session"
puts "4. Check browser console: app_state.get('currentUser.organizations')"
puts "\n"


