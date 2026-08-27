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
    # Always the content user; no VOCABULARY_USER_NAME override, so this can
    # never be pointed at an arbitrary real account by a stale/typo'd env var.
    user_name = BetaSeed::SYSTEM_USER_NAME
    user = User.find_by(user_name: user_name)
    abort "Content user '#{user_name}' not found." unless user

    db = ActiveRecord::Base.connection_db_config.configuration_hash
    db_desc = "#{db[:database]}@#{db[:host] || 'local'}"
    scope = Board.where(user_id: user.id)
    total = scope.count
    referenced = BetaSeed.content_boards_referenced_by_others(user)
    dry_run = ENV['DRY_RUN'].to_s =~ BetaSeed::TRUTHY_PATTERN

    puts "#{dry_run ? '[DRY RUN] ' : ''}Target: user '#{user_name}' (id #{user.id}) on DB #{db_desc}"
    puts "  #{total} board(s) would be deleted, then the premade library re-seeded."
    puts "  #{referenced} OTHER user(s) reference these boards (their home/sidebar would be cleared)."
    if dry_run
      scope.order(:key).limit(50).pluck(:key).each { |k| puts "    - #{k}" }
      puts "    ...and #{total - 50} more" if total > 50
      next
    end

    # Pre-flight the env ensure_baseline! needs BEFORE deleting, so a missing
    # password can't leave the library empty after the delete commits.
    missing_env = BetaSeed.missing_required_seed_env
    abort "Refusing: required seed env missing (#{missing_env.join(', ')}). Export them, then retry." if missing_env.any?

    unless ENV['REBUILD_CONFIRM'].to_s =~ BetaSeed::TRUTHY_PATTERN
      abort "Refusing to delete without REBUILD_CONFIRM=1. Re-run with REBUILD_CONFIRM=1 (or DRY_RUN=1 to preview)."
    end

    if Rails.env.production? && ENV['ALLOW_PROD_REBUILD'].to_s !~ BetaSeed::TRUTHY_PATTERN
      abort "Refusing to rebuild in production: delete+recreate assigns new board IDs " \
            "and breaks user copies / home-board references. Use an in-place refresh on prod."
    end

    if referenced.positive? && ENV['ALLOW_REFERENCED_DELETE'].to_s !~ BetaSeed::TRUTHY_PATTERN
      abort "Refusing: #{referenced} other user(s) have these boards as home/sidebar; deleting clears " \
            "those refs and notifies them. This usually means #{db_desc} holds real/prod-derived users. " \
            "Set ALLOW_REFERENCED_DELETE=1 only if you are certain this is throwaway data."
    end

    deleted = BetaSeed.rebuild_content_boards!(user)
    remaining = Board.where(user_id: user.id).count
    puts "Deleted #{deleted} board(s); content user now has #{remaining} board(s) after re-seed."

    missing = BetaSeed.verify_beta_seed(require_library_boards: true)
    if missing.empty?
      puts "OK: signup library verified. NOTE: individual gallery sets are not verified here " \
           "(was #{total} boards, now #{remaining}); compare those counts and spot-check in the app."
    else
      puts 'WARN: rebuilt, but required signup records are still missing:'
      missing.each { |item| puts "  - #{item}" }
      puts "(Likely an OpenAAC network/import failure; see logs above. Safe to re-run.)"
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
