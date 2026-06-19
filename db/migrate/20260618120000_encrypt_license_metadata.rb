class EncryptLicenseMetadata < ActiveRecord::Migration[7.2]
  # LL-740bcb10fa: License.metadata moves to secure_serialize (encrypted at
  # rest). The model's reader now decrypts the column, so any pre-existing
  # plaintext value must be re-encrypted or reads would choke. metadata has no
  # writers anywhere in the app today, so this is a defensive backfill and is
  # expected to touch 0 rows; it is written to be safe and idempotent if data
  # does exist.
  #
  # We operate on the raw column via SQL (not the model) so we are not affected
  # by the model's decrypting accessor while migrating.
  disable_ddl_transaction!

  def up
    migrated = 0
    rows = connection.select_rows(
      "SELECT id, metadata FROM licenses WHERE metadata IS NOT NULL AND metadata <> ''"
    )
    rows.each do |id, raw|
      # Already SecureJson-encrypted? load succeeds -> skip (idempotent).
      already_encrypted =
        begin
          GoSecure::SecureJson.load(raw)
          true
        rescue StandardError
          false
        end
      next if already_encrypted

      object = raw.strip.start_with?('{', '[') ? (JSON.parse(raw) rescue raw) : raw
      encrypted = GoSecure::SecureJson.dump(object)
      connection.execute(
        "UPDATE licenses SET metadata = #{connection.quote(encrypted)} WHERE id = #{id.to_i}"
      )
      migrated += 1
    end
    say "encrypted metadata for #{migrated} license row(s)"
  end

  def down
    # Best-effort: decrypt back to plaintext JSON so a rollback leaves the
    # column readable by the (reverted) plain model.
    reverted = 0
    rows = connection.select_rows(
      "SELECT id, metadata FROM licenses WHERE metadata IS NOT NULL AND metadata <> ''"
    )
    rows.each do |id, raw|
      decrypted =
        begin
          GoSecure::SecureJson.load(raw)
        rescue StandardError
          nil
        end
      next if decrypted.nil?

      plaintext = decrypted.is_a?(String) ? decrypted : decrypted.to_json
      connection.execute(
        "UPDATE licenses SET metadata = #{connection.quote(plaintext)} WHERE id = #{id.to_i}"
      )
      reverted += 1
    end
    say "decrypted metadata for #{reverted} license row(s)"
  end
end
