class CreateAiFocusWordSets < ActiveRecord::Migration[5.0]
  def change
    create_table :ai_focus_word_sets do |t|
      t.text :scrubbed_prompt, null: false
      t.text :normalized_prompt, null: false
      t.string :prompt_hash, null: false
      t.string :locale, null: false, default: 'en'
      t.boolean :include_core_words, null: false, default: true
      t.string :title
      t.text :words
      t.text :applied_words
      t.integer :word_count, null: false, default: 0
      t.string :source, null: false, default: 'ai'
      t.string :status, null: false, default: 'generated'
      t.float :quality_score
      t.integer :generated_count, null: false, default: 0
      t.integer :applied_count, null: false, default: 0
      t.integer :analysis_count, null: false, default: 0
      t.integer :cache_hit_count, null: false, default: 0
      t.datetime :last_generated_at
      t.datetime :last_applied_at
      t.datetime :last_analyzed_at
      t.string :seed_user_global_id
      t.string :seed_organization_global_id

      t.timestamps
    end

    add_index :ai_focus_word_sets, :prompt_hash, unique: true
    add_index :ai_focus_word_sets, :locale
    add_index :ai_focus_word_sets, :source
    add_index :ai_focus_word_sets, :status
    add_index :ai_focus_word_sets, :word_count
    add_index :ai_focus_word_sets, :last_applied_at
  end
end
