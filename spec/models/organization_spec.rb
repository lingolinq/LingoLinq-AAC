require 'spec_helper'

describe Organization, :type => :model do
  describe "managing managers" do
    it "should correctly add a manager" do
      o = Organization.create
      u = User.create
      expect(o.manager?(u)).to eq(false)
      
      res = o.add_manager(u.user_name, true)
      expect(res).to eq(true)
      u.reload
      expect(o.manager?(u)).to eq(true)
      expect(o.assistant?(u)).to eq(true)
    end
    
    it "should correctly add an assistant" do
      o = Organization.create
      u = User.create
      expect(o.manager?(u)).to eq(false)
      
      res = o.add_manager(u.user_name, false)
      expect(res).to eq(true)
      u.reload
      expect(o.manager?(u)).to eq(false)
      expect(o.assistant?(u)).to eq(true)
    end
    
    it "should error on adding a manager that doesn't exist" do
      o = Organization.create
      expect{ o.add_manager('frog') }.to raise_error("invalid user, frog")
    end
    
    it "should not error on adding a manager that is managing a different organization" do
      o = Organization.create
      o2 = Organization.create
      u = User.create
      o2.add_manager(u.user_name, true)
      
      expect { o.add_manager(u.user_name, true) }.to_not raise_error
      u.reload
    end
    
    it "should correctly remove a manager" do
      o = Organization.create
      u = User.create
      o.add_manager(u.user_name, true)
      expect(o.manager?(u.reload)).to eq(true)
      expect(o.assistant?(u)).to eq(true)
      
      res = o.remove_manager(u.user_name)
      expect(res).to eq(true)
      u.reload
      expect(o.manager?(u.reload)).to eq(false)
    end
    
    it "should allow being a manager for more than one org" do
      o1 = Organization.create
      o2 = Organization.create
      u = User.create
      o1.add_manager(u.user_name, true)
      o2.add_manager(u.user_name, true)
      u.reload
      links = UserLink.links_for(u).sort_by{|l| l['record_code'] }
      expect(links.length).to eq(2)
      expect(links[0]['record_code']).to eq(Webhook.get_record_code(o1))
      expect(links[1]['record_code']).to eq(Webhook.get_record_code(o2))
      expect(o1.reload.manager?(u)).to eq(true)
      expect(o2.reload.manager?(u)).to eq(true)
    end
    
    it "should correctly remove an assistant" do
      o = Organization.create
      u = User.create
      o.add_manager(u.user_name)
      expect(o.manager?(u.reload)).to eq(false)
      expect(o.assistant?(u)).to eq(true)
      
      res = o.remove_manager(u.user_name)
      expect(res).to eq(true)
      u.reload
      expect(o.manager?(u.reload)).to eq(false)
      expect(o.assistant?(u)).to eq(false)
    end
    
    it "should error on removing a manager that doesn't exist" do
      o = Organization.create
      expect{ o.remove_manager('frog') }.to raise_error("invalid user, frog")
    end
    
    it "should not error on removing a manager that is managing a different organization" do
      o = Organization.create
      o2 = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
      o2.add_manager(u.user_name, true)
      u.reload
      
      expect { o.remove_manager(u.user_name) }.to_not raise_error
    end
  end
  
  describe "managing supervisors" do
    it "should correctly add a supervisor" do
      o = Organization.create
      u = User.create
      expect(u.reload.billing_state).to eq(:trialing_communicator)
      o.add_supervisor(u.user_name, true)
      expect(o.supervisor?(u.reload)).to eq(true)
      expect(o.pending_supervisor?(u.reload)).to eq(true)
      expect(u.reload.billing_state).to eq(:trialing_communicator)
      
      o.add_supervisor(u.user_name, false)
      expect(o.supervisor?(u.reload)).to eq(true)
      expect(o.pending_supervisor?(u.reload)).to eq(false)
      expect(u.reload.billing_state).to eq(:org_supporter)
    end
    
    it "should allow being a supervisor for multiple organizations" do
      o1 = Organization.create
      o2 = Organization.create
      u = User.create
      o1.add_supervisor(u.user_name, true)
      o2.add_supervisor(u.user_name, false)
      u.reload
      expect(o1.supervisor?(u)).to eq(true)
      expect(o1.pending_supervisor?(u)).to eq(true)
      expect(o2.supervisor?(u)).to eq(true)
      expect(o2.pending_supervisor?(u)).to eq(false)
    end

    it "should add and allow approving a pending supervisor" do
      o = Organization.create(settings: {'total_licenses' => 5})
      u1 = User.create(:settings => {:preferences => {role: 'supporter'}})
      u1.settings['preferences']['role'] = 'supporter'
      u1.save
      expect(u1.reload.billing_state).to eq(:trialing_supporter)
      Worker.process_queues
      o.add_supervisor(u1.user_name, true)
      Worker.process_queues
      expect(u1.reload.billing_state).to eq(:trialing_supporter)

      o.approve_supervisor(u1)
      expect(u1.reload.billing_state).to eq(:org_supporter)
      expect(u1.settings['subscription']['subscription_id']).to eq("free_auto_adjusted:#{o.global_id}")
      o.remove_supervisor(u1.user_name)
      expect(u1.reload.billing_state).to eq(:grace_period_supporter)
      expect(u1.settings['subscription']['subscription_id']).to eq(nil)
    end

    it "should allow rejecting a pending supervisor" do
      o = Organization.create(settings: {'total_licenses' => 5})
      u1 = User.create(:settings => {:preferences => {role: 'supporter'}})
      u1.settings['preferences']['role'] = 'supporter'
      u1.save
      expect(u1.reload.billing_state).to eq(:trialing_supporter)
      Worker.process_queues
      o.add_supervisor(u1.user_name, true)
      Worker.process_queues
      expect(u1.reload.billing_state).to eq(:trialing_supporter)

      o.reject_supervisor(u1)
      expect(u1.reload.billing_state).to eq(:trialing_supporter)
      expect(u1.settings['subscription']['subscription_id']).to eq(nil)
    end

    it "should error adding a null user as a supervisor" do
      o = Organization.create
      u = User.create
      expect { o.add_supervisor('bacon', true) }.to raise_error("invalid user, bacon")
    end
    
    it "should error removing a null user as a supervisor" do
      o = Organization.create
      u = User.create
      expect { o.remove_supervisor('bacon') }.to raise_error("invalid user, bacon")
    end
    
    it "should correctly remove a supervisor" do
      o = Organization.create
      u = User.create
      o.add_supervisor(u.user_name, true)
      expect(o.supervisor?(u.reload)).to eq(true)
      expect(o.pending_supervisor?(u.reload)).to eq(true)
      
      o.remove_supervisor(u.user_name)
      expect(o.supervisor?(u.reload)).to eq(false)
      expect(o.pending_supervisor?(u.reload)).to eq(false)
    end
    
    it "should keep other supervision settings intact when being removed as a supervisor" do
      o = Organization.create
      o2 = Organization.create
      u = User.create
      o.add_supervisor(u.user_name, true)
      expect(o.supervisor?(u.reload)).to eq(true)
      expect(o.pending_supervisor?(u.reload)).to eq(true)
      o2.add_supervisor(u.user_name, true)
      expect(o2.supervisor?(u.reload)).to eq(true)
      expect(o2.pending_supervisor?(u.reload)).to eq(true)
      
      o.remove_supervisor(u.user_name)
      expect(o.supervisor?(u.reload)).to eq(false)
      expect(o.pending_supervisor?(u.reload)).to eq(false)
      expect(o2.supervisor?(u.reload)).to eq(true)
      expect(o2.pending_supervisor?(u.reload)).to eq(true)
    end
    
    it "should allow org admins to see basic information about added supervisors" do
      o = Organization.create
      u = User.create
      u2 = User.create
      o.add_manager(u.user_name, true)
      o.add_supervisor(u2.user_name, false)
      o.reload
      expect(Organization.manager_for?(u.reload, u2.reload)).to eq(true)
      expect(u.edit_permission_for?(u2)).to eq(true)
      expect(u2.allows?(u, 'supervise')).to eq(true)
      expect(u2.allows?(u, 'manage_supervision')).to eq(true)
      expect(u2.allows?(u, 'view_detailed')).to eq(true)
    end

    it "should not allow org admins to see basic information about pending added supervisors" do
      o = Organization.create
      u = User.create
      u2 = User.create
      o.add_manager(u.user_name, true)
      o.add_supervisor(u2.user_name, true)
      perms = u2.reload.permissions_for(u.reload)
      expect(u2.allows?(u, 'supervise')).to eq(false)
      expect(u2.allows?(u, 'manage_supervision')).to eq(false)
      expect(u2.allows?(u, 'view_detailed')).to eq(false)
    end
    
    it "should mark the user as a free supporter if they're still on the free trial" do
      o = Organization.create
      u = User.create
      expect(u.grace_period?).to eq(true)
      o.add_supervisor(u.user_name, false)
      u.reload
      expect(u.grace_period?).to eq(false)
      expect(u.settings['subscription']['plan_id']).to eq('slp_monthly_free')
      expect(u.settings['subscription']['modeling_only']).to eq(true)
      expect(u.settings['subscription']['subscription_id']).to eq("free_auto_adjusted:#{o.global_id}")
    end
    
    it "should not mark the user as a free supporter if they're not on the free trial" do
      o = Organization.create
      u = User.create
      u.subscription_override('never_expires')
      expect(u.grace_period?).to eq(false)
      o.add_supervisor(u.user_name)
      u.reload
      expect(u.grace_period?).to eq(false)
      expect(u.settings['subscription']).to eq({'expiration_source' => 'free_trial', 'never_expires' => true})
    end
    
    it "should remove from any units when removing" do
      o = Organization.create!
      u1 = User.create!
      u2 = User.create!
      ou1 = OrganizationUnit.create!(:organization => o)
      ou2 = OrganizationUnit.create!(:organization => o)
      o.add_supervisor(u1.user_name, false)
      o.add_user(u1.user_name, false, false)
      o.add_user(u2.user_name, false, false)
      ou1.add_communicator(u1.user_name)
      ou1.add_supervisor(u1.user_name, false)
      ou2.add_communicator(u2.user_name)
      ou2.add_supervisor(u1.user_name, false)
      
      Worker.process_queues
      Worker.process_queues
      expect(u1.reload.supervisor_user_ids).to eq([u1.global_id])
      expect(u1.reload.supervised_user_ids).to eq([u1.global_id, u2.global_id])
      expect(u2.reload.supervisor_user_ids).to eq([u1.global_id])
      expect(u2.reload.supervised_user_ids).to eq([])
      
      expect(UserLink.count).to eq(9)
      o.remove_supervisor(u1.user_name)
      
      Worker.process_queues
      Worker.process_queues
      expect(UserLink.count).to eq(4)

      expect(u1.reload.supervisor_user_ids).to eq([])
      expect(u1.reload.supervised_user_ids).to eq([])
      expect(u2.reload.supervisor_user_ids).to eq([])
      expect(u2.reload.supervised_user_ids).to eq([])
    end
  end
  
  describe "user types" do
    it "should correctly identify sponsored_user?" do
      o = Organization.create(:settings => {:total_licenses => 1})
      u = User.create
      o.add_user(u.user_name, false, true)
      expect(o.reload.sponsored_user?(u.reload)).to eq(true)
    end
    
    it "should correctly identify manager?" do
      o = Organization.create
      u = User.create
      o.add_manager(u.user_name, true)
      expect(o.manager?(u)).to eq(true)
      expect(o.assistant?(u)).to eq(true)
    end
    
    it "should correctly identify assistant?" do
      o = Organization.create
      u = User.create
      o.add_manager(u.user_name, false)
      expect(o.manager?(u)).to eq(false)
      expect(o.assistant?(u)).to eq(true)
    end
    
    it "should correctly identify supervisor?" do
      o = Organization.create
      u = User.create
      o.add_supervisor(u.user_name, false)
      expect(o.supervisor?(u)).to eq(true)
      expect(o.pending_supervisor?(u)).to eq(false)
    end

    it "should correctly identify pending_supervisor?" do
      o = Organization.create
      u = User.create
      o.add_supervisor(u.user_name, true)
      expect(o.supervisor?(u)).to eq(true)
      expect(o.pending_supervisor?(u)).to eq(true)
    end
    
    it "should correctly identify managed_user?" do
      o = Organization.create
      u = User.create
      o.add_user(u.user_name, false, false)
      expect(o.managed_user?(u)).to eq(true)
    end
    
    it "should correctly identify pending_user?" do
      o = Organization.create
      u = User.create
      o.add_user(u.user_name, true, false)
      expect(o.pending_user?(u)).to eq(true)
    end
  end
  
  describe "managing users" do
    it "should correctly add a user" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
      
      res = o.add_user(u.user_name, true)
      u.reload
      expect(!!res).to eq(true)
      expect(o.sponsored_user?(u)).to eq(true)
    end
    
    it "should error on adding a user that doesn't exist" do
      o = Organization.create
      expect{ o.add_user('bacon', false) }.to raise_error('invalid user, bacon')
    end
     
    it "should error on adding a user when there aren't any allotted" do
      o = Organization.create
      u = User.create
      expect{ o.add_user(u.user_name, false) }.to raise_error("no licenses available")
    end
    
    it "should remember how much time was left on the subscription" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create(:expires_at => Time.now + 100)
      expect(u.expires_at) == Time.now + 100
      o.add_user(u.user_name, false)
      u.reload
      expect(u.settings['subscription']['seconds_left']).to be > 90
      expect(u.settings['subscription']['seconds_left']).to be <= 100
    end
    
    it "should allow being a user in more than one org" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      o2 = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create(:expires_at => Time.now + 100)
      expect(u.expires_at) == Time.now + 100
      res = o.add_user(u.user_name, false)
      expect(!!res).to eq(true)
      u.reload
      expect(o.managed_user?(u)).to eq(true)
      expect(o2.managed_user?(u)).to eq(false)
      expect { o2.add_user(u.user_name, false) }.to_not raise_error #("already associated with a different organization")
      u.reload
      expect(o.managed_user?(u)).to eq(true)
      expect(o2.managed_user?(u)).to eq(true)
    end

    it "should notify the user when they are added by an org" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
      
      expect(UserMailer).to receive(:schedule_delivery).with(:organization_assigned, u.global_id, o.global_id)
      res = o.add_user(u.user_name, true)
      u.reload
      expect(!!res).to eq(true)
      expect(o.sponsored_user?(u)).to eq(true)
    end
    
    it "should not error on adding a user that is managed by a different organization" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      o2 = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
      o2.add_user(u.user_name, false, true)
      
      expect{ o.add_user(u.user_name, false) }.to_not raise_error #("already associated with a different organization")
      u.reload
      expect(o.managed_user?(u)).to eq(true)
      expect(o2.managed_user?(u)).to eq(true)
    end
    
    it "should correctly remove a user" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
      
      res = o.add_user(u.user_name, false)
      u.reload
      expect(!!res).to eq(true)
      expect(o.sponsored_user?(u)).to eq(true)
      
      res = o.remove_user(u.user_name)
      u.reload
      expect(res).to eq(true)
      expect(o.sponsored_user?(u)).to eq(false)
    end
    
    it "should update a user's expires_at when they are removed" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create(:expires_at => Time.now + 100, :settings => {'subscription' => {'org_sponsored' => true, 'seconds_left' => 3.weeks.to_i}})
      o.add_user(u.user_name, false, true)
      o.remove_user(u.user_name)
      u.reload
      expect(u.settings['subscription_left']) == nil
      expect(u.expires_at).to be >= Time.now + (3.weeks.to_i - 10)
      expect(u.expires_at).to be <= Time.now + (3.weeks.to_i + 10)
    end
    
    it "should update a user's expires_at when they are re-added as unsponsored" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create(:expires_at => Time.now + 100, :settings => {'subscription' => {'org_sponsored' => true, 'seconds_left' => 3.weeks.to_i}})
      User.where(id: u.id).update_all(expires_at: Time.now + 100)
      o.add_user(u.user_name, false, true)
      u.reload

      expect(u.expires_at).to eq(nil)
      o.add_user(u.user_name, false, false)
      u.reload
      expect(u.settings['subscription_left']) == nil
      expect(u.expires_at).to be >= Time.now + (3.weeks.to_i - 10)
      expect(u.expires_at).to be <= Time.now + (3.weeks.to_i + 10)
    end

    it "should not update a user's non-sponsored expires_at when they are removed" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create(:expires_at => Time.now + 100, :settings => {'subscription' => {'org_sponsored' => false, 'seconds_left' => 3.weeks.to_i}})
      o.add_user(u.user_name, false, false)
      o.remove_user(u.user_name)
      u.reload
      expect(u.settings['subscription_left']) == nil
      expect(u.expires_at).to be >= Time.now + 90
      expect(u.expires_at).to be <= Time.now + 110
    end
    
    it "should give the user a window of time when they are removed if they have no expires_at time left" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create(:expires_at => Time.now + 100, :settings => {'subscription' => {'org_sponsored' => true, 'seconds_left' => 5}})
      expect(u.expires_at).to be < 1.day.from_now
      o.add_user(u.user_name, false, true)
      o.remove_user(u.user_name)
      u.reload
      expect(u.settings['subscription_left']) == nil
      expect(u.expires_at).to be >= Time.now + (2.weeks.to_i - 10)
      expect(u.expires_at).to be <= Time.now + (2.weeks.to_i + 10)
    end
    
    it "should notify a user when they are removed by an org" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
      
      res = o.add_user(u.user_name, false)
      u.reload
      expect(!!res).to eq(true)
      expect(o.user?(u)).to eq(true)
      
      expect(UserMailer).to receive(:schedule_delivery).with(:organization_unassigned, u.global_id, o.global_id)
      res = o.remove_user(u.user_name)
      Worker.process_queues
      u.reload
      expect(res).to eq(true)
      expect(o.user?(u)).to eq(false)
      RemoteAction.all.update_all(act_at: 5.seconds.ago)
      Uploader.remote_remove_batch
    end
    
    it "should error on removing a user that doesn't exist" do
      o = Organization.create
      expect{ o.remove_user('fred') }.to raise_error("invalid user, fred")
    end
    
    it "should not error on removing a user that is managed by a different organization" do
      o = Organization.create
      o2 = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
      o2.add_user(u.user_name, false, true)
      u.reload
      expect(o.managed_user?(u)).to eq(false)
      expect(o2.managed_user?(u)).to eq(true)
      expect(UserLink.count).to eq(1)
      expect{ o.remove_user(u.user_name) }.to_not raise_error #("already associated with a different organization")
      u.reload
      expect(UserLink.count).to eq(1)
      expect(o.managed_user?(u)).to eq(false)
      expect(o2.managed_user?(u)).to eq(true)
    end
    
    it "should remove from any units when removing" do
      o = Organization.create
      u1 = User.create
      u2 = User.create
      ou1 = OrganizationUnit.create(:organization => o)
      ou2 = OrganizationUnit.create(:organization => o)
      o.add_supervisor(u1.user_name, false)
      o.add_supervisor(u2.user_name, false)
      o.add_user(u1.user_name, false, false)
      o.add_user(u2.user_name, false, false)
      ou1.add_communicator(u1.user_name)
      ou1.add_supervisor(u1.user_name, false)
      ou2.add_communicator(u1.user_name)
      ou2.add_supervisor(u2.user_name, false)
      
      Worker.process_queues
      Worker.process_queues
      expect(u1.reload.supervisor_user_ids.sort).to eq([u1.global_id, u2.global_id])
      expect(u1.reload.supervised_user_ids).to eq([u1.global_id])
      expect(u2.reload.supervisor_user_ids).to eq([])
      expect(u2.reload.supervised_user_ids).to eq([u1.global_id])
      
      
      o.remove_supervisor(u2.user_name)
      
      Worker.process_queues
      Worker.process_queues

      expect(u1.reload.supervisor_user_ids).to eq([u1.global_id])
      expect(u1.reload.supervised_user_ids).to eq([u1.global_id])
      expect(u2.reload.supervisor_user_ids).to eq([])
      expect(u2.reload.supervised_user_ids).to eq([])
    end
  end
  
  describe "permissions" do
    it "should allow a manager to supervise org-linked users" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
      u2 = User.create
      m = User.create
      
      expect(u.permissions_for(m)).to eq({'user_id' => m.global_id, 'view_existence' => true})
      expect(u2.permissions_for(m)).to eq({'user_id' => m.global_id, 'view_existence' => true})
      expect(m.permissions_for(u)).to eq({'user_id' => u.global_id, 'view_existence' => true})
      
      o.add_manager(m.user_name, true)
      u.reload
      m.reload
      expect(u.permissions_for(m)).to eq({'user_id' => m.global_id, 'view_existence' => true})
      expect(u2.permissions_for(m)).to eq({'user_id' => m.global_id, 'view_existence' => true})
      expect(m.permissions_for(u)).to eq({'user_id' => u.global_id, 'view_existence' => true})

      o.add_user(u.user_name, false)
      u.reload
      m.reload
      expect(u.permissions_for(m)).to eq({'user_id' => m.global_id, 'view_existence' => true, 'link_auth' => true, 'view_detailed' => true, 'view_word_map' => true, 'supervise' => true, 'model' => true, 'manage_supervision' => true, 'support_actions' => true, 'view_deleted_boards' => true, 'edit' => true, 'edit_boards' => true, 'set_goals' => true})
      expect(u2.permissions_for(m)).to eq({'user_id' => m.global_id, 'view_existence' => true})
      expect(m.permissions_for(u)).to eq({'user_id' => u.global_id, 'view_existence' => true})
    end
    
    it "should not allow a manager to supervise pending org-linked users" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
      u2 = User.create
      m = User.create
      
      expect(u.permissions_for(m)).to eq({'user_id' => m.global_id, 'view_existence' => true})
      expect(u2.permissions_for(m)).to eq({'user_id' => m.global_id, 'view_existence' => true})
      expect(m.permissions_for(u)).to eq({'user_id' => u.global_id, 'view_existence' => true})
      
      o.add_manager(m.user_name, true)
      u.reload
      m.reload
      expect(u.permissions_for(m)).to eq({'user_id' => m.global_id, 'view_existence' => true})
      expect(u2.permissions_for(m)).to eq({'user_id' => m.global_id, 'view_existence' => true})
      expect(m.permissions_for(u)).to eq({'user_id' => u.global_id, 'view_existence' => true})

      o.add_user(u.user_name, true)
      u.reload
      m.reload
      expect(u.permissions_for(m)).to eq({'user_id' => m.global_id, 'view_existence' => true})
      expect(u2.permissions_for(m)).to eq({'user_id' => m.global_id, 'view_existence' => true})
      expect(m.permissions_for(u)).to eq({'user_id' => u.global_id, 'view_existence' => true})
    end
    
    it "should not allow an assistant to supervisor org-linked users" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
      m = User.create
      
      expect(u.permissions_for(m)).to eq({'user_id' => m.global_id, 'view_existence' => true})
      expect(m.permissions_for(u)).to eq({'user_id' => u.global_id, 'view_existence' => true})
      
      o.add_manager(m.user_name, false)
      u.reload
      m.reload
      expect(u.permissions_for(m)).to eq({'user_id' => m.global_id, 'view_existence' => true})
      expect(m.permissions_for(u)).to eq({'user_id' => u.global_id, 'view_existence' => true})

      o.add_user(u.user_name, false)
      u.reload
      m.reload
      expect(u.permissions_for(m)).to eq({'user_id' => m.global_id, 'view_existence' => true})
      expect(m.permissions_for(u)).to eq({'user_id' => u.global_id, 'view_existence' => true})
    end
    
    it "should allow an admin to supervise any users" do
      o = Organization.create(:admin => true, :settings => {'total_licenses' => 1})
      u = User.create
      u2 = User.create
      m = User.create
      
      o.add_manager(m.user_name, true)
      m.reload
      o.add_user(u2.user_name, false)
      u2.reload
      
      expect(u.permissions_for(m)).to eq({'user_id' => m.global_id, 'view_existence' => true, 'link_auth' => true, 'view_detailed' => true, 'view_word_map' => true, 'supervise' => true, 'model' => true, 'manage_supervision' => true, 'support_actions' => true, 'admin_support_actions' => true, 'view_deleted_boards' => true, 'edit' => true, 'set_goals' => true})
      expect(u2.permissions_for(m)).to eq({'user_id' => m.global_id, 'view_existence' => true, 'link_auth' => true, 'view_detailed' => true, 'view_word_map' => true, 'supervise' => true, 'model' => true, 'manage_supervision' => true, 'support_actions' => true, 'admin_support_actions' => true, 'view_deleted_boards' => true, 'edit' => true, 'edit_boards' => true, 'set_goals' => true})
    end
    
    it "should not allow an admin assistant to supervise users" do
      o = Organization.create(:admin => true, :settings => {'total_licenses' => 1})
      u = User.create
      u2 = User.create
      m = User.create
      
      o.add_manager(m.user_name, false)
      m.reload
      o.add_user(u2.user_name, false)
      u2.reload
      
      expect(u.permissions_for(m)).to eq({'user_id' => m.global_id, 'view_existence' => true})
      expect(u2.permissions_for(m)).to eq({'user_id' => m.global_id, 'view_existence' => true})
    end
    
    it "should allow a manager to edit organization settings" do
      o = Organization.create
      m = User.create
      expect(o.permissions_for(m.reload)).to eq({'user_id' => m.global_id})

      o.add_manager(m.user_name, true)
      expect(o.permissions_for(m.reload)).to eq({'user_id' => m.global_id, 'view' => true, 'edit' => true, 'manage' => true})
    end
    
    it "should allow an assistant to edit organization settings" do
      o = Organization.create
      m = User.create
      expect(o.permissions_for(m)).to eq({'user_id' => m.global_id})

      o.add_manager(m.user_name, false)
      expect(o.permissions_for(m.reload)).to eq({'user_id' => m.global_id, 'view' => true, 'edit' => true})
    end
    
    it "should allow viewing for an organization that is set to public" do
      o = Organization.create
      expect(o.permissions_for(nil)).to eq({'user_id' => nil})
      
      o.settings['public'] = true
      o.updated_at = Time.now
      expect(o.permissions_for(nil)).to eq({'user_id' => nil, 'view' => true})
    end
    
    it "should allow supervisors to see the organization" do
      o = Organization.create
      s = User.create
      expect(o.permissions_for(s)).to eq({'user_id' => s.global_id})
      o.add_supervisor(s.user_name, false)
      Worker.process_queues
      expect(o.reload.supervisor?(s.reload)).to eq(true)
      expect(o.permissions_for(s)).to eq({'user_id' => s.global_id, 'view' => true})
    end
    
  end
  
  describe "manager_for?" do
    it "should not error on null values" do
      u = User.create
      expect(Organization.manager_for?(nil, nil)).to eq(false)
      expect(Organization.manager_for?(u, nil)).to eq(false)
      expect(Organization.manager_for?(nil, u)).to eq(false)
    end
    
    it "should return true for an org manager over the user's account" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
      m = User.create
      o.add_user(u.user_name, false)
      o.add_manager(m.user_name, true)
      u.reload
      m.reload
      
      expect(Organization.manager_for?(m, u)).to eq(true)
      expect(Organization.manager_for?(u, m)).to eq(false)
    end
    
    it "should return false for an org assistant over the user's account" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
      m = User.create
      o.add_user(u.user_name, false)
      o.add_manager(m.user_name, false)
      u.reload
      m.reload
      
      expect(Organization.manager_for?(m, u)).to eq(false)
      expect(Organization.manager_for?(u, m)).to eq(false)
    end
    
    it "should return false for an org manager over a different user's account" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      o2 = Organization.create
      u = User.create
      m = User.create
      o.add_user(u.user_name, false)
      o2.add_manager(m.user_name, true)
      u.reload
      m.reload
      
      expect(Organization.manager_for?(m, u)).to eq(false)
      expect(Organization.manager_for?(u, m)).to eq(false)
    end
    
    it "should return false for a user tied to no org" do
      o = Organization.create
      u = User.create
      m = User.create
      o.add_manager(m.user_name, true)
      u.reload
      m.reload
      
      expect(Organization.manager_for?(m, u)).to eq(false)
      expect(Organization.manager_for?(u, m)).to eq(false)
    end
    
    it "should return false for a manager tied to no org" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
      m = User.create
      o.add_user(u.user_name, false)
      u.reload
      m.reload
      
      expect(Organization.manager_for?(m, u)).to eq(false)
      expect(Organization.manager_for?(u, m)).to eq(false)
    end
    
    it "should return true for an admin" do
      o = Organization.create(:admin => true, :settings => {'total_licenses' => 1})
      u = User.create
      u2 = User.create
      m = User.create
      o.add_user(u.user_name, false)
      o.add_manager(m.user_name, true)
      u.reload
      m.reload
      
      expect(Organization.manager_for?(m, u)).to eq(true)
      expect(Organization.manager_for?(m, u2)).to eq(true)
      expect(Organization.manager_for?(u, m)).to eq(false)
      expect(Organization.manager_for?(u2, m)).to eq(false)
    end
    
    it "should return true for an upstream manager" do
      o1 = Organization.create(settings: {'total_licenses' => 1})
      o2 = Organization.create(settings: {'total_licenses' => 1}, parent_organization_id: o1.id)
      o3 = Organization.create(settings: {'total_licenses' => 1})
      u1 = User.create
      u2 = User.create
      u3 = User.create
      u4 = User.create
      o1.add_manager(u1.user_name, true)
      o1.add_user(u3.user_name, false)
      o2.add_user(u2.user_name, false)
      o3.add_user(u4.user_name, false)
      u1.reload
      u2.reload
      u3.reload
      u4.reload
      expect(Organization.manager_for?(u1, u2)).to eq(true)
      expect(Organization.manager_for?(u1, u3)).to eq(true)
      expect(Organization.manager_for?(u1, u4)).to eq(false)
    end
    
    it "should return true for multi-level upstream manager" do
      o1 = Organization.create(settings: {'total_licenses' => 1})
      o2 = Organization.create(settings: {'total_licenses' => 1}, parent_organization_id: o1.id)
      o3 = Organization.create(settings: {'total_licenses' => 1}, parent_organization_id: o2.id)
      u1 = User.create
      u2 = User.create
      u3 = User.create
      u4 = User.create
      o1.add_manager(u1.user_name, true)
      o1.add_user(u3.user_name, false)
      o2.add_user(u2.user_name, false)
      o3.add_user(u4.user_name, false)
      u1.reload
      u2.reload
      u3.reload
      u4.reload
      expect(Organization.manager_for?(u1, u2)).to eq(true)
      expect(Organization.manager_for?(u1, u3)).to eq(true)
      expect(Organization.manager_for?(u1, u4)).to eq(true)
    end
  end
  
  describe "permissions cache" do
    it "should invalidate the cache when a manager is added" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
      u2 = User.create
      Organization.where(:id => o.id).update_all(:updated_at => 2.weeks.ago)
      expect(o.reload.updated_at).to be < 1.hour.ago
      o.add_user(u.user_name, false)
      expect(o.reload.updated_at).to be > 1.hour.ago
      Organization.where(:id => o.id).update_all(:updated_at => 2.weeks.ago)
      expect(o.reload.updated_at).to be < 1.hour.ago
      o.add_manager(u2.user_name)
      expect(o.reload.updated_at).to be > 1.hour.ago
    end
    
    it "should invalidate the cache when a manager is removed" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
      u2 = User.create
      o.add_user(u.user_name, false)
      o.add_manager(u2.user_name)
      Organization.where(:id => o.id).update_all(:updated_at => 2.weeks.ago)
      expect(o.reload.updated_at).to be < 1.hour.ago
      o.remove_user(u.user_name)
      expect(o.reload.updated_at).to be > 1.hour.ago
      Organization.where(:id => o.id).update_all(:updated_at => 2.weeks.ago)
      expect(o.reload.updated_at).to be < 1.hour.ago
      o.remove_manager(u2.user_name)
      expect(o.reload.updated_at).to be > 1.hour.ago
    end
  end
  
  describe "process" do
    it "should allow updating allotted_licenses" do
      o = Organization.create
      o.process({
        :allotted_licenses => 5
      }, {'updater' => User.create})
      expect(o.settings['total_licenses']).to eq(5)
    end
    
    it "should error gracefully if allotted_licenses is decreased to fewer than are already used" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
      o.add_user(u.user_name, false, true)
      expect(o.reload.sponsored_users.count).to eq(1)
      res = o.process({:allotted_licenses => 0}, {'updater' => u})
      expect(res).to eq(false)
      expect(o.processing_errors).to eq(["too few licenses, remove some users first"])
    end
    
    it "should handle management actions without overwriting changes in a subsequent save" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
      res = o.process({
        :management_action => "add_user-#{u.user_name}"
      }, {'updater' => User.create})
      expect(res).to eq(true)
      expect(o.users.length).to eq(1)
      u.reload
      expect(o.attached_users('user').length).to eq(1)
      expect(o.attached_users('approved_user').length).to eq(0)
      expect(o.attached_users('sponsored_user').length).to eq(1)
      links = UserLink.links_for(u)
      expect(links).to eq([{
        'user_id' => u.global_id,
        'record_code' => Webhook.get_record_code(o),
        'type' => 'org_user',
        'state' => {
          'sponsored' => true, 
          'pending' => true,
          'eval' => false,
          'added' => links[0]['state']['added']
        }
      }])
      expect(links[0]['state']['added']).to_not eq(nil)
    end

    # plus_extras = params[:management_action].match(/-plus_extras/)
    # action, key = params[:management_action].sub(/-plus_extras/, '').split(/-/, 2)
    # plus_error = nil
    # begin
    #   new_user = nil
    #   if action == 'add_user'
    #     @assignment_action = params[:assignment_action]
    #     new_user = self.add_user(key, true, true, false)
    #   elsif action == 'add_unsponsored_user' || action == 'add_external_user'
    #     @assignment_action = params[:assignment_action]
    #     new_user = self.add_user(key, true, false, false)
    #   elsif action == 'add_eval'
    #     new_user = self.add_user(key, true, true, true)
    #   elsif action == 'add_supervisor'
    #     self.add_supervisor(key, true)
    #   elsif action == 'add_premium_supervisor'
    #     self.add_supervisor(key, true, true)
    #   elsif action == 'add_assistant' || action == 'add_manager'
    #     self.add_manager(key, action == 'add_manager')
    #   elsif action == 'add_extras'
    #     self.add_extras_to_user(key)
    #   elsif action == 'remove_user'
    #     self.remove_user(key)
    #   elsif action == 'remove_supervisor'
    #     self.remove_supervisor(key)
    #   elsif action == 'remove_assistant' || action == 'remove_manager'
    #     self.remove_manager(key)
    #   elsif action == 'remove_extras'
    #     self.remove_extras_from_user(key)
    #   end

    #   if plus_extras
    #     begin
    #       self.reload.add_extras_to_user(key)
    #     rescue => e
    #       plus_error = e
    #     end
    #   end

    #   if @assignment_action && new_user
    #     # Organizations can define a default home board for their users
    #     if !new_user.settings['preferences']['home_board'] && !new_user.settings['external_device']
    #       type, key, symbols = @assignment_action.split(/:/)
    #       if type == 'copy_board' && (self.home_board_keys || []).include?(key)
    #         home_board = Board.find_by_path(key)
    #         new_user.process_home_board({'id' => home_board.global_id, 'copy' => true, 'symbol_library' => symbols}, {'updater' => home_board.user, 'org' => self, 'async' => true}) if home_board
    #       end
    #     elsif self.settings['default_home_board'] && !new_user.settings['preferences']['home_board'] && !new_user.settings['external_device']
    #       # TODO: legacy code that can be removed Jan 2023
    #       home_board = Board.find_by_path(self.settings['default_home_board']['id'])
    #       new_user.process_home_board({'id' => home_board.global_id}, {'updater' => home_board.user, 'async' => true}) if home_board
    #     end
    #   end

    it "should not allow setting a home board not in the org's list" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
      u2 = User.create
      b = Board.create(user: u2)
      expect(o).to receive(:add_user).with(u.user_name, true, true, false).and_return(u)
      expect(u).to_not receive(:process_home_board)
      res = o.process({
        :management_action => "add_user-#{u.user_name}",
        :assignment_action => "copy_board:board_key:lessonpix"
      }, {'updater' => User.create})
      expect(res).to eq(true)
    end

    it "should pass assignment_action with management_action for adding users" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
      u2 = User.create
      b = Board.create(user: u2)
      o.settings['default_home_boards'] = [{'id' => b.global_id, 'key' => b.key}]
      o.save
      expect(o).to receive(:add_user).with(u.user_name, true, true, false).and_return(u)
      expect(u).to_not receive(:process_home_board).with({'id' => b.global_id, 'copy' => true, 'symbol_library' => 'lessonpix'}, {'updater' => b.user, 'org' => o, 'async' => true})
      res = o.process({
        :management_action => "add_user-#{u.user_name}",
        :assignment_action => "copy_board:board_key:lessonpix"
      }, {'updater' => User.create})
      expect(res).to eq(true)
    end

    it "should add premium symbols after adding a user if specified" do
      o = Organization.create(:settings => {'total_licenses' => 1, 'total_extras' => 1})
      u = User.create
      u2 = User.create
      b = Board.create(user: u2)
      o.settings['default_home_boards'] = [{'id' => b.global_id, 'key' => b.key}]
      o.save
      res = o.process({
        :management_action => "add_user-plus_extras-#{u.user_name}",
        :assignment_action => "copy_board:board_key:lessonpix"
      }, {'updater' => User.create})
      expect(res).to eq(true)
    end

    it "should return extras-add error after adding user if it happens" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
      u2 = User.create
      b = Board.create(user: u2)
      o.settings['default_home_boards'] = [{'id' => b.global_id, 'key' => b.key}]
      o.save
      res = o.process({
        :management_action => "add_user-plus_extras-#{u.user_name}",
        :assignment_action => "copy_board:board_key:lessonpix"
      }, {'updater' => User.create})
      expect(res).to eq(false)
      expect(o.processing_errors).to eq(["user management extras action failed: no extras available"])
    end

    it "should process premium supporters" do
      o = Organization.create(:settings => {'total_supervisor_licenses' => 1})
      u = User.create
      res = o.process({
        :management_action => "add_premium_supervisor-#{u.user_name}"
      }, {'updater' => User.create})
      expect(res).to eq(true)
      expect(o.users.length).to eq(0)
      expect(o.supervisors.length).to eq(1)
      u.reload
      expect(o.attached_users('user').length).to eq(0)
      expect(o.attached_users('approved_user').length).to eq(0)
      expect(o.attached_users('sponsored_user').length).to eq(0)
      expect(o.attached_users('supervisor').length).to eq(1)
      expect(o.attached_users('premium_supervisor').length).to eq(1)
      
      links = UserLink.links_for(u)
      expect(links).to eq([{
        'user_id' => u.global_id,
        'record_code' => Webhook.get_record_code(o),
        'type' => 'org_supervisor',
        'state' => {
          'premium' => true, 
          'pending' => true,
          'added' => links[0]['state']['added']
        }
      }])
      expect(links[0]['state']['added']).to_not eq(nil)
    end

    it "should allow setting a public home board" do
      u = User.create
      b = Board.create(user: u, public: true)
      o = Organization.create
      o.process({:home_board_key => b.key}, {updater: u})
      expect(o.settings['default_home_boards']).to eq([{'key' => b.key, 'id' => b.global_id}])
    end
    
    it "should not allow setting a private home board" do
      u = User.create
      b = Board.create(user: u)
      o = Organization.create
      o.process({:home_board_keys => [b.key]}, {updater: u})
      expect(o.settings['default_home_boards']).to eq(nil)
    end
    
    it "should allow setting a private home board if owned by a manager" do
      u = User.create
      b = Board.create(user: u)
      o = Organization.create
      o.add_manager(u.user_name, true)
      o.process({:home_board_keys => [b.key]}, {updater: u})
      expect(o.settings['default_home_boards']).to eq([{'key' => b.key, 'id' => b.global_id}])
    end
    
    it "should allow setting a private home board if owned by a supervisor" do
      u = User.create
      b = Board.create(user: u)
      o = Organization.create
      o.add_supervisor(u.user_name, false)
      o.process({:home_board_key => b.key}, {updater: u})
      expect(o.settings['default_home_boards']).to eq([{'key' => b.key, 'id' => b.global_id}])
    end

    it "should parse hosting settings" do
      u = User.create
      o = Organization.create
      o.add_manager(u.user_name, true)
      o.process({
        :host_settings => {
          'a' => 1,
          'logo_url' => 'https://www.example.com/logo.png',
          'admin_email' => '',
          'twitter_handle' => '@lingolinq'
        }
      }, {'updater' => u})
      expect(o.settings['host_settings']).to eq({'css' => nil, 'app_name' => 'LingoLinq', 'company_name' => 'LingoLinq', 'logo_url' => 'https://www.example.com/logo.png', 'twitter_handle' => 'lingolinq'})
      o.process({
        :host_settings => {
          'b' => 1,
          'logo_url' => '',
          'admin_email' => 'admin@example.com'
        }
      }, {'updater' => u})
      expect(o.settings['host_settings']).to eq({'css' => nil, 'app_name' => 'LingoLinq', 'company_name' => 'LingoLinq', 'admin_email' => 'admin@example.com', 'twitter_handle' => 'lingolinq'})
    end

    it "should log an event when updating extras count" do
      u = User.create
      o = Organization.create
      o.add_manager(u.user_name, true)
      o.process({
        'allotted_extras' => 7
      }, {'updater' => u})
      expect(o.settings['total_extras']).to eq(7)
      expect(o.settings['purchase_events'].length).to eq(1)
      expect(o.settings['purchase_events'][0]['type']).to eq('update_extras_count')
    end

    it "should allow adding extras to a user" do
      u = User.create
      u.settings['extras_disabled'] = true
      u.save
      expect(u.reload.subscription_hash['extras_enabled']).to eq(nil)
      o = Organization.create
      o.settings['total_extras'] = 10
      o.add_manager(u.user_name, true)
      o.process({
        'management_action' => "add_extras-#{u.user_name}"
      }, 'updater' => u)
      u.reload
      expect(u.reload.subscription_hash['extras_enabled']).to eq(true)
    end

    it "should allow removing extras from a user" do
      u = User.create
      o = Organization.create
      o.settings['total_extras'] = 10
      o.add_supervisor(u.user_name, false)
      o.process({
        'management_action' => "add_extras-#{u.user_name}"
      }, 'updater' => u)
      u.reload
      expect(u.settings['subscription']).to_not eq(true)
      expect(u.settings['subscription']['extras']).to_not eq(nil)
      expect(u.settings['subscription']['extras']['enabled']).to eq(true)
      expect(u.settings['subscription']['extras']['source']).to eq('org_added')
      expect(u.settings['subscription']['extras']['org_id']).to eq(o.global_id)
      o.reload
      o.process({
        'management_action' => "remove_extras-#{u.user_name}"
      }, 'updater' => u)
      expect(u.reload.settings['subscription']['extras']['enabled']).to eq(false)
    end

    it "should set profile preferences" do
      u = User.create
      o = Organization.create
      o.add_supervisor(u.user_name, false)
      o.process({
        'communicator_profile_id' => 'cole',
        'communicator_profile_frequency' => 3,
        'supervisor_profile_id' => 'default',
        'supervisor_profile_frequency' => 500,
      }, 'updater' => u)

      expect(o.settings['communicator_profile']).to eq({
        'profile_id' => 'cole',
        'frequency' => 7889238.0,
        'template_id' => nil
      })
      expect(o.settings['supervisor_profile']).to eq({
        'profile_id' => 'default',
        'frequency' => 500,
      })
      o.process({
        'communicator_profile_id' => 'whatever',
        'communicator_profile_frequency' => 3,
        'supervisor_profile_id' => 'none',
        'supervisor_profile_frequency' => 500,
      }, 'updater' => u)
      expect(o.processing_errors).to eq(["communicator_profile_id is not valid"])
      o = Organization.find(o.id)
      o.process({
        'communicator_profile_id' => 'none',
        'communicator_profile_frequency' => 3,
        'supervisor_profile_id' => 'none',
        'supervisor_profile_frequency' => 500,
      }, 'updater' => u)
      expect(o.processing_errors).to eq([])
      expect(o.settings['communicator_profile']).to eq(nil)
      expect(o.settings['supervisor_profile']).to eq(nil)
    end   
    
    it "should not allow setting profile_id to a private template that isn't attached to the org" do
      u = User.create
      o = Organization.create
      pt = ProfileTemplate.create
      o.add_supervisor(u.user_name, false)
      o.process({
        'communicator_profile_id' => pt.global_id,
        'communicator_profile_frequency' => 3,
        'supervisor_profile_id' => 'default',
        'supervisor_profile_frequency' => 500,
      }, 'updater' => u)
      expect(o.processing_errors).to eq(["communicator_profile_id not authorized for this organization"])
    end

    it "should allow setting profile_id to a private template attached to the org" do
      u = User.create
      o = Organization.create
      pt = ProfileTemplate.create(organization: o)
      o.add_supervisor(u.user_name, false)
      o.process({
        'communicator_profile_id' => pt.global_id,
        'communicator_profile_frequency' => 3,
        'supervisor_profile_id' => 'default',
        'supervisor_profile_frequency' => 500,
      }, 'updater' => u)
      expect(o.processing_errors).to eq([])
      expect(o.settings['communicator_profile']).to eq({
        'frequency' => 7889238.0,
        'profile_id' => pt.global_id,
        'template_id' => pt.global_id
      })
    end

    it "should schedule :assert_profile only when changes are made" do
      u = User.create
      o = Organization.create
      pt = ProfileTemplate.create(organization: o)
      o.add_supervisor(u.user_name, false)
      expect(o).to receive(:schedule).with(:assert_profile, 'communicator_profile')
      expect(o).to receive(:schedule).with(:assert_profile, 'supervisor_profile')
      o.process({
        'communicator_profile_id' => pt.global_id,
        'communicator_profile_frequency' => 3,
        'supervisor_profile_id' => 'default',
        'supervisor_profile_frequency' => 500,
      }, 'updater' => u)
      expect(o.processing_errors).to eq([])
      expect(o.settings['communicator_profile']).to eq({
        'frequency' => 7889238.0,
        'profile_id' => pt.global_id,
        'template_id' => pt.global_id
      })      

      o = Organization.find(o.id)
      expect(o).to_not receive(:schedule)
      o.process({
        'communicator_profile_id' => pt.global_id,
        'communicator_profile_frequency' => 7889238.0,
        'supervisor_profile_id' => 'default',
        'supervisor_profile_frequency' => 500,
      }, 'updater' => u)
    end
  end
  
  describe "log_sessions" do
    it "should return sessions only for attached org users" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
      d = Device.create(:user => u)
      u2 = User.create
      d2 = Device.create(:user => u2)
      o.add_user(u.user_name, false)
      LogSession.process_new({
        :events => [
          {'timestamp' => 4.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 3.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => u, :device => d, :author => u})
      LogSession.process_new({
        :events => [
          {'timestamp' => 4.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 3.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => u2, :device => d2, :author => u2})
      expect(o.reload.log_sessions.count).to eq(1)
    end
    
    it "should return all sessions for the admin org" do
      o = Organization.create(:admin => true, :settings => {'total_licenses' => 1})
      u = User.create
      d = Device.create(:user => u)
      u2 = User.create
      d2 = Device.create(:user => u2)
      o.add_user(u.user_name, false)
      LogSession.process_new({
        :events => [
          {'timestamp' => 4.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 3.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => u, :device => d, :author => u})
      LogSession.process_new({
        :events => [
          {'timestamp' => 4.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 3.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => u2, :device => d2, :author => u2})
      expect(o.reload.log_sessions.count).to eq(2)
    end
  end
  
  describe "process" do
    it "should log an event if the total licenses has changed" do
      o = Organization.create
      u = User.create
      o.process({'allotted_licenses' => 2}, {'updater' => u})
      expect(o.settings['purchase_events']).to_not eq(nil)
      expect(o.settings['purchase_events'].length).to eq(1)
      expect(o.settings['purchase_events'][0]['type']).to eq('update_license_count')
    end
    
    it "should not log an event if the total licenses is set to the same value" do
      o = Organization.create(:settings => {'total_licenses' => 2})
      u = User.create
      o.process({'allotted_licenses' => 2}, {'updater' => u})
      expect(o.settings['purchase_events']).to eq(nil)
    end
  end
  
  describe "subscription management" do
    it "should add a monitored subscription" do
      o = Organization.create
      u = User.create
      o.add_subscription(u.user_name)
      expect(o.reload.subscriptions).to eq([u])
    end
    
    it "should error when adding a subscription user that doesn't exist" do
      o = Organization.create
      expect { o.add_subscription('bacon') }.to raise_error("invalid user, bacon")
    end
    
    it "should log a purchase event when adding a subscription user" do
      o = Organization.create
      u = User.create
      o.add_subscription(u.user_name)
      expect(o.reload.subscriptions).to eq([u])
      expect(o.purchase_history).not_to eq(nil)
      expect(o.purchase_history.length).to eq(1)
      expect(o.purchase_history[0]['type']).to eq('add_subscription')
    end
    
    it "should remove a monitored subscription" do
      o = Organization.create
      u = User.create
      o.add_subscription(u.user_name)
      expect(o.reload.subscriptions).to eq([u])
      o.remove_subscription(u.user_name)
      expect(o.reload.subscriptions).to eq([])
    end
    
    it "should erorr when removing a subscription user that doesn't exist" do
      o = Organization.create
      expect { o.remove_subscription('bacon') }.to raise_error("invalid user, bacon")
    end
    
    it "should log a purchase event when removing a subscription user" do
      o = Organization.create
      u = User.create
      o.add_subscription(u.user_name)
      expect(o.reload.subscriptions).to eq([u])
      o.remove_subscription(u.user_name)
      expect(o.reload.subscriptions).to eq([])
      expect(o.purchase_history).not_to eq(nil)
      expect(o.purchase_history.length).to eq(2)
      expect(o.purchase_history[1]['type']).to eq('add_subscription')
      expect(o.purchase_history[0]['type']).to eq('remove_subscription')
    end
    
    it "should return a list of purchase events" do
      o = Organization.create
      u = User.create
      o.add_subscription(u.user_name)
      expect(o.reload.subscriptions).to eq([u])
      o.remove_subscription(u.user_name)
      expect(o.reload.subscriptions).to eq([])
      expect(o.purchase_history).not_to eq(nil)
      expect(o.purchase_history.length).to eq(2)
      expect(o.purchase_history[1]['type']).to eq('add_subscription')
      expect(o.purchase_history[0]['type']).to eq('remove_subscription')
    end
    
    it "should log the specified purchase event" do
      o = Organization.create
      o.log_purchase_event({'asdf' => 1})
      o.log_purchase_event({'jkl' => 1})
      expect(o.settings['purchase_events']).to_not eq(nil)
      expect(o.settings['purchase_events'].length).to eq(2)
      es = o.settings['purchase_events'].sort_by{|e| e['asdf'] || 0 }
      expect(es[1]['asdf']).to eq(1)
      expect(Time.parse(es[1]['logged_at'])).to be > (Time.now - 10)
      expect(Time.parse(es[1]['logged_at'])).to be < (Time.now + 10)
      expect(es[0]['jkl']).to eq(1)
      expect(Time.parse(es[0]['logged_at'])).to be > (Time.now - 10)
      expect(Time.parse(es[0]['logged_at'])).to be < (Time.now + 10)
    end
    
    it "should return a list of subscription users" do
      o = Organization.create
      u1 = User.create
      u2 = User.create
      o.add_subscription(u1.user_name)
      expect(o.reload.subscriptions).to eq([u1])
      o.add_subscription(u2.user_name)
      expect(o.reload.subscriptions.sort_by(&:id)).to eq([u1, u2])
    end
  end
  
  describe "new user management" do
    it "should add a user" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
    
      res = o.add_user(u.user_name, true)
      expect(!!res).to eq(true)
      expect(o.reload.users.count).to eq(1)
    
      u.reload
      expect(u.org_sponsored?).to eq(true)
      expect(u.org_sponsored?).to eq(true)
      expect(o.managed_user?(u)).to eq(true)
    end
  
    it "should remove a user" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
    
      res = o.add_user(u.user_name, true)
      expect(!!res).to eq(true)
      expect(o.reload.users.count).to eq(1)
      expect(o.pending_user?(u.reload)).to eq(true)
      expect(o.managed_user?(u)).to eq(true)
    
      o.remove_user(u.user_name)
      expect(o.reload.users.count).to eq(0)
    end
  
    it "should add an unsponsored user" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
    
      res = o.add_user(u.user_name, false, false)
      expect(!!res).to eq(true)
      expect(o.reload.users.count).to eq(1)
      expect(o.managed_user?(u.reload)).to eq(true)
      expect(o.pending_user?(u)).to eq(false)
      expect(o.sponsored_user?(u)).to eq(false)
    end
  
    it "should add a manager" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
    
      res = o.add_manager(u.user_name, true)
      expect(res).to eq(true)
      expect(o.reload.managers.count).to eq(1)

      expect(o.manager?(u.reload)).to eq(true)
      expect(o.manager?(u)).to eq(true)
    end
  
    it "should add an assistant" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
    
      res = o.add_manager(u.user_name, false)
      expect(res).to eq(true)
      expect(o.reload.managers.count).to eq(1)
    end

    it "should remove a manager" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
    
      res = o.add_manager(u.user_name, true)
      expect(res).to eq(true)
      expect(o.reload.managers.count).to eq(1)
      expect(o.manager?(u.reload)).to eq(true)

      o.remove_manager(u.user_name)
      expect(o.reload.managers.count).to eq(0)
    end
  
    it "should add a supervisor" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
    
      res = o.add_supervisor(u.user_name)
      expect(res).to eq(true)
      expect(o.reload.supervisors.count).to eq(1)
      expect(o.supervisor?(u.reload)).to eq(true)
    end
  
    it "should remove a supervisor" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
    
      res = o.add_supervisor(u.user_name)
      expect(res).to eq(true)
      expect(o.reload.supervisors.count).to eq(1)
    
      o.remove_supervisor(u.user_name)
      expect(o.reload.supervisors.count).to eq(0)
    end
  end
  
  describe "usage_stats" do
    it "should return expected values" do
      @user = User.create
      user = User.create
      d = Device.create(:user => user)
      o = Organization.create
      o.add_manager(@user.user_name, false)
      o.add_user(user.user_name, true, false)
      expect(o.reload.approved_users.length).to eq(0)
      json = Organization.usage_stats([])
      expect(json).to eq({
        'weeks' => [], 
        'user_counts' => {'goal_set' => 0, 'goal_recently_logged' => 0, 'modeled_word_counts' => [], 'recent_session_count' => 0, 'recent_session_user_count' => 0, 'total_users' => 0, 'recent_session_seconds' => 0.0, 'recent_session_hours' => 0.0, "total_models"=>0, "total_seconds"=>0, "total_sessions"=>0, "total_user_weeks"=>0, "total_words"=>0, "word_counts"=>[]}
      })
      
      LogSession.process_new({
        :events => [
          {'timestamp' => 64.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 3.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => user, :device => d, :author => user})
      LogSession.process_new({
        :events => [
          {'timestamp' => 1.weeks.ago.to_i + 200, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 1.weeks.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => user, :device => d, :author => user})
      LogSession.process_new({
        :events => [
          {'timestamp' => 4.weeks.ago.to_i + 200, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 4.weeks.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => user, :device => d, :author => user})
      Worker.process_queues
      expect(o.reload.approved_users.length).to eq(0)
      
      o.add_user(user.user_name, false, false)
      expect(o.reload.approved_users.length).to eq(1)
      json = Organization.usage_stats([user])
      expect(json['weeks'].length).to eq(3)
      expect(json['weeks'][0]['sessions']).to eq(1)
      expect(json['weeks'][0]['session_seconds']).to eq(200.0)
      expect(json['weeks'][0]['timestamp']).to be > 0
      expect(json['weeks'][1]['sessions']).to eq(1)
      expect(json['weeks'][1]['timestamp']).to be > 0
      expect(json['weeks'][1]['session_seconds']).to eq(200.0)
      expect(json['weeks'][2]['sessions']).to eq(1)
      expect(json['weeks'][2]['timestamp']).to be > 0
      expect(json['weeks'][2]['session_seconds']).to eq(61.0)
      expect(json['user_counts']).to eq({
        "goal_set"=>0, 
        "goal_recently_logged"=>0, 
        "modeled_word_counts" => [],
        "total_models" => 0,
        "total_seconds" => 461.0,
        "total_sessions" => 3,
        "total_user_weeks" => 3,
        "total_words" => 0,
        "word_counts" => [],
        "recent_session_count"=>2, 
        "recent_session_user_count"=>1, 
        'recent_session_seconds' => 261.0,
        'recent_session_hours' => 0.07,
        "total_users"=>1
      })
    end
  end
  
  describe "parent orgs" do
    describe "touch_parent" do
      it "should update the parent" do
        o = Organization.create
        Organization.where(id: o.id).update_all(updated_at: 2.weeks.ago)
        o.reload
        expect(o.parent_organization_id).to eq(nil)
        expect(o.has_children?).to eq(false)
        updated = o.updated_at
        o2 = Organization.create(parent_organization_id: o.id)
        expect(o.reload.updated_at).to be > updated
        expect(o.reload.has_children?).to eq(true)
      end
    end
  
    describe "has_children?" do
      it "should return the correct value" do
        o = Organization.create
        Organization.where(id: o.id).update_all(updated_at: 2.weeks.ago)
        o.reload
        expect(o.parent_organization_id).to eq(nil)
        expect(o.has_children?).to eq(false)
        updated = o.updated_at
        o2 = Organization.create(parent_organization_id: o.id)
        expect(o.reload.updated_at).to be > updated
        expect(o.reload.has_children?).to eq(true)
        expect(o2.reload.has_children?).to eq(false)
      end
    
      it "should use the cached value if available" do
        o = Organization.create
        Organization.where(id: o.id).update_all(updated_at: 2.weeks.ago)
        o.reload
        expect(o.parent_organization_id).to eq(nil)
        expect(o.has_children?).to eq(false)
        expect(Organization).to_not receive(:where)
        expect(o.has_children?).to eq(false)
      end
    end

    describe "upstream_orgs" do
      it "should collect all upstream orgs" do
        o1 = Organization.create
        o2 = Organization.create(parent_organization_id: o1.id)
        o3 = Organization.create(parent_organization_id: o2.id)
        o4 = Organization.create(parent_organization_id: o3.id)
        o5 = Organization.create(parent_organization_id: o3.id)
        expect(o1.upstream_orgs.length).to eq(0)
        expect(o2.upstream_orgs.length).to eq(1)
        expect(o2.upstream_orgs.sort_by(&:id)).to eq([o1])
        expect(o3.upstream_orgs.length).to eq(2)
        expect(o3.upstream_orgs.sort_by(&:id)).to eq([o1, o2])
        expect(o4.upstream_orgs.length).to eq(3)
        expect(o4.upstream_orgs.sort_by(&:id)).to eq([o1, o2, o3])
        expect(o5.upstream_orgs.length).to eq(3)
        expect(o5.upstream_orgs.sort_by(&:id)).to eq([o1, o2, o3])
      end
      
      it "should not barf on loops" do
        o1 = Organization.create
        o2 = Organization.create(parent_organization_id: o1.id)
        o1.parent_organization_id = o2.id
        o1.save
        expect(o1.upstream_orgs).to eq([o2])
        expect(o2.upstream_orgs).to eq([o1])
      end
    end  

    describe "children_orgs" do
      it "should collect all downstream orgs" do
        o1 = Organization.create
        o2 = Organization.create(parent_organization_id: o1.id)
        o3 = Organization.create(parent_organization_id: o2.id)
        o4 = Organization.create(parent_organization_id: o3.id)
        o5 = Organization.create(parent_organization_id: o2.id)
        o6 = Organization.create(parent_organization_id: o2.id)
        o7 = Organization.create(parent_organization_id: o6.id)
        o8 = Organization.create
        o1.reload
        o2.reload
        o3.reload
        o4.reload
        o5.reload
        o6.reload
        expect(o1.has_children?).to eq(true)
        expect(o2.has_children?).to eq(true)
        expect(o3.has_children?).to eq(true)
        expect(o4.has_children?).to eq(false)
        expect(o5.has_children?).to eq(false)
        expect(o6.has_children?).to eq(true)
        expect(o7.has_children?).to eq(false)
        expect(o8.has_children?).to eq(false)
        
        expect(o1.children_orgs.length).to eq(1)
        expect(o1.children_orgs.sort_by(&:id)).to eq([o2])
        expect(o2.children_orgs.length).to eq(3)
        expect(o2.children_orgs.sort_by(&:id)).to eq([o3, o5, o6])
        expect(o3.children_orgs.length).to eq(1)
        expect(o3.children_orgs.sort_by(&:id)).to eq([o4])
        expect(o4.children_orgs.length).to eq(0)
        expect(o5.children_orgs.length).to eq(0)
        expect(o6.children_orgs.length).to eq(1)
        expect(o6.children_orgs.sort_by(&:id)).to eq([o7])
        expect(o7.children_orgs.length).to eq(0)
        expect(o8.children_orgs.length).to eq(0)
      end
    end
  
  
    describe "downstream_orgs" do
      it "should collect all downstream orgs" do
        o1 = Organization.create
        o2 = Organization.create(parent_organization_id: o1.id)
        o3 = Organization.create(parent_organization_id: o2.id)
        o4 = Organization.create(parent_organization_id: o3.id)
        o5 = Organization.create(parent_organization_id: o2.id)
        o6 = Organization.create(parent_organization_id: o2.id)
        o7 = Organization.create(parent_organization_id: o6.id)
        o8 = Organization.create
        o1.reload
        o2.reload
        o3.reload
        o4.reload
        o5.reload
        o6.reload
        expect(o1.has_children?).to eq(true)
        expect(o2.has_children?).to eq(true)
        expect(o3.has_children?).to eq(true)
        expect(o4.has_children?).to eq(false)
        expect(o5.has_children?).to eq(false)
        expect(o6.has_children?).to eq(true)
        expect(o7.has_children?).to eq(false)
        expect(o8.has_children?).to eq(false)
        
        expect(o1.downstream_orgs.length).to eq(6)
        expect(o1.downstream_orgs.sort_by(&:id)).to eq([o2, o3, o4, o5, o6, o7])
        expect(o2.downstream_orgs.length).to eq(5)
        expect(o2.downstream_orgs.sort_by(&:id)).to eq([o3, o4, o5, o6, o7])
        expect(o3.downstream_orgs.length).to eq(1)
        expect(o3.downstream_orgs.sort_by(&:id)).to eq([o4])
        expect(o4.downstream_orgs.length).to eq(0)
        expect(o5.downstream_orgs.length).to eq(0)
        expect(o6.downstream_orgs.length).to eq(1)
        expect(o6.downstream_orgs.sort_by(&:id)).to eq([o7])
        expect(o7.downstream_orgs.length).to eq(0)
        expect(o8.downstream_orgs.length).to eq(0)
      end
      
      it "should not barf on loops" do
        o1 = Organization.create
        o2 = Organization.create(parent_organization_id: o1.id)
        o3 = Organization.create(parent_organization_id: o2.id)
        o1.parent_organization_id = o3.id
        o1.save
        o1.reload
        o2.reload
        o3.reload

        expect(o1.has_children?).to eq(true)
        expect(o2.has_children?).to eq(true)
        expect(o3.has_children?).to eq(true)

        expect(o1.downstream_orgs.length).to eq(2)
        expect(o1.downstream_orgs.sort_by(&:id)).to eq([o2, o3])
        expect(o2.downstream_orgs.length).to eq(2)
        expect(o2.downstream_orgs.sort_by(&:id)).to eq([o1, o3])
        expect(o3.downstream_orgs.length).to eq(2)
        expect(o3.downstream_orgs.sort_by(&:id)).to eq([o1, o2])
      end
    end
  
    describe "parent_org_id" do
      it "should return the correct value" do
        o = Organization.create
        expect(o.parent_org_id).to eq(nil)
        o.parent_organization_id = 123
        expect(o.parent_org_id).to eq('1_123')
      end
    end
  
    describe "upstream_manager?" do
      it "should return the correct value" do
        o1 = Organization.create
        o2 = Organization.create
        u = User.create
        expect(o1.reload.manager?(u.reload)).to eq(false)
        expect(o1.reload.upstream_manager?(u.reload)).to eq(false)
        expect(o2.reload.manager?(u.reload)).to eq(false)
        expect(o2.reload.upstream_manager?(u.reload)).to eq(false)

        res = o1.add_manager(u.user_name, true)
        expect(res).to eq(true)
        expect(o1.reload.manager?(u.reload)).to eq(true)
        expect(o1.reload.upstream_manager?(u.reload)).to eq(false)
        expect(o2.reload.manager?(u.reload)).to eq(false)
        expect(o2.reload.upstream_manager?(u.reload)).to eq(false)
        o2.parent_organization_id = o1.id
        o2.save
        expect(o1.reload.manager?(u.reload)).to eq(true)
        expect(o1.reload.upstream_manager?(u.reload)).to eq(false)
        expect(o2.reload.manager?(u.reload)).to eq(false)
        expect(o2.reload.upstream_manager?(u.reload)).to eq(true)
      end
    end
  end

  describe "org_assertions" do
    it "should get scheduled when new user is added" do
      o = Organization.create(settings: {'total_licenses' => 5})
      u1 = User.create
      u1.settings['extras_disabled'] = true
      u1.save
      expect(u1.reload.subscription_hash['extras_enabled']).to eq(nil)
      expect(u1.reload.billing_state).to eq(:trialing_communicator)
      Worker.process_queues
      o.add_user(u1.user_name, false, true)
      expect(Worker.scheduled?(Organization, :perform_action, {id: o.id, method: 'org_assertions', arguments: [u1.global_id, 'user']})).to eq(true)
      Worker.process_queues
      expect(u1.reload.subscription_hash['extras_enabled']).to eq(nil)
      expect(u1.reload.billing_state).to eq(:org_sponsored_communicator)
    end

    it "should get scheduled on a new supervisor" do
      o = Organization.create(settings: {'total_licenses' => 5})
      u1 = User.create
      u1.settings['extras_disabled'] = true
      u1.save
      expect(u1.reload.subscription_hash['extras_enabled']).to eq(nil)
      expect(u1.reload.billing_state).to eq(:trialing_communicator)
      Worker.process_queues
      o.add_supervisor(u1.user_name, false)
      expect(Worker.scheduled?(Organization, :perform_action, {id: o.id, method: 'org_assertions', arguments: [u1.global_id, 'supervisor']})).to eq(true)
      Worker.process_queues
      expect(u1.reload.subscription_hash['extras_enabled']).to eq(nil)
      expect(u1.reload.billing_state).to eq(:org_supporter)
    end

    it "should get scheduled on a new admin" do
      o = Organization.create(settings: {'total_licenses' => 5})
      u1 = User.create
      u1.settings['extras_disabled'] = true
      u1.save
      expect(u1.reload.subscription_hash['extras_enabled']).to eq(nil)
      expect(u1.reload.billing_state).to eq(:trialing_communicator)
      Worker.process_queues
      o.add_manager(u1.user_name, true)
      expect(Worker.scheduled?(Organization, :perform_action, {id: o.id, method: 'org_assertions', arguments: [u1.global_id, 'manager']})).to eq(true)
      Worker.process_queues
      expect(u1.reload.subscription_hash['extras_enabled']).to eq(nil)
      expect(u1.reload.billing_state).to eq(:premium_supporter)
    end

    it "should not get scheduled for a pending user" do
      o = Organization.create(settings: {'total_licenses' => 5})
      u1 = User.create
      u1.settings['extras_disabled'] = true
      u1.save
      expect(u1.reload.subscription_hash['extras_enabled']).to eq(nil)
      expect(u1.reload.billing_state).to eq(:trialing_communicator)
      Worker.process_queues
      o.add_user(u1.user_name, true, true)
      expect(Worker.scheduled?(Organization, :perform_action, {id: o.id, method: 'org_assertions', arguments: [u1.global_id, 'user']})).to eq(true)
      Worker.process_queues
      expect(u1.reload.subscription_hash['extras_enabled']).to eq(nil)
      expect(u1.reload.billing_state).to eq(:org_sponsored_communicator)
    end

    it "should get scheduled when a pending user finally accepts" do
      o = Organization.create(settings: {'total_licenses' => 5})
      u1 = User.create
      u1.settings['extras_disabled'] = true
      u1.save
      expect(u1.reload.subscription_hash['extras_enabled']).to eq(nil)
      expect(u1.reload.billing_state).to eq(:trialing_communicator)
      Worker.process_queues
      o.add_user(u1.user_name, true, true)
      expect(Worker.scheduled?(Organization, :perform_action, {id: o.id, method: 'org_assertions', arguments: [u1.global_id, 'user']})).to eq(true)
      Worker.process_queues
      expect(u1.reload.subscription_hash['extras_enabled']).to eq(nil)
      expect(u1.reload.billing_state).to eq(:org_sponsored_communicator)

      u1.reload.process({'supervisor_key' => "approve-org"})
      expect(Worker.scheduled?(Organization, :perform_action, {id: o.id, method: 'org_assertions', arguments: [u1.global_id, 'user']})).to eq(true)
      Worker.process_queues
      expect(u1.reload.billing_state).to eq(:org_sponsored_communicator)
      expect(u1.reload.subscription_hash['extras_enabled']).to eq(nil)
    end

    it "should not get scheduled for a pending supervisor" do
      o = Organization.create(settings: {'total_licenses' => 5})
      u1 = User.create
      u1.settings['extras_disabled'] = true
      u1.save
      expect(u1.reload.subscription_hash['extras_enabled']).to eq(nil)
      expect(u1.reload.billing_state).to eq(:trialing_communicator)
      Worker.process_queues
      o.add_supervisor(u1.user_name, true)
      expect(Worker.scheduled?(Organization, :perform_action, {id: o.id, method: 'org_assertions', arguments: [u1.global_id, 'supervisor']})).to eq(true)
      Worker.process_queues
      expect(u1.reload.billing_state).to eq(:trialing_communicator)
      expect(u1.reload.subscription_hash['extras_enabled']).to eq(nil)

      o.approve_supervisor(u1)
      expect(Worker.scheduled?(Organization, :perform_action, {id: o.id, method: 'org_assertions', arguments: [u1.global_id, 'supervisor']})).to eq(true)
      Worker.process_queues
      expect(u1.reload.billing_state).to eq(:org_supporter)
      expect(u1.reload.subscription_hash['extras_enabled']).to eq(nil)
    end
  end

  describe "load_domains" do
    it 'should use the cached value if found' do
      RedisInit.default.set('domain_org_ids', {'a' => 1}.to_json)
      expect(Organization.load_domains).to eq({'a' => 1})
    end

    it 'should look up current orgs for a value' do
      o1 = Organization.create
      o1.settings['hosts'] = ['a.com']
      o1.settings['host_settings'] = {'app_name' => 'A'}
      o1.save
      o2 = Organization.create(custom_domain: true)
      o2.settings['hosts'] = ['b.com', 'c.com']
      o2.settings['host_settings'] = {'app_name' => 'B'}
      o2.save
      o3 = Organization.create(custom_domain: true)
      o3.settings['hosts'] = ['c.com', 'd.com']
      o3.settings['host_settings'] = {'app_name' => 'D'}
      o3.save
      expect(Organization.load_domains).to eq({
        'b.com' => {'app_name' => 'B', 'org_id' => o2.global_id},
        'c.com' => {'app_name' => 'B', 'org_id' => o2.global_id},
        'd.com' => {'app_name' => 'D', 'org_id' => o3.global_id}
      })
    end

    it 'should not use the cached valud if force=true' do
      RedisInit.default.set('domain_org_ids', {'a' => 1}.to_json)
      o1 = Organization.create
      o1.settings['hosts'] = ['a.com']
      o1.settings['host_settings'] = {'app_name' => 'A'}
      o1.save
      o2 = Organization.create(custom_domain: true)
      o2.settings['hosts'] = ['b.com', 'c.com']
      o2.settings['host_settings'] = {'app_name' => 'B'}
      o2.save
      o3 = Organization.create(custom_domain: true)
      o3.settings['hosts'] = ['c.com', 'd.com']
      o3.settings['host_settings'] = {'app_name' => 'D'}
      o3.save
      expect(Organization.load_domains).to eq({'a' => 1})
      expect(Organization.load_domains(true)).to eq({
        'b.com' => {'app_name' => 'B', 'org_id' => o2.global_id},
        'c.com' => {'app_name' => 'B', 'org_id' => o2.global_id},
        'd.com' => {'app_name' => 'D', 'org_id' => o3.global_id}
      })
    end

    it 'should cache the latest results' do
      o1 = Organization.create
      o1.settings['hosts'] = ['a.com']
      o1.settings['host_settings'] = {'app_name' => 'A'}
      o1.save
      o2 = Organization.create(custom_domain: true)
      o2.settings['hosts'] = ['b.com', 'c.com']
      o2.settings['host_settings'] = {'app_name' => 'B'}
      o2.save
      o3 = Organization.create(custom_domain: true)
      o3.settings['hosts'] = ['c.com', 'd.com']
      o3.settings['host_settings'] = {'app_name' => 'D'}
      o3.save
      expect(RedisInit.default).to receive(:setex) do |key, ts, str|
        expect(key).to eq('domain_org_ids')
        expect(ts).to be < (72.hours.from_now.to_i + 10)
        expect(ts).to be > (72.hours.from_now.to_i - 10)
        json = JSON.parse(str)
        expect(json).to eq({
          'b.com' => {'app_name' => 'B', 'org_id' => o2.global_id},
          'c.com' => {'app_name' => 'B', 'org_id' => o2.global_id},
          'd.com' => {'app_name' => 'D', 'org_id' => o3.global_id}
        })
      end
      expect(Organization.load_domains).to eq({
        'b.com' => {'app_name' => 'B', 'org_id' => o2.global_id},
        'c.com' => {'app_name' => 'B', 'org_id' => o2.global_id},
        'd.com' => {'app_name' => 'D', 'org_id' => o3.global_id}
      })
    end

    it 'should invalidate the cache when a custom org is updated' do
      RedisInit.default.set('domain_org_ids', {'a' => 1}.to_json)
      o3 = Organization.create(custom_domain: true)
      o3.settings['hosts'] = ['c.com', 'd.com']
      o3.settings['host_settings'] = {'app_name' => 'D'}
      o3.save
      expect(Organization.load_domains).to eq({'a' => 1})
      Worker.process_queues
      expect(Organization.load_domains).to eq({
        'c.com' => {'app_name' => 'D', 'org_id' => o3.global_id},
        'd.com' => {'app_name' => 'D', 'org_id' => o3.global_id}
      })
    end
  end

  describe "add_extras_to_user" do
    it "should error on invalid user key" do
      o = Organization.create
      expect { o.add_extras_to_user('bacon') }.to raise_error("invalid user, bacon")
    end

    it "should error if the user is not part of the org" do
      o = Organization.create
      u = User.create
      expect { o.add_extras_to_user(u.user_name) }.to raise_error("user not attached to org")
    end

    it "should error if no extras are available" do
      o = Organization.create
      u = User.create
      o.add_supervisor(u.user_name, false)
      expect { o.add_extras_to_user(u.user_name) }.to raise_error("no extras available")
    end

    it "should trigger the purchase with new_activation if an new activation" do
      o = Organization.create(settings: {'total_extras' => 5, 'total_licenses' => 5})
      u = User.create
      o.add_user(u.user_name, false)
      expect(User).to receive(:purchase_extras).with({
        'user_id' => u.global_id,
        'source' => 'org_added',
        'premium_symbols' => true,
        'org_id' => o.global_id,
        'new_activation' => true
      })
      o.reload
      o.add_extras_to_user(u.user_name)
      expect(o.reload.settings['activated_extras']).to eq(1)
    end

    it "should not trigger new activation if already activated" do
      o = Organization.create(settings: {'total_licenses' => 1, 'total_extras' => 5, 'activated_extras' => 5})
      u = User.create
      User.purchase_extras({'user_id' => u.global_id, 'source' => 'magic', 'premium_symbols' => true})
      o.add_user(u.user_name, false)
      expect(User).to receive(:purchase_extras).with({
        'user_id' => u.global_id,
        'premium_symbols' => true, 
        'source' => 'org_added',
        'org_id' => o.global_id,
        'new_activation' => false
      })
      o.reload
      o.add_extras_to_user(u.user_name)
      expect(o.reload.settings['activated_extras']).to eq(5)
    end

    it "should tally activated extras" do
      o = Organization.create(settings: {'total_licenses' => 1, 'total_extras' => 5})
      u = User.create
      o.add_user(u.user_name, false)
      expect(User).to receive(:purchase_extras).with({
        'user_id' => u.global_id,
        'source' => 'org_added',
        'premium_symbols' => true, 
        'org_id' => o.global_id,
        'new_activation' => true
      })
      o.reload
      o.add_extras_to_user(u.user_name)
      expect(o.reload.settings['activated_extras']).to eq(1)
    end
  end

  describe "remove_extras_from_user" do
    it "should return false for a user not attached to the org" do
      o = Organization.create
      expect(o.remove_extras_from_user('asdf')).to eq(false)
      u = User.create
      expect(o.remove_extras_from_user(u.user_name)).to eq(false)
      o.add_manager(u.user_name, false)
      expect(o.remove_extras_from_user(u.user_name)).to eq(false)
    end

    it "should return true for a removable user" do
      o = Organization.create
      u = User.create
      o.add_supervisor(u.user_name, false)
      expect(User).to receive(:deactivate_extras).with({
        'user_id' => u.global_id,
        'org_id' => o.global_id, 
        'ignore_errors' => true
      })
      expect(o.remove_extras_from_user(u.user_name)).to eq(true)
    end
  end

  describe "extras_users" do
    it "should return a list of all users with extras enabled by the org" do
      o = Organization.create
      o.settings['total_extras'] = 20
      o.settings['total_licenses'] = 20
      o.save
      users = []
      10.times do |i|
        u = User.create
        o.add_user(u.user_name, false)
        o.reload
        o.add_extras_to_user(u.user_name)
        o.reload
        users << u
      end
      Worker.process_queues
      o.reload
      expect(o.extras_users.sort_by(&:id)).to eq(users.sort_by(&:id))
    end
  end

  describe "saml" do
    describe "external_auth_shortcut" do
      # if params[:external_auth_shortcut]
      #   key = GoSecure.sha512(params[:external_auth_shortcut], 'external_auth_shortcut')
      #   current = Organization.find_by(:external_auth_shortcut, key)
      #   if !current || current.id == self.id
      #     self.settings['external_auth_shortcut'] = params[:external_auth_shortcut]
      #     self.external_auth_shortcut = key
      #   else
      #     add_processing_error("auth shortcut #{key} is already taken")
      #     return false
      #   end
      # end
      it "should not allow re-using an auth shortcut" do
        o = Organization.create
        u = User.create
        expect(o.external_auth_shortcut).to eq(nil)
        res = o.process({
          :external_auth_shortcut => 'bacon'
        }, {'updater' => u})
        expect(res).to eq(true)
        expect(o.external_auth_shortcut).to_not eq(nil)
        expect(o.settings['external_auth_shortcut']).to eq('bacon')

        o2 = Organization.create
        expect(o2.external_auth_shortcut).to eq(nil)
        res = o2.process({
          :external_auth_shortcut => 'bacon'
        }, {'updater' => u})
        expect(res).to eq(false)
        expect(o2.processing_errors).to eq(['auth shortcut bacon is already taken'])
        expect(o2.external_auth_shortcut).to eq(nil)
        expect(o2.settings['external_auth_shortcut']).to eq(nil)
      end

      it "should require a minimum length for an auth shortcut" do
        o2 = Organization.create
        u = User.create
        expect(o2.external_auth_shortcut).to eq(nil)
        res = o2.process({
          :external_auth_shortcut => 'bb'
        }, {'updater' => u})
        expect(res).to eq(false)
        expect(o2.processing_errors).to eq(['auth shortcut too short'])
        expect(o2.external_auth_shortcut).to eq(nil)
        expect(o2.settings['external_auth_shortcut']).to eq(nil)
      end
    end

    describe "find_by_saml_issuer" do
      it "should return nil by default" do
        expect(Organization.find_by_saml_issuer(nil)).to eq(nil)
        expect(Organization.find_by_saml_issuer('whatever')).to eq(nil)
      end

      it "should find org by auth key" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml'
        o.save
        expect(o.external_auth_key).to_not eq(nil)
        expect(o.settings['saml_metadata_url']).to eq('https://www.example.com/saml')
        u = User.create
        expect(o.external_auth_shortcut).to eq(nil)
        res = o.process({
          :external_auth_shortcut => 'bacon',
          :saml_metadata_url => 'https://www.example.com/saml'
        }, {'updater' => u})
        expect(res).to eq(true)
        expect(o.settings['saml_metadata_url']).to eq('https://www.example.com/saml')
        expect(o.external_auth_key).to_not eq(nil)
        expect(o.external_auth_shortcut).to_not eq(nil)
        expect(o.settings['external_auth_shortcut']).to eq('bacon')
        expect(Organization.find_by_saml_issuer("https://www.example.com/saml")).to eq(o)
      end

      it "should find org by auth shortcut" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml'
        o.save
        expect(o.external_auth_key).to_not eq(nil)
        u = User.create
        expect(o.external_auth_shortcut).to eq(nil)
        res = o.process({
          :external_auth_shortcut => 'bacon'
        }, {'updater' => u})
        expect(res).to eq(true)
        expect(o.external_auth_shortcut).to_not eq(nil)
        expect(o.settings['external_auth_shortcut']).to eq('bacon')
        expect(Organization.find_by_saml_issuer("bacon")).to eq(o)
      end
    end

    describe "find_saml_user" do
      it "should return nil by default" do
        o = Organization.create
        expect(o.find_saml_user(nil)).to eq(nil)
        expect(o.find_saml_user('nobody')).to eq(nil)
      end

      it "should return nil unless org is saml-congifured" do
        o = Organization.create!
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml'
        o.save
        expect(o.external_auth_key).to_not eq(nil)
        u1 = User.create!
        o.add_user(u1.user_name, false, false)
        o.reload
        expect(o.link_saml_user(u1, {:external_id => 'wgawgwag'})).to_not eq(false)
        o.settings['saml_metadata_url'] = nil
        o.save
        expect(o.external_auth_key).to eq(nil)
        expect(o.find_saml_user('wgawgwag')).to eq(nil)
      end

      it "should return nil for matching user not in the org" do
        o = Organization.create!
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml'
        o.save
        expect(o.external_auth_key).to_not eq(nil)
        u1 = User.create!
        o.add_user(u1.user_name, false, false)
        o.reload
        expect(o.link_saml_user(u1, {:external_id => 'wgawgwag'})).to_not eq(false)
        o.remove_user(u1.user_name)
        o.reload
        expect(o.find_saml_user('wgawgwag')).to eq(nil)
      end

      it "should return a valid communicator from the org" do
        o = Organization.create!
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml'
        o.save
        expect(o.external_auth_key).to_not eq(nil)
        u1 = User.create!
        o.add_user(u1.user_name, false, false)
        o.reload
        expect(o.link_saml_user(u1, {:external_id => 'wgawgwag'})).to_not eq(false)
        expect(o.find_saml_user('wgawgwag')).to eq(u1)
      end

      it "should not return a matching user if not state['org_id'] matching" do
        o = Organization.create!
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml'
        o.save
        expect(o.external_auth_key).to_not eq(nil)
        u1 = User.create!
        o.add_user(u1.user_name, false, false)
        o.reload

        o2 = Organization.create!
        o2.settings['saml_metadata_url'] = 'https://www.example.com/saml2'
        o2.save
        expect(o2.external_auth_key).to_not eq(nil)
        expect(o2.link_saml_user(u1, {:external_id => 'wgawgwag'})).to_not eq(false)
        expect(o.find_saml_user('wgawgwag')).to eq(nil)
      end

      it "should return a matching user if id not found but matched by email" do
        o = Organization.create!
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml'
        o.save
        expect(o.external_auth_key).to_not eq(nil)
        u1 = User.create!(settings: {'email' => 'me@example.com'})
        o.add_user(u1.user_name, false, false)
        o.reload
        expect(o.link_saml_user(u1, {:external_id => 'wgawgwag', :email => 'me@example.com'})).to_not eq(false)
        expect(o.find_saml_user('aaa', 'me@example.com')).to eq(u1)
      end

      it "should return a matching user prioritizing email over id" do
        o = Organization.create!
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml'
        o.save
        expect(o.external_auth_key).to_not eq(nil)
        u1 = User.create!(settings: {'email' => 'you@example.com'})
        o.add_user(u1.user_name, false, false)
        u2 = User.create!(settings: {'email' => 'me@example.com'})
        o.add_user(u2.user_name, false, false)
        o.reload
        expect(o.link_saml_user(u1, {:external_id => 'wgawgwag', :email => 'you@example.com'})).to_not eq(false)
        expect(o.link_saml_user(u1, {:external_id => 'wgawgwag2', :email => 'me@example.com'})).to_not eq(false)
        expect(o.find_saml_user('wgawgwag', 'me@example.com')).to eq(u1)
        expect(o.find_saml_user('wgawgwag2', 'you@example.com')).to eq(u1)
      end

      it "should return a valid supervisor from the org" do
        o = Organization.create!
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml'
        o.save
        expect(o.external_auth_key).to_not eq(nil)
        u1 = User.create!
        o.add_supervisor(u1.user_name, false, false)
        o.reload
        expect(o.link_saml_user(u1, {:external_id => 'supergal'})).to_not eq(false)
        expect(o.find_saml_user('supergal')).to eq(u1)
      end

      it "should return a valid admin from the org" do
        o = Organization.create!
        o.settings['saml_metadata_url'] = 'https://www.example.com/saml'
        o.save
        expect(o.external_auth_key).to_not eq(nil)
        u1 = User.create!
        o.add_manager(u1.user_name, false)
        o.reload
        expect(o.link_saml_user(u1, {:external_id => 'bossy'})).to_not eq(false)
        expect(o.find_saml_user('bossy')).to eq(u1)
      end
    end
  
    describe "find_saml_alias" do
      it "should return nil without a parameter" do
        o = Organization.create
        expect(UserLink).to_not receive(:where)
        expect(o.find_saml_alias(nil, nil)).to eq(nil)
      end

      it "should return nil without org saml config" do
        o = Organization.create
        expect(UserLink).to_not receive(:where)
        expect(o.find_saml_alias('a', 'b')).to eq(nil)
      end

      it "should find a uid alias" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'whatever'
        o.save
        u = User.create
        o.add_user(u.user_name, false, false)
        u.reload
        o.reload
        o.link_saml_alias(u, 'cheddar')
        expect(o.find_saml_alias('cheddar', nil)).to eq(u)
        expect(o.find_saml_alias('cheddar', 'bacon')).to eq(u)
      end

      it "should find an email alias" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'whatever'
        o.save
        u = User.create
        o.add_user(u.user_name, false, false)
        u.reload
        o.reload
        o.link_saml_alias(u, 'bacon')
        expect(o.find_saml_alias('cheddar', nil)).to eq(nil)
        expect(o.find_saml_alias('cheddar', 'bacon')).to eq(u)
        expect(o.find_saml_alias(nil, 'bacon')).to eq(u)
      end

      it "should return nil for no aliases" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'whatever'
        o.save
        u = User.create
        o.add_user(u.user_name, false, false)
        u.reload
        o.reload
        o.link_saml_alias(u, 'bacon')
        expect(o.find_saml_alias('cheddar', nil)).to eq(nil)
      end

      it "should return nil for an alias that doesn't match any org users" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'whatever'
        o.save
        u = User.create
        o.add_user(u.user_name, false, false)
        u.reload
        o.reload
        o.link_saml_alias(u, 'bacon')
        o.remove_user(u.user_name)
        o.reload
        expect(o.find_saml_alias('bacon', nil)).to eq(nil)
      end
    end   

    describe "link_saml_user" do
      it "should require saml config on org" do
        o = Organization.create
        expect(o.link_saml_user(nil, nil)).to eq(false)
        u = User.create
        expect(o.link_saml_user(u, nil)).to eq(false)
        expect(o.link_saml_user(u, {})).to eq(false)
        expect(o.link_saml_user(u, {:external_id => 'asdf'})).to eq(false)
      end

      it "should require external_id" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'asdf'
        expect(o.link_saml_user(nil, nil)).to eq(false)
        u = User.create
        expect(o.link_saml_user(u, nil)).to eq(false)
        expect(o.link_saml_user(u, {})).to eq(false)
      end

      it "should generate an external record code and link the user" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'asdf'
        u = User.create
        res = o.link_saml_user(u, {:external_id => 'loggy'})
        expect(res).to_not eq(false)
        expect(res.record_code).to match(/^ext:/)
        expect(res.user).to eq(u)
        expect(res.data['state']).to eq({'external_id' => 'loggy', 'email' => nil, 'org_id' => o.global_id, 'user_name' => nil, 'roles' => nil})
      end
      
      it "should set the user as possibly having external auth" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'asdf'
        u = User.create
        expect(u.reload.settings['possibly_external_auth']).to eq(nil)
        res = o.link_saml_user(u, {:external_id => 'loggy'})
        expect(res).to_not eq(false)
        expect(res.record_code).to match(/^ext:/)
        expect(res.user).to eq(u)
        expect(res.data['state']).to eq({'external_id' => 'loggy', 'email' => nil, 'org_id' => o.global_id, 'user_name' => nil, 'roles' => nil})
        expect(u.reload.settings['possibly_external_auth']).to eq(true)
      end

      it "should remove any existing connections for the org for that external_id" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'asdf'
        u = User.create
        expect(u.reload.settings['possibly_external_auth']).to eq(nil)
        res = o.link_saml_user(u, {:external_id => 'loggy'})
        expect(res).to_not eq(false)
        expect(res.record_code).to match(/^ext:/)
        expect(res.user).to eq(u)
        expect(res.data['state']).to eq({'external_id' => 'loggy', 'email' => nil, 'org_id' => o.global_id, 'user_name' => nil, 'roles' => nil})
        expect(u.reload.settings['possibly_external_auth']).to eq(true)
        expect(UserLink.links_for(u.reload).detect{|l| l['type'] == 'saml_auth'}).to_not eq(nil)

        u2 = User.create
        res = o.link_saml_user(u2, {:external_id => 'loggy'})
        expect(res).to_not eq(false)
        expect(res.record_code).to match(/^ext:/)
        expect(res.user).to eq(u2)
        expect(res.data['state']).to eq({'external_id' => 'loggy', 'email' => nil, 'org_id' => o.global_id, 'user_name' => nil, 'roles' => nil})
        expect(UserLink.links_for(u.reload).detect{|l| l['type'] == 'saml_auth'}).to eq(nil)
        expect(UserLink.links_for(u2.reload).detect{|l| l['type'] == 'saml_auth'}).to_not eq(nil)
      end
    end

    describe "unlink_saml_user" do
      it "should require valid parameters" do
        expect(Organization.unlink_saml_user(nil, nil)).to eq(false)
        u = User.create
        expect(Organization.unlink_saml_user(u, nil)).to eq(false)
        expect(Organization.unlink_saml_user(nil, 'asdf')).to eq(false)
      end
      
      it "should remove matching links" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'asdf'
        u = User.create
        link = o.link_saml_user(u, {:external_id => 'loggy'})
        expect(link).to_not eq(nil)
        res = Organization.unlink_saml_user(u, link.record_code)
        expect(res).to eq(true)
        expect(UserLink.find_by(id: link.id)).to eq(nil)
        expect(u.reload.settings['possibly_external_auth']).to eq(nil)
      end

      it "should succeed even if no links found" do
        expect(Organization.unlink_saml_user(nil, nil)).to eq(false)
        u = User.create
        expect(Organization.unlink_saml_user(u, nil)).to eq(false)
        expect(Organization.unlink_saml_user(u, 'asdf')).to eq(true)
      end
    end

    describe "link_saml_alias" do
      it "should require user" do
        o = Organization.create
        expect(GoSecure).to_not receive(:sha512)
        expect(o.link_saml_alias(nil, nil)).to eq(false)
      end

      it "should require configured org" do
        o = Organization.create
        u = User.create
        expect(GoSecure).to_not receive(:sha512)
        expect(o.link_saml_alias(u, nil)).to eq(false)
      end

      it "should remove any other aliases for the user on the org" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'whatever'
        o.save
        u = User.create
        o.add_user(u.user_name, false, false)
        o.reload
        expect(o.link_saml_alias(u, 'bacon')).to_not eq(false)
        expect(UserLink.links_for(u.reload).select{|l| l['type'] == 'saml_alias'}.map{|l| l['state']['alias']}).to eq(['bacon'])
        expect(o.link_saml_alias(u, 'cheddar')).to_not eq(false)
        expect(UserLink.links_for(u.reload).select{|l| l['type'] == 'saml_alias'}.map{|l| l['state']['alias']}).to eq(['cheddar'])
      end

      it "should remove the same alias from another user if it's attached" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'whatever'
        o.save
        u1 = User.create
        u2 = User.create
        o.add_user(u1.user_name, false, false)
        o.add_user(u2.user_name, false, false)
        o.reload
        expect(o.link_saml_alias(u1, 'bacon')).to_not eq(false)
        expect(UserLink.links_for(u1.reload).select{|l| l['type'] == 'saml_alias'}.map{|l| l['state']['alias']}).to eq(['bacon'])
        expect(UserLink.links_for(u2.reload).select{|l| l['type'] == 'saml_alias'}.map{|l| l['state']['alias']}).to eq([])
        expect(o.link_saml_alias(u2, 'bacon')).to_not eq(false)
        expect(UserLink.links_for(u1.reload).select{|l| l['type'] == 'saml_alias'}.map{|l| l['state']['alias']}).to eq([])
        expect(UserLink.links_for(u2.reload).select{|l| l['type'] == 'saml_alias'}.map{|l| l['state']['alias']}).to eq(['bacon'])
      end

      it "should return the existing link if already linked" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'whatever'
        o.save
        u = User.create
        o.add_user(u.user_name, false, false)
        o.reload
        a = o.link_saml_alias(u, 'bacon')
        expect(a).to_not eq(false)
        expect(UserLink.links_for(u.reload).select{|l| l['type'] == 'saml_alias'}.map{|l| l['state']['alias']}).to eq(['bacon'])
        b = o.link_saml_alias(u, 'bacon')
        expect(b).to_not eq(false)
        expect(b).to eq(a)
        expect(UserLink.links_for(u.reload).select{|l| l['type'] == 'saml_alias'}.map{|l| l['state']['alias']}).to eq(['bacon'])
      end

      it "should not delete priors or add alias if clear_existing=false" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'whatever'
        o.save
        u = User.create
        o.add_user(u.user_name, false, false)
        o.reload
        expect(o.link_saml_alias(u, 'bacon')).to_not eq(false)
        expect(UserLink.links_for(u.reload).select{|l| l['type'] == 'saml_alias'}.map{|l| l['state']['alias']}).to eq(['bacon'])
        expect(o.link_saml_alias(u, 'cheddar', false)).to eq(nil)
        expect(UserLink.links_for(u.reload).select{|l| l['type'] == 'saml_alias'}.map{|l| l['state']['alias']}).to eq(['bacon'])
      end

      it "should not delete from others or add alias if clear_existing=false" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'whatever'
        o.save
        u1 = User.create
        u2 = User.create
        o.add_user(u1.user_name, false, false)
        o.add_user(u2.user_name, false, false)
        o.reload
        expect(o.link_saml_alias(u1, 'bacon')).to_not eq(false)
        expect(UserLink.links_for(u1.reload).select{|l| l['type'] == 'saml_alias'}.map{|l| l['state']['alias']}).to eq(['bacon'])
        expect(UserLink.links_for(u2.reload).select{|l| l['type'] == 'saml_alias'}.map{|l| l['state']['alias']}).to eq([])
        expect(o.link_saml_alias(u2, 'bacon', false)).to eq(nil)
        expect(UserLink.links_for(u1.reload).select{|l| l['type'] == 'saml_alias'}.map{|l| l['state']['alias']}).to eq(['bacon'])
        expect(UserLink.links_for(u2.reload).select{|l| l['type'] == 'saml_alias'}.map{|l| l['state']['alias']}).to eq([])
      end

      it "should delete any existing alias if current is an empty string" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'whatever'
        o.save
        u = User.create
        o.add_user(u.user_name, false, false)
        o.reload
        expect(o.link_saml_alias(u, 'bacon')).to_not eq(false)
        expect(UserLink.links_for(u.reload).select{|l| l['type'] == 'saml_alias'}.map{|l| l['state']['alias']}).to eq(['bacon'])
        expect(o.link_saml_alias(u, '')).to eq(true)
        expect(UserLink.links_for(u.reload).select{|l| l['type'] == 'saml_alias'}.map{|l| l['state']['alias']}).to eq([])
      end

      it "should delete any existing alias if current is nil" do
        o = Organization.create
        o.settings['saml_metadata_url'] = 'whatever'
        o.save
        u = User.create
        o.add_user(u.user_name, false, false)
        o.reload
        expect(o.link_saml_alias(u, 'bacon')).to_not eq(false)
        expect(UserLink.links_for(u.reload).select{|l| l['type'] == 'saml_alias'}.map{|l| l['state']['alias']}).to eq(['bacon'])
        expect(o.link_saml_alias(u, nil)).to eq(true)
        expect(UserLink.links_for(u.reload).select{|l| l['type'] == 'saml_alias'}.map{|l| l['state']['alias']}).to eq([])
      end
    end

    describe "external_auth_for" do
      # it "should short-circuit if possibly_external_auth not set" do
      #   o1 = Organization.create
      #   u = User.create
      #   expect(UserLink).to_not receive(:links_for)
      #   expect(Organization.external_auth_for(u)).to eq(nil)
      # end

      it "should not short-circuit if possibly_external_auth is set" do
        u2 = User.create
        u2.settings['possibly_external_auth'] = true
        u2.save
        expect(UserLink).to receive(:links_for).with(u2).and_return([])
        expect(Organization.external_auth_for(u2)).to eq(nil)
      end

      it "should not return a pending org connection" do
        u = User.create
        u.settings['possibly_external_auth'] = true
        u.save
        o1 = Organization.create
        o2 = Organization.create
        o2.settings['saml_metadata_url'] = 'https://www.example.com/saml'
        o2.save
        o3 = Organization.create
        o3.settings['saml_metadata_url'] = 'https://www.example.com/saml2'
        o3.save
        o1.add_user(u.user_name, false, false)
        o2.add_user(u.user_name, true, false)
        expect(Organization.external_auth_for(u)).to eq(nil)
      end

      it "should return the first saml-configured org found" do
        u = User.create
        u.settings['possibly_external_auth'] = true
        u.save
        o1 = Organization.create
        o2 = Organization.create
        o2.settings['saml_metadata_url'] = 'https://www.example.com/saml'
        o2.save
        o3 = Organization.create
        o3.settings['saml_metadata_url'] = 'https://www.example.com/saml2'
        o3.save
        o1.add_user(u.user_name, false, false)
        o2.add_user(u.user_name, true, false)
        o3.add_user(u.user_name, false, false)
        expect(Organization.external_auth_for(u)).to eq(nil)
      end

      it "should require saml_enforced to return results" do
        u = User.create
        u.settings['possibly_external_auth'] = true
        u.save
        o1 = Organization.create
        o2 = Organization.create
        o2.settings['saml_metadata_url'] = 'https://www.example.com/saml'
        o2.settings['saml_enforced'] = 'https://www.example.com/saml2'
        o2.save
        o3 = Organization.create
        o3.settings['saml_metadata_url'] = 'https://www.example.com/saml2'
        o3.settings['saml_enforced'] = 'https://www.example.com/saml2'
        o3.save
        o1.add_user(u.user_name, false, false)
        o2.add_user(u.user_name, true, false)
        o3.add_user(u.user_name, false, false)
        expect(Organization.external_auth_for(u)).to eq(o3)
      end
    end
  end

  describe "attached_orgs" do
    it "should return an empty list without a user" do
      expect(Organization.attached_orgs(nil)).to eq([])
    end

    it "should return the orgs for the user, if any" do
      o1 = Organization.create
      o2 = Organization.create
      o3 = Organization.create
      o4 = Organization.create
      u1 = User.create
      u2 = User.create
      o1.add_user(u1.user_name, false, false)
      o2.add_supervisor(u1.user_name, false, false);
      o3.add_manager(u1.user_name, true)
      o3.add_manager(u2.user_name, false)
      expect(Organization.attached_orgs(u1).map{|o| o.except('added')}.sort_by{|o| o['id'] }).to eq([
        {
          'id' => o1.global_id, 'type' => 'user', 'eval' => false, 'sponsored' => false, 'status' => 'unchecked', 'pending' => false, "image_url"=>nil, 'name' => o1.settings['name'], 'lesson_ids' => [],
          'home_board_keys' => []
        }, {
          'id' => o2.global_id, 'type' => 'supervisor', 'extra_colors' => nil, 'pending' => false, "image_url"=>nil, 'name' => o1.settings['name'], 'lesson_ids' => [], 'home_board_keys' => [],
          'note_templates' => o1.note_templates
        }, {
          'id' => o3.global_id, 'type' => 'manager', 'extra_colors' => nil, 'admin' => false, 'full_manager' => true, "image_url"=>nil, 'name' => o1.settings['name'], 'lesson_ids' => [], 'home_board_keys' => [],
          'note_templates' => o1.note_templates
        }
      ])
      expect(Organization.attached_orgs(u2).map{|o| o.except('added')}).to eq([
        {
          'id' => o3.global_id, 'type' => 'manager', 'extra_colors' => nil, 'admin' => false, 'full_manager' => false, "image_url"=>nil, 'name' => o1.settings['name'], 'lesson_ids' => [], 'home_board_keys' => [],
          'note_templates' => o1.note_templates
        }
      ])
    end

    it "should include org records if specified" do
      o1 = Organization.create
      o2 = Organization.create
      o3 = Organization.create
      o4 = Organization.create
      u1 = User.create
      u2 = User.create
      o1.add_user(u1.user_name, false, false)
      o2.add_supervisor(u1.user_name, false, false);
      o3.add_manager(u1.user_name, true)
      o3.add_manager(u2.user_name, false)
      expect(Organization.attached_orgs(u1, true).map{|o| o.except('added')}.map{|o| o['org'] }.sort_by(&:id)).to eq([
        o1, o2, o3
      ])
      expect(Organization.attached_orgs(u2, true).map{|o| o.except('added')}.map{|o| o['org'] }).to eq([
        o3
      ])
    end

    it "should include saml settings if available" do
      o1 = Organization.create
      o1.settings['saml_metadata_url'] = 'whatever'
      o1.save
      o2 = Organization.create
      o2.settings['saml_metadata_url'] = 'whatever2'
      o2.save
      o3 = Organization.create
      o3.settings['saml_metadata_url'] = 'whatever3'
      o3.save
      o4 = Organization.create
      o4.settings['saml_metadata_url'] = 'whatever4'
      o4.save
      u1 = User.create
      o1.add_user(u1.user_name, false, false)
      o1.reload
      o1.link_saml_user(u1, {:external_id => 'sekrit', :email => 'bob@example.com'})
      u1.reload
      o2.add_supervisor(u1.user_name, false, false);
      o2.reload
      o2.link_saml_user(u1.reload, {:external_id => 'sekrit2', :user_name => 'bob'})
      o3.add_manager(u1.user_name, true)
      o3.reload
      o3.link_saml_alias(u1.reload, 'bobby@example.com')
      expect(Organization.attached_orgs(u1.reload).map{|o| o.except('added')}.sort_by{|o| o['id'] }).to eq([
        {
          'id' => o1.global_id, 'type' => 'user', 'eval' => false, 'sponsored' => false, 'status' => 'unchecked', 'pending' => false, 'name' => o1.settings['name'],"image_url"=>nil,
          'external_auth' => true, 'external_auth_connected' => true, 'external_auth_alias' => 'bob@example.com', 'lesson_ids' => [],
          'home_board_keys' => []
        }, {
          'id' => o2.global_id, 'type' => 'supervisor', 'extra_colors' => nil, 'pending' => false, 'name' => o1.settings['name'],"image_url"=>nil,
          'external_auth' => true, 'external_auth_connected' => true, 'external_auth_alias' => 'bob', 'lesson_ids' => [], 'home_board_keys' => [],
          'note_templates' => o1.note_templates
        }, {
          'id' => o3.global_id, 'type' => 'manager', 'extra_colors' => nil, 'admin' => false, 'full_manager' => true, 'name' => o1.settings['name'],"image_url"=>nil,
          'external_auth' => true, 'external_auth_alias' => 'bobby@example.com', 'lesson_ids' => [], 'home_board_keys' => [],
          'note_templates' => o1.note_templates
        }
      ])
    end

    it "should include profile settings for org users/supervisors" do
      o1 = Organization.create
      o2 = Organization.create
      o3 = Organization.create
      o4 = Organization.create
      u1 = User.create
      u2 = User.create
      o1.add_user(u1.user_name, false, false)
      o2.add_supervisor(u1.user_name, false, false);
      o3.add_manager(u1.user_name, true)
      o3.add_manager(u2.user_name, false)
      o1.settings['communicator_profile'] = {'profile_id' => 'squinch', 'template_id' => '1_1111', 'frequency' => 1000}
      o1.save
      o2.settings['supervisor_profile'] = {'profile_id' => 'squib', 'template_id' => '1_22222', 'frequency' => 2000}
      o2.save
      expect(Organization.attached_orgs(u1).map{|o| o.except('added')}.sort_by{|o| o['id'] }).to eq([
        {
          'id' => o1.global_id, 'type' => 'user', 'eval' => false, 'sponsored' => false, 'status' => 'unchecked', 'pending' => false, "image_url"=>nil, 'name' => o1.settings['name'], 'profile' => {
            'profile_id' => 'squinch', 'template_id' => '1_1111', 'frequency' => 1000
          }, 'lesson_ids' => [],
          'home_board_keys' => []
        }, {
          'id' => o2.global_id, 'type' => 'supervisor', 'extra_colors' => nil, 'pending' => false, "image_url"=>nil, 'name' => o1.settings['name'], 'profile' => {
            'profile_id' => 'squib', 'template_id' => '1_22222', 'frequency' => 2000
          }, 'lesson_ids' => [], 'home_board_keys' => [],
          'note_templates' => o1.note_templates
        }, {
          'id' => o3.global_id, 'type' => 'manager', 'extra_colors' => nil, 'admin' => false, 'full_manager' => true, "image_url"=>nil, 'name' => o1.settings['name'], 'lesson_ids' => [], 'home_board_keys' => [],
          'note_templates' => o1.note_templates
        }
      ])
    end
  end
  
  describe "matches_profile_id" do
    it "should return nil for none-type profile ids" do
      o = Organization.create
      o.settings['communicator_profile'] = {'profile_id' => 'none'}
      expect(o.matches_profile_id('communicator', 'asdf', '1_1111')).to eq(nil)
      o.settings['communicator_profile'] = {'profile_id' => 'blank'}
      expect(o.matches_profile_id('communicator', 'asdf', '1_1111')).to eq(nil)
    end

    it "should compare to the default profile id for the user type if specified" do
      o = Organization.create
      expect(o.matches_profile_id('communicator', 'asdf', '1_1111')).to eq(false)
      expect(ProfileTemplate).to receive(:default_profile_id).with('communicator').and_return('comm').exactly(3).times
      expect(ProfileTemplate).to receive(:default_profile_id).with('supervisor').and_return('sup').exactly(3).times
      o.settings['communicator_profile'] = {'profile_id' => 'default'}
      o.settings['supervisor_profile'] = {'profile_id' => 'default'}
      expect(o.matches_profile_id('communicator', 'comm', '1_1111')).to eq(true)
      expect(o.matches_profile_id('communicator', 'sup', '1_1111')).to eq(false)
      expect(o.matches_profile_id('communicator', 'default', '1_1111')).to eq(false)
      expect(o.matches_profile_id('supervisor', 'sup', '1_1111')).to eq(true)
      expect(o.matches_profile_id('supervisor', 'comm', '1_1111')).to eq(false)
      expect(o.matches_profile_id('supervisor', 'default', '1_1111')).to eq(false)
    end

    it "should compare to the template_id if there is one" do
      o = Organization.create
      o.settings['communicator_profile'] = {'profile_id' => 'whatevs', 'template_id' => '1_1111'}
      o.settings['supervisor_profile'] = {'profile_id' => 'whatevs', 'template_id' => '1_2222'}
      expect(o.matches_profile_id('communicator', 'bacon', '1_1111')).to eq(true)
      expect(o.matches_profile_id('communicator', 'cheddar', '1_1111')).to eq(true)
      expect(o.matches_profile_id('communicator', 'default', '1_2222')).to eq(false)
      expect(o.matches_profile_id('supervisor', 'cheddar', '1_2222')).to eq(true)
      expect(o.matches_profile_id('supervisor', 'bacon', '1_2222')).to eq(true)
      expect(o.matches_profile_id('supervisor', 'default', '1_1111')).to eq(false)
    end

    it "should fall back to comparing to the profile_id set for the user type on the org" do
      o = Organization.create
      o.settings['communicator_profile'] = {'profile_id' => 'bacon'}
      o.settings['supervisor_profile'] = {'profile_id' => 'cheddar'}
      expect(o.matches_profile_id('communicator', 'bacon', '1_1111')).to eq(true)
      expect(o.matches_profile_id('communicator', 'cheddar', '1_1111')).to eq(false)
      expect(o.matches_profile_id('communicator', 'default', '1_1111')).to eq(false)
      expect(o.matches_profile_id('supervisor', 'cheddar', '1_1111')).to eq(true)
      expect(o.matches_profile_id('supervisor', 'bacon', '1_1111')).to eq(false)
      expect(o.matches_profile_id('supervisor', 'default', '1_1111')).to eq(false)
    end  
  end

  describe "profile_frequency" do
    it "should return based on the setting and user type" do
      o = Organization.create
      o.settings['communicator_profile'] = {'frequency' => 12345}
      o.settings['supervisor_profile'] = {'frequency' => 98765}
      expect(o.profile_frequency('communicator')).to eq(12345)
      expect(o.profile_frequency('supervisor')).to eq(98765)
    end

    it "should have a fallback" do
      o = Organization.create
      expect(o.profile_frequency('communicator')).to eq(12.months.to_i)
      expect(o.profile_frequency('supervisor')).to eq(12.months.to_i)
    end
  end

  describe "assert_profile" do
    it "should do nothing for none or invalid ids" do
      o = Organization.create
      o.settings['supervisor_profile'] = {'profile_id' => 'none'}
      expect(ProfileTemplate).to_not receive(:find_by_code)
      o.assert_profile('communicator')
      o.assert_profile('supervisor')
    end

    it "should call process_profile for all supervisors if specified" do
      o = Organization.create(settings: {'total_licenses' => 5})
      u1 = User.create
      ue1 = UserExtra.find_or_create_by(user: u1)
      u2 = User.create
      ue2 = UserExtra.find_or_create_by(user: u2)
      u3 = User.create
      ue3 = UserExtra.find_or_create_by(user: u3)
      u4 = User.create
      ue4 = UserExtra.find_or_create_by(user: u4)
      u5 = User.create
      ue5 = UserExtra.find_or_create_by(user: u5)
      expect(UserExtra).to receive(:find_or_create_by).with(user: u1).and_return(ue1)
      expect(UserExtra).to receive(:find_or_create_by).with(user: u2).and_return(ue2)
      expect(UserExtra).to receive(:find_or_create_by).with(user: u3).and_return(ue3)
      expect(UserExtra).to receive(:find_or_create_by).with(user: u4).and_return(ue4)
      expect(UserExtra).to_not receive(:find_or_create_by).with(user: u5)
      o.add_supervisor(u1.user_name, false)
      o.add_supervisor(u2.user_name, false)
      o.add_supervisor(u3.user_name, false)
      o.add_supervisor(u4.user_name, true)
      o.add_user(u5.user_name, false, true)
      o.settings['supervisor_profile'] = {'profile_id' => 'cole'}
      o.save
      expect(ue1).to receive(:process_profile).with('cole', nil, o)
      expect(ue2).to receive(:process_profile).with('cole', nil, o)
      expect(ue3).to receive(:process_profile).with('cole', nil, o)
      expect(ue4).to receive(:process_profile).with('cole', nil, o)
      expect(ue5).to_not receive(:process_profile).with('cole', nil, o)
      o.assert_profile('supervisor')
    end

    it "should call process_profile for all communicators if specified" do
      o = Organization.create(settings: {'total_licenses' => 5})
      u1 = User.create
      ue1 = UserExtra.find_or_create_by(user: u1)
      u2 = User.create
      ue2 = UserExtra.find_or_create_by(user: u2)
      u3 = User.create
      ue3 = UserExtra.find_or_create_by(user: u3)
      u4 = User.create
      ue4 = UserExtra.find_or_create_by(user: u4)
      u5 = User.create
      ue5 = UserExtra.find_or_create_by(user: u5)
      expect(UserExtra).to_not receive(:find_or_create_by).with(user: u1)
      expect(UserExtra).to_not receive(:find_or_create_by).with(user: u2)
      expect(UserExtra).to receive(:find_or_create_by).with(user: u3).and_return(ue3)
      expect(UserExtra).to_not receive(:find_or_create_by).with(user: u4)
      expect(UserExtra).to receive(:find_or_create_by).with(user: u5).and_return(ue5)
      o.add_supervisor(u1.user_name, false)
      o.add_supervisor(u2.user_name, true)
      o.add_user(u3.user_name, false, false)
      o.add_user(u4.user_name, true, true)
      o.add_user(u5.user_name, false, true)
      pt = ProfileTemplate.create
      o.settings['communicator_profile'] = {'profile_id' => 'bacon', 'template_id' => pt.global_id}
      o.save
      expect(ue1).to_not receive(:process_profile).with('bacon', pt.global_id, o)
      expect(ue2).to_not receive(:process_profile).with('bacon', pt.global_id, o)
      expect(ue3).to receive(:process_profile).with('bacon', pt.global_id, o)
      expect(ue4).to_not receive(:process_profile).with('bacon', pt.global_id, o)
      expect(ue5).to receive(:process_profile).with('bacon', pt.global_id, o)
      o.assert_profile('communicator_profile')
    end

    it "should pass the template_id if available" do
      o = Organization.create(settings: {'total_licenses' => 5})
      u1 = User.create
      ue1 = UserExtra.find_or_create_by(user: u1)
      u2 = User.create
      ue2 = UserExtra.find_or_create_by(user: u2)
      u3 = User.create
      ue3 = UserExtra.find_or_create_by(user: u3)
      u4 = User.create
      ue4 = UserExtra.find_or_create_by(user: u4)
      u5 = User.create
      ue5 = UserExtra.find_or_create_by(user: u5)
      expect(UserExtra).to receive(:find_or_create_by).with(user: u1).and_return(ue1)
      expect(UserExtra).to receive(:find_or_create_by).with(user: u2).and_return(ue2)
      expect(UserExtra).to receive(:find_or_create_by).with(user: u3).and_return(ue3)
      expect(UserExtra).to receive(:find_or_create_by).with(user: u4).and_return(ue4)
      expect(UserExtra).to_not receive(:find_or_create_by).with(user: u5)
      o.add_supervisor(u1.user_name, false)
      o.add_supervisor(u2.user_name, false)
      o.add_supervisor(u3.user_name, false)
      o.add_supervisor(u4.user_name, true)
      o.add_user(u5.user_name, false, true)
      pt = ProfileTemplate.create
      o.settings['supervisor_profile'] = {'profile_id' => 'bacon', 'template_id' => pt.global_id}
      o.save
      expect(ue1).to receive(:process_profile).with('bacon', pt.global_id, o)
      expect(ue2).to receive(:process_profile).with('bacon', pt.global_id, o)
      expect(ue3).to receive(:process_profile).with('bacon', pt.global_id, o)
      expect(ue4).to receive(:process_profile).with('bacon', pt.global_id, o)
      expect(ue5).to_not receive(:process_profile).with('bacon', pt.global_id, o)
      o.assert_profile('supervisor')
    end
  end

  describe "home_board_keys" do
    it "should return an empty list by default" do
      o = Organization.create
      expect(o.home_board_keys).to eq([])
    end

    it "should return legacy home board as single list" do
      o = Organization.create
      o.settings['default_home_board'] = {'key' => 'asdf'}
      expect(o.home_board_keys).to eq(['asdf'])
    end

    it "should return latest home board list as parsed by user" do
      o = Organization.create
      o.settings['default_home_board'] = {'key' => 'old'}
      o.settings['default_home_boards'] = [{'key' => 'new1'}, {'key' => 'new2'}]
      expect(o.home_board_keys).to eq(['new1', 'new2'])
    end

    it "should delete the legacy hopme board when updating" do
      o = Organization.create
      o.settings['default_home_board'] = {'key' => 'asdf'}
      o.save
      u = User.create
      b1 = Board.create(user: u, public: true)
      b2 = Board.create(user: u, public: true)
      b3 = Board.create(user: u)
      o.process({'home_board_keys' => [b1.key, b2.key, b3.key]}, {'updater' => u})
      expect(o.home_board_keys).to eq([b1.key, b2.key])
      expect(o.settings['default_home_board']).to eq(nil)
    end

    it "should keep existing home board keys if re-entered, even if no longer allowed" do
      o = Organization.create
      o.settings['default_home_board'] = {'key' => 'asdf'}
      o.save
      u = User.create
      b1 = Board.create(user: u, public: true)
      b2 = Board.create(user: u, public: true)
      b3 = Board.create(user: u)
      o.process({'home_board_keys' => [b1.key, b2.key, b3.key]}, {'updater' => u})
      expect(o.home_board_keys).to eq([b1.key, b2.key])
      expect(o.settings['default_home_board']).to eq(nil)
      expect(o.settings['default_home_boards']).to_not eq(nil)
      b2.public = false
      b2.save
      o.process({'home_board_keys' => [b1.key, b2.key, b3.key]}, {'updater' => u})
      expect(o.home_board_keys).to eq([b1.key, b2.key])
    end
  end

  describe "start codes" do
    describe "activation_code" do
      it "should allow generating a code on an org" do
        o = Organization.create
        code = Organization.activation_code(o, {'user_type' => 'communicator'})
        expect(code).to_not eq(nil)
        rnd = "1#{code[-11..-8]}"
        o.reload
        expect(o.settings['activation_settings'].keys).to eq([rnd])
      end

      it "should allow generating a supervisor code on an org" do
        o = Organization.create
        code = Organization.activation_code(o, {'user_type' => 'supporter'})
        expect(code).to_not eq(nil)
        rnd = "2#{code[-11..-8]}"
        o.reload
        expect(o.settings['activation_settings'].keys).to eq([rnd])
      end

      it "should allow generating a code on a user" do
        u = User.create
        code = Organization.activation_code(u, {'user_type' => 'communicator'})
        expect(code).to_not eq(nil)
        rnd = "9#{code[-11..-8]}"
        u.reload
        expect(u.settings['activation_settings'].keys).to eq([rnd])
      end

      it "should allow generating multiple codes" do
        o = Organization.create
        code = Organization.activation_code(o, {'user_type' => 'communicator'})
        expect(code).to_not eq(nil)
        rnd = "1#{code[-11..-8]}"
        o.reload
        expect(o.settings['activation_settings'].keys).to eq([rnd])

        code2 = Organization.activation_code(o, {'user_type' => 'supporter'})
        expect(code2).to_not eq(nil)
        rnd2 = "2#{code2[-11..-8]}"
        o.reload
        expect(o.settings['activation_settings'].keys).to eq([rnd, rnd2])
      end

      it "should allow proposing a custom start code" do
        o = Organization.create
        code = Organization.activation_code(o, {'user_type' => 'communicator', 'proposed_code' => 't292oofao'})
        expect(code).to_not eq(nil)
        expect(code).to eq('t292oofao')
        ac = ActivationCode.lookup('t292oofao')
        expect(ac).to_not eq(nil)
        o.reload
        expect(o.settings['activation_settings'].keys).to eq(["a#{ac.id}"])
      end

      it "should allow a short custom start code" do
        o = Organization.create
        expect { Organization.activation_code(o, {'user_type' => 'communicator', 'proposed_code' => 'tt'}) }.to raise_error('code is too short')
      end

      it "should allow a custom start code that starts with a number" do
        o = Organization.create
        expect { Organization.activation_code(o, {'user_type' => 'communicator', 'proposed_code' => '4agag4g4tt'}) }.to raise_error('code must start with a letter')
      end

      it "should not allow repeating custom start codes" do
        o = Organization.create
        ac_id = ActivationCode.generate('t292oofao', o)
        expect { Organization.activation_code(o, {'user_type' => 'communicator', 'proposed_code' => 't292oofao'}) }.to raise_error('code is taken')
      end

      it "should allow saving preferences on a start code" do
        o = Organization.create
        code = Organization.activation_code(o, {'user_type' => 'supporter', 'limit' => 4, 'locale' => 'es'})
        expect(code).to_not eq(nil)
        rnd = "2#{code[-11..-8]}"
        o.reload
        expect(o.settings['activation_settings'].keys).to eq([rnd])
        expect(o.settings['activation_settings'][rnd]).to eq({
          'user_type' => 'supporter',
          'limit' => 4,
          'locale' => 'es'
        })
      end

      it "should allow saving preferences on a custom start code" do
        o = Organization.create
        code = Organization.activation_code(o, {
          'user_type' => 'communicator', 
          'proposed_code' => 't292oofao',
          'symbol_library' => 'twemoji'
        })
        expect(code).to_not eq(nil)
        expect(code).to eq('t292oofao')
        ac = ActivationCode.lookup('t292oofao')
        expect(ac).to_not eq(nil)
        o.reload
        expect(o.settings['activation_settings'].keys).to eq(["a#{ac.id}"])
        expect(o.settings['activation_settings']["a#{ac.id}"]).to eq({
          'code' => 't292oofao',
          'symbol_library' => 'twemoji'
        })
      end

      it "should allow regenerating a start code from a hash index" do
        o = Organization.create
        code = Organization.activation_code(o, {'user_type' => 'communicator'})
        expect(code).to_not eq(nil)
        rnd = "1#{code[-11..-8]}"
        o.reload
        expect(o.settings['activation_settings'].keys).to eq([rnd])

        code2 = Organization.activation_code(o, {'user_type' => 'communicator', 'proposed_code' => 't292oofao'})
        expect(code2).to_not eq(nil)
        expect(code2).to eq('t292oofao')
        ac = ActivationCode.lookup('t292oofao')
        expect(ac).to_not eq(nil)
        o.reload
        expect(o.settings['activation_settings'].keys).to eq([rnd, "a#{ac.id}"])

        expect(Organization.activation_code(o, {'rnd' => rnd})).to eq(code)
        expect(Organization.activation_code(o, {'rnd' => "a#{ac.id}"})).to eq(code2)
      end
    end
  
    describe "start_codes" do
      it "should return start codes saved on an org" do
        o = Organization.create
        code = Organization.activation_code(o, {'user_type' => 'communicator', 'locale' => 'es'})
        expect(code).to_not eq(nil)
        rnd = "1#{code[-11..-8]}"
        o.reload
        expect(o.settings['activation_settings'].keys).to eq([rnd])

        code2 = Organization.activation_code(o, {'user_type' => 'communicator', 'locale' => 'fr', 'symbol_library' => 'pcs', 'bacon' => 2, 'proposed_code' => 't292oofao'})
        expect(code2).to_not eq(nil)
        expect(code2).to eq('t292oofao')
        ac = ActivationCode.lookup('t292oofao')
        expect(ac).to_not eq(nil)
        o.reload
        expect(o.settings['activation_settings'].keys).to eq([rnd, "a#{ac.id}"])

        expect(Organization.activation_code(o, {'rnd' => rnd})).to eq(code)
        expect(Organization.activation_code(o, {'rnd' => "a#{ac.id}"})).to eq(code2)
        expect(Organization.start_codes(o)).to eq([
          {
            code: code,
            disabled: false,
            locale: 'es',
            v: GoSecure.sha512(Webhook.get_record_code(o), 'start_code_verifier')[0, 5]
          },
          {
            code: code2,
            disabled: false,
            locale: 'fr',
            symbol_library: 'pcs',
            v: GoSecure.sha512(Webhook.get_record_code(o), 'start_code_verifier')[0, 5]
          }
        ])
      end
      
      it "should return start codes saved on a user" do
        u = User.create
        b = Board.create(user: u, public: true)
        code = Organization.activation_code(u, {'user_type' => 'communicator'})
        expect(code).to_not eq(nil)
        rnd = "9#{code[-11..-8]}"
        u.reload
        expect(u.settings['activation_settings'].keys).to eq([rnd])

        code2 = Organization.activation_code(u, {'user_type' => 'communicator', 'home_board_key' => b.key})
        expect(code2).to_not eq(nil)
        rnd2 = "9#{code2[-11..-8]}"
        u.reload
        expect(u.settings['activation_settings'].keys).to eq([rnd, rnd2])
        
        expect(Organization.start_codes(u)).to eq([
          {
            code: code,
            disabled: false,
            v: GoSecure.sha512(Webhook.get_record_code(u), 'start_code_verifier')[0, 5]

          },
          {
            code: code2,
            disabled: false,
            home_board_key: b.key,
            v: GoSecure.sha512(Webhook.get_record_code(u), 'start_code_verifier')[0, 5]
          }
        ])
      end
    end

    describe "parse_activation_code" do
      it "should return a valid start code" do
        o = Organization.create
        code = Organization.activation_code(o, {})
        expect(code).to_not eq(nil)
        rnd = "1#{code[-11..-8]}"
        res = Organization.parse_activation_code(code)
        expect(res).to_not eq(false)
        expect(res[:disabled]).to_not eq(true)
        expect(res[:target]).to eq(o)
        expect(res[:user_type]).to eq('communicator')
        expect(res[:key]).to eq(rnd)
      end

      it "should return false on an invalid start code" do
        o = Organization.create
        code = Organization.activation_code(o, {})
        expect(code).to_not eq(false)
        rnd = "1#{code[-11..-8]}"
        expect(Organization.parse_activation_code(code + 'a')).to eq(false)
        expect(Organization.parse_activation_code('a')).to eq(false)
      end

      it "should return a valid custom start code" do
        o = Organization.create
        code = Organization.activation_code(o, {'proposed_code' => 'x347t2ot2'})
        expect(code).to_not eq(nil)
        ac = ActivationCode.lookup(code)
        rnd = "a#{ac.id}"
        res = Organization.parse_activation_code(code)
        expect(res).to_not eq(false)
        expect(res[:disabled]).to_not eq(true)
        expect(res[:target]).to eq(o)
        expect(res[:user_type]).to eq('communicator')
        expect(res[:key]).to eq(rnd)
      end

      it "should return false on an invalid custom start code" do
        o = Organization.create
        code = Organization.activation_code(o, {'proposed_code' => 'x347t2ot2'})
        expect(Organization.parse_activation_code(code + 'a')).to eq(false)
        expect(Organization.parse_activation_code('a')).to eq(false)
      end

      it "should add a user to an org if passed" do
        o = Organization.create
        code = Organization.activation_code(o, {})
        expect(code).to_not eq(nil)
        u = User.create
        expect(o.user?(u)).to eq(false)
        res = Organization.parse_activation_code(code, u)
        o.reload
        expect(o.user?(u)).to eq(true)
      end

      it "should add a supervisor to the passed user" do
        s = User.create
        code = Organization.activation_code(s, {})
        expect(code).to_not eq(nil)
        u = User.create
        expect(u.supervisor_user_ids).to eq([])
        res = Organization.parse_activation_code(code, u)
        u.reload
        expect(u.supervisor_user_ids).to eq([s.global_id])
      end

      it "should add specified supervisors to an org add" do
        o = Organization.create
        s1 = User.create
        s2 = User.create
        code = Organization.activation_code(o, {'supervisors' => [s1.global_id, s2.global_id]})
        expect(code).to_not eq(nil)
        u = User.create
        expect(o.user?(u)).to eq(false)
        res = Organization.parse_activation_code(code, u)
        expect(!!res).to_not eq(false)
        o.reload
        expect(o.user?(u)).to eq(true)
        u.reload
        expect(u.supervisor_user_ids.sort).to eq([s1.global_id, s2.global_id])
      end

      it "should update user with start code settings" do
        o = Organization.create
        code = Organization.activation_code(o, {'user_type' => 'supporter', 'locale' => 'es', 'symbol_library' => 'twemoji'})
        expect(code).to_not eq(nil)
        u = User.create
        expect(o.supervisor?(u)).to eq(false)
        res = Organization.parse_activation_code(code, u)
        expect(!!res).to_not eq(false)
        o.reload
        expect(o.supervisor?(u)).to eq(true)
        expect(u.settings['preferences']['role']).to eq('supporter')
        expect(u.settings['preferences']['locale']).to eq('es')
        expect(u.settings['preferences']['preferred_symbols']).to eq('twemoji')
      end

      it "should copy a new home board for the user if tied to the start code" do
        o = Organization.create
        s = User.create
        b = Board.create(user: s, public: true)
        b2 = Board.create(user: s, public: true)
        o.process({:home_board_keys => [b.key, b2.key]}, {updater: s})
        expect(o.home_board_keys).to eq([b.key, b2.key])
        code = Organization.activation_code(o, {'user_type' => 'communicator', 'home_board_key' => b2.key})

        u = User.create
        res = Organization.parse_activation_code(code, u)
        Worker.process_queues
        expect(!!res).to_not eq(false)
        o.reload
        expect(o.user?(u)).to eq(true)
        u.reload
        expect(u.settings['preferences']['home_board']).to_not eq(nil)
        brd = Board.find_by_path(u.settings['preferences']['home_board']['key'])
        expect(brd).to_not eq(b)
        expect(u.settings['preferences']['home_board']['key']).to_not eq(b.key)
        expect(brd.instance_variable_get('@sub_id')).to eq(u.global_id)
        expect(brd).to eq(b2)
      end

      it "should copy the default home board for the user if no home board set on the start code" do
        o = Organization.create
        s = User.create
        b = Board.create(user: s, public: true)
        o.process({:home_board_key => b.key}, {updater: s})
        expect(o.home_board_keys).to eq([b.key])
        code = Organization.activation_code(o, {'user_type' => 'communicator'})

        u = User.create
        res = Organization.parse_activation_code(code, u)
        Worker.process_queues
        expect(!!res).to_not eq(false)
        o.reload
        expect(o.user?(u)).to eq(true)
        u.reload
        expect(u.settings['preferences']['home_board']).to_not eq(nil)
        brd = Board.find_by_path(u.settings['preferences']['home_board']['key'])
        expect(u.settings['preferences']['home_board']['key']).to_not eq(b.key)
        expect(brd).to eq(b)
        expect(brd.instance_variable_get('@sub_id')).to eq(u.global_id)
      end

      it "should not copy a home board if the user already has a home board set" do
        o = Organization.create
        s = User.create
        b = Board.create(user: s, public: true)
        o.process({:home_board_key => b.key}, {updater: s})
        expect(o.home_board_keys).to eq([b.key])
        code = Organization.activation_code(o, {'user_type' => 'communicator'})

        u = User.create
        u.process({'preferences' => {'home_board' => {'key' => b.key, 'id' => b.global_id}}})
        expect(u.settings['preferences']['home_board']).to_not eq(nil)
        res = Organization.parse_activation_code(code, u)
        expect(!!res).to_not eq(false)
        o.reload
        expect(o.user?(u)).to eq(true)
        expect(u.settings['preferences']['home_board']).to_not eq(nil)
        brd = Board.find_by_path(u.settings['preferences']['home_board']['key'])
        expect(brd).to eq(b)
        expect(brd.parent_board).to eq(nil)
      end

      it "should not set a home board for a supervisor type" do
        o = Organization.create
        s = User.create
        b = Board.create(user: s, public: true)
        o.process({:home_board_key => b.key}, {updater: s})
        expect(o.home_board_keys).to eq([b.key])
        code = Organization.activation_code(o, {'user_type' => 'supporter'})

        u = User.create
        res = Organization.parse_activation_code(code, u)
        expect(!!res).to_not eq(false)
        o.reload
        expect(o.supervisor?(u)).to eq(true)
        expect(u.settings['preferences']['home_board']).to eq(nil)
      end

      it "should not copy a new home board if the specified board isn't in the org's list" do
        o = Organization.create
        s = User.create
        b2 = Board.create(user: s, public: true)
        o.process({:home_board_key => b2.key}, {updater: s})
        code = Organization.activation_code(o, {'user_type' => 'communicator', 'home_board_key' => b2.key})
        o.process({:home_board_key => nil}, {updater: s})

        u = User.create
        res = Organization.parse_activation_code(code, u)
        expect(!!res).to_not eq(false)
        o.reload
        expect(o.user?(u)).to eq(true)
        expect(u.settings['preferences']['home_board']).to eq(nil)
      end

      it "should not copy a new home board if the specified board isn't available for the supervisor" do
        s = User.create
        u2 = User.create
        b = Board.create(user: u2, public: true)
        code = Organization.activation_code(s, {'home_board_key' => b.global_id})
        b.public = false
        b.save
        expect(code).to_not eq(nil)
        u = User.create
        expect(u.supervisor_user_ids).to eq([])
        res = Organization.parse_activation_code(code, u)
        u.reload
        expect(u.supervisor_user_ids).to eq([s.global_id])
        expect(u.settings['preferences']['home_board']).to eq(nil)
      end

      it "should copy a new home board if the specified board is available for the supervisor" do
        s = User.create
        b = Board.create(user: s)
        code = Organization.activation_code(s, {'home_board_key' => b.global_id})
        expect(code).to_not eq(nil)
        u = User.create
        expect(u.supervisor_user_ids).to eq([])
        res = Organization.parse_activation_code(code, u)
        Worker.process_queues
        u.reload
        expect(u.supervisor_user_ids).to eq([s.global_id])
        expect(u.settings['preferences']['home_board']).to_not eq(nil)
        brd = Board.find_by_path(u.settings['preferences']['home_board']['key'])
        expect(u.settings['preferences']['home_board']['key']).to_not eq(b.key)
        expect(brd).to eq(b)
        expect(brd.instance_variable_get('@sub_id')).to eq(u.global_id)
      end

      it "should record the activation for the user" do
        o = Organization.create
        code = Organization.activation_code(o, {})
        expect(code).to_not eq(nil)
        u = User.create
        expect(o.user?(u)).to eq(false)
        res = Organization.parse_activation_code(code, u)
        o.reload
        expect(o.user?(u)).to eq(true)
        expect(u.settings['activations']).to_not eq(nil)
        expect(u.settings['activations'].length).to eq(1)
        expect(u.settings['activations'][0]['code']).to eq(code)
        expect(u.settings['activations'][0]['ts']).to be > 5.seconds.ago.to_i
        expect(u.settings['activations'][0]['ts']).to be < 5.seconds.from_now.to_i
      end

      it "should not allow an expired activation" do
        o = Organization.create
        code = Organization.activation_code(o, {'expires' => 5.minutes.ago.to_i})
        expect(code).to_not eq(nil)
        u = User.create
        expect(o.user?(u)).to eq(false)
        res = Organization.parse_activation_code(code, u)
        o.reload
        expect(o.user?(u)).to eq(false)
        expect(res).to_not eq(nil)
        expect(res[:disabled]).to eq(true)
      end

      it "should not allow an activation that has exceeded its limit" do
        o = Organization.create
        code = Organization.activation_code(o, {'limit' => 1})
        expect(code).to_not eq(nil)
        u = User.create
        expect(o.user?(u)).to eq(false)
        res = Organization.parse_activation_code(code, u)
        expect(res).to_not eq(nil)
        expect(res[:disabled]).to eq(false)
        o.reload
        expect(o.user?(u)).to eq(true)

        u2 = User.create        
        res = Organization.parse_activation_code(code, u2)
        expect(res).to_not eq(nil)
        expect(res[:disabled]).to eq(true)
        o.reload
        expect(o.user?(u2)).to eq(false)
      end

      it "should not allow a disabled code" do
        o = Organization.create
        code = Organization.activation_code(o, {})
        expect(code).to_not eq(nil)
        rnd = "1#{code[-11..-8]}"
        o.reload

        Organization.remove_start_code(o, code)
        o.reload
        expect(o.settings['activation_settings'][rnd]['disabled']).to eq(true)

        u2 = User.create        
        res = Organization.parse_activation_code(code, u2)
        expect(res).to_not eq(nil)
        expect(res[:disabled]).to eq(true)
        o.reload
        expect(o.user?(u2)).to eq(false)
      end
    end

    describe "remove_start_code" do
      it "should disable a start code" do
        o = Organization.create
        code = Organization.activation_code(o, {})
        expect(code).to_not eq(nil)
        rnd = "1#{code[-11..-8]}"
        o.reload

        u = User.create        
        res = Organization.parse_activation_code(code, u)
        expect(res).to_not eq(nil)
        expect(res[:disabled]).to_not eq(true)
        o.reload
        expect(o.user?(u)).to eq(true)

        Organization.remove_start_code(o, code)
        o.reload
        expect(o.settings['activation_settings'][rnd]['disabled']).to eq(true)
        res = Organization.parse_activation_code(code)
        expect(res).to_not eq(false)
        expect(res[:disabled]).to eq(true)
        expect(res[:target]).to eq(o)
        expect(res[:user_type]).to eq('communicator')
        expect(res[:key]).to eq(rnd)

        u2 = User.create        
        res = Organization.parse_activation_code(code, u2)
        expect(res).to_not eq(nil)
        expect(res[:disabled]).to eq(true)
        o.reload
        expect(o.user?(u2)).to eq(false)
      end

      it "should return false on missing start code" do
        o = Organization.create
        code = Organization.activation_code(o, {})
        expect(code).to_not eq(nil)
        rnd = "1#{code[-11..-8]}"
        o.reload

        expect(Organization.remove_start_code(o, 'asdf')).to eq(false)
        expect(Organization.remove_start_code(o, code + 'a')).to eq(false)
      end
    end
  end

  describe "data_policy" do
    it "should return empty hash by default" do
      o = Organization.create
      expect(o.data_policy).to eq({})
    end

    it "should return stored data policy" do
      o = Organization.create
      o.settings['data_policy'] = {'geo_logging_allowed' => false}
      o.save
      expect(o.data_policy).to eq({'geo_logging_allowed' => false})
    end

    it "should update data policy with audit trail" do
      o = Organization.create
      u = User.create
      o.update_data_policy({
        'geo_logging_allowed' => false,
        'retention_months' => 24
      }, u)
      o.save

      expect(o.data_policy['geo_logging_allowed']).to eq(false)
      expect(o.data_policy['retention_months']).to eq(24)
      expect(o.data_policy['updated_by']).to eq(u.global_id)
      expect(o.data_policy['updated_at']).to_not be_nil
      expect(o.data_policy_version).to eq(1)

      audit = AuditEvent.last
      expect(audit.data['type']).to eq('data_policy_update')
      expect(audit.data['organization_id']).to eq(o.global_id)
    end

    it "should increment version on each update" do
      o = Organization.create
      u = User.create
      o.update_data_policy({'geo_logging_allowed' => false}, u)
      o.save
      expect(o.data_policy_version).to eq(1)

      o.update_data_policy({'retention_months' => 12}, u)
      o.save
      expect(o.data_policy_version).to eq(2)
    end

    it "should only accept valid policy keys" do
      o = Organization.create
      u = User.create
      o.update_data_policy({
        'geo_logging_allowed' => false,
        'evil_key' => 'injected',
        'retention_months' => 12
      }, u)
      o.save

      expect(o.data_policy['geo_logging_allowed']).to eq(false)
      expect(o.data_policy['retention_months']).to eq(12)
      expect(o.data_policy['evil_key']).to be_nil
    end

    it "should merge parent org policy with most restrictive winning" do
      parent = Organization.create
      parent.settings['data_policy'] = {
        'geo_logging_allowed' => false,
        'retention_months' => 12
      }
      parent.save

      child = Organization.create(parent_organization_id: parent.id)
      child.settings['data_policy'] = {
        'geo_logging_allowed' => true,
        'retention_months' => 24,
        'log_publishing_allowed' => false
      }
      child.save

      policy = child.effective_data_policy
      expect(policy['geo_logging_allowed']).to eq(false)
      expect(policy['retention_months']).to eq(12)
      expect(policy['log_publishing_allowed']).to eq(false)
    end

    it "should accept data_policy through process_params" do
      o = Organization.create
      u = User.create
      o.process({'data_policy' => {'geo_logging_allowed' => false}}, {'updater' => u})
      o.save

      expect(o.data_policy['geo_logging_allowed']).to eq(false)
      expect(o.data_policy_version).to eq(1)
    end
  end
end
