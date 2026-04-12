class Feedback < ApplicationRecord
  belongs_to :user, optional: true
  belongs_to :organization, optional: true

  CATEGORIES = %w[bug outage feature_request help billing].freeze
  PRIORITIES = %w[low normal urgent].freeze
  STATUSES   = %w[open in_progress resolved closed].freeze

  validates :category, inclusion: { in: CATEGORIES }
  validates :priority, inclusion: { in: PRIORITIES }
  validates :status,   inclusion: { in: STATUSES }
  validates :description, presence: true, length: { maximum: 5000 }
  validates :email, format: { with: URI::MailTo::EMAIL_REGEXP }, allow_blank: true

  scope :urgent, -> { where(priority: 'urgent') }
end
