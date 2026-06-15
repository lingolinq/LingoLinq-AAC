# Public/system vocabulary boards owned by the lingolinq content account.
module SystemBoardSources
  USER_NAME = ENV.fetch('SYSTEM_BOARD_USER_NAME', 'lingolinq').freeze
  CRISIS_VOCABULARY_SLUG = 'crisis-vocabulary'.freeze
  CRISIS_VOCABULARY_OBZ = Rails.root.join('public/system-boards/crisis-vocabulary.obz').freeze
  SENNER_BAUD_SLUG = 'senner-baud'.freeze
  # The Senner-Baud set is ~12 MB, so it is hosted in the static S3 bucket
  # (alongside avatars / AI assets) rather than committed to the repo. The seed
  # fetches it from the running environment's STATIC_S3_BUCKET, falling back to
  # the public prod bucket for local/dev (whose own static bucket is private).
  SENNER_BAUD_OBZ_KEY = 'system-boards/senner-baud.obz'.freeze
  SENNER_BAUD_OBZ_FALLBACK_BUCKET = 'lingolinq-prod-static'.freeze
  SENNER_BAUD_NAME = 'Senner-Baud Social Pages'.freeze
  SIGNUP_LIBRARY_SLUGS = %w[quick-core-60 vocal-flair-60 vocal-flair-84 crisis-vocabulary senner-baud].freeze
  SPANISH_LIBRARY_SLUGS = %w[quick-core-60-es vocal-flair-60-es].freeze
  SPANISH_SOURCE_MAP = {
    'quick-core-60-es' => 'quick-core-60',
    'vocal-flair-60-es' => 'vocal-flair-60'
  }.freeze

  def self.board_key(slug)
    "#{USER_NAME}/#{slug}"
  end

  def self.owner
    User.find_by(user_name: USER_NAME)
  end

  # Idempotent: ensures the configured system board user has crisis-vocabulary from the committed OBZ.
  def self.ensure_crisis_vocabulary!(owner = nil)
    owner ||= self.owner
    return nil unless owner

    key = board_key(CRISIS_VOCABULARY_SLUG)
    existing = Board.find_by_path(key)
    if existing
      existing.public = true
      existing.settings['name'] ||= "Crisis Vocabulary"
      existing.settings['unlisted'] = false
      existing.generate_stats
      existing.save_without_post_processing
      return existing
    end

    unless File.exist?(CRISIS_VOCABULARY_OBZ)
      Rails.logger.warn("[SystemBoardSources] Missing #{CRISIS_VOCABULARY_OBZ} — cannot import crisis vocabulary board")
      return nil
    end

    require Rails.root.join('lib', 'converters', 'lingo_linq')
    boards = Converters::LingoLinq.from_obz(CRISIS_VOCABULARY_OBZ.to_s, 'user' => owner, 'boards' => {})
    return nil if boards.blank?

    root = boards.first
    boards.each_with_index do |board, idx|
      if idx.zero?
        board.public = true
        board.key = key if board.user_id == owner.id
        board.settings['name'] ||= "Crisis Vocabulary"
        board.settings['unlisted'] = false
      else
        board.public = true
        board.settings['unlisted'] = true
      end
      board.generate_stats
      board.save_without_post_processing
    end

    root.instance_variable_set(:@buttons_changed, 'import')
    root.instance_variable_set(:@brand_new, true)
    root.save!

    Board.find_by_path(key) || root
  end

  # Candidate public S3 URLs for the Senner-Baud OBZ: the running environment's
  # static bucket first, then the public prod bucket as a fallback (so local/dev,
  # whose own static bucket is private/KMS-encrypted, still resolves it).
  def self.senner_baud_obz_urls
    buckets = [ENV['STATIC_S3_BUCKET'].presence, SENNER_BAUD_OBZ_FALLBACK_BUCKET].compact.uniq
    # Drop anything that isn't a syntactically valid S3 bucket name, so a
    # malformed STATIC_S3_BUCKET can't produce a bogus URL (it would just 404
    # and waste a request); fetch_senner_baud_obz then logs + returns nil.
    buckets = buckets.select { |b| b =~ /\A[a-z0-9][a-z0-9.\-]{1,61}[a-z0-9]\z/ }
    buckets.map { |b| "https://#{b}.s3.amazonaws.com/#{SENNER_BAUD_OBZ_KEY}" }
  end

  # Downloads the Senner-Baud OBZ from S3, returning [url, body] or nil.
  def self.fetch_senner_baud_obz
    require 'safe_http'
    senner_baud_obz_urls.each do |url|
      begin
        resp = SafeHttp.get(url, timeout: 300, connecttimeout: 30)
        return [url, resp.body] if resp && resp.success?
        Rails.logger.warn("[SystemBoardSources] Senner-Baud OBZ #{url} -> HTTP #{resp && resp.code}")
      rescue => e
        Rails.logger.warn("[SystemBoardSources] Senner-Baud OBZ fetch failed for #{url}: #{e.message}")
      end
    end
    nil
  end

  # Idempotent: ensures the system board user has the Senner-Baud social pages set
  # from the OBZ hosted in the static S3 bucket. Mirrors ensure_crisis_vocabulary!,
  # but sources the (large) OBZ from S3 rather than the repo. The export's root is
  # the "greetings" page; we re-key it to <user>/senner-baud and give it the set's
  # name so it reads cleanly in the signup library.
  def self.ensure_senner_baud!(owner = nil)
    owner ||= self.owner
    return nil unless owner

    key = board_key(SENNER_BAUD_SLUG)
    existing = Board.find_by_path(key)
    if existing
      existing.public = true
      existing.settings['name'] ||= SENNER_BAUD_NAME
      existing.settings['unlisted'] = false
      existing.generate_stats
      existing.save_without_post_processing
      return existing
    end

    fetched = fetch_senner_baud_obz
    unless fetched
      Rails.logger.warn("[SystemBoardSources] Could not fetch Senner-Baud OBZ from S3 (#{senner_baud_obz_urls.join(', ')}) — skipping import")
      return nil
    end

    require Rails.root.join('lib', 'converters', 'lingo_linq')
    require 'tempfile'
    boards = nil
    Tempfile.create(['senner_baud_', '.obz']) do |tmp|
      tmp.binmode
      tmp.write(fetched.last)
      tmp.close
      boards = Converters::LingoLinq.from_obz(tmp.path, 'user' => owner, 'boards' => {})
    end
    return nil if boards.blank?

    root = boards.first
    boards.each_with_index do |board, idx|
      if idx.zero?
        board.public = true
        board.key = key if board.user_id == owner.id
        board.settings['name'] = SENNER_BAUD_NAME
        board.settings['unlisted'] = false
      else
        board.public = true
        board.settings['unlisted'] = true
      end
      board.generate_stats
      board.save_without_post_processing
    end

    root.instance_variable_set(:@buttons_changed, 'import')
    root.instance_variable_set(:@brand_new, true)
    root.save!

    Board.find_by_path(key) || root
  rescue ActiveRecord::RecordNotUnique => e
    # A board already occupies <user>/senner-baud (a concurrent seed, or a
    # partial prior run that imported then died before this re-key). Don't abort
    # the whole seed; finalize and surface the existing board so callers stay
    # idempotent and never receive a half-published board.
    Rails.logger.warn("[SystemBoardSources] Senner-Baud re-key collided on #{key} (#{e.message}); returning existing board")
    existing = Board.find_by_path(key)
    if existing
      existing.public = true
      existing.settings['name'] ||= SENNER_BAUD_NAME
      existing.settings['unlisted'] = false
      existing.generate_stats
      existing.save_without_post_processing
    end
    existing
  end
end
