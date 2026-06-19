class License < ApplicationRecord
  include GlobalId
  include SecureSerialize
  belongs_to :organization
  belongs_to :user, optional: true

  # LL-740bcb10fa: metadata is an untyped catch-all that may hold sensitive
  # district/billing data, so it is encrypted at rest. go_secure permits only
  # one secure column per model; external_reference (a PO/Stripe id) stays
  # plaintext and is excluded from the DB-browser API in schema_explorer.rb.
  secure_serialize :metadata

  validates :organization_id, presence: true
  validates :seat_type, inclusion: { in: %w[student supervisor] }
  validates :status, inclusion: { in: %w[active suspended expired] }

  scope :active, -> { where(status: 'active') }
  scope :available, -> { where(user_id: nil, status: 'active') }
  scope :expired, -> { where('expires_at < ? AND status = ?', Time.now, 'active') }

  def self.expire_stale_licenses!
    count = 0
    self.expired.find_each do |license|
      license.update!(status: 'expired')
      license.release_user! if license.user_id
      count += 1
    end
    count
  end

  def release_user!
    return unless user_id

    License.transaction do
      # 1. Free up the seat for the district to use on a new student
      old_user = self.user
      old_org = self.organization

      AuditEvent.log_command('system', {
        'type' => 'license_release',
        'organization_id' => old_org&.global_id,
        'user_id' => old_user&.global_id,
        'license_id' => self.global_id,
        'reason' => self.status
      })

      self.update!(user_id: nil, granted_at: nil)

      if old_user
        # 2. Trigger the User's "Free Trial"
        # This puts them back in "their own care" or ready for a new sponsor
        old_user.update!(
          managing_organization_id: nil,
          expires_at: 2.months.from_now
        )
        
        # 3. Cleanup existing UserLink (Management Rights)
        UserLink.remove(old_user, old_org, 'org_user')
      end
    end
    true
  end
end
