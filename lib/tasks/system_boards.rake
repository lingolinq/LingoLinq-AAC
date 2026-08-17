namespace :lingolinq do
  desc 'Ensure the configured system board user has crisis-vocabulary from public/system-boards/crisis-vocabulary.obz'
  task ensure_crisis_vocabulary: :environment do
    owner = SystemBoardSources.owner
    raise "User not found: #{SystemBoardSources::USER_NAME}. Run db:seed first." unless owner

    board = SystemBoardSources.ensure_crisis_vocabulary!(owner)
    if board
      puts "OK: #{board.key} (#{board.global_id})"
    else
      puts 'SKIP: board not created (missing OBZ or import failed)'
      exit 1
    end
  end

  desc 'Ensure lingolinq/senner-baud from static S3 (system-boards/senner-baud.obz) or local tmp/seed-boards fallback'
  task ensure_senner_baud: :environment do
    owner = SystemBoardSources.owner
    raise "User not found: #{SystemBoardSources::USER_NAME}. Run db:seed first." unless owner

    board = SystemBoardSources.ensure_senner_baud!(owner)
    if board
      puts "OK: #{board.key} (#{board.global_id})"
    else
      puts 'SKIP: board not created (missing S3 object and no local OBZ).'
      puts "  Upload: bundle exec rake lingolinq:upload_curated_boards ONLY=senner-baud"
      puts "  Or place SennerBaudSocialPages60ll.obz in tmp/seed-boards/ (or set SENNER_BAUD_OBZ_PATH)."
      exit 1
    end
  end

  desc 'Upload curated OBZ/OBF from tmp/seed-boards/ to system-boards/ keys. Prefer UPLOAD_STATIC_S3_BUCKET (survives op run); else STATIC_S3_BUCKET. DRY_RUN=1, ONLY=<id|filename>.'
  task upload_curated_boards: :environment do
    dry_run = ENV['DRY_RUN'].to_s =~ /^(1|true|yes)$/i
    only = ENV['ONLY'].presence
    bucket = CuratedVocabularySources.static_bucket
    puts "Upload target bucket: #{bucket || '(unset)'}"
    results = CuratedVocabularySources.upload_all!(dry_run: dry_run, only: only)
    if results.empty?
      puts 'No catalog entries matched.'
      exit 1
    end
    results.each do |r|
      if r[:ok]
        prefix = r[:dry_run] ? 'DRY-RUN' : 'OK'
        puts "#{prefix}: #{r[:id]} -> s3://#{r[:bucket]}/#{r[:key]} (#{r[:bytes]} bytes)"
      else
        puts "FAIL: #{r[:id]} — #{r[:error]}"
      end
    end
    exit 1 if results.any? { |r| !r[:ok] }
  end

  desc 'Import curated gallery vocabularies from static S3 (prefer over OpenAAC overlaps). ONLY=<id> to limit. Local tmp/seed-boards fallback if S3 missing.'
  task import_curated_vocabularies: :environment do
    owner = SystemBoardSources.owner
    raise "User not found: #{SystemBoardSources::USER_NAME}. Run db:seed first." unless owner

    only = ENV['ONLY'].presence
    puts "Importing curated vocabularies as #{owner.user_name}..."
    results = CuratedVocabularySources.import_all!(owner: owner, only: only)
    results.each do |r|
      case r[:status]
      when :imported
        src = r[:source] == :local ? ' (local)' : ''
        puts "  OK: #{r[:key]} (#{r[:count]} boards)#{src}"
      when :skipped
        puts "  SKIP: #{r[:key]} already exists"
      when :missing
        puts "  MISSING: #{r[:id]} — upload with rake lingolinq:upload_curated_boards ONLY=#{r[:id]}"
      when :empty
        puts "  WARN: #{r[:id]} produced no boards"
      when :collided
        puts "  COLLIDE: #{r[:key]} (returned existing)"
      else
        puts "  #{r.inspect}"
      end
    end
    puts 'Done.'
  end
end
