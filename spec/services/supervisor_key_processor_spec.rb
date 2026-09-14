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
      expect(Organization).to receive(:parse_activation_code).with('asdf', u, force_pending: false).and_return({:progress => 'done'})
      result = SupervisorKeyProcessor.new(u, "start-asdf").call
      expect(result).to eq(true)
    end

    it "should return false for disabled start code" do
      u = User.create
      expect(Organization).to receive(:parse_activation_code).with('asdf', u, force_pending: false).and_return({:disabled => true})
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

  # Phase 1 authority model, option B (Scot's decision, 2026-09-14).
  #
  # ATTACHMENT by a third party is allowed but lands PENDING, never active.
  # RATIFICATION is self-only, because consent is given BY a party, not FOR one.
  #
  # Why pending rather than refusing: authority flows only from NON-pending links
  # (Organization.manager_for? filters `!l['state']['pending']`), so a pending
  # attachment grants the receiving org's managers nothing. That closes the
  # laundering bypass, because it no longer matters WHO submits, and it keeps the
  # school/clinic onboarding path working instead of failing it silently.
  #
  # Driven through User#process with an 'updater', the real request path, so these
  # pin behaviour rather than a method signature.
  describe "third-party org attachment lands pending (option B)" do
    after(:each) do
      AuditEvent.where("summary LIKE ?", '%supervisor_key%').delete_all
    end

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

    # --- attachment: allowed, but pending ---

    it "should attach as PENDING when a third party redeems a code for an org they manage" do
      actor, target = supervised_pair
      org = org_managed_by(actor)
      code = Organization.activation_code(org, {'proposed_code' => 'bpendingone'})

      target.process({'supervisor_key' => "start-#{code}"}, {'updater' => actor})

      expect(org.reload.managed_user?(target.reload)).to eq(true)
      expect(org.reload.pending_user?(target.reload)).to eq(true)
    end

    it "should attach as PENDING when a third party redeems a code for an org they do NOT manage" do
      actor, target = supervised_pair
      school = Organization.create(:settings => {'total_licenses' => 5})
      code = Organization.activation_code(school, {'proposed_code' => 'bpendingtwo'})

      target.process({'supervisor_key' => "start-#{code}"}, {'updater' => actor})

      expect(school.reload.managed_user?(target.reload)).to eq(true)
      expect(school.reload.pending_user?(target.reload)).to eq(true)
    end

    it "should attach NON-pending when the user redeems a code on their own account" do
      target = User.create
      org = Organization.create(:settings => {'total_licenses' => 5})
      code = Organization.activation_code(org, {'proposed_code' => 'bselfcodeone'})

      target.process({'supervisor_key' => "start-#{code}"}, {'updater' => target})

      expect(org.reload.managed_user?(target.reload)).to eq(true)
      expect(org.reload.pending_user?(target.reload)).to eq(false)
    end

    # --- the whole point: a pending attachment confers no authority ---

    it "should not grant the receiving org's manager any authority over the target" do
      actor, target = supervised_pair
      org = org_managed_by(actor)
      code = Organization.activation_code(org, {'proposed_code' => 'bnoauthority'})

      target.process({'supervisor_key' => "start-#{code}"}, {'updater' => actor})

      expect(Organization.manager_for?(actor.reload, target.reload)).to eq(false)
      expect(target.reload.allows?(actor.reload, 'support_actions')).to eq(false)
    end

    # The laundering bypass the previous design failed on: the submitter is a
    # throwaway who manages nothing, while the beneficiary manages the org.
    it "should defeat laundering through a second supervisor who manages nothing" do
      attacker, target = supervised_pair
      org = org_managed_by(attacker)
      patsy = User.create
      User.link_supervisor_to_user(patsy, target, nil, 'edit')
      code = Organization.activation_code(org, {'proposed_code' => 'blaundering1'})

      target.reload.process({'supervisor_key' => "start-#{code}"}, {'updater' => patsy.reload})

      expect(org.reload.pending_user?(target.reload)).to eq(true)
      expect(Organization.manager_for?(attacker.reload, target.reload)).to eq(false)
      expect(target.reload.allows?(attacker.reload, 'support_actions')).to eq(false)
    end

    # --- ratification: self-only ---

    it "should refuse third-party approve-org even when the actor manages nothing" do
      actor, target = supervised_pair
      school = Organization.create(:settings => {'total_licenses' => 5})
      school.add_user(target.user_name, true)
      expect(school.reload.pending_user?(target.reload)).to eq(true)

      target.process({'supervisor_key' => 'approve-org'}, {'updater' => actor})

      expect(school.reload.pending_user?(target.reload)).to eq(true)
    end

    it "should refuse third-party approve_supervision" do
      actor, target = supervised_pair
      org = org_managed_by(actor)
      org.add_supervisor(target.user_name, true)
      target.reload
      expect(org.reload.pending_supervisor?(target)).to eq(true)

      target.process({'supervisor_key' => "approve_supervision-#{org.global_id}"}, {'updater' => actor})

      expect(org.reload.pending_supervisor?(target.reload)).to eq(true)
    end

    it "should log an AuditEvent when a third-party ratification is refused" do
      actor, target = supervised_pair
      school = Organization.create(:settings => {'total_licenses' => 5})
      school.add_user(target.user_name, true)

      target.process({'supervisor_key' => 'approve-org'}, {'updater' => actor})

      event = AuditEvent.where("summary LIKE ?", '%supervisor_key_denied%').last
      expect(event).to_not eq(nil)
      expect(event.data['user_id']).to eq(target.global_id)
      expect(event.data['actor_id']).to eq(actor.global_id)
    end

    # --- regression guards: the self paths and unrelated actions must survive ---

    it "should still allow a user to approve-org on their own account" do
      target = User.create
      org = Organization.create(:settings => {'total_licenses' => 5})
      org.add_user(target.user_name, true)
      expect(org.reload.pending_user?(target.reload)).to eq(true)

      target.process({'supervisor_key' => 'approve-org'}, {'updater' => target})

      expect(org.reload.pending_user?(target.reload)).to eq(false)
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
