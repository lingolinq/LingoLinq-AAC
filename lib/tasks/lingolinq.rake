namespace :lingolinq do
  desc 'Copy and translate Quick Core / Vocal Flair library boards to Spanish on the lingolinq account'
  task provision_spanish_library_boards: :environment do
    force = ENV['FORCE'].to_s =~ /^(1|true|yes)$/i
    puts "Provisioning Spanish library boards on #{SystemBoardSources::USER_NAME}#{' (force)' if force}..."
    SpanishLibraryBoards.provision_all!(force: force)
    puts 'Done.'
  end

  desc 'Seed lingolinq-eyegaze and lingolinq-switchuser accounts and boards'
  task seed_accessibility_users: :environment do
    load Rails.root.join('lib', 'accessibility_seed.rb')
    AccessibilitySeed.ensure_all!
  end

  desc 'Verify that beta-critical seed records and public source boards exist'
  task verify_beta_seed: :environment do
    require_library_boards = ENV['REQUIRE_LIBRARY_BOARDS'].to_s !~ /^(0|false|no)$/i
    missing = BetaSeed.verify_beta_seed(require_library_boards: require_library_boards)

    if missing.empty?
      puts 'OK: beta seed baseline verified'
    else
      puts 'Missing beta seed records:'
      missing.each { |item| puts "  - #{item}" }
      abort 'Beta seed verification failed'
    end
  end

  desc 'Import a CoughDrop/LingoLinq JSON board bundle (BUNDLE=..., USER=username, optional IMPORTER=supervisor)'
  task import_json_bundle: :environment do
    path = ENV['BUNDLE'].presence || ENV['BUNDLE_PATH'].presence
    abort 'Usage: BUNDLE=/path/to/bundle.json USER=username [IMPORTER=supervisor] bundle exec rake lingolinq:import_json_bundle' unless path

    recipient = User.find_by_path(ENV['USER'].presence || 'example')
    abort "User not found: #{ENV['USER'] || 'example'}" unless recipient

    importer = User.find_by_path(ENV['IMPORTER'].presence || ENV['USER'].presence || 'example')
    abort "Importer not found: #{ENV['IMPORTER']}" unless importer

    puts "Importing JSON bundle from #{path} for #{recipient.user_name} (importer: #{importer.user_name})..."
    result = Board.import_json_bundle(
      importer.global_id,
      path,
      { 'recipient_global_ids' => [recipient.global_id] }
    )
    if result.is_a?(Hash) && result[:error]
      abort result[:error][:message]
    end

    root = result.first
    puts "OK: imported #{result.length} board(s). Root: #{root&.dig('key')} (#{root&.dig('id')})"
  end
end
