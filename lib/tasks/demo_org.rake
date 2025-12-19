# Demo Organization Seeder for LingoLinq-AAC
# This rake task creates a demo school district organization with teachers,
# classrooms (rooms), and students for training and demonstration purposes.
#
# Usage:
#   rake demo:seed_org              # Create demo organization with all data
#   rake demo:clear_org             # Remove demo organization and related data
#   rake demo:add_users_to_org      # Add existing demo users to the org

namespace :demo do
  # Demo organization configuration
  DEMO_ORG_CONFIG = {
    name: 'Riverside Demo School District',
    settings: {
      'name' => 'Riverside Demo School District',
      'total_licenses' => 50,
      'total_supervisor_licenses' => 10,
      'total_eval_licenses' => 5,
      'include_extras' => true,
      'public' => false
    }
  }

  # Demo teachers/supervisors
  DEMO_TEACHERS = {
    'demo_teacher_johnson' => {
      name: 'Ms. Johnson (Demo Teacher)',
      email: 'demo_johnson@riverside.example.com',
      description: 'Special Education Teacher - Elementary',
      room: 'Room 101 - Elementary AAC'
    },
    'demo_teacher_smith' => {
      name: 'Mr. Smith (Demo Teacher)',
      email: 'demo_smith@riverside.example.com',
      description: 'Speech Language Pathologist',
      room: 'Room 102 - Speech Therapy'
    },
    'demo_teacher_garcia' => {
      name: 'Ms. Garcia (Demo Teacher)',
      email: 'demo_garcia@riverside.example.com',
      description: 'Special Education Teacher - Middle School',
      room: 'Room 201 - Middle School AAC'
    }
  }

  # Demo classrooms/rooms with student assignments
  DEMO_ROOMS = {
    'Room 101 - Elementary AAC' => {
      teachers: ['demo_teacher_johnson'],
      students: ['demo_emma', 'demo_student_alex', 'demo_student_maya']
    },
    'Room 102 - Speech Therapy' => {
      teachers: ['demo_teacher_smith'],
      students: ['demo_emma', 'demo_jacob', 'demo_student_alex']
    },
    'Room 201 - Middle School AAC' => {
      teachers: ['demo_teacher_garcia'],
      students: ['demo_jacob', 'demo_sophia', 'demo_student_noah']
    }
  }

  # Additional demo students (beyond the main 3)
  DEMO_ADDITIONAL_STUDENTS = {
    'demo_student_alex' => {
      name: 'Alex (Demo Student)',
      description: 'Beginning AAC user - 7 year old',
      email: 'demo_alex@example.com',
      usage_level: :beginner,
      sessions_per_day: 2..4,
      buttons_per_session: 4..12,
      utterances_per_session: 1..2,
      preferred_vocabulary: [:core_words, :food, :animals],
      modeling_ratio: 0.45,
      growth_rate: 0.18
    },
    'demo_student_maya' => {
      name: 'Maya (Demo Student)',
      description: 'Intermediate AAC user - 8 year old',
      email: 'demo_maya@example.com',
      usage_level: :intermediate,
      sessions_per_day: 3..6,
      buttons_per_session: 12..28,
      utterances_per_session: 2..6,
      preferred_vocabulary: [:core_words, :activities, :feelings],
      modeling_ratio: 0.30,
      growth_rate: 0.12
    },
    'demo_student_noah' => {
      name: 'Noah (Demo Student)',
      description: 'Advanced AAC user - 12 year old',
      email: 'demo_noah@example.com',
      usage_level: :advanced,
      sessions_per_day: 5..10,
      buttons_per_session: 25..50,
      utterances_per_session: 6..12,
      preferred_vocabulary: [:core_words, :fringe_words],
      modeling_ratio: 0.15,
      growth_rate: 0.08
    }
  }

  # Demo org manager
  DEMO_ORG_MANAGER = {
    'demo_org_admin' => {
      name: 'Dr. Williams (Demo Admin)',
      email: 'demo_admin@riverside.example.com',
      description: 'District AAC Coordinator'
    }
  }

  desc "Create demo school district organization with teachers, rooms, and students"
  task seed_org: :environment do
    puts "=" * 60
    puts "LingoLinq Demo Organization Seeder"
    puts "=" * 60
    
    # Step 1: Create the organization
    puts "\n1. Creating demo organization..."
    org = create_demo_org
    
    # Step 2: Create org manager
    puts "\n2. Creating organization manager..."
    create_org_manager(org)
    
    # Step 3: Create teachers/supervisors
    puts "\n3. Creating demo teachers..."
    create_demo_teachers(org)
    
    # Step 4: Create additional students with usage data
    puts "\n4. Creating additional demo students..."
    create_additional_students
    
    # Step 5: Add all students to the organization
    puts "\n5. Adding students to organization..."
    add_students_to_org(org)
    
    # Step 6: Create rooms and assign users
    puts "\n6. Creating classrooms and assigning users..."
    create_demo_rooms(org)
    
    puts "\n" + "=" * 60
    puts "Demo organization seeding complete!"
    puts "=" * 60
    puts "\nOrganization: #{DEMO_ORG_CONFIG[:name]}"
    puts "  Manager: demo_org_admin (password: demodemo123)"
    puts "\nTeachers (password: demodemo123):"
    DEMO_TEACHERS.each do |username, info|
      puts "  - #{username}: #{info[:name]}"
    end
    puts "\nStudents (password: demodemo123):"
    all_students.each do |username|
      puts "  - #{username}"
    end
    puts "\nClassrooms:"
    DEMO_ROOMS.each do |room_name, config|
      puts "  - #{room_name}"
      puts "    Teachers: #{config[:teachers].join(', ')}"
      puts "    Students: #{config[:students].join(', ')}"
    end
    puts "\nAccess the org dashboard at: /organizations/[org_id]"
    puts "Log in as demo_org_admin to manage the organization."
  end

  desc "Add existing demo users to the demo organization"
  task add_users_to_org: :environment do
    org = Organization.find_by("settings->>'name' = ?", DEMO_ORG_CONFIG[:name])
    unless org
      puts "Demo organization not found. Run 'rake demo:seed_org' first."
      next
    end
    
    puts "Adding demo users to organization..."
    add_students_to_org(org)
    puts "Done!"
  end

  desc "Clear demo organization and related data"
  task clear_org: :environment do
    puts "Clearing demo organization data..."
    
    # Find the demo org
    org = Organization.find_by("settings->>'name' = ?", DEMO_ORG_CONFIG[:name])
    
    if org
      puts "  Removing organization units (rooms)..."
      OrganizationUnit.where(organization_id: org.id).each do |unit|
        # Remove user links for the unit
        UserLink.where(record_code: "OrganizationUnit:#{unit.id}").delete_all
        unit.destroy
      end
      
      puts "  Removing user links..."
      UserLink.where(record_code: "Organization:#{org.id}").delete_all
      
      puts "  Removing organization..."
      org.destroy
    end
    
    # Remove demo teachers
    puts "  Removing demo teachers..."
    DEMO_TEACHERS.keys.each do |username|
      user = User.find_by_path(username)
      if user
        LogSession.where(user_id: user.id).delete_all
        WeeklyStatsSummary.where(user_id: user.id).delete_all
        Device.where(user_id: user.id).delete_all
        Board.where(user_id: user.id).delete_all
        UserLink.where(user_id: user.id).delete_all
        user.destroy
      end
    end
    
    # Remove org manager
    puts "  Removing org manager..."
    DEMO_ORG_MANAGER.keys.each do |username|
      user = User.find_by_path(username)
      if user
        UserLink.where(user_id: user.id).delete_all
        user.destroy
      end
    end
    
    # Remove additional students
    puts "  Removing additional demo students..."
    DEMO_ADDITIONAL_STUDENTS.keys.each do |username|
      user = User.find_by_path(username)
      if user
        LogSession.where(user_id: user.id).delete_all
        WeeklyStatsSummary.where(user_id: user.id).delete_all
        Device.where(user_id: user.id).delete_all
        Board.where(user_id: user.id).delete_all
        UserLink.where(user_id: user.id).delete_all
        user.destroy
      end
    end
    
    puts "Demo organization data cleared."
  end

  # Helper methods for organization seeding
  
  def create_demo_org
    org = Organization.find_by("settings->>'name' = ?", DEMO_ORG_CONFIG[:name])
    
    if org
      puts "  Found existing organization: #{DEMO_ORG_CONFIG[:name]}"
    else
      puts "  Creating new organization: #{DEMO_ORG_CONFIG[:name]}"
      org = Organization.new
      org.settings = DEMO_ORG_CONFIG[:settings].dup
      org.save!
    end
    
    org
  end

  def create_org_manager(org)
    DEMO_ORG_MANAGER.each do |username, info|
      user = User.find_by_path(username)
      
      if user
        puts "  Found existing manager: #{username}"
      else
        puts "  Creating manager: #{username}"
        user = User.process_new({
          name: info[:name],
          user_name: username,
          email: info[:email],
          password: 'demodemo123',
          description: info[:description],
          public: false
        }, {})
        
        user.settings ||= {}
        user.settings['preferences'] ||= {}
        user.settings['preferences']['role'] = 'supporter'
        user.save!
      end
      
      # Add as org manager
      begin
        org.add_manager(username, true)  # true = full manager
        puts "  Added #{username} as organization manager"
      rescue => e
        puts "  Warning: Could not add manager: #{e.message}"
      end
    end
  end

  def create_demo_teachers(org)
    DEMO_TEACHERS.each do |username, info|
      user = User.find_by_path(username)
      
      if user
        puts "  Found existing teacher: #{username}"
      else
        puts "  Creating teacher: #{username}"
        user = User.process_new({
          name: info[:name],
          user_name: username,
          email: info[:email],
          password: 'demodemo123',
          description: info[:description],
          public: false
        }, {})
        
        user.settings ||= {}
        user.settings['preferences'] ||= {}
        user.settings['preferences']['role'] = 'supporter'
        user.settings['preferences']['logging'] = true
        user.save!
      end
      
      # Add as org supervisor
      begin
        org.add_supervisor(username, false, false)  # not pending, not premium
        puts "  Added #{username} as organization supervisor"
      rescue => e
        puts "  Warning: Could not add supervisor: #{e.message}"
      end
    end
  end

  def create_additional_students
    DEMO_ADDITIONAL_STUDENTS.each do |username, profile|
      user = User.find_by_path(username)
      
      if user
        puts "  Found existing student: #{username}"
      else
        puts "  Creating student: #{username}"
        # Use the existing seed_user task logic
        user = User.process_new({
          name: profile[:name],
          user_name: username,
          email: profile[:email],
          password: 'demodemo123',
          description: profile[:description],
          public: false
        }, {})
        
        user.settings ||= {}
        user.settings['preferences'] ||= {}
        user.settings['preferences']['logging'] = true
        user.settings['preferences']['geo_logging'] = true
        user.settings['preferences']['allow_log_reports'] = true
        user.save!
        
        # Create device
        device = Device.find_or_create_by(user_id: user.id) do |d|
          d.settings = {
            'name' => 'Demo iPad',
            'device_key' => "demo_device_#{username}",
            'system' => 'iOS',
            'browser' => 'Safari'
          }
          d.developer_key_id = 0
        end
        device.save!
        
        # Create board
        board = create_demo_board(user)
        
        # Set home board
        user.settings['preferences']['home_board'] = {
          'id' => board.global_id,
          'key' => board.key
        }
        user.save!
        
        # Generate usage data
        puts "    Generating usage data for #{username}..."
        generate_usage_data(user, device, board, profile)
        
        # Generate weekly summaries
        puts "    Generating weekly summaries..."
        generate_weekly_summaries(user)
      end
    end
  end

  def add_students_to_org(org)
    all_students.each do |username|
      user = User.find_by_path(username)
      next unless user
      
      begin
        org.add_user(username, false, true, false)  # not pending, sponsored, not eval
        puts "  Added #{username} to organization"
      rescue => e
        puts "  Warning: Could not add #{username}: #{e.message}"
      end
    end
  end

  def create_demo_rooms(org)
    DEMO_ROOMS.each do |room_name, config|
      puts "  Creating room: #{room_name}"
      
      # Find or create the room
      unit = OrganizationUnit.find_by(organization_id: org.id).detect do |u|
        u.settings && u.settings['name'] == room_name
      end if OrganizationUnit.where(organization_id: org.id).exists?
      
      unless unit
        unit = OrganizationUnit.new
        unit.organization = org
        unit.settings = { 'name' => room_name }
        unit.save!
      end
      
      # Add teachers to the room
      config[:teachers].each do |teacher_username|
        begin
          unit.add_supervisor(teacher_username, true)  # true = edit permission
          puts "    Added teacher: #{teacher_username}"
        rescue => e
          puts "    Warning: Could not add teacher #{teacher_username}: #{e.message}"
        end
      end
      
      # Add students to the room
      config[:students].each do |student_username|
        begin
          unit.add_communicator(student_username)
          puts "    Added student: #{student_username}"
        rescue => e
          puts "    Warning: Could not add student #{student_username}: #{e.message}"
        end
      end
    end
  end

  def all_students
    # Combine main demo profiles with additional students
    main_students = defined?(DEMO_PROFILES) ? DEMO_PROFILES.keys : ['demo_emma', 'demo_jacob', 'demo_sophia']
    main_students + DEMO_ADDITIONAL_STUDENTS.keys
  end

  # Note: The following methods are defined in demo_data.rake and will be available
  # when both files are loaded:
  # - create_demo_board(user)
  # - generate_usage_data(user, device, board, profile)
  # - generate_weekly_summaries(user)
  # - category_color(category)
  # - build_vocabulary_pool(preferred_categories)
  # - generate_session_events(board, vocab, profile, growth_factor, session_time)
  # - pick_word(vocab, usage_level)
  # - create_log_session(user, device, board, events, session_time, is_modeling)
end
