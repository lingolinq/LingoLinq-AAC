class AddInactivitySweepIndexToUsers < ActiveRecord::Migration[7.2]
  # Supports the inactivity sweep's keyset paging (Subscription.inactive_deletion_candidate_ids
  # orders and filters users by (updated_at, id)). Built concurrently so the build does not take
  # a write-blocking lock on users.
  disable_ddl_transaction!

  def up
    add_index :users, [:updated_at, :id], algorithm: :concurrently
  end

  def down
    remove_index :users, column: [:updated_at, :id], algorithm: :concurrently
  end
end
