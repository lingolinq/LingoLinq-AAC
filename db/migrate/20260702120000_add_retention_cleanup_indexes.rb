class AddRetentionCleanupIndexes < ActiveRecord::Migration[7.2]
  # Concurrent index creation so the build does not take a write-blocking lock on
  # these actively-written tables. Supports the orphan anti-joins and age scans
  # added in Flusher.flush_leftovers (LL-991d259b2a).
  disable_ddl_transaction!

  def up
    add_index :board_button_sounds, :button_sound_id, algorithm: :concurrently
    add_index :progresses, :created_at, algorithm: :concurrently
    add_index :log_session_boards, :log_session_id, algorithm: :concurrently
  end

  def down
    remove_index :board_button_sounds, column: :button_sound_id, algorithm: :concurrently
    remove_index :progresses, column: :created_at, algorithm: :concurrently
    remove_index :log_session_boards, column: :log_session_id, algorithm: :concurrently
  end
end
