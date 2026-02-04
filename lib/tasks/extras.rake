task "extras:copy_terms" => :environment do
  ['privacy', 'terms', 'jobs', 'privacy_practices'].each do |type|
    str = "<!-- auto-generated app/views/shared/_#{type}.html.erb -->\n"
    str += File.read("./app/views/shared/_#{type}.html.erb")
    File.open("./app/frontend/app/templates/#{type}.hbs", 'w') do |f|
      f.puts str
    end
  end
end

task "extras:assert_js" do
  `mkdir -p ./app/frontend/dist/assets`
  `cp -n ./app/frontend/frontend-placeholder.js ./app/frontend/dist/assets/frontend.js`
  `touch ./app/frontend/dist/assets/vendor.js`
  `cd app/assets/javascripts/ && ln -sf ../../frontend/dist/assets/frontend.js frontend.js`
  `cd app/assets/javascripts/ && ln -sf ../../frontend/dist/assets/vendor.js vendor.js`
  # Also symlink CSS files for Ember frontend
  # Create placeholder CSS files if they don't exist (they'll be replaced when Ember builds)
  `touch ./app/frontend/dist/assets/vendor.css` unless File.exist?('./app/frontend/dist/assets/vendor.css')
  `touch ./app/frontend/dist/assets/frontend.css` unless File.exist?('./app/frontend/dist/assets/frontend.css')
  # Create symlinks for CSS files (remove existing first to avoid errors)
  Dir.chdir('app/assets/stylesheets') do
    File.delete('vendor.css') if File.exist?('vendor.css') || File.symlink?('vendor.css')
    File.delete('frontend.css') if File.exist?('frontend.css') || File.symlink?('frontend.css')
    `ln -s ../../frontend/dist/assets/vendor.css vendor.css`
    `ln -s ../../frontend/dist/assets/frontend.css frontend.css`
  end
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

task "extras:reindex_public_boards" => :environment do
  puts "Reindexing public boards..."
  Board.where(public: true).find_each do |board|
    print "."
    board.generate_stats
    board.save_without_post_processing
  end
  puts "\nDone!"
end

task "extras:fix_vocabulary_organization" => :environment do
  # Maps common search terms to the expected main board name
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
  
  puts "Fixing vocabulary organization (Resilient Mode)..."
  
  vocabulary_targets.each do |target|
    name = target[:full]
    term = target[:search]
    
    # Try multiple ways to find the board
    board = Board.all.detect { |b| b.settings['name'] == name }
    board ||= Board.all.detect { |b| b.settings['name'].to_s.include?(term) && !b.settings['name'].to_s.include?(' - ') }
    
    if board
      actual_name = board.settings['name']
      puts "Organizing: #{actual_name}"
      board.public = true
      board.settings['home_board'] = true
      board.settings['unlisted'] = false
      board.generate_stats
      board.save_without_post_processing
      
      # Determine prefix for topics (e.g., "Quick Core 40")
      prefix = actual_name.split(' - ')[0].split('©')[0].strip
      
      # Find and unlist topic boards
      Board.where(public: true).find_each do |b|
        next if b.id == board.id
        b_name = b.settings['name'].to_s
        if b_name.start_with?("#{prefix} - ") || b_name.include?("#{prefix} -")
          puts "  Unlisting topic: #{b_name}"
          b.settings['unlisted'] = true
          b.generate_stats
          b.save_without_post_processing
        end
      end
    else
      puts "Could not find main board for: #{term}"
    end
  end
  
  puts "\nDone!"
end

# Helper to see what's actually in the DB if things still fail
task "extras:list_board_names" => :environment do
  puts "Public Board Names:"
  Board.where(public: true).find_each do |b|
    puts "- #{b.settings['name']} (ID: #{b.id})"
  end
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
    message += "\n<https://github.com/LingoLinq/lingolinq/blob/master/CHANGELOG.md|change notes> | <https://github.com/LingoLinq/lingolinq/commits/master|detailed log>"
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
      if domain_settings['settings']['logo_url'] && domain_settings['settings']['logo_url'] != '/images/logo-big.png'
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
          File.write("../#{folder}/public/images/logo-big.png.#{ext}", res.body) if res.code == 200
          `convert ../#{folder}/public/images/logo-big.png.#{ext} -resize 200x200 ../#{folder}/public/images/logo-big-custom.png`
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
      if domain_settings['settings']['logo_url'] && domain_settings['settings']['logo_url'] != '/images/logo-big.png'
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
          File.write("../#{folder}/public/images/logo-big.png.#{ext}", res.body) if res.code == 200
          `convert ../#{folder}/public/images/logo-big.png.#{ext} -resize 200x200 ../#{folder}/public/images/logo-big-custom.png`
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