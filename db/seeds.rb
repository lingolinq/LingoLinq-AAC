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
  # Ensure example user has a non-expiring subscription (prevents expired trial lockout)
  user1.settings ||= {}
  user1.settings['subscription'] ||= {}
  user1.settings['subscription']['never_expires'] = true
  user1.settings['subscription']['plan_id'] = 'slp_monthly_granted'
  user1.settings['subscription']['started'] = 1.year.ago.iso8601
  user1.save!
  puts "✓ Ensured example user has lifetime subscription"

  org = Organization.find_by(admin: true)
  unless org
    org = Organization.create(:admin => true, :settings => {:name => "Admin Organization"})
    puts "✓ Created admin organization"
  else
    puts "✓ Found existing admin organization"
  end
  # Link example user to admin org as full manager
  unless org.managers.include?(user1)
    org.add_manager(user1.user_name, true)
    puts "✓ Linked example user to admin organization as manager"
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
# COMPREHENSIVE DEMO DATA
# ============================================================================
# Creates a realistic school district with AAC users, SLPs, classrooms, and
# 90 days of backdated usage data for demos and development testing.
# Run with: bundle exec rails db:seed
# ============================================================================

# Note: Organization settings are encrypted (secure_serialize), so LIKE queries won't work.
# Use the lingolinq_admin user as the sentinel instead.
DEMO_ALREADY_SEEDED = User.exists?(user_name: 'lingolinq_admin') && Organization.where(admin: false).exists?

