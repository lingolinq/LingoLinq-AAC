class RewriteLegacyWordArtAuthorUrl < ActiveRecord::Migration[7.2]
  # Word-art images were saved with license author_url pointing at the
  # mylingolinq.com domain, which LingoLinq does not own. The frontend now
  # writes https://www.lingolinq.com; this rewrites the stored copies (the main
  # license and any library_alternates license) to match.
  #
  # button_images.settings is secure_serialized (encrypted at rest), so rows
  # cannot be filtered in SQL: every row is read and decrypted. We read the raw
  # column via SQL and write back through update_all with a re-encrypted blob,
  # as in 20260618120000_encrypt_license_metadata.rb, so model callbacks do not
  # run. Rows with nothing to rewrite are not written, so a re-run is a no-op.
  disable_ddl_transaction!

  BATCH_SIZE = 500
  LEGACY_HOST = /\A(?:https?:)?\/\/(?:[a-z0-9-]+\.)*mylingolinq\.com(?:[\/:?#]|\z)/i
  NEW_URL = 'https://www.lingolinq.com'

  def up
    rewritten = 0
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
        settings = load_settings(raw)
        next unless settings.is_a?(Hash) && rewrite_author_urls(settings)
        ButtonImage.where(id: id).update_all(settings: GoSecure::SecureJson.dump(settings), updated_at: Time.now)
        rewritten += 1
      end
    end
    say "rewrote legacy author_url on #{rewritten} button_image row(s)"
  end

  def down
    # Restoring an address on a domain LingoLinq does not own is never wanted.
  end

  private

  def load_settings(raw)
    raw.match(/\s*^{/) ? JSON.parse(raw) : GoSecure::SecureJson.load(raw)
  rescue StandardError
    nil
  end

  def rewrite_author_urls(settings)
    licenses = [settings['license']]
    (settings['library_alternates'] || {}).each_value do |alternate|
      licenses << alternate['license'] if alternate.is_a?(Hash)
    end
    changed = false
    licenses.each do |license|
      next unless license.is_a?(Hash) && license['author_url'].is_a?(String) && license['author_url'].match?(LEGACY_HOST)
      license['author_url'] = NEW_URL
      changed = true
    end
    changed
  end
end
