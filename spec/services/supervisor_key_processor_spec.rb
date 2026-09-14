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
      # supervisor_consent_flow is TEMPORARY in ENABLED_FRONTEND_FEATURES; stub off
      # so this still covers the FeatureFlags gate in process_request_supervision.
      allow(FeatureFlags).to receive(:feature_enabled_for?).and_call_original
      allow(FeatureFlags).to receive(:feature_enabled_for?).with('supervisor_consent_flow', u).and_return(false)
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

  # Self-dealing gate: an actor may not perform an ORG-ATTACHING supervisor_key
  # action for ANOTHER user into an organization that actor manages.
  #
  # Driven through User#process with an 'updater' rather than through
  # SupervisorKeyProcessor.new directly, because that is the real request path
  # (Api::UsersController#update sets `options['updater'] = @api_user` before
  # `user.process(user_data, options)`, and User#process_params then calls
  # `self.process_supervisor_key`, where `self` is the TARGET). Written this way
  # these fail because the escalation SUCCEEDS, not because a method signature
  # does not exist yet, and they stay valid however the actor is threaded.
  #
  # Why an actor can submit a key for someone else at all: users_controller#update
  # slices to `supervisor_key` for an actor holding 'manage_supervision', and an
  # actor holding 'edit' falls through to the else branch with the full payload.
  # link_supervisor_to_user(..., 'edit') below produces the latter.
  describe "self-dealing gate on third-party org attachment" do
    after(:each) do
      # `data` is secure_serialize'd, so it cannot be matched in SQL; `summary` is
      # plaintext and generate_summary derives it from data['type']. Scoped to this
      # block because AuditEvent rows commit outside the RSpec transaction.
      AuditEvent.where("summary LIKE ?", '%supervisor_key%').delete_all
    end

    # actor supervises target with edit permission, which is what lets a third
    # party submit a supervisor_key against the target at all.
    def supervised_pair
      actor = User.create
      target = User.create
      User.link_supervisor_to_user(actor, target, nil, 'edit')
      [actor.reload, target.reload]
    end

    def org_managed_by(actor)
      org = Organization.create(:settings => {'total_licenses' => 5})
      org.add_manager(actor.user_name, true)
      org.reload
    end

    # --- guard cases: must be RED until the gate exists ---

    it "should refuse approve-org when the actor manages the pending org" do
      actor, target = supervised_pair
      org = org_managed_by(actor)
      org.add_user(target.user_name, true)
      expect(org.reload.pending_user?(target.reload)).to eq(true)

      target.process({'supervisor_key' => 'approve-org'}, {'updater' => actor})

      # still pending => never ratified on the target's behalf
      expect(org.reload.pending_user?(target.reload)).to eq(true)
      # and therefore the actor never gained support_actions over the target
      expect(Organization.manager_for?(actor.reload, target.reload)).to eq(false)
    end

    it "should refuse a start code for an organization the actor manages" do
      actor, target = supervised_pair
      org = org_managed_by(actor)
      code = Organization.activation_code(org, {'proposed_code' => 'selfdealcode'})

      target.process({'supervisor_key' => "start-#{code}"}, {'updater' => actor})

      expect(org.reload.managed_user?(target.reload)).to eq(false)
      expect(Organization.manager_for?(actor.reload, target.reload)).to eq(false)
    end

    # Found by the re-sweep for this defect class: approve_supervision ratifies an
    # org_supervisor link, and Organization.manager_for? counts NON-PENDING
    # org_supervisor links as well as org_user ones, so it reaches the same
    # support_actions grant by a different route.
    it "should refuse approve_supervision when the actor manages the org" do
      actor, target = supervised_pair
      org = org_managed_by(actor)
      org.add_supervisor(target.user_name, true)
      target.reload
      expect(org.reload.pending_supervisor?(target)).to eq(true)

      target.process({'supervisor_key' => "approve_supervision-#{org.global_id}"}, {'updater' => actor})

      expect(org.reload.pending_supervisor?(target.reload)).to eq(true)
      expect(Organization.manager_for?(actor.reload, target.reload)).to eq(false)
    end

    it "should still allow a user to approve_supervision on their own account" do
      target = User.create
      org = Organization.create(:settings => {'total_licenses' => 5})
      org.add_supervisor(target.user_name, true)
      target.reload
      expect(org.reload.pending_supervisor?(target)).to eq(true)

      target.process({'supervisor_key' => "approve_supervision-#{org.global_id}"}, {'updater' => target})

      expect(org.reload.pending_supervisor?(target.reload)).to eq(false)
    end

    it "should log an AuditEvent when a self-dealing key is refused" do
      actor, target = supervised_pair
      org = org_managed_by(actor)
      org.add_user(target.user_name, true)

      target.process({'supervisor_key' => 'approve-org'}, {'updater' => actor})

      event = AuditEvent.where("summary LIKE ?", '%supervisor_key_denied%').last
      expect(event).to_not eq(nil)
      expect(event.data['user_id']).to eq(target.global_id)
      expect(event.data['actor_id']).to eq(actor.global_id)
      expect(event.data['organization_id']).to eq(org.global_id)
    end

    # --- regression guards: must be GREEN both before and after the fix ---
    # These are what make the suite meaningful. A gate that refused everything
    # would satisfy the three cases above while destroying the product.

    it "should still allow a user to approve-org on their own account" do
      target = User.create
      org = Organization.create(:settings => {'total_licenses' => 5})
      org.add_user(target.user_name, true)
      expect(org.reload.pending_user?(target.reload)).to eq(true)

      target.process({'supervisor_key' => 'approve-org'}, {'updater' => target})

      expect(org.reload.pending_user?(target.reload)).to eq(false)
    end

    # The parent/guardian onboarding path: acting FOR a communicator into an org
    # the actor does not manage is legitimate and core to AAC. It must survive.
    it "should still allow a third party to redeem a code for an org they do not manage" do
      actor, target = supervised_pair
      school = Organization.create(:settings => {'total_licenses' => 5})
      code = Organization.activation_code(school, {'proposed_code' => 'schoolcode1'})

      target.process({'supervisor_key' => "start-#{code}"}, {'updater' => actor})

      expect(school.reload.managed_user?(target.reload)).to eq(true)
    end

    it "should still allow a third-party removal action" do
      actor, target = supervised_pair
      other = User.create
      User.link_supervisor_to_user(other, target, nil, 'edit')
      expect(target.reload.supervisor_user_ids).to include(other.global_id)

      target.process({'supervisor_key' => "remove_supervisor-#{other.global_id}"}, {'updater' => actor})

      expect(target.reload.supervisor_user_ids).to_not include(other.global_id)
    end
  end
end
