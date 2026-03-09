# Ruby script to create the requested LingoLinq users
# Usage: bundle exec rails runner create_users.rb

# Check for required classes to ensure script is running in Rails context
unless defined?(User) && defined?(Organization)
  puts "Error: Script must be run with 'bundle exec rails runner create_users.rb'"
  exit 1
end

def create_user(user_name, password, options = {})
  user = User.find_by(user_name: user_name)
  if user
    puts "Found existing user: #{user_name}. Updating password..."
  else
    puts "Creating new user: #{user_name}..."
    user = User.process_new({
      name: options[:name] || user_name.capitalize,
      user_name: user_name,
      email: options[:email] || "#{user_name}@example.com",
      public: false,
      password: password
    }, {
      is_admin: options[:is_admin] || false
    })
  end
  
  # Ensure password is set (handles hashing if needed)
  user.generate_password(password)
  
  # Setup settings and subscription
  user.settings ||= {}
  user.settings['subscription'] ||= {}
  user.settings['subscription']['never_expires'] = true
  user.settings['subscription']['plan_id'] = 'slp_monthly_granted'
  user.settings['subscription']['started'] = 1.year.ago.iso8601
  user.save!
  
  user
end

# 1. Full Authority User: larry/password
puts "--- Setting up Full Authority User ---"
larry = create_user('larry', 'password', { 
  name: 'Larry Admin', 
  email: 'larry@lingolinq.com', 
  is_admin: true 
})

# Link to Admin Organization if it exists
admin_org = Organization.find_by(admin: true)
if admin_org
  unless admin_org.managers.include?(larry)
    admin_org.add_manager(larry.user_name, true)
    puts "Linked larry to Admin Organization as manager"
  end
else
  puts "Warning: Admin Organization not found"
end

# 2. Demo District Admin: NYC_test/password
puts "\n--- Setting up Demo District Admin ---"
nyc = create_user('NYC_test', 'password', { 
  name: 'NYC Test Admin', 
  email: 'nyc_test@example.com' 
})

# Find or create a Demo School District organization
demo_org = Organization.all.find { |o| o.settings && o.settings['name'] =~ /Demo School District/i }

unless demo_org
  puts "Creating 'Demo School District' organization..."
  demo_org = Organization.create(
    admin: false,
    settings: {
      'name' => 'Demo School District',
      'total_licenses' => 50,
      'org_access' => true
    }
  )
end

# Link NYC_test to demo org as manager (administrator)
unless demo_org.managers.include?(nyc)
  demo_org.add_manager(nyc.user_name, true)
  puts "Linked NYC_test to Demo School District as manager"
end

# Also add as supervisor so they can manage students
demo_org.add_supervisor(nyc.user_name, false, true)
puts "Added NYC_test as supervisor to Demo School District"

puts "\nDONE: Sample users generated successfully."