unless DEMO_ALREADY_SEEDED
  puts "\n" + "=" * 60
  puts "Seeding Demo School District with 90 days of usage data..."
  puts "=" * 60

  # ---- 1. Site Admin with lifetime license ----
  demo_admin = User.find_by(user_name: 'lingolinq_admin')
  unless demo_admin
    demo_admin = User.process_new({
      name: 'LingoLinq Admin',
      user_name: 'lingolinq_admin',
      email: 'admin@lingolinq.com',
      public: false,
      password: 'admin2025!',
      description: "LingoLinq site administrator",
      location: "Portland, OR"
    }, {
      is_admin: true
    })
    puts "  Created site admin: lingolinq_admin / admin2025!"
  end
  # Always ensure password and subscription are set (handles interrupted seed runs)
  demo_admin.generate_password('admin2025!')
  demo_admin.settings ||= {}
  demo_admin.settings['subscription'] ||= {}
  demo_admin.settings['subscription']['never_expires'] = true
  demo_admin.settings['subscription']['plan_id'] = 'slp_monthly_granted'
  demo_admin.settings['subscription']['started'] = 1.year.ago.iso8601
  demo_admin.save!
  puts "  Ensured lingolinq_admin password and lifetime subscription"

  # Link lingolinq_admin to admin org as full manager
  admin_org = Organization.find_by(admin: true)
  if admin_org && !admin_org.managers.include?(demo_admin)
    admin_org.add_manager(demo_admin.user_name, true)
    puts "  Linked lingolinq_admin to admin organization as manager"
  end

  # ---- 2. Demo School District organization ----
  # Reuse existing non-admin org if one exists (unique index on admin column)
  demo_org = Organization.find_by(admin: false) || Organization.new
  demo_org.settings = {
    'name' => 'Demo School District',
    'total_licenses' => 30,
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
  demo_org.admin = false
  demo_org.save!
  puts "  Created org: Demo School District (ID: #{demo_org.global_id})"

  # ---- 3. Three SLP Supervisor accounts ----
  slp_profiles = [
    { name: 'Sarah Chen', user_name: 'sarah_chen_slp', email: 'sarah.chen@demoschooldistrict.org', location: 'Portland, OR' },
    { name: 'Marcus Williams', user_name: 'marcus_williams_slp', email: 'marcus.williams@demoschooldistrict.org', location: 'Portland, OR' },
    { name: 'Elena Rodriguez', user_name: 'elena_rodriguez_slp', email: 'elena.rodriguez@demoschooldistrict.org', location: 'Portland, OR' }
  ]

  supervisors = slp_profiles.map do |profile|
    slp = User.find_by(user_name: profile[:user_name])
    unless slp
      slp = User.process_new({
        name: profile[:name],
        user_name: profile[:user_name],
        email: profile[:email],
        public: false,
        password: 'demo2025!',
        description: "Speech-Language Pathologist at Demo School District",
        location: profile[:location]
      }, {
        is_admin: false
      })
    end
    demo_org.add_supervisor(slp.user_name, false, true) # pending=false, premium=true
    puts "  Created SLP: #{slp.user_name}"
    slp
  end

  # Add first supervisor as a manager too (district admin)
  demo_org.add_manager(supervisors.first.user_name, true)

  # ---- 4. District-level home board for AAC users ----
  district_board = Board.find_by(key: 'demo_district_home')
  unless district_board
    core_words = [
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
    ]

    district_board = Board.process_new({
      name: 'Demo District Core Board',
      public: false,
      buttons: core_words,
      grid: {
        rows: 4,
        columns: 5,
        order: [
          [1, 2, 3, 4, 5],
          [6, 7, 8, 9, 10],
          [11, 12, 13, 14, 15],
          [16, 17, 18, 19, 20]
        ]
      }
    }, { user: supervisors.first, key: 'demo_district_home' })
    puts "  Created district core board (20 buttons)"
  end

  demo_org.settings['default_home_board'] = {
    'id' => district_board.global_id,
    'key' => district_board.key
  }
  demo_org.save!

  # ---- 5. Twenty student AAC users with varied profiles ----
  student_profiles = [
    { name: 'Aiden Parker',      user_name: 'aiden_parker',      age: 6,  skill: :beginner,   freq: :low },
    { name: 'Bella Martinez',    user_name: 'bella_martinez',    age: 8,  skill: :intermediate, freq: :high },
    { name: 'Charlie Kim',       user_name: 'charlie_kim',       age: 5,  skill: :beginner,   freq: :medium },
    { name: 'Daisy Johnson',     user_name: 'daisy_johnson',     age: 7,  skill: :intermediate, freq: :medium },
    { name: 'Ethan Brown',       user_name: 'ethan_brown',       age: 9,  skill: :advanced,   freq: :high },
    { name: 'Fiona Davis',       user_name: 'fiona_davis',       age: 6,  skill: :beginner,   freq: :low },
    { name: 'Gabriel Wilson',    user_name: 'gabriel_wilson',    age: 10, skill: :advanced,   freq: :high },
    { name: 'Hannah Lee',        user_name: 'hannah_lee',        age: 7,  skill: :intermediate, freq: :medium },
    { name: 'Isaac Thompson',    user_name: 'isaac_thompson',    age: 5,  skill: :beginner,   freq: :low },
    { name: 'Jasmine Nguyen',    user_name: 'jasmine_nguyen',    age: 8,  skill: :intermediate, freq: :high },
    { name: 'Kevin Anderson',    user_name: 'kevin_anderson',    age: 11, skill: :advanced,   freq: :medium },
    { name: 'Luna Garcia',       user_name: 'luna_garcia',       age: 6,  skill: :beginner,   freq: :medium },
    { name: 'Mason Clark',       user_name: 'mason_clark',       age: 9,  skill: :intermediate, freq: :low },
    { name: 'Nora White',        user_name: 'nora_white',        age: 7,  skill: :intermediate, freq: :high },
    { name: 'Oliver Harris',     user_name: 'oliver_harris',     age: 8,  skill: :advanced,   freq: :high },
    { name: 'Penelope Scott',    user_name: 'penelope_scott',    age: 5,  skill: :beginner,   freq: :low },
    { name: 'Quinn Taylor',      user_name: 'quinn_taylor',      age: 10, skill: :advanced,   freq: :medium },
    { name: 'Ruby Adams',        user_name: 'ruby_adams',        age: 6,  skill: :beginner,   freq: :medium },
    { name: 'Sam Mitchell',      user_name: 'sam_mitchell',      age: 7,  skill: :intermediate, freq: :low },
    { name: 'Tessa Campbell',    user_name: 'tessa_campbell',    age: 9,  skill: :advanced,   freq: :high }
  ]

  students = student_profiles.map do |profile|
    student = User.find_by(user_name: profile[:user_name])
    unless student
      student = User.process_new({
        name: profile[:name],
        user_name: profile[:user_name],
        email: "#{profile[:user_name]}@demoschooldistrict.org",
        public: false,
        password: 'demo2025!',
        description: "AAC user, age #{profile[:age]}",
        location: "Portland, OR"
      }, {
        is_admin: false
      })
    end
    demo_org.add_user(student.user_name, false, true, false) # pending=false, sponsored=true, eval=false
    puts "  Created student: #{student.user_name} (#{profile[:skill]}, #{profile[:freq]} freq)"
    { user: student, profile: profile }
  end

  # ---- 6. Three classrooms (OrganizationUnits) ----
  classroom_configs = [
    { name: 'Early Communication (K-1)', supervisor: supervisors[0], student_indices: (0..6) },
    { name: 'Building Sentences (2nd-3rd)', supervisor: supervisors[1], student_indices: (7..13) },
    { name: 'Advanced Communication (4th-5th)', supervisor: supervisors[2], student_indices: (14..19) }
  ]

  classrooms = classroom_configs.map do |config|
    unit = OrganizationUnit.find_by(organization_id: demo_org.id)
    # Check by name in settings - need to search properly
    existing = OrganizationUnit.where(organization_id: demo_org.id).detect { |u|
      u.settings && u.settings['name'] == config[:name]
    }

    unit = existing
    unless unit
      unit = OrganizationUnit.new
      unit.organization = demo_org
      unit.settings = { 'name' => config[:name] }
      unit.save!
    end

    unit.add_supervisor(config[:supervisor].user_name, true) # edit_permission=true

    config[:student_indices].each do |i|
      unit.add_communicator(students[i][:user].user_name)
    end

    puts "  Created classroom: #{config[:name]} (#{config[:student_indices].size} students)"
    unit
  end

  # ---- 7. Generate 90 days of backdated LogSession data ----
  puts "\n  Generating 90 days of usage data (this may take a few minutes)..."

  # Parts of speech mapping for core words
  word_pos = {
    'yes' => 'other', 'no' => 'other', 'more' => 'adjective', 'help' => 'verb',
    'stop' => 'verb', 'go' => 'verb', 'want' => 'verb', 'eat' => 'verb',
    'drink' => 'verb', 'please' => 'other', 'I' => 'pronoun', 'need' => 'verb',
    'like' => 'verb', 'play' => 'verb', 'happy' => 'adjective', 'sad' => 'adjective',
    'mad' => 'adjective', 'glad' => 'adjective', 'bathroom' => 'noun',
    'all done' => 'other', 'my turn' => 'other', 'thank you' => 'other',
    'that' => 'pronoun', 'this' => 'pronoun', 'is' => 'verb', 'not' => 'other',
    'can' => 'verb', 'do' => 'verb', 'it' => 'pronoun', 'the' => 'other',
    'and' => 'other', 'big' => 'adjective', 'little' => 'adjective',
    'good' => 'adjective', 'bad' => 'adjective', 'water' => 'noun',
    'food' => 'noun', 'home' => 'noun', 'school' => 'noun', 'friend' => 'noun',
    'book' => 'noun', 'outside' => 'noun', 'music' => 'noun', 'movie' => 'noun'
  }

  # Core word list (AAC core vocabulary)
  core_words = %w[I want need like go stop help more yes no eat drink play is not can do it the and that this]

  # Heat map access patterns - simulate different motor abilities
  heat_map_profiles = {
    full_access:     { x_range: 0.05..0.95, y_range: 0.05..0.95 },  # Full board
    left_bias:       { x_range: 0.02..0.55, y_range: 0.05..0.95 },  # Right-hand motor difficulty
    top_left_quad:   { x_range: 0.02..0.50, y_range: 0.02..0.50 },  # Limited reach
    bottom_right:    { x_range: 0.45..0.95, y_range: 0.45..0.95 },  # Physical positioning
    center_cluster:  { x_range: 0.25..0.75, y_range: 0.25..0.75 },  # Center access only
  }

  # Device/system profiles
  device_profiles = [
    { system: 'iOS', browser: 'Safari', name_suffix: 'iPad' },
    { system: 'iOS', browser: 'Safari', name_suffix: 'iPad' },
    { system: 'Web', browser: 'Chrome', name_suffix: 'Chromebook' },
    { system: 'Android', browser: 'Chrome', name_suffix: 'Tablet' },
    { system: 'Web', browser: 'Chrome', name_suffix: 'Desktop' }
  ]

  # Access method and grid size by skill level
  access_configs = {
    beginner:     { methods: ['touch'], grid_sizes: ['3x3', '4x4'] },
    intermediate: { methods: ['touch'], grid_sizes: ['4x5', '5x5'] },
    advanced:     { methods: ['touch', 'keyboard'], grid_sizes: ['5x7', '6x8', '5x9'] }
  }

  # Core vocabulary used in log events, weighted by frequency
  core_vocab = {
    beginner: {
      words: %w[yes no more help stop go want eat drink please],
      avg_buttons_per_session: 4,
      avg_utterance_length: 1.5,
      sessions_per_day: { low: 1, medium: 2, high: 3 }
    },
    intermediate: {
      words: %w[I want need like go stop help more yes no eat drink play happy sad please bathroom all\ done my\ turn thank\ you],
      avg_buttons_per_session: 8,
      avg_utterance_length: 2.5,
      sessions_per_day: { low: 2, medium: 3, high: 5 }
    },
    advanced: {
      words: %w[I want need like go stop help more yes no eat drink play happy sad mad glad please thank\ you bathroom all\ done my\ turn that this is not can do it the and],
      avg_buttons_per_session: 14,
      avg_utterance_length: 4.0,
      sessions_per_day: { low: 3, medium: 5, high: 8 }
    }
  }

  # Simulate realistic growth: students get slightly better over 90 days
  total_sessions_created = 0
  lat_base = 45.5231  # Portland, OR
  long_base = -122.6765

  students.each_with_index do |student_data, student_idx|
    student = student_data[:user]
    profile = student_data[:profile]
    skill = profile[:skill]
    freq = profile[:freq]
    vocab_config = core_vocab[skill]
    base_sessions_per_day = vocab_config[:sessions_per_day][freq]

    # Create device with realistic metadata
    dev_profile = device_profiles[student_idx % device_profiles.length]
    device = Device.find_or_create_by(user: student)
    device.settings ||= {}
    device.settings['name'] = "#{profile[:name].split.first}'s #{dev_profile[:name_suffix]}"
    device.settings['ip_address'] = "10.0.#{student_idx}.1"
    device.settings['system'] = dev_profile[:system]
    device.settings['browser'] = dev_profile[:browser]
    device.save!

    # Assign heat map profile based on student (vary motor access patterns)
    heat_profiles = heat_map_profiles.keys
    heat_profile = heat_map_profiles[heat_profiles[student_idx % heat_profiles.length]]

    # Assign access method and grid size
    acc_config = access_configs[skill]
    access_method = acc_config[:methods].sample
    grid_size = acc_config[:grid_sizes].sample

    # Set student preferences (home board, logging, access method)
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
    # Home board will be assigned by reprocess_imported_boards task
    student.save!

    # Assign a supervisor as author for log sessions
    supervisor_idx = student_idx < 7 ? 0 : (student_idx < 14 ? 1 : 2)
    author = supervisors[supervisor_idx]

    # Modeling rate varies by skill (beginners get more modeling)
    modeling_rate = case skill
      when :beginner then 0.20
      when :intermediate then 0.10
      when :advanced then 0.05
    end

    90.downto(1) do |days_ago|
      day_date = days_ago.days.ago.to_date
      # Skip weekends (school-based AAC usage)
      next if day_date.saturday? || day_date.sunday?

      # Simulate growth: more sessions and longer utterances as time progresses
      growth_factor = 1.0 + (90 - days_ago) * 0.005 # 0-45% improvement over 90 days
      # Add some day-to-day randomness
      day_variability = rand(0.5..1.5)
      sessions_today = [(base_sessions_per_day * day_variability * growth_factor).round, 1].max

      # Occasional absences (roughly 1 in 10 school days)
      next if rand(10) == 0

      sessions_today.times do |session_num|
        # Spread sessions across the school day (8am-3pm)
        session_hour = 8 + rand(7)
        session_minute = rand(60)
        session_start = Time.new(day_date.year, day_date.month, day_date.day, session_hour, session_minute, 0, "+00:00")
        ts = session_start.to_i

        events = []
        event_id = 1

        # Generate button presses for this session
        num_buttons = [(vocab_config[:avg_buttons_per_session] * day_variability * growth_factor).round, 1].max
        current_utterance_words = []

        num_buttons.times do |btn_idx|
          word = vocab_config[:words].sample
          current_utterance_words << word

          # Determine button position using heat map profile
          pct_x = rand(heat_profile[:x_range])
          pct_y = rand(heat_profile[:y_range])

          # Depth: mostly home board (0), some sub-board navigation
          depth = (rand < 0.2 && skill != :beginner) ? rand(1..2) : 0

          # Is this a modeling event?
          is_modeled = rand < modeling_rate

          # Parts of speech
          pos = word_pos[word] || 'other'
          is_core = core_words.include?(word)

          # button_id is required by generate_stats (line ~449 in log_session.rb)
          # to populate all_word_counts and all_button_counts — without it,
          # words_by_frequency, buttons_by_frequency, and related stats are empty.
          button_id = (btn_idx + 1).to_s

          button_event = {
            'type' => 'button',
            'button' => {
              'label' => word,
              'vocalization' => word,
              'button_id' => button_id,
              'board' => { 'id' => district_board.global_id, 'key' => district_board.key },
              'spoken' => true,
              'for_speaking' => true,
              'type' => 'speak',
              'depth' => depth,
              'percent_x' => pct_x.round(4),
              'percent_y' => pct_y.round(4),
              'percent_travel' => (depth > 0 ? rand(0.1..0.5).round(3) : rand(0.01..0.15).round(3)),
              'access' => access_method
            },
            'parts_of_speech' => { 'types' => [pos] },
            'core_word' => is_core,
            'system' => dev_profile[:system],
            'browser' => dev_profile[:browser],
            'window_width' => 1024,
            'window_height' => 768,
            'volume' => rand(0.3..0.9).round(2),
            'screen_brightness' => rand(0.5..1.0).round(2),
            'orientation' => { 'alpha' => 0, 'beta' => 0, 'gamma' => 0, 'layout' => 'landscape-primary' },
            'geo' => [lat_base + rand(-0.01..0.01), long_base + rand(-0.01..0.01)],
            'timestamp' => ts + (btn_idx * rand(2..8)),
            'id' => event_id
          }

          # Add modeling flag
          if is_modeled
            button_event['modeling'] = true
            button_event['session_user_id'] = author.global_id
          end

          events << button_event
          event_id += 1

          # Generate utterances at natural breakpoints
          target_length = (vocab_config[:avg_utterance_length] * growth_factor).round
          if current_utterance_words.length >= target_length || btn_idx == num_buttons - 1
            if current_utterance_words.any?
              events << {
                'type' => 'utterance',
                'utterance' => {
                  'text' => current_utterance_words.join(' '),
                  'buttons' => current_utterance_words.map { |w| { 'label' => w } }
                },
                'geo' => [lat_base, long_base],
                'timestamp' => ts + (btn_idx * rand(2..8)) + 1,
                'id' => event_id
              }
              event_id += 1

              # Add 'clear' action after utterance (realistic AAC usage)
              events << {
                'type' => 'action',
                'action' => { 'action' => 'clear' },
                'timestamp' => ts + (btn_idx * rand(2..8)) + 2,
                'id' => event_id
              }
              event_id += 1

              current_utterance_words = []
            end
          end
        end

        # Create the log session
        begin
          LogSession.process_new(
            { 'events' => events },
            {
              user: student,
              author: author,
              device: device,
              ip_address: "10.0.#{student_idx}.#{rand(1..254)}"
            }
          )
          total_sessions_created += 1
        rescue => e
          # Skip individual session errors, continue seeding
          puts "    Warning: skipped session for #{student.user_name} on #{day_date}: #{e.message}" if total_sessions_created < 5
        end
      end
    end

    puts "    #{student.user_name}: sessions generated (#{dev_profile[:name_suffix]}, #{heat_profiles[student_idx % heat_profiles.length]})"
  end

  puts "\n  Total log sessions created: #{total_sessions_created}"

  # ---- Generate WeeklyStatsSummary records from seeded sessions ----
  # The after_save callback on LogSession only *schedules* background jobs
  # for WeeklyStatsSummary generation (via RemoteAction/Worker). In dev or
  # fresh deployments without workers processing the queue, those summaries
  # never get built. Generate them synchronously here so dashboards, word
  # clouds, heat maps, and all reports work immediately after seeding.
  puts "\n  Generating WeeklyStatsSummary records..."
  total_summaries = 0

  students.each do |student_data|
    student = student_data[:user]

    # Ensure allow_log_reports is set (needed for aggregate/trends reporting)
    student.reload
    student.settings['preferences'] ||= {}
    unless student.settings['preferences']['allow_log_reports']
      student.settings['preferences']['allow_log_reports'] = true
      student.save(touch: false)
    end

    # Collect unique weekyears from this student's sessions
    weekyears = LogSession.where(user_id: student.id, log_type: 'session')
      .where('started_at IS NOT NULL')
      .pluck(:started_at)
      .map { |t| WeeklyStatsSummary.date_to_weekyear(t.utc.to_date) }
      .uniq.sort

    weekyears.each do |weekyear|
      begin
        WeeklyStatsSummary.update_now(student.id, weekyear)
        total_summaries += 1
      rescue => e
        puts "    Warning: #{student.user_name} weekyear #{weekyear}: #{e.message}"
      end
    end
    puts "    #{student.user_name}: #{weekyears.length} weekly summaries generated"
  end

  puts "  Total WeeklyStatsSummary records: #{total_summaries}"

  puts "\n" + "=" * 60
  puts "Demo School District seeding complete!"
  puts "=" * 60
  puts "\nLogin Credentials (all passwords: demo2025!):"
  puts "  Admin:       lingolinq_admin / admin2025!"
  puts "  SLP 1:       sarah_chen_slp (manager + supervisor)"
  puts "  SLP 2:       marcus_williams_slp"
  puts "  SLP 3:       elena_rodriguez_slp"
  puts "  Students:    aiden_parker, bella_martinez, ... (20 total)"
  puts "\nClassrooms:"
  puts "  Early Communication (K-1):       7 students, Sarah Chen"
  puts "  Building Sentences (2nd-3rd):    7 students, Marcus Williams"
  puts "  Advanced Communication (4th-5th): 6 students, Elena Rodriguez"
  puts "=" * 60

else
  puts "\n" + "=" * 60
  puts "Demo School District already seeded - skipping"
  puts "To re-seed, delete the 'Demo School District' organization first"
  puts "=" * 60
end

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
