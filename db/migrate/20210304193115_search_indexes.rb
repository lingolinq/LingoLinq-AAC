class SearchIndexes < ActiveRecord::Migration[5.0]
  disable_ddl_transaction!
  def change
    # Skip PostgreSQL-specific operations for SQLite development
    if ActiveRecord::Base.connection.adapter_name.downcase.include?('postgresql')
      enable_extension "btree_gin"
      remove_index :board_locales, [:search_string]
      add_index :boards, [:search_string], :using => :gin, algorithm: :concurrently
      add_index :board_locales, [:search_string], :using => :gin, algorithm: :concurrently
    else
      # Use regular indexes for SQLite
      remove_index :board_locales, [:search_string] rescue nil
      add_index :boards, [:search_string] rescue nil
      add_index :board_locales, [:search_string] rescue nil
    end
  end
end
