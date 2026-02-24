require 'spec_helper'

describe OrganizationUnit, :type => :model do
  describe "generate_defaults" do
    it "should generate default values" do
      u = OrganizationUnit.new
      expect(u.settings).to eq(nil)
      u.generate_defaults
      expect(u.settings).to eq({})
    end
  end
  
  describe "permissions" do
    it "should allow org editors to access" do
      o = Organization.create
      ou = OrganizationUnit.create(:organization => o)
      u = User.create
      o.add_manager(u.user_name)
      u.reload
      expect(ou.permissions_for(u)).to eq({'user_id' => u.global_id, 'view' => true, 'edit' => true, 'delete' => true})
    end
    
    it "should not allow non-org editors to access" do
      o = Organization.create(:admin => true)
      ou = OrganizationUnit.create
      u = User.create
      o.add_manager(u.user_name)
      u.reload
      expect(ou.permissions_for(u)).to eq({'user_id' => u.global_id})
    end
    
    it "should allow admins to view_stats" do
      o = Organization.create
      ou = OrganizationUnit.create(:organization => o)
      u = User.create
      o.add_manager(u.user_name, true)
      u.reload
      expect(ou.permissions_for(u)['view_stats']).to eq(true)
    end
    
    it "should allow supervisors to view_stats" do
      o = Organization.create
      ou = OrganizationUnit.create(:organization => o)
      u = User.create
      o.add_supervisor(u.user_name, false)
      u.reload
      expect(ou.reload.permissions_for(u)['view_stats']).to eq(nil)
      expect(ou.add_supervisor(u.user_name)).to eq(true)
      u.reload
      expect(ou.reload.permissions_for(u)['view_stats']).to eq(true)
    end
    
    it "should not allow assistants to view_stats" do
      o = Organization.create
      ou = OrganizationUnit.create(:organization => o)
      u = User.create
      o.add_manager(u.user_name, false)
      u.reload
      expect(ou.permissions_for(u)['view_stats']).to eq(nil)
    end
    
    it "should not allow communicators to view_stats" do
      o = Organization.create
      ou = OrganizationUnit.create(:organization => o)
      u = User.create
      o.add_user(u.user_name, false, false)
      u.reload
      expect(ou.permissions_for(u)['view_stats']).to eq(nil)
      expect(ou.add_communicator(u.user_name)).to eq(true)
      u.reload
      expect(ou.permissions_for(u)['view_stats']).to eq(nil)
    end 
  end
  
  describe "process_params" do
    it "should raise error if organization is not set" do
      expect{ OrganizationUnit.process_new({}, {}) }.to raise_error("organization required")
    end
    
    it "should set the name" do
      o = Organization.create
      ou = OrganizationUnit.process_new({'name' => 'Best Room'}, {'organization' => o})
      expect(ou.settings['name']).to eq('Best Room')
    end
    
    it "should call process_action if needed" do
      o = Organization.create
      ou = OrganizationUnit.create(:organization => o)
      expect(ou).to receive(:process_action).with('whatever').and_return(true)
      ou.process({'management_action' => 'whatever'})
    end
    
    it "should fail if process_action returns false" do
      o = Organization.create
      ou = OrganizationUnit.create(:organization => o)
      res = ou.process({'management_action' => 'whatever'})
      expect(res).to eq(false)
      expect(ou.processing_errors).to eq(["management_action was unsuccessful, whatever"])
    end
    
    it "should sanitize name" do
      o = Organization.create
      ou = OrganizationUnit.process_new({'name' => '<b>Best</b> Room'}, {'organization' => o})
      expect(ou.organization).to eq(o)
      expect(ou.settings['name']).to eq('Best Room')
    end

    it "should allow attaching a goal to the org" do
      o = Organization.create
      ou = OrganizationUnit.process_new({'name' => '<b>Best</b> Room', 'goal' => {'id' => '1234'}}, {'organization' => o})
      expect(ou.organization).to eq(o)
      expect(ou.settings['name']).to eq('Best Room')
      expect(ou.user_goal).to eq(nil)

      u = User.create
      ou = OrganizationUnit.create(organization: o)
      g = UserGoal.create(user: u, settings: {'organization_unit_id' => ou.global_id})
      ou.process({'name' => '<b>Best</b> Room', 'goal' => {'id' => g.global_id}}, {'organization' => o})
      expect(ou.organization).to eq(o)
      expect(ou.settings['name']).to eq('Best Room')
      expect(ou.user_goal).to eq(g)
      expect(Worker.scheduled?(OrganizationUnit, :perform_action, {id: ou.id, method: 'assert_goal', arguments: []})).to eq(true)
    end

    it "should handle removing a goal from the org" do
      u = User.create
      o = Organization.create
      ou = OrganizationUnit.create(organization: o)
      g = UserGoal.create(user: u, settings: {'organization_unit_id' => ou.global_id})
      ou.process({'name' => '<b>Best</b> Room', 'goal' => {'id' => g.global_id}}, {'organization' => o})
      expect(ou.organization).to eq(o)
      expect(ou.settings['name']).to eq('Best Room')
      expect(ou.user_goal).to eq(g)

      ou.process({'goal' => nil})
      expect(ou.user_goal).to eq(g)

      ou.process({'goal' => {'remove' => true}})
      expect(ou.user_goal).to eq(nil)
      expect(ou.settings['goal_assertions']['removed_goal_id']).to eq(g.global_id)
      expect(Worker.scheduled?(OrganizationUnit, :perform_action, {id: ou.id, method: 'assert_goal', arguments: []})).to eq(true)
    end
  end

  describe "process_action" do
    it "should call the correct action" do
      ou = OrganizationUnit.new
      expect(ou).to receive(:add_supervisor).with('chuck', false)
      expect(ou).to receive(:add_supervisor).with('nellie', true)
      expect(ou).to receive(:remove_supervisor).with('blast')
      expect(ou).to receive(:add_communicator).with('alexis')
      expect(ou).to receive(:remove_communicator).with('charles-in_charge')
      ou.process_action('add_supervisor-chuck')
      ou.process_action('add_edit_supervisor-nellie')
      ou.process_action('remove_supervisor-blast')
      ou.process_action('add_communicator-alexis')
      ou.process_action('remove_communicator-charles-in_charge')
      ou.process_action('nothing')
    end
  end

  describe "add_supervisor" do
    it "should return false if not an org supervisor" do
      ou = OrganizationUnit.create
      expect(ou.add_supervisor('asdf')).to eq(false)
      u = User.create
      expect(ou.add_supervisor(u.user_name)).to eq(false)
    end
    
    it "should add to the list of supervisors if valid" do
      o = Organization.create
      ou = OrganizationUnit.create(:organization => o)
      u = User.create
      o.add_supervisor(u.user_name)
      expect(ou.add_supervisor(u.user_name, true)).to eq(true)
      expect(ou.settings['supervisors']).to eq(nil)
      expect(UserLink.links_for(ou)).to eq([{
        'user_id' => u.global_id,
        'record_code' => Webhook.get_record_code(ou),
        'type' => 'org_unit_supervisor', 
        'state' => {
          'edit_permission' => true,
          'user_name' => u.user_name
        }
      }])
    end
    
    it "should not duplicate the user in the list of supervisors" do
      o = Organization.create
      ou = OrganizationUnit.create(:organization => o)
      u = User.create
      ou.settings['supervisors'] = [{'user_id' => u.global_id}]
      ou.save
      expect(UserLink.links_for(ou)).to eq([])
      o.add_supervisor(u.user_name)
      expect(ou.add_supervisor(u.user_name, true)).to eq(true)
      expect(ou.add_supervisor(u.user_name, true)).to eq(true)
      expect(ou.add_supervisor(u.user_name, false)).to eq(true)
      expect(ou.settings['supervisors']).to eq([{'user_id' => u.global_id}])
      expect(UserLink.links_for(ou.reload)).to eq([{
        'user_id' => u.global_id,
        'record_code' => Webhook.get_record_code(ou),
        'type' => 'org_unit_supervisor',
        'state' => {
          'user_name' => u.user_name,
          'edit_permission' => true
        }
      }])
    end
    
    it "should schedule supervisor assertion" do
      o = Organization.create
      ou = OrganizationUnit.create(:organization => o)
      u = User.create
      o.add_supervisor(u.user_name)
      expect(ou.add_supervisor(u.user_name, true)).to eq(true)
      args = [{'user_id' => u.global_id, 'add_supervisor' => u.user_name}]
      opts = {'id' => ou.id, 'method' => 'assert_supervision', 'arguments' => args}
      expect(Worker.scheduled?(OrganizationUnit, :perform_action, opts)).to eq(true)
    end
    
    it "should track all org units tying the supervisor to the communicator" do
      o = Organization.create
      ou1 = OrganizationUnit.create(:organization => o)
      ou2 = OrganizationUnit.create(:organization => o)
      u1 = User.create
      u2 = User.create
      o.add_user(u1.global_id, false, false)
      o.add_supervisor(u2.global_id, false)
      ou1.add_communicator(u1.global_id)
      ou1.add_supervisor(u2.global_id)
      Worker.process_queues
      expect(u1.reload.supervisor_user_ids).to eq([u2.global_id])
      ou2.add_communicator(u1.global_id)
      ou2.add_supervisor(u2.global_id)
      Worker.process_queues
      expect(u1.reload.supervisor_user_ids).to eq([u2.global_id])
      expect(u1.supervisor_links.length).to eq(1)
      expect(u1.supervisor_links[0]['state']['organization_unit_ids']).to eq([ou1.global_id, ou2.global_id])
      expect(u1.settings['supervisors']).to eq(nil)
    end
  end  
  
  describe "all_user_ids" do
    it "should return all supervisors and communicators" do
      o = Organization.create
      ou = OrganizationUnit.create(:settings => {}, organization: o)
      expect(ou.all_user_ids).to eq([])
      ou.settings['supervisors'] = []
      ou.save
      expect(ou.all_user_ids).to eq([])
      ou.settings['communicators'] = []
      ou.save
      expect(ou.all_user_ids).to eq([])
      u1 = User.create
      o.add_supervisor(u1.global_id, false)
      expect(ou.add_supervisor(u1.global_id)).to eq(true)
      Worker.process_queues
      expect(ou.reload.all_user_ids).to eq([u1.global_id])
      u2 = User.create
      o.add_user(u2.global_id, false, false)
      expect(ou.add_communicator(u2.global_id)).to eq(true)
      expect(ou.reload.all_user_ids.sort).to eq([u1.global_id, u2.global_id])
    end
  end
  
  describe "remove_supervisor" do
    it "should return false if no user or org" do
      ou = OrganizationUnit.new
      expect(ou.remove_supervisor('bacon')).to eq(false)
      u = User.create
      expect(ou.remove_supervisor(u.user_name)).to eq(false)
    end
    
    it "should remove from the list of supervisors" do
      o = Organization.create
      u = User.create
      ou = OrganizationUnit.create(:organization => o, :settings => {
        'supervisors' => [{'user_id' => 'asdf'}, {'user_id' => u.global_id}]
      })
      expect(ou.remove_supervisor(u.global_id)).to eq(true)
      expect(ou.settings['supervisors'].length).to eq(1)
      expect(ou.settings['supervisors'].map{|s| s['user_id'] }).to eq(['asdf'])
    end

    it "should remove from the list of linked supervisors" do
      o = Organization.create
      u = User.create
      ou = OrganizationUnit.create(:organization => o)
      o.add_supervisor(u.global_id, false)
      expect(ou.add_supervisor(u.global_id, false)).to eq(true)
      expect(UserLink.count).to eq(2)
      expect(ou.remove_supervisor(u.global_id)).to eq(true)
      expect(ou.settings['supervisors']).to eq([])
      expect(UserLink.count).to eq(1)
    end
    
    it "should schedule supervisor assertion" do
      o = Organization.create
      ou = OrganizationUnit.create(:organization => o)
      u = User.create
      expect(ou.remove_supervisor(u.user_name)).to eq(true)
      args = [{'user_id' => u.global_id, 'remove_supervisor' => u.user_name}]
      opts = {'id' => ou.id, 'method' => 'assert_supervision', 'arguments' => args}
      expect(Worker.scheduled?(OrganizationUnit, :perform_action, opts)).to eq(true)
    end
    
    it "should not remove the supervisor if there's another connection tying them together" do
      o = Organization.create
      ou1 = OrganizationUnit.create(:organization => o)
      ou2 = OrganizationUnit.create(:organization => o)
      u1 = User.create
      u2 = User.create
      o.add_user(u1.global_id, false, false)
      o.add_supervisor(u2.global_id, false)
      ou1.add_communicator(u1.global_id)
      ou1.add_supervisor(u2.global_id)
      Worker.process_queues
      expect(u1.reload.supervisor_user_ids).to eq([u2.global_id])
      ou2.add_communicator(u1.global_id)
      ou2.add_supervisor(u2.global_id)
      Worker.process_queues
      expect(u1.reload.supervisor_user_ids).to eq([u2.global_id])
      expect(u1.supervisor_links.length).to eq(1)
      expect(u1.supervisor_links[0]['state']['organization_unit_ids']).to eq([ou1.global_id, ou2.global_id])
      expect(u1.settings['supervisors']).to eq(nil)

      ou2.remove_supervisor(u2.global_id)
      Worker.process_queues
      expect(u1.reload.supervisor_user_ids).to eq([u2.global_id])
      expect(u1.supervisor_links.length).to eq(1)
      expect(u1.supervisor_links[0]['state']['organization_unit_ids']).to eq([ou1.global_id])
      expect(u1.settings['supervisors']).to eq(nil)
    end
  end
  
  describe "add_communicator" do
    it "should return false if the user is not an org-managed user" do
      ou = OrganizationUnit.new
      expect(ou.add_communicator('bacon')).to eq(false)
      u = User.create
      expect(ou.add_communicator(u.user_name)).to eq(false)
    end

    it "should return false if the user is a pending org-managed user" do
      o = Organization.create
      ou = OrganizationUnit.create(:organization => o)
      u = User.create
      o.add_user(u.user_name, true, false)
      expect(ou.add_communicator(u.user_name)).to eq(false)
    end
    
    it "should add to the list of communicators if valid" do
      o = Organization.create
      ou = OrganizationUnit.create(:organization => o)
      u = User.create
      o.add_user(u.user_name, false, false)
      expect(ou.add_communicator(u.user_name)).to eq(true)
      expect(ou.settings['communicators']).to eq(nil)
      expect(UserLink.links_for(ou)).to eq([{
        'user_id' => u.global_id,
        'record_code' => Webhook.get_record_code(ou),
        'type' => 'org_unit_communicator',
        'state' => {
          'user_name' => u.user_name
        }
      }])
    end
    
    it "should not duplicate the user in the list" do
      o = Organization.create
      ou = OrganizationUnit.create(:organization => o)
      u = User.create
      ou.settings['communicators'] = [{'user_id' => u.global_id}]
      ou.save
      expect(UserLink.links_for(ou)).to eq([])

      o.add_user(u.user_name, false, false)
      expect(ou.add_communicator(u.user_name)).to eq(true)
      expect(ou.add_communicator(u.user_name)).to eq(true)
      expect(ou.add_communicator(u.user_name)).to eq(true)
      expect(ou.settings['communicators']).to eq([{'user_id' => u.global_id}])
      expect(UserLink.links_for(ou.reload)).to eq([{
        'user_id' => u.global_id,
        'record_code' => Webhook.get_record_code(ou),
        'type' => 'org_unit_communicator',
        'state' => {
          'user_name' => u.user_name
        }
      }])
    end
    
    it "should schedule supervisor assertion" do
      o = Organization.create
      ou = OrganizationUnit.create(:organization => o)
      u = User.create
      o.add_user(u.user_name, false, false)
      expect(ou.add_communicator(u.user_name)).to eq(true)
      args = [{'user_id' => u.global_id, 'add_communicator' => u.user_name}]
      opts = {'id' => ou.id, 'method' => 'assert_supervision', 'arguments' => args}
      expect(Worker.scheduled?(OrganizationUnit, :perform_action, opts)).to eq(true)
    end
    
    it "should track all connections between the supervisor and user" do
      o = Organization.create
      ou1 = OrganizationUnit.create(:organization => o)
      ou2 = OrganizationUnit.create(:organization => o)
      u1 = User.create
      u2 = User.create
      o.add_user(u1.global_id, false, false)
      o.add_supervisor(u2.global_id, false)
      ou1.add_communicator(u1.global_id)
      ou1.add_supervisor(u2.global_id)
      Worker.process_queues
      expect(u1.reload.supervisor_user_ids).to eq([u2.global_id])
      ou2.add_communicator(u1.global_id)
      ou2.add_supervisor(u2.global_id)
      Worker.process_queues
      expect(u1.reload.supervisor_user_ids).to eq([u2.global_id])
      expect(u1.supervisor_links.length).to eq(1)
      expect(u1.supervisor_links[0]['state']['organization_unit_ids']).to eq([ou1.global_id, ou2.global_id])
      expect(u1.settings['supervisors']).to eq(nil)
    end
  end
  
  describe "remove_communicator" do
    it "should return false if no user or org" do
      ou = OrganizationUnit.new
      expect(ou.remove_communicator('bacon')).to eq(false)
      u = User.create
      expect(ou.remove_communicator(u.user_name)).to eq(false)
    end
    
    it "should remove from the list of communicators" do
    end
    
    it "should schedule supervisor assertion" do
      o = Organization.create
      ou = OrganizationUnit.create(:organization => o)
      u = User.create
      expect(ou.remove_communicator(u.user_name)).to eq(true)
      args = [{'user_id' => u.global_id, 'remove_communicator' => u.user_name}]
      opts = {'id' => ou.id, 'method' => 'assert_supervision', 'arguments' => args}
      expect(Worker.scheduled?(OrganizationUnit, :perform_action, opts)).to eq(true)
    end
    
    it "should not remove if there are other connections between the pair" do
      o = Organization.create
      ou1 = OrganizationUnit.create(:organization => o)
      ou2 = OrganizationUnit.create(:organization => o)
      u1 = User.create
      u2 = User.create
      o.add_user(u1.global_id, false, false)
      o.add_supervisor(u2.global_id, false)
      ou1.add_communicator(u1.global_id)
      ou1.add_supervisor(u2.global_id)
      Worker.process_queues
      expect(u1.reload.supervisor_user_ids).to eq([u2.global_id])
      ou2.add_communicator(u1.global_id)
      ou2.add_supervisor(u2.global_id)
      Worker.process_queues
      expect(u1.reload.supervisor_user_ids).to eq([u2.global_id])
      expect(u1.supervisor_links.length).to eq(1)
      expect(u1.supervisor_links[0]['state']['organization_unit_ids']).to eq([ou1.global_id, ou2.global_id])
      expect(u1.settings['supervisors']).to eq(nil)

      ou2.remove_communicator(u1.global_id)
      Worker.process_queues
      expect(u1.reload.supervisor_user_ids).to eq([u2.global_id])
      expect(u1.supervisor_links.length).to eq(1)
      expect(u1.supervisor_links[0]['state']['organization_unit_ids']).to eq([ou1.global_id])
      expect(u1.settings['supervisors']).to eq(nil)
    end
  end
  
