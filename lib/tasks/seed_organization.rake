namespace :db do
  desc "Seed a sample organization with users and relationships"
  task seed_organization: :environment do
    puts "=" * 60
    puts "Seeding Organization with Users and Relationships"
    puts "=" * 60
    
    # Create or find the organization
    org_name = ENV['ORG_NAME'] || "Sample Organization"
    # Find by checking all organizations and matching name in settings
    org = Organization.all.find { |o| o.settings && o.settings['name'] == org_name }
    org ||= Organization.new
    
    if org.new_record?
      # Set up organization settings
      org.settings ||= {}
      org.settings['name'] = org_name
      org.settings['total_licenses'] = ENV['TOTAL_LICENSES']&.to_i || 50
      org.settings['total_eval_licenses'] = ENV['TOTAL_EVAL_LICENSES']&.to_i || 10
      org.settings['total_supervisor_licenses'] = ENV['TOTAL_SUPERVISOR_LICENSES']&.to_i || 20
      org.settings['include_extras'] = true
      org.settings['org_access'] = true
      org.settings['public'] = false
      org.settings['support_target'] = {
        'email' => "support@#{org_name.downcase.gsub(/\s+/, '')}.com",
        'name' => org_name
      }
      org.admin = false
      org.save!
      puts "✓ Created organization: #{org_name} (ID: #{org.id})"
    else
      puts "✓ Found existing organization: #{org_name} (ID: #{org.id})"
    end
    
    # Create manager users
    manager_count = ENV['MANAGER_COUNT']&.to_i || 2
    managers = []
    manager_count.times do |i|
      manager_num = i + 1
      manager = User.process_new({
        name: "Manager #{manager_num}",
        user_name: "#{org_name.downcase.gsub(/\s+/, '')}_manager_#{manager_num}",
        email: "manager#{manager_num}@#{org_name.downcase.gsub(/\s+/, '')}.com",
        public: false,
        password: 'password123',
        description: "Manager #{manager_num} for #{org_name}",
        location: "Organization Location"
      }, {
        is_admin: false
      })
      
      org.add_manager(manager.user_name, true) # full_manager = true
      managers << manager
      puts "✓ Created manager: #{manager.user_name}"
    end
    
    # Create supervisor users
    supervisor_count = ENV['SUPERVISOR_COUNT']&.to_i || 5
    supervisors = []
    supervisor_count.times do |i|
      supervisor_num = i + 1
      supervisor = User.process_new({
        name: "Supervisor #{supervisor_num}",
        user_name: "#{org_name.downcase.gsub(/\s+/, '')}_supervisor_#{supervisor_num}",
        email: "supervisor#{supervisor_num}@#{org_name.downcase.gsub(/\s+/, '')}.com",
        public: false,
        password: 'password123',
        description: "Supervisor #{supervisor_num} for #{org_name}",
        location: "Organization Location"
      }, {
        is_admin: false
      })
      
      # Make first 2 supervisors premium
      premium = supervisor_num <= 2
      org.add_supervisor(supervisor.user_name, false, premium) # pending = false
      supervisors << supervisor
      puts "✓ Created supervisor: #{supervisor.user_name}#{premium ? ' (premium)' : ''}"
    end
    
    # Create regular users (communicators)
    user_count = ENV['USER_COUNT']&.to_i || 10
    users = []
    user_count.times do |i|
      user_num = i + 1
      user = User.process_new({
        name: "User #{user_num}",
        user_name: "#{org_name.downcase.gsub(/\s+/, '')}_user_#{user_num}",
        email: "user#{user_num}@#{org_name.downcase.gsub(/\s+/, '')}.com",
        public: false,
        password: 'password123',
        description: "User #{user_num} in #{org_name}",
        location: "Organization Location"
      }, {
        is_admin: false
      })
      
      org.add_user(user.user_name, false, true, false) # pending=false, sponsored=true, eval_account=false
      users << user
      puts "✓ Created user: #{user.user_name}"
    end
    
    # Create eval users (evaluation accounts)
    eval_count = ENV['EVAL_COUNT']&.to_i || 3
    eval_users = []
    eval_count.times do |i|
      eval_num = i + 1
      eval_user = User.process_new({
        name: "Eval User #{eval_num}",
        user_name: "#{org_name.downcase.gsub(/\s+/, '')}_eval_#{eval_num}",
        email: "eval#{eval_num}@#{org_name.downcase.gsub(/\s+/, '')}.com",
        public: false,
        password: 'password123',
        description: "Evaluation account #{eval_num} for #{org_name}",
        location: "Organization Location"
      }, {
        is_admin: false
      })
      
      org.add_user(eval_user.user_name, false, true, true) # pending=false, sponsored=true, eval_account=true
      eval_users << eval_user
      puts "✓ Created eval user: #{eval_user.user_name}"
    end
    
    # Create some sample boards for the organization
    if managers.any?
      manager = managers.first
      puts "\nCreating sample boards..."
      
      # Create a home board for the organization
      home_board = Board.process_new({
        name: "#{org_name} Home Board",
        public: false,
        buttons: [
          {
            id: 1,
            label: "Hello",
            background_color: "#4CAF50"
          },
          {
            id: 2,
            label: "Help",
            background_color: "#2196F3"
          },
          {
            id: 3,
            label: "More",
            background_color: "#FF9800"
          }
        ],
        grid: {
          rows: 1,
          columns: 3,
          order: [[1, 2, 3]]
        }
      }, {
        user: manager,
        key: "#{org_name.downcase.gsub(/\s+/, '')}_home"
      })
      
      # Set as default home board for organization
      org.settings['default_home_board'] = {
        'id' => home_board.global_id,
        'key' => home_board.key
      }
      org.save!
      puts "✓ Created home board: #{home_board.name}"
      
      # Create a few more sample boards
      2.times do |i|
        board_num = i + 1
        board = Board.process_new({
          name: "#{org_name} Board #{board_num}",
          public: false,
          buttons: [
            {
              id: 1,
              label: "Yes",
              background_color: "#4CAF50"
            },
            {
              id: 2,
              label: "No",
              background_color: "#F44336"
            }
          ],
          grid: {
            rows: 1,
            columns: 2,
            order: [[1, 2]]
          }
        }, {
          user: manager
        })
        puts "✓ Created board: #{board.name}"
      end
    end
    
    puts "\n" + "=" * 60
    puts "Organization Seeding Complete!"
    puts "=" * 60
    puts "\nOrganization Details:"
    puts "  Name: #{org.settings['name']}"
    puts "  ID: #{org.id}"
    puts "  Global ID: #{org.global_id}"
    puts "  Total Licenses: #{org.settings['total_licenses']}"
    puts "  Total Eval Licenses: #{org.settings['total_eval_licenses']}"
    puts "  Total Supervisor Licenses: #{org.settings['total_supervisor_licenses']}"
    puts "\nUsers Created:"
    puts "  Managers: #{managers.count}"
    puts "  Supervisors: #{supervisors.count}"
    puts "  Regular Users: #{users.count}"
    puts "  Eval Users: #{eval_users.count}"
    puts "\nTo use this organization:"
    puts "  Login as: #{managers.first.user_name} / password123"
    puts "  Or: #{supervisors.first.user_name} / password123"
    puts "=" * 60
  end
end

