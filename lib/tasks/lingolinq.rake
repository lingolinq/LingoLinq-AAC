namespace :lingolinq do
  desc 'Copy and translate Quick Core / Vocal Flair library boards to Spanish on the lingolinq account'
  task provision_spanish_library_boards: :environment do
    force = ENV['FORCE'].to_s =~ /^(1|true|yes)$/i
    puts "Provisioning Spanish library boards on #{SystemBoardSources::USER_NAME}#{' (force)' if force}..."
    SpanishLibraryBoards.provision_all!(force: force)
    puts 'Done.'
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
end
