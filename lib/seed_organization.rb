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
                      eval_count: 3,
                      room_names: ["Washington", "Adams", "Jefferson"],
                      students_per_room: 3,
                      seed_reports: true,
                      report_weeks: 13,
                      sessions_per_week: 2,
                      password: nil)
  # All seeded accounts share one password. In production/staging this MUST be
  # supplied via SEED_ORG_PASSWORD (no weak default is allowed to reach a
  # shared/internet-facing DB); dev/test fall back to a known demo password.
  # Mirrors the seed_password guard in db/seeds.rb.
  password ||= seed_org_password

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
    org.settings['premium'] = true
    org.settings['public'] = false
    org.settings['support_target'] = {
      'email' => "support@#{org_name.downcase.gsub(/\s+/, '')}.com",
      'name' => org_name
    }
    # Normal orgs MUST leave admin as NULL. The organizations table has a UNIQUE
    # index on `admin`, so only one row may hold `true` (the super-admin org) and
    # only one may hold `false`. Postgres allows unlimited NULLs, so NULL is the
    # correct value for every seeded district; using `false` collides with the
    # demo org seeded by db/seeds.rb (PG::UniqueViolation on index_organizations_on_admin).
    org.admin = nil
    org.save!
    puts "✓ Created organization: #{org_name} (ID: #{org.id})"
  else
    puts "✓ Found existing organization: #{org_name} (ID: #{org.id})"
    # Update settings if they exist
    org.settings ||= {}
    org.settings['total_licenses'] = total_licenses if org.settings['total_licenses'].nil?
    org.settings['total_eval_licenses'] = total_eval_licenses if org.settings['total_eval_licenses'].nil?
    org.settings['total_supervisor_licenses'] = total_supervisor_licenses if org.settings['total_supervisor_licenses'].nil?
    org.settings['premium'] = true if org.settings['premium'].nil?
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
        password: password,
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
        password: password,
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
        password: password,
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
        password: password,
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
      # Idempotency: these variety logs are additive, so skip users already seeded.
      next if user_device.settings && user_device.settings['variety_seeded']
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
        user_device.settings['variety_seeded'] = true
        user_device.save!
        puts "  ✓ Logs for #{user.user_name} (session, note, assessment)"
      rescue => e
        puts "  ⚠ Logs for #{user.user_name}: #{e.message}"
      end
    end

    # Seed one of each remaining log type (eval, journal, profile, daily_use, modeling_activities)
    first_user = users.first
    first_user_device = ensure_device.call(first_user)
    if first_user && supervisors.any? && !(first_user_device.settings && first_user_device.settings['extras_seeded'])
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
      first_user_device.settings['extras_seeded'] = true
      first_user_device.save!
    end
  end

  # ---- 3-month session history + weekly summaries for org communicators ----
  # Org-portal and room reports read word clouds / totals from WeeklyStatsSummary
  # over an 8-week window and the session timeline from raw logs over ~4 months,
  # so we spread sessions across `report_weeks` and build the summaries that the
  # reports actually read (see Organization.usage_stats / WeeklyStatsSummary).
  if seed_reports && defined?(build_reporting_events)
    puts "\nSeeding 3-month report history for org communicators..."
    users.each do |user|
      seed_communicator_history(user, org_name: org_name, weeks_back: report_weeks, sessions_per_week: sessions_per_week)
    end
  elsif seed_reports
    puts "\n(Skipping report history: load lib/seed_reporting_logs.rb first, e.g. run via `rake db:seed_organization`.)"
  end

  # ---- Rooms (OrganizationUnit) each with a teacher, an SLP, and students ----
  rooms = []
  if room_names.any?
    puts "\nCreating rooms (teacher + SLP + students) with cumulative reports..."
    room_names.each do |room_name|
      rooms << seed_room(org, org_name: org_name, room_name: room_name,
                         students_per_room: students_per_room, password: password,
                         seed_reports: seed_reports, report_weeks: report_weeks,
                         sessions_per_week: sessions_per_week)
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
  if rooms.any?
    puts "\nRooms (each with a teacher, an SLP, and #{students_per_room} students):"
    rooms.compact.each do |unit|
      puts "  #{unit.settings['name']}: #{unit.all_user_ids.count} members (global_id #{unit.global_id})"
    end
    puts "  Report history: ~#{report_weeks} weeks x #{sessions_per_week} sessions/student + supervisor modeling" if seed_reports
  end
  puts "\nLogin Credentials (every seeded account uses the same password,"
  puts "set via SEED_ORG_PASSWORD; defaults to 'password123' in dev/test only):"
  puts "  Manager: #{managers.first.user_name}"
  puts "  Supervisor: #{supervisors.first.user_name}"
  puts "  User: #{users.first.user_name}"
  if rooms.compact.any?
    slug = org_name.downcase.gsub(/\s+/, '')
    sample_room = room_names.first.downcase.gsub(/\s+/, '')
    puts "  Room teacher: #{slug}_#{sample_room}_teacher"
    puts "  Room SLP: #{slug}_#{sample_room}_slp"
    puts "  Room student: #{slug}_#{sample_room}_student_1"
  end
  puts "=" * 60

  org
