task "extras:copy_terms" => :environment do
  ['privacy', 'terms', 'jobs'].each do |type|
    str = "<!-- auto-generated app/views/shared/_#{type}.html.erb -->\n"
    str += File.read("./app/views/shared/_#{type}.html.erb")
    File.open("./app/frontend/app/templates/#{type}.hbs", 'w') do |f|
      f.puts str
    end
  end
end

task "extras:generate_favicon" do
  logo = './public/images/logo-new.png'
  raise "Source logo not found: #{logo}" unless File.exist?(logo)
  # Pastel favicon set
  { 16 => 16, 32 => 32 }.each do |canvas, scale|
    out = "./public/images/favicon-pastel-#{canvas}.png"
    system("convert -size #{canvas}x#{canvas} xc:transparent \\( #{logo} -resize #{scale}x \\) -gravity center -composite #{out}")
    raise "ImageMagick failed to create #{out}" unless $?.success?
  end
  # Cool blue favicon set (same source logo)
  { 16 => 16, 32 => 32 }.each do |canvas, scale|
    out = "./public/images/favicon-cool-blue-#{canvas}.png"
    system("convert -size #{canvas}x#{canvas} xc:transparent \\( #{logo} -resize #{scale}x \\) -gravity center -composite #{out}")
    raise "ImageMagick failed to create #{out}" unless $?.success?
  end
  puts "Generated favicon-pastel-*.png and favicon-cool-blue-*.png"
end

task "extras:assert_js" do
  `mkdir -p ./app/frontend/dist/assets`
  `cp -n ./app/frontend/frontend-placeholder.js ./app/frontend/dist/assets/frontend.js`
  `touch ./app/frontend/dist/assets/vendor.js`
  `cd app/assets/javascripts/ && ln -sf ../../frontend/dist/assets/frontend.js frontend.js`
  `cd app/assets/javascripts/ && ln -sf ../../frontend/dist/assets/vendor.js vendor.js`
  # Copy Ember CSS into Rails asset path (symlinks break on WSL/Windows)
  `touch ./app/frontend/dist/assets/vendor.css` unless File.exist?('./app/frontend/dist/assets/vendor.css')
  `touch ./app/frontend/dist/assets/frontend.css` unless File.exist?('./app/frontend/dist/assets/frontend.css')
  # Remove any existing files/symlinks before copying to avoid "same file" errors
  ['vendor.css', 'frontend.css'].each do |f|
    dest = "./app/assets/stylesheets/#{f}"
    File.delete(dest) if File.exist?(dest) || File.symlink?(dest)
  end
  `cp ./app/frontend/dist/assets/vendor.css  ./app/assets/stylesheets/vendor.css`
  `cp ./app/frontend/dist/assets/frontend.css ./app/assets/stylesheets/frontend.css`
end

task "extras:jobs_list" do
  require 'worker'
  puts "default queue"
  puts Worker.scheduled_actions('default')
  puts "priority queue"
  puts Worker.scheduled_actions('priority')
  puts "slow queue"
  puts Worker.scheduled_actions('slow')
end

task "extras:clear_report_tallies" => :environment do
  RedisInit.default.del('missing_words')
  RedisInit.default.del('missing_symbols')
  RedisInit.default.del('overridden_parts_of_speech')
end

