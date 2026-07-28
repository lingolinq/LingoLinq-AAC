require 'spec_helper'

describe JsonApi::Organization do
  it "should have defined pagination defaults" do
    expect(JsonApi::Organization::TYPE_KEY).to eq('organization')
    expect(JsonApi::Organization::DEFAULT_PAGE).to eq(15)
    expect(JsonApi::Organization::MAX_PAGE).to eq(25)
  end

  describe "build_json" do
    it "should not include unlisted settings" do
      o = Organization.create
      o.settings['hat'] = 'black'
      expect(JsonApi::Organization.build_json(o).keys).not_to be_include('hat')
    end
    
    it "should return appropriate attributes" do
      o = Organization.create(:settings => {'name' => 'my org'})
      ['id', 'name'].each do |key|
        expect(JsonApi::Organization.build_json(o).keys).to be_include(key)
      end
    end
    
    it "should include permissions if permissions are requested" do
      o = Organization.create
      u = User.create
      expect(JsonApi::Organization.build_json(o, :permissions => u)['permissions']).to eq({'user_id' => u.global_id})
    end
    
    it "should include license information if edit permissions are allowed" do
      o = Organization.create(:settings => {'total_licenses' => 4})
      u = User.create
      o.add_manager(u.user_name, true)
      u.reload
      res = JsonApi::Organization.build_json(o, :permissions => u)
      expect(res['created']).not_to eq(nil)
      expect(res['allotted_licenses']).to eq(4)
      expect(res['used_licenses']).to eq(0)
    end

    it "should include default_beta_program_access when edit permissions are allowed" do
      o = Organization.create
      u = User.create
      o.add_manager(u.user_name, true)
      u.reload
      res = JsonApi::Organization.build_json(o, :permissions => u)
      expect(res['default_beta_program_access']).to eq(true)
      o.settings['default_beta_program_access'] = false
      o.save!
      res = JsonApi::Organization.build_json(o.reload, :permissions => u)
      expect(res['default_beta_program_access']).to eq(false)
    end

    it "should include external_ai_processing when edit permissions are allowed" do
      o = Organization.create
      u = User.create
      o.add_manager(u.user_name, true)
      u.reload
      res = JsonApi::Organization.build_json(o, :permissions => u)
      expect(res['external_ai_processing']).to eq(true)
      o.settings['external_ai_processing'] = false
      o.save!
      res = JsonApi::Organization.build_json(o.reload, :permissions => u)
      expect(res['external_ai_processing']).to eq(false)
    end

    it "should include jurisdiction when edit permissions are allowed" do
      o = Organization.create(settings: {'jurisdiction' => 'EU'})
      u = User.create
      o.add_manager(u.user_name, true)
      u.reload
      res = JsonApi::Organization.build_json(o, :permissions => u)
      expect(res['jurisdiction']).to eq('EU')
    end
    
    it "should include basic tallies" do
      o = Organization.create(:settings => {'total_licenses' => 4})
      u = User.create
      u2 = User.create
      u3 = User.create
      o.add_manager(u.user_name, true)
      expect(UserLink.count).to eq(1)
      o.add_user(u2.user_name, false, true)
      expect(UserLink.count).to eq(2)
      o.add_user(u3.user_name, true, true)
      expect(UserLink.count).to eq(3)
      u.reload

      d = Device.create(:user => u2)
      now = Time.now.to_i
      params = {
        'events' => [
          {'id' => 'abc', 'type' => 'button', 'button' => {'label' => 'I', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 10, },
          {'id' => 'qwe', 'type' => 'button', 'button' => {'label' => 'like', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 8},
          {'id' => 'wer', 'type' => 'button', 'button' => {'label' => 'ok go', 'board' => {'id' => '1_1'}}, 'timestamp' => now}
        ]
      }
      l = LogSession.process_new(params, {
        :user => u2,
        :author => u2,
        :device => d
      })

      expect(UserLink.links_for(o.reload).length).to eq(3)
      res = JsonApi::Organization.build_json(o.reload, :permissions => u)
      expect(res['total_users']).to eq(2)
      expect(res['total_supervisors']).to eq(0)
      expect(res['total_managers']).to eq(1)
      expect(res['used_licenses']).to eq(2)
    end
    
    it "should include purchase history if allowed" do
      u = User.create
      u2 = User.create
      o = Organization.create
      o.add_subscription(u2.user_name)
      o.reload
      o.process({'allotted_licenses' => 2}, {'updater' => u})
      admin = Organization.create(:admin => true)
      admin.add_manager(u.user_name, true)
      
      res = JsonApi::Organization.build_json(o.reload, :permissions => u.reload)
      expect(res['purchase_history']).to_not eq(nil)
      expect(res['purchase_history'].length).to eq(2)
    end
    
    it "should not include purchase history if not allowed" do
      u = User.create
      u2 = User.create
      o = Organization.create
      o.add_subscription(u2.user_name)
      o.process({'allotted_licenses' => 2}, {'updater' => u})
      o.add_manager(u.user_name, true)
      
      res = JsonApi::Organization.build_json(o.reload, :permissions => u.reload)
      expect(res['purchase_history']).to eq(nil)
    end
    
    it "should include subscription users if allowed" do
      u = User.create
      u2 = User.create
      o = Organization.create
      o.add_subscription(u2.user_name)
      o.add_manager(u.user_name, false)
      
      res = JsonApi::Organization.build_json(o.reload, :permissions => u.reload)
      expect(res['org_subscriptions']).to_not eq(nil)
      expect(res['org_subscriptions'].length).to eq(1)
      expect(res['org_subscriptions'][0]['user_name']).to eq(u2.user_name)
      expect(res['org_subscriptions'][0]['subscription']).to_not eq(nil)
    end
    
    it "should not include subscription users if not allowed" do
      u = User.create
      u2 = User.create
      o = Organization.create
      o.add_subscription(u2.user_name)
      
      res = JsonApi::Organization.build_json(o.reload, :permissions => u.reload)
      expect(res['org_subscriptions']).to eq(nil)
    end

    it "should not include detailed information if not allowed" do
      u = User.create
      o = Organization.create
      o.add_supervisor(u.user_name, false)
      Worker.process_queues
      expect(o.supervisor?(u.reload)).to eq(true)
      
      res = JsonApi::Organization.build_json(o.reload, :permissions => u.reload)
      expect(res['name']).to eq('Unnamed Organization')
      expect(res['org_subscriptions']).to eq(nil)
      expect(res['allotted_licenses']).to eq(nil)
    end

    it "should include extras allotments" do
      u = User.create
      o = Organization.create
      o.add_manager(u.user_name, false)
      
      res = JsonApi::Organization.build_json(o.reload, :permissions => u.reload)
      expect(res['name']).to eq('Unnamed Organization')
      expect(res['allotted_extras']).to eq(0)
      expect(res['used_extras']).to eq(0)

      o.settings['total_extras'] = 5
      o.save
      res = JsonApi::Organization.build_json(o.reload, :permissions => u.reload)
      expect(res['name']).to eq('Unnamed Organization')
      expect(res['used_extras']).to eq(0)
      expect(res['allotted_extras']).to eq(5)
    end
    
  end
end
