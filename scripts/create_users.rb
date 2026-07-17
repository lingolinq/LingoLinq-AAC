# Ruby script to create the requested LingoLinq users
# Usage: bundle exec rails runner scripts/create_users.rb
#
# Requires CREATE_USERS_DEFAULT_PASSWORD to be set (no hardcoded passwords).
# In production, also set CREATE_USERS_ALLOW_PRODUCTION=1 to allow running.

# Check for required classes to ensure script is running in Rails context
unless defined?(User) && defined?(Organization)
  puts "Error: Script must be run with 'bundle exec rails runner scripts/create_users.rb'"
  exit 1
end

default_password = ENV['CREATE_USERS_DEFAULT_PASSWORD']
if default_password.to_s.empty?
  puts "Error: CREATE_USERS_DEFAULT_PASSWORD must be set. Set it in .env or export it."
  puts "Example: CREATE_USERS_DEFAULT_PASSWORD=your_secret bundle exec rails runner scripts/create_users.rb"
  exit 1
end

if Rails.env.production? && ENV['CREATE_USERS_ALLOW_PRODUCTION'] != '1'
  puts "Error: Refusing to create users in production unless CREATE_USERS_ALLOW_PRODUCTION=1 is set."
  exit 1
end

def create_user(user_name, password, options = {})
  user = User.find_by(user_name: user_name)
  if user
    puts "Found existing user: #{user_name}. Updating password..."
    if options[:is_admin]
      user.settings ||= {}
      user.settings['admin'] = true
    end
  else
    puts "Creating new user: #{user_name}..."
    user = User.process_new({
      name: options[:name] || user_name.capitalize,
      user_name: user_name,
      email: options[:email] || "#{user_name}@example.com",
      public: false,
      password: password
    }, {
      # User#process_params reads non_user_params['admin'] (not is_admin)
      admin: options[:is_admin] || false
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

# 1. Full Authority User: larry / password from CREATE_USERS_DEFAULT_PASSWORD
puts "--- Setting up Full Authority User ---"
larry = create_user('larry', default_password, {
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

# 2. Demo District Admin: NYC_test / password from CREATE_USERS_DEFAULT_PASSWORD
puts "\n--- Setting up Demo District Admin ---"
nyc = create_user('NYC_test', default_password, {
  name: 'NYC Test Admin', 
  email: 'nyc_test@example.com' 
})

# Reuse the singleton non-admin organization if it already exists.
demo_org = Organization.find_by(admin: false) || Organization.new
puts(demo_org.new_record? ? "Creating 'Demo School District' organization..." : "Reusing existing non-admin organization...")
demo_org.admin = false
demo_org.settings = {
  'name' => 'Demo School District',
  'total_licenses' => 50,
  'total_eval_licenses' => 5,
  'total_supervisor_licenses' => 10,
  'include_extras' => true,
  'org_access' => true,
  'public' => false,
  'support_target' => {
    'email' => 'support@demoschooldistrict.org',
    'name' => 'Demo School District'
  }
}
demo_org.save!

# Link NYC_test to demo org as manager (administrator)
unless demo_org.managers.include?(nyc)
  demo_org.add_manager(nyc.user_name, true)
  puts "Linked NYC_test to Demo School District as manager"
end

# Also add as supervisor so they can manage students
unless demo_org.supervisor?(nyc)
  demo_org.add_supervisor(nyc.user_name, false, true)
  puts "Added NYC_test as supervisor to Demo School District"
end

puts "\nDONE: Sample users generated successfully."
