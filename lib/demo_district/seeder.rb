# The Demo School District's people and structure: three SLP supervisors, a district core
# board, twenty student communicators and three classrooms.
#
# One source of truth for db/seeds.rb (sections 2 to 7, which also build 90 days of usage)
# and DemoDistrict.create_district! (lib/demo_district.rb), which builds a fresh district in
# an environment whose existing demo org has no synthetic users (nonprod's "Demo"). Every
# account it creates is synthetic and uses an @demoschooldistrict.org email, so
# DemoDistrict.refresh! will write activity for it.
module DemoDistrict
  class Seeder
    ORG_NAME = 'Demo School District'.freeze

    SLP_PROFILES = [
      { name: 'Sarah Chen', user_name: 'sarah_chen_slp', email: 'sarah.chen@demoschooldistrict.org', location: 'Portland, OR' },
      { name: 'Marcus Williams', user_name: 'marcus_williams_slp', email: 'marcus.williams@demoschooldistrict.org', location: 'Portland, OR' },
      { name: 'Elena Rodriguez', user_name: 'elena_rodriguez_slp', email: 'elena.rodriguez@demoschooldistrict.org', location: 'Portland, OR' }
    ].freeze

    BOARD_KEY = 'demo_district_home'.freeze

    CORE_BOARD_BUTTONS = [
      { id: 1,  label: "I",       background_color: "#FFEB3B" },
      { id: 2,  label: "want",    background_color: "#FF9800" },
      { id: 3,  label: "need",    background_color: "#FF9800" },
      { id: 4,  label: "like",    background_color: "#FF9800" },
      { id: 5,  label: "go",      background_color: "#4CAF50" },
      { id: 6,  label: "stop",    background_color: "#F44336" },
      { id: 7,  label: "help",    background_color: "#2196F3" },
      { id: 8,  label: "more",    background_color: "#9C27B0" },
      { id: 9,  label: "yes",     background_color: "#4CAF50" },
      { id: 10, label: "no",      background_color: "#F44336" },
      { id: 11, label: "eat",     background_color: "#FF9800" },
      { id: 12, label: "drink",   background_color: "#FF9800" },
      { id: 13, label: "play",    background_color: "#4CAF50" },
      { id: 14, label: "happy",   background_color: "#FFEB3B" },
      { id: 15, label: "sad",     background_color: "#607D8B" },
      { id: 16, label: "please",  background_color: "#9C27B0" },
      { id: 17, label: "thank you", background_color: "#9C27B0" },
      { id: 18, label: "bathroom", background_color: "#795548" },
      { id: 19, label: "all done", background_color: "#F44336" },
      { id: 20, label: "my turn", background_color: "#FFEB3B" }
    ].freeze

    CORE_BOARD_GRID = {
      rows: 4,
      columns: 5,
      order: [
        [1, 2, 3, 4, 5],
        [6, 7, 8, 9, 10],
        [11, 12, 13, 14, 15],
        [16, 17, 18, 19, 20]
      ]
    }.freeze

    # Students by index into UsageGenerator::STUDENT_PROFILES; supervisor by index into
    # SLP_PROFILES.
    CLASSROOMS = [
      { name: 'Early Communication (K-1)', supervisor_index: 0, student_indices: (0..6) },
      { name: 'Building Sentences (2nd-3rd)', supervisor_index: 1, student_indices: (7..13) },
      { name: 'Advanced Communication (4th-5th)', supervisor_index: 2, student_indices: (14..19) }
    ].freeze

    # A fresh copy each call: callers assign it to org.settings and then add to it.
    def self.org_settings
      {
        'name' => ORG_NAME,
        # Explicit opt-in for DemoDistrict.refresh! (lib/demo_district.rb), which only ever
        # writes synthetic activity into an organization carrying this flag.
        'demo_data' => true,
        'total_licenses' => 30,
        'total_eval_licenses' => 5,
        'total_supervisor_licenses' => 10,
        'include_extras' => true,
        'org_access' => true,
        'public' => false,
        'support_target' => {
          'email' => 'support@demoschooldistrict.org',
          'name' => ORG_NAME
        }
      }
    end

    # Every user name the district creates, supervisors first.
    def self.user_names
      SLP_PROFILES.map { |p| p[:user_name] } + UsageGenerator::STUDENT_PROFILES.map { |p| p[:user_name] }
    end

    # Builds the supervisors, core board, students and classrooms inside org, reusing any
    # that already exist (by user name, board key, classroom name). Returns
    # { supervisors: [User], board: Board, students: [{ user: User, profile: Hash }],
    #   units: [OrganizationUnit] }. Room supervision (each SLP supervising their room's
    # students) is linked by a background job that adding room members schedules.
    def self.build!(org, password:, log: ->(msg) { puts msg })
      supervisors = SLP_PROFILES.map do |profile|
        slp = User.find_by(user_name: profile[:user_name])
        unless slp
          slp = User.process_new({
            name: profile[:name],
            user_name: profile[:user_name],
            email: profile[:email],
            public: false,
            password: password,
            description: "Speech-Language Pathologist at #{ORG_NAME}",
            location: profile[:location]
          }, {
            is_admin: false
          })
          raise "could not create #{profile[:user_name]}: #{slp.errored? ? slp.processing_errors.join(', ') : 'not saved'}" unless slp.persisted?
        end
        org.add_supervisor(slp.user_name, false, true) # pending=false, premium=true
        log.call("  Created SLP: #{slp.user_name}")
        slp
      end

      # Add first supervisor as a manager too (district admin)
      org.add_manager(supervisors.first.user_name, true)

      board = Board.find_by(key: BOARD_KEY)
      unless board
        board = Board.process_new({
          name: 'Demo District Core Board',
          public: false,
          buttons: CORE_BOARD_BUTTONS.map(&:dup),
          grid: { rows: CORE_BOARD_GRID[:rows], columns: CORE_BOARD_GRID[:columns], order: CORE_BOARD_GRID[:order].map(&:dup) }
        }, { user: supervisors.first, key: BOARD_KEY.dup }) # Board#process_params edits the key in place (sub!)
        log.call("  Created district core board (20 buttons)")
      end

      org.settings['default_home_board'] = {
        'id' => board.global_id,
        'key' => board.key
      }
      org.save!

      students = UsageGenerator::STUDENT_PROFILES.map do |profile|
        student = User.find_by(user_name: profile[:user_name])
        unless student
          student = User.process_new({
            name: profile[:name],
            user_name: profile[:user_name],
            email: "#{profile[:user_name]}@demoschooldistrict.org",
            public: false,
            password: password,
            description: "AAC user, age #{profile[:age]}",
            location: "Portland, OR"
          }, {
            is_admin: false
          })
          raise "could not create #{profile[:user_name]}: #{student.errored? ? student.processing_errors.join(', ') : 'not saved'}" unless student.persisted?
        end
        org.add_user(student.user_name, false, true, false) # pending=false, sponsored=true, eval=false
        log.call("  Created student: #{student.user_name} (#{profile[:skill]}, #{profile[:freq]} freq)")
        { user: student, profile: profile }
      end

      units = CLASSROOMS.map do |config|
        unit = OrganizationUnit.where(organization_id: org.id).detect { |u|
          u.settings && u.settings['name'] == config[:name]
        }
        unless unit
          unit = OrganizationUnit.new
          unit.organization = org
          unit.settings = { 'name' => config[:name] }
          unit.save!
        end

        unit.add_supervisor(supervisors[config[:supervisor_index]].user_name, true) # edit_permission=true

        config[:student_indices].each do |i|
          unit.add_communicator(students[i][:user].user_name)
        end

        log.call("  Created classroom: #{config[:name]} (#{config[:student_indices].size} students)")
        unit
      end

      { supervisors: supervisors, board: board, students: students, units: units }
    end

    # Student preferences: logging on, communicator role, default device settings.
    def self.prepare_student!(student)
      student.settings['preferences'] ||= {}
      student.settings['preferences']['logging'] = true
      student.settings['preferences']['role'] = 'communicator'
      student.settings['preferences']['device'] = {
        'voice' => { 'voice_uri' => 'default' },
        'alternate_voice' => {},
        'button_spacing' => 'small',
        'button_border' => 'medium',
        'button_text' => 'medium',
        'button_text_position' => 'bottom',
        'vocalization_height' => 80
      }
      student.settings['preferences']['skin'] = 'default'
      student.settings['preferences']['auto_home_return'] = true
      student.settings['preferences']['clear_on_vocalize'] = true
      student.save!
    end
  end
end
