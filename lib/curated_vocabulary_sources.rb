# Curated AAC board sets hosted on STATIC_S3_BUCKET under system-boards/.
# Prefer these over OpenAAC openboards downloads where they overlap (avoids
# CoughDrop-branded text). Large OBZs stay out of git — keep sources in
# tmp/seed-boards/ and upload with lingolinq:upload_curated_boards.
module CuratedVocabularySources
  SEED_DIR = Rails.root.join('tmp/seed-boards').freeze
  FALLBACK_BUCKET = 'lingolinq-prod-static'.freeze

  # local_filename: file under tmp/seed-boards/
  # s3_key: object key in STATIC_S3_BUCKET
  # root_slug: idempotent Board key under the content user (lingolinq/<slug>)
  # openaac_file: OpenAAC examples filename to skip when this curated set is preferred
  # import: false for sets handled elsewhere (e.g. Senner via SystemBoardSources)
  CATALOG = [
    {
      id: 'senner-baud',
      local_filename: 'SennerBaudSocialPages60ll.obz',
      s3_key: 'system-boards/senner-baud.obz',
      root_slug: 'senner-baud',
      import: false
    },
    {
      id: 'vocal-flair-84-w-keyboard',
      local_filename: 'Vocal-flair-84-w-keyboard.obz',
      s3_key: 'system-boards/vocal-flair-84-w-keyboard.obz',
      root_slug: 'vocal-flair-84-w-keyboard',
      openaac_file: 'vocal-flair-84-with-keyboard.obz'
    },
    {
      id: 'communikate-20',
      local_filename: 'communikate-20.obz',
      s3_key: 'system-boards/communikate-20.obz',
      root_slug: 'communikate-20',
      openaac_file: 'communikate-20.obz'
    },
    {
      id: 'sequoia-15',
      local_filename: 'sequoia_15.obz',
      s3_key: 'system-boards/sequoia-15.obz',
      root_slug: 'sequoia-15',
      openaac_file: 'sequoia-15.obz'
    },
    {
      id: 'project-core',
      local_filename: 'project_core_36_universal_core.obf',
      s3_key: 'system-boards/project-core.obf',
      root_slug: 'project-core',
      openaac_file: 'project-core.obf'
    },
    {
      id: 'adult-aphasia-board',
      local_filename: 'adult-aphasia-board.obz',
      s3_key: 'system-boards/adult-aphasia-board.obz',
      root_slug: 'adult-aphasia-board'
    },
    {
      id: 'core-28-full',
      local_filename: 'core-28-full.obz',
      s3_key: 'system-boards/core-28-full.obz',
      root_slug: 'core-28-full'
    },
    {
      id: 'four-grid-starting-communication',
      local_filename: 'four-grid-starting-communication.obz',
      s3_key: 'system-boards/four-grid-starting-communication.obz',
      root_slug: 'four-grid-starting-communication'
    },
    {
      id: 'jokes',
      local_filename: 'jokes.obf',
      s3_key: 'system-boards/jokes.obf',
      root_slug: 'jokes'
    },
    {
      id: 'keyboard-with-categories',
      local_filename: 'keyboard-with-categories.obz',
      s3_key: 'system-boards/keyboard-with-categories.obz',
      root_slug: 'keyboard-with-categories'
    },
    {
      id: 'praactical-core-36',
      local_filename: 'praactical-core-36.obf',
      s3_key: 'system-boards/praactical-core-36.obf',
      root_slug: 'praactical-core-36'
    },
    {
      id: 'urehab-hospital-home-full',
      local_filename: 'urehab-hospital-home-full.obz',
      s3_key: 'system-boards/urehab-hospital-home-full.obz',
      root_slug: 'urehab-hospital-home-full'
    },
    {
      id: 'short-videos',
      local_filename: 'short_videos.obf',
      s3_key: 'system-boards/short_videos.obf',
      root_slug: 'short-videos'
    },
    {
      id: 'sound-effects',
      local_filename: 'sound_effects.obf',
      s3_key: 'system-boards/sound_effects.obf',
      root_slug: 'sound-effects'
    }
  ].map(&:freeze).freeze

  def self.importable_entries
    CATALOG.select { |e| e.fetch(:import, true) }
  end

  def self.openaac_skip_files
    CATALOG.map { |e| e[:openaac_file] }.compact.uniq
  end

  def self.local_path_for(entry)
    SEED_DIR.join(entry[:local_filename])
  end

  def self.content_type_for(path)
    case File.extname(path.to_s).downcase
    when '.obf' then 'application/json'
    when '.obz' then 'application/zip'
    else 'application/octet-stream'
    end
  end

  # Upload target: UPLOAD_STATIC_S3_BUCKET wins so `op run --env-file=...` cannot
  # clobber an intentional staging/prod override with the local STATIC_S3_BUCKET.
  def self.static_bucket
    ENV['UPLOAD_STATIC_S3_BUCKET'].to_s.strip.presence ||
      ENV['STATIC_S3_BUCKET'].to_s.strip.presence
  end

  def self.obz_urls_for(s3_key)
    buckets = [static_bucket, FALLBACK_BUCKET].compact.uniq
    buckets = buckets.select { |b| b =~ /\A[a-z0-9][a-z0-9.\-]{1,61}[a-z0-9]\z/ }
    buckets.map { |b| "https://#{b}.s3.amazonaws.com/#{s3_key}" }
  end

  def self.fetch_bytes(s3_key)
    require 'safe_http'
    obz_urls_for(s3_key).each do |url|
      begin
        resp = SafeHttp.get(url, timeout: 300, connecttimeout: 30)
        return [url, resp.body] if resp && resp.success?
        Rails.logger.warn("[CuratedVocabularySources] #{url} -> HTTP #{resp && resp.code}")
      rescue => e
        Rails.logger.warn("[CuratedVocabularySources] fetch failed for #{url}: #{e.message}")
      end
    end
    nil
  end

  # Upload one local file from tmp/seed-boards to STATIC_S3_BUCKET.
  def self.upload_entry!(entry, dry_run: false)
    local = local_path_for(entry)
    unless File.exist?(local)
      return {ok: false, error: "missing local file #{local}"}
    end
    bucket = static_bucket
    return {ok: false, error: 'STATIC_S3_BUCKET not set'} if bucket.blank?

    if dry_run
      return {ok: true, dry_run: true, bucket: bucket, key: entry[:s3_key], bytes: File.size(local)}
    end

    require 'aws-sdk-s3'
    config = Uploader.remote_upload_config
    unless config[:access_key].present? && config[:secret].present?
      return {ok: false, error: 'AWS credentials missing (AWS_KEY/AWS_SECRET)'}
    end

    client = Aws::S3::Client.new(
      region: Uploader.s3_region,
      credentials: Aws::Credentials.new(config[:access_key], config[:secret]),
      http_open_timeout: 30,
      http_read_timeout: 600
    )
    File.open(local, 'rb') do |file|
      client.put_object(
        bucket: bucket,
        key: entry[:s3_key],
        body: file,
        content_type: content_type_for(local),
        cache_control: 'public, max-age=86400'
      )
    end
    {ok: true, bucket: bucket, key: entry[:s3_key], bytes: File.size(local)}
  rescue => e
    {ok: false, error: e.message}
  end

  def self.upload_all!(dry_run: false, only: nil)
    entries = CATALOG
    entries = entries.select { |e| e[:id] == only || e[:local_filename] == only } if only.present?
    entries.map { |e| upload_entry!(e, dry_run: dry_run).merge(id: e[:id]) }
  end

  # Idempotent import of curated gallery sets (not Senner). Mirrors OpenAAC post-process.
  def self.import_all!(owner: nil, only: nil)
    owner ||= SystemBoardSources.owner
    raise "User not found: #{SystemBoardSources::USER_NAME}" unless owner

    require Rails.root.join('lib', 'converters', 'lingo_linq')
    require 'tempfile'

    entries = importable_entries
    if only.present?
      entries = entries.select { |e| e[:id] == only || e[:local_filename] == only || e[:s3_key] == only }
    end

    results = []
    entries.each do |entry|
      results << import_entry!(entry, owner)
    end
    results
  end

  def self.import_entry!(entry, owner)
    key = SystemBoardSources.board_key(entry[:root_slug])
    existing = Board.find_by_path(key)
    if existing
      finalize_root!(existing, name: existing.settings['name'])
      return {id: entry[:id], status: :skipped, key: key, board: existing}
    end

    fetched = fetch_bytes(entry[:s3_key])
    unless fetched
      local = local_path_for(entry)
      if File.exist?(local)
        return import_from_path!(entry, owner, local.to_s)
      end
      Rails.logger.warn("[CuratedVocabularySources] missing #{entry[:s3_key]} (and no local #{local})")
      return {id: entry[:id], status: :missing, key: key}
    end

    ext = File.extname(entry[:s3_key]).downcase
    boards = nil
    Tempfile.create(['curated_', ext]) do |tmp|
      tmp.binmode
      tmp.write(fetched.last)
      tmp.close
      boards = load_boards_from_path(tmp.path, ext, owner)
    end
    return {id: entry[:id], status: :empty, key: key} if boards.blank?

    root = post_process_import!(boards, owner, key)
    {id: entry[:id], status: :imported, key: key, board: root, count: boards.size}
  rescue ActiveRecord::RecordNotUnique => e
    existing = Board.find_by_path(key)
    Rails.logger.warn("[CuratedVocabularySources] re-key collided on #{key} (#{e.message})")
    finalize_root!(existing) if existing
    {id: entry[:id], status: :collided, key: key, board: existing}
  end

  def self.import_from_path!(entry, owner, path)
    key = SystemBoardSources.board_key(entry[:root_slug])
    ext = File.extname(path).downcase
    boards = load_boards_from_path(path, ext, owner)
    return {id: entry[:id], status: :empty, key: key} if boards.blank?

    root = post_process_import!(boards, owner, key)
    {id: entry[:id], status: :imported, key: key, board: root, count: boards.size, source: :local}
  end

  def self.load_boards_from_path(path, ext, owner)
    if ext == '.obf'
      Array(Converters::LingoLinq.from_obf(path, 'user' => owner, 'boards' => {}))
    else
      Converters::LingoLinq.from_obz(path, 'user' => owner, 'boards' => {})
    end
  end

  def self.post_process_import!(boards, owner, key)
    root = boards.first
    boards.each_with_index do |board, idx|
      if idx.zero?
        board.public = true
        board.key = key if board.user_id == owner.id
        board.settings['home_board'] = true
        board.settings['unlisted'] = false
      else
        board.public = true
        board.settings['unlisted'] = true
      end
      board.generate_stats
      board.save_without_post_processing
    end

    SystemBoardSources.sync_load_board_keys!(boards)

    root.instance_variable_set(:@buttons_changed, 'import')
    root.instance_variable_set(:@brand_new, true)
    root.save!
    Board.find_by_path(key) || root
  end

  def self.finalize_root!(board, name: nil)
    return unless board
    board.public = true
    board.settings['name'] = name if name.present?
    board.settings['unlisted'] = false
    board.generate_stats
    board.save_without_post_processing
    board
  end
end
