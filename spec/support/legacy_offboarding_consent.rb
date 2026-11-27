# Seeds the pending offboarding consent state that User#begin_family_offboarding_consents! wrote
# before #1063, for specs of the code that still reads it (parent email submission, grant,
# decline, export-then-delete, the sweep). Accounts already in that state keep it: the hand-back no
# longer writes it, but nothing unlocks or rewrites existing blobs.
#
# Mirrors the old writes: school_authorization moved to school_authorization_ended, a pending
# settings['coppa'] blob with offboarding: true and a 14-day deadline (with a parent email, the
# consent token too), and the parental_consent_offboarding_started AuditEvent that sweep discovery
# reads (User.each_expired_offboarding_consent_candidate). It sends no mail.
module LegacyOffboardingConsent
  def seed_legacy_offboarding_consent!(user, org: nil, parent_email: nil)
    now = Time.now.utc
    deadline = (now + 14.days).iso8601
    user.settings ||= {}
    school = user.settings['school_authorization']
    if school.is_a?(Hash) && school.present?
      ended = school.dup
      ended['ended_at'] = now.iso8601
      ended['ended_org_id'] = org && org.global_id
      user.settings['school_authorization_ended'] = ended
      user.settings.delete('school_authorization')
    end
    blob = {
      'pending_parent_consent' => true,
      'offboarding' => true,
      'offboarding_started_at' => now.iso8601,
      'offboarding_deadline_at' => deadline
    }
    if parent_email.present?
      blob['parent_email'] = user.process_string(parent_email)
      blob['parent_consent_token'] = GoSecure.nonce('parent_consent')
      blob['parent_consent_expires_at'] = deadline
      blob['needs_parent_email'] = false
    else
      blob['needs_parent_email'] = true
    end
    user.settings['coppa'] = blob
    user.save!
    record_id = SecureRandom.uuid
    AuditEvent.create!(
      user_key: user.global_id,
      data: {
        'type' => 'parental_consent_offboarding_started',
        'organization_id' => org && org.global_id,
        'parent_email_provided' => parent_email.present?,
        'attested_under_13' => true,
        'record_id' => record_id
      },
      event_type: 'parental_consent_offboarding_started',
      record_id: record_id
    )
    user.reload
  end
end

RSpec.configure do |config|
  config.include LegacyOffboardingConsent
end
