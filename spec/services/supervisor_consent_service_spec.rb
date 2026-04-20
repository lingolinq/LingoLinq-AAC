require 'spec_helper'

describe SupervisorConsentService, :type => :model do
  let(:service) { SupervisorConsentService.new }

  describe "#create_with_supervisor" do
    it "should create a communicator and approved relationship" do
      supervisor = User.create
      result = service.create_with_supervisor(
        supervisor: supervisor,
        communicator_params: {},
        owner_email: 'parent@example.com',
        permission_level: 'edit_boards'
      )
      expect(result[:error]).to be_nil
      expect(result[:communicator]).to be_a(User)
      expect(result[:communicator]).to be_persisted
      rel = result[:relationship]
      expect(rel.status).to eq('approved')
      expect(rel.supervisor_user).to eq(supervisor)
      expect(rel.communicator_user).to eq(result[:communicator])
      expect(rel.supervisor_created_account).to eq(true)
      expect(rel.permission_level).to eq('edit_boards')
      expect(rel.activated_at).to be_present
      expect(rel.metadata['owner_email']).to eq('parent@example.com')
    end

    it "should link supervisor to communicator" do
      supervisor = User.create
      result = service.create_with_supervisor(
        supervisor: supervisor,
        communicator_params: {},
        owner_email: 'parent@example.com'
      )
      communicator = result[:communicator]
      expect(communicator.reload.supervisor_user_ids).to include(supervisor.global_id)
    end

    it "should return error if communicator creation fails" do
      supervisor = User.create
      result = service.create_with_supervisor(
        supervisor: supervisor,
        communicator_params: { 'supervisee_code' => '1_1' },
        owner_email: 'parent@example.com'
      )
      expect(result[:error]).to eq('communicator_creation_failed')
    end
  end

  describe "#request_access" do
    it "should create a pending relationship and generate token" do
      supervisor = User.create
      communicator = User.create
      expect(SupervisorMailer).to receive(:schedule_delivery).with(:consent_request, anything)
      result = service.request_access(
        supervisor: supervisor,
        lookup_key: communicator.global_id,
        permission_level: 'view_only'
      )
      expect(result[:message]).to eq(SupervisorConsentService::GENERIC_LOOKUP_MESSAGE)
      rel = SupervisorRelationship.last
      expect(rel.supervisor_user).to eq(supervisor)
      expect(rel.communicator_user).to eq(communicator)
      expect(rel.status).to eq('pending')
      expect(rel.consent_response_token).to be_present
    end

    it "should find communicator by email" do
      supervisor = User.create
      communicator = User.create
      communicator.settings['email'] = 'comm@example.com'
      communicator.save
      expect(SupervisorMailer).to receive(:schedule_delivery).with(:consent_request, anything)
      result = service.request_access(
        supervisor: supervisor,
        lookup_key: 'comm@example.com'
      )
      expect(result[:message]).to eq(SupervisorConsentService::GENERIC_LOOKUP_MESSAGE)
      rel = SupervisorRelationship.last
      expect(rel.communicator_user).to eq(communicator)
      expect(rel.lookup_method).to eq('email')
    end

    it "should return same message when communicator not found (enumeration protection)" do
      supervisor = User.create
      result = service.request_access(
        supervisor: supervisor,
        lookup_key: 'nonexistent@example.com'
      )
      expect(result[:message]).to eq(SupervisorConsentService::GENERIC_LOOKUP_MESSAGE)
      expect(SupervisorRelationship.count).to eq(0)
    end

    it "should not create duplicate pending relationship" do
      supervisor = User.create
      communicator = User.create
      expect(SupervisorMailer).to receive(:schedule_delivery).with(:consent_request, anything).once
      service.request_access(supervisor: supervisor, lookup_key: communicator.global_id)
      count = SupervisorRelationship.count
      service.request_access(supervisor: supervisor, lookup_key: communicator.global_id)
      expect(SupervisorRelationship.count).to eq(count)
    end

    it "should not allow requesting supervision of self" do
      supervisor = User.create
      result = service.request_access(
        supervisor: supervisor,
        lookup_key: supervisor.global_id
      )
      expect(result[:message]).to eq(SupervisorConsentService::GENERIC_LOOKUP_MESSAGE)
      expect(SupervisorRelationship.count).to eq(0)
    end
  end

  describe "#approve" do
    it "should approve a valid token and link users" do
      supervisor = User.create
      communicator = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: supervisor,
        communicator_user: communicator,
        status: 'pending',
        permission_level: 'edit_boards'
      )
      rel.generate_consent_token!
      expect(SupervisorMailer).to receive(:schedule_delivery).with(:consent_approved, rel.global_id)
      result = service.approve(token: rel.consent_response_token)
      expect(result[:error]).to be_nil
      rel.reload
      expect(rel.status).to eq('approved')
      expect(rel.activated_at).to be_present
      expect(rel.consent_responded_at).to be_present
      expect(communicator.reload.supervisor_user_ids).to include(supervisor.global_id)
    end

    it "should return error for invalid token" do
      result = service.approve(token: 'bogus')
      expect(result[:error]).to eq('invalid_or_expired_token')
    end

    it "should return error for expired token" do
      supervisor = User.create
      communicator = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: supervisor,
        communicator_user: communicator,
        status: 'pending'
      )
      rel.generate_consent_token!
      rel.update_column(:consent_token_expires_at, 1.day.ago)
      result = service.approve(token: rel.consent_response_token)
      expect(result[:error]).to eq('invalid_or_expired_token')
    end
  end

  describe "#deny" do
    it "should deny a valid token" do
      supervisor = User.create
      communicator = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: supervisor,
        communicator_user: communicator,
        status: 'pending'
      )
      rel.generate_consent_token!
      result = service.deny(token: rel.consent_response_token)
      expect(result[:error]).to be_nil
      rel.reload
      expect(rel.status).to eq('denied')
      expect(rel.consent_responded_at).to be_present
    end

    it "should not notify the supervisor (information leak prevention)" do
      supervisor = User.create
      communicator = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: supervisor,
        communicator_user: communicator,
        status: 'pending'
      )
      rel.generate_consent_token!
      expect(SupervisorMailer).not_to receive(:schedule_delivery)
      service.deny(token: rel.consent_response_token)
    end

    it "should return error for invalid token" do
      result = service.deny(token: 'bogus')
      expect(result[:error]).to eq('invalid_or_expired_token')
    end
  end

  describe "#revoke" do
    it "should revoke an approved relationship by supervisor" do
      supervisor = User.create
      communicator = User.create
      User.link_supervisor_to_user(supervisor, communicator)
      rel = SupervisorRelationship.create!(
        supervisor_user: supervisor,
        communicator_user: communicator,
        status: 'approved',
        activated_at: Time.current
      )
      expect(SupervisorMailer).to receive(:schedule_delivery).with(:supervisor_revoked, rel.global_id, 'supervisor')
      result = service.revoke(relationship: rel, revoker: supervisor, reason: 'no longer needed')
      rel.reload
      expect(rel.status).to eq('revoked')
      expect(rel.revoked_at).to be_present
      expect(rel.revoked_by).to eq(supervisor.id)
      expect(rel.revocation_reason).to eq('no longer needed')
    end

    it "should revoke an approved relationship by communicator" do
      supervisor = User.create
      communicator = User.create
      User.link_supervisor_to_user(supervisor, communicator)
      rel = SupervisorRelationship.create!(
        supervisor_user: supervisor,
        communicator_user: communicator,
        status: 'approved',
        activated_at: Time.current
      )
      expect(SupervisorMailer).to receive(:schedule_delivery).with(:supervisor_revoked, rel.global_id, 'communicator')
      result = service.revoke(relationship: rel, revoker: communicator)
      rel.reload
      expect(rel.status).to eq('revoked')
      expect(rel.revoked_by).to eq(communicator.id)
    end

    it "should unlink supervisor from user on revoke" do
      supervisor = User.create
      communicator = User.create
      User.link_supervisor_to_user(supervisor, communicator)
      expect(communicator.reload.supervisor_user_ids).to include(supervisor.global_id)
      rel = SupervisorRelationship.create!(
        supervisor_user: supervisor,
        communicator_user: communicator,
        status: 'approved',
        activated_at: Time.current
      )
      expect(SupervisorMailer).to receive(:schedule_delivery)
      service.revoke(relationship: rel, revoker: supervisor)
      expect(communicator.reload.supervisor_user_ids).to eq([])
    end

    it "should return error if relationship is not active" do
      supervisor = User.create
      communicator = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: supervisor,
        communicator_user: communicator,
        status: 'pending'
      )
      result = service.revoke(relationship: rel, revoker: supervisor)
      expect(result[:error]).to eq('not_active')
    end
  end
end
