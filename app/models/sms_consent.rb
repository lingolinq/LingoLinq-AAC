class SmsConsent < ApplicationRecord
  belongs_to :user

  STATES = ['granted', 'revoked'].freeze
  DISCLOSURE_VERSION = '2026-09-08.1'

  validates :user, :target_hash, :state, :disclosure_version, presence: true
  validates :state, inclusion: { in: STATES }

  def self.canonical_phone(number)
    RemoteTarget.canonical_target('sms', number.to_s)
  end

  def self.hash_for(communicator, number)
    raise 'missing user' unless communicator
    raise 'missing number' if number.blank?
    salt = ENV['SMS_ENCRYPTION_KEY']
    raise 'missing SMS_ENCRYPTION_KEY' if salt.blank?
    RemoteTarget.salted_hash(canonical_phone(number), salt, 'global')
  end

  def self.granted?(communicator, number)
    return false unless communicator && number.present?
    where(user_id: communicator.id, target_hash: hash_for(communicator, number), state: 'granted').exists?
  end

  def self.grant!(communicator, number, ip:, disclosure_version:)
    persist_state!(communicator, number, 'granted', ip: ip, disclosure_version: disclosure_version)
  end

  def self.revoke!(communicator, number, ip: nil, disclosure_version:)
    persist_state!(communicator, number, 'revoked', ip: ip, disclosure_version: disclosure_version)
  end

  def self.persist_state!(communicator, number, state, ip:, disclosure_version:)
    raise 'missing user' unless communicator
    raise 'missing number' if number.blank?
    raise 'missing disclosure_version' if disclosure_version.blank?

    digest = hash_for(communicator, number)
    record = nil
    communicator.with_lock(requires_new: true) do
      record = find_or_initialize_by(user_id: communicator.id, target_hash: digest)
      record.state = state
      record.disclosure_version = disclosure_version
      record.request_ip = ip
      record.save!
      event_type = "sms_consent_#{state}"
      AuditEvent.create!(
        user_key: communicator.global_id,
        event_type: event_type,
        record_id: record.id.to_s,
        summary: "#{communicator.global_id}: #{event_type}",
        data: {
          'type' => event_type,
          'sms_consent_id' => record.id,
          'target_hash' => digest,
          'disclosure_version' => disclosure_version,
          'request_ip' => ip
        }
      )
    end
    record
  end
end
