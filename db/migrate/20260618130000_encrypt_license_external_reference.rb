class EncryptLicenseExternalReference < ActiveRecord::Migration[7.2]
  # LL-740bcb10fa (follow-up): License.external_reference is now encrypted at
  # rest via manual GoSecure::SecureJson accessors on the model. Re-encrypt any
  # pre-existing plaintext value so the model's decrypting reader returns the
  # right thing. external_reference has no writers anywhere in the app today, so
  # this is a defensive backfill expected to touch 0 rows; it is idempotent.
  #
  # Reads the raw column via SQL (not the model) so the decrypting accessor does
  # not interfere, and writes back through update_all (quoted by ActiveRecord, no
  # string interpolation; update_all bypasses the encrypting setter so the
  # pre-encrypted blob lands in the column verbatim).
  disable_ddl_transaction!

  def up
    migrated = 0
    rows = connection.select_rows(
      "SELECT id, external_reference FROM licenses WHERE external_reference IS NOT NULL AND external_reference <> ''"
    )
    rows.each do |id, raw|
      already_encrypted =
        begin
          GoSecure::SecureJson.load(raw)
          true
        rescue StandardError
          false
        end
      next if already_encrypted

      encrypted = GoSecure::SecureJson.dump(raw)
      License.where(id: id).update_all(external_reference: encrypted)
      migrated += 1
    end
    say "encrypted external_reference for #{migrated} license row(s)"
  end

  def down
    reverted = 0
    rows = connection.select_rows(
      "SELECT id, external_reference FROM licenses WHERE external_reference IS NOT NULL AND external_reference <> ''"
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
      License.where(id: id).update_all(external_reference: plaintext)
      reverted += 1
    end
    say "decrypted external_reference for #{reverted} license row(s)"
  end
end
