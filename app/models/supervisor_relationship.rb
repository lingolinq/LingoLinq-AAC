class SupervisorRelationship < ApplicationRecord
  include Async
  include GlobalId
  include SecureSerialize

  belongs_to :supervisor_user, class_name: 'User'
  belongs_to :communicator_user, class_name: 'User'
  belongs_to :organization, optional: true

  secure_serialize :metadata

  STATUSES = %w[pending approved denied revoked expired].freeze
  PERMISSION_LEVELS = %w[view_only edit_boards manage_devices full].freeze
  PERMISSION_DESCRIPTIONS = {
    'view_only' => 'Can view boards and activity logs',
    'edit_boards' => 'Can view and edit communication boards',
    'manage_devices' => 'Can view, edit boards, and manage devices',
    'full' => 'Full access including supervision settings'
  }.freeze

  validates :status, inclusion: { in: STATUSES }
  validates :permission_level, inclusion: { in: PERMISSION_LEVELS }
  validates :supervisor_user_id, presence: true
  validates :communicator_user_id, presence: true

  before_save :generate_defaults

  scope :active, -> { where(status: 'approved') }
  scope :pending, -> { where(status: 'pending') }
  scope :approved, -> { where(status: 'approved') }
  scope :expired_pending, -> {
    where(status: 'pending')
      .where('consent_token_expires_at < ?', Time.current)
  }

  def generate_defaults
    self.metadata ||= {}
  end

  def generate_consent_token!
    self.consent_response_token = GoSecure.nonce('supervisor_consent_token')
    self.consent_token_expires_at = 14.days.from_now
    self.consent_requested_at = Time.current
    save!
  end

  def token_valid?
    consent_response_token.present? &&
      consent_token_expires_at.present? &&
      consent_token_expires_at > Time.current &&
      status == 'pending'
  end

  def user_link_type
    case permission_level
    when 'view_only'
      'read_only'
    else
      'edit'
    end
  end

  def self.expire_stale_requests!
    expired_pending.find_each do |rel|
      rel.update!(status: 'expired')
    end
  end
end
