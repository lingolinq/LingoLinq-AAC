class RewriteLegacyWordArtAuthorUrl < ActiveRecord::Migration[7.2]
  # Word-art images were saved with license author_url on the legacy
  # mylingolinq.com domain from the fork rename. The frontend now writes
  # https://www.lingolinq.com and Processable#process_license normalizes stale
  # clients (LegacyLinks); this rewrites the stored copies (the main license, the
  # fallback image's license and any library_alternates license) to match.
  #
  # button_images.settings is secure_serialized (encrypted at rest), so rows
  # cannot be filtered in SQL: every row is read and decrypted. We read the raw
  # column via SQL and write back through update_all with a re-encrypted blob,
  # as in 20260618120000_encrypt_license_metadata.rb, so model callbacks do not
  # run. Rows with nothing to rewrite are not written, so a re-run is a no-op.
  #
  # The previous web revision and workers keep saving images while this runs,
  # so each write only lands if the column still holds the ciphertext we read;
  # otherwise the row is re-read and rewritten from its current value.
  disable_ddl_transaction!

  # settings can carry an unconfirmed upload's data URI (up to 512KB), so keep
  # batches small enough for the migrate job's memory.
  BATCH_SIZE = 50
  MAX_ATTEMPTS = 5

  def up
    counts = Hash.new(0)
    unreadable_ids = []
    last_id = 0
    loop do
      rows = connection.select_rows(
        ActiveRecord::Base.sanitize_sql_array(
          ["SELECT id, settings FROM button_images WHERE id > ? AND settings IS NOT NULL ORDER BY id LIMIT ?", last_id, BATCH_SIZE]
        )
      )
      break if rows.empty?
      rows.each do |id, raw|
        last_id = id.to_i
        result = rewrite_row(last_id, raw)
        counts[result] += 1
        unreadable_ids << last_id if result == :unreadable
      end
    end
    say "rewrote legacy author_url on #{counts[:rewritten]} button_image row(s)"
    if unreadable_ids.any?
      say "could not read #{unreadable_ids.length} button_image row(s): #{unreadable_ids.join(', ')}"
    end
    if counts[:conflict] > 0
      say "gave up on #{counts[:conflict]} button_image row(s) still being written after #{MAX_ATTEMPTS} attempts"
    end
  end

  def down
    # Restoring an address on a domain LingoLinq does not own is never wanted.
  end

  private

  def rewrite_row(id, raw)
    MAX_ATTEMPTS.times do
      return :gone if raw.nil?
      settings = load_settings(raw)
      return :unreadable unless settings.is_a?(Hash)
      return :unchanged unless rewrite_author_urls(settings)
      written = ButtonImage.where(id: id, settings: raw).update_all(settings: GoSecure::SecureJson.dump(settings), updated_at: Time.now)
      return :rewritten if written == 1
      raw = connection.select_value(
        ActiveRecord::Base.sanitize_sql_array(["SELECT settings FROM button_images WHERE id = ?", id])
      )
    end
    :conflict
  end

  def load_settings(raw)
    raw.match(/\s*^{/) ? JSON.parse(raw) : GoSecure::SecureJson.load(raw)
  rescue StandardError
    nil
  end

  def rewrite_author_urls(settings)
    licenses = [settings['license']]
    licenses << settings['fallback']['license'] if settings['fallback'].is_a?(Hash)
    if settings['library_alternates'].is_a?(Hash)
      settings['library_alternates'].each_value do |alternate|
        licenses << alternate['license'] if alternate.is_a?(Hash)
      end
    end
    changed = false
    licenses.each do |license|
      next unless license.is_a?(Hash) && LegacyLinks.legacy_url?(license['author_url'])
      LegacyLinks.normalize_license(license)
      changed = true
    end
    changed
  end
end
