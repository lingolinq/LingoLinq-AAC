require 'spec_helper'

describe JsonApi::Unit do
  it "should have defined pagination defaults" do
    expect(JsonApi::Unit::TYPE_KEY).to eq('unit')
    expect(JsonApi::Unit::DEFAULT_PAGE).to eq(10)
    expect(JsonApi::Unit::MAX_PAGE).to eq(25)
  end

  describe "build_json" do
    it "should not include unlisted values" do
      u = OrganizationUnit.create(:settings => {'name' => 'Roomy', 'bacon' => 'asdf'})
      json = JsonApi::Unit.build_json(u)
      expect(json['bacon']).to eq(nil)
    end
    
    it "should include basic information" do
      u = OrganizationUnit.create(:settings => {'name' => 'Roomy', 'bacon' => 'asdf'})
      json = JsonApi::Unit.build_json(u)
      expect(json['id']).to eq(u.global_id)
      expect(json['name']).to eq('Roomy')
    end

    it "should include permissions if requested" do
      user = User.create
      o = Organization.create
      o.add_manager(user.global_id, true)
      user.reload
      u = OrganizationUnit.create(:organization => o, :settings => {'name' => 'Roomy', 'bacon' => 'asdf'})
      json = JsonApi::Unit.as_json(u, {wrapper: true, permissions: user})
      expect(json['unit']['id']).to eq(u.global_id)
      expect(json['unit']['name']).to eq('Roomy')
      expect(json['unit']['permissions']).to eq({
        'user_id' => user.global_id,
        'view' => true,
        'view_stats' => true,
        'edit' => true,
        'delete' => true
      })
    end
    
    it "should include supervisors and communicators" do
      u1 = User.create
      u2 = User.create
      u3 = User.create
      u4 = User.create
      o = Organization.create
      u = OrganizationUnit.create(:settings => {'name' => 'Roomy'}, :organization => o)
      o.add_user(u1.global_id, false, false)
      o.add_user(u3.global_id, false, false)
      o.add_supervisor(u2.global_id, true)
      o.add_supervisor(u4.global_id, true)
      o.reload
      expect(o.managed_user?(u1.reload)).to eq(true)
      expect(o.managed_user?(u2.reload)).to eq(false)
      expect(o.managed_user?(u3.reload)).to eq(true)
      expect(o.managed_user?(u4.reload)).to eq(false)
      expect(o.supervisor?(u1)).to eq(false)
      expect(o.supervisor?(u2)).to eq(true)
      expect(o.supervisor?(u3)).to eq(false)
      expect(o.supervisor?(u4)).to eq(true)
      
      u.add_communicator(u1.global_id)
      u.add_supervisor(u2.global_id)
      u.add_supervisor(u4.global_id, true)
      u.add_communicator(u3.global_id)
      json = JsonApi::Unit.build_json(u)
      expect(json['id']).to eq(u.global_id)
      expect(json['name']).to eq('Roomy')
      expect(json['supervisors']).to_not eq(nil)
      expect(json['supervisors'].length).to eq(2)
      expect(json['communicators']).to_not eq(nil)
      expect(json['communicators'].length).to eq(2)
    end
    
    it "should mark supervisors as having edit permission if that's true" do
      u1 = User.create
      u2 = User.create
      u3 = User.create
      u4 = User.create
      o = Organization.create
      u = OrganizationUnit.create(:settings => {'name' => 'Roomy'}, :organization => o)
      o.add_user(u1.global_id, false, false)
      o.add_user(u3.global_id, false, false)
      o.add_supervisor(u2.global_id, true)
      o.add_supervisor(u4.global_id, true)

      u.add_communicator(u1.global_id)
      u.add_supervisor(u2.global_id)
      u.add_supervisor(u4.global_id, true)
      u.add_communicator(u3.global_id)
      json = JsonApi::Unit.build_json(u)
      expect(json['id']).to eq(u.global_id)
      expect(json['name']).to eq('Roomy')
      expect(json['communicators']).to_not eq(nil)
      expect(json['communicators'].length).to eq(2)
      expect(json['supervisors']).to_not eq(nil)
      expect(json['supervisors'].length).to eq(2)
      sup_with_edit = json['supervisors'].find { |s| s['org_unit_edit_permission'] }
      sup_without_edit = json['supervisors'].find { |s| !s['org_unit_edit_permission'] }
      expect(sup_with_edit['user_name']).to eq(u4.user_name)
      expect(sup_with_edit['org_unit_edit_permission']).to eq(true)
      expect(sup_without_edit['user_name']).to eq(u2.user_name)
      expect(sup_without_edit['org_unit_edit_permission']).to eq(false)
    end

    it "should include for communicators/supervisors, profile history if saved on UserLink records" do
      u = User.create
      d = Device.create(user: u)
      o = Organization.create(settings: {'premium' => true, 'supervisor_profile' => {'profile_id' => 'qqq'}})
      o.add_supervisor(u.user_name, false)
      s = LogSession.create!(data: {
          'profile' => {
            'id' => 'qqq',
            'name' => 'Best Profile'
          },
        },
        user: u, author: u, device: d
      )
      Worker.process_queues
      Worker.process_queues
      links = UserLink.where(user: u.reload)
      expect(links.length).to eq(1)
      expect(links[0].data['type']).to eq('org_supervisor')
      expect(links[0].data['state']).to_not eq(nil)
      expect(links[0].data['state']['profile_history']).to_not eq(nil)
      expect(links[0].data['state']['profile_id']).to eq('qqq')
      expect(links[0].data['state']['profile_history'][0]['log_id']).to eq(s.global_id)

      unit = OrganizationUnit.create(:settings => {'name' => 'Roomy'}, :organization => o)
      unit.add_supervisor(u.user_name, true)
      json = JsonApi::Unit.build_json(unit)
      expect(json['supervisors'].length).to eq(1)
      expect(json['supervisors'][0]['profile_history']).to_not eq(nil)
      expect(json['supervisors'][0]['profile_history'][0]['log_id']).to eq(s.global_id)
    end

    it "should include profile history for the correct user if there are multiple users" do
      u1 = User.create
      d1 = Device.create(user: u1)
      o = Organization.create(settings: {'premium' => true, 'supervisor_profile' => {'profile_id' => 'qqq'}})
      o.add_supervisor(u1.user_name, false)
      s1 = LogSession.create!(data: {
          'profile' => {
            'id' => 'qqq',
            'name' => 'Best Profile'
          },
        },
        user: u1, author: u1, device: d1
      )

      u2 = User.create
      d2 = Device.create(user: u2)
      o.add_supervisor(u2.user_name, false)

      u3 = User.create
      d3 = Device.create(user: u3)
      o.add_supervisor(u3.user_name, false)
      s3 = LogSession.create!(data: {
          'profile' => {
            'id' => 'qqq',
            'name' => 'Worst Profile'
          },
        },
        user: u3, author: u3, device: d3
      )

      Worker.process_queues
      Worker.process_queues
      links = UserLink.where(user: u1.reload)
      expect(links.length).to eq(1)
      expect(links[0].data['type']).to eq('org_supervisor')
      expect(links[0].data['state']).to_not eq(nil)
      expect(links[0].data['state']['profile_history']).to_not eq(nil)
      expect(links[0].data['state']['profile_id']).to eq('qqq')
      expect(links[0].data['state']['profile_history'][0]['log_id']).to eq(s1.global_id)
      links = UserLink.where(user: u2.reload)
      expect(links.length).to eq(1)
      expect(links[0].data['type']).to eq('org_supervisor')
      expect(links[0].data['state']).to_not eq(nil)
      expect(links[0].data['state']['profile_history']).to eq(nil)
      links = UserLink.where(user: u3.reload)
      expect(links.length).to eq(1)
      expect(links[0].data['type']).to eq('org_supervisor')
      expect(links[0].data['state']).to_not eq(nil)
      expect(links[0].data['state']['profile_history']).to_not eq(nil)
      expect(links[0].data['state']['profile_id']).to eq('qqq')
      expect(links[0].data['state']['profile_history'][0]['log_id']).to eq(s3.global_id)

      unit = OrganizationUnit.create(:settings => {'name' => 'Roomy'}, :organization => o)
      unit.add_supervisor(u1.user_name, true)
      unit.add_supervisor(u2.user_name, true)
      unit.add_supervisor(u3.user_name, true)
      json = JsonApi::Unit.build_json(unit)
      expect(json['supervisors'].length).to eq(3)
      sups = json['supervisors'].sort_by{|s| s['id'] }
      expect(sups[0]['id']).to eq(u1.global_id)
      expect(sups[0]['profile_history']).to_not eq(nil)
      expect(sups[0]['profile_history'][0]['log_id']).to eq(s1.global_id)
      expect(sups[1]['id']).to eq(u2.global_id)
      expect(sups[1]['profile_history']).to eq(nil)
      expect(sups[2]['id']).to eq(u3.global_id)
      expect(sups[2]['profile_history']).to_not eq(nil)
      expect(sups[2]['profile_history'][0]['log_id']).to eq(s3.global_id)
    end

    it "should include whether org has profiles defined" do
      u = User.create
      u.enable_feature('profiles')
      u.save
      d = Device.create(user: u)
      o = Organization.create(settings: {'premium' => true, 'supervisor_profile' => {'profile_id' => 'qqq'}})
      unit = OrganizationUnit.create(:settings => {'name' => 'Roomy'}, :organization => o)
      json = JsonApi::Unit.build_json(unit, permissions: u)
      expect(json['org_communicator_profile']).to eq(false)
      expect(json['org_supervisor_profile']).to eq(true)
      expect(json['org_profile']).to eq(true)
    end
  end
  
  describe "page_data" do
    it "should retrieve all user records for the page of data" do
      u1 = User.create
      u2 = User.create
      u3 = User.create
      o = Organization.create
      u = OrganizationUnit.create(:settings => {'name' => 'Roomy'}, :organization => o)
      o.add_user(u1.global_id, false, false)
      o.add_user(u3.global_id, false, false)
      o.add_supervisor(u2.global_id, true)
      o.add_supervisor(u3.global_id, true)

      u.add_communicator(u1.global_id)
      u.add_supervisor(u2.global_id)
      u.add_supervisor(u3.global_id, true)
      u.add_communicator(u3.global_id)
      
      data = JsonApi::Unit.page_data(OrganizationUnit.all, {})
      expect(data[:users_hash].keys.sort).to eq([u1.global_id, u2.global_id, u3.global_id].sort)
    end
  end
end
