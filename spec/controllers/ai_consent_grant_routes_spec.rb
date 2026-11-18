# frozen_string_literal: true

require 'spec_helper'

# The routes that RECORD an AI data-sharing consent (#1136). Design (Scot, 2026-11-17):
# a self-signup account agrees at registration; an existing account agrees with one click;
# an under-13 or EU under-16 account is covered by the parent's approval; a district
# authorizes once for the accounts it manages. Nothing is ever recorded on someone's behalf
# without that person acting.
describe 'AI data-sharing consent: who can record one (#1136)' do
  let(:current_version) { LingoLinq::AiConsentDisclosures::CURRENT_VERSION }

  describe Api::UsersController, type: :controller do
    def adult(extra = {})
      { 'birth_month' => 1, 'birth_year' => Time.now.utc.year - 20, 'terms_agree' => true }.merge(extra)
    end

    describe 'registration' do
      it 'records the consent when a self-signup agrees to the terms' do
        post :create, params: { user: adult('name' => 'reg_consent') }
        expect(response).to be_successful
        u = User.find_by_path(JSON.parse(response.body)['user']['id'])
        c = u.settings['ai_consent']
        expect(c['source']).to eq('registration')
        expect(c['disclosures_version']).to eq(current_version)
        expect(c['granted_by_user_id']).to eq(u.global_id)
        expect(FeatureFlags.ai_consent_blocks_ai_for?(u)).to eq(false)
        expect(AuditEvent.where(event_type: 'ai_consent_grant', user_key: u.global_id).count).to eq(1)
      end

      it 'records nothing when the terms were not agreed' do
        post :create, params: { user: adult('name' => 'reg_noterms', 'terms_agree' => false) }
        expect(response).to be_successful
        u = User.find_by_path(JSON.parse(response.body)['user']['id'])
        expect(u.settings['ai_consent']).to be_blank
      end

      it 'records nothing for an under-13 signup (the parent approval is the route)' do
        allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
        post :create, params: { user: { 'name' => 'reg_child', 'terms_agree' => true, 'birth_month' => Time.now.utc.month,
                                        'birth_year' => Time.now.utc.year, 'email' => 'reg_child@example.com',
                                        'parent_consent_email' => 'reg_parent@example.com' } }
        expect(response).to be_successful
        u = User.find_by_path(JSON.parse(response.body)['user']['id'])
        expect(u.coppa_parental_consent_pending?).to eq(true)
        expect(u.settings['ai_consent']).to be_blank
      end

      it 'records nothing when a signed-in account creates the account, or when a start code is used' do
        token_user
        post :create, params: { user: adult('name' => 'reg_by_other') }
        expect(response).to be_successful
        u = User.find_by_path(JSON.parse(response.body)['user']['id'])
        expect(u.settings['ai_consent']).to be_blank
      end

      it 'does not record a consent when an existing account later re-sends terms_agree on an update' do
        token_user
        put :update, params: { id: @user.global_id, user: { 'terms_agree' => true } }
        expect(response).to be_successful
        expect(@user.reload.settings['ai_consent']).to be_blank
      end
    end

    describe 'POST ai_consent (one click for an existing account)' do
      it 'records the consent for the signed-in account acting on itself' do
        token_user
        post :ai_consent, params: { user_id: @user.global_id }
        json = assert_success_json
        expect(json).to eq({ 'ai_consent_granted' => true, 'disclosures_version' => current_version })
        c = @user.reload.settings['ai_consent']
        expect(c['source']).to eq('in_app')
        expect(c['granted_by_user_id']).to eq(@user.global_id)
        expect(FeatureFlags.ai_consent_blocks_ai_for?(@user)).to eq(false)
      end

      it 'is a 200 on a repeat click and writes no second audit event' do
        token_user
        post :ai_consent, params: { user_id: @user.global_id }
        post :ai_consent, params: { user_id: @user.global_id }
        assert_success_json
        expect(AuditEvent.where(event_type: 'ai_consent_grant', user_key: @user.global_id).count).to eq(1)
      end

      it 'requires a token' do
        u = User.create
        post :ai_consent, params: { user_id: u.global_id }
        assert_missing_token
      end

      it 'refuses a supervisor acting for the account they supervise' do
        token_user
        other = User.create
        User.link_supervisor_to_user(@user, other, nil, true)
        post :ai_consent, params: { user_id: other.global_id }
        expect(response).to have_http_status(403)
        expect(JSON.parse(response.body)['error']).to eq('account_holder_required')
        expect(other.reload.settings['ai_consent']).to be_blank
      end

      it 'refuses under masquerade (an admin acting as the account)' do
        token_user
        admin_org = Organization.create(admin: true, settings: { 'total_licenses' => 1 })
        admin_org.add_manager(@user.user_name, true)
        target = User.create
        request.headers['X-As-User-Id'] = target.global_id
        post :ai_consent, params: { user_id: target.global_id }
        expect(response).to have_http_status(403)
        expect(JSON.parse(response.body)['error']).to eq('account_holder_required')
        expect(target.reload.settings['ai_consent']).to be_blank
      end

      it 'refuses a limited-scope token' do
        token_user(['read_profile'])
        post :ai_consent, params: { user_id: @user.global_id }
        expect(response).not_to be_successful
        expect(@user.reload.settings['ai_consent']).to be_blank
      end

      it 'refuses a valet login' do
        valet_token_user
        post :ai_consent, params: { user_id: @user.global_id }
        expect(response).not_to be_successful
        expect(@user.reload.settings['ai_consent']).to be_blank
      end

      it 'refuses a district-managed account and names the district route' do
        token_user
        org = Organization.create(settings: { 'total_licenses' => 1 })
        org.add_user(@user.user_name, false)
        post :ai_consent, params: { user_id: @user.global_id }
        expect(response).to have_http_status(400)
        expect(JSON.parse(response.body)['error']).to eq('org_authorization_required')
        expect(@user.reload.settings['ai_consent']).to be_blank
      end

      it 'refuses an account on the parent route and names it' do
        token_user
        @user.settings['coppa'] = { 'pending_parent_consent' => true, 'parent_consent_granted_at' => Time.now.utc.iso8601 }
        @user.save!
        post :ai_consent, params: { user_id: @user.global_id }
        expect(response).to have_http_status(400)
        expect(JSON.parse(response.body)['error']).to eq('parental_consent_required')
        expect(@user.reload.settings['ai_consent']).to be_blank
      end

      it 'refuses a school-created account with no age on file, even after it has left its district' do
        token_user
        @user.settings['school_authorization'] = { 'basis' => 'school_official', 'organization_id' => '1_999' }
        @user.save!
        post :ai_consent, params: { user_id: @user.global_id }
        expect(response).to have_http_status(400)
        expect(JSON.parse(response.body)['error']).to eq('parental_consent_required')
        expect(@user.reload.settings['ai_consent']).to be_blank
      end

      it 'lets a school-created account agree for itself when the age on file is 13 or over' do
        token_user
        @user.settings['school_authorization'] = { 'basis' => 'school_official', 'organization_id' => '1_999' }
        @user.settings['compliance'] = { 'birth_month' => 1, 'birth_year' => Time.now.utc.year - 30 }
        @user.save!
        post :ai_consent, params: { user_id: @user.global_id }
        expect(response).to have_http_status(200)
        expect(@user.reload.ai_consent_granted?).to eq(true)
      end
    end

    describe 'what the account is told' do
      it 'reports ai_consent_required and the route to the signed-in account' do
        token_user
        get :show, params: { id: @user.global_id }
        json = assert_success_json['user']
        expect(json['ai_consent_required']).to eq(true)
        expect(json['ai_consent_route']).to eq('self')
        grant_test_ai_consent!(@user)
        get :show, params: { id: @user.global_id }
        expect(assert_success_json['user']['ai_consent_required']).to eq(false)
      end

      it 'names the district route for a managed account and the parent route for a COPPA-record account' do
        token_user
        org = Organization.create(settings: { 'total_licenses' => 1 })
        org.add_user(@user.user_name, false)
        get :show, params: { id: @user.global_id }
        expect(assert_success_json['user']['ai_consent_route']).to eq('organization')
      end
    end
  end

  describe ParentalConsentsController, type: :controller do
    after(:each) { AuditEvent.where(event_type: %w[ai_consent_grant coppa_parental_consent_grant]).delete_all }

    it "records the AI consent with the parent's approval of an under-13 signup" do
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      u = User.process_new({ 'name' => 'minor_ai', 'email' => 'minor_ai@example.com', 'password' => 'abcdefgh',
                             'terms_agree' => true, 'coppa_under_13' => true,
                             'parent_consent_email' => 'guardian_ai@example.com' }, { pending: true })
      expect(u.settings['ai_consent']).to be_blank
      get :complete, params: { user_id: u.global_id, token: u.settings['coppa']['parent_consent_token'] }
      c = u.reload.settings['ai_consent']
      expect(u.coppa_parental_consent_active?).to eq(true)
      expect(c['source']).to eq('email_link')
      expect(c['granted_by']).to eq('parent')
      expect(c['disclosures_version']).to eq(current_version)
      expect(FeatureFlags.ai_consent_blocks_ai_for?(u)).to eq(false)
    end

    it 'records nothing when the link token is wrong' do
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      u = User.process_new({ 'name' => 'minor_ai2', 'email' => 'minor_ai2@example.com', 'password' => 'abcdefgh',
                             'terms_agree' => true, 'coppa_under_13' => true,
                             'parent_consent_email' => 'guardian_ai2@example.com' }, { pending: true })
      get :complete, params: { user_id: u.global_id, token: 'not-the-token' }
      expect(u.reload.settings['ai_consent']).to be_blank
    end

    it 'stamps a new request with the disclosure version its email names' do
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      u = User.process_new({ 'name' => 'minor_ai4', 'email' => 'minor_ai4@example.com', 'password' => 'abcdefgh',
                             'terms_agree' => true, 'coppa_under_13' => true,
                             'parent_consent_email' => 'guardian_ai4@example.com' }, { pending: true })
      expect(u.settings['coppa']['ai_disclosures_version']).to eq(current_version)
    end

    it 'approves the account but records no AI consent for a link sent before the email carried the AI notice' do
      allow(JsonApi::Json).to receive(:coppa_parental_consent_enabled?).and_return(true)
      u = User.process_new({ 'name' => 'minor_ai3', 'email' => 'minor_ai3@example.com', 'password' => 'abcdefgh',
                             'terms_agree' => true, 'coppa_under_13' => true,
                             'parent_consent_email' => 'guardian_ai3@example.com' }, { pending: true })
      # A request made before this change has no record of an AI notice.
      u.settings['coppa'].delete('ai_disclosures_version')
      u.save!
      get :complete, params: { user_id: u.global_id, token: u.settings['coppa']['parent_consent_token'] }
      u.reload
      expect(u.coppa_parental_consent_active?).to eq(true)
      expect(u.settings['ai_consent']).to be_blank
      expect(FeatureFlags.ai_consent_blocks_ai_for?(u)).to eq(true)
    end
  end

  describe EuAiParentalConsentsController, type: :controller do
    after(:each) { AuditEvent.where(event_type: %w[ai_consent_grant eu_ai_parental_consent_grant]).delete_all }

    def eu_request(name)
      u = User.create
      u.settings['email'] = "#{name}@example.com"
      u.save!
      u.request_eu_ai_parental_consent!("guardian_#{name}@example.com", requested_features: { 'ai_features_enabled' => true })
      u
    end

    it "records the AI consent with the parent's approval when the request carried the AI notice" do
      u = eu_request('eu_minor1')
      expect(u.settings['eu_ai_parental_consent']['ai_disclosures_version']).to eq(current_version)
      get :complete, params: { user_id: u.global_id, token: u.settings['eu_ai_parental_consent']['parent_consent_token'] }
      expect(u.reload.settings['ai_consent']['disclosures_version']).to eq(current_version)
    end

    it 'records no AI consent for a link sent before the email carried the AI notice' do
      u = eu_request('eu_minor2')
      u.settings['eu_ai_parental_consent'].delete('ai_disclosures_version')
      u.save!
      get :complete, params: { user_id: u.global_id, token: u.settings['eu_ai_parental_consent']['parent_consent_token'] }
      u.reload
      expect(u.eu_ai_parental_consent_active?).to eq(true)
      expect(u.settings['ai_consent']).to be_blank
    end
  end

  describe Api::OrganizationsController, type: :controller do
    let(:org) { Organization.create(settings: { 'total_licenses' => 2 }) }

    it 'is off until a manager turns it on, and the answer is visible to the manager' do
      token_user
      org.add_manager(@user.user_name, true)
      get :show, params: { id: org.global_id }
      expect(assert_success_json['organization']['ai_authorized']).to eq(false)
    end

    it 'lets a full manager authorize and later withdraw, recording who did it' do
      token_user
      org.add_manager(@user.user_name, true)
      put :update, params: { id: org.global_id, organization: { 'ai_authorized' => true, 'ai_authorized_changed' => true } }
      expect(assert_success_json['organization']['ai_authorized']).to eq(true)
      a = org.reload.settings['ai_authorization']
      expect(a['authorized_by']).to eq(@user.global_id)
      expect(a['disclosures_version']).to eq(current_version)
      put :update, params: { id: org.global_id, organization: { 'ai_authorized' => false, 'ai_authorized_changed' => true } }
      expect(assert_success_json['organization']['ai_authorized']).to eq(false)
      expect(org.reload.settings['ai_authorization']['revoked_by']).to eq(@user.global_id)
    end

    it 'ignores the setting from an assistant manager (edit but not manage)' do
      token_user
      org.add_manager(@user.user_name, false)
      put :update, params: { id: org.global_id, organization: { 'ai_authorized' => true, 'ai_authorized_changed' => true } }
      expect(response).to be_successful
      expect(org.reload.ai_authorized?).to eq(false)
    end

    # A settings page opened before another manager changed the switch sends back the
    # value it loaded with every save. Only a save that says the switch was changed counts.
    it 'does not turn the switch back on from a page that only echoes the value it loaded' do
      token_user
      org.add_manager(@user.user_name, true)
      other = User.create
      org.add_manager(other.user_name, true)
      org.authorize_ai!(authorized_by: @user)
      org.revoke_ai_authorization!(revoked_by: other)
      put :update, params: { id: org.global_id, organization: { 'name' => 'Renamed District', 'ai_authorized' => true } }
      expect(response).to be_successful
      expect(org.reload.ai_authorized?).to eq(false)
      expect(org.settings['name']).to eq('Renamed District')
      put :update, params: { id: org.global_id, organization: { 'ai_authorized' => true, 'ai_authorized_changed' => false } }
      expect(org.reload.ai_authorized?).to eq(false)
    end

    it 'does not turn the switch off from a page that only echoes the value it loaded' do
      token_user
      org.add_manager(@user.user_name, true)
      org.authorize_ai!(authorized_by: @user)
      put :update, params: { id: org.global_id, organization: { 'name' => 'Renamed District', 'ai_authorized' => false } }
      expect(response).to be_successful
      expect(org.reload.ai_authorized?).to eq(true)
      expect(assert_success_json['organization']['ai_authorized_changed']).to eq(false)
    end

    it 'leaves an authorization alone when an update does not mention it' do
      token_user
      org.add_manager(@user.user_name, true)
      org.authorize_ai!(authorized_by: @user)
      put :update, params: { id: org.global_id, organization: { 'name' => 'Renamed District' } }
      expect(response).to be_successful
      expect(org.reload.ai_authorized?).to eq(true)
    end
  end
end
