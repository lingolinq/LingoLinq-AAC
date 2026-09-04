require 'spec_helper'

describe Api::SupervisorRelationshipsController, type: :controller do
  describe "index" do
    it "should require an api token" do
      get :index
      assert_missing_token
    end

    it "should list relationships for the current user" do
      token_user
      u2 = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: @user,
        communicator_user: u2,
        status: 'approved'
      )
      get :index
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['supervisor_relationship'].length).to eq(1)
      expect(json['supervisor_relationship'][0]['id']).to eq(rel.global_id)
    end

    it "should filter by role" do
      token_user
      u2 = User.create
      u3 = User.create
      SupervisorRelationship.create!(
        supervisor_user: @user,
        communicator_user: u2,
        status: 'approved'
      )
      SupervisorRelationship.create!(
        supervisor_user: u3,
        communicator_user: @user,
        status: 'pending'
      )
      get :index, params: { role: 'supervisor' }
      json = JSON.parse(response.body)
      expect(json['supervisor_relationship'].length).to eq(1)
    end

    it "should filter by status" do
      token_user
      u2 = User.create
      u3 = User.create
      SupervisorRelationship.create!(
        supervisor_user: @user,
        communicator_user: u2,
        status: 'approved'
      )
      SupervisorRelationship.create!(
        supervisor_user: @user,
        communicator_user: u3,
        status: 'pending'
      )
      get :index, params: { status: 'approved' }
      json = JSON.parse(response.body)
      expect(json['supervisor_relationship'].length).to eq(1)
    end
  end

  describe "show" do
    it "should require an api token" do
      get :show, params: { id: '1_1' }
      assert_missing_token
    end

    it "should show a relationship if user is a party" do
      token_user
      u2 = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: @user,
        communicator_user: u2,
        status: 'approved'
      )
      get :show, params: { id: rel.global_id }
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['supervisor_relationship']['id']).to eq(rel.global_id)
    end

    it "should not show a relationship if user is not a party" do
      token_user
      u2 = User.create
      u3 = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: u2,
        communicator_user: u3,
        status: 'approved'
      )
      get :show, params: { id: rel.global_id }
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq('Not authorized')
    end
  end

  describe "create" do
    it "should require an api token" do
      post :create
      assert_missing_token
    end

    # The flag was advertised to the client and checked on the supervisor-key
    # ingress, but never here, so a direct POST created a pending relationship and
    # mailed a consent request to a child's guardian with the flow disabled.
    it "should refuse to create when the consent flow is disabled for the user" do
      token_user
      u2 = User.create
      allow(FeatureFlags).to receive(:feature_enabled_for?).and_call_original
      allow(FeatureFlags).to receive(:feature_enabled_for?).with('supervisor_consent_flow', anything).and_return(false)
      expect(SupervisorMailer).to_not receive(:schedule_delivery)

      post :create, params: {
        supervisor_relationship: {
          lookup_key: u2.global_id,
          permission_level: 'view_only'
        }
      }
      assert_unauthorized
      expect(SupervisorRelationship.where(communicator_user_id: u2.id).count).to eq(0)
    end

    it "should create a request and return generic message" do
      token_user
      u2 = User.create
      expect(SupervisorMailer).to receive(:schedule_delivery).with(:consent_request, anything)
      post :create, params: {
        supervisor_relationship: {
          lookup_key: u2.global_id,
          permission_level: 'view_only'
        }
      }
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['meta']['message']).to eq(SupervisorConsentService::GENERIC_LOOKUP_MESSAGE)
    end

    it "should return same message for nonexistent user" do
      token_user
      post :create, params: {
        supervisor_relationship: {
          lookup_key: 'nonexistent@example.com',
          permission_level: 'view_only'
        }
      }
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['meta']['message']).to eq(SupervisorConsentService::GENERIC_LOOKUP_MESSAGE)
    end

    it "should create a request by username" do
      token_user
      u2 = User.create
      expect(SupervisorMailer).to receive(:schedule_delivery).with(:consent_request, anything)
      post :create, params: {
        supervisor_relationship: {
          communicator_lookup: u2.user_name,
          permission_level: 'edit_boards'
        }
      }
      expect(response).to be_successful
      rel = SupervisorRelationship.last
      expect(rel.communicator_user).to eq(u2)
      expect(rel.supervisor_user).to eq(@user)
      expect(rel.status).to eq('pending')
    end

    it "should create a request by email" do
      token_user
      u2 = User.create
      u2.settings['email'] = 'lookup-comm@example.com'
      u2.save
      expect(SupervisorMailer).to receive(:schedule_delivery).with(:consent_request, anything)
      post :create, params: {
        supervisor_relationship: {
          communicator_lookup: 'lookup-comm@example.com',
          permission_level: 'view_only'
        }
      }
      expect(response).to be_successful
      expect(SupervisorRelationship.last.communicator_user).to eq(u2)
    end
  end

  describe "approve" do
    it "should approve with a valid token" do
      u1 = User.create
      u2 = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: u1,
        communicator_user: u2,
        status: 'pending',
        permission_level: 'view_only'
      )
      rel.generate_consent_token!
      expect(SupervisorMailer).to receive(:schedule_delivery).with(:consent_approved, rel.global_id)
      put :approve, params: { id: rel.global_id, consent_response_token: rel.consent_response_token }
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['supervisor_relationship']['status']).to eq('approved')
    end

    it "should audit the authenticated user when approving" do
      token_user
      supervisor = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: supervisor,
        communicator_user: @user,
        status: 'pending',
        permission_level: 'view_only'
      )
      rel.generate_consent_token!
      allow(SupervisorMailer).to receive(:schedule_delivery)

      expect(AuditEvent).to receive(:log_command).with(@user.global_id, hash_including(
        'type' => 'supervisor_consent_response',
        'decision' => 'approve',
        'relationship_id' => rel.global_id,
        'supervisor_id' => supervisor.global_id,
        'communicator_id' => @user.global_id
      )).and_call_original

      put :approve, params: { id: rel.global_id, consent_response_token: rel.consent_response_token }
      expect(response).to be_successful
    end

    it "should audit a REJECTED consent decision" do
      token_user
      supervisor = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: supervisor,
        communicator_user: @user,
        status: 'denied',
        permission_level: 'view_only'
      )

      # A refused attempt is the event a reviewer most needs, and it previously
      # left no trace: AuditEvent.log_command sat in the success branch only.
      # The rejection names its SUBJECT. The service returns only an :error for
      # not_pending (no :relationship), so the controller falls back to the
      # relationship it resolved from the id -- otherwise a wrong-party or
      # already-answered attempt would be logged with nothing a reviewer could act on.
      expect(AuditEvent).to receive(:log_command).with(@user.global_id, hash_including(
        'type' => 'supervisor_consent_response',
        'decision' => 'approve',
        'outcome' => 'rejected',
        'reason' => 'not_pending',
        'relationship_id' => rel.global_id,
        'supervisor_id' => supervisor.global_id,
        'communicator_id' => @user.global_id
      )).and_call_original

      put :approve, params: { id: rel.global_id }
      expect(response).to_not be_successful
      expect(rel.reload.status).to eq('denied')
    end

    it "should audit an EXPIRED-token rejection with the relationship attached" do
      token_user
      supervisor = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: supervisor,
        communicator_user: @user,
        status: 'pending',
        permission_level: 'view_only'
      )
      rel.generate_consent_token!
      token = rel.consent_response_token
      rel.update_column(:consent_token_expires_at, 1.day.ago)

      # A real token that expired is a rejection worth auditing, and it must name
      # its subject. This previously fell through the amplification guard and left
      # no trace, while the PR claimed rejected decisions were audited.
      expect(AuditEvent).to receive(:log_command).with(anything, hash_including(
        'type' => 'supervisor_consent_response',
        'decision' => 'approve',
        'outcome' => 'rejected',
        'reason' => 'invalid_or_expired_token',
        'relationship_id' => rel.global_id,
        'supervisor_id' => supervisor.global_id,
        'communicator_id' => @user.global_id
      )).and_call_original

      put :approve, params: { id: rel.global_id, token: token }
      expect(response).to_not be_successful
      expect(rel.reload.status).to eq('pending')
    end

    it "should NOT write an audit row for an unresolvable consent token" do
      token_user
      supervisor = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: supervisor,
        communicator_user: @user,
        status: 'pending',
        permission_level: 'view_only'
      )
      rel.generate_consent_token!

      # This endpoint is reachable unauthenticated. Writing a row per unresolvable
      # token would let anyone drive unbounded inserts into the audit table by
      # replaying random strings, turning the audit trail into an amplification
      # vector -- and the row would name no subject anyway. Token guessing is a
      # rate-limiting concern, not an audit-trail one.
      expect(AuditEvent).to_not receive(:log_command)

      put :approve, params: { id: rel.global_id, token: 'wrong-consent-token' }
      expect(response).to_not be_successful
      expect(rel.reload.status).to eq('pending')
    end

    it "should audit a rejected decision without ever recording the consent token" do
      token_user
      supervisor = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: supervisor,
        communicator_user: @user,
        status: 'denied',
        permission_level: 'view_only'
      )

      logged = nil
      expect(AuditEvent).to receive(:log_command) { |_actor, data| logged = data }

      put :approve, params: { id: rel.global_id }
      expect(response).to_not be_successful

      expect(logged['outcome']).to eq('rejected')
      expect(logged['relationship_id']).to eq(rel.global_id)
      # The consent token is a credential; it must never reach the audit trail.
      expect(logged.to_json).to_not include(rel.consent_response_token.to_s) if rel.consent_response_token
      expect(logged.keys).to_not include('token')
    end

    it "should let the logged-in communicator approve by relationship id without a token" do
      token_user
      supervisor = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: supervisor,
        communicator_user: @user,
        status: 'pending',
        permission_level: 'edit_boards'
      )
      rel.generate_consent_token!
      allow(SupervisorMailer).to receive(:schedule_delivery)
      put :approve, params: { id: rel.global_id }
      expect(response).to be_successful
      expect(rel.reload.status).to eq('approved')
      expect(@user.reload.supervisor_user_ids).to include(supervisor.global_id)
    end

    it "should not let the supervisor approve their own request by id" do
      token_user
      communicator = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: @user,
        communicator_user: communicator,
        status: 'pending',
        permission_level: 'view_only'
      )
      rel.generate_consent_token!
      put :approve, params: { id: rel.global_id }
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq('not_authorized')
      expect(rel.reload.status).to eq('pending')
    end

    it "should return error for invalid token" do
      put :approve, params: { id: 'bogus', consent_response_token: 'bogus' }
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq('invalid_or_expired_token')
    end
  end

  describe "deny" do
    it "should deny with a valid token" do
      u1 = User.create
      u2 = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: u1,
        communicator_user: u2,
        status: 'pending'
      )
      rel.generate_consent_token!
      put :deny, params: { id: rel.global_id, consent_response_token: rel.consent_response_token }
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['supervisor_relationship']['status']).to eq('denied')
    end

    it "should let the logged-in communicator deny by relationship id without a token" do
      token_user
      supervisor = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: supervisor,
        communicator_user: @user,
        status: 'pending'
      )
      rel.generate_consent_token!
      put :deny, params: { id: rel.global_id }
      expect(response).to be_successful
      expect(rel.reload.status).to eq('denied')
    end

    it "should return error for invalid token" do
      put :deny, params: { id: 'bogus', consent_response_token: 'bogus' }
      expect(response).not_to be_successful
    end
  end

  describe "consent_response" do
    it "should approve via token using decision param (not Rails action)" do
      u1 = User.create
      u2 = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: u1,
        communicator_user: u2,
        status: 'pending',
        permission_level: 'view_only'
      )
      rel.generate_consent_token!
      allow(SupervisorMailer).to receive(:schedule_delivery)
      post :consent_response, params: {
        token: rel.consent_response_token,
        decision: 'approve'
      }
      expect(response).to be_successful
      expect(rel.reload.status).to eq('approved')
    end
  end

  describe "destroy" do
    it "should require an api token" do
      delete :destroy, params: { id: '1_1' }
      assert_missing_token
    end

    it "should revoke an approved relationship" do
      token_user
      u2 = User.create
      User.link_supervisor_to_user(@user, u2)
      rel = SupervisorRelationship.create!(
        supervisor_user: @user,
        communicator_user: u2,
        status: 'approved',
        activated_at: Time.current
      )
      expect(SupervisorMailer).to receive(:schedule_delivery).with(:supervisor_revoked, rel.global_id, 'supervisor')
      delete :destroy, params: { id: rel.global_id, reason: 'no longer needed' }
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['supervisor_relationship']['status']).to eq('revoked')
    end

    it "should not allow non-parties to revoke" do
      token_user
      u2 = User.create
      u3 = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: u2,
        communicator_user: u3,
        status: 'approved'
      )
      delete :destroy, params: { id: rel.global_id }
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq('Not authorized')
    end
  end
end
