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

  desc 'DESTRUCTIVE: delete all boards owned by the content user and re-seed the ' \
       'premade library so fixes (e.g. converter changes) actually re-import. ' \
       'Guarded: DRY_RUN=1 to preview, REBUILD_CONFIRM=1 to execute. Staging only.'
  task rebuild_library: :environment do
    user_name = ENV['VOCABULARY_USER_NAME'].presence || BetaSeed::SYSTEM_USER_NAME
    user = User.find_by(user_name: user_name)
    abort "Content user '#{user_name}' not found." unless user

    scope = Board.where(user_id: user.id)
    total = scope.count
    dry_run = ENV['DRY_RUN'].to_s =~ BetaSeed::TRUTHY_PATTERN

    puts "#{dry_run ? '[DRY RUN] ' : ''}#{total} board(s) owned by '#{user_name}' " \
         "would be deleted, then the premade library re-seeded."
    if dry_run
      scope.order(:key).limit(50).pluck(:key).each { |k| puts "  - #{k}" }
      puts "  ...and #{total - 50} more" if total > 50
      next
    end

    unless ENV['REBUILD_CONFIRM'].to_s =~ BetaSeed::TRUTHY_PATTERN
      abort "Refusing to delete without REBUILD_CONFIRM=1. Re-run with REBUILD_CONFIRM=1 (or DRY_RUN=1 to preview)."
    end

    if Rails.env.production? && ENV['ALLOW_PROD_REBUILD'].to_s !~ BetaSeed::TRUTHY_PATTERN
      abort "Refusing to rebuild in production: delete+recreate assigns new board IDs " \
            "and breaks user copies / home-board references. Use an in-place refresh on prod."
    end

    deleted = BetaSeed.rebuild_content_boards!(user)
    puts "Deleted #{deleted} board(s) and re-seeded. Verifying..."

    missing = BetaSeed.verify_beta_seed(require_library_boards: true)
    if missing.empty?
      puts 'OK: library rebuilt and verified.'
    else
      puts 'WARN: rebuilt, but some records are still missing:'
      missing.each { |item| puts "  - #{item}" }
      puts "(Gallery sets need SEED_IMPORT_OPENAAC_VOCABULARIES; rebuild_library sets it automatically. Network/import failures are logged above.)"
    end
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