end

# ---------------------------------------------------------------------------
# Room (OrganizationUnit) + reporting helpers
# ---------------------------------------------------------------------------

# Resolve the shared password for all seeded accounts. In production/staging a
# strong SEED_ORG_PASSWORD MUST be supplied so a weak, source-controlled default
# can never land loginable supervisor/student accounts on a shared or
# internet-facing database. Dev/test fall back to a known demo password.
# Mirrors db/seeds.rb's seed_password guard.
def seed_org_password
  if (Rails.env.production? || ENV['RAILS_ENV'] == 'staging') && ENV['SEED_ORG_PASSWORD'].blank?
    raise "Cannot seed organization: set SEED_ORG_PASSWORD (strong credentials) in production/staging."
  end
  ENV['SEED_ORG_PASSWORD'].presence || 'password123'
end

# Create (or reuse) a room with a dedicated teacher (supervisor, edit access),
# SLP (supervisor, edit access), and N students (communicators). Members must be
# org members first (org.supervisor? / org.managed_user? are enforced by the unit),
# so we attach them to the org here too. assert_supervision! wires each supervisor
# to each student synchronously so room/individual reports link up immediately.
def seed_room(org, org_name:, room_name:, students_per_room:, password:, seed_reports: true, report_weeks: 13, sessions_per_week: 2)
  slug = org_name.downcase.gsub(/\s+/, '')
  room_slug = "#{slug}_#{room_name.downcase.gsub(/\s+/, '')}"

  unit = OrganizationUnit.all.detect { |u| u.organization_id == org.id && u.settings && u.settings['name'] == room_name }
  unless unit
    unit = OrganizationUnit.process_new({ 'name' => room_name }, { organization: org })
  end
  puts "  ✓ Room: #{room_name} (#{unit.global_id})"

  teacher = seed_org_supervisor(org, "#{room_slug}_teacher", "#{room_name} Teacher", password)
  unit.add_supervisor(teacher.user_name, true) unless unit.supervisor?(teacher)
  puts "    ✓ Teacher: #{teacher.user_name}"

  slp = seed_org_supervisor(org, "#{room_slug}_slp", "#{room_name} SLP", password)
  unit.add_supervisor(slp.user_name, true) unless unit.supervisor?(slp)
  puts "    ✓ SLP: #{slp.user_name}"

  students = []
  students_per_room.times do |i|
    student = seed_org_communicator(org, "#{room_slug}_student_#{i + 1}", "#{room_name} Student #{i + 1}", password)
    unit.add_communicator(student.user_name) unless unit.communicator?(student)
    students << student
    puts "    ✓ Student: #{student.user_name}"
  end

  # Link supervisors -> communicators within the room (normally async).
  # Reload first: each add_* above bumped the unit's updated_at in the DB
  # (UserLink#touch_connections), and UserLink.links_for caches by updated_at,
  # so without a reload assert_supervision! would read a stale (empty) link set
  # and wire nothing.
  unit.reload
  unit.assert_supervision!

  if seed_reports && defined?(build_reporting_events)
    students.each { |s| seed_communicator_history(s, org_name: org_name, weeks_back: report_weeks, sessions_per_week: sessions_per_week) }
    [teacher, slp].each { |sup| seed_supervisor_modeling(sup, weeks_back: report_weeks) }
  end

  unit
end

# Find or create a user, attach as a non-pending org supervisor.
# premium=false on purpose: each premium seat counts against
# total_supervisor_licenses, and add_supervisor raises once they run out, which
# would abort the seed partway through. Supervision/reporting works fine without
# a premium seat, so room teachers/SLPs stay non-premium and never exhaust the budget.
def seed_org_supervisor(org, user_name, display_name, password)
  user = User.find_by(user_name: user_name) || User.process_new({
    name: display_name, user_name: user_name,
    email: "#{user_name}@example.com", public: false, password: password
  }, { is_admin: false })
  org.add_supervisor(user.user_name, false, false) unless org.supervisor?(user) # pending=false, premium=false
  user.reload
end

# Find or create a user, attach as a non-pending sponsored org communicator.
def seed_org_communicator(org, user_name, display_name, password)
  user = User.find_by(user_name: user_name) || User.process_new({
    name: display_name, user_name: user_name,
    email: "#{user_name}@example.com", public: false, password: password
  }, { is_admin: false })
  org.add_user(user.user_name, false, true, false) unless org.managed_user?(user) # pending=false, sponsored=true
  user.reload
