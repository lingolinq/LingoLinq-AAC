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

    # Read these BEFORE opening the transaction so the user row can be locked first.
    #
    # The lock order matters and is not arbitrary. Organization#claim_user locks the user row and
    # then writes the license. Doing the reverse here, writing the license inside a transaction
    # and then updating the user, is the inverted acquisition order and risks a deadlock between
    # the two methods, so the user lock is taken first in both.
    #
    # The lock is also what makes the survivor decision below correct. Without it two concurrent
    # releases each read the survivor set before the other commits: releasing A repoints the
    # column to B, while releasing B still sees A as a survivor and therefore writes nothing,
    # leaving managing_organization_id naming an organization that holds no seat and the family
    # without their handback. That state is not exotic to reach: a manager calling
    # Organization#remove_user while the nightly expire_stale_licenses! processes another
    # organization's expired seat is enough. Its consequences are cross-tenant, because
    # TelemetryEvent.organization_id_for and AiWordPredictor#cache_scope both read that column and
    # would attribute the student's telemetry and put their predictions in the shared bucket of an
    # organization with no relationship to them.
    locked_user = self.user

    if locked_user
      locked_user.with_lock { perform_release!(locked_user, self.organization) }
    else
      License.transaction { perform_release!(nil, self.organization) }
    end
    true
  end

  private

  def perform_release!(old_user, old_org)
    # 1. Free up the seat for the district to use on a new student
    AuditEvent.log_command('system', {
      'type' => 'license_release',
      'organization_id' => old_org&.global_id,
      'user_id' => old_user&.global_id,
      'license_id' => self.global_id,
      'reason' => self.status
    })

    self.update!(user_id: nil, granted_at: nil)

    if old_user
      # 2. Hand the account back to the family ONLY if no other organization still holds an
      # active seat for them.
      #
      # A communicator may be supported by more than one organization at the same time, so a
      # second active license is a normal steady state, not an anomaly. This write used to be
      # unconditional, and because License.expire_stale_licenses! releases each expired
      # license independently, one organization's seat expiring would wipe ANOTHER
      # organization's sponsorship and overwrite expires_at with a flat two-month trial while
      # that organization still held and paid for its seat. The student showed as in_trial?,
      # and the column consumers (telemetry_event.rb, the word predictor) lost their
      # attribution, even though a district was still responsible throughout.
      #
      # When another seat remains, the column is REPOINTED at it rather than left alone.
      # Leaving it would point managing_organization_id at the organization whose seat was
      # just released, which is the exact state Organization#claim_user checks for before it
      # writes that column.
      # Read the survivor with an explicit `where.not(id: self.id)` rather than relying on the
      # release above having already nilled our own user_id, so the result does not depend on
      # statement order inside this transaction.
      survivor = License.where(user_id: old_user.id, status: 'active')
                        .where.not(id: self.id)
                        .order(:expires_at)
                        .last
      if survivor
        # Only move the column when it names the organization whose seat is being released.
        # An earlier revision repointed it whenever any survivor existed, which with three
        # organizations took sponsorship away from an uninvolved one: column names C, B's seat
        # is released, and the column was moved to whichever survivor sorted first.
        if old_user.managing_organization_id == old_org&.id
          old_user.update!(
            managing_organization_id: survivor.organization_id,
            expires_at: survivor.expires_at
          )
        end
      else
        # Trigger the User's "Free Trial": puts them back in "their own care", or ready for a
        # new sponsor.
        old_user.update!(
          managing_organization_id: nil,
          expires_at: 2.months.from_now
        )
      end

      # 3. Cleanup existing UserLink (Management Rights)
      UserLink.remove(old_user, old_org, 'org_user')
    end
    true
  end
end
