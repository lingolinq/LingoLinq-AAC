class License < ApplicationRecord
  include GlobalId
  include SecureSerialize
  belongs_to :organization
  belongs_to :user, optional: true

  # LL-740bcb10fa: metadata is an untyped catch-all that may hold sensitive
  # district/billing data, so it is encrypted at rest via secure_serialize.
  # go_secure permits only one secure_serialize column per model, so the
  # second sensitive field (external_reference) is encrypted manually below.
  secure_serialize :metadata

  # LL-740bcb10fa (follow-up): external_reference is a PO Number / Stripe id.
  # secure_serialize is already taken by :metadata, so this column is encrypted
  # manually with the same GoSecure::SecureJson primitive used for device and
  # user_integration secrets. The reader tolerates legacy plaintext (rescue ->
  # raw) so existing rows keep reading correctly before the backfill runs; the
  # writer encrypts at assignment.
  def external_reference
    raw = read_attribute(:external_reference)
    return raw if raw.blank?
    GoSecure::SecureJson.load(raw)
  rescue StandardError
    raw
  end

  def external_reference=(value)
    if value.blank?
      write_attribute(:external_reference, value)
    else
      write_attribute(:external_reference, GoSecure::SecureJson.dump(value))
    end
  end

  validates :organization_id, presence: true
  validates :seat_type, inclusion: { in: %w[student supervisor] }
  validates :status, inclusion: { in: %w[active suspended expired] }

  scope :active, -> { where(status: 'active') }
  scope :available, -> { where(user_id: nil, status: 'active') }
  scope :expired, -> { where('expires_at < ? AND status = ?', Time.now, 'active') }

  def self.expire_stale_licenses!
    count = 0
    self.expired.find_each do |license|
      old_user = license.user
      old_org = license.organization
      license.update!(status: 'expired')
      if license.user_id
        license.release_user!
        # Automated seat expiry has no manager age attestation. Stamp family
        # COPPA when school_authorization (or birth on file) indicates a minor.
        if old_user
          old_user.reload
          reg = (old_user.settings || {})['registration'] || {}
          compliance = (old_user.settings || {})['compliance'] || {}
          birth_month = reg['offboarding_birth_month'] || compliance['birth_month']
          birth_year = reg['offboarding_birth_year'] || compliance['birth_year']
          school = (old_user.settings || {})['school_authorization']
          force_under_13 = school.is_a?(Hash) && school.present? && birth_month.blank?
          old_user.begin_family_offboarding_consents!(
            org: old_org,
            actor: 'system',
            birth_month: birth_month,
            birth_year: birth_year,
            force_under_13: force_under_13
          )
        end
      end
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
