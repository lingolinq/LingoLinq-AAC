class AddUpdatedAtIndexToClusterLocations < ActiveRecord::Migration[7.2]
  # Supports the daily 12-month location cluster purge (ClusterLocation.purge_unused!),
  # which selects clusters by updated_at, the field that moves each time a session joins
  # a cluster. Built concurrently so the build does not take a write-blocking lock.
  disable_ddl_transaction!

  def up
    add_index :cluster_locations, :updated_at, algorithm: :concurrently
  end

  def down
    remove_index :cluster_locations, column: :updated_at, algorithm: :concurrently
  end
end
