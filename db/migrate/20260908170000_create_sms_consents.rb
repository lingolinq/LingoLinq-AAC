class CreateSmsConsents < ActiveRecord::Migration[7.2]
  def change
    create_table :sms_consents do |t|
      t.integer :user_id, null: false
      t.string :target_hash, null: false
      t.string :state, null: false
      t.string :disclosure_version, null: false
      t.string :request_ip
      t.timestamps
    end

    add_index :sms_consents, [:user_id, :target_hash], unique: true, name: 'idx_sms_consents_user_hash'
  end
end
