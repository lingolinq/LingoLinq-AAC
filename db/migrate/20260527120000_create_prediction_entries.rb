class CreatePredictionEntries < ActiveRecord::Migration[5.0]
  def change
    create_table :prediction_entries do |t|
      t.integer :user_id, null: false
      t.string :locale, null: false, default: 'en'
      t.string :prefix, null: false, default: ''
      t.string :next_word, null: false
      t.float :score, null: false, default: 1.0
      t.string :source, null: false, default: 'selection'
      t.timestamps
    end

    add_index :prediction_entries, [:user_id, :locale, :prefix, :next_word],
              unique: true,
              name: 'idx_prediction_entries_unique'
    add_index :prediction_entries, [:user_id, :locale, :prefix],
              name: 'idx_prediction_entries_prefix'
  end
end