task "extras:fix_seed_users" => :environment do
  admin_pwd = ENV['SEED_ADMIN_PASSWORD'].presence || (Rails.env.development? || Rails.env.test? ? 'admin2025!' : nil)
  example_pwd = ENV['SEED_EXAMPLE_PASSWORD'].presence || (Rails.env.development? || Rails.env.test? ? 'password' : nil)
  ['lingolinq_admin', 'example'].each do |uname|
    pwd = uname == 'lingolinq_admin' ? admin_pwd : example_pwd
    if pwd.blank?
      puts "#{uname}: SKIPPED - set SEED_#{uname == 'lingolinq_admin' ? 'ADMIN' : 'EXAMPLE'}_PASSWORD in production/staging"
      next
    end
    u = User.find_by(user_name: uname)
    if !u
      puts "#{uname}: NOT FOUND"
      next
    end
    puts "#{uname}: found (id=#{u.id})"
    puts "  DB: #{ActiveRecord::Base.connection.current_database}"
    puts "  settings has password: #{!!(u.settings && u.settings['password'])}"
    puts "  billing_state: #{u.billing_state}"
    puts "  before fix - valid_password?(<env>): #{u.valid_password?(pwd)}"

    # Set password and subscription
    u.generate_password(pwd)
    u.settings['subscription'] ||= {}
    u.settings['subscription']['never_expires'] = true
    u.settings['subscription']['plan_id'] = 'slp_monthly_granted'
    u.settings['subscription']['started'] = 1.year.ago.iso8601
    u.expires_at = nil

    # Force ActiveRecord to detect the serialized column change
    u.settings_will_change! if u.respond_to?(:settings_will_change!)
    u.save!

    # Reload from DB and verify
    u.reload
    puts "  after fix - valid_password?(<env>): #{u.valid_password?(pwd)}"
    puts "  billing_state: #{u.billing_state}"
    puts "  subscription: #{u.settings['subscription'].inspect}"
    puts "  has password hash: #{!!(u.settings['password'])}"
    puts "  possibly_full_premium: #{u.possibly_full_premium}"
  end
end

task "extras:reprocess_imported_boards" => :environment do
  puts "=" * 60
  puts "Reprocessing all imported boards (full post_process)..."
  puts "=" * 60

  total = Board.count
  puts "  Total boards: #{total}"

  # Step 1: Re-save every board with full post_process enabled
  # This triggers map_images, check_for_parts_of_speech, BoardDownstreamButtonSet creation,
  # update_affected_users, and schedule_downstream_checks
  processed = 0
  errors = 0
  Board.find_each do |board|
    processed += 1
    print "\r  Processing board #{processed}/#{total}: #{board.key}...      "
    begin
      # Force content_changed flags so post_process runs fully
      board.instance_variable_set(:@buttons_changed, 'reprocess')
      board.instance_variable_set(:@brand_new, true)
      board.save!
    rescue => e
      errors += 1
      puts "\n  ERROR on #{board.key}: #{e.message}"
    end
  end
  puts "\n  Saved #{processed} boards (#{errors} errors)"

  # Step 2: Find the first public home board to assign to users
  home_board = nil
  Board.find_each do |board|
    if board.settings && board.settings['home_board']
      home_board = board
      break
    end
  end

  if !home_board
    # Fallback: use first public board
    home_board = Board.where(public: true).first
  end

  if home_board
    puts "\n  Home board: #{home_board.key} (id=#{home_board.global_id})"
  else
    puts "\n  WARNING: No home board found!"
  end

  # Step 3: Assign home board to all demo students and enable logging
  demo_org = Organization.find_by(admin: false)
  if demo_org && home_board
    puts "\n  Assigning home boards and enabling logging for org users..."
    user_links = UserLink.where(record_code: Webhook.get_record_code(demo_org))
    user_ids = user_links.select { |l| l.data['type'] == 'org_user' }.map(&:user_id)
    User.where(id: user_ids).each do |user|
      user.settings['preferences'] ||= {}
      user.settings['preferences']['home_board'] = {
        'id' => home_board.global_id,
        'key' => home_board.key
      }
      user.settings['preferences']['logging'] = true
      user.settings['preferences']['role'] = 'communicator'
      user.save!
      user.schedule(:update_available_boards) rescue nil
      print "."
    end
    puts "\n  Updated #{user_ids.length} users"

    # Also set for admin/supervisor users
    ['example', 'lingolinq_admin'].each do |uname|
      user = User.find_by(user_name: uname)
      next unless user
      user.settings['preferences'] ||= {}
      user.settings['preferences']['home_board'] ||= {
        'id' => home_board.global_id,
        'key' => home_board.key
      }
      user.save!
      puts "  Set home board for #{uname}"
    end

    # Set for supervisors too
    UserLink.where(record_code: Webhook.get_record_code(demo_org)).each do |link|
      next unless link.data['type'] == 'org_supervisor'
      user = User.find(link.user_id) rescue nil
      next unless user
      user.settings['preferences'] ||= {}
      user.settings['preferences']['home_board'] ||= {
        'id' => home_board.global_id,
        'key' => home_board.key
      }
      user.save!
      puts "  Set home board for #{user.user_name}"
    end
  end

  puts "\n" + "=" * 60
  puts "Board reprocessing complete!"
  puts "=" * 60
