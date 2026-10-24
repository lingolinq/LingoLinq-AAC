require 'spec_helper'

# #1063: when the last organization supporting a school-authorized under-13 lets go, the account
# passes to the family. The hand-back ends the school authorization and sends the account an
# informational notice. It does not lock the account, does not write settings['coppa'], and does
# not start a consent deadline that ends in deletion.
describe 'School-authorized hand-back to the family (#1063)', type: :model do
  include ActiveSupport::Testing::TimeHelpers

  # BEFORE as well as after: AuditEvent commits outside the RSpec transaction (see
  # user_org_offboarding_consent_spec.rb).
  before(:each) { AuditEvent.delete_all }
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

  def school_authorized_user!(suffix:, ai_on: false)
    u = User.process_new({
      'user_name' => "handoff_#{suffix}_#{SecureRandom.hex(4)}",
      'email' => "handoff_#{suffix}_#{SecureRandom.hex(4)}@example.com",
      'password' => 'abcdefgh',
      'terms_agree' => true
    })
    # '1_0' names no organization (ids start at 1), so the authorizing-organization rule in
    # Organization#sponsors_student? only applies where an example sets it on purpose.
    u.settings['school_authorization'] = {
      'basis' => 'school_official',
      'organization_id' => '1_0',
      'authorized_by' => '1_2',
      'authorized_at' => Time.now.utc.iso8601,
      'record_id' => SecureRandom.uuid
    }
    if ai_on
      u.settings['preferences'] ||= {}
      User::EU_AI_PREF_KEYS.each { |k| u.settings['preferences'][k] = true }
    end
    u.save!
    u
  end

  def licensed_org
    o = Organization.create(settings: {'total_licenses' => 1})
    License.create!(organization: o, seat_type: 'student', status: 'active')
    o
  end

  def handoff_events(u)
    AuditEvent.where(user_key: u.global_id, event_type: 'school_authorization_handoff')
  end

  def handoff_notices(u, org)
    RemoteAction.where(action: 'notify_school_handoff', path: "#{u.global_id}::#{org.global_id}")
  end

  def handed_off?(u)
    u.reload
    u.settings['school_authorization'].nil? && handoff_events(u).count == 1
  end

  describe 'final hand-back on removal' do
    it 'does not block access, keeps settings[coppa] untouched and ends the authorization once' do
      o = licensed_org
      u = school_authorized_user!(suffix: 'final')
      o.claim_user(u)
      b = under13_birth

      o.remove_user(u.user_name, birth_month: b[:month], birth_year: b[:year])

      u.reload
      expect(u.coppa_parental_consent_blocks_access?).to eq(false)
      expect(u.coppa_needs_parent_email?).to eq(false)
      expect(u.settings.key?('coppa')).to eq(false)
      expect(u.settings['school_authorization']).to be_nil
      expect(u.settings['school_authorization_ended']['ended_org_id']).to eq(o.global_id)
      expect(handoff_events(u).count).to eq(1)
      expect(AuditEvent.where(user_key: u.global_id, event_type: 'parental_consent_offboarding_started').count).to eq(0)
      expect(handoff_notices(u, o).count).to eq(1)
    end

    it 'records the age basis on the hand-back event' do
      o = licensed_org
      u = school_authorized_user!(suffix: 'basis')
      o.claim_user(u)
      b = under13_birth

      o.remove_user(u.user_name, birth_month: b[:month], birth_year: b[:year])

      expect(handoff_events(u).first.data['age_basis']).to eq('attested')
    end

    it 'leaves a signup consent blob byte-identical' do
      u = school_authorized_user!(suffix: 'signup_blob')
      signup_blob = {
        'pending_parent_consent' => true,
        'parent_email' => 'parent_signup@example.com',
        'parent_consent_token' => 'tok-signup',
        'parent_consent_expires_at' => 3.days.from_now.utc.iso8601,
        'needs_parent_email' => false
      }
      u.settings['coppa'] = signup_blob.deep_dup
      u.save!
      b = under13_birth

      u.begin_family_offboarding_consents!(org: Organization.create, birth_month: b[:month], birth_year: b[:year])

      expect(u.reload.settings['coppa']).to eq(signup_blob)
    end

    it 'leaves a revoked consent blob byte-identical' do
      u = school_authorized_user!(suffix: 'revoked_blob')
      revoked_blob = {
        'parent_email' => 'parent_revoked@example.com',
        'parent_consent_granted_at' => 10.days.ago.utc.iso8601,
        'parent_consent_revoked_at' => 2.days.ago.utc.iso8601
      }
      u.settings['coppa'] = revoked_blob.deep_dup
      u.save!
      b = under13_birth

      u.begin_family_offboarding_consents!(org: Organization.create, birth_month: b[:month], birth_year: b[:year])

      expect(u.reload.settings['coppa']).to eq(revoked_blob)
    end

    it 'does not change expires_at or the subscription settings' do
      u = school_authorized_user!(suffix: 'billing')
      u.expires_at = 40.days.from_now
      u.settings['subscription'] = {'expiration_source' => 'free_trial', 'seconds_left' => 1234}
      u.save!
      expires_before = u.reload.expires_at
      subscription_before = u.settings['subscription'].deep_dup
      b = under13_birth

      u.begin_family_offboarding_consents!(org: Organization.create, birth_month: b[:month], birth_year: b[:year])

      u.reload
      expect(u.expires_at).to eq(expires_before)
      expect(u.settings['subscription']).to eq(subscription_before)
    end

    it 'records one hand-back and one notice when it runs twice' do
      o = Organization.create
      u = school_authorized_user!(suffix: 'twice')
      b = under13_birth

      u.begin_family_offboarding_consents!(org: o, birth_month: b[:month], birth_year: b[:year])
      u.reload.begin_family_offboarding_consents!(org: o, birth_month: b[:month], birth_year: b[:year])

      expect(handoff_events(u).count).to eq(1)
      expect(handoff_notices(u, o).count).to eq(1)
    end

    it 'sends no notice for a 13-to-15-year-old' do
      o = licensed_org
      u = school_authorized_user!(suffix: 'teen')
      o.claim_user(u)
      b = under16_over13_birth

      o.remove_user(u.user_name, birth_month: b[:month], birth_year: b[:year])

      expect(handoff_notices(u, o).count).to eq(0)
      expect(handoff_events(u).count).to eq(0)
    end

    it 'skips the legacy unassigned mail at send time on the legacy removal path' do
      # The legacy row stays queued, so a build without notify_school_handoff still sends it; the
      # mailer skips it when the hand-back notice for the same organization went out.
      o = Organization.create(settings: {'total_licenses' => 1})
      u = school_authorized_user!(suffix: 'legacy_notice')
      o.add_user(u.user_name, false, true)
      b = under13_birth

      o.remove_user(u.user_name, birth_month: b[:month], birth_year: b[:year])

      expect(handoff_notices(u, o).count).to eq(1)
      expect(RemoteAction.where(action: 'notify_unassigned', path: "#{u.global_id}::#{o.global_id}").count).to eq(1)
      expect(UserMailer.organization_unassigned(u.global_id, o.global_id).to).to be_blank
    end

    it 'keeps the legacy unassigned notice when no hand-back notice is sent' do
      o = Organization.create(settings: {'total_licenses' => 1})
      u = school_authorized_user!(suffix: 'legacy_adult')
      o.add_user(u.user_name, false, true)
      t = Time.now.utc

      o.remove_user(u.user_name, birth_month: t.month, birth_year: t.year - 25)

      expect(RemoteAction.where(action: 'notify_unassigned', path: "#{u.global_id}::#{o.global_id}").count).to eq(1)
      expect(handoff_notices(u, o).count).to eq(0)
      expect(UserMailer.organization_unassigned(u.global_id, o.global_id).to).to eq([u.settings['email']])
    end
  end

  describe 'removal no longer collects a parent email' do
    it 'ignores an offboarding_parent_email equal to the account email' do
      o = licensed_org
      u = school_authorized_user!(suffix: 'same_email')
      o.claim_user(u)
      b = under13_birth
      expect(UserMailer).not_to receive(:schedule_parent_consent_delivery)

      res = o.process({
        'management_action' => "remove_user-#{u.user_name}",
        'offboarding_parent_email' => u.settings['email'],
        'offboarding_birth_month' => b[:month],
        'offboarding_birth_year' => b[:year]
      }, {'updater' => User.create})

      expect(o.processing_errors).to eq([])
      expect(res).to eq(true)
      u.reload
      expect(u.settings.key?('coppa')).to eq(false)
      expect(handoff_events(u).count).to eq(1)
    end
  end

  describe 'AI preferences at hand-back' do
    it 'turns every AI preference off on automatic expiry when no birth date is on file' do
      o = Organization.create(settings: {'total_licenses' => 1})
      u = school_authorized_user!(suffix: 'unknown_age', ai_on: true)
      License.create!(organization: o, seat_type: 'student', status: 'active', user: u, expires_at: 1.day.ago)
      u.update!(managing_organization_id: o.id)

      License.expire_stale_licenses!

      u.reload
      User::EU_AI_PREF_KEYS.each { |k| expect(u.settings['preferences'][k]).to eq(false) }
      FeatureFlags::AI_FEATURES.each do |feature|
        expect(FeatureFlags.user_pref_allows_ai?(feature, u)).to eq(false)
      end
      expect(handoff_events(u).first.data['age_basis']).to eq('unknown_assumed_under_13')
    end

    def expire_seat_with_unknown_age!(jurisdiction, suffix:)
      o = Organization.create(settings: {'total_licenses' => 1, 'jurisdiction' => jurisdiction})
      u = school_authorized_user!(suffix: suffix, ai_on: true)
      License.create!(organization: o, seat_type: 'student', status: 'active', user: u, expires_at: 1.day.ago)
      u.update!(managing_organization_id: o.id)
      License.expire_stale_licenses!
      u.reload
    end

    it 'requires EU parental consent to turn AI back on after an assumed-under-13 expiry at an EU organization' do
      u = expire_seat_with_unknown_age!('EU', suffix: 'eu_unknown_age')

      expect(handoff_events(u).first.data['age_basis']).to eq('unknown_assumed_under_13')
      expect(u.eu_under_16?).to eq(true)
      expect(FeatureFlags.eu_under16_blocks_ai_for?(u)).to eq(true)
    end

    it 'falls back to the registration country when the organization has no jurisdiction' do
      o = Organization.create(settings: {'total_licenses' => 1})
      u = school_authorized_user!(suffix: 'eu_country_fallback', ai_on: true)
      u.settings['country'] = 'FR'
      u.save!
      License.create!(organization: o, seat_type: 'student', status: 'active', user: u, expires_at: 1.day.ago)
      u.update!(managing_organization_id: o.id)

      License.expire_stale_licenses!

      u.reload
      expect(o.jurisdiction).to be_nil
      expect(handoff_events(u).first.data['age_basis']).to eq('unknown_assumed_under_13')
      expect(u.eu_under_16?).to eq(true)
    end

    it 'does not set the EU flag after an assumed-under-13 expiry at a US organization' do
      u = expire_seat_with_unknown_age!('US', suffix: 'us_unknown_age')

      expect(handoff_events(u).first.data['age_basis']).to eq('unknown_assumed_under_13')
      expect(u.eu_under_16?).to eq(false)
      User::EU_AI_PREF_KEYS.each { |k| expect(u.settings['preferences'][k]).to eq(false) }
    end
  end

  describe 'AI after hand-back stays off until a parent consents' do
    def hand_back!(jurisdiction, suffix:)
      o = Organization.create(settings: {'total_licenses' => 1, 'jurisdiction' => jurisdiction})
      License.create!(organization: o, seat_type: 'student', status: 'active')
      u = school_authorized_user!(suffix: suffix, ai_on: true)
      o.claim_user(u)
      b = under13_birth
      o.remove_user(u.user_name, birth_month: b[:month], birth_year: b[:year])
      u.reload
      expect(handed_off?(u)).to eq(true)
      u
    end

    # The family's own "Allow AI features" save, through the same writer the preferences page uses.
    def turn_ai_on!(u)
      u.process({'preferences' => User::EU_AI_PREF_KEYS.map { |k| [k, true] }.to_h})
      u.reload
    end

    it 'keeps AI off for a handed-back US under-13 whose family turns AI back on' do
      u = turn_ai_on!(hand_back!('US', suffix: 'us_ai_on'))

      expect(FeatureFlags.user_pref_allows_ai?('ai_word_prediction', u)).to eq(true)
      expect(FeatureFlags.feature_enabled_for?('ai_word_prediction', u)).to eq(true)
      expect(FeatureFlags.coppa_blocks_ai_for?(u)).to eq(true)
      expect(FeatureFlags.ai_feature_enabled_for?('ai_word_prediction', u)).to eq(false)
    end

    it 'keeps AI off after an assumed-under-13 expiry at a US organization once the family turns AI on' do
      o = Organization.create(settings: {'total_licenses' => 1, 'jurisdiction' => 'US'})
      u = school_authorized_user!(suffix: 'us_assumed_ai_on', ai_on: true)
      License.create!(organization: o, seat_type: 'student', status: 'active', user: u, expires_at: 1.day.ago)
      u.update!(managing_organization_id: o.id)
      License.expire_stale_licenses!
      u = turn_ai_on!(u.reload)

      expect(handoff_events(u).first.data['age_basis']).to eq('unknown_assumed_under_13')
      expect(FeatureFlags.user_pref_allows_ai?('ai_word_prediction', u)).to eq(true)
      expect(FeatureFlags.ai_feature_enabled_for?('ai_word_prediction', u)).to eq(false)
    end

    it 'allows AI for the same US account once a parent has consented' do
      u = hand_back!('US', suffix: 'us_consented')
      u.settings['coppa'] = {'parent_consent_granted_at' => Time.now.utc.iso8601}
      u.save!
      u = turn_ai_on!(u)

      expect(FeatureFlags.coppa_blocks_ai_for?(u)).to eq(false)
      expect(FeatureFlags.ai_feature_enabled_for?('ai_word_prediction', u)).to eq(true)
    end

    it 'allows AI for a handed-back EU under-13 once a parent has given the EU AI consent' do
      u = hand_back!('EU', suffix: 'eu_consented')
      u.settings['eu_ai_parental_consent'] = {'parent_consent_granted_at' => Time.now.utc.iso8601}
      u.save!
      u = turn_ai_on!(u)

      expect(FeatureFlags.eu_under16_blocks_ai_for?(u)).to eq(false)
      expect(FeatureFlags.coppa_blocks_ai_for?(u)).to eq(false)
      expect(FeatureFlags.ai_feature_enabled_for?('ai_word_prediction', u)).to eq(true)
    end
  end

  describe 'which organizations still count as supporting the student' do
    def remove_from(org, u)
      b = under13_birth
      org.remove_user(u.user_name, birth_month: b[:month], birth_year: b[:year])
    end

    it 'hands back when the only other seat belongs to an organization the family removed' do
      departing = licensed_org
      removed = licensed_org
      u = school_authorized_user!(suffix: 'orphan_seat')
      removed.claim_user(u)
      orphan = License.where(organization_id: removed.id, user_id: u.id).first
      u.reload.update_subscription_organization("r#{removed.global_id}")
      expect(removed.managed_user?(u.reload)).to eq(false)
      expect(orphan.reload.user_id).to eq(u.id)
      departing.claim_user(u.reload)

      remove_from(departing, u)

      expect(handed_off?(u)).to eq(true)
    end

    it 'does not hand back while another organization sponsors through a legacy link alone' do
      departing = licensed_org
      legacy = Organization.create(settings: {'total_licenses' => 1})
      u = school_authorized_user!(suffix: 'legacy_only')
      legacy.add_user(u.user_name, false, true)
      expect(legacy.sponsored_user?(u.reload)).to eq(true)
      departing.claim_user(u.reload)
      authorization_before = u.reload.settings['school_authorization']

      remove_from(departing, u)

      u.reload
      expect(u.settings['school_authorization']).to eq(authorization_before)
      expect(u.settings.key?('coppa')).to eq(false)
      expect(handoff_events(u).count).to eq(0)
    end

    it 'does not hand back while another organization holds a seat and an accepted sponsored link' do
      departing = licensed_org
      other = licensed_org
      u = school_authorized_user!(suffix: 'licensed_other')
      other.claim_user(u)
      departing.claim_user(u.reload)
      authorization_before = u.reload.settings['school_authorization']

      remove_from(departing, u)

      u.reload
      expect(u.settings['school_authorization']).to eq(authorization_before)
      expect(handoff_events(u).count).to eq(0)
    end

    {
      'pending sponsored' => ->(org, u) { org.add_user(u.user_name, true, true) },
      'unsponsored' => ->(org, u) { org.add_user(u.user_name, false, false) },
      'eval' => ->(org, u) { org.add_user(u.user_name, false, true, true) }
    }.each do |label, link_other|
      it "hands back when the other organization's link is #{label}" do
        departing = licensed_org
        other = Organization.create(settings: {'total_licenses' => 1, 'total_eval_licenses' => 1})
        u = school_authorized_user!(suffix: "other_#{label.gsub(/\W/, '_')}")
        link_other.call(other, u)
        departing.claim_user(u.reload)

        remove_from(departing, u)

        expect(handed_off?(u)).to eq(true)
      end
    end

    def authorized_by!(org, suffix:)
      u = school_authorized_user!(suffix: suffix)
      u.settings['school_authorization']['organization_id'] = org.global_id
      u.save!
      u
    end

    it 'does not hand back while the authorizing organization is still attached, sponsored or not' do
      authorizing = Organization.create(settings: {'total_licenses' => 1})
      departing = licensed_org
      u = authorized_by!(authorizing, suffix: 'authorizer_stays')
      authorizing.add_user(u.user_name, false, false)
      departing.claim_user(u.reload)
      authorization_before = u.reload.settings['school_authorization']

      remove_from(departing, u)

      u.reload
      expect(u.settings['school_authorization']).to eq(authorization_before)
      expect(handoff_events(u).count).to eq(0)
      expect(handoff_notices(u, departing).count).to eq(0)
    end

    it "hands back when the authorizing organization's link is still pending" do
      authorizing = Organization.create(settings: {'total_licenses' => 1})
      departing = licensed_org
      u = authorized_by!(authorizing, suffix: 'authorizer_pending')
      authorizing.add_user(u.user_name, true, false)
      departing.claim_user(u.reload)

      remove_from(departing, u)

      expect(handed_off?(u)).to eq(true)
    end

    it "counts the departing organization's own remaining seat when one seat expires" do
      o = licensed_org
      u = school_authorized_user!(suffix: 'same_org')
      o.claim_user(u)
      first_seat = License.where(organization_id: o.id, user_id: u.id).first
      License.create!(organization: o, seat_type: 'student', status: 'active', user: u.reload, expires_at: 1.year.from_now)
      first_seat.update_columns(expires_at: 1.day.ago)
      authorization_before = u.reload.settings['school_authorization']

      License.expire_stale_licenses!

      u.reload
      expect(first_seat.reload.user_id).to be_nil
      expect(u.settings['school_authorization']).to eq(authorization_before)
      expect(handoff_events(u).count).to eq(0)
    end
  end

  describe 'a claim that completes after the caller checked but before the lock' do
    it 'is seen by the check under the user lock once the claim has finished' do
      departing = Organization.create
      claiming = licensed_org
      u = school_authorized_user!(suffix: 'race')
      authorization_before = u.settings['school_authorization']
      claimed = false
      allow(u).to receive(:with_lock).and_wrap_original do |orig, *args, &blk|
        unless claimed
          claimed = true
          claiming.claim_user(User.find(u.id))
        end
        orig.call(*args, &blk)
      end
      b = under13_birth

      u.begin_family_offboarding_consents!(org: departing, birth_month: b[:month], birth_year: b[:year],
                                           skip_if_supported_elsewhere: true)

      u.reload
      expect(claimed).to eq(true)
      expect(u.settings['school_authorization']).to eq(authorization_before)
      expect(handoff_events(u).count).to eq(0)
      expect(handoff_notices(u, departing).count).to eq(0)
    end
  end

  describe 'detaching an organization that never sponsored the student' do
    it 'needs no birth date and changes nothing on the account' do
      o = Organization.create(settings: {'total_licenses' => 1})
      u = school_authorized_user!(suffix: 'never_sponsored', ai_on: true)
      o.add_user(u.user_name, false, false)
      authorization_before = u.reload.settings['school_authorization']

      expect { o.remove_user(u.user_name) }.not_to raise_error

      u.reload
      expect(o.managed_user?(u)).to eq(false)
      expect(u.settings['school_authorization']).to eq(authorization_before)
      User::EU_AI_PREF_KEYS.each { |k| expect(u.settings['preferences'][k]).to eq(true) }
      expect(handoff_events(u).count).to eq(0)
    end

    it 'keeps the family AI settings even when an under-16 birth date is given' do
      o = Organization.create(settings: {'total_licenses' => 1})
      u = school_authorized_user!(suffix: 'never_sponsored16', ai_on: true)
      o.add_user(u.user_name, false, false)
      b = under16_over13_birth

      o.remove_user(u.user_name, birth_month: b[:month], birth_year: b[:year])

      u.reload
      User::EU_AI_PREF_KEYS.each { |k| expect(u.settings['preferences'][k]).to eq(true) }
      expect(AuditEvent.where(user_key: u.global_id, event_type: 'eu_ai_parental_consent_offboarding_reset').count).to eq(0)
    end

    it 'does not store a birth date that cannot be classified' do
      # The sponsoring path rejects such a date (Organization#remove_user); a non-sponsoring
      # removal must not store one either, or a later expiry elsewhere reads it as an age on file
      # and skips the assumed-under-13 hand-back.
      other = licensed_org
      nonsponsor = Organization.create(settings: {'total_licenses' => 1})
      u = school_authorized_user!(suffix: 'bad_birth')
      other.claim_user(u)
      nonsponsor.add_user(u.user_name, false, false)

      nonsponsor.remove_user(u.user_name, birth_month: 13, birth_year: Time.now.utc.year - 10)

      expect((u.reload.settings['registration'] || {})['offboarding_birth_month']).to be_nil
      License.where(organization_id: other.id, user_id: u.id).update_all(expires_at: 1.day.ago)
      License.expire_stale_licenses!
      expect(handed_off?(u)).to eq(true)
      expect(handoff_events(u).first.data['age_basis']).to eq('unknown_assumed_under_13')
    end

    it 'keeps the birth date the manager entered, for a later seat expiry elsewhere' do
      o = Organization.create(settings: {'total_licenses' => 1})
      u = school_authorized_user!(suffix: 'never_sponsored_birth')
      o.add_user(u.user_name, false, false)
      b = under16_over13_birth

      o.remove_user(u.user_name, birth_month: b[:month], birth_year: b[:year])

      u.reload
      expect(u.settings['registration']['offboarding_birth_month']).to eq(b[:month])
      expect(u.settings['registration']['offboarding_birth_year']).to eq(b[:year])
      expect(u.settings['school_authorization']).to be_present
    end
  end

  describe 'the organization that authorized the account' do
    # An organization can create its own under-13 (school_authorization.organization_id is that
    # organization, user.rb process_params) and attach them unsponsored. Its leaving still ends
    # the authorization and tells the family.
    def authorized_by!(org, suffix:)
      u = school_authorized_user!(suffix: suffix)
      u.settings['school_authorization']['organization_id'] = org.global_id
      u.save!
      u
    end

    it 'hands back when it removes an unsponsored student it authorized' do
      o = Organization.create(settings: {'total_licenses' => 1})
      u = authorized_by!(o, suffix: 'authoring_unsponsored')
      o.add_user(u.user_name, false, false)
      b = under13_birth

      o.remove_user(u.user_name, birth_month: b[:month], birth_year: b[:year])

      expect(handed_off?(u)).to eq(true)
      expect(u.settings['school_authorization_ended']['ended_org_id']).to eq(o.global_id)
      expect(handoff_notices(u, o).count).to eq(1)
    end

    it 'still needs the birth date for that removal' do
      o = Organization.create(settings: {'total_licenses' => 1})
      u = authorized_by!(o, suffix: 'authoring_nobirth')
      o.add_user(u.user_name, false, false)

      expect { o.remove_user(u.user_name) }.to raise_error(ArgumentError, /offboarding birth month and year required/)
    end
  end

  describe 'removal edge cases' do
    it 'records one hand-back when the same removal is sent twice' do
      o = licensed_org
      u = school_authorized_user!(suffix: 'double_remove')
      o.claim_user(u)
      b = under13_birth

      o.remove_user(u.user_name, birth_month: b[:month], birth_year: b[:year])
      o.remove_user(u.user_name, birth_month: b[:month], birth_year: b[:year])

      expect(handoff_events(u).count).to eq(1)
      expect(handoff_notices(u, o).count).to eq(1)
    end

    it 'can be retried after the hand-back fails' do
      # The hand-back runs before the detach, so a failure leaves the student attached and a
      # retry still finds the sponsor (Organization#remove_user).
      o = licensed_org
      u = school_authorized_user!(suffix: 'retry')
      o.claim_user(u)
      b = under13_birth
      calls = 0
      allow(RemoteAction).to receive(:create!).and_wrap_original do |orig, *args, **kwargs|
        calls += 1
        raise ActiveRecord::StatementInvalid, 'simulated write failure' if calls == 1
        orig.call(*args, **kwargs)
      end

      expect {
        o.remove_user(u.user_name, birth_month: b[:month], birth_year: b[:year])
      }.to raise_error(ActiveRecord::StatementInvalid)
      expect(u.reload.settings['school_authorization']).to be_present
      expect(o.managed_user?(u)).to eq(true)

      o.remove_user(u.user_name, birth_month: b[:month], birth_year: b[:year])

      expect(handed_off?(u)).to eq(true)
      expect(handoff_notices(u, o).count).to eq(1)
      expect(o.managed_user?(u.reload)).to eq(false)
    end

    it 'does not store an unclassifiable birth date from a sponsoring removal while another sponsor remains' do
      # With parental consent off, Organization#remove_user does not check the date, and the
      # re-check after the detach records it through begin_family_offboarding_consents!.
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(false)
      leaving = licensed_org
      staying = licensed_org
      u = school_authorized_user!(suffix: 'bad_birth_recheck')
      leaving.claim_user(u)
      staying.claim_user(u.reload)

      leaving.remove_user(u.user_name, birth_month: 13, birth_year: Time.now.utc.year - 10)

      expect((u.reload.settings['registration'] || {})['offboarding_birth_month']).to be_nil
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      License.where(organization_id: staying.id, user_id: u.id).update_all(expires_at: 1.day.ago)
      License.expire_stale_licenses!
      expect(handed_off?(u)).to eq(true)
      expect(handoff_events(u).first.data['age_basis']).to eq('unknown_assumed_under_13')
    end

    it 'does not store an unclassifiable birth date from the last sponsor' do
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(false)
      o = licensed_org
      u = school_authorized_user!(suffix: 'bad_birth_last')
      o.claim_user(u)

      o.remove_user(u.user_name, birth_month: 13, birth_year: Time.now.utc.year - 10)

      expect((u.reload.settings['registration'] || {})['offboarding_birth_month']).to be_nil
    end

    it 'hands back when two organizations remove the student at the same time' do
      # Both removals check for another sponsor before either detaches, so each sees the other.
      # Modelled by running the second removal inside the first, just before the first releases
      # its seat (the first has already checked and seen the second still sponsoring).
      morning = licensed_org
      afternoon = licensed_org
      u = school_authorized_user!(suffix: 'concurrent')
      morning.claim_user(u)
      afternoon.claim_user(u.reload)
      b = under13_birth
      morning_seat = License.where(organization_id: morning.id, user_id: u.id).first
      interleaved = false
      allow_any_instance_of(License).to receive(:release_user!).and_wrap_original do |orig, *args|
        if !interleaved && orig.receiver.id == morning_seat.id
          interleaved = true
          afternoon.remove_user(u.user_name, birth_month: b[:month], birth_year: b[:year])
        end
        orig.call(*args)
      end

      morning.remove_user(u.user_name, birth_month: b[:month], birth_year: b[:year])

      expect(interleaved).to eq(true)
      expect(handed_off?(u)).to eq(true)
      expect(handoff_events(u).count).to eq(1)
    end

    it 'completes on retry when the seat release fails after the hand-back' do
      o = licensed_org
      u = school_authorized_user!(suffix: 'release_fails')
      o.claim_user(u)
      b = under13_birth
      failed = false
      allow_any_instance_of(License).to receive(:release_user!).and_wrap_original do |orig, *args|
        unless failed
          failed = true
          raise ActiveRecord::StatementInvalid, 'simulated release failure'
        end
        orig.call(*args)
      end

      expect {
        o.remove_user(u.user_name, birth_month: b[:month], birth_year: b[:year])
      }.to raise_error(ActiveRecord::StatementInvalid)
      o.remove_user(u.user_name, birth_month: b[:month], birth_year: b[:year])

      expect(handed_off?(u)).to eq(true)
      expect(handoff_notices(u, o).count).to eq(1)
      expect(o.managed_user?(u.reload)).to eq(false)
    end

    it 'sends the legacy unassigned mail for a later, separate removal by the same organization' do
      o = Organization.create(settings: {'total_licenses' => 1})
      u = school_authorized_user!(suffix: 'reattach')
      o.add_user(u.user_name, false, true)
      b = under13_birth
      o.remove_user(u.user_name, birth_month: b[:month], birth_year: b[:year])
      expect(UserMailer.organization_unassigned(u.global_id, o.global_id).to).to be_blank

      o.add_user(u.user_name, false, true)
      o.remove_user(u.user_name, birth_month: b[:month], birth_year: b[:year])

      expect(UserMailer.organization_unassigned(u.global_id, o.global_id).to).to eq([u.reload.settings['email']])
      expect(handoff_events(u).count).to eq(1)
    end

    it "hands back when another organization's link outlived its expired seat" do
      # expire_stale_licenses! commits status 'expired' before release_user!; a release that
      # fails there leaves the seat named and the link in place.
      departing = licensed_org
      stuck = licensed_org
      u = school_authorized_user!(suffix: 'stuck_link')
      stuck.claim_user(u)
      License.where(organization_id: stuck.id, user_id: u.id).update_all(status: 'expired')
      expect(stuck.sponsored_user?(u.reload)).to eq(true)
      departing.claim_user(u.reload)

      b = under13_birth
      departing.remove_user(u.user_name, birth_month: b[:month], birth_year: b[:year])

      expect(handed_off?(u)).to eq(true)
    end

    it "leaves other organizations' queued notices alone" do
      o = licensed_org
      other = Organization.create
      u = school_authorized_user!(suffix: 'other_rows')
      other_row = RemoteAction.create!(action: 'notify_unassigned', path: "#{u.global_id}::#{other.global_id}", act_at: 12.hours.from_now)
      o.claim_user(u)
      b = under13_birth

      o.remove_user(u.user_name, birth_month: b[:month], birth_year: b[:year])

      expect(handed_off?(u)).to eq(true)
      expect(RemoteAction.where(id: other_row.id).count).to eq(1)
      expect(RemoteAction.where(action: 'notify_school_handoff', path: "#{u.global_id}::#{other.global_id}").count).to eq(0)
    end
  end

  describe 'consent expiry no longer deletes' do
    it 'never makes a hand-back a deletion candidate' do
      o = Organization.create
      u = school_authorized_user!(suffix: 'no_candidate')
      b = under13_birth
      u.begin_family_offboarding_consents!(org: o, birth_month: b[:month], birth_year: b[:year])

      travel_to(20.days.from_now) do
        expect(u.reload.coppa_offboarding_export_due?).to eq(false)
        expect(User.each_expired_offboarding_consent_candidate.map(&:global_id)).not_to include(u.global_id)
      end
    end

    it 'does not treat a legacy pending offboarding blob past its deadline as due' do
      u = school_authorized_user!(suffix: 'legacy_pending')
      u.settings['coppa'] = {
        'pending_parent_consent' => true,
        'offboarding' => true,
        'offboarding_started_at' => 20.days.ago.utc.iso8601,
        'offboarding_deadline_at' => 6.days.ago.utc.iso8601,
        'needs_parent_email' => true
      }
      u.save!

      expect(u.reload.coppa_offboarding_export_due?).to eq(false)
    end

    it 'still treats a legacy offboarding decline as due' do
      u = school_authorized_user!(suffix: 'legacy_declined')
      u.settings['coppa'] = {
        'offboarding' => true,
        'offboarding_started_at' => 20.days.ago.utc.iso8601,
        'parent_email' => 'parent_legacy@example.com',
        'parent_consent_token' => 'tok-legacy',
        'parent_consent_declined_at' => 1.day.ago.utc.iso8601
      }
      u.save!

      expect(u.reload.coppa_offboarding_export_due?).to eq(true)
    end
  end

  describe 'delivery' do
    it 'turns a queued notice row into one mail job' do
      o = Organization.create
      u = school_authorized_user!(suffix: 'dispatch')
      ra = RemoteAction.create!(action: 'notify_school_handoff', path: "#{u.global_id}::#{o.global_id}", act_at: Time.now)
      expect(UserMailer).to receive(:schedule_delivery).with(:school_handoff_notice, u.global_id, o.global_id)

      expect(ra.process_action).not_to eq(:keep)
    end

    it 'still hands back when the account has no email address' do
      o = Organization.create
      u = school_authorized_user!(suffix: 'no_email')
      u.settings['email'] = nil
      u.save!
      b = under13_birth

      u.begin_family_offboarding_consents!(org: o, birth_month: b[:month], birth_year: b[:year])

      u.reload
      expect(u.coppa_parental_consent_blocks_access?).to eq(false)
      expect(u.schedule_deletion_at).to be_nil
      expect(handoff_events(u).count).to eq(1)
    end
  end
end
