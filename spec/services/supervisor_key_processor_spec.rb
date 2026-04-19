require 'spec_helper'

describe SupervisorKeyProcessor, :type => :model do
  describe "#call" do
    it "should return false for nil key" do
      u = User.create
      expect(SupervisorKeyProcessor.new(u, nil).call).to eq(false)
    end

    it "should return false for empty string key" do
      u = User.create
      expect(SupervisorKeyProcessor.new(u, '').call).to eq(false)
    end

    it "should return false for non-string key" do
      u = User.create
      expect(SupervisorKeyProcessor.new(u, 123).call).to eq(false)
    end

    it "should return false for unrecognized action" do
      u = User.create
      expect(SupervisorKeyProcessor.new(u, 'bogus-key').call).to eq(false)
    end
  end

  describe "process_add" do
    it "should add a supervisor by global_id" do
      u = User.create
      u2 = User.create
      result = SupervisorKeyProcessor.new(u2, "add-#{u.global_id}").call
      expect(result).to eq(true)
      expect(u2.reload.supervisor_user_ids).to include(u.global_id)
    end

    it "should add an edit supervisor" do
      u = User.create
      u2 = User.create
      result = SupervisorKeyProcessor.new(u2, "add_edit-#{u.global_id}").call
      expect(result).to eq(true)
      expect(u.reload.edit_permission_for?(u2)).to eq(true)
    end

    it "should add a modeling-only supervisor" do
      u = User.create
      u2 = User.create
      result = SupervisorKeyProcessor.new(u2, "add_modeling-#{u.global_id}").call
      expect(result).to eq(true)
      expect(u.reload.modeling_only_for?(u2)).to eq(true)
    end

    it "should return false if user is not premium" do
      u = User.create
      u.expires_at = 2.years.ago
      u.save
      u2 = User.create
      result = SupervisorKeyProcessor.new(u, "add-#{u2.global_id}").call
      expect(result).to eq(false)
    end

    it "should return false if supervisor not found" do
      u = User.create
      result = SupervisorKeyProcessor.new(u, "add-0_9999").call
      expect(result).to eq(false)
    end

    it "should return false if adding self as supervisor" do
      u = User.create
      result = SupervisorKeyProcessor.new(u, "add-#{u.global_id}").call
      expect(result).to eq(false)
    end
  end

  describe "process_approve_org" do
    it "should approve a pending org" do
      u = User.create
      o = Organization.create(:settings => {'total_licenses' => 1})
      o.add_user(u.user_name, true)
      expect(o.reload.pending_user?(u.reload)).to eq(true)
      result = SupervisorKeyProcessor.new(u.reload, "approve-org").call
      expect(result).to eq(true)
      expect(o.reload.pending_user?(u.reload)).to eq(false)
    end
  end

  describe "process_approve_supervision" do
    it "should approve a pending supervision" do
      u = User.create
      o = Organization.create(:settings => {'total_licenses' => 1})
      o.add_supervisor(u.user_name, true)
      u.reload
      expect(o.reload.pending_supervisor?(u)).to eq(true)
      result = SupervisorKeyProcessor.new(u, "approve_supervision-#{o.global_id}").call
      expect(result).to eq(true)
      expect(o.reload.pending_supervisor?(u.reload)).to eq(false)
    end

    it "should return true if already approved" do
      u = User.create
      o = Organization.create(:settings => {'total_licenses' => 1})
      o.add_supervisor(u.user_name, false)
      expect(o.reload.supervisor?(u.reload)).to eq(true)
      result = SupervisorKeyProcessor.new(u.reload, "approve_supervision-#{o.global_id}").call
      expect(result).to eq(true)
    end
  end

  describe "process_remove_supervision" do
    it "should remove supervision from org" do
      u = User.create
      o = Organization.create(:settings => {'total_licenses' => 1})
      o.add_supervisor(u.user_name, false)
      expect(o.reload.supervisor?(u.reload)).to eq(true)
      result = SupervisorKeyProcessor.new(u.reload, "remove_supervision-#{o.global_id}").call
      expect(result).to eq(true)
      expect(o.reload.supervisor?(u)).to eq(false)
    end
  end

  describe "process_remove_supervisor" do
    it "should remove a supervisor" do
      u = User.create
      u2 = User.create
      User.link_supervisor_to_user(u2, u)
      expect(u.reload.supervisor_user_ids).to include(u2.global_id)
      result = SupervisorKeyProcessor.new(u, "remove_supervisor-#{u2.global_id}").call
      expect(result).to eq(true)
      expect(u.reload.supervisor_user_ids).to eq([])
    end

    it "should return false for invalid supervisor" do
      u = User.create
      result = SupervisorKeyProcessor.new(u, "remove_supervisor-0_1").call
      expect(result).to eq(false)
    end
  end

  describe "process_remove_supervisee" do
    it "should remove a supervisee" do
      u = User.create
      u2 = User.create
      User.link_supervisor_to_user(u2, u)
      expect(u2.reload.supervised_user_ids).to include(u.global_id)
      result = SupervisorKeyProcessor.new(u2, "remove_supervisee-#{u.global_id}").call
      expect(u2.reload.supervised_user_ids).to eq([])
    end

    it "should return false for invalid supervisee" do
      u = User.create
      result = SupervisorKeyProcessor.new(u, "remove_supervisee-0_1").call
      expect(result).to eq(false)
    end
  end

  describe "process_start" do
    it "should process a start code" do
      u = User.create
      expect(Organization).to receive(:parse_activation_code).with('asdf', u).and_return({:progress => 'done'})
      result = SupervisorKeyProcessor.new(u, "start-asdf").call
      expect(result).to eq(true)
    end

    it "should return false for disabled start code" do
      u = User.create
      expect(Organization).to receive(:parse_activation_code).with('asdf', u).and_return({:disabled => true})
      result = SupervisorKeyProcessor.new(u, "start-asdf").call
      expect(result).to eq(false)
    end
  end

  describe "process_request_supervision" do
    it "should create a pending SupervisorRelationship when feature is enabled" do
      u = User.create
      u2 = User.create
      u.settings['feature_flags'] = {'supervisor_consent_flow' => true}
      u.save
      result = SupervisorKeyProcessor.new(u, "request_supervision-#{u2.global_id}").call
      expect(result).to eq(true)
      rel = SupervisorRelationship.last
      expect(rel.supervisor_user).to eq(u)
      expect(rel.communicator_user).to eq(u2)
      expect(rel.status).to eq('pending')
      expect(rel.initiated_by).to eq('supervisor')
      expect(rel.consent_response_token).to be_present
    end

    it "should return false when feature is not enabled" do
      u = User.create
      u2 = User.create
      result = SupervisorKeyProcessor.new(u, "request_supervision-#{u2.global_id}").call
      expect(result).to eq(false)
    end

    it "should return false when requesting supervision of self" do
      u = User.create
      u.settings['feature_flags'] = {'supervisor_consent_flow' => true}
      u.save
      result = SupervisorKeyProcessor.new(u, "request_supervision-#{u.global_id}").call
      expect(result).to eq(false)
    end

    it "should return true without creating duplicate if already pending" do
      u = User.create
      u2 = User.create
      u.settings['feature_flags'] = {'supervisor_consent_flow' => true}
      u.save
      SupervisorKeyProcessor.new(u, "request_supervision-#{u2.global_id}").call
      count = SupervisorRelationship.count
      result = SupervisorKeyProcessor.new(u, "request_supervision-#{u2.global_id}").call
      expect(result).to eq(true)
      expect(SupervisorRelationship.count).to eq(count)
    end
  end

  describe "process_approve_consent" do
    it "should approve a valid consent token" do
      u = User.create
      u2 = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: u,
        communicator_user: u2,
        status: 'pending'
      )
      rel.generate_consent_token!
      token = rel.consent_response_token
      result = SupervisorKeyProcessor.new(u2, "approve_consent-#{token}").call
      expect(result).to eq(true)
      rel.reload
      expect(rel.status).to eq('approved')
      expect(rel.consent_responded_at).to be_present
      expect(rel.activated_at).to be_present
    end

    it "should return false for invalid token" do
      u = User.create
      result = SupervisorKeyProcessor.new(u, "approve_consent-bogustoken").call
      expect(result).to eq(false)
    end

    it "should return false for expired token" do
      u = User.create
      u2 = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: u,
        communicator_user: u2,
        status: 'pending'
      )
      rel.generate_consent_token!
      rel.update_column(:consent_token_expires_at, 1.day.ago)
      token = rel.consent_response_token
      result = SupervisorKeyProcessor.new(u2, "approve_consent-#{token}").call
      expect(result).to eq(false)
    end

    it "should nullify consent token after approval" do
      u = User.create
      u2 = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: u,
        communicator_user: u2,
        status: 'pending'
      )
      rel.generate_consent_token!
      token = rel.consent_response_token
      SupervisorKeyProcessor.new(u2, "approve_consent-#{token}").call
      rel.reload
      expect(rel.consent_response_token).to be_nil
    end

    it "should prevent supervisor from approving their own request" do
      u = User.create
      u2 = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: u,
        communicator_user: u2,
        status: 'pending'
      )
      rel.generate_consent_token!
      token = rel.consent_response_token
      result = SupervisorKeyProcessor.new(u, "approve_consent-#{token}").call
      expect(result).to eq(false)
      rel.reload
      expect(rel.status).to eq('pending')
    end

    it "should prevent unrelated user from approving" do
      u = User.create
      u2 = User.create
      u3 = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: u,
        communicator_user: u2,
        status: 'pending'
      )
      rel.generate_consent_token!
      token = rel.consent_response_token
      result = SupervisorKeyProcessor.new(u3, "approve_consent-#{token}").call
      expect(result).to eq(false)
    end

    it "should create a UserLink on approval" do
      u = User.create
      u2 = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: u,
        communicator_user: u2,
        status: 'pending',
        permission_level: 'edit_boards'
      )
      rel.generate_consent_token!
      token = rel.consent_response_token
      SupervisorKeyProcessor.new(u2, "approve_consent-#{token}").call
      expect(u2.reload.supervisor_user_ids).to include(u.global_id)
    end
  end

  describe "process_deny_consent" do
    it "should deny a valid consent token" do
      u = User.create
      u2 = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: u,
        communicator_user: u2,
        status: 'pending'
      )
      rel.generate_consent_token!
      token = rel.consent_response_token
      result = SupervisorKeyProcessor.new(u2, "deny_consent-#{token}").call
      expect(result).to eq(true)
      rel.reload
      expect(rel.status).to eq('denied')
      expect(rel.consent_responded_at).to be_present
    end

    it "should nullify consent token after denial" do
      u = User.create
      u2 = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: u,
        communicator_user: u2,
        status: 'pending'
      )
      rel.generate_consent_token!
      token = rel.consent_response_token
      SupervisorKeyProcessor.new(u2, "deny_consent-#{token}").call
      rel.reload
      expect(rel.consent_response_token).to be_nil
    end

    it "should prevent supervisor from denying their own request" do
      u = User.create
      u2 = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: u,
        communicator_user: u2,
        status: 'pending'
      )
      rel.generate_consent_token!
      token = rel.consent_response_token
      result = SupervisorKeyProcessor.new(u, "deny_consent-#{token}").call
      expect(result).to eq(false)
      rel.reload
      expect(rel.status).to eq('pending')
    end

    it "should return false for invalid token" do
      u = User.create
      result = SupervisorKeyProcessor.new(u, "deny_consent-bogustoken").call
      expect(result).to eq(false)
    end
  end
end
