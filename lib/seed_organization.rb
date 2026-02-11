# Load this file in the Rails console to define seed_organization without running the full db/seeds.rb.
# Example: load Rails.root.join('lib', 'seed_organization.rb'); seed_organization(org_name: "Sample Organization")
#
# From the command line, use: bundle exec rake db:seed_organization

def seed_organization(org_name: "Sample Organization",
                      total_licenses: 50,
                      total_eval_licenses: 10,
                      total_supervisor_licenses: 20,
                      manager_count: 2,
                      supervisor_count: 5,
                      user_count: 10,
                      eval_count: 3)
  puts "\n" + "=" * 60
  puts "Seeding Organization: #{org_name}"
  puts "=" * 60

  # Create or find the organization (match by name in settings; settings is jsonb)
  org = Organization.all.find { |o| o.settings && o.settings['name'] == org_name }
  org ||= Organization.new

  if org.new_record?
    # Set up organization settings
    org.settings ||= {}
    org.settings['name'] = org_name
    org.settings['total_licenses'] = total_licenses
    org.settings['total_eval_licenses'] = total_eval_licenses
    org.settings['total_supervisor_licenses'] = total_supervisor_licenses
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
    # Update settings if they exist
    org.settings ||= {}
    org.settings['total_licenses'] = total_licenses if org.settings['total_licenses'].nil?
    org.settings['total_eval_licenses'] = total_eval_licenses if org.settings['total_eval_licenses'].nil?
    org.settings['total_supervisor_licenses'] = total_supervisor_licenses if org.settings['total_supervisor_licenses'].nil?
    org.save!
  end

  # Create manager users
  managers = []
  manager_count.times do |i|
    manager_num = i + 1
    user_name = "#{org_name.downcase.gsub(/\s+/, '')}_manager_#{manager_num}"
    # Check if user already exists
    manager = User.find_by(user_name: user_name)
    unless manager
      manager = User.process_new({
        name: "Manager #{manager_num}",
        user_name: user_name,
        email: "manager#{manager_num}@#{org_name.downcase.gsub(/\s+/, '')}.com",
        public: false,
        password: 'password123',
        description: "Manager #{manager_num} for #{org_name}",
        location: "Organization Location"
      }, {
        is_admin: false
      })
    end

    # Add as manager if not already linked
    unless org.managers.include?(manager)
      org.add_manager(manager.user_name, true) # full_manager = true
    end
    managers << manager
    puts "✓ Manager: #{manager.user_name}"
  end

  # Create supervisor users
  supervisors = []
  supervisor_count.times do |i|
    supervisor_num = i + 1
    user_name = "#{org_name.downcase.gsub(/\s+/, '')}_supervisor_#{supervisor_num}"
    # Check if user already exists
    supervisor = User.find_by(user_name: user_name)
    unless supervisor
      supervisor = User.process_new({
        name: "Supervisor #{supervisor_num}",
        user_name: user_name,
        email: "supervisor#{supervisor_num}@#{org_name.downcase.gsub(/\s+/, '')}.com",
        public: false,
        password: 'password123',
        description: "Supervisor #{supervisor_num} for #{org_name}",
        location: "Organization Location"
      }, {
        is_admin: false
      })
    end

    # Make first 2 supervisors premium
    premium = supervisor_num <= 2
    # Add as supervisor if not already linked
    unless org.supervisors.include?(supervisor)
      org.add_supervisor(supervisor.user_name, false, premium) # pending = false
    end
    supervisors << supervisor
    puts "✓ Supervisor: #{supervisor.user_name}#{premium ? ' (premium)' : ''}"
  end

  # Create regular users (communicators)
  users = []
  user_count.times do |i|
    user_num = i + 1
    user_name = "#{org_name.downcase.gsub(/\s+/, '')}_user_#{user_num}"
    # Check if user already exists
    user = User.find_by(user_name: user_name)
    unless user
      user = User.process_new({
        name: "User #{user_num}",
        user_name: user_name,
        email: "user#{user_num}@#{org_name.downcase.gsub(/\s+/, '')}.com",
        public: false,
        password: 'password123',
        description: "User #{user_num} in #{org_name}",
        location: "Organization Location"
      }, {
        is_admin: false
      })
    end

    # Add as user if not already linked
    unless org.users.include?(user)
      org.add_user(user.user_name, false, true, false) # pending=false, sponsored=true, eval_account=false
    end
    users << user
    puts "✓ User: #{user.user_name}"
  end

  # Create eval users (evaluation accounts)
  eval_users = []
  eval_count.times do |i|
    eval_num = i + 1
    user_name = "#{org_name.downcase.gsub(/\s+/, '')}_eval_#{eval_num}"
    # Check if user already exists
    eval_user = User.find_by(user_name: user_name)
    unless eval_user
      eval_user = User.process_new({
        name: "Eval User #{eval_num}",
        user_name: user_name,
        email: "eval#{eval_num}@#{org_name.downcase.gsub(/\s+/, '')}.com",
        public: false,
        password: 'password123',
        description: "Evaluation account #{eval_num} for #{org_name}",
        location: "Organization Location"
      }, {
        is_admin: false
      })
    end

    # Add as eval user if not already linked
    unless org.eval_users.include?(eval_user)
      org.add_user(eval_user.user_name, false, true, true) # pending=false, sponsored=true, eval_account=true
    end
    eval_users << eval_user
    puts "✓ Eval User: #{eval_user.user_name}"
  end

  # Create some sample boards for the organization
  if managers.any?
    manager = managers.first
    puts "\nCreating sample boards..."

    # Create a home board for the organization
    board_key = "#{org_name.downcase.gsub(/\s+/, '')}_home"
    home_board = Board.find_by(key: board_key, user_id: manager.id)
    unless home_board
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
        key: board_key
      })
    end

    # Set as default home board for organization
    org.settings['default_home_board'] = {
      'id' => home_board.global_id,
      'key' => home_board.key
    }
    org.save!
    puts "✓ Home board: #{home_board.name}"

    # Create a few more sample boards
    2.times do |i|
      board_num = i + 1
      board_name = "#{org_name} Board #{board_num}"
      board = Board.find_by(name: board_name, user_id: manager.id)
      unless board
        board = Board.process_new({
          name: board_name,
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
        puts "✓ Board: #{board.name}"
      end
    end
  end

  # Ensure a device exists for a user (required for log sessions)
  ensure_device = lambda do |u|
    Device.find_or_create_by!(user_id: u.id, developer_key_id: 0, device_key: "seed_#{org_name.downcase.gsub(/\s+/, '')}_#{u.id}") do |d|
      d.settings ||= {}
      d.settings['name'] = "Seed device for #{u.user_name}"
    end
  end

  # Create usage logs for communicator users (~3 log types per user: session, note, assessment)
  if users.any? && supervisors.any?
    supervisor_device = ensure_device.call(supervisors.first)
    sample_note_texts = [
      "Great practice today with core words.",
      "Working on two-word combinations this session.",
      "Noted progress on requesting; will focus on commenting next week."
    ]
    sample_assessments = [
      { description: "Quick core word check", correct: 4, incorrect: 1 },
      { description: "Sentence strip accuracy", correct: 5, incorrect: 2 },
      { description: "Button accuracy sample", correct: 3, incorrect: 0 }
    ]
    puts "\nCreating usage logs for communicator users..."
    users.each_with_index do |user, idx|
      user_device = ensure_device.call(user)
      base_ts = (3 + idx).days.ago.to_f
      begin
        # 1) Session log (button + utterance events)
        session_events = [
          { 'type' => 'button', 'button' => { 'label' => 'hello', 'button_id' => 1, 'board' => { 'id' => '1_1' }, 'spoken' => true }, 'timestamp' => base_ts },
          { 'type' => 'utterance', 'utterance' => { 'text' => 'hello', 'buttons' => [] }, 'timestamp' => base_ts + 5 }
        ]
        LogSession.process_new(
          { 'events' => session_events },
          { user: user, author: user, device: user_device, ip_address: '127.0.0.1' }
        )
        # 2) Note from supervisor
        note_ts = (2 + idx).days.ago.to_i
        LogSession.process_new(
          { 'note' => { 'text' => sample_note_texts[idx % sample_note_texts.size], 'timestamp' => note_ts } },
          { user: user, author: supervisors.first, device: supervisor_device }
        )
        # 3) Assessment from supervisor
        ass = sample_assessments[idx % sample_assessments.size]
        start_ts = (1 + idx).days.ago.to_i
        end_ts = start_ts + 300
        LogSession.process_new(
          {
            'assessment' => {
              'description' => ass[:description],
              'totals' => { 'correct' => ass[:correct], 'incorrect' => ass[:incorrect] },
              'tallies' => [],
              'start_timestamp' => start_ts,
              'end_timestamp' => end_ts
            }
          },
          { user: user, author: supervisors.first, device: supervisor_device }
        )
        puts "  ✓ Logs for #{user.user_name} (session, note, assessment)"
      rescue => e
        puts "  ⚠ Logs for #{user.user_name}: #{e.message}"
      end
    end

    # Seed one of each remaining log type (eval, journal, profile, daily_use, modeling_activities)
    first_user = users.first
    first_user_device = ensure_device.call(first_user)
    if first_user && supervisors.any?
      puts "\nCreating one of each additional log type..."
      begin
        # 4) Eval (evaluation session)
        eval_start = 5.days.ago.to_i
        eval_end = eval_start + 600
        LogSession.process_new(
          {
            'eval' => {
              'name' => 'Sample communication evaluation',
              'started' => eval_start,
              'ended' => eval_end
            }
          },
          { user: first_user, author: supervisors.first, device: supervisor_device }
        )
        puts "  ✓ eval"
      rescue => e
        puts "  ⚠ eval: #{e.message}"
      end
      begin
        # 5) Journal (user journal entry)
        LogSession.process_new(
          {
            'journal' => {
              'type' => 'journal',
              'vocalization' => [{ 'label' => 'hello' }, { 'label' => 'world' }],
              'sentence' => 'hello world',
              'category' => 'journal',
              'timestamp' => 4.days.ago.to_i,
              'id' => "seed_journal_#{first_user.id}"
            }
          },
          { user: first_user, author: first_user, device: first_user_device }
        )
        puts "  ✓ journal"
      rescue => e
        puts "  ⚠ journal: #{e.message}"
      end
      begin
        # 6) Profile (communication profile; type 'funding' avoids requiring a real profile record)
        profile_start = 6.days.ago.to_i
        profile_end = profile_start + 900
        LogSession.process_new(
          {
            'profile' => {
              'name' => 'Sample communication profile',
              'type' => 'funding',
              'started' => profile_start,
              'ended' => profile_end,
              'guid' => "seed_profile_#{first_user.id}"
            }
          },
          { user: first_user, author: supervisors.first, device: supervisor_device }
        )
        puts "  ✓ profile"
      rescue => e
        puts "  ⚠ profile: #{e.message}"
      end
      begin
        # 7) Daily use (one per author; user_id of the log = author)
        LogSession.process_daily_use(
          {
            'type' => 'daily_use',
            'events' => [
              { 'date' => 3.days.ago.to_date.to_s, 'active' => true, 'models' => 2 },
              { 'date' => 2.days.ago.to_date.to_s, 'active' => true, 'modeled' => 1 }
            ]
          },
          { author: first_user, device: first_user_device, user: first_user }
        )
        puts "  ✓ daily_use"
      rescue => e
        puts "  ⚠ daily_use: #{e.message}"
      end
      begin
        # 8) Modeling activities (one per user; add a minimal event)
        LogSession.process_modeling_event(
          {
            'modeling_action' => 'complete',
            'modeling_word' => 'more',
            'modeling_locale' => 'en',
            'modeling_activity_id' => 'seed_activity_1',
            'modeling_action_score' => 1,
            'timestamp' => 2.days.ago.to_i
          },
          { user: first_user, author: first_user, device: first_user_device }
        )
        puts "  ✓ modeling_activities"
      rescue => e
        puts "  ⚠ modeling_activities: #{e.message}"
      end
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
  puts "\nUsers:"
  puts "  Managers: #{managers.count}"
  puts "  Supervisors: #{supervisors.count}"
  puts "  Regular Users: #{users.count}"
  puts "  Eval Users: #{eval_users.count}"
  puts "\nUsage logs: session, note, assessment (per user) + eval, journal, profile, daily_use, modeling_activities (one each)" if users.any? && supervisors.any?
  puts "\nLogin Credentials:"
  puts "  Manager: #{managers.first.user_name} / password123"
  puts "  Supervisor: #{supervisors.first.user_name} / password123"
  puts "  User: #{users.first.user_name} / password123"
  puts "=" * 60

  org
end
