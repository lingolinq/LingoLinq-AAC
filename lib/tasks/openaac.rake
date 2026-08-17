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
    # Prefer curated S3 assets over OpenAAC for overlapping products (CoughDrop branding).
    # ONLY= still forces a specific OpenAAC file even if it is on the curated skip list.
    curated_skips = CuratedVocabularySources.openaac_skip_files
    unless only.present?
      skipped = files & curated_skips
      if skipped.any?
        puts "Preferring curated S3 over OpenAAC for: #{skipped.join(', ')}"
        puts "  (import with: bundle exec rake lingolinq:import_curated_vocabularies)"
        files = files - curated_skips
      end
    end

    puts "Importing #{files.size} vocabulary file(s) as user #{user_name}..."

    files.each do |filename|
      url = "#{OPENBOARDS_BASE}/#{filename}"
      ext = File.extname(filename).downcase
      # Don't silently coerce an unknown extension to .obz; a typo in
      # VOCABULARY_FILES (e.g. ".ofb") would otherwise be fed to from_obz and
      # fail with a confusing parse error. Skip it loudly instead.
      unless ['.obz', '.obf'].include?(ext)
        puts "\n[#{filename}] SKIP: unrecognized extension '#{ext}' (expected .obz or .obf)."
        next
      end

      # Quick Core OBZ roots import as core-N; signup expects lingolinq/quick-core-N.
      # Skip download when that signup key already exists (idempotent re-seed).
      qc_slug = SystemBoardSources.quick_core_root_slug_for_filename(filename)
      if qc_slug && Board.find_by_path(SystemBoardSources.board_key(qc_slug))
        puts "\n[#{filename}] SKIP: #{SystemBoardSources.board_key(qc_slug)} already exists"
        next
      end

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

        if boards.blank?
          puts "  WARN: #{filename} downloaded but produced no boards (parse returned nothing); skipping."
          next
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

        root_board = boards.first
        if root_board && qc_slug
          rekeyed = SystemBoardSources.rekey_quick_core_root!(root_board, filename, user)
          if rekeyed
            puts "  Re-keyed Quick Core root to #{rekeyed}"
          else
            puts "  WARN: could not re-key Quick Core root to #{SystemBoardSources.board_key(qc_slug)} (still #{root_board.key})"
          end
        end

        SystemBoardSources.sync_load_board_keys!(boards)

        # Build button sets for navigation
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
