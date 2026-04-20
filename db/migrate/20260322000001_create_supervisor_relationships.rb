class CreateSupervisorRelationships < ActiveRecord::Migration[7.0]
  def change
    create_table :supervisor_relationships do |t|
      t.integer :supervisor_user_id, null: false
      t.integer :communicator_user_id, null: false
      t.string :status, null: false, default: 'pending'
      t.string :permission_level, null: false, default: 'view_only'
      t.string :initiated_by
      t.string :creation_method
      t.string :lookup_method
      t.string :consent_response_token
      t.datetime :consent_token_expires_at
      t.string :consent_email_sent_to
      t.datetime :consent_requested_at
      t.datetime :consent_responded_at
      t.datetime :activated_at
      t.datetime :revoked_at
      t.integer :revoked_by
      t.string :revocation_reason
      t.boolean :supervisor_created_account, default: false
      t.integer :user_link_id
      t.integer :organization_id
      t.text :metadata
      t.timestamps
    end

    add_index :supervisor_relationships, :supervisor_user_id
    add_index :supervisor_relationships, :communicator_user_id
    add_index :supervisor_relationships, [:supervisor_user_id, :communicator_user_id],
              where: "status IN ('pending', 'approved')",
              unique: true,
              name: 'index_supervisor_rel_active_pair'
    add_index :supervisor_relationships, :consent_response_token,
              where: 'consent_response_token IS NOT NULL',
              unique: true,
              name: 'index_supervisor_rel_consent_token'
    add_index :supervisor_relationships, :consent_token_expires_at,
              where: "status = 'pending'",
              name: 'index_supervisor_rel_pending_expiry'
  end
end