end

# Spread realistic word/heat-map session logs across `weeks_back` weeks for a
# communicator, then build the WeeklyStatsSummary rows that org/room reports read
# from. Reuses build_reporting_events / REPORTING_SEED_WORDS / HEAT_MAP_POSITIONS
# from lib/seed_reporting_logs.rb (loaded by the rake task).
def seed_communicator_history(user, org_name:, weeks_back: 13, sessions_per_week: 2)
  return 0 unless defined?(build_reporting_events)

  user.settings['preferences'] ||= {}
  unless user.settings['preferences']['logging']
    user.settings['preferences']['logging'] = true
    user.settings['preferences']['geo_logging'] = true
    user.save!
  end

  device = Device.find_or_create_by!(user_id: user.id, developer_key_id: 0, device_key: "seed_history_#{user.id}") do |d|
    d.settings ||= {}
    d.settings['name'] = "Seed device for #{user.user_name}"
  end

  # Idempotency: session history is purely additive (each run creates new
  # LogSessions and re-inflates the weekly summaries), so stamp the seed device
  # and no-op on subsequent runs. Without this, re-seeding a shared DB silently
  # doubles every student's totals.
  if device.settings && device.settings['history_seeded']
    puts "    • #{user.user_name}: report history already seeded, skipping"
    return 0
  end

  word_events = REPORTING_SEED_WORDS.flat_map { |word, count| [word] * count }
  position_idx = 0
  created = 0

  weeks_back.times do |w|
    sessions_per_week.times do |s|
      # vary the day-of-week and hour so heat maps and time-of-day charts fill in
      day_offset = (w * 7) + (s * 3) + 1
      hour = 8 + ((s * 4 + w) % 9)
      d = day_offset.days.ago.to_date
      base_time = Time.zone.local(d.year, d.month, d.day, hour, 0, 0)
      events = build_reporting_events(word_events, '1_1', base_time.to_i, position_idx)
      position_idx += events.count { |e| e['type'] == 'button' }
      begin
        LogSession.process_new(
          { 'events' => events },
          { user: user, author: user, device: device, ip_address: '127.0.0.1' }
        )
        created += 1
      rescue => e
        puts "    ⚠ session #{d} for #{user.user_name}: #{e.message}"
      end
    end
  end

  # Build the weekly summaries synchronously (reports read these, and the async
  # job that normally builds them is not guaranteed to have run during a seed).
  weekyears = LogSession.where(user_id: user.id, log_type: 'session')
                        .where.not(started_at: nil).pluck(:started_at)
                        .map { |t| WeeklyStatsSummary.date_to_weekyear(t.utc.beginning_of_week(:sunday)) }.uniq
  weekyears.each do |wy|
    begin
      WeeklyStatsSummary.update_now(user.id, wy)
    rescue => e
      puts "    ⚠ summary #{wy} for #{user.user_name}: #{e.message}"
    end
  end

  device.settings['history_seeded'] = true
  device.save!

  puts "    ✓ #{user.user_name}: #{created} sessions / #{weekyears.count} weekly summaries"
  created
end

# Seed supervisor daily_use modeling activity across `weeks_back` weeks so room
# reports show modeling frequency / average activity level for the teacher & SLP.
# Idempotent by design: process_daily_use keeps a single daily_use LogSession per
# author and merges by date (replacing, not appending), so re-runs overwrite the
# same days rather than accumulating. Values are derived deterministically (no
# random sampling) so a re-run reproduces the exact same history.
def seed_supervisor_modeling(supervisor, weeks_back: 13)
  model_words = %w[more want help go stop like that look different again]
  device = Device.find_or_create_by!(user_id: supervisor.id, developer_key_id: 0, device_key: "seed_model_#{supervisor.id}") do |d|
    d.settings ||= {}
    d.settings['name'] = "Seed device for #{supervisor.user_name}"
  end

  events = []
  weeks_back.times do |w|
    [1, 3, 5].each_with_index do |dow, i| # three active modeling days per week
      date = ((w * 7) + dow).days.ago.to_date.to_s
      offset = (w + i) % model_words.length
      events << {
        'date' => date,
        'active' => true,
        'activity_level' => 3 + (w % 3),
        'models' => 4 + (w % 5),
        'modeled' => model_words.rotate(offset).first(3)
      }
    end
  end

  begin
    LogSession.process_daily_use({ 'events' => events }, { author: supervisor, device: device, user: supervisor })
    puts "    ✓ modeling history: #{supervisor.user_name} (#{events.count} active days)"
  rescue => e
    puts "    ⚠ supervisor modeling #{supervisor.user_name}: #{e.message}"
  end
end
