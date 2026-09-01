require 'spec_helper'

describe 'User org offboarding parental consent', type: :model do
  after(:each) { AuditEvent.delete_all }

  before(:each) do
    allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
  end

  def under13_birth
    t = Time.now.utc
    { month: t.month, year: t.year - 10 }
  end

  def under16_over13_birth
    t = Time.now.utc
    { month: t.month, year: t.year - 14 }
  end

  def adult_birth
    t = Time.now.utc
    { month: t.month, year: t.year - 25 }
  end

  def school_authorized_user!(suffix:)
    u = User.process_new({
      'user_name' => "school_#{suffix}_#{SecureRandom.hex(4)}",
      'email' => "school_#{suffix}_#{SecureRandom.hex(4)}@example.com",
      'password' => 'abcdef',
      'terms_agree' => true
    })
    u.settings['school_authorization'] = {
      'basis' => 'school_official',
      'organization_id' => '1_1',
      'authorized_by' => '1_2',
      'authorized_at' => Time.now.utc.iso8601,
      'record_id' => SecureRandom.uuid
    }
    u.save!
    u
  end

  def eu_under16_with_ai!(suffix:)
    u = User.process_new({
      'user_name' => "eu_off_#{suffix}_#{SecureRandom.hex(4)}",
      'email' => "eu_off_#{suffix}_#{SecureRandom.hex(4)}@example.com",
      'password' => 'abcdef',
      'terms_agree' => true,
      'country' => 'DE',
      'under_16' => true
    })
    u.settings['preferences'] ||= {}
    User::EU_AI_PREF_KEYS.each { |k| u.settings['preferences'][k] = true }
    u.settings['eu_ai_parental_consent'] = {
      'parent_consent_granted_at' => Time.now.utc.iso8601,
      'parent_consent_revoke_token' => GoSecure.nonce('eu_ai_revoke')
    }
    u.save!
    u
  end

  describe '.age_under_threshold?' do
    it 'classifies under-13 from birth month/year' do
      b = under13_birth
      expect(User.age_under_threshold?(birth_month: b[:month], birth_year: b[:year], age: 13)).to eq(true)
      expect(User.age_under_threshold?(birth_month: b[:month], birth_year: b[:year], age: 16)).to eq(true)
    end

    it 'classifies 13-15 as under-16 but not under-13' do
      b = under16_over13_birth
      expect(User.age_under_threshold?(birth_month: b[:month], birth_year: b[:year], age: 13)).to eq(false)
      expect(User.age_under_threshold?(birth_month: b[:month], birth_year: b[:year], age: 16)).to eq(true)
    end
  end

  describe '#requires_coppa_offboarding?' do
    it 'is true when manager attests under-13' do
      u = school_authorized_user!(suffix: 'req')
      expect(u.requires_coppa_offboarding?(attested_under_13: true)).to eq(true)
    end

    it 'is false for school-authorized alone without age attestation' do
      u = school_authorized_user!(suffix: 'schoolonly')
      expect(u.requires_coppa_offboarding?).to eq(false)
    end

    it 'is false when parental consent is already active' do
      u = school_authorized_user!(suffix: 'active')
      u.settings['coppa'] = {
        'parent_consent_granted_at' => Time.now.utc.iso8601
      }
      u.save!
      expect(u.requires_coppa_offboarding?(attested_under_13: true)).to eq(false)
    end

    it 'is false for ordinary adult users' do
      u = User.process_new({
        'user_name' => "adult_#{SecureRandom.hex(4)}",
        'email' => "adult_#{SecureRandom.hex(4)}@example.com",
        'password' => 'abcdef',
        'terms_agree' => true
      })
      expect(u.requires_coppa_offboarding?(attested_under_13: false)).to eq(false)
    end
  end

  describe '#begin_family_offboarding_consents!' do
    it 'stamps pending COPPA with needs_parent_email when under-13 and no parent email' do
      u = school_authorized_user!(suffix: 'need')
      o = Organization.create(settings: {'total_licenses' => 1})
      b = under13_birth
      expect(UserMailer).not_to receive(:schedule_parent_consent_delivery)
      expect(u.begin_family_offboarding_consents!(
        org: o, birth_month: b[:month], birth_year: b[:year]
      )).to eq(true)
      u.reload
      expect(u.coppa_parental_consent_pending?).to eq(true)
      expect(u.coppa_needs_parent_email?).to eq(true)
      expect(u.settings['coppa']['offboarding']).to eq(true)
      expect(u.settings['school_authorization']).to be_nil
      expect(u.settings['school_authorization_ended']).to be_a(Hash)
      expect(u.coppa_parental_consent_blocks_access?).to eq(true)
    end

    it 'sends consent email when parent email is provided for under-13' do
      u = school_authorized_user!(suffix: 'email')
      o = Organization.create(settings: {'total_licenses' => 1})
      b = under13_birth
      expect(UserMailer).to receive(:schedule_parent_consent_delivery).with(:parental_consent_request, u.global_id)
      u.begin_family_offboarding_consents!(
        org: o,
        parent_email: 'parent_off@example.com',
        birth_month: b[:month],
        birth_year: b[:year]
      )
      u.reload
      expect(u.coppa_needs_parent_email?).to eq(false)
      expect(u.settings['coppa']['parent_email']).to eq('parent_off@example.com')
      expect(u.settings['coppa']['parent_consent_token']).to be_present
    end

    it 'turns AI prefs off for under-16 without stamping COPPA' do
      u = school_authorized_user!(suffix: 'u16')
      u.settings['preferences'] ||= {}
      User::EU_AI_PREF_KEYS.each { |k| u.settings['preferences'][k] = true }
      u.save!
      o = Organization.create(settings: {'total_licenses' => 1})
      b = under16_over13_birth
      u.begin_family_offboarding_consents!(org: o, birth_month: b[:month], birth_year: b[:year])
      u.reload
      expect(u.settings['coppa']).to be_nil
      expect(u.settings['registration']['under_16']).to eq(true)
      User::EU_AI_PREF_KEYS.each do |k|
        expect(u.settings['preferences'][k]).to eq(false)
      end
    end

    it 'sets eu_under_16 from EU org jurisdiction even without user country' do
      u = school_authorized_user!(suffix: 'euorg')
      u.settings['preferences'] ||= {}
      User::EU_AI_PREF_KEYS.each { |k| u.settings['preferences'][k] = true }
      u.save!
      o = Organization.create(settings: {'total_licenses' => 1, 'jurisdiction' => 'EU'})
      b = under16_over13_birth
      u.begin_family_offboarding_consents!(org: o, birth_month: b[:month], birth_year: b[:year])
      u.reload
      expect(u.settings['registration']['under_16']).to eq(true)
      expect(u.settings['registration']['eu_under_16']).to eq(true)
      expect(u.settings['registration']['offboarding_org_jurisdiction']).to eq('EU')
      expect(u.eu_under_16?).to eq(true)
      expect(FeatureFlags.eu_under16_blocks_ai_for?(u)).to eq(true)
      User::EU_AI_PREF_KEYS.each { |k| expect(u.settings['preferences'][k]).to eq(false) }
    end

    it 'forces AI off for US org under-16 without setting eu_under_16' do
      u = school_authorized_user!(suffix: 'usorg')
      u.settings['preferences'] ||= {}
      User::EU_AI_PREF_KEYS.each { |k| u.settings['preferences'][k] = true }
      u.save!
      o = Organization.create(settings: {'total_licenses' => 1, 'jurisdiction' => 'US'})
      b = under16_over13_birth
      u.begin_family_offboarding_consents!(org: o, birth_month: b[:month], birth_year: b[:year])
      u.reload
      expect(u.settings['registration']['under_16']).to eq(true)
      expect(u.settings['registration']['eu_under_16']).to eq(false)
      expect(u.eu_under_16?).to eq(false)
      expect(FeatureFlags.eu_under16_blocks_ai_for?(u)).to eq(false)
      User::EU_AI_PREF_KEYS.each { |k| expect(u.settings['preferences'][k]).to eq(false) }
    end

    it 'stamps COPPA for under-13 from both US and EU orgs' do
      b = under13_birth
      %w[US EU].each do |jur|
        u = school_authorized_user!(suffix: "u13_#{jur.downcase}")
        o = Organization.create(settings: {'total_licenses' => 1, 'jurisdiction' => jur})
        u.begin_family_offboarding_consents!(org: o, birth_month: b[:month], birth_year: b[:year])
        u.reload
        expect(u.coppa_parental_consent_pending?).to eq(true)
        expect(u.settings['registration']['offboarding_org_jurisdiction']).to eq(jur)
      end
    end

    it 'resets EU AI prefs and consent for existing eu_under_16 users' do
      u = eu_under16_with_ai!(suffix: 'ai')
      o = Organization.create(settings: {'total_licenses' => 1})
      expect(u.eu_ai_parental_consent_active?).to eq(true)
      u.begin_family_offboarding_consents!(org: o)
      u.reload
      expect(u.eu_ai_parental_consent_active?).to eq(false)
      User::EU_AI_PREF_KEYS.each do |k|
        expect(u.settings['preferences'][k]).to eq(false)
      end
      expect(FeatureFlags.eu_under16_blocks_ai_for?(u)).to eq(true)
      expect(FeatureFlags.ai_feature_enabled_for?('ai_board_generation', u)).to eq(false)
    end

    it 'does not stamp COPPA for adult birth dates' do
      u = school_authorized_user!(suffix: 'adult')
      o = Organization.create(settings: {'total_licenses' => 1})
      b = adult_birth
      u.begin_family_offboarding_consents!(org: o, birth_month: b[:month], birth_year: b[:year])
      u.reload
      expect(u.settings['coppa']).to be_nil
      expect(u.settings['registration']['under_16']).to eq(false)
    end
  end

  describe '#submit_parental_consent_email!' do
    it 'stamps token and schedules mail from needs_parent_email state' do
      u = school_authorized_user!(suffix: 'sub')
      o = Organization.create(settings: {'total_licenses' => 1})
      b = under13_birth
      u.begin_family_offboarding_consents!(org: o, birth_month: b[:month], birth_year: b[:year])
      u.reload
      expect(UserMailer).to receive(:schedule_parent_consent_delivery).with(:parental_consent_request, u.global_id)
      expect(u.submit_parental_consent_email!('guardian_sub@example.com')).to eq(true)
      u.reload
      expect(u.coppa_needs_parent_email?).to eq(false)
      expect(u.coppa_parental_consent_pending?).to eq(true)
      expect(u.settings['coppa']['parent_email']).to eq('guardian_sub@example.com')
    end

    it 'allows revoked users to re-request via parent email' do
      u = User.process_new({
        'user_name' => "rev_#{SecureRandom.hex(4)}",
        'email' => "rev_#{SecureRandom.hex(4)}@example.com",
        'password' => 'abcdef',
        'terms_agree' => true,
        'coppa_under_13' => true,
        'parent_consent_email' => 'old_parent@example.com'
      }, {:pending => true})
      tok = u.settings['coppa']['parent_consent_token']
      expect(u.grant_parental_consent!(tok)).to eq(true)
      u.reload
      revoke_tok = u.settings['coppa']['parent_consent_revoke_token']
      expect(u.revoke_parental_consent!(revoke_tok)).to eq(true)
      u.reload
      expect(u.coppa_needs_parent_email?).to eq(true)
      expect(UserMailer).to receive(:schedule_parent_consent_delivery).with(:parental_consent_request, u.global_id)
      expect(u.submit_parental_consent_email!('new_parent@example.com')).to eq(true)
      u.reload
      expect(u.coppa_parental_consent_pending?).to eq(true)
      expect(u.coppa_parental_consent_revoked?).to eq(false)
      expect(u.settings['coppa']['parent_email']).to eq('new_parent@example.com')
    end

    it 'rejects parent email matching the account email' do
      u = school_authorized_user!(suffix: 'same')
      o = Organization.create(settings: {'total_licenses' => 1})
      b = under13_birth
      u.begin_family_offboarding_consents!(org: o, birth_month: b[:month], birth_year: b[:year])
      expect {
        u.submit_parental_consent_email!(u.settings['email'])
      }.to raise_error(ArgumentError, /different from the account email/)
    end
  end

  describe 'Organization#remove_user offboarding' do
    it 'starts COPPA offboarding when birth month/year is under-13' do
      o = Organization.create(settings: {'total_licenses' => 1})
      u = school_authorized_user!(suffix: 'rm')
      o.add_user(u.user_name, false, true)
      b = under13_birth
      o.remove_user(u.user_name, birth_month: b[:month], birth_year: b[:year])
      u.reload
      expect(u.coppa_parental_consent_pending?).to eq(true)
      expect(u.coppa_needs_parent_email?).to eq(true)
      expect(o.sponsored_user?(u)).to eq(false)
    end

    it 'sends consent email when parent email is passed for under-13' do
      o = Organization.create(settings: {'total_licenses' => 1})
      u = school_authorized_user!(suffix: 'rmmail')
      o.add_user(u.user_name, false, true)
      b = under13_birth
      expect(UserMailer).to receive(:schedule_parent_consent_delivery).with(:parental_consent_request, u.global_id)
      o.remove_user(
        u.user_name,
        parent_email: 'mgr_parent@example.com',
        birth_month: b[:month],
        birth_year: b[:year]
      )
      u.reload
      expect(u.settings['coppa']['parent_email']).to eq('mgr_parent@example.com')
      expect(u.coppa_needs_parent_email?).to eq(false)
    end

    it 'turns AI off for under-16 without COPPA' do
      o = Organization.create(settings: {'total_licenses' => 1})
      u = school_authorized_user!(suffix: 'rm16')
      u.settings['preferences'] ||= {}
      User::EU_AI_PREF_KEYS.each { |k| u.settings['preferences'][k] = true }
      u.save!
      o.add_user(u.user_name, false, true)
      b = under16_over13_birth
      o.remove_user(u.user_name, birth_month: b[:month], birth_year: b[:year])
      u.reload
      expect(u.settings['coppa']).to be_nil
      User::EU_AI_PREF_KEYS.each { |k| expect(u.settings['preferences'][k]).to eq(false) }
    end

    it 'resets EU AI on remove for eu_under_16 communicators' do
      o = Organization.create(settings: {'total_licenses' => 1})
      u = eu_under16_with_ai!(suffix: 'rmeu')
      o.add_user(u.user_name, false, true)
      b = under16_over13_birth
      o.remove_user(u.user_name, birth_month: b[:month], birth_year: b[:year])
      u.reload
      expect(u.eu_ai_parental_consent_active?).to eq(false)
      expect(FeatureFlags.ai_feature_enabled_for?('ai_board_generation', u)).to eq(false)
    end

    it 'does not stamp COPPA for adult birth dates' do
      o = Organization.create(settings: {'total_licenses' => 1})
      u = school_authorized_user!(suffix: 'rmadult')
      o.add_user(u.user_name, false, true)
      b = adult_birth
      o.remove_user(u.user_name, birth_month: b[:month], birth_year: b[:year])
      u.reload
      expect(u.settings['coppa']).to be_nil
    end

    it 'requires birth month/year when COPPA is enabled' do
      o = Organization.create(settings: {'total_licenses' => 1})
      u = school_authorized_user!(suffix: 'nobirth')
      o.add_user(u.user_name, false, true)
      expect {
        o.remove_user(u.user_name)
      }.to raise_error(ArgumentError, /offboarding birth month and year required/)
    end
  end

  describe 'License.expire_stale_licenses! offboarding' do
    it 'stamps COPPA for school-authorized users when a seat expires' do
      o = Organization.create(settings: {'total_licenses' => 1})
      u = school_authorized_user!(suffix: 'licexp')
      lic = License.create!(organization: o, seat_type: 'student', status: 'active', user: u, expires_at: 1.day.ago)
      u.update!(managing_organization_id: o.id)
      expect(UserMailer).not_to receive(:schedule_parent_consent_delivery)
      expect(License.expire_stale_licenses!).to be >= 1
      u.reload
      expect(u.coppa_parental_consent_pending?).to eq(true)
      expect(u.settings['coppa']['offboarding']).to eq(true)
      expect(u.settings['school_authorization']).to be_nil
      expect(lic.reload.user_id).to eq(nil)
      expect(lic.status).to eq('expired')
    end
  end

  describe '#decline_parental_consent! and export-then-delete' do
    it 'declines pending offboarding consent and schedules export-then-delete' do
      u = school_authorized_user!(suffix: 'decl')
      o = Organization.create(settings: {'total_licenses' => 1})
      b = under13_birth
      u.begin_family_offboarding_consents!(
        org: o,
        parent_email: 'decl_parent@example.com',
        birth_month: b[:month],
        birth_year: b[:year]
      )
      u.reload
      tok = u.settings['coppa']['parent_consent_token']
      expect(Exporter).to receive(:export_user).with(u.global_id).and_return({path: 'downloads/users/x/lingolinq-export.zip', url: 'https://example.test/x.zip'})
      expect(UserMailer).to receive(:schedule_parent_consent_delivery).with(:parental_consent_offboarding_export, u.global_id)
      expect(u.decline_parental_consent!(tok)).to eq(true)
      u.reload
      expect(u.settings['coppa']['parent_consent_declined_at']).to be_present
      expect(u.settings['coppa']['offboarding_export_scheduled_at']).to be_present
      expect(u.schedule_deletion_at).to be_present
      expect(u.coppa_parental_consent_pending?).to eq(false)
      expect(u.coppa_parental_consent_declined?).to eq(true)
      expect(u.coppa_parental_consent_blocks_access?).to eq(true)
    end

    it 'signup decline schedules deletion without export' do
      u = User.process_new({
        'name' => 'signup_decl_model',
        'email' => "signup_decl_model_#{SecureRandom.hex(4)}@example.com",
        'password' => 'abcdef',
        'terms_agree' => true,
        'coppa_under_13' => true,
        'parent_consent_email' => 'signup_decl_model_parent@example.com'
      }, {:pending => true})
      tok = u.settings['coppa']['parent_consent_token']
      expect(Exporter).not_to receive(:export_user)
      expect(UserMailer).not_to receive(:schedule_parent_consent_delivery)
      expect(u.decline_parental_consent!(tok)).to eq(true)
      u.reload
      expect(u.settings['coppa']['parent_consent_declined_at']).to be_present
      expect(u.settings['coppa']['offboarding_export_scheduled_at']).to be_blank
      expect(u.schedule_deletion_at).to be_present
    end

    # Deadline-expired offboarding, past due and ready for the sweep.
    def deadline_expired_user!(suffix:)
      u = school_authorized_user!(suffix: suffix)
      o = Organization.create(settings: {'total_licenses' => 1})
      b = under13_birth
      u.begin_family_offboarding_consents!(org: o, birth_month: b[:month], birth_year: b[:year])
      u.reload
      c = u.settings['coppa']
      c['offboarding_deadline_at'] = 1.day.ago.utc.iso8601
      u.settings['coppa'] = c
      u.save!
      u
    end

    it 'process_expired_offboarding_consents! schedules delete after deadline' do
      u = deadline_expired_user!(suffix: 'expdue')
      # This stub used to be `and_return(nil)` while still asserting the deletion
      # WAS scheduled -- i.e. the spec pinned the behaviour where a failed export
      # deletes the child's account anyway. That is the defect; the export now
      # has to succeed for the deletion to be scheduled, so the happy path needs
      # a real path. The failure case is the example below.
      expect(Exporter).to receive(:export_user).with(u.global_id).and_return({path: 'downloads/users/expdue.zip'})
      expect(User.process_expired_offboarding_consents!).to be >= 1
      u.reload
      expect(u.settings['coppa']['offboarding_export_scheduled_at']).to be_present
      expect(u.settings['coppa']['offboarding_export_reason']).to eq('expired')
      expect(u.schedule_deletion_at).to be_present
    end

    it 'process_expired_offboarding_consents! does NOT schedule delete when the export fails' do
      u = deadline_expired_user!(suffix: 'expfail')
      expect(Exporter).to receive(:export_user).with(u.global_id).and_return(nil)
      expect(User.process_expired_offboarding_consents!).to eq(0)
      u.reload
      expect(u.settings['coppa']['offboarding_export_scheduled_at']).to be_blank
      expect(u.schedule_deletion_at).to be_blank
      # Still due, so the next sweep retries rather than losing the account.
      expect(u.coppa_offboarding_export_due?).to eq(true)
    end

    it 'claims under lock so a concurrent schedule_offboarding_export_then_delete! does not re-export' do
      u = school_authorized_user!(suffix: 'race')
      o = Organization.create(settings: {'total_licenses' => 1})
      b = under13_birth
      u.begin_family_offboarding_consents!(
        org: o,
        parent_email: 'race_parent@example.com',
        birth_month: b[:month],
        birth_year: b[:year]
      )
      u.reload
      c = u.settings['coppa']
      c['parent_consent_declined_at'] = Time.now.utc.iso8601
      c.delete('pending_parent_consent')
      u.settings['coppa'] = c
      u.save!

      export_calls = 0
      allow(Exporter).to receive(:export_user) do |gid|
        expect(gid).to eq(u.global_id)
        export_calls += 1
        # Simulate a second caller racing while the first holds the claim mid-export.
        expect(u.reload.settings['coppa']['offboarding_export_started_at']).to be_present
        expect(u.schedule_offboarding_export_then_delete!(reason: 'declined')).to eq(false)
        {path: 'downloads/users/race/lingolinq-export.zip', url: 'https://example.test/race.zip'}
      end
      allow(UserMailer).to receive(:schedule_parent_consent_delivery)

      expect(u.schedule_offboarding_export_then_delete!(reason: 'declined')).to eq(true)
      expect(export_calls).to eq(1)
      u.reload
      expect(u.settings['coppa']['offboarding_export_scheduled_at']).to be_present
      expect(u.settings['coppa']['offboarding_export_started_at']).to be_nil
    end
  end

  describe 'export failure must not schedule deletion' do
    # An offboarding account that is DUE for export-then-delete: parent declined,
    # so coppa_offboarding_export_due? is true without waiting on a deadline.
    def due_offboarding_user!(suffix:)
      u = school_authorized_user!(suffix: suffix)
      o = Organization.create(settings: {'total_licenses' => 1})
      b = under13_birth
      u.begin_family_offboarding_consents!(
        org: o,
        parent_email: "export_#{suffix}@example.com",
        birth_month: b[:month],
        birth_year: b[:year]
      )
      u.reload
      u.settings['coppa']['parent_consent_declined_at'] = Time.now.utc.iso8601
      u.settings['coppa'] = u.settings['coppa']
      u.save!
      u.reload
      u
    end

    it 'does not schedule deletion when the exporter raises' do
      u = due_offboarding_user!(suffix: 'raise')
      expect(Exporter).to receive(:export_user).and_raise(StandardError.new('S3 throttled'))
      expect(UserMailer).not_to receive(:schedule_parent_consent_delivery)
      expect(u.schedule_offboarding_export_then_delete!(reason: 'declined')).to eq(false)
      u.reload
      expect(u.schedule_deletion_at).to be_blank
      expect(u.settings['coppa']['offboarding_export_scheduled_at']).to be_blank
    end

    it 'does not schedule deletion when the exporter returns no path' do
      u = due_offboarding_user!(suffix: 'nopath')
      expect(Exporter).to receive(:export_user).and_return({})
      expect(u.schedule_offboarding_export_then_delete!(reason: 'declined')).to eq(false)
      u.reload
      expect(u.schedule_deletion_at).to be_blank
      expect(u.settings['coppa']['offboarding_export_scheduled_at']).to be_blank
    end

    it 'releases the claim so the next sweep retries' do
      u = due_offboarding_user!(suffix: 'retry')
      expect(Exporter).to receive(:export_user).and_raise(StandardError.new('boom'))
      u.schedule_offboarding_export_then_delete!(reason: 'declined')
      u.reload
      expect(u.settings['coppa']['offboarding_export_started_at']).to be_blank
      expect(u.coppa_offboarding_export_due?).to eq(true)
    end

    it 'records an AuditEvent for the failed export' do
      u = due_offboarding_user!(suffix: 'audit')
      expect(Exporter).to receive(:export_user).and_raise(StandardError.new('S3 throttled'))
      u.schedule_offboarding_export_then_delete!(reason: 'declined')
      ev = AuditEvent.where(event_type: 'parental_consent_offboarding_export_failed', user_key: u.global_id).last
      expect(ev).to be_present
      expect(ev.data['deletion_scheduled']).to eq(false)
      expect(ev.data['reason']).to eq('declined')
      expect(ev.data['error']).to match(/S3 throttled/)
    end

    it 'still schedules deletion when the export succeeds' do
      u = due_offboarding_user!(suffix: 'ok')
      expect(Exporter).to receive(:export_user).and_return({path: 'downloads/users/ok.zip'})
      allow(UserMailer).to receive(:schedule_parent_consent_delivery)
      expect(u.schedule_offboarding_export_then_delete!(reason: 'declined')).to eq(true)
      u.reload
      expect(u.schedule_deletion_at).to be_present
      expect(u.settings['coppa']['offboarding_export_path']).to eq('downloads/users/ok.zip')
    end
  end

  describe 'decline revokes access already granted' do
    it 'clears persisted device keys, not just the Redis cache' do
      u = User.process_new({
        'name' => 'decline_tokens',
        'email' => "decline_tokens_#{SecureRandom.hex(4)}@example.com",
        'password' => 'abcdef',
        'terms_agree' => true,
        'coppa_under_13' => true,
        'parent_consent_email' => 'decline_tokens_parent@example.com'
      }, {:pending => true})
      d = Device.create(user: u, device_key: 'default', developer_key_id: 0)
      d.generate_token!
      d.reload
      expect(d.settings['keys']).not_to be_empty

      tok = u.settings['coppa']['parent_consent_token']
      expect(u.decline_parental_consent!(tok, ip: '1.2.3.4', user_agent: 'spec')).to eq(true)

      d.reload
      expect(d.settings['keys']).to eq([])
      expect(d.valid_token?(d.settings['keys'].first)).to eq(false)
    end
  end
end
