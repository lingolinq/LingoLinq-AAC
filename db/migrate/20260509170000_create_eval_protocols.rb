class CreateEvalProtocols < ActiveRecord::Migration[5.0]
  def change
    create_table :eval_protocols do |t|
      t.integer :user_id
      t.integer :organization_id
      t.integer :parent_id
      t.string  :public_protocol_id
      t.string  :protocol_version, default: '1.0'
      t.string  :population_profile
      t.text    :settings
      t.boolean :communicator
      t.timestamps
    end
    add_index :eval_protocols, :public_protocol_id
    add_index :eval_protocols, :population_profile
  end
end
