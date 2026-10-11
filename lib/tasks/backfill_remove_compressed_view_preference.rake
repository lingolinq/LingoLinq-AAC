# One-time cleanup for the removal of Compressed View (2026-10-10).
#
# Compressed View was a per-user density preference, `settings['preferences']['compressed_view']`,
# toggled from the View menu. The feature was removed from the project (requested: "remove the
# compressed view toggle and all of its settings -> we're removing it from the project"), and the
# server no longer accepts the key (User::PREFERENCE_PARAMS). Nothing reads it any more, so a
# stored value is inert; this task removes it so no account keeps a setting for a feature that is
# gone. Every other preference is left as it is.
#
# settings is GoSecure-encrypted at rest, so it cannot be queried in SQL -- every user has to be
# loaded and checked in Ruby (the same shape as extras:clear_no_name_placeholder).
#
# Prints counts and, on an error, the record's global id; never a name or any other setting.
#
#   rake extras:backfill_remove_compressed_view_preference          # report only, changes nothing
#   rake extras:backfill_remove_compressed_view_preference FRD=1    # actually write
task "extras:backfill_remove_compressed_view_preference" => :environment do
  frd = ENV['FRD'] == '1'
  puts "=============================================="
  puts frd ? "Removing the compressed_view preference" : "DRY RUN -- pass FRD=1 to write"
  puts "=============================================="

  total = User.count
  checked = 0
  matched = 0
  updated = 0
  errors = 0

  User.find_each do |user|
    checked += 1
    print "\r  Checked #{checked}/#{total}, found #{matched}...      " if checked % 100 == 0
    begin
      prefs = user.settings && user.settings['preferences']
      next unless prefs.is_a?(Hash) && prefs.has_key?('compressed_view')
      matched += 1
      next unless frd
      prefs.delete('compressed_view')
      # Plain settings mutation, as in extras:clear_no_name_placeholder: both after_save hooks
      # early-return (track_boards needs @do_track_boards; notify_of_changes needs
      # @password_changed / @email_changed / @opt_out), so this sends no mail and queues no jobs.
      user.save!
      updated += 1
    rescue => e
      errors += 1
      puts "\n  ERROR on #{user.global_id}: #{e.class}: #{e.message}"
    end
  end

  puts "\n  Checked #{checked} users"
  puts "  Carrying the key: #{matched}"
  puts frd ? "  Removed: #{updated} (#{errors} errors)" : "  Removed: 0 (dry run)"
  puts "=============================================="
end
