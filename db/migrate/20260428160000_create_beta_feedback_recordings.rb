class CreateBetaFeedbackRecordings < ActiveRecord::Migration[7.0]
  def change
    add_column :contact_messages, :beta_priority, :string
    add_index :contact_messages, [:recipient, :beta_priority, :created_at], name: 'index_contact_messages_on_recipient_priority_created_at'

    create_table :beta_feedback_recordings do |t|
      t.integer :contact_message_id
      t.string :status, null: false, default: 'pending'
      t.string :upload_key, null: false
      t.string :content_type, null: false
      t.integer :byte_size, null: false, default: 0
      t.string :token, null: false
      t.datetime :confirmed_at
      t.datetime :expires_at
      t.datetime :deleted_at
      t.text :settings
      t.timestamps null: false
    end

    add_index :beta_feedback_recordings, :contact_message_id
    add_index :beta_feedback_recordings, :token, unique: true
    add_index :beta_feedback_recordings, [:status, :expires_at]
  end
end
