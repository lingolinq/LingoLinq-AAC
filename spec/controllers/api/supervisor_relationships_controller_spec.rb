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

    it "should return error for invalid token" do
      put :deny, params: { id: 'bogus', consent_response_token: 'bogus' }
      expect(response).not_to be_successful
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
