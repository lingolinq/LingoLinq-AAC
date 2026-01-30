# This file should contain all the record creation needed to seed the database with its default values.
# The data can then be loaded with the rake db:seed (or created alongside the db with db:setup).
#
# This file is idempotent - it can be run multiple times safely without creating duplicates.
# It checks for existing records before creating new ones.
#
# Examples:
#
#   cities = City.create([{ name: 'Chicago' }, { name: 'Copenhagen' }])
#   Mayor.create(name: 'Emanuel', city: cities.first)

# Check if seeding has already been done
SEEDING_ALREADY_DONE = User.exists?(user_name: 'example') && Organization.exists?(admin: true)

if SEEDING_ALREADY_DONE
  puts "=" * 60
  puts "Seeding already completed - skipping initial seed data"
  puts "=" * 60
  puts "To force re-seeding, delete the 'example' user and admin organization first"
  puts "=" * 60
else
  puts "=" * 60
  puts "Starting database seeding..."
  puts "=" * 60

  user1 = User.find_by(user_name: 'example')
  unless user1
    user1 = User.process_new({
      name: 'Example',
      user_name: 'example',
      email: 'admin@example.com',
      public: false,
      password: 'password',
      description: "I'm just here to help",
      location: "Anywhere and everywhere"
    }, { 
      is_admin: true
    })
    puts "✓ Created example user"
  else
    puts "✓ Found existing example user"
  end
  
  org = Organization.find_by(admin: true)
  unless org
    org = Organization.create(:admin => true, :settings => {:name => "Admin Organization"})
    puts "✓ Created admin organization"
  else
    puts "✓ Found existing admin organization"
  end
  # Create images if they don't exist
  image1 = ButtonImage.find_by(url: "http://mcswhispers.files.wordpress.com/2012/08/yellow_happy11.jpg", user_id: user1.id)
  unless image1
    image1 = ButtonImage.process_new({
      license: {
        type: "private"
      },
      url: "http://mcswhispers.files.wordpress.com/2012/08/yellow_happy11.jpg"
    }, {:user => user1, :download => false})
    puts "✓ Created image1"
  end
  
  image2 = ButtonImage.find_by(url: "https://www.clipartmax.com/png/middle/186-1869260_free-family-and-friends-clip-art-by-phillip-martin-action-words-in.png", user_id: user1.id)
  unless image2
    image2 = ButtonImage.process_new({
      license: {
        type: "private"
      },
      url: "https://www.clipartmax.com/png/middle/186-1869260_free-family-and-friends-clip-art-by-phillip-martin-action-words-in.png"
    }, {:user => user1, :download => false})
    puts "✓ Created image2"
  end
  
  image_yes = ButtonImage.find_by(url: "http://2.bp.blogspot.com/-qRKJklGUYQw/UKa1Y7UOkAI/AAAAAAAACKY/xtCQ760g0wA/s400/24314255.jpg", user_id: user1.id)
  unless image_yes
    image_yes = ButtonImage.process_new({
      license: {
        type: "private"
      },
      url: "http://2.bp.blogspot.com/-qRKJklGUYQw/UKa1Y7UOkAI/AAAAAAAACKY/xtCQ760g0wA/s400/24314255.jpg"
    }, {:user => user1})
    puts "✓ Created image_yes"
  end
  
  image_no = ButtonImage.find_by(url: "https://archive.theworldrace.org/wp-content/uploads/2023/01/no-186.jpg", user_id: user1.id)
  unless image_no
    image_no = ButtonImage.process_new({
      license: {
        type: "private"
      },
      url: "https://archive.theworldrace.org/wp-content/uploads/2023/01/no-186.jpg"
    }, {:user => user1, :download => false})
    puts "✓ Created image_no"
  end
  
  sound1 = ButtonSound.find_by(url: "https://www.epidemicsound.com/sound-effects/tracks/4f080c7d-45f9-43d2-b063-e4ee506711d3/", user_id: user1.id)
  unless sound1
    sound1 = ButtonSound.process_new({
      url: "https://www.epidemicsound.com/sound-effects/tracks/4f080c7d-45f9-43d2-b063-e4ee506711d3/"
    }, {:user => user1, :download => false})
    puts "✓ Created sound1"
  end
  
  board1 = Board.find_by(key: 'One', user_id: user1.id)
  unless board1
    board1 = Board.process_new({}, {key: 'One', user: user1})
    puts "✓ Created board1"
  end
  
  board2 = Board.find_by(key: 'Two', user_id: user1.id)
  unless board2
    board2 = Board.process_new({}, {key: 'Two', user: user1})
    puts "✓ Created board2"
  end
  
  puts "===== Board Three Init ====="
  board3 = Board.find_by(key: 'Three', user_id: user1.id)
  unless board3
    board3 = Board.process_new({
      name: 'Three',
      buttons: [
        {
          id: 1,
          label: "Want",
          image_id: image1.global_id,
          load_board: {
            id: board1.global_id,
            key: board1.key
          }
        },
        {
          id: 2,
          image_id: image2.global_id,
          label: "Need"
        }
      ],
      grid: {
        rows: 1,
        columns: 2,
        order: [[1,2]]
      }
    }, {user: user1, key: 'Three'})
    puts "✓ Created board3"
  end
  
  puts "===== Board Two Init ====="
  board2.reload
  if board2.settings['buttons'].blank? || board2.settings['buttons'].empty?
    board2.process({
      name: 'Two',
      public: true,
      buttons: [
        {
          id: 1,
          label: "Jump",
          image_id: image1.global_id,
          load_board: {
            id: board3.global_id,
            key: board3.key
          }
        },
        {
          id: 2,
          image_id: image2.global_id,
          label: "Duck"
        }
      ],
      grid: {
        rows: 1,
        columns: 2,
        order: [[1,2]]
      }
    })
    puts "✓ Updated board2"
  end
  
  puts "===== Board One Init ====="
  board1.reload
  if board1.settings['buttons'].blank? || board1.settings['buttons'].empty?
    board1.process({
      name: 'One',
      public: true,
      buttons: [
        {
          id: 1,
          label: "Happy",
          image_id: image1.global_id,
          load_board: {
            id: board2.global_id,
            key: board2.key
          }
        },
        {
          id: 2,
          image_id: image2.global_id,
          label: "Sad",
          border_color: "#000"
        },
        {
          id: 3,
          image_id: image2.global_id,
          label: "Glad",
          border_color: "#0aa"
        },
        {
          id: 4,
          image_id: image2.global_id,
          label: "Bad",
          background_color: "#faa"
        },
        {
          id: 5,
          image_id: image2.global_id,
          label: "Mad"
        },
        {
          id: 6,
          image_id: image2.global_id,
          label: "Rad",
          sound_id: sound1.global_id
        }
      ],
      grid: {
        rows: 2,
        columns: 4,
        order: [[1,2,3,4],[0,5,9,6]]
      }
    })
    puts "✓ Updated board1"
  end
  
  puts "===== Board Yes/No Init ====="
  board_yesno = Board.find_by(key: "yesno", user_id: user1.id)
  unless board_yesno
    board_yesno = Board.process_new({
      name: 'Simple Yes/No',
      public: true,
      buttons: [
        {
          id: 1,
          label: "Yes",
          image_id: image_yes.global_id,
        },
        {
          id: 2,
          image_id: image_no.global_id,
          label: "No",
        }
      ],
      grid: {
        rows: 1,
        columns: 2,
        order: [[1,2]]
      }
    }, {user: user1, key: "yesno"})
    puts "✓ Created board_yesno"
  end

  # Ensure initial boards show up on the homepage by starring a few
  user1.reload
  user1.settings['starred_board_ids'] ||= []
  existing_stars = user1.settings['starred_board_ids'] || []
  new_stars = [board1.global_id, board2.global_id, board_yesno.global_id]
  user1.settings['starred_board_ids'] = (existing_stars + new_stars).uniq
  user1.save if (existing_stars & new_stars).length < new_stars.length
  puts "✓ Updated starred boards"

  # Create log sessions (only if they don't exist)
  if LogSession.where(user_id: user1.id).count == 0
    puts "==== Creating Log Sessions ====="
    lat = 35.674831
    long = -108.0297416
    u = user1
    d = Device.find_or_create_by(:user => u)
    ts = Time.now.to_i - 100
    s1 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => board1.global_id}}, 'geo' => [lat, long], 'timestamp' => ts}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    s2 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'go', 'board' => {'id' => board1.global_id}}, 'geo' => [lat + 0.0001, long + 0.0001], 'timestamp' => ts + 2}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    s3 = LogSession.process_new({'events' => [{'type' => 'utterance', 'utterance' => {'text' => 'ok go', 'buttons' => []}, 'geo' => [lat, long], 'timestamp' => ts + 3}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    s4 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'I', 'board' => {'id' => board1.global_id}}, 'geo' => [lat, long], 'timestamp' => ts + 5}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    s5 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'want', 'board' => {'id' => board1.global_id}}, 'geo' => [lat + 0.0001, long - 0.0001], 'timestamp' => ts + 7}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    s6 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'more', 'board' => {'id' => board1.global_id}}, 'geo' => [lat, long], 'timestamp' => ts + 9}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.6'})
    s7 = LogSession.process_new({'events' => [{'type' => 'utterance', 'utterance' => {'text' => 'I want more', 'buttons' => []}, 'geo' => [lat + 0.0001, long + 0.0001], 'timestamp' => ts + 15}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    s8 = LogSession.process_new({'events' => [{'type' => 'utterance', 'utterance' => {'text' => 'I want more', 'buttons' => []}, 'geo' => [lat, long], 'timestamp' => ts + 19}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    s9 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'never', 'board' => {'id' => board1.global_id}}, 'geo' => [lat + 0.0001, long - 0.0001], 'timestamp' => ts + 20}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.6'})
    s10 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'ice cream', 'board' => {'id' => board1.global_id}}, 'geo' => [lat + 2, long], 'timestamp' => ts + 21}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.6'})
    s11 = LogSession.process_new({'events' => [{'type' => 'utterance', 'utterance' => {'text' => 'never ice cream', 'buttons' => []}, 'geo' => [lat + 2.0001, long + 0.0001], 'timestamp' => ts + 23}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.6'})
    s12 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'candy bar', 'board' => {'id' => board1.global_id}}, 'geo' => [lat + 2.0001, long + 0.0001], 'timestamp' => ts + 24}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.6'})
    s13 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'for me', 'board' => {'id' => board1.global_id}}, 'geo' => [lat + 2.0001, long - 0.0001], 'timestamp' => ts + 25}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.6'})
    s14 = LogSession.process_new({'events' => [{'type' => 'utterance', 'utterance' => {'text' => 'candy bar for me', 'buttons' => []}, 'geo' => [lat + 2, long], 'timestamp' => ts + 27}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.6'})
    s15 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'please', 'board' => {'id' => board1.global_id}}, 'geo' => [lat, long], 'timestamp' => ts + 30}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    s16 = LogSession.process_new({'events' => [{'type' => 'utterance', 'utterance' => {'text' => 'candy bar for me please', 'buttons' => []}, 'geo' => [lat + 0.0001, long + 0.0001], 'timestamp' => ts + 35}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    s17 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'this', 'board' => {'id' => board1.global_id}}, 'geo' => [lat + 0.0001, long], 'timestamp' => ts + 45}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    s18 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'is', 'board' => {'id' => board1.global_id}}, 'geo' => [lat - 0.0001, long], 'timestamp' => ts + 55}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    s19 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'fun', 'board' => {'id' => board1.global_id}}, 'geo' => [lat - 0.0001, long - 0.0001], 'timestamp' => ts + 59}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    s20 = LogSession.process_new({'events' => [{'type' => 'utterance', 'utterance' => {'text' => 'this is fun', 'buttons' => []}, 'geo' => [lat, long], 'timestamp' => ts + 60}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    s21 = LogSession.process_new({'events' => [{'type' => 'utterance', 'utterance' => {'text' => 'this is fun', 'buttons' => []}, 'geo' => [lat + 0.0001, long], 'timestamp' => ts + 61}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
    puts "✓ Created log sessions"
  else
    puts "✓ Log sessions already exist, skipping"
  end

  puts "=" * 60
  puts "Initial seeding complete!"
  puts "=" * 60
end

# Import word data - runs regardless of whether initial seed data exists
puts "==== Checking Parts-of-Speech Data ===="
word_count = WordData.where(locale: 'en').count
if word_count == 0
  puts "Importing words (this may take a while)..."
  MobyParser.import_words
  puts "✓ Imported words"
else
  puts "✓ Words already imported (#{word_count} words found), skipping import"
end

suggestion_count = WordData.where(locale: 'en').where("data LIKE '%suggestions%'").count
if suggestion_count == 0
  puts "Importing word suggestions..."
  WordData.import_suggestions
  puts "✓ Imported suggestions"
else
  puts "✓ Word suggestions already imported, skipping"
end

# Helper function to seed an organization with users and relationships
# Basic usage (default: "Sample Organization")
#bundle exec rake db:seed_organization
# Custom organization name
#ORG_NAME="My Company" bundle exec rake db:seed_organization
# Custom counts
#ORG_NAME="Test Org" MANAGER_COUNT=3 USER_COUNT=20 bundle exec rake db:seed_organization
#OR In rails console
# load 'db/seeds.rb'
# seed_organization(org_name: "My Organization", manager_count: 3, user_count: 15)
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
  
  # Create or find the organization
  org = Organization.find_or_initialize_by(settings: {name: org_name})
  
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
  puts "\nLogin Credentials:"
  puts "  Manager: #{managers.first.user_name} / password123"
  puts "  Supervisor: #{supervisors.first.user_name} / password123"
  puts "  User: #{users.first.user_name} / password123"
  puts "=" * 60
  
  return org
end


# ============================================================
# Organization Seeding Complete!
# ============================================================

# Organization Details:
#   Name: Sample Organization
#   ID: 4
#   Global ID: 1_4
#   Total Licenses: 50
#   Total Eval Licenses: 10
#   Total Supervisor Licenses: 20

# Users Created:
#   Managers: 2
#   Supervisors: 5
#   Regular Users: 10
#   Eval Users: 3

# To use this organization:
#   Login as: sampleorganization_manager_1 / password123
#   Or: sampleorganization_supervisor_1 / password123
# What was created 1/8/2026
# 1 Organization: "Sample Organization" (ID: 4)
# 2 Managers: sampleorganization_manager_1, sampleorganization_manager_2
# 5 Supervisors: First 2 are premium
# 10 Regular Users: sampleorganization_user_1 through 10
# 3 Eval Users: sampleorganization_eval_1 through 3
# All Users password: password123
# 3 Boards: Home board + 2 sample boards
# All users linked to the organization via UserLinks





# Uncomment the line below to automatically seed an organization when running db:seed
# seed_organization(org_name: "Demo Organization")

# ============================================================================
# LEGACY CODE - COMMENTED OUT
# ============================================================================
# The following commented section (lines 483-613) contains old Ember.js fixture
# data that was used for frontend testing/development. It's no longer needed
# as the application now uses the Rails backend for data. This code can be
# safely removed if desired, but is kept for historical reference.
# ============================================================================

#     LingoLinq.Board.FIXTURES = [
#       {
#         format: "open-board-0.1",
#         id: 1,
#         name: 'One',
#         image_url: "image",
#         buttons: [
#           {
#             id: 1,
#             label: "Happy",
#             image_id: 1,
#             load_board: {
#               board_id: 2
#             }
#           },
#           {
#             id: 2,
#             image_id: 2,
#             label: "Sad",
#             border_color: "#000"
#           },
#           {
#             id: 3,
#             image_id: 2,
#             label: "Glad",
#             border_color: "#0aa"
#           },
#           {
#             id: 4,
#             image_id: 2,
#             label: "Bad",
#             background_color: "#faa"
#           },
#           {
#             id: 5,
#             image_id: 2,
#             label: "Mad"
#           },
#           {
#             id: 6,
#             image_id: 2,
#             label: "Rad"
#           }
#         ],
#         grid: Ember.Object.create({
#           rows: 2,
#           columns: 4,
#           order: [[1,2,3,4],[0,5,9,6]]
#         }),
#         images: [
#           {
#             id: 1,
#             url: "http://mcswhispers.files.wordpress.com/2012/08/yellow_happy11.jpg"
#           },
#           {
#             id: 2,
#             url: "http://misc.phillipmartin.info/misc_jump.gif"
#           }
#         ]
#       },
#       {
#         id: 2,
#         name: 'Two',
#         imageUrl: "",
#         buttons: [
#           {
#             id: 1,
#             label: "Jump",
#             image_id: 1,
#             load_board: {
#               board_id: 3
#             }
#           },
#           {
#             id: 2,
#             image_id: 2,
#             label: "Duck"
#           }
#         ],
#         grid: Ember.Object.create({
#           rows: 1,
#           columns: 2,
#           order: [[1,2]]
#         }),
#         images: [
#           {
#             id: 1,
#             url: "http://mcswhispers.files.wordpress.com/2012/08/yellow_happy11.jpg"
#           },
#           {
#             id: 2,
#             url: "http://misc.phillipmartin.info/misc_jump.gif"
#           }
#         ]
#       },
#       {
#         id: 3,
#         name: 'Three',
#         imageUrl: "",
#         buttons: [
#           {
#             id: 1,
#             label: "Want",
#             image_id: 1,
#             load_board: {
#               board_id: 1
#             }
#           },
#           {
#             id: 2,
#             image_id: 2,
#             label: "Need"
#           }
#         ],
#         grid: Ember.Object.create({
#           rows: 1,
#           columns: 2,
#           order: [[1,2]]
#         }),
#         images: [
#           {
#             id: 1,
#             url: "http://mcswhispers.files.wordpress.com/2012/08/yellow_happy11.jpg"
#           },
#           {
#             id: 2,
#             url: "http://misc.phillipmartin.info/misc_jump.gif"
#           }
#         ]
#       }
#     ];
