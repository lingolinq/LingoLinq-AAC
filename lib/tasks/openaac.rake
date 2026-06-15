# OpenAAC vocabulary import: download OBZ/OBF files from openboards.s3.amazonaws.com
# and import using Converters::LingoLinq.from_obz() (.obz sets) or
# Converters::LingoLinq.from_obf() (single .obf boards, e.g. Project Core).
#
# Imported boards are public and gallery-visible under the owning user, but are
# NOT added to the signup sidebar library (SystemBoardSources::SIGNUP_LIBRARY_SLUGS).
#
# Run: bundle exec rake openaac:import_vocabularies
#
# Optional env:
#   VOCABULARY_USER_NAME=lingolinq   (default: lingolinq) - user to own imported boards
#   ONLY=quick-core-24.obz        - import only this file (for testing)
#
namespace :openaac do
  OPENBOARDS_BASE = 'https://openboards.s3.amazonaws.com/examples'

  VOCABULARY_FILES = [
    'quick-core-24.obz',
    'quick-core-40.obz',
    'quick-core-60.obz',
    'quick-core-84.obz',
    'quick-core-112.obz',
    'vocal-flair-24.obz',
    'vocal-flair-40.obz',
    'vocal-flair-60.obz',
    'vocal-flair-84.obz',
    'vocal-flair-84-with-keyboard.obz',
    'vocal-flair-112.obz',
    'sequoia-15.obz',
    'communikate-20.obz',
    'ck12.obz',
    'project-core.obf'   # Universal Core 36 (CC BY 4.0); single .obf board
  ].freeze

  desc 'Download OBZ/OBF files from openboards.s3.amazonaws.com and import via Converters::LingoLinq'
  task import_vocabularies: :environment do
    require 'safe_http'
    require Rails.root.join('lib', 'converters', 'lingo_linq')
    user_name = ENV['VOCABULARY_USER_NAME'] || 'lingolinq'
    user = User.find_by(user_name: user_name)
    raise "User not found: #{user_name}. Run db:seed or create the user first." unless user

    only = ENV['ONLY']
    files = only.present? ? [only] : VOCABULARY_FILES

    puts "Importing #{files.size} vocabulary file(s) as user #{user_name}..."

    files.each do |filename|
      url = "#{OPENBOARDS_BASE}/#{filename}"
      ext = File.extname(filename).downcase
      ext = '.obz' unless ['.obz', '.obf'].include?(ext)
      puts "\n[#{filename}] Downloading from #{url}..."

      response = SafeHttp.get(url, timeout: 300, connecttimeout: 30)
      unless response.success?
        puts "  SKIP: HTTP #{response.code} - #{response.return_message}"
        next
      end

      Tempfile.create(['vocab_', ext]) do |tmp|
        tmp.binmode
        tmp.write(response.body)
        tmp.close

        # Ensure 'boards' hash is present to prevent nil errors during linking.
        # from_obf returns a single board; wrap it so post-processing is uniform.
        if ext == '.obf'
          puts "  Importing with Converters::LingoLinq.from_obf()..."
          boards = Array(Converters::LingoLinq.from_obf(tmp.path, 'user' => user, 'boards' => {}))
        else
          puts "  Importing with Converters::LingoLinq.from_obz()..."
          boards = Converters::LingoLinq.from_obz(tmp.path, 'user' => user, 'boards' => {})
        end

        puts "  OK: imported #{boards.size} board(s). Configuring settings..."
        
        boards.each_with_index do |board, idx|
          if idx == 0
            # Root board
            board.public = true
            board.settings['home_board'] = true
            board.settings['unlisted'] = false
          else
            # Sub-boards
            board.public = true
            board.settings['unlisted'] = true
          end
          board.generate_stats
          board.save_without_post_processing
        end

        # Build button sets for navigation
        root_board = boards.first
        if root_board
          root_board.instance_variable_set(:@buttons_changed, 'import')
          root_board.instance_variable_set(:@brand_new, true)
          root_board.save!
          puts "  Built button set for #{root_board.key}"
        end
      end
    end

    puts "\nDone."
  end
end
