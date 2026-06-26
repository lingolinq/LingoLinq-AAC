class CreateAiContentReviews < ActiveRecord::Migration[7.2]
  def change
    create_table :ai_content_reviews do |t|
      # Requesting user (global_id string, matching the AiApiLog / global_id convention; NOT a Rails FK)
      t.string :user_global_id, null: false

      # Content under review (polymorphic via global_id)
      t.string :content_type, null: false
      t.string :content_global_id, null: false

      # Request details
      t.text :reason
      t.string :review_type, null: false, default: 'user_request'
      t.string :status, null: false, default: 'pending'

      # Article 50 compliance tracking
      t.string :jurisdiction
      t.boolean :article_50_triggered, null: false, default: false

      # Review workflow
      t.string :reviewer_global_id
      t.text :reviewer_notes
      t.string :action_taken

      t.datetime :requested_at, null: false
      t.datetime :assigned_at
      t.datetime :completed_at

      t.timestamps
    end

    add_index :ai_content_reviews, :user_global_id
    add_index :ai_content_reviews, [:content_type, :content_global_id],
              name: 'index_ai_content_reviews_on_content'
    add_index :ai_content_reviews, :status
    add_index :ai_content_reviews, :jurisdiction
    add_index :ai_content_reviews, :article_50_triggered
    add_index :ai_content_reviews, :requested_at
    add_index :ai_content_reviews, [:reviewer_global_id, :status],
              name: 'index_ai_content_reviews_on_reviewer_and_status'
  end
end
