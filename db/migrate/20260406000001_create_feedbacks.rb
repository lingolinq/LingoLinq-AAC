class CreateFeedbacks < ActiveRecord::Migration[7.0]
  def change
    create_table :feedbacks do |t|
      t.references :user, foreign_key: true, null: true
      t.references :organization, foreign_key: true, null: true
      t.string :category, null: false
      t.string :priority, null: false, default: 'normal'
      t.text :description, null: false
      t.string :email
      t.jsonb :device_info, null: false, default: {}
      t.string :screenshot_url
      t.string :status, null: false, default: 'open'
      t.timestamps
    end
    add_index :feedbacks, :category
    add_index :feedbacks, :priority
    add_index :feedbacks, :status
  end
end
