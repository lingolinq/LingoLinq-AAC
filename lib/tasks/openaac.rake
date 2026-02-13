# OpenAAC vocabulary import: download OBZ files from openboards.s3.amazonaws.com
# and import using Converters::LingoLinq.from_obz().
#
# Run: bundle exec rake openaac:import_vocabularies
#
# Optional env:
#   VOCABULARY_USER_NAME=example   (default: example) - user to own imported boards
#   ONLY=quick-core-24.obz        - import only this file (for testing)
#
namespace :openaac do
  OPENBOARDS_BASE = 'https://openboards.s3.amazonaws.com/examples'

  VOCABULARY_OBZ_FILES = [
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
    'ck12.obz'
  ].freeze

  desc 'Download OBZ files from openboards.s3.amazonaws.com and import via Converters::LingoLinq.from_obz()'
  task import_vocabularies: :environment do
    require Rails.root.join('lib', 'converters', 'lingo_linq')
    user_name = ENV['VOCABULARY_USER_NAME'] || 'example'
    user = User.find_by(user_name: user_name)
    raise "User not found: #{user_name}. Run db:seed or create the user first." unless user

    only = ENV['ONLY']
    files = only.present? ? [only] : VOCABULARY_OBZ_FILES

    puts "Importing #{files.size} vocabulary OBZ file(s) as user #{user_name}..."

    files.each do |filename|
      url = "#{OPENBOARDS_BASE}/#{filename}"
      puts "\n[#{filename}] Downloading from #{url}..."

      response = Typhoeus.get(Uploader.sanitize_url(url), timeout: 120, connecttimeout: 30)
      unless response.success?
        puts "  SKIP: HTTP #{response.code} - #{response.return_message}"
        next
      end

      Tempfile.create(['vocab_', '.obz']) do |tmp|
        tmp.binmode
        tmp.write(response.body)
        tmp.close

        puts "  Importing with Converters::LingoLinq.from_obz()..."
        boards = Converters::LingoLinq.from_obz(tmp.path, 'user' => user)
        puts "  OK: imported #{boards.size} board(s)"
      end
    end

    puts "\nDone."
  end
end
