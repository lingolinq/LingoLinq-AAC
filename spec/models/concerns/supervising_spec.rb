require 'spec_helper'

describe Supervising, :type => :model do
  describe "linking" do
    it "should grant permissions to supervisors" do
      u = User.create
      u2 = User.create
      expect(u.permissions_for(u2)).to eq({
        'user_id' => u2.global_id,
        'view_existence' => true
      })
      User.link_supervisor_to_user(u2, u, nil, false)
      expect(u.permissions_for(u2)).to eq({
        'user_id' => u2.global_id,
        'view_existence' => true,
        'view_detailed' => true,
        'view_deleted_boards' => true,
        'view_word_map' => true,
        'set_goals' => true,
        'model' => true,
        'supervise' => true
      })
      User.link_supervisor_to_user(u2, u, nil, true)

      expect(u2.edit_permission_for?(u)).to eq(true)
      expect(u.permissions_for(u2)).to eq({
        'user_id' => u2.global_id,
        'manage_supervision' => true,
        'view_existence' => true,
        'view_detailed' => true,
        'view_deleted_boards' => true,
        'view_word_map' => true,
        'supervise' => true,
        'set_goals' => true,
        'edit_boards' => true,
        'model' => true,
        'edit' => true
      })
    end

    it "should limit permissions to modeling-only supervisors" do
      u = User.create
      u2 = User.create
      u2.expires_at = 2.days.ago
      u2.save
      expect(u.permissions_for(u2)).to eq({
        'user_id' => u2.global_id,
        'view_existence' => true
      })
      User.link_supervisor_to_user(u2, u, nil, false)
      expect(u2.modeling_only?).to eq(true)
      expect(u.permissions_for(u2)).to eq({
        'user_id' => u2.global_id,
        'view_existence' => true,
        'view_detailed' => true,
        'view_word_map' => true,
        'model' => true,
      })
      User.link_supervisor_to_user(u2, u, nil, true)

      expect(u2.edit_permission_for?(u)).to eq(false)
      expect(u.permissions_for(u2)).to eq({
        'user_id' => u2.global_id,
        'view_existence' => true,
        'view_detailed' => true,
        'view_word_map' => true,
        'model' => true
      })
      expect(u2).to receive(:modeling_only?).and_return(false)
      expect(u2.edit_permission_for?(u)).to eq(true)
    end
    it "should error on supervisee failure when editing" do
      res = User.process_new({:supervisee_code => "1_1"})
      expect(res.errored?).to eq(true)
      expect(res.processing_errors).to eq(["can't modify supervisees on create"])
      
      u = User.create
      code = u.generate_link_code
      expect(code).not_to eq(nil)
      u.expires_at = 12.months.ago
      u.save
      res = User.create
      res.process({:supervisee_code => code})
      expect(res.errored?).to eq(false)
      expect(res.supervised_user_ids).to eq([])
    end
    
    it "should unlink a user and supervisor" do
      u = User.create
      u2 = User.create()
      User.link_supervisor_to_user(u2, u, nil, false)
      expect(u2.supervised_user_ids).to eq([u.global_id])
      expect(u.supervisor_user_ids).to eq([u2.global_id])
      User.unlink_supervisor_from_user(u2, u)
      expect(u2.supervised_user_ids).to eq([])
      expect(u.supervisor_user_ids).to eq([])
    end
    
    it "should auto-set a supervisor as a supporter role" do
      u = User.create
      u2 = User.create
      expect(u2.settings['preferences']['role']).to eq('communicator')
      User.link_supervisor_to_user(u2, u)
      expect(u2.settings['preferences']['role']).to eq('supporter')
    end
    
    it "should auto-set a supervisor as a supporter role if already set" do
      u = User.create
      u2 = User.create
      expect(u2.settings['preferences']['role']).to eq('communicator')
      User.link_supervisor_to_user(u2, u)
      expect(u2.settings['preferences']['role']).to eq('supporter')
      u2.settings['preferences']['role'] = 'communicator'
      u2.save
      u3 = User.create
      User.link_supervisor_to_user(u2, u3)
      expect(u2.settings['preferences']['role']).to eq('supporter')
    end
    
    it "should set the org unit id if defined" do
      u1 = User.create
      u2 = User.create
      User.link_supervisor_to_user(u1, u2, nil, true, '1_1')
      expect(UserLink.links_for(u1)).to eq([{
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(u1),
        'type' => 'supervisor',
        'state' => {
          'edit_permission' => true, 
          'supervisor_user_name' => u1.user_name,
          'supervisee_user_name' => u2.user_name,
          'organization_unit_ids' => ['1_1']
        }
      }])
      expect(u2.settings['supervisors']).to eq(nil)

      User.link_supervisor_to_user(u1.reload, u2.reload, nil, true, '1_2')
      expect(UserLink.links_for(u1.reload)).to eq([{
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(u1),
        'type' => 'supervisor',
        'state' => {
          'edit_permission' => true, 
          'supervisor_user_name' => u1.user_name,
          'supervisee_user_name' => u2.user_name,
          'organization_unit_ids' => ['1_1', '1_2']
        }
      }])
      expect(u2.settings['supervisors']).to eq(nil)
    end

    it "should correctly handle multiple org unit ids" do
      u1 = User.create
      u2 = User.create
      User.link_supervisor_to_user(u1, u2, nil, true, '1_1')
      expect(UserLink.count).to eq(1)
      expect(u2.reload.supervisor_links).to eq([{
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(u1),
        'type' => 'supervisor',
        'state' => {
          'edit_permission' => true,
          'organization_unit_ids' => ['1_1'],
          'supervisor_user_name' => u1.user_name,
          'supervisee_user_name' => u2.user_name
        }
      }])
      expect(u1.reload.supervisee_links).to eq([{
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(u1),
        'type' => 'supervisor',
        'state' => {
          'edit_permission' => true,
          'organization_unit_ids' => ['1_1'],
          'supervisor_user_name' => u1.user_name,
          'supervisee_user_name' => u2.user_name
        }
      }])
      expect(u2.settings['supervisors']).to eq(nil)

      User.link_supervisor_to_user(u1, u2, nil, true, '1_2')
      expect(u2.reload.supervisor_links).to eq([{
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(u1),
        'type' => 'supervisor',
        'state' => {
          'edit_permission' => true,
          'organization_unit_ids' => ['1_1', '1_2'],
          'supervisor_user_name' => u1.user_name,
          'supervisee_user_name' => u2.user_name
        }
      }])
      expect(u1.reload.supervisee_links).to eq([{
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(u1),
        'type' => 'supervisor',
        'state' => {
          'edit_permission' => true,
          'organization_unit_ids' => ['1_1', '1_2'],
          'supervisor_user_name' => u1.user_name,
          'supervisee_user_name' => u2.user_name
        }
      }])
      expect(u2.settings['supervisors']).to eq(nil)

      User.link_supervisor_to_user(u1, u2, nil, true, '1_2')
      expect(u2.reload.supervisor_links).to eq([{
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(u1),
        'type' => 'supervisor',
        'state' => {
          'edit_permission' => true,
          'organization_unit_ids' => ['1_1', '1_2'],
          'supervisor_user_name' => u1.user_name,
          'supervisee_user_name' => u2.user_name
        }
      }])
      expect(u2.settings['supervisors']).to eq(nil)

      User.link_supervisor_to_user(u1, u2, nil, true, '1_3')
      expect(u2.reload.supervisor_links).to eq([{
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(u1),
        'type' => 'supervisor',
        'state' => {
          'edit_permission' => true,
          'organization_unit_ids' => ['1_1', '1_2', '1_3'],
          'supervisor_user_name' => u1.user_name,
          'supervisee_user_name' => u2.user_name
        }
      }])
      expect(u2.settings['supervisors']).to eq(nil)
      
      User.unlink_supervisor_from_user(u1, u2, '1_2')
      expect(u2.reload.supervisor_links).to eq([{
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(u1),
        'type' => 'supervisor',
        'state' => {
          'edit_permission' => true,
          'organization_unit_ids' => ['1_1', '1_3'],
          'supervisor_user_name' => u1.user_name,
          'supervisee_user_name' => u2.user_name
        }
      }])
      expect(u2.settings['supervisors']).to eq(nil)

      User.unlink_supervisor_from_user(u1, u2, '1_1')
      expect(u2.reload.supervisor_links).to eq([{
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(u1),
        'type' => 'supervisor',
        'state' => {
          'edit_permission' => true,
          'organization_unit_ids' => ['1_3'],
          'supervisor_user_name' => u1.user_name,
          'supervisee_user_name' => u2.user_name
        }
      }])
      expect(u2.settings['supervisors']).to eq(nil)

      User.unlink_supervisor_from_user(u1, u2, '1_3')
      expect(u2.reload.supervisor_links).to eq([])
      expect(u2.settings['supervisors']).to eq(nil)
    end
  end

  describe "adding and removing" do
    it "should allow adding a supervisor by key when editing" do
      u = User.create
      u2 = User.create
      u2.process({'supervisor_key' => "add-#{u.global_id}"})
      expect(u2.reload.supervisor_links).to eq([
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(u),
        'type' => 'supervisor', 
        'state' => {
          'organization_unit_ids' => [],
          'supervisor_user_name' => u.user_name,
          'supervisee_user_name' => u2.user_name
        }
      ])
      expect(u2.reload.settings['supervisors']).to eq(nil)
      expect(u.reload.supervisee_links).to eq([
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(u),
        'type' => 'supervisor', 
        'state' => {
          'organization_unit_ids' => [],
          'supervisor_user_name' => u.user_name,
          'supervisee_user_name' => u2.user_name
        }
      ])
      expect(u.reload.settings['supervisees']).to eq(nil)
    end

    it "should allow adding an edit supervisor by key when editing" do
      u = User.create
      u2 = User.create
      u2.process({'supervisor_key' => "add_edit-#{u.global_id}"})
      expect(u2.reload.supervisor_links).to eq([
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(u),
        'type' => 'supervisor', 
        'state' => {
          'edit_permission' => true,
          'organization_unit_ids' => [],
          'supervisor_user_name' => u.user_name,
          'supervisee_user_name' => u2.user_name
        }
      ])
      expect(u2.reload.settings['supervisors']).to eq(nil)
      expect(u.reload.supervisee_links).to eq([
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(u),
        'type' => 'supervisor', 
        'state' => {
          'edit_permission' => true,
          'organization_unit_ids' => [],
          'supervisor_user_name' => u.user_name,
          'supervisee_user_name' => u2.user_name
        }
      ])
      expect(u.reload.settings['supervisees']).to eq(nil)
      perms = u2.permissions_for(u)
      expect(perms['edit']).to eq(true)
      expect(perms['edit_boards']).to eq(true)
      expect(perms['delete']).to eq(nil)
      expect(perms['supervise']).to eq(true)
      expect(perms['model']).to eq(true)
      expect(perms['view_detailed']).to eq(true)
      expect(perms['view_existence']).to eq(true)
      expect(perms['view_word_map']).to eq(true)
    end

    it "should allow adding a supervisor while granting a premium credit" do
      u = User.create
      u2 = User.create
      u2.settings['subscription']['purchased_supporters'] = 3
      u2.save!
      u2.process({'supervisor_key' => "add_premium_edit-#{u.global_id}"})
      expect(u2.reload.supervisor_links).to eq([
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(u),
        'type' => 'supervisor', 
        'state' => {
          'edit_permission' => true,
          'organization_unit_ids' => [],
          'supervisor_user_name' => u.user_name,
          'supervisee_user_name' => u2.user_name
        }
      ])
      expect(u2.reload.settings['supervisors']).to eq(nil)
      expect(u.reload.supervisee_links).to eq([
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(u),
        'type' => 'supervisor', 
        'state' => {
          'edit_permission' => true,
          'organization_unit_ids' => [],
          'supervisor_user_name' => u.user_name,
          'supervisee_user_name' => u2.user_name
        }
      ])
      expect(u.reload.settings['supervisees']).to eq(nil)
      expect(u.billing_state).to eq(:premium_supporter)
      expect(u2.reload.premium_supporter_grants).to eq(2)
    end

    it "should not allow adding a supervisor with premium credit if none available" do
      u = User.create
      u2 = User.create
      u2.process({'supervisor_key' => "add_premium_edit-#{u.global_id}_granted"})
      expect(u2.reload.supervisor_links).to eq([
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(u),
        'type' => 'supervisor', 
        'state' => {
          'edit_permission' => true,
          'organization_unit_ids' => [],
          'supervisor_user_name' => u.user_name,
          'supervisee_user_name' => u2.user_name
        }
      ])
      expect(u2.reload.settings['supervisors']).to eq(nil)
      expect(u.reload.supervisee_links).to eq([
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(u),
        'type' => 'supervisor', 
        'state' => {
          'edit_permission' => true,
          'organization_unit_ids' => [],
          'supervisor_user_name' => u.user_name,
          'supervisee_user_name' => u2.user_name
        }
      ])
      expect(u.reload.settings['supervisees']).to eq(nil)
      expect(u.billing_state).to eq(:trialing_supporter)
    end

    it "should allow adding a modeling-only supervisor" do
      u = User.create
      u2 = User.create
      u2.process({'supervisor_key' => "add_modeling-#{u.global_id}"})
      expect(u2.reload.supervisor_links).to eq([
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(u),
        'type' => 'supervisor', 
        'state' => {
          'modeling_only' => true,
          'organization_unit_ids' => [],
          'supervisor_user_name' => u.user_name,
          'supervisee_user_name' => u2.user_name
        }
      ])
      expect(u2.reload.settings['supervisors']).to eq(nil)
      expect(u.reload.supervisee_links).to eq([
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(u),
        'type' => 'supervisor', 
        'state' => {
          'modeling_only' => true,
          'organization_unit_ids' => [],
          'supervisor_user_name' => u.user_name,
          'supervisee_user_name' => u2.user_name
        }
      ])
      expect(u.reload.settings['supervisees']).to eq(nil)
      expect(u.modeling_only_for?(u2)).to eq(true)
      perms = u2.permissions_for(u)
      expect(perms['edit']).to eq(nil)
      expect(perms['edit_boards']).to eq(nil)
      expect(perms['delete']).to eq(nil)
      expect(perms['supervise']).to eq(nil)
      expect(perms['model']).to eq(true)
      expect(perms['view_detailed']).to eq(true)
      expect(perms['view_existence']).to eq(true)
      expect(perms['view_word_map']).to eq(true)
    end

    it "should raise an error when supervisor adding fails" do
      res = User.process_new({'supervisor_key' => "add-bacon"})
      expect(res.errored?).to eql(true)
    end
    
    it "should allow removing a supervisor by key when editing" do
      u = User.create
      u2 = User.create
      User.link_supervisor_to_user(u2, u)
      expect(u.reload.supervisor_links).to eq([{
        'user_id' => u.global_id,
        'record_code' => Webhook.get_record_code(u2),
        'type' => 'supervisor',
        'state' => {
          'edit_permission' => true,
          'supervisor_user_name' => u2.user_name,
          'supervisee_user_name' => u.user_name,
          'organization_unit_ids' => []
        }
      }])
      expect(u.reload.settings['supervisors']).to eq(nil)
      expect(u2.reload.supervisee_links).to eq([{
        'user_id' => u.global_id,
        'record_code' => Webhook.get_record_code(u2),
        'type' => 'supervisor',
        'state' => {
          'edit_permission' => true,
          'supervisor_user_name' => u2.user_name,
          'supervisee_user_name' => u.user_name,
          'organization_unit_ids' => []
        }
      }])
      expect(u2.reload.settings['supervisees']).to eq(nil)
      u.process({'supervisor_key' => "remove_supervisor-#{u2.global_id}"})
      expect(u.reload.supervisor_links).to eq([])
      expect(u.reload.settings['supervisors']).to eq(nil)
      expect(u2.reload.supervisee_links).to eq([])
      expect(u2.reload.settings['supervisees']).to eq([])
    end

    it "should not block update when supervisor remove fails with invalid id" do
      u = User.create
      u.process({'supervisor_key' => "remove_supervisor-0_1"})
      expect(u.errored?).to eql(false)
    end
    
    it "should allow removing a supervisee by key when editing" do
      u = User.create
      u2 = User.create
      User.link_supervisor_to_user(u2, u)
      expect(u.reload.supervisor_links).to eq([{
        'user_id' => u.global_id,
        'record_code' => Webhook.get_record_code(u2),
        'type' => 'supervisor',
        'state' => {
          'edit_permission' => true,
          'supervisor_user_name' => u2.user_name,
          'supervisee_user_name' => u.user_name,
          'organization_unit_ids' => []
        }
      }])
      expect(u.reload.settings['supervisors']).to eq(nil)
      expect(u2.reload.supervisee_links).to eq([{
        'user_id' => u.global_id,
        'record_code' => Webhook.get_record_code(u2),
        'type' => 'supervisor',
        'state' => {
          'edit_permission' => true,
          'supervisor_user_name' => u2.user_name,
          'supervisee_user_name' => u.user_name,
          'organization_unit_ids' => []
        }
      }])
      expect(u2.reload.settings['supervisees']).to eq(nil)
      u2.process({'supervisor_key' => "remove_supervisee-#{u.global_id}"})
      expect(u.reload.supervisor_links).to eq([])
      expect(u.reload.settings['supervisors']).to eq(nil)
      expect(u2.reload.supervisee_links).to eq([])
      expect(u2.reload.settings['supervisees']).to eq([])
    end
    
    it "should not block update when supervisee remove fails with invalid id" do
      u = User.create
      u.process({'supervisor_key' => "remove_supervisee-0_1"})
      expect(u.errored?).to eql(false)
    end
    
    it "should allow approving a pending org" do
      u = User.create
      o = Organization.create(:settings => {'total_licenses' => 1})
      expect(o.reload.managed_user?(u)).to eq(false)
      o.add_user(u.user_name, true)
      expect(o.reload.managed_user?(u.reload)).to eq(true)
      expect(o.reload.pending_user?(u)).to eq(true)
      u.reload.process({'supervisor_key' => "approve-org"})
      expect(o.reload.managed_user?(u)).to eq(true)
      expect(o.reload.pending_user?(u)).to eq(false)
    end
    
    it "should allow approving a pending superivision org" do
      u = User.create
      o = Organization.create(:settings => {'total_licenses' => 1})
      expect(o.reload.managed_user?(u)).to eq(false)
      o.add_supervisor(u.user_name, true)
      expect(o.reload.pending_supervisor?(u.reload)).to eq(true)
      expect(o.reload.supervisor?(u)).to eq(true)
      u.reload.process({'supervisor_key' => "approve_supervision-#{o.global_id}"})
      expect(o.reload.pending_supervisor?(u)).to eq(false)
      expect(o.reload.supervisor?(u)).to eq(true)
    end
    
    it "should not error when re-approving an already-approved pending supervision org" do
      u = User.create
      o = Organization.create(:settings => {'total_licenses' => 1})
      expect(o.reload.managed_user?(u)).to eq(false)
      o.add_supervisor(u.user_name, true)
      expect(o.reload.pending_supervisor?(u.reload)).to eq(true)
      expect(o.reload.supervisor?(u)).to eq(true)
      u.reload.process({'supervisor_key' => "approve_supervision-#{o.global_id}"})
      expect(o.reload.pending_supervisor?(u)).to eq(false)
      expect(o.reload.supervisor?(u)).to eq(true)
      
      expect(u.process_supervisor_key("approve_supervision-#{o.global_id}")).to eq(true)
    end
    
    it "should allow rejecting a pending supervision org" do
      u = User.create
      o = Organization.create(:settings => {'total_licenses' => 1})
      expect(o.reload.managed_user?(u)).to eq(false)
      o.add_supervisor(u.user_name, true)
      expect(o.reload.pending_supervisor?(u.reload)).to eq(true)
      expect(o.reload.supervisor?(u)).to eq(true)
      u.reload.process({'supervisor_key' => "approve_supervision-#{o.global_id}"})
      expect(o.reload.pending_supervisor?(u.reload)).to eq(false)
      expect(o.reload.supervisor?(u)).to eq(true)
      
      expect(u.process_supervisor_key("remove_supervision-#{o.global_id}")).to eq(true)
      expect(o.reload.pending_supervisor?(u.reload)).to eq(false)
      expect(o.reload.supervisor?(u)).to eq(false)
    end

    it "should allow adding a start code" do
      u = User.create
      expect(Organization).to receive(:parse_activation_code).with('asdf', u).and_return({:disabled => true}).exactly(2).times
      expect(u.process_supervisor_key("start-asdf")).to eq(false)
      expect(u.process({'supervisor_key' => "start-asdf"})).to eq(true)
    end

    it "should allow using a supporter code for a new supporter" do
      u = User.create
      u2 = User.create
      u2.settings['subscription']['purchased_supporters'] = 3
      u2.save!
      u2.process({'supervisor_key' => "add_premium_edit-#{u.global_id}"})
      expect(u2.reload.supervisor_links).to eq([
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(u),
        'type' => 'supervisor', 
        'state' => {
          'edit_permission' => true,
          'organization_unit_ids' => [],
          'supervisor_user_name' => u.user_name,
          'supervisee_user_name' => u2.user_name
        }
      ])
      expect(u2.reload.settings['supervisors']).to eq(nil)
      expect(u.reload.supervisee_links).to eq([
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(u),
        'type' => 'supervisor', 
        'state' => {
          'edit_permission' => true,
          'organization_unit_ids' => [],
          'supervisor_user_name' => u.user_name,
          'supervisee_user_name' => u2.user_name
        }
      ])
      expect(u.reload.settings['supervisees']).to eq(nil)
      expect(u.billing_state).to eq(:premium_supporter)
      expect(u2.reload.premium_supporter_grants).to eq(2)
    end

    it "should allow using a supporter code for an already-added supporter" do
      u = User.create
      u2 = User.create
      User.link_supervisor_to_user(u, u2, nil, true)
      u2.settings['subscription']['purchased_supporters'] = 3
      u2.save!
      u2.process({'supervisor_key' => "add_premium_edit-#{u.global_id}"})
      expect(u2.reload.supervisor_links).to eq([
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(u),
        'type' => 'supervisor', 
        'state' => {
          'edit_permission' => true,
          'organization_unit_ids' => [],
          'supervisor_user_name' => u.user_name,
          'supervisee_user_name' => u2.user_name
        }
      ])
      expect(u2.reload.settings['supervisors']).to eq(nil)
      expect(u.reload.supervisee_links).to eq([
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(u),
        'type' => 'supervisor', 
        'state' => {
          'edit_permission' => true,
          'organization_unit_ids' => [],
          'supervisor_user_name' => u.user_name,
          'supervisee_user_name' => u2.user_name
        }
      ])
      expect(u.reload.settings['supervisees']).to eq(nil)
      expect(u.billing_state).to eq(:premium_supporter)
      expect(u2.reload.premium_supporter_grants).to eq(2)
    end

    it "should not use one of my credits if the supporter is already premium" do
      u = User.create
      u2 = User.create
      u.subscription_override('granted_supporter')
      expect(u.billing_state).to eq(:premium_supporter)
      User.link_supervisor_to_user(u, u2, nil, true, 'granted')
      u2.settings['subscription']['purchased_supporters'] = 3
      u2.save!
      u2.process({'supervisor_key' => "add_premium_edit-#{u.global_id}"})
      expect(u2.reload.supervisor_links).to eq([
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(u),
        'type' => 'supervisor', 
        'state' => {
          'edit_permission' => true,
          'organization_unit_ids' => [],
          'supervisor_user_name' => u.user_name,
          'supervisee_user_name' => u2.user_name
        }
      ])
      expect(u2.reload.settings['supervisors']).to eq(nil)
      expect(u.reload.supervisee_links).to eq([
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(u),
        'type' => 'supervisor', 
        'state' => {
          'edit_permission' => true,
          'organization_unit_ids' => [],
          'supervisor_user_name' => u.user_name,
          'supervisee_user_name' => u2.user_name
        }
      ])
      expect(u.reload.settings['supervisees']).to eq(nil)
      expect(u.billing_state).to eq(:premium_supporter)
      expect(u2.reload.premium_supporter_grants).to eq(3)
    end

    it "should use one of my credits if the supporter is in the trial period still" do
      u = User.create
      u2 = User.create
      u2.settings['subscription']['purchased_supporters'] = 3
      u2.save!
      u2.process({'supervisor_key' => "add_premium_edit-#{u.global_id}"})
      expect(u2.reload.supervisor_links).to eq([
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(u),
        'type' => 'supervisor', 
        'state' => {
          'edit_permission' => true,
          'organization_unit_ids' => [],
          'supervisor_user_name' => u.user_name,
          'supervisee_user_name' => u2.user_name
        }
      ])
      expect(u2.reload.settings['supervisors']).to eq(nil)
      expect(u.reload.supervisee_links).to eq([
        'user_id' => u2.global_id,
        'record_code' => Webhook.get_record_code(u),
        'type' => 'supervisor', 
        'state' => {
          'edit_permission' => true,
          'organization_unit_ids' => [],
          'supervisor_user_name' => u.user_name,
          'supervisee_user_name' => u2.user_name
        }
      ])
      expect(u.reload.settings['supervisees']).to eq(nil)
      expect(u.billing_state).to eq(:premium_supporter)
      expect(u2.reload.premium_supporter_grants).to eq(2)
    end
    
    it "should set a user to not-pending if they approve a pending org" do
      u = User.create
      o = Organization.create(:settings => {'total_licenses' => 1})
      expect(o.reload.managed_user?(u)).to eq(false)
      o.add_user(u.user_name, true)
      expect(o.reload.managed_user?(u.reload)).to eq(true)
      expect(o.reload.pending_user?(u)).to eq(true)
      u.reload.process({'supervisor_key' => "approve-org"})
      expect(o.reload.managed_user?(u.reload)).to eq(true)
      expect(o.reload.pending_user?(u)).to eq(false)
      expect(u.settings['pending']).to eq(false)
    end
    
    it "should allow rejecting a pending org" do
      u = User.create
      o = Organization.create(:settings => {'total_licenses' => 1})
      expect(o.reload.managed_user?(u)).to eq(false)
      o.add_user(u.user_name, true)
      expect(o.reload.managed_user?(u.reload)).to eq(true)
      expect(o.reload.pending_user?(u)).to eq(true)
      u.reload.process({'supervisor_key' => "remove_supervisor-org"})
      expect(o.reload.managed_user?(u.reload)).to eq(false)
      expect(o.reload.pending_user?(u)).to eq(false)
      expect(UserLink.links_for(u)).to eq([])
      expect(u.reload.managing_organization).to eq(nil)
    end
    
    it "should update a user's subscription if they're on a free trial and get added as a supervisor" do
      u = User.create
      u2 = User.create
      expect(u.reload.billing_state).to eq(:trialing_communicator)
      User.link_supervisor_to_user(u, u2)
      expect(u.reload.billing_state).to eq(:trialing_supporter)
      expect(u.grace_period?).to eq(true)
    end
    
    it "should unsubscribe an auto-subscribed user if they were on a free trial, got added as a supervisor, and then removed" do
      u = User.create
      exp = u.expires_at.to_i
      u2 = User.create
      expect(u.reload.billing_state).to eq(:trialing_communicator)
      User.link_supervisor_to_user(u, u2)
      expect(u.reload.billing_state).to eq(:trialing_supporter)
      expect(u.grace_period?).to eq(true)

      User.unlink_supervisor_from_user(u, u2)
      expect(u.reload.billing_state).to eq(:trialing_communicator)
      expect(u.expires_at.to_i).to be > (exp - 5)
      expect(u.expires_at.to_i).to be < (exp + 5)
      expect(u.grace_period?).to eq(true)
    end
    
    it "should remove all supervisors when a user subscribes to a free supporter plan" do
      u = User.create
      u2 = User.create
      u3 = User.create
      User.link_supervisor_to_user(u3, u)
      expect(UserLink.count).to eq(1)
      u.reload
      expect(u.reload.billing_state).to eq(:trialing_communicator)
      User.link_supervisor_to_user(u.reload, u2.reload)
      expect(UserLink.count).to eq(2)
      u.reload
      expect(u.reload.billing_state).to eq(:trialing_supporter)
      expect(u.grace_period?).to eq(true)
      expect(u.supervisors).to eq([u3])
      Worker.process_queues
      expect(UserLink.count).to eq(1)
      expect(u.reload.supervisors).to eq([])
    end
  end
  
  describe "managed_users" do
    it "should not grant permissions for the manager of a pending org invite" do
      u = User.create
      u2 = User.create
      o = Organization.create(:settings => {'total_licenses' => 1})
      o.add_manager(u.user_name, true)
      o.add_user(u2.user_name, true)
      
      u2.reload
      u.reload
      expect(u2.permissions_for(u)).not_to be_include('manage_supervision')
    end
    
    it "should grant manage_supervision permission for the manager of a managing org" do
      u = User.create
      u2 = User.create
      o = Organization.create(:settings => {'total_licenses' => 1})
      o.add_manager(u.user_name, true)
      o.add_user(u2.user_name, false)
      
      u2.reload
      u.reload
      expect(u2.permissions_for(u)).to be_include('manage_supervision')
    end
    
    it "should not grand manage_supervision permission for the assistant of a managing org" do
      u = User.create
      u2 = User.create
      o = Organization.create(:settings => {'total_licenses' => 1})
      o.add_manager(u.user_name, false)
      o.add_user(u2.user_name, false)
      
      u2.reload
      u.reload
      expect(u2.permissions_for(u)).not_to be_include('manage_supervision')
    end
  end
  
  describe "organization_hash" do
    it "should include new-fashioned managing org" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
      o.add_user(u.user_name, false, true)
      
      res = u.reload.organization_hash
      expect(res.length).to eq(1)
      expect(res[0]['id']).to eq(o.global_id)
      expect(res[0]['name']).to eq(o.settings['name'])
      expect(res[0]['type']).to eq('user')
      added = Time.parse(res[0]['added'])
      expect(added).to be > (Time.now - 10)
      expect(added).to be < (Time.now + 10)
      expect(res[0]['pending']).to eq(false)
      expect(res[0]['sponsored']).to eq(true)
    end
    
    it "should include all new-fashioned managed orgs" do
      o = Organization.create
      o2 = Organization.create
      u = User.create
      o.add_manager(u.user_name, true)
      
      res = u.reload.organization_hash
      expect(res.length).to eq(1)
      expect(res[0]['id']).to eq(o.global_id)
      expect(res[0]['name']).to eq(o.settings['name'])
      expect(res[0]['type']).to eq('manager')
      added = Time.parse(res[0]['added'])
      expect(added).to be > (Time.now - 10)
      expect(added).to be < (Time.now + 10)
      expect(res[0]['full_manager']).to eq(true)
      
      o2.add_manager(u.user_name, false)
      res = u.reload.organization_hash
      expect(res.length).to eq(2)
      expect(res[1]['id']).to eq(o2.global_id)
      expect(res[1]['name']).to eq(o2.settings['name'])
      expect(res[1]['type']).to eq('manager')
      added = Time.parse(res[1]['added'])
      expect(added).to be > (Time.now - 10)
      expect(added).to be < (Time.now + 10)
      expect(res[1]['full_manager']).to eq(false)
    end
    
    it "should include all supervision orgs" do
      o = Organization.create
      o2 = Organization.create
      u = User.create
      
      o.add_supervisor(u.user_name, true)
      res = u.reload.organization_hash
      expect(res.length).to eq(1)
      expect(res[0]['id']).to eq(o.global_id)
      expect(res[0]['name']).to eq(o.settings['name'])
      expect(res[0]['type']).to eq('supervisor')
      added = Time.parse(res[0]['added'])
      expect(added).to be > (Time.now - 10)
      expect(added).to be < (Time.now + 10)
      expect(res[0]['pending']).to eq(true)
      
      o2.add_supervisor(u.user_name, false)
      res = u.reload.organization_hash
      expect(res.length).to eq(2)
      expect(res[1]['id']).to eq(o2.global_id)
      expect(res[1]['name']).to eq(o2.settings['name'])
      expect(res[1]['type']).to eq('supervisor')
      added = Time.parse(res[1]['added'])
      expect(added).to be > (Time.now - 10)
      expect(added).to be < (Time.now + 10)
      expect(res[1]['pending']).to eq(false)
    end
    
    it "should not repeat org associations" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
      o.add_user(u.user_name, false, true)

      res = u.reload.organization_hash
      expect(res.length).to eq(1)
      expect(res[0]['id']).to eq(o.global_id)
      expect(res[0]['name']).to eq(o.settings['name'])
      expect(res[0]['type']).to eq('user')
      added = Time.parse(res[0]['added'])
      expect(added).to be > (Time.now - 10)
      expect(added).to be < (Time.now + 10)
      expect(res[0]['pending']).to eq(false)
      expect(res[0]['sponsored']).to eq(true)
    end
  end
end
