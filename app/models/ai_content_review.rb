# Tracks user/admin requests for human review of AI-generated content, supporting the
# EU AI Act Article 50 human-oversight surface. Content is referenced by global_id
# (polymorphic) to match the AiApiLog / global_id convention rather than a Rails FK.
#
# NOTE (scope): this is the Art50-P1 data layer + validations only. The user-facing
# request entry point and its AuditEvent are wired in Art50-P4.
class AiContentReview < ApplicationRecord
  STATUSES = %w[pending assigned in_review completed dismissed].freeze
  REVIEW_TYPES = %w[user_request automated compliance].freeze

  validates :user_global_id, presence: true
  validates :content_type, presence: true
  validates :content_global_id, presence: true
  validates :requested_at, presence: true
  validates :status, inclusion: { in: STATUSES }
  validates :review_type, inclusion: { in: REVIEW_TYPES }

  scope :pending, -> { where(status: 'pending') }
  scope :open, -> { where.not(status: %w[completed dismissed]) }
  scope :for_jurisdiction, ->(jurisdiction) { where(jurisdiction: jurisdiction) }
  scope :article_50, -> { where(article_50_triggered: true) }

  # Convenience constructor used by the (future, Art50-P4) request entry point.
  # Accepts a User-like object (responds to global_id) or a raw global_id string.
  def self.request_review(user:, content_type:, content_global_id:, reason: nil,
                          jurisdiction: nil, article_50_triggered: false,
                          review_type: 'user_request')
    create!(
      user_global_id: user.respond_to?(:global_id) ? user.global_id : user.to_s,
      content_type: content_type,
      content_global_id: content_global_id,
      reason: reason,
      jurisdiction: jurisdiction,
      article_50_triggered: article_50_triggered,
      review_type: review_type,
      status: 'pending',
      requested_at: Time.now.utc
    )
  end
end
