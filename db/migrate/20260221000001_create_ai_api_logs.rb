class CreateAiApiLogs < ActiveRecord::Migration[5.0]
  def change
    create_table :ai_api_logs do |t|
      t.string :ai_provider, null: false
      t.string :model_name
      t.string :request_type, null: false
      t.string :request_payload_hash
      t.text :request_summary
      t.text :response_summary
      t.integer :tokens_sent
      t.integer :tokens_received
      t.integer :duration_ms
      t.string :user_global_id
      t.string :organization_global_id
      t.boolean :pii_detected, default: false
      t.text :pii_findings
      t.boolean :success, default: true
      t.text :error_message
      t.string :ip_address
      t.string :feature_flag

      t.timestamps
    end

    add_index :ai_api_logs, :user_global_id
    add_index :ai_api_logs, :organization_global_id
    add_index :ai_api_logs, :ai_provider
    add_index :ai_api_logs, :request_type
    add_index :ai_api_logs, :created_at
    add_index :ai_api_logs, [:ai_provider, :created_at], name: 'index_ai_api_logs_on_provider_and_created_at'
  end
end