end

task "extras:generate_weekly_stats" => :environment do
  puts "=" * 60
  puts "Generating WeeklyStatsSummary records from log sessions..."
  puts "=" * 60

  processed = 0
  errors = 0
  user_weeks = Set.new

  LogSession.where(log_type: 'session').find_each do |session|
    next unless session.user_id && session.started_at
    start_at = session.started_at.utc.beginning_of_week(:sunday)
    weekyear = WeeklyStatsSummary.date_to_weekyear(start_at)
    key = "#{session.user_id}-#{weekyear}"
    next if user_weeks.include?(key) # Only process each user-week once
    user_weeks << key
    begin
      WeeklyStatsSummary.update_now(session.user_id, weekyear)
      processed += 1
      print "." if processed % 10 == 0
    rescue => e
      errors += 1
      puts "\n  ERROR for user #{session.user_id} week #{weekyear}: #{e.message}" if errors < 5
    end
  end

  puts "\n  Generated #{processed} weekly summaries (#{errors} errors)"
  puts "=" * 60
end

task "extras:fix_prod_setup" => :environment do
  puts "=" * 60
  puts "Fixing production setup..."
  puts "=" * 60

  # ---- 1. Link admin users to admin organization ----
  admin_org = Organization.find_by(admin: true)
  if admin_org
    puts "\nAdmin org: #{admin_org.settings['name']} (id=#{admin_org.id})"
    ['example', 'lingolinq_admin'].each do |uname|
      user = User.find_by(user_name: uname)
      next unless user
      if admin_org.managers.include?(user)
        puts "  #{uname}: already linked to admin org"
      else
        admin_org.add_manager(user.user_name, true)
        puts "  #{uname}: linked to admin org as full manager"
      end
    end
  else
    puts "WARNING: No admin organization found!"
  end

  # ---- 2. Rebuild board downstream button sets ----
  puts "\nAnalyzing boards..."
  total = Board.count
  root_boards = []
  all_downstream_ids = Set.new

  # First pass: find root boards (those with downstream children but no upstream parents)
  # NOTE: settings is encrypted (secure_serialize), so we must load each record
  Board.find_each do |board|
    downstream = board.settings['immediately_downstream_board_ids'] || []
    upstream = board.settings['immediately_upstream_board_ids'] || []
    if upstream.empty? && downstream.any?
      root_boards << board
    end
    downstream.each { |id| all_downstream_ids << id }
  end

  # Also find boards that are never referenced as downstream by anyone (orphan roots)
  Board.find_each do |board|
    next if all_downstream_ids.include?(board.global_id)
    next if root_boards.any? { |rb| rb.id == board.id }
    downstream = board.settings['immediately_downstream_board_ids'] || []
    root_boards << board if downstream.any?
  end

  puts "  Total boards: #{total}"
  puts "  Root boards (have children, no parents): #{root_boards.length}"

  processed = 0
  root_boards.each do |board|
    downstream_count = (board.settings['immediately_downstream_board_ids'] || []).length
    print "  [#{processed + 1}/#{root_boards.length}] #{board.key} (#{downstream_count} children)..."
    begin
      board.track_downstream_boards!
      BoardDownstreamButtonSet.update_for(board.global_id, true)
      puts " done"
      processed += 1
    rescue => e
      puts " ERROR: #{e.message}"
    end
  end

  puts "  Processed #{processed} root boards"
  puts "\n" + "=" * 60
  puts "Production setup fix complete!"
  puts "=" * 60
end