#   describe "assert_list" do
#     it "should update the list correctly" do
#       ou = OrganizationUnit.new(:settings => {
#         'supervisors' => [{'user_id' => 'asdf'}, {'user_id' => 'jkl'}, {'user_id' => 'jkl'}]
#       })
#       ou.assert_list('supervisors', 'jkl')
#       expect(ou.settings['supervisors']).to eq([{'user_id' => 'asdf'}])
#     end
#     
#     it "should handle when list not initialized" do
#       ou = OrganizationUnit.new(:settings => {})
#       ou.assert_list('something', nil)
#       expect(ou.settings['something']).to eq([])
#     end
#   end  
  
  describe "assert_supervision!" do
    it "should update missing connections" do
      u1 = User.create
      u2 = User.create
      u3 = User.create
      u4 = User.create
      o = Organization.create(:settings => {:total_licenses => 2})
      o.add_user(u1.user_name, false, false)
      o.add_user(u2.user_name, false, false)
      o.add_supervisor(u3.user_name, false)
      o.add_supervisor(u4.user_name, false)

      ou = OrganizationUnit.create(:organization => o)
      expect(ou.add_communicator(u1.user_name)).to eq(true)
      expect(ou.add_communicator(u2.user_name)).to eq(true)
      expect(ou.add_supervisor(u3.user_name)).to eq(true)
      expect(ou.add_supervisor(u4.user_name, true)).to eq(true)
      ou.assert_supervision!

      expect(u1.reload.supervisor_links.sort_by{|s| [s['user_id'], s['record_code']]}).to eq([{
        'user_id' => u1.global_id, 'record_code' => Webhook.get_record_code(u3), 'type' => 'supervisor', 'state' => {'supervisor_user_name' => u3.user_name, 'supervisee_user_name' => u1.user_name, 'organization_unit_ids' => [ou.global_id]}
      }, {
        'user_id' => u1.global_id, 'record_code' => Webhook.get_record_code(u4), 'type' => 'supervisor', 'state' => {'supervisor_user_name' => u4.user_name, 'supervisee_user_name' => u1.user_name, 'edit_permission' => true, 'organization_unit_ids' => [ou.global_id]}
      }])
      expect(u2.reload.supervisor_links.sort_by{|s| [s['user_id'], s['record_code']]}).to eq([{
        'user_id' => u2.global_id, 'record_code' => Webhook.get_record_code(u3), 'type' => 'supervisor', 'state' => {'supervisor_user_name' => u3.user_name, 'supervisee_user_name' => u2.user_name, 'organization_unit_ids' => [ou.global_id]}
      }, {
        'user_id' => u2.global_id, 'record_code' => Webhook.get_record_code(u4), 'type' => 'supervisor', 'state' => {'supervisor_user_name' => u4.user_name, 'supervisee_user_name' => u2.user_name, 'edit_permission' => true, 'organization_unit_ids' => [ou.global_id]}
      }])
      expect(u3.reload.supervisee_links.sort_by{|s| [s['user_id'], s['record_code']]}).to eq([{
        'user_id' => u1.global_id, 'record_code' => Webhook.get_record_code(u3), 'type' => 'supervisor', 'state' => {'supervisor_user_name' => u3.user_name, 'supervisee_user_name' => u1.user_name, 'organization_unit_ids' => [ou.global_id]}
      }, {
        'user_id' => u2.global_id, 'record_code' => Webhook.get_record_code(u3), 'type' => 'supervisor', 'state' => {'supervisor_user_name' => u3.user_name, 'supervisee_user_name' => u2.user_name, 'organization_unit_ids' => [ou.global_id]}
      }])
      expect(u4.reload.supervisee_links.sort_by{|s| [s['user_id'], s['record_code']]}).to eq([{
        'user_id' => u1.global_id, 'record_code' => Webhook.get_record_code(u4), 'type' => 'supervisor', 'state' => {'supervisor_user_name' => u4.user_name, 'supervisee_user_name' => u1.user_name, 'edit_permission' => true, 'organization_unit_ids' => [ou.global_id]}
      }, {
        'user_id' => u2.global_id, 'record_code' => Webhook.get_record_code(u4), 'type' => 'supervisor', 'state' => {'supervisor_user_name' => u4.user_name, 'supervisee_user_name' => u2.user_name, 'edit_permission' => true, 'organization_unit_ids' => [ou.global_id]}
      }])
    end
    
    it "should not duplicate existing connections" do
      u1 = User.create
      u2 = User.create
      u3 = User.create
      u4 = User.create

      User.link_supervisor_to_user(u3, u1)
      User.link_supervisor_to_user(u3, u2, nil, false)
      expect(UserLink.count).to eq(2)

      o = Organization.create(:settings => {:total_licenses => 2})
      o.add_user(u1.user_name, false, false)
      o.add_user(u2.user_name, false, false)
      o.add_supervisor(u3.user_name, false)
      o.add_supervisor(u4.user_name, false)
      ou = OrganizationUnit.create(organization: o)

      expect(ou.add_communicator(u1.user_name)).to eq(true)
      expect(ou.add_communicator(u2.user_name)).to eq(true)
      expect(ou.add_supervisor(u3.user_name)).to eq(true)
      expect(ou.add_supervisor(u4.user_name, true)).to eq(true)
      ou.assert_supervision!

      expect(UserLink.count).to eq(12)

      expect(u1.reload.supervisor_links.sort_by{|s| [s['user_id'], s['record_code']]}).to eq([{
        'user_id' => u1.global_id, 'record_code' => Webhook.get_record_code(u3), 'type' => 'supervisor', 'state' => {'supervisor_user_name' => u3.user_name, 'supervisee_user_name' => u1.user_name, 'edit_permission' => true, 'organization_unit_ids' => [ou.global_id]}
      }, {
        'user_id' => u1.global_id, 'record_code' => Webhook.get_record_code(u4), 'type' => 'supervisor', 'state' => {'supervisor_user_name' => u4.user_name, 'supervisee_user_name' => u1.user_name, 'edit_permission' => true, 'organization_unit_ids' => [ou.global_id]}
      }])
      expect(u2.reload.supervisor_links.sort_by{|s| [s['user_id'], s['record_code']]}).to eq([{
        'user_id' => u2.global_id, 'record_code' => Webhook.get_record_code(u3), 'type' => 'supervisor', 'state' => {'supervisor_user_name' => u3.user_name, 'supervisee_user_name' => u2.user_name, 'organization_unit_ids' => [ou.global_id]}
      }, {
        'user_id' => u2.global_id, 'record_code' => Webhook.get_record_code(u4), 'type' => 'supervisor', 'state' => {'supervisor_user_name' => u4.user_name, 'supervisee_user_name' => u2.user_name, 'edit_permission' => true, 'organization_unit_ids' => [ou.global_id]}
      }])
      expect(u3.reload.supervisee_links.sort_by{|s| [s['user_id'], s['record_code']]}).to eq([{
        'user_id' => u1.global_id, 'record_code' => Webhook.get_record_code(u3), 'type' => 'supervisor', 'state' => {'supervisor_user_name' => u3.user_name, 'supervisee_user_name' => u1.user_name, 'edit_permission' => true, 'organization_unit_ids' => [ou.global_id]}
      }, {
        'user_id' => u2.global_id, 'record_code' => Webhook.get_record_code(u3), 'type' => 'supervisor', 'state' => {'supervisor_user_name' => u3.user_name, 'supervisee_user_name' => u2.user_name, 'organization_unit_ids' => [ou.global_id]}
      }])
      expect(u4.reload.supervisee_links.sort_by{|s| [s['user_id'], s['record_code']]}).to eq([{
        'user_id' => u1.global_id, 'record_code' => Webhook.get_record_code(u4), 'type' => 'supervisor', 'state' => {'supervisor_user_name' => u4.user_name, 'supervisee_user_name' => u1.user_name, 'edit_permission' => true, 'organization_unit_ids' => [ou.global_id]}
      }, {
        'user_id' => u2.global_id, 'record_code' => Webhook.get_record_code(u4), 'type' => 'supervisor', 'state' => {'supervisor_user_name' => u4.user_name, 'supervisee_user_name' => u2.user_name, 'edit_permission' => true, 'organization_unit_ids' => [ou.global_id]}
      }])
    end
  end

  describe "assert_supervision" do
    it "should return false if no user found" do
      ou = OrganizationUnit.new(:settings => {})
      res = ou.assert_supervision({'user_id' => 'asdf'})
      expect(res).to eq(false)
    end
    
    it "should remove the supervisor from all room communicators if specified" do
      u1 = User.create
      u2 = User.create
      u3 = User.create
      u4 = User.create


      o = Organization.create(:settings => {:total_licenses => 2})
      o.add_user(u1.user_name, false, false)
      o.add_user(u2.user_name, false, false)
      o.add_supervisor(u3.user_name, false)
      o.add_supervisor(u4.user_name, false)
      ou = OrganizationUnit.create(organization: o)

      expect(ou.add_communicator(u1.user_name)).to eq(true)
      expect(ou.add_communicator(u2.user_name)).to eq(true)
      expect(ou.add_supervisor(u3.user_name)).to eq(true)
      expect(ou.add_supervisor(u4.user_name)).to eq(true)
      ou.assert_supervision!

      expect(User).to receive(:unlink_supervisor_from_user).with(u4, u1, ou.global_id)
      expect(User).to receive(:unlink_supervisor_from_user).with(u4, u2, ou.global_id)
      ou.assert_supervision({'user_id' => u4.global_id, 'remove_supervisor' => true})
    end
    
    it "should add the supervisor to all room communicators if specified" do
      u1 = User.create
      u2 = User.create
      u3 = User.create
      u4 = User.create

      o = Organization.create(:settings => {:total_licenses => 2})
      o.add_user(u1.user_name, false, false)
      o.add_user(u2.user_name, false, false)
      o.add_supervisor(u3.user_name, false)
      o.add_supervisor(u4.user_name, false)
      ou = OrganizationUnit.create(organization: o)

      expect(ou.add_communicator(u1.user_name)).to eq(true)
      expect(ou.add_communicator(u2.user_name)).to eq(true)
      expect(ou.add_supervisor(u3.user_name)).to eq(true)
      expect(ou.add_supervisor(u4.user_name, true)).to eq(true)
      ou.assert_supervision!

      expect(User).to receive(:link_supervisor_to_user).with(u4, u1, nil, true, ou.global_id)
      expect(User).to receive(:link_supervisor_to_user).with(u4, u2, nil, true, ou.global_id)
      ou.assert_supervision({'user_id' => u4.global_id, 'add_supervisor' => true})
    end
    
    it "should add all room supervisors to the communicator if specified" do
      u1 = User.create
      u2 = User.create
      u3 = User.create
      u4 = User.create

      o = Organization.create(:settings => {:total_licenses => 2})
      o.add_user(u1.user_name, false, false)
      o.add_user(u2.user_name, false, false)
      o.add_supervisor(u3.user_name, false)
      o.add_supervisor(u4.user_name, false)
      ou = OrganizationUnit.create(organization: o)

      expect(ou.add_communicator(u1.user_name)).to eq(true)
      expect(ou.add_communicator(u2.user_name)).to eq(true)
      expect(ou.add_supervisor(u3.user_name)).to eq(true)
      expect(ou.add_supervisor(u4.user_name, true)).to eq(true)
      ou.assert_supervision!

      expect(User).to receive(:link_supervisor_to_user).with(u4, u1, nil, true, ou.global_id)
      expect(User).to receive(:link_supervisor_to_user).with(u3, u1, nil, false, ou.global_id)
      ou.assert_supervision({'user_id' => u1.global_id, 'add_communicator' => true})
    end
    
    it "should remove all room supervisors from the communicator if specified" do
      u1 = User.create
      u2 = User.create
      u3 = User.create
      u4 = User.create

      o = Organization.create(:settings => {:total_licenses => 2})
      o.add_user(u1.user_name, false, false)
      o.add_user(u2.user_name, false, false)
      o.add_supervisor(u3.user_name, false)
      o.add_supervisor(u4.user_name, false)
      ou = OrganizationUnit.create(organization: o)

      expect(ou.add_communicator(u1.user_name)).to eq(true)
      expect(ou.add_communicator(u2.user_name)).to eq(true)
      expect(ou.add_supervisor(u3.user_name)).to eq(true)
      expect(ou.add_supervisor(u4.user_name)).to eq(true)
      ou.assert_supervision!

      expect(User).to receive(:unlink_supervisor_from_user).with(u4, u1, ou.global_id)
      expect(User).to receive(:unlink_supervisor_from_user).with(u3, u1, ou.global_id)
      ou.assert_supervision({'user_id' => u1.global_id, 'remove_communicator' => true})
    end
    
    it "should not remove other supervisors from the communicator" do
      u1 = User.create
      u2 = User.create
      u3 = User.create
      u4 = User.create
      u5 = User.create
      User.link_supervisor_to_user(u5, u1, nil, true)

      o = Organization.create(:settings => {:total_licenses => 2})
      o.add_user(u1.user_name, false, false)
      o.add_user(u2.user_name, false, false)
      o.add_supervisor(u3.user_name, false)
      o.add_supervisor(u4.user_name, false)
      ou = OrganizationUnit.create(organization: o)

      expect(ou.add_communicator(u1.user_name)).to eq(true)
      expect(ou.add_communicator(u2.user_name)).to eq(true)
      expect(ou.add_supervisor(u3.user_name)).to eq(true)
      expect(ou.add_supervisor(u4.user_name)).to eq(true)
      ou.assert_supervision!

      expect(User).to receive(:unlink_supervisor_from_user).with(u4, u1, ou.global_id)
      expect(User).to receive(:unlink_supervisor_from_user).with(u3, u1, ou.global_id)
      expect(User).to_not receive(:unlink_supervisor_from_user).with(u5, u1)
      ou.assert_supervision({'user_id' => u1.global_id, 'remove_communicator' => true})
    end
    
    it "should not remove the supervisor from their other communicators" do
      u1 = User.create
      u2 = User.create
      u3 = User.create
      u4 = User.create
      u5 = User.create
      User.link_supervisor_to_user(u4, u5, nil, true)

      o = Organization.create(:settings => {:total_licenses => 2})
      o.add_user(u1.user_name, false, false)
      o.add_user(u2.user_name, false, false)
      o.add_supervisor(u3.user_name, false)
      o.add_supervisor(u4.user_name, false)
      ou = OrganizationUnit.create(organization: o)

      expect(ou.add_communicator(u1.user_name)).to eq(true)
      expect(ou.add_communicator(u2.user_name)).to eq(true)
      expect(ou.add_supervisor(u3.user_name)).to eq(true)
      expect(ou.add_supervisor(u4.user_name)).to eq(true)
      ou.assert_supervision!

      expect(User).to receive(:unlink_supervisor_from_user).with(u4, u1, ou.global_id)
      expect(User).to receive(:unlink_supervisor_from_user).with(u4, u2, ou.global_id)
      expect(User).to_not receive(:unlink_supervisor_from_user).with(u4, u5)
      ou.assert_supervision({'user_id' => u4.global_id, 'remove_supervisor' => true})
    end
  end
  
  describe "communicator?" do
    it "should return the correct value" do
      o = Organization.create
      ou = OrganizationUnit.create(:organization => o)
      expect(ou.communicator?(nil)).to eq(false)
      u = User.create
      expect(ou.communicator?(u)).to eq(false)
      ou.add_supervisor(u.user_name)
      expect(ou.communicator?(u)).to eq(false)
      o.add_user(u.user_name, false, false)
      ou.add_communicator(u.user_name)
      expect(ou.reload.communicator?(u.reload)).to eq(true)
    end
  end
  
  describe "supervisor?" do
    it "should return the correct value" do
      o = Organization.create
      ou = OrganizationUnit.create(:organization => o)
      expect(ou.supervisor?(nil)).to eq(false)
      u = User.create
      expect(ou.supervisor?(u)).to eq(false)
      ou.add_communicator(u.user_name)
      expect(ou.supervisor?(u)).to eq(false)
      o.add_supervisor(u.user_name, false)
      ou.add_supervisor(u.user_name)
      expect(ou.reload.supervisor?(u.reload)).to eq(true)
    end
  end
  
  describe "remove_as_member" do
    it "should remove communicators from all org units" do
      u1 = User.create
      u2 = User.create
      u3 = User.create
      o = Organization.create
      o.add_user(u1.user_name, false, false)
      o.add_user(u2.user_name, false, false)
      o.add_user(u3.user_name, false, false)
      o.add_supervisor(u2.user_name, false)
      ou1 = OrganizationUnit.create(:organization => o)
      ou2 = OrganizationUnit.create(:organization => o)
      ou1.add_communicator(u2.global_id)
      ou1.add_communicator(u1.global_id)
      ou2.add_communicator(u2.global_id)
      ou2.add_communicator(u3.global_id)
      ou2.add_supervisor(u2.global_id)
      OrganizationUnit.remove_as_member(u2.global_id, 'communicator', o.global_id)
      ou1.reload
      ou2.reload
      expect(ou1.communicator?(u1)).to eq(true)
      expect(ou1.communicator?(u2)).to eq(false)
      expect(ou2.communicator?(u2)).to eq(false)
      expect(ou2.communicator?(u3)).to eq(true)
      expect(ou2.supervisor?(u2)).to eq(true)
    end
    
    it "should remove supervisors from all org units" do
      u1 = User.create
      u2 = User.create
      u3 = User.create
      o = Organization.create
      o.add_user(u2.user_name, false, false)
      o.add_supervisor(u1.user_name, false)
      o.add_supervisor(u2.user_name, false)
      o.add_supervisor(u3.user_name, false)
      ou1 = OrganizationUnit.create(:organization => o)
      ou2 = OrganizationUnit.create(:organization => o)
      ou1.add_supervisor(u2.global_id)
      ou1.add_supervisor(u1.global_id)
      ou2.add_supervisor(u2.global_id)
      ou2.add_supervisor(u3.global_id)
      ou2.add_communicator(u2.global_id)
      OrganizationUnit.remove_as_member(u2.global_id, 'supervisor', o.global_id)
      ou1.reload
      ou2.reload
      expect(ou1.supervisor?(u1)).to eq(true)
      expect(ou1.supervisor?(u2)).to eq(false)
      expect(ou2.supervisor?(u2)).to eq(false)
      expect(ou2.supervisor?(u3)).to eq(true)
      expect(ou2.communicator?(u2)).to eq(true)
    end
  end

  describe "retire_goal_for" do
    it "should return false on invalid or inactive goal" do
      ou = OrganizationUnit.new
      expect(ou.retire_goal_for(nil, nil)).to eq(false)
      u = User.create
      g = UserGoal.create(user: u)
      expect(ou.retire_goal_for(u, g)).to eq(false)

    end

    it "should delete a recently-created goal" do
      o = Organization.create
      ou = OrganizationUnit.create(organization: o)
      u = User.create
      g = UserGoal.create(user: u, active: true)
      g2 = UserGoal.create(user: u, active: true)
      g.settings['children_ids'] = [g2.global_id]
      g.save
      expect(ou.retire_goal_for(u, g)).to eq(true)
      expect(UserGoal.find_by(id: g2.id)).to eq(nil)
    end

    it "should conclude a relatively-new goal" do
      o = Organization.create
      ou = OrganizationUnit.create(organization: o)
      u = User.create
      g = UserGoal.create(user: u, active: true)
      g2 = UserGoal.create(user: u, active: true)
      g.settings['children_ids'] = [g2.global_id]
      g.save
      UserGoal.where(id: g2.id).update_all(created_at: 5.days.ago)
      expect(ou.retire_goal_for(u, g)).to eq(true)
      expect(UserGoal.find_by(id: g2.id)).to_not eq(nil)
      expect(g2.reload.active).to eq(false)
    end

    it "should detach a user from the root goal if removed" do
      o = Organization.create
      ou = OrganizationUnit.create(organization: o)
      u = User.create
      g = UserGoal.create(user: u, active: true)
      g2 = UserGoal.create(user: u, active: true)
      g.settings['children_ids'] = [g2.global_id]
      g.save
      ou.settings['goal_assertions'] = {}
      ou.settings['goal_assertions'][g.global_id] = {'user_ids' => [u.global_id]}
      ou.save
      expect(ou.reload.settings['goal_assertions'][g.global_id]['user_ids']).to eq([u.global_id])
      UserGoal.where(id: g2.id).update_all(created_at: 5.days.ago)
      expect(ou.retire_goal_for(u, g)).to eq(true)
      expect(UserGoal.find_by(id: g2.id)).to_not eq(nil)
      expect(g2.reload.active).to eq(false)
      expect(ou.settings['goal_assertions'][g.global_id]['user_ids']).to eq([])
    end
  end

  describe "assert_goal" do
    it "should remove the previous goal if specified" do
      o = Organization.create(settings: {total_licenses: 5})
      s1 = User.create
      s2 = User.create
      c1 = User.create
      c2 = User.create
      o.add_supervisor(s1.user_name, false)
      o.reload.add_supervisor(s2.user_name, false)
      o.reload.add_user(c1.user_name, false, true)
      o.reload.add_user(c2.user_name, false, true)
      ou = OrganizationUnit.create(organization: o)
      ou.reload.add_supervisor(s1.user_name, true)
      ou.reload.add_communicator(c1.user_name)
      ou.reload.add_communicator(c2.user_name)
      g = UserGoal.create(user: s2, active: true)
      ou.user_goal = g
      ou.save
      ou.assert_goal
      expect(ou.settings['goal_assertions'][g.global_id]).to_not eq(nil)
      expect(ou.settings['goal_assertions'][g.global_id]['user_ids'].sort).to eq([c1.global_id, c2.global_id])
      expect(g.active).to eq(true)

      ou.settings['goal_assertions']['removed_goal_id'] = g.global_id
      expect(ou).to receive(:retire_goal_for).with(c1, g, nil)
      expect(ou).to receive(:retire_goal_for).with(c2, g, nil)
      ou.assert_goal
      expect(ou.settings['goal_assertions']['removed_goal_id']).to eq(nil)
      expect(g.reload.active).to eq(false)
    end

    it "should attach the goal to any unit communicators who have never seen it" do
      o = Organization.create(settings: {total_licenses: 5})
      s1 = User.create
      s2 = User.create
      c1 = User.create
      c2 = User.create
      gc2 = UserGoal.create(user: c2, primary: true, active: true)
      c2.settings['primary_goal'] = {'id' => gc2.global_id}
      c2.save
      o.add_supervisor(s1.user_name, false)
      o.reload.add_supervisor(s2.user_name, false)
      o.reload.add_user(c1.user_name, false, true)
      o.reload.add_user(c2.user_name, false, true)
      ou = OrganizationUnit.create(organization: o)
      ou.reload.add_supervisor(s1.user_name, true)
      ou.reload.add_communicator(c1.user_name)
      ou.reload.add_communicator(c2.user_name)
      g = UserGoal.create(user: s2, active: true)
      ou.user_goal = g
      ou.save
      ou.assert_goal
      expect(ou.settings['goal_assertions'][g.global_id]).to_not eq(nil)
      expect(ou.settings['goal_assertions'][g.global_id]['user_ids'].sort).to eq([c1.global_id, c2.global_id])
      expect(g.reload.active).to eq(true)
      expect(g.children_goals.length).to eq(2)
      expect(g.children_goals.sort_by(&:user_id)[0].active).to eq(true)
      expect(g.children_goals.sort_by(&:user_id)[0].primary).to eq(true)
      expect(g.children_goals.sort_by(&:user_id)[0].settings['template_id']).to eq(g.global_id)
      expect(g.children_goals.sort_by(&:user_id)[0].settings['organization_unit_id']).to eq(ou.global_id)
      expect(g.children_goals.sort_by(&:user_id)[1].active).to eq(true)
      expect(g.children_goals.sort_by(&:user_id)[1].primary).to eq(false)
      expect(g.children_goals.sort_by(&:user_id)[1].settings['template_id']).to eq(g.global_id)
      expect(g.children_goals.sort_by(&:user_id)[1].settings['organization_unit_id']).to eq(ou.global_id)
    end

    it "should not attach to a user who manually deleted the goal themselves" do
      o = Organization.create(settings: {total_licenses: 5})
      s1 = User.create
      s2 = User.create
      c1 = User.create
      c2 = User.create
      gc2 = UserGoal.create(user: c2, primary: true, active: true)
      c2.settings['primary_goal'] = {'id' => gc2.global_id}
      c2.save
      o.add_supervisor(s1.user_name, false)
      o.reload.add_supervisor(s2.user_name, false)
      o.reload.add_user(c1.user_name, false, true)
      o.reload.add_user(c2.user_name, false, true)
      ou = OrganizationUnit.create(organization: o)
      ou.reload.add_supervisor(s1.user_name, true)
      ou.reload.add_communicator(c1.user_name)
      ou.reload.add_communicator(c2.user_name)
      g = UserGoal.create(user: s2, active: true)
      ou.settings['goal_assertions'] = {}
      ou.settings['goal_assertions'][g.global_id] = {'user_ids' => [c1.global_id]}
      ou.user_goal = g
      ou.save
      ou.assert_goal
      expect(ou.settings['goal_assertions'][g.global_id]).to_not eq(nil)
      expect(ou.settings['goal_assertions'][g.global_id]['user_ids'].sort).to eq([c1.global_id, c2.global_id])
      expect(g.reload.active).to eq(true)
      expect(g.children_goals.length).to eq(1)
      expect(g.children_goals.sort_by(&:user_id)[0].user).to eq(c2)
      expect(g.children_goals.sort_by(&:user_id)[0].active).to eq(true)
      expect(g.children_goals.sort_by(&:user_id)[0].primary).to eq(false)
      expect(g.children_goals.sort_by(&:user_id)[0].settings['template_id']).to eq(g.global_id)
      expect(g.children_goals.sort_by(&:user_id)[0].settings['organization_unit_id']).to eq(ou.global_id)
    end

    it "should remove from any users who have the goal but have been removed from the unit" do
      o = Organization.create(settings: {total_licenses: 5})
      s1 = User.create
      s2 = User.create
      c1 = User.create
      c2 = User.create
      gc2 = UserGoal.create(user: c2, primary: true, active: true)
      c2.settings['primary_goal'] = {'id' => gc2.global_id}
      c2.save
      o.add_supervisor(s1.user_name, false)
      o.reload.add_supervisor(s2.user_name, false)
      o.reload.add_user(c1.user_name, false, true)
      o.reload.add_user(c2.user_name, false, true)
      ou = OrganizationUnit.create(organization: o)
      ou.reload.add_supervisor(s1.user_name, true)
      ou.reload.add_communicator(c1.user_name)
      ou.reload.add_communicator(c2.user_name)
      g = UserGoal.create(user: s2, active: true)
      ou.user_goal = g
      ou.save
      ou.assert_goal
      expect(ou.settings['goal_assertions'][g.global_id]).to_not eq(nil)
      expect(ou.settings['goal_assertions'][g.global_id]['user_ids'].sort).to eq([c1.global_id, c2.global_id])
      expect(g.reload.active).to eq(true)
      expect(g.children_goals.length).to eq(2)
      expect(g.children_goals.sort_by(&:user_id)[0].user).to eq(c1)
      expect(g.children_goals.sort_by(&:user_id)[0].active).to eq(true)
      expect(g.children_goals.sort_by(&:user_id)[0].primary).to eq(true)
      expect(g.children_goals.sort_by(&:user_id)[0].settings['template_id']).to eq(g.global_id)
      expect(g.children_goals.sort_by(&:user_id)[0].settings['organization_unit_id']).to eq(ou.global_id)
      expect(g.children_goals.sort_by(&:user_id)[1].user).to eq(c2)
      expect(g.children_goals.sort_by(&:user_id)[1].active).to eq(true)
      expect(g.children_goals.sort_by(&:user_id)[1].primary).to eq(false)
      expect(g.children_goals.sort_by(&:user_id)[1].settings['template_id']).to eq(g.global_id)
      expect(g.children_goals.sort_by(&:user_id)[1].settings['organization_unit_id']).to eq(ou.global_id)
      gc2 = g.children_goals.sort_by(&:user_id)[1]

      ou.reload.remove_communicator(c2.user_name)
      ou.assert_goal
      expect(ou.settings['goal_assertions'][g.global_id]).to_not eq(nil)
      expect(ou.settings['goal_assertions'][g.global_id]['user_ids'].sort).to eq([c1.global_id])
      expect(g.reload.active).to eq(true)
      g.instance_variable_set('@children_goals', nil)
      expect(g.children_goals.length).to eq(1)
      expect(g.children_goals.sort_by(&:user_id)[0].user).to eq(c1)
      expect(g.children_goals.sort_by(&:user_id)[0].active).to eq(true)
      expect(g.children_goals.sort_by(&:user_id)[0].primary).to eq(true)
      expect(g.children_goals.sort_by(&:user_id)[0].settings['template_id']).to eq(g.global_id)
      expect(g.children_goals.sort_by(&:user_id)[0].settings['organization_unit_id']).to eq(ou.global_id)
      expect(UserGoal.find_by(id: gc2)).to eq(nil)
    end
  end
end
