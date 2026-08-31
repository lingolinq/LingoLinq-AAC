# Stores dest-locale translations on the English library boards owned by the
# lingolinq content account, without changing the visible default language.
# Additional languages are LANG/DEST_LANG (es, fr, …) on a later run.
class LibraryBoardTranslator
  SOURCE_LANG = 'en'
  DEFAULT_SLUGS = (
    SystemBoardSources::SIGNUP_LIBRARY_SLUGS + SystemBoardSources::SIDEBAR_COPY_SLUGS
  ).uniq.freeze
  SEED_SCOPE = 'seed'.freeze
  MISSING_ABORT_RATIO = 0.2
  TRUTHY = /^(1|true|yes)$/i.freeze

  def self.translate_library!(dest_lang:, slugs: nil, scope: nil, dry_run: false, report_path: nil)
    dest_lang = normalize_dest_lang(dest_lang)
    raise "dest_lang required" if dest_lang.blank?

    owner = SystemBoardSources.owner
    raise "System board owner #{SystemBoardSources::USER_NAME} not found" unless owner

    assert_production_ok!(dry_run: dry_run, scope: scope)

    boards = resolve_boards(owner, slugs: slugs, scope: scope)
    unless dry_run || google_translate_token_injected?
      message = "GOOGLE_TRANSLATE_TOKEN is not injected (blank or still an op:// ref). " \
                "Set it on the service env (Render job inherits the web service) or run under rails-dev / op run."
      raise message unless Rails.env.test?
      puts "WARN: #{message}"
    end

    combined_entries = []
    combined_translations = {}
    combined_origins = {}
    translated_keys = []
    skipped = []
    visited_board_ids = []

    boards.each do |board|
      reason = skip_reason(board)
      if reason
        skipped << [board.key, reason]
        puts "Skip #{board.key} — #{reason}"
        next
      end

      if dry_run
        loc = (board.settings || {})['locale']
        puts "[DRY RUN] #{board.key} locale=#{loc}"
        translated_keys << board.key
        next
      end

      puts "Translating #{board.key} -> #{dest_lang}..."
      Rails.logger.info("[LibraryBoardTranslator] Translating #{board.key} -> #{dest_lang}")
      result = translate_one!(board, dest_lang: dest_lang, visited_board_ids: visited_board_ids)
      merge_entries!(combined_entries, result[:entries])
      combined_translations.merge!(result[:translations] || {})
      combined_origins.merge!(result[:origins] || {})
      translated_keys << board.key
      puts "  #{board.key}: #{result[:entries].length} string(s), locale=#{board.reload.settings['locale']}"
    end

    if dry_run
      puts "Dry run: #{translated_keys.length} root(s) would be translated, #{skipped.length} skipped."
      return { dest_lang: dest_lang, slugs: translated_keys, skipped: skipped, dry_run: true, report_path: nil }
    end

    abort_if_too_many_missing!(combined_entries, combined_origins)

    path = write_report(
      dest_lang: dest_lang,
      entries: combined_entries,
      translations: combined_translations,
      origins: combined_origins,
      report_path: report_path
    )
    puts "Report: #{path}"
    { dest_lang: dest_lang, slugs: translated_keys, skipped: skipped, report_path: path }
  end

  # Listed public roots owned by the content user after a library reindex
  # (starter + sidebar + crisis + Senner + curated S3 + OpenAAC). Children are
  # unlisted and are reached by the tree walk, not this list.
  def self.discover_seed_roots(owner)
    Board.where(user_id: owner.id, public: true).select do |board|
      (board.settings || {})['unlisted'] != true
    end.sort_by(&:key)
  end

  def self.english_source?(board)
    loc = (board.settings || {})['locale'].to_s
    loc.blank? || loc.match?(/\Aen([_-]|$)/i)
  end

  def self.skip_reason(board)
    return 'missing or not public' unless board&.public?
    slug = board.key.to_s.split('/', 2).last.to_s
    return 'spanish copy slug' if slug.end_with?('-es')
    loc = (board.settings || {})['locale']
    return "locale=#{loc} (not English source)" unless english_source?(board)
    nil
  end

  def self.resolve_boards(owner, slugs:, scope:)
    slug_list = Array(slugs).map { |s| s.to_s.strip }.reject(&:blank?)
    if slug_list.any?
      slug_list.map { |slug|
        board = Board.find_by_path(SystemBoardSources.board_key(slug))
        unless board&.public?
          Rails.logger.warn("[LibraryBoardTranslator] Missing or non-public source: #{SystemBoardSources.board_key(slug)}")
          puts "Skip #{SystemBoardSources.board_key(slug)} — missing or not public"
        end
        board
      }.compact
    elsif scope.to_s.strip == SEED_SCOPE
      discover_seed_roots(owner)
    else
      DEFAULT_SLUGS.map { |slug|
        board = Board.find_by_path(SystemBoardSources.board_key(slug))
        unless board&.public?
          Rails.logger.warn("[LibraryBoardTranslator] Missing or non-public source: #{SystemBoardSources.board_key(slug)}")
          puts "Skip #{SystemBoardSources.board_key(slug)} — missing or not public"
        end
        board
      }.compact
    end
  end
  private_class_method :resolve_boards

  def self.translate_one!(board, dest_lang:, source_lang: SOURCE_LANG, visited_board_ids: nil)
    dest_lang = normalize_dest_lang(dest_lang)
    owner = board.user
    visited_board_ids ||= []
    board_ids = english_owned_ids(BoardTranslationWords.board_ids(board))
    entries = BoardTranslationWords.collect_entries(board_ids)
    words = entries.reject { |e| e[:identity] }.map { |e| e[:en] }.uniq
    Rails.logger.info("[LibraryBoardTranslator] #{board.key} dest=#{dest_lang} boards=#{board_ids.length} strings=#{words.length}")
    puts "  boards=#{board_ids.length} strings=#{words.length}"
    batch = WordData.translate_batch(words.map { |w| { text: w } }, source_lang, dest_lang)
    translations = batch[:translations] || {}
    origins = batch[:origins] || {}
    BoardTranslationWords.apply_identities(translations, origins, entries)
    matched = words.count { |w| %w[cache google override].include?(origins[w]) }
    missing_n = words.length - matched
    puts "  origins: cache=#{origins.values.count('cache')} google=#{origins.values.count('google')} override=#{origins.values.count('override')} identity=#{origins.values.count('identity')} missing=#{missing_n}"

    if translations.empty?
      Rails.logger.warn("[LibraryBoardTranslator] No translations for #{board.key}. Check GOOGLE_TRANSLATE_TOKEN (rails-dev / op run).")
      puts "  WARN: no translations returned — skipping save for #{board.key}"
    else
      board.translate_set(translations, {
        'source' => source_lang,
        'dest' => dest_lang,
        'board_ids' => board_ids,
        'default' => false,
        'user_key' => "user:#{owner.global_id}",
        'user_local_id' => owner.id,
        'allow_fallbacks' => false,
        'force_update_default' => false,
        'visited_board_ids' => visited_board_ids
      })
    end
    {
      board: board.reload,
      entries: entries,
      translations: translations,
      origins: origins,
      board_ids: board_ids
    }
  end

  def self.write_report(dest_lang:, entries:, translations:, origins:, report_path: nil)
    dest_lang = normalize_dest_lang(dest_lang)
    path = report_path.presence || Rails.root.join('tmp', "library-board-translations-#{dest_lang}.csv").to_s
    FileUtils.mkdir_p(File.dirname(path))
    File.open(path, 'w') do |f|
      f.puts(csv_row(%w[board_key button_id field en dest origin]))
      rows_for(entries, translations, origins).each { |row| f.puts(csv_row(row)) }
    end
    path
  end

  # DEST_LANG wins. LANG is accepted only when it looks like a language tag
  # (es, fr, es-US), not a shell locale (en_US.UTF-8).
  def self.parse_dest_lang(raw, default: 'es')
    val = raw.to_s.strip
    return default if val.blank?
    return default if val.include?('.')
    return val if val.match?(/\A[a-zA-Z]{2,3}([_-][a-zA-Z0-9]+)?\z/)
    default
  end

  def self.google_translate_token_injected?
    token = ENV['GOOGLE_TRANSLATE_TOKEN'].to_s.strip
    token.present? && !token.start_with?('op://')
  end

  def self.normalize_dest_lang(val)
    parsed = parse_dest_lang(val, default: nil)
    raise "invalid dest_lang: #{val.inspect}" if parsed.blank?
    parsed
  end

  def self.assert_production_ok!(dry_run:, scope:)
    return if dry_run || Rails.env.test?
    return unless Rails.env.production?
    unless ENV['ALLOW_PROD_TRANSLATE'].to_s =~ TRUTHY
      raise "Refusing library translate in production without ALLOW_PROD_TRANSLATE=1 " \
            "(staging Render services use RAILS_ENV=production)."
    end
    if scope.to_s.strip == SEED_SCOPE && ENV['TRANSLATE_CONFIRM'].to_s !~ TRUTHY
      raise "Refusing SCOPE=seed without TRANSLATE_CONFIRM=1."
    end
  end

  def self.english_owned_ids(ids)
    Board.find_all_by_path(ids).select { |b| english_source?(b) }.map(&:global_id)
  end

  def self.abort_if_too_many_missing!(entries, origins)
    return if Rails.env.test?
    return if ENV['ALLOW_PARTIAL_TRANSLATE'].to_s =~ TRUTHY
    words = entries.reject { |e| e[:identity] }.map { |e| e[:en] }.uniq
    return if words.empty?
    missing = words.count { |w| !%w[cache google override].include?(origins[w]) }
    ratio = missing.to_f / words.length
    return if ratio <= MISSING_ABORT_RATIO
    raise "Too many missing translations (#{missing}/#{words.length} = #{(ratio * 100).round}%). " \
          "Fix Google token/quota or set ALLOW_PARTIAL_TRANSLATE=1."
  end

  def self.merge_entries!(combined, incoming)
    seen = combined.each_with_object({}) { |e, h| h[entry_key(e)] = true }
    incoming.each do |e|
      key = entry_key(e)
      next if seen[key]
      seen[key] = true
      combined << e
    end
  end

  def self.entry_key(e)
    [e[:board_key], e[:button_id], e[:field], e[:en]]
  end

  def self.rows_for(entries, translations, origins)
    entries.map do |e|
      dest = translations[e[:en]]
      origin = dest ? (origins[e[:en]] || 'google') : 'missing'
      [e[:board_key], e[:button_id], e[:field], e[:en], dest || '', origin]
    end
  end

  def self.csv_row(fields)
    fields.map { |f| %("#{f.to_s.gsub('"', '""')}") }.join(',')
  end
  private_class_method :merge_entries!, :entry_key, :rows_for, :normalize_dest_lang, :csv_row,
                       :assert_production_ok!, :english_owned_ids, :abort_if_too_many_missing!
end
