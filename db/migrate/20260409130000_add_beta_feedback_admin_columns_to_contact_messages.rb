class AddBetaFeedbackAdminColumnsToContactMessages < ActiveRecord::Migration[7.0]
  def up
    add_column :contact_messages, :hidden, :boolean, null: false, default: false
    add_column :contact_messages, :beta_subject, :string
    add_column :contact_messages, :beta_submitter_name, :string
    add_column :contact_messages, :beta_feedback_type, :string
    add_column :contact_messages, :beta_severity, :string
    add_index :contact_messages, [:recipient, :hidden, :created_at], name: 'index_contact_messages_on_recipient_hidden_created_at'

    ContactMessage.where(recipient: 'beta_feedback').find_each do |m|
      s = m.settings
      next unless s.is_a?(Hash)

      m.update_columns(
        hidden: false,
        beta_subject: s['subject'],
        beta_submitter_name: s['name'].presence,
        beta_feedback_type: s['feedback_type'],
        beta_severity: s['severity']
      )
    end
  end

  def down
    remove_index :contact_messages, name: 'index_contact_messages_on_recipient_hidden_created_at'
    remove_column :contact_messages, :beta_severity
    remove_column :contact_messages, :beta_feedback_type
    remove_column :contact_messages, :beta_submitter_name
    remove_column :contact_messages, :beta_subject
    remove_column :contact_messages, :hidden
  end
end
