class SmsConsentInvite < ApplicationRecord
  belongs_to :user

  EXPIRY = 7.days

  def self.issue!(communicator)
    raise 'missing user' unless communicator
    raise 'sms_recipient_consent disabled' unless FeatureFlags.sms_recipient_consent_enabled?(communicator)
    create!(
      user: communicator,
      token: GoSecure.nonce('sms_consent_invite'),
      expires_at: EXPIRY.from_now
    )
  end

  def self.find_valid(token)
    return nil if token.blank?
    invite = find_by(token: token)
    return nil unless invite && invite.user && invite.expires_at > Time.now
    return nil unless FeatureFlags.sms_recipient_consent_enabled?(invite.user)
    invite
  end

  def communicator_name
    name = user && user.settings && user.settings['name']
    name = name.to_s.strip
    name.present? ? name : user.user_name
  end
end
