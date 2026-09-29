# TEMPORARY (2026-09-28). Turns preferences.board_category_grouping.enabled off for every user
# in the database it runs against. Categories is IN PROGRESS and its flag is out of every list
# (lib/feature_flags.rb), so no stored "on" may survive to the day the flag is re-registered and
# silently regroup someone's board. Run once per environment by
# db/migrate/20260928120000_reset_board_category_grouping.rb; the write guard in
# User#sanitize_board_category_grouping! keeps it off afterwards.
# Remove both (and the migration) once the feature ships.
module BoardCategoryGroupingReset
  # Recorded as the PaperTrail whodunnit. User versions are written only when a whodunnit is set
  # and does not start with "job" (app/models/user.rb:44-45), and a migrate Job sets none.
  WHODUNNIT = 'migration:reset_board_category_grouping'

  # Returns {reset: <count>, failed: [<global_id>, ...]}. Idempotent: a user already off, with
  # no `enabled` key, or with a non-hash value is skipped without a save.
  def self.run
    reset = 0
    failed = []
    PaperTrail.request(whodunnit: WHODUNNIT) do
      User.find_each do |user|
        begin
          # Inside the rescue: `settings` is decrypted on first read and raises on a bad row.
          grouping = ((user.settings || {})['preferences'] || {})['board_category_grouping']
          next unless grouping.is_a?(Hash) && grouping.has_key?('enabled') && grouping['enabled'] != false
          # A savepoint per user, so a database error on one row cannot abort the migration's
          # transaction for every row after it.
          saved = User.transaction(requires_new: true) do
            grouping['enabled'] = false
            user.save
          end
          saved ? reset += 1 : failed << user.global_id
        rescue => e
          failed << user.global_id
        end
      end
    end
    {reset: reset, failed: failed}
  end
end
