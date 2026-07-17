class AddRecipientToContactMessages < ActiveRecord::Migration[7.0]
  def up
    add_column :contact_messages, :recipient, :string
    add_index :contact_messages, [:recipient, :created_at]

    ContactMessage.find_each do |m|
      next if m.recipient.present?

      s = m.settings
      next unless s.is_a?(Hash) && s['recipient'].to_s == 'beta_feedback'

      m.update_column(:recipient, 'beta_feedback')
    end
  end

  def down
    remove_index :contact_messages, name: 'index_contact_messages_on_recipient_and_created_at'
    remove_column :contact_messages, :recipient
  end
end
