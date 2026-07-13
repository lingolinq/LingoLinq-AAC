class AddUniqueOpenReviewIndexToAiContentReviews < ActiveRecord::Migration[7.2]
  # Prevent duplicate-review spam: a user may not have two simultaneously OPEN reviews
  # for the same content. Re-flagging after a review is completed/dismissed is still
  # allowed (those rows are excluded from the partial index), so this bounds the human
  # oversight queue without blocking legitimate re-requests.
  def up
    add_index :ai_content_reviews,
              [:user_global_id, :content_type, :content_global_id],
              unique: true,
              where: "status NOT IN ('completed', 'dismissed')",
              name: 'index_ai_content_reviews_unique_open_per_user_content'
  end

  def down
    remove_index :ai_content_reviews,
                 name: 'index_ai_content_reviews_unique_open_per_user_content'
  end
end
