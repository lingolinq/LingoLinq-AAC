class CreateSmsConsentInvites < ActiveRecord::Migration[7.2]
  def change
    create_table :sms_consent_invites do |t|
      t.integer :user_id, null: false
      t.string :token, null: false
      t.datetime :expires_at, null: false
      t.timestamps
    end

    add_index :sms_consent_invites, :token, unique: true, name: 'idx_sms_consent_invites_token'
    add_index :sms_consent_invites, :user_id
  end
end
