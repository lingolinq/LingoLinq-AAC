# frozen_string_literal: true

require 'spec_helper'

# #1123: only adult supporter accounts are sent to HubSpot. The gate is
# User#marketing_trackable?, read at both ExternalTracker entry points.
describe 'HubSpot: only adult supporter accounts are sent (#1123)' do
  restore_env_after_each('IPLOCATE_API_KEY', 'HUBSPOT_ACCESS_TOKEN')

  # A persisted account that passes every condition; each example then breaks exactly one.
  def adult_supporter(type = 'therapist')
    u = User.create
    u.settings['email'] = "#{type.tr('^a-z', '')}_adult@example.com"
    u.settings['preferences'] ||= {}
    u.settings['preferences']['registration_type'] = type
    u.settings['registration'] = { 'under_16' => false, 'eu_under_16' => false, 'adult_at_signup' => true }
    u.save!
    u
  end

  def expect_not_sent(u)
    ENV['HUBSPOT_ACCESS_TOKEN'] = 'hubby'
    expect(Typhoeus).not_to receive(:post)
    ExternalTracker.track_new_user(u)
    expect(Worker.scheduled_actions).to eq([])
    expect(ExternalTracker.persist_new_user(u.global_id)).to eq(false)
  end

  describe 'User#marketing_trackable?' do
    it 'is true for each allowlisted supporter type when every other condition holds' do
      %w[therapist parent teacher other eval manually-added-supervisor communicator].each do |type|
        expect(adult_supporter(type).marketing_trackable?).to eq(true), "expected #{type} to be trackable"
      end
    end

    it 'is false for every account type outside the allowlist, including ones the old blocklist let through' do
      ['student', 'unspecified', 'manually-added-org-user', 'individual', 'THERAPIST', 'made-up', '', nil].each do |type|
        u = adult_supporter
        u.settings['preferences']['registration_type'] = type
        expect(u.marketing_trackable?).to eq(false), "expected #{type.inspect} not to be trackable"
      end
    end

    it 'is false, and does not raise, for a stored account type that is not a string' do
      [['therapist'], { 'a' => 'therapist' }, 7, true].each do |type|
        u = adult_supporter
        u.settings['preferences']['registration_type'] = type
        expect(u.marketing_trackable?).to eq(false)
      end
    end

    it 'is false for any child-consent record, whatever its state' do
      [{ 'pending_parent_consent' => true },
       { 'pending_parent_consent' => true, 'parent_consent_granted_at' => '2026-11-01T00:00:00Z' },
       { 'parent_consent_declined_at' => '2026-11-01T00:00:00Z' },
       { 'parent_consent_revoked_at' => '2026-11-01T00:00:00Z' }].each do |coppa|
        u = adult_supporter
        u.settings['coppa'] = coppa
        expect(u.marketing_trackable?).to eq(false)
      end
    end

    it 'is false for an under-16 registration' do
      u = adult_supporter
      u.settings['registration']['under_16'] = true
      expect(u.marketing_trackable?).to eq(false)
    end

    it 'is false unless the adult-at-signup marker is exactly true (missing, false or a look-alike all fail closed)' do
      [:missing, false, nil, 'true', 1, 'yes'].each do |marker|
        u = adult_supporter
        marker == :missing ? u.settings['registration'].delete('adult_at_signup') : u.settings['registration']['adult_at_signup'] = marker
        expect(u.marketing_trackable?).to eq(false), "expected marker #{marker.inspect} not to be trackable"
      end
      u = adult_supporter
      u.settings.delete('registration')
      expect(u.marketing_trackable?).to eq(false)
    end
  end

  describe 'the adult-at-signup marker' do
    def signup(extra)
      User.process_new({ 'name' => "mk#{SecureRandom.hex(3)}", 'password' => 'abcdefgh', 'terms_agree' => true,
                         'preferences' => { 'registration_type' => 'therapist' } }.merge(extra), { pending: true })
    end

    it 'is true for a signup whose birth month and year make them 18 or over, and the date itself is not kept' do
      u = signup('birth_month' => 1, 'birth_year' => Time.now.utc.year - 30)
      expect(u.settings['registration']['adult_at_signup']).to eq(true)
      expect(u.settings['registration'].keys).not_to include('birth_month', 'birth_year')
      expect(u.settings.keys).not_to include('birth_month', 'birth_year')
    end

    # Born in a year that makes them 17 at most, whatever today's month is, so the
    # example does not sit on the month boundary User.age_under_threshold? computes.
    it 'is false for someone who is 17 at most' do
      expect(signup('birth_month' => 1, 'birth_year' => Time.now.utc.year - 17).settings['registration']['adult_at_signup']).to eq(false)
    end

    it 'does not fall back to the self-declared under-16 flag when there is no birth date' do
      u = signup('under_16' => false)
      expect(u.settings['registration']['under_16']).to eq(false)
      expect(u.settings['registration']['adult_at_signup']).to eq(false)
    end

    it 'is false when no usable birth month and year is given' do
      expect(signup({}).settings['registration']['adult_at_signup']).to eq(false)
      expect(signup('birth_month' => 13, 'birth_year' => 1990).settings['registration']['adult_at_signup']).to eq(false)
    end

    it 'cannot be set by the client, at signup or afterwards' do
      u = signup('birth_month' => 1, 'birth_year' => Time.now.utc.year - 17,
                 'registration' => { 'adult_at_signup' => true }, 'adult_at_signup' => true)
      expect(u.settings['registration']['adult_at_signup']).to eq(false)
      u.process({ 'registration' => { 'adult_at_signup' => true }, 'adult_at_signup' => true,
                  'birth_month' => 1, 'birth_year' => 1980 }, { updater: u })
      expect(u.reload.settings['registration']['adult_at_signup']).to eq(false)
    end
  end

  describe 'ExternalTracker' do
    it 'schedules and sends an adult supporter (control)' do
      u = adult_supporter('parent')
      ENV['HUBSPOT_ACCESS_TOKEN'] = 'hubby'
      ExternalTracker.track_new_user(u)
      expect(Worker.scheduled?(ExternalTracker, :persist_new_user, u.global_id)).to eq(true)
      expect(Typhoeus).to receive(:post).and_return(OpenStruct.new(code: '201'))
      expect(ExternalTracker.persist_new_user(u.global_id)).to eq('201')
    end

    it 'does not send a student, an unknown type or a non-string type' do
      ['student', 'manually-added-org-user', 'made-up', ['therapist']].each do |type|
        u = adult_supporter
        u.settings['preferences']['registration_type'] = type
        u.save!
        expect_not_sent(u)
      end
    end

    it 'does not send a supporter who was under 18 at signup, or whose age was never recorded' do
      minor = adult_supporter
      minor.settings['registration']['adult_at_signup'] = false
      minor.save!
      expect_not_sent(minor)
      unknown = adult_supporter
      unknown.settings['registration'].delete('adult_at_signup')
      unknown.save!
      expect_not_sent(unknown)
    end

    it 'does not send an account with a child-consent record, approved or not' do
      u = adult_supporter('parent')
      u.settings['coppa'] = { 'pending_parent_consent' => true, 'parent_consent_granted_at' => Time.now.utc.iso8601 }
      u.save!
      expect_not_sent(u)
    end

    it 'does not send a child whose parent has just approved an under-13 signup, even with a supporter type' do
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      u = User.process_new({ 'name' => 'hs_child', 'email' => 'hs_child@example.com', 'password' => 'abcdefgh',
                             'terms_agree' => true, 'coppa_under_13' => true, 'parent_consent_email' => 'hs_parent@example.com',
                             'preferences' => { 'registration_type' => 'parent' } }, { pending: true })
      expect(u.grant_parental_consent!(u.settings['coppa']['parent_consent_token'])).to be_truthy
      u.reload
      expect(u.supporter_registration?).to eq(true)
      expect_not_sent(u)
    end
  end

  # Scot, 2026-11-23: adult AAC users who registered themselves get the same HubSpot
  # emails as adult supporters, under the same checks.
  describe 'adult communicator accounts' do
    it 'schedules and sends an adult communicator, as account type "Communicator Account"' do
      u = adult_supporter('communicator')
      expect(u.supporter_registration?).to eq(false)
      ENV['HUBSPOT_ACCESS_TOKEN'] = 'hubby'
      ExternalTracker.track_new_user(u)
      expect(Worker.scheduled?(ExternalTracker, :persist_new_user, u.global_id)).to eq(true)
      sent = nil
      expect(Typhoeus).to receive(:post) { |_url, opts| sent = JSON.parse(opts[:body]); OpenStruct.new(code: '201') }
      expect(ExternalTracker.persist_new_user(u.global_id)).to eq('201')
      expect(sent['properties']).to include({ 'property' => 'account_type', 'value' => 'Communicator Account' })
    end

    it 'does not send a communicator who was under 18 at signup, or whose age was never recorded' do
      minor = adult_supporter('communicator')
      minor.settings['registration']['adult_at_signup'] = false
      minor.save!
      expect_not_sent(minor)
      unknown = adult_supporter('communicator')
      unknown.settings['registration'].delete('adult_at_signup')
      unknown.save!
      expect_not_sent(unknown)
      no_record = adult_supporter('communicator')
      no_record.settings.delete('registration')
      no_record.save!
      expect_not_sent(no_record)
    end

    it 'does not send a communicator with a child-consent record, whatever its state' do
      [{ 'pending_parent_consent' => true },
       { 'pending_parent_consent' => true, 'parent_consent_granted_at' => '2026-11-01T00:00:00Z' },
       { 'parent_consent_declined_at' => '2026-11-01T00:00:00Z' },
       { 'parent_consent_revoked_at' => '2026-11-01T00:00:00Z' }].each do |coppa|
        u = adult_supporter('communicator')
        u.settings['coppa'] = coppa
        u.save!
        expect_not_sent(u)
      end
    end

    it 'does not send a communicator registered as under 16' do
      u = adult_supporter('communicator')
      u.settings['registration']['under_16'] = true
      u.save!
      expect_not_sent(u)
    end

    it 'does not send a communicator whose account an organization manages, or who opted out of cookies' do
      managed = adult_supporter('communicator')
      managed.settings['authored_organization_id'] = 'asdf'
      managed.save!
      expect(managed.external_email_allowed?).to eq(false)
      expect_not_sent(managed)
      opted_out = adult_supporter('communicator')
      opted_out.settings['preferences']['cookies'] = false
      opted_out.save!
      expect_not_sent(opted_out)
    end

    describe 'a real communicator signup' do
      def communicator_signup(extra)
        User.process_new({ 'name' => "cm#{SecureRandom.hex(3)}", 'password' => 'abcdefgh', 'terms_agree' => true,
                           'email' => "cm#{SecureRandom.hex(3)}@example.com",
                           'preferences' => { 'registration_type' => 'communicator' } }.merge(extra), { pending: true })
      end

      it 'records the adult marker by the same rule as a supporter, and is trackable only when 18 or over' do
        adult = communicator_signup('birth_month' => 1, 'birth_year' => Time.now.utc.year - 30)
        expect(adult.settings['registration']['adult_at_signup']).to eq(true)
        expect(adult.marketing_trackable?).to eq(true)
        # Born in a year that makes them 17 at most, whatever today's month is.
        teen = communicator_signup('birth_month' => 1, 'birth_year' => Time.now.utc.year - 17)
        expect(teen.settings['registration']['adult_at_signup']).to eq(false)
        expect(teen.marketing_trackable?).to eq(false)
        undated = communicator_signup({})
        expect(undated.settings['registration']['adult_at_signup']).to eq(false)
        expect(undated.marketing_trackable?).to eq(false)
      end
    end
  end
end
