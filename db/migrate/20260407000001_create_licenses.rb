class CreateLicenses < ActiveRecord::Migration[7.2]
  def change
    create_table :licenses do |t|
      t.integer :organization_id, null: false # The District
      t.integer :user_id                      # The AAC User (Student)
      t.string :seat_type, default: 'student' # 'student', 'supervisor', etc.
      t.string :status, default: 'active'     # 'active', 'suspended'
      t.datetime :granted_at                  # When assigned to this user
      t.datetime :expires_at                  # When the seat itself expires
      t.string :external_reference            # PO Number or Stripe ID
      t.text :metadata                        # Flexible storage for extra data

      t.timestamps
    end

    add_index :licenses, :organization_id
    add_index :licenses, :user_id
    add_index :licenses, [:organization_id, :status]
  end
end
