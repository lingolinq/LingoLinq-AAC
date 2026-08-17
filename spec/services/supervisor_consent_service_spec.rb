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

    it "should find communicator by username" do
      supervisor = User.create
      communicator = User.create
      expect(SupervisorMailer).to receive(:schedule_delivery).with(:consent_request, anything)
      result = service.request_access(
        supervisor: supervisor,
        lookup_key: communicator.user_name,
        permission_level: 'edit_boards'
      )
      expect(result[:message]).to eq(SupervisorConsentService::GENERIC_LOOKUP_MESSAGE)
      rel = SupervisorRelationship.last
      expect(rel.communicator_user).to eq(communicator)
      expect(rel.lookup_method).to eq('username')
      expect(rel.permission_level).to eq('edit_boards')
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

  describe "#approve_as_party" do
    it "should approve when actor is the communicator" do
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
      result = service.approve_as_party(relationship: rel, actor: communicator)
      expect(result[:error]).to be_nil
      expect(rel.reload.status).to eq('approved')
      expect(communicator.reload.supervisor_user_ids).to include(supervisor.global_id)
    end

    it "should reject when actor is the supervisor" do
      supervisor = User.create
      communicator = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: supervisor,
        communicator_user: communicator,
        status: 'pending'
      )
      rel.generate_consent_token!
      result = service.approve_as_party(relationship: rel, actor: supervisor)
      expect(result[:error]).to eq('not_authorized')
      expect(rel.reload.status).to eq('pending')
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

  describe "#deny_as_party" do
    it "should deny when actor is the communicator" do
      supervisor = User.create
      communicator = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: supervisor,
        communicator_user: communicator,
        status: 'pending'
      )
      rel.generate_consent_token!
      result = service.deny_as_party(relationship: rel, actor: communicator)
      expect(result[:error]).to be_nil
      expect(rel.reload.status).to eq('denied')
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

  # Consent transitions are check-then-act on a row two parties reach
  # independently: the guardian's emailed approve/deny links and the
  # communicator's in-app pending list. These specs pin the losing side of that
  # race, by handing the service the STALE copy the loser holds and committing
  # the winner's write before the lock is taken. `with_lock` reloads under
  # SELECT ... FOR UPDATE, so the guard re-runs against committed state.
  describe "concurrent transitions" do
    def pending_pair(permission_level: 'edit_boards')
      supervisor = User.create
      communicator = User.create
      rel = SupervisorRelationship.create!(
        supervisor_user: supervisor,
        communicator_user: communicator,
        status: 'pending',
        permission_level: permission_level
      )
      rel.generate_consent_token!
      [supervisor, communicator, rel]
    end

    it "should refuse an approve whose row was denied after the caller read it" do
      supervisor, communicator, rel = pending_pair
      token = rel.consent_response_token

      stale = SupervisorRelationship.find(rel.id)
      expect(stale.token_valid?).to eq(true)
      expect(SupervisorRelationship).to receive(:find_by).with(consent_response_token: token).and_return(stale)

      # The competing deny commits while the approver still holds `stale`.
      SupervisorRelationship.where(id: rel.id).update_all(
        status: 'denied', consent_response_token: nil, consent_responded_at: Time.current
      )

      expect(SupervisorMailer).to_not receive(:schedule_delivery)
      result = service.approve(token: token)

      expect(result[:error]).to eq('invalid_or_expired_token')
      expect(rel.reload.status).to eq('denied')
      # The whole point: no live supervisor link on a relationship the guardian
      # refused. This is the outcome the unlocked version produced.
      expect(communicator.reload.supervisor_user_ids).to_not include(supervisor.global_id)
    end

    it "should refuse an in-app approve whose row was denied after the caller read it" do
      supervisor, communicator, rel = pending_pair
      stale = SupervisorRelationship.find(rel.id)

      SupervisorRelationship.where(id: rel.id).update_all(
        status: 'denied', consent_response_token: nil, consent_responded_at: Time.current
      )

      expect(SupervisorMailer).to_not receive(:schedule_delivery)
      result = service.approve_as_party(relationship: stale, actor: communicator)

      expect(result[:error]).to eq('not_pending')
      expect(rel.reload.status).to eq('denied')
      expect(communicator.reload.supervisor_user_ids).to_not include(supervisor.global_id)
    end

    it "should refuse a deny whose row was approved after the caller read it" do
      supervisor, communicator, rel = pending_pair
      stale = SupervisorRelationship.find(rel.id)

      SupervisorRelationship.where(id: rel.id).update_all(
        status: 'approved', consent_response_token: nil, activated_at: Time.current
      )

      result = service.deny_as_party(relationship: stale, actor: communicator)

      expect(result[:error]).to eq('not_pending')
      # A denial must not silently clobber an already-recorded approval.
      expect(rel.reload.status).to eq('approved')
    end

    it "should refuse an approve whose token expired after the caller read it" do
      supervisor, communicator, rel = pending_pair
      token = rel.consent_response_token

      stale = SupervisorRelationship.find(rel.id)
      expect(stale.token_valid?).to eq(true)
      expect(SupervisorRelationship).to receive(:find_by).with(consent_response_token: token).and_return(stale)

      SupervisorRelationship.where(id: rel.id).update_all(consent_token_expires_at: 1.minute.ago)

      expect(SupervisorMailer).to_not receive(:schedule_delivery)
      result = service.approve(token: token)

      expect(result[:error]).to eq('invalid_or_expired_token')
      expect(rel.reload.status).to eq('pending')
      expect(communicator.reload.supervisor_user_ids).to_not include(supervisor.global_id)
    end

    it "should treat a replayed approve token as invalid" do
      supervisor, communicator, rel = pending_pair
      token = rel.consent_response_token

      expect(SupervisorMailer).to receive(:schedule_delivery).with(:consent_approved, rel.global_id).once
      expect(service.approve(token: token)[:error]).to be_nil

      # finalize_approve clears the token, so a double-submit finds nothing.
      expect(service.approve(token: token)[:error]).to eq('invalid_or_expired_token')
      expect(rel.reload.status).to eq('approved')
    end

    it "should refuse a second revoke of the same relationship" do
      supervisor = User.create
      communicator = User.create
      User.link_supervisor_to_user(supervisor, communicator)
      rel = SupervisorRelationship.create!(
        supervisor_user: supervisor,
        communicator_user: communicator,
        status: 'approved',
        activated_at: Time.current
      )

      expect(SupervisorMailer).to receive(:schedule_delivery).with(:supervisor_revoked, rel.global_id, 'supervisor').once
      expect(service.revoke(relationship: rel, revoker: supervisor)[:error]).to be_nil

      # A racing second revoke re-reads under the lock and finds it already gone.
      expect(service.revoke(relationship: SupervisorRelationship.find(rel.id), revoker: supervisor)[:error]).to eq('not_active')
    end

    it "should schedule the approval email only after the transition is persisted" do
      supervisor, communicator, rel = pending_pair

      expect(SupervisorMailer).to receive(:schedule_delivery) do |type, id|
        expect(type).to eq(:consent_approved)
        expect(id).to eq(rel.global_id)
        # Read through a fresh object, the way the Resque worker does when it
        # re-loads by global_id. Scheduling inside the lock would let the worker
        # observe a row that had not transitioned yet.
        expect(SupervisorRelationship.find(rel.id).status).to eq('approved')
      end

      expect(service.approve(token: rel.consent_response_token)[:error]).to be_nil
    end

    it "should not leave a supervisor link behind when the transition fails" do
      supervisor, communicator, rel = pending_pair
      token = rel.consent_response_token

      stale = SupervisorRelationship.find(rel.id)
      expect(SupervisorRelationship).to receive(:find_by).with(consent_response_token: token).and_return(stale)
      SupervisorRelationship.where(id: rel.id).update_all(status: 'expired', consent_response_token: nil)

      service.approve(token: token)

      expect(communicator.reload.supervisor_user_ids).to eq([])
      expect(rel.reload.status).to eq('expired')
    end
  end

  # The specs above hand the service a STALE copy and commit the winner's write
  # first. That proves the recheck runs, but it never puts two transactions in
  # contention, so it cannot prove the LOCK serializes them. This group does:
  # two threads, two real connections, both holding a pending copy, racing.
  #
  # Transactional fixtures must be off for it. Each thread checks out its own
  # connection and would otherwise be unable to see rows created inside the
  # example's uncommitted transaction. Records are therefore committed for real
  # and torn down explicitly in `after`.
  describe "genuinely concurrent transitions" do
    self.use_transactional_tests = false

    # Rows here are really committed, so they must be really removed. Cleanup is
    # scoped to the ids this group created rather than a blanket delete_all: the
    # test database carries orphaned rows from other files, and wiping tables
    # wholesale in a non-transactional group is how one spec file starts
    # breaking another.
    before(:each) { @created_user_ids = []; @created_rel_ids = [] }

    after(:each) do
      SupervisorRelationship.where(id: @created_rel_ids).delete_all
      UserLink.where(user_id: @created_user_ids).delete_all
      UserLink.where(secondary_user_id: @created_user_ids).delete_all
      User.where(id: @created_user_ids).delete_all
    end

    def make_user
      u = User.create
      @created_user_ids << u.id
      u
    end

    def make_relationship(attrs)
      rel = SupervisorRelationship.create!(attrs)
      @created_rel_ids << rel.id
      rel
    end

    # Both threads are held at the gate and released together, so they contend
    # for the row lock rather than running one after the other.
    def race(&block)
      gate = Queue.new
      results = Queue.new
      threads = [:approve, :deny].map do |decision|
        Thread.new do
          gate.pop
          begin
            ActiveRecord::Base.connection_pool.with_connection { results << [decision, block.call(decision)] }
          rescue => e
            results << [decision, { error: "raised:#{e.class}" }]
          end
        end
      end
      2.times { gate << :go }
      threads.each { |t| t.join(20) }
      Array.new(results.size) { results.pop }.to_h
    end

    it "should let exactly one of two simultaneous approve/deny transitions win" do
      supervisor = make_user
      communicator = make_user
      rel = make_relationship(
        supervisor_user: supervisor,
        communicator_user: communicator,
        status: 'pending',
        permission_level: 'edit_boards'
      )
      rel.generate_consent_token!
      allow(SupervisorMailer).to receive(:schedule_delivery)

      # Each side loads its own copy while the row is still pending: this is the
      # state both parties are in when the guardian clicks the email link at the
      # same moment the communicator answers in-app.
      copies = {
        approve: SupervisorRelationship.find(rel.id),
        deny: SupervisorRelationship.find(rel.id)
      }
      expect(copies.values.map(&:status)).to eq(['pending', 'pending'])

      svc = SupervisorConsentService.new
      out = race do |decision|
        if decision == :approve
          svc.approve_as_party(relationship: copies[:approve], actor: communicator)
        else
          svc.deny_as_party(relationship: copies[:deny], actor: communicator)
        end
      end

      winners = out.select { |_d, r| r[:error].nil? }
      expect(winners.size).to eq(1)
      expect(out.values.map { |r| r[:error] }.compact).to eq(['not_pending'])

      final = SupervisorRelationship.find(rel.id)
      expect(final.status).to eq(winners.keys.first == :approve ? 'approved' : 'denied')

      # The invariant the unlocked version could break: the recorded decision and
      # the actual access must agree. Previously an approve could create the link
      # and a deny could then land on top, leaving a row that reads 'denied'
      # while the supervisor still had live access.
      linked = communicator.reload.supervisor_user_ids.include?(supervisor.global_id)
      expect(linked).to eq(final.status == 'approved')
    end

    it "should let exactly one of two simultaneous revokes win" do
      supervisor = make_user
      communicator = make_user
      User.link_supervisor_to_user(supervisor, communicator)
      rel = make_relationship(
        supervisor_user: supervisor,
        communicator_user: communicator,
        status: 'approved',
        activated_at: Time.current
      )
      allow(SupervisorMailer).to receive(:schedule_delivery)

      copies = {
        approve: SupervisorRelationship.find(rel.id),
        deny: SupervisorRelationship.find(rel.id)
      }
      svc = SupervisorConsentService.new
      out = race { |d| svc.revoke(relationship: copies[d], revoker: supervisor) }

      expect(out.values.count { |r| r[:error].nil? }).to eq(1)
      expect(out.values.map { |r| r[:error] }.compact).to eq(['not_active'])
      expect(SupervisorRelationship.find(rel.id).status).to eq('revoked')
      expect(communicator.reload.supervisor_user_ids).to_not include(supervisor.global_id)
    end
  end
end
