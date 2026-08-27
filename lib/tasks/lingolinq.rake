namespace :lingolinq do
  desc 'Store dest-locale translations on English lingolinq library boards (default LANG=es). ' \
       'Does not change the English default. DEST_LANG wins over LANG; shell locales like ' \
       'en_US.UTF-8 are ignored. SLUGS=quick-core-60 limits the run. SCOPE=seed translates ' \
       'every listed public content-user root (reindex inventory). DRY_RUN=1 lists roots. ' \
       'Production (including Render staging) needs ALLOW_PROD_TRANSLATE=1; SCOPE=seed also ' \
       'needs TRANSLATE_CONFIRM=1. CSV written to tmp/.'
  task translate_library_boards: :environment do
    dest_lang = LibraryBoardTranslator.parse_dest_lang(
      ENV['DEST_LANG'].presence || ENV['BOARD_LANG'].presence || ENV['LANG']
    )
    slugs = ENV['SLUGS'].to_s.split(',').map(&:strip).reject(&:blank?)
    scope = ENV['SCOPE'].to_s.strip.presence
    dry_run = ENV['DRY_RUN'].to_s =~ /^(1|true|yes)$/i
    db = ActiveRecord::Base.connection_db_config.configuration_hash
    db_desc = "#{db[:database]}@#{db[:host] || 'local'}"
    puts "#{dry_run ? '[DRY RUN] ' : ''}Translating library boards on #{SystemBoardSources::USER_NAME} to #{dest_lang}" \
         "#{slugs.any? ? " (#{slugs.join(', ')})" : scope ? " (scope=#{scope})" : ''}..."
    puts "  Target: user '#{SystemBoardSources::USER_NAME}' on DB #{db_desc}"
    LibraryBoardTranslator.translate_library!(
      dest_lang: dest_lang,
      slugs: slugs.presence,
      scope: scope,
      dry_run: dry_run
    )
    puts 'Done.'
  end

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

  desc 'Apply category grouping to boards for users, keyed by BOARD KEY so it ports ' \
       'between environments. BOARDS=key1,key2 USERS=a,b|all [SCROLL=1] [NAMES=1] ' \
       '[ORDER=people,actions,…] [OFF=1] [DRY_RUN=1]'
  task seed_board_category_grouping: :environment do
    # Keyed by board KEY, never global_id: an id is unique to one database, so an id-keyed
    # override stops applying the moment it crosses environments. See
    # User#sanitize_board_category_grouping! and board-detail.js#_board_category_ref.
    board_keys = ENV['BOARDS'].to_s.split(',').map(&:strip).reject(&:empty?)
    abort 'Usage: BOARDS=user/slug[,user/slug] USERS=name[,name]|all rake lingolinq:seed_board_category_grouping' if board_keys.empty?

    missing = board_keys.reject { |k| Board.find_by_path(k) }
    abort "Board(s) not found: #{missing.join(', ')}" if missing.any?

    who = ENV['USERS'].to_s.strip
    abort 'Set USERS=name[,name] or USERS=all' if who.empty?
    users = who == 'all' ? User.all : who.split(',').map(&:strip).reject(&:empty?).map { |n| User.find_by_path(n) || abort("User not found: #{n}") }

    enabled = ENV['OFF'].to_s !~ /\A(1|true|yes)\z/i
    entry = {
      'enabled' => enabled,
      'order' => ENV['ORDER'].to_s.split(',').map(&:strip).reject(&:empty?),
      'show_category_names' => ENV['NAMES'].to_s !~ /\A(0|false|no)\z/i,
      'vertical_scroll' => ENV['SCROLL'].to_s !~ /\A(0|false|no)\z/i
    }
    dry = ENV['DRY_RUN'].to_s =~ /\A(1|true|yes)\z/i

    puts "#{dry ? '[DRY RUN] ' : ''}#{enabled ? 'Enabling' : 'Disabling'} category grouping"
    puts "  boards: #{board_keys.join(', ')}"
    puts "  entry:  #{entry.inspect}"
    changed = 0
    # USERS=all yields a relation (batch it); a name list yields an Array (which has no
    # find_each — that mismatch made the first run of this task die before updating anyone).
    roster = users.respond_to?(:find_each) ? users.find_each : users
    roster.each do |user|
      prefs = user.settings['preferences'] ||= {}
      grouping = prefs['board_category_grouping']
      grouping = {} unless grouping.is_a?(Hash)
      boards = grouping['boards']
      boards = {} unless boards.is_a?(Hash)
      before = boards.dup
      board_keys.each { |k| boards[k] = entry.dup }
      next if before == boards   # idempotent: re-running changes nothing
      changed += 1
      next if dry
      grouping['boards'] = boards
      # The top level is the user's DEFAULT for boards with no entry — left alone on
      # purpose, so seeding one board cannot silently regroup every other board they own.
      grouping['enabled'] = grouping['enabled'] == true
      grouping['order'] = grouping['order'].is_a?(Array) ? grouping['order'] : []
      prefs['board_category_grouping'] = grouping
      user.settings['preferences'] = prefs
      user.save
    end
    puts "#{dry ? 'Would update' : 'Updated'} #{changed} user(s) (of #{users.count})."
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
