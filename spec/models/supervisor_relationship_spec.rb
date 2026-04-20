require 'spec_helper'

describe SupervisorRelationship, :type => :model do
  describe "validations" do
    it "should require supervisor_user_id" do
      rel = SupervisorRelationship.new(communicator_user_id: 1)
      expect(rel).not_to be_valid
      expect(rel.errors[:supervisor_user_id]).to be_present
    end

    it "should require communicator_user_id" do
      rel = SupervisorRelationship.new(supervisor_user_id: 1)
      expect(rel).not_to be_valid
      expect(rel.errors[:communicator_user_id]).to be_present
    end

    it "should only accept valid statuses" do
      u1 = User.create
      u2 = User.create
      SupervisorRelationship::STATUSES.each do |s|
        rel = SupervisorRelationship.new(supervisor_user: u1, communicator_user: u2, status: s)
        rel.valid?
        expect(rel.errors[:status]).to be_empty, "Expected status '#{s}' to be valid"
      end
    end

    it "should reject invalid statuses" do
      u1 = User.create
      u2 = User.create
      rel = SupervisorRelationship.new(supervisor_user: u1, communicator_user: u2, status: 'bogus')
      expect(rel).not_to be_valid
      expect(rel.errors[:status]).to be_present
    end

    it "should only accept valid permission levels" do
      u1 = User.create
      u2 = User.create
      SupervisorRelationship::PERMISSION_LEVELS.each do |pl|
        rel = SupervisorRelationship.new(supervisor_user: u1, communicator_user: u2, permission_level: pl)
        rel.valid?
        expect(rel.errors[:permission_level]).to be_empty, "Expected permission_level '#{pl}' to be valid"
      end
    end

    it "should reject invalid permission levels" do
      u1 = User.create
      u2 = User.create
      rel = SupervisorRelationship.new(supervisor_user: u1, communicator_user: u2, permission_level: 'superadmin')
      expect(rel).not_to be_valid
      expect(rel.errors[:permission_level]).to be_present
    end

    it "should be valid with all required fields and defaults" do
      u1 = User.create
      u2 = User.create
      rel = SupervisorRelationship.new(supervisor_user: u1, communicator_user: u2)
      expect(rel).to be_valid
    end
  end

  describe "defaults" do
    it "should default status to pending" do
      rel = SupervisorRelationship.new
      expect(rel.status).to eq('pending')
    end

    it "should default permission_level to view_only" do
      rel = SupervisorRelationship.new
      expect(rel.permission_level).to eq('view_only')
    end

    it "should initialize metadata on save" do
      u1 = User.create
      u2 = User.create
      rel = SupervisorRelationship.create!(supervisor_user: u1, communicator_user: u2)
      expect(rel.metadata).to eq({})
    end
  end

  describe "scopes" do
    before(:each) do
      @u1 = User.create
      @u2 = User.create
    end

    describe "active" do
      it "should return only approved relationships" do
        approved = SupervisorRelationship.create!(supervisor_user: @u1, communicator_user: @u2, status: 'approved')
        u3 = User.create
        SupervisorRelationship.create!(supervisor_user: @u1, communicator_user: u3, status: 'pending')
        results = SupervisorRelationship.active
        expect(results).to include(approved)
        expect(results.count).to eq(1)
      end
    end

    describe "pending" do
      it "should return only pending relationships" do
        pending_rel = SupervisorRelationship.create!(supervisor_user: @u1, communicator_user: @u2, status: 'pending')
        u3 = User.create
        SupervisorRelationship.create!(supervisor_user: @u1, communicator_user: u3, status: 'approved')
        results = SupervisorRelationship.pending
        expect(results).to include(pending_rel)
        expect(results.count).to eq(1)
      end
    end

    describe "expired_pending" do
      it "should return pending relationships with expired tokens" do
        expired = SupervisorRelationship.create!(
          supervisor_user: @u1,
          communicator_user: @u2,
          status: 'pending',
          consent_token_expires_at: 1.day.ago
        )
        u3 = User.create
        SupervisorRelationship.create!(
          supervisor_user: @u1,
          communicator_user: u3,
          status: 'pending',
          consent_token_expires_at: 1.day.from_now
        )
        results = SupervisorRelationship.expired_pending
        expect(results).to include(expired)
        expect(results.count).to eq(1)
      end
    end
  end

  describe "generate_consent_token!" do
    it "should generate a token and set expiration" do
      u1 = User.create
      u2 = User.create
      rel = SupervisorRelationship.create!(supervisor_user: u1, communicator_user: u2)
      rel.generate_consent_token!
      rel.reload
      expect(rel.consent_response_token).to be_present
      expect(rel.consent_token_expires_at).to be > Time.current
      expect(rel.consent_token_expires_at).to be < 15.days.from_now
      expect(rel.consent_requested_at).to be_present
    end
  end

  describe "token_valid?" do
    it "should return true for a valid pending token" do
      u1 = User.create
      u2 = User.create
      rel = SupervisorRelationship.create!(supervisor_user: u1, communicator_user: u2)
      rel.generate_consent_token!
      expect(rel.token_valid?).to eq(true)
    end

    it "should return false if token is expired" do
      u1 = User.create
      u2 = User.create
      rel = SupervisorRelationship.create!(supervisor_user: u1, communicator_user: u2)
      rel.generate_consent_token!
      rel.update_column(:consent_token_expires_at, 1.day.ago)
      expect(rel.token_valid?).to eq(false)
    end

    it "should return false if status is not pending" do
      u1 = User.create
      u2 = User.create
      rel = SupervisorRelationship.create!(supervisor_user: u1, communicator_user: u2)
      rel.generate_consent_token!
      rel.update_column(:status, 'approved')
      expect(rel.token_valid?).to eq(false)
    end

    it "should return false if token is blank" do
      u1 = User.create
      u2 = User.create
      rel = SupervisorRelationship.create!(supervisor_user: u1, communicator_user: u2)
      expect(rel.token_valid?).to eq(false)
    end
  end

  describe "user_link_type" do
    it "should return read_only for view_only permission" do
      rel = SupervisorRelationship.new(permission_level: 'view_only')
      expect(rel.user_link_type).to eq('read_only')
    end

    it "should return edit for edit_boards permission" do
      rel = SupervisorRelationship.new(permission_level: 'edit_boards')
      expect(rel.user_link_type).to eq('edit')
    end

    it "should return edit for manage_devices permission" do
      rel = SupervisorRelationship.new(permission_level: 'manage_devices')
      expect(rel.user_link_type).to eq('edit')
    end

    it "should return edit for full permission" do
      rel = SupervisorRelationship.new(permission_level: 'full')
      expect(rel.user_link_type).to eq('edit')
    end
  end

  describe "expire_stale_requests!" do
    it "should expire pending relationships with expired tokens" do
      u1 = User.create
      u2 = User.create
      u3 = User.create
      stale = SupervisorRelationship.create!(
        supervisor_user: u1,
        communicator_user: u2,
        status: 'pending',
        consent_token_expires_at: 1.day.ago
      )
      fresh = SupervisorRelationship.create!(
        supervisor_user: u1,
        communicator_user: u3,
        status: 'pending',
        consent_token_expires_at: 7.days.from_now
      )
      SupervisorRelationship.expire_stale_requests!
      stale.reload
      fresh.reload
      expect(stale.status).to eq('expired')
      expect(fresh.status).to eq('pending')
    end
  end

  describe "associations" do
    it "should belong to supervisor_user" do
      u1 = User.create
      u2 = User.create
      rel = SupervisorRelationship.create!(supervisor_user: u1, communicator_user: u2)
      expect(rel.supervisor_user).to eq(u1)
    end

    it "should belong to communicator_user" do
      u1 = User.create
      u2 = User.create
      rel = SupervisorRelationship.create!(supervisor_user: u1, communicator_user: u2)
      expect(rel.communicator_user).to eq(u2)
    end

    it "should optionally belong to organization" do
      u1 = User.create
      u2 = User.create
      rel = SupervisorRelationship.create!(supervisor_user: u1, communicator_user: u2)
      expect(rel).to be_valid
      expect(rel.organization).to be_nil
    end
  end

  describe "user associations" do
    it "should be accessible from user as supervisor" do
      u1 = User.create
      u2 = User.create
      rel = SupervisorRelationship.create!(supervisor_user: u1, communicator_user: u2)
      expect(u1.supervisor_relationships_as_supervisor).to include(rel)
    end

    it "should be accessible from user as communicator" do
      u1 = User.create
      u2 = User.create
      rel = SupervisorRelationship.create!(supervisor_user: u1, communicator_user: u2)
      expect(u2.supervisor_relationships_as_communicator).to include(rel)
    end
  end

  describe "constants" do
    it "should define all permission descriptions" do
      SupervisorRelationship::PERMISSION_LEVELS.each do |level|
        expect(SupervisorRelationship::PERMISSION_DESCRIPTIONS[level]).to be_present
      end
    end
  end
end