task "extras:reindex_public_boards" => :environment do
  puts "Reindexing public boards..."
  Board.where(public: true).find_each do |board|
    print "."
    board.generate_stats
    board.save_without_post_processing
  end
  puts "\nDone!"
end

task "extras:deploy_notification", [:system, :level, :version] => :environment do |t, args|
  message = "Something got deployed!"
  if !args[:system] && ARGV.length > 1
    ARGV.each { |a| task a.to_sym do ; end }    
    args = {
      :system => ARGV[1],
      :level => ARGV[2],
      :version => ARGV[3]
    }
  end
  if args[:system] && args[:system].downcase == 'android'
    if args[:level] && (args[:level].downcase == 'beta' || args[:level].downcase == 'alpha')
      message = "#{args[:level]} version pushed out for testing on Android\nplease kick the tires when you have a chance"
    else
      message = "An update on the Google Play Store is going live"
      message += " (#{args[:version]})" if args[:version]
      message += "\nif people start reporting bugs, that is probably why"
    end
    message += "\n<https://play.google.com/store/apps/details?id=com.mylingolinq.lingolinq|app store link>"
  elsif args[:system] && args[:system].downcase == 'ios'
    if args[:level] && (args[:level].downcase == 'beta' || args[:level].downcase == 'alpha')
      message "#{args[:level]} version submitted to the iOS App Store"
    else
      message = "An update has been submitted to the iOS App Store"
      message += " (#{args[:version]})" if args[:version]
      message += "\nit typically takes 7-10 days to get approved, so sit tight"
    end
    message += "\n<https://itunes.apple.com/us/app/lingolinq/id1021384570|app store link>"
  elsif args[:system] && (args[:system].downcase == 'kindle' || args[:system].downcase == 'amazon')
    message = "An update on the Amazon App Store is going live"
    message += " (#{args[:version]})" if args[:version]
    message += "\nif people start reporting bugs, that is probably why"
    message += "\n<https://www.amazon.com/LingoLinq-Inc-AAC/dp/B01BU8RUEY/ref=sr_1_1?s=mobile-apps&ie=UTF8&qid=1478539872&sr=1-1&keywords=lingolinq|app store link>"
  elsif args[:system] && args[:system].downcase == 'windows'
    message = "New version of the Windows app is available"
    message += " (#{args[:version]})" if args[:version]
    message += "\n<https://www.mylingolinq.com/download|download links>"
  elsif args[:system]
    raise "unrecognized system, #{args[:system]}"
  else
    str = File.read('./app/assets/javascripts/application-preload.js')
    match = str.match(/window\.app_version\s+=\s+\"([0-9\.]+\w*)\";/)
    version = match && match[1]
    message = "New version deployed to servers (#{version})"
    message += "\n<https://github.com/lingolinq/LingoLinq-AAC/blob/develop/CHANGELOG.md|change notes> | <https://github.com/lingolinq/LingoLinq-AAC/commits/develop|detailed log>"
  end
  json = {"username": "deploy-bot", "icon_emoji": ":cuttlefish:", "text":message}
  `curl -X POST -H 'Content-type: application/json' --data '#{json.to_json}' #{ENV['SLACK_NOTIFICATION_URL']}`
  #SLACK_NOTIFICATION_URL
end

task "extras:version" => :environment do
  str = File.read('./app/assets/javascripts/application-preload.js')
  match = str.match(/window\.app_version\s+=\s+\"([0-9\.]+)(\w*)\";/)
  version = match[1]
  revision = match[2]
  date_version = Date.today.strftime('%Y.%m.%d')
  if version == date_version
    if revision == ""
      revision = 'a'
    elsif revision[-1] == 'z'
      revision = revision[0..-2] + 'aa'
    else
      revision = revision[0..-2] + (revision[-1].ord + 1).chr
    end
    date_version += revision
  end
  str.sub!(/window\.app_version\s*=\s*\"[^\"]*\";/, "window.app_version = \"#{date_version}\";")
  File.write('./app/assets/javascripts/application-preload.js', str)
  puts date_version
end

task "extras:desktop" => :environment do
  json = JSON.parse(File.read("./lib/domains.json")) rescue nil
  if !json
    puts "lib/domains.json not found or invalid"
    return
  end
  json.each do |domain, folders|
    folder = folders[1]
    puts "retrieving domain settings"
    res = Typhoeus.get("https://#{domain}/api/v1/domain_settings")
    domain_settings = JSON.parse(res.body) rescue nil
    if domain_settings
      sub = domain_settings['settings'] || {}
      domain_settings = sub.merge(domain_settings)
      puts "FOR DOMAIN: #{domain}"
      js = nil
      css = nil
      Dir.glob('./public/assets/application-*') do |fn|
        if fn.match(/\.js$/)
          js = fn
        elsif fn.match(/\.css$/)
          css = fn
        end
      end
      if !js || !css
        raise "need both a js and css to be created"
      end
      puts "copying static assets"
      puts `cp ./public/images/* ../#{folder}/www/images`
      puts `cp ./public/images/logos/* ../#{folder}/www/images/logos`
      puts `cp ./public/images/emergency/* ../#{folder}/www/images/emergency`
      puts `cp ./public/fonts/* ../#{folder}/www/fonts`
      puts `cp ./public/icons/* ../#{folder}/www/assets/icons`
      puts `cp ./public/locales/* ../#{folder}/www/locales`
      puts `cp #{js} ../#{folder}/www/app.js`
      puts `cp #{css} ../#{folder}/www/css/app.css`

      puts "retrieving remote assets"
      if domain_settings['css']
        url = domain_settings['css']
        url = "//#{domain}" + url if url.match(/^\/[^\/]/)
        url = "" + url if url.match(/^\/\//)
        res = Typhoeus.get(url)
        if res.code == 200
          File.write("../#{folder}/www/domain_overrides.css", res.body) 
          puts "retrieved overrides css"
        else
          puts "ERROR: could not retreived overrides css from #{domain_settings['css']}"
        end
      end
      if domain_settings['settings']['logo_url'] && domain_settings['settings']['logo_url'] != '/images/logo-new.png'
        url = domain_settings['settings']['logo_url']
        url = "//#{domain}" + url if url.match(/^\/[^\/]/)
        url = "" + url if url.match(/^\/\//)
        res = Typhoeus.get(url)
        extensions = {
          'image/gif' => 'gif', 
          'image/jpg' => 'jpg', 
          'image/jpeg' => 'jpg', 
          'image/png' => 'png', 
          'image/svg' => 'svg'
        }
        if extensions[res.headers['Content-Type'].downcase]
          ext = extensions[res.headers['Content-Type'].downcase]
          File.write("../#{folder}/public/images/logo-new.png.#{ext}", res.body) if res.code == 200
          `convert ../#{folder}/public/images/logo-new.png.#{ext} -resize 200x200 ../#{folder}/public/images/logo-big-custom.png`
          domain_settings['settings']['logo_url'] = '/images/logo-big-custom.png'
          puts "stored custom logo image"
        else
          puts "ERROR: Unknown file type, #{res.headers['Content-Type']} at #{url}"
        end        
      end

      puts "updating index file"
      content = File.read("../#{folder}/www/desktop_index.html")
      str = ""
      if ENV['TRACK_JS_TOKEN']
        str += "<script type=\"text/javascript\" async src=\"//d2zah9y47r7bi2.cloudfront.net/releases/current/tracker.js\" data-token=\"#{ ENV['TRACK_JS_TOKEN'] }\"></script>"
      end
      str += "\n<div id='enabled_frontend_features' data-list='#{FeatureFlags::ENABLED_FRONTEND_FEATURES.join(',')}'></div>"

      pre, chunk = content.split(/<!-- begin generated content -->/)
      chunk, post = chunk.split(/<!-- end generated content -->/)
      content = pre + "<!-- begin generated content -->\n" + str + "\n\n<!-- end generated content -->" + post
      File.write("../#{folder}/www/desktop_index.html", content)

      puts "updating electron version"
      
      str = File.read('./app/assets/javascripts/application-preload.js')
      match = str.match(/window\.app_version\s+=\s+\"([0-9\.]+\w*)\";/)
      str = File.read("../#{folder}/package.json")
      full_version = (match && match[1]) || Date.today.strftime('%Y.%m.%d')
      full_version = full_version[2..-1].gsub(/[a-z]+/, '').gsub(/\.0+/, '.')
      str = str.sub(/\"version\"\s*:\s*\"[^\"]+\"/, "\"version\": \"#{full_version}\"");
      File.write("../#{folder}/package.json", str)

      str = File.read('./app/assets/javascripts/application-preload.js')
      match = str.match(/window\.app_version\s+=\s+\"([0-9\.]+\w*)\";/)
      str = File.read("../#{folder}/www/init.js")
      full_version = (match && match[1]) || Date.today.strftime('%Y.%m.%d')
      str = str.sub(/window\.app_version\s*=\s*\"[^\"]+\"/, "window.app_version = \"#{full_version}\"");
      File.write("../#{folder}/www/init.js", str)
    else
      puts "ERROR retrieving domain settings for #{domain}"
    end
  end
end

task "extras:mobile" => :environment do
  json = JSON.parse(File.read("./lib/domains.json")) rescue nil
  if !json
    puts "lib/domains.json not found or invalid"
    return
  end
  json.each do |domain, folders|
    folder = folders[0]
    puts "retrieving domain settings"
    res = Typhoeus.get("https://#{domain}/api/v1/domain_settings")
    domain_settings = JSON.parse(res.body) rescue nil
    if domain_settings
      sub = domain_settings['settings'] || {}
      domain_settings = sub.merge(domain_settings)
      domain_settings['logo_url'] = domain_settings['logo_url'].sub(/^\//, '') if domain_settings['logo_url']
      puts "FOR DOMAIN: #{domain}"
      js = nil
      css = nil
      Dir.glob('./public/assets/application-*') do |fn|
        if fn.match(/\.js$/)
          js = fn
        elsif fn.match(/\.css$/)
          css = fn
        end
      end
      if !js || !css
        raise "need both a js and css to be created"
      end
      puts "copying static assets"
      puts `cp ./public/images/* ../#{folder}/www/images`
      puts `cp ./public/images/logos/* ../#{folder}/www/images/logos`
      puts "..."
      puts `cp ./public/images/emergency/* ../#{folder}/www/images/emergency`
      puts "..."
      puts `cp ./public/fonts/* ../#{folder}/www/fonts`
      puts `cp ./public/icons/* ../#{folder}/www/assets/icons`
      puts `cp ./public/locales/* ../#{folder}/www/locales`
      puts "retrieving remote assets"
      if domain_settings['css']
        url = domain_settings['css']
        url = "//#{domain}" + url if url.match(/^\/[^\/]/)
        url = "" + url if url.match(/^\/\//)
        res = Typhoeus.get(url)
        if res.code == 200
          File.write("../#{folder}/www/domain_overrides.css", res.body) 
          puts "retrieved overrides css"
        else
          puts "ERROR: could not retreived overrides css from #{domain_settings['css']}"
        end
      end
      if domain_settings['settings']['logo_url'] && domain_settings['settings']['logo_url'] != '/images/logo-new.png'
        url = domain_settings['settings']['logo_url']
        url = "//#{domain}" + url if url.match(/^\/[^\/]/)
        url = "" + url if url.match(/^\/\//)
        res = Typhoeus.get(url)
        extensions = {
          'image/gif' => 'gif', 
          'image/jpg' => 'jpg', 
          'image/jpeg' => 'jpg', 
          'image/png' => 'png', 
          'image/svg' => 'svg'
        }
        if extensions[res.headers['Content-Type'].downcase]
          ext = extensions[res.headers['Content-Type'].downcase]
          File.write("../#{folder}/public/images/logo-new.png.#{ext}", res.body) if res.code == 200
          `convert ../#{folder}/public/images/logo-new.png.#{ext} -resize 200x200 ../#{folder}/public/images/logo-big-custom.png`
          domain_settings['settings']['logo_url'] = '/images/logo-big-custom.png'
          puts "stored custom logo image"
        else
          puts "ERROR: Unknown file type, #{res.headers['Content-Type']} at #{url}"
        end        
      end
      puts "replacing cordova files"
      str = File.read(js)
      File.write("../#{folder}/www/app.js", str)
      File.write("../#{folder}/www/domain_settings.js", "window.domain_settings=" + JSON.pretty_generate(domain_settings) + ";")
      str = File.read(css)
      File.write("../#{folder}/www/css/app.css", str)
      content = File.read("../#{folder}/www/index.html")
      str = ""
  
      if ENV['TRACK_JS_TOKEN']
        str += "<script type=\"text/javascript\" async src=\"//d2zah9y47r7bi2.cloudfront.net/releases/current/tracker.js\" data-token=\"#{ ENV['TRACK_JS_TOKEN'] }\"></script>"
      end
      str += "\n<div id='enabled_frontend_features' data-list='#{FeatureFlags::ENABLED_FRONTEND_FEATURES.join(',')}'></div>"
  
      pre, chunk = content.split(/<!-- begin generated content -->/)
      chunk, post = chunk.split(/<!-- end generated content -->/)
      content = pre + "<!-- begin generated content -->\n" + str + "\n\n<!-- end generated content -->" + post
      File.write("../#{folder}/www/index.html", content)
      puts "updating phonegap version"
      
      # str = File.read("../#{folder}/www/manifest.json")
      # date_version = Date.today.strftime('%Y.%m.%d')
      # str = str.sub(/\"version\"\s*:\s*\"[^\"]+\"/, "\"version\": \"#{date_version}\"")
      # File.write("../#{folder}/www/manifest.json", str)
      
      str = File.read('./app/assets/javascripts/application-preload.js')
      match = str.match(/window\.app_version\s+=\s+\"([0-9\.]+\w*)\";/)
      str = File.read("../#{folder}/www/init.js")
      full_version = (match && match[1]) || Date.today.strftime('%Y.%m.%d')
      str = str.sub(/window\.app_version\s*=\s*\"[^\"]+\"/, "window.app_version = \"#{full_version}\"");
      File.write("../#{folder}/www/init.js", str)
      puts "updating mobile version"
      
      str = File.read("../#{folder}/config.xml")
      date_version = Date.today.strftime('%Y.%m.%d')
      str = str.sub(/version\s*=s*\"\d+\.\d+\.\d+\"/, "version=\"#{date_version}\"")
      File.write("../#{folder}/config.xml", str)
  
      puts "building for android"
      Dir.chdir("../#{folder}"){
        puts `cordova prepare`
        puts `cordova build android`
      }
    else
      puts "  NO DOMAIN SETTINGS FOUND FOR #{domain}"
    end
  end
end

# ============================================================
# Vocabulary Organization Tasks (Serialized Column Safe)
# Now searches ALL boards, not just public ones
# ============================================================

task "extras:list_board_names" => :environment do
  puts "=== Board Statistics ==="
  puts "Total boards: #{Board.count}"
  puts "Public boards: #{Board.where(public: true).count}"
  puts "Non-public boards: #{Board.where(public: false).count}"
  puts ""
  
  puts "=== Public Board Names (first 100) ==="
  Board.where(public: true)
       .order("id ASC")
       .limit(100)
       .each do |board|
    name = board.settings['name'] rescue 'N/A'
    puts "#{board.id}: #{name} (key: #{board.key})"
  end
  
  puts ""
  puts "=== Looking for vocabulary sets in ALL boards ==="
  vocab_patterns = ['Quick Core', 'Vocal Flair', 'CommuniKate', 'Project Core', 'Sequoia']
  
  vocab_patterns.each do |pattern|
    puts "\n--- #{pattern} ---"
    count = 0
    Board.find_each(batch_size: 100) do |board|
      name = board.settings['name'].to_s rescue ''
      if name.include?(pattern)
        status = board.public ? "PUBLIC" : "private"
        puts "  #{board.id}: #{name} [#{status}]"
        count += 1
      end
    end
    puts "  (#{count} boards found)" if count > 0
    puts "  (none found)" if count == 0
  end

  puts "\nDone."
end

task "extras:fix_vocabulary_organization" => :environment do
  vocabulary_targets = [
    { search: 'Quick Core 24', full: 'Quick Core 24' },
    { search: 'Quick Core 40', full: 'Quick Core 40' },
    { search: 'Quick Core 60', full: 'Quick Core 60' },
    { search: 'Quick Core 84', full: 'Quick Core 84' },
    { search: 'Quick Core 112', full: 'Quick Core 112' },
    { search: 'Vocal Flair 24', full: 'Vocal Flair 24' },
    { search: 'Vocal Flair 40', full: 'Vocal Flair 40' },
    { search: 'Vocal Flair 60', full: 'Vocal Flair 60' },
    { search: 'Vocal Flair 84', full: 'Vocal Flair 84' },
    { search: 'Vocal Flair 112', full: 'Vocal Flair 112' },
    { search: 'Vocal Flair 84 With Keyboard', full: 'Vocal Flair 84 With Keyboard' },
    { search: 'CommuniKate Top', full: 'CommuniKate Top Page' },
    { search: 'Project Core', full: 'Project Core-36 Universal Universal Core© 2017 by the CLDS' },
    { search: 'Sequoia 15', full: 'Sequoia 15' }
  ]

  puts "=============================================="
  puts "Fixing vocabulary organization"
  puts "(Searches ALL boards, not just public)"
  puts "=============================================="
  puts ""
  puts "Total boards: #{Board.count}"
  puts "Public boards: #{Board.where(public: true).count}"
  puts ""

  vocabulary_targets.each do |target|
    name = target[:full]
    term = target[:search]

    begin
      # Search ALL boards (not just public) for exact match first
      board = Board.find_each(batch_size: 100).find do |b|
        b.settings['name'] == name
      end

      # If not found, try partial match (but not subtopic boards)
      if !board
        board = Board.find_each(batch_size: 100).find do |b|
          b_name = b.settings['name'].to_s
          b_name.include?(term) && !b_name.include?(' - ')
        end
      end

      if board
        actual_name = board.settings['name']
        was_public = board.public
        puts "✓ Found main board: #{actual_name}"
        puts "  ID: #{board.id}, Was public: #{was_public}"

        # Mark main board as public home board
        board.public = true
        board.settings['home_board'] = true
        board.settings['unlisted'] = false
        board.generate_stats
        board.save_without_post_processing
        puts "  → Marked as PUBLIC home board"

        # Determine prefix for topics (e.g., "Quick Core 40")
        prefix = actual_name.split(' - ')[0].split('©')[0].strip
        puts "  Searching for subtopic boards with prefix: '#{prefix}'"

        # Search ALL boards for subtopics (not just public)
        topic_count = 0
        made_public_count = 0
        Board.where.not(id: board.id).find_each(batch_size: 50) do |b|
          b_name = b.settings['name'].to_s
          if b_name.start_with?("#{prefix} - ") || (b_name.include?("#{prefix} -") && b_name != prefix)
            was_public = b.public
            
            # Make subtopic PUBLIC but UNLISTED (visible via navigation, not search)
            b.public = true
            b.settings['unlisted'] = true
            b.generate_stats
            b.save_without_post_processing
            
            status_change = was_public ? "" : " [was private → now public]"
            puts "    Organized: #{b_name}#{status_change}"
            topic_count += 1
            made_public_count += 1 unless was_public
          end
        end

        puts "  → Organized #{topic_count} subtopic boards"
        puts "  → Made #{made_public_count} previously private boards public" if made_public_count > 0
        puts ""
      else
        puts "⚠ Could not find main board for: #{term}"
        puts "  (Board doesn't exist in database)"
        puts ""
      end
    rescue => e
      puts "❌ ERROR processing #{term}: #{e.message}"
      puts e.backtrace.first(3)
      puts ""
    end
  end

  puts "=============================================="
  puts "Done!"
  puts "=============================================="
end
