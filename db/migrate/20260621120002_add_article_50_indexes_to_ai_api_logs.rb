class AddArticle50IndexesToAiApiLogs < ActiveRecord::Migration[7.2]
  # Concurrent index creation so the build does not take a write-blocking lock on the
  # large, append-heavy ai_api_logs audit table (the AI-call logging path must stay live).
  # Explicit up/down (not `change`) so the rollback also drops concurrently and stays
  # reversible if a partial `where:` index is added here later (which `change` cannot invert).
  disable_ddl_transaction!

  def up
    add_index :ai_api_logs, :jurisdiction, algorithm: :concurrently
    add_index :ai_api_logs, [:jurisdiction, :created_at],
              name: 'index_ai_api_logs_on_jurisdiction_and_created_at',
              algorithm: :concurrently
    add_index :ai_api_logs, :ai_generated_content_id, algorithm: :concurrently
  end

  def down
    remove_index :ai_api_logs, column: :jurisdiction, algorithm: :concurrently
    remove_index :ai_api_logs, name: 'index_ai_api_logs_on_jurisdiction_and_created_at',
                 algorithm: :concurrently
    remove_index :ai_api_logs, column: :ai_generated_content_id, algorithm: :concurrently
  end
end
