require 'spec_helper'

describe Api::LogsController, :type => :controller do
  describe "index" do
    it "should require api token" do
      get :index
      assert_missing_token
    end
    
    it "should return unauthorized unless edit permissions allowed" do
      u = User.create
      token_user
      get :index, params: {:user_id => u.global_id}
      assert_unauthorized
    end
    
    it "should not be allowed in valet mode" do
      valet_token_user
      LogSession.process_new({
        :events => [
          {'timestamp' => 4.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 3.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => @user, :device => @device, :author => @user})
      get :index, params: {:user_id => @user.global_id}
      assert_unauthorized
    end

    it "should return a list of logs" do
      token_user
      LogSession.process_new({
        :events => [
          {'timestamp' => 4.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 3.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => @user, :device => @device, :author => @user})
      get :index, params: {:user_id => @user.global_id}
      json = JSON.parse(response.body)
      expect(json['log'].length).to eq(1)
    end
    
    it "should paginate long results" do
      token_user
      (JsonApi::Log::DEFAULT_PAGE + 1).times do |i|
        LogSession.process_new({
          :events => [
            {'timestamp' => i.days.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
            {'timestamp' => (i.days.ago + 10).to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
          ]
        }, {:user => @user, :device => @device, :author => @user})
      end
      get :index, params: {:user_id => @user.global_id}
      json = JSON.parse(response.body)
      expect(json['log'].length).to eq(JsonApi::Log::DEFAULT_PAGE)
      expect(json['meta']['next_url']).not_to eq(nil)
    end
    
    it "should return supervisee sessions when requested" do
      users = [User.create, User.create, User.create]
      token_user
      users.each_with_index do |u, idx|
        User.link_supervisor_to_user(@user, u) unless idx == 2
        d = Device.create(:user => u)
        3.times do |i|
          LogSession.process_new({
            :events => [
              {'timestamp' => (i.days.ago + i).to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
              {'timestamp' => (i.days.ago + 100).to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
            ]
          }, {:user => u, :device => d, :author => u})
        end
      end
      Worker.process_queues
      expect(@user.reload.supervisees.length).to eq(2)
      get :index, params: {:user_id => @user.global_id, :supervisees => true}
      json = JSON.parse(response.body)
      logs = json['log'].sort_by{|l| l['id'] }
      expect(logs.length).to eq(6)
      expect(logs.map{|l| l['author']['id'] }.sort).to eq([users[0].global_id, users[0].global_id, users[0].global_id, users[1].global_id, users[1].global_id, users[1].global_id])
      expect(json['meta']['next_url']).to eq(nil)
    end

    it "should not return supervisee sessions that are before the user's login_cutoff" do
      users = [User.create, User.create, User.create]
      token_user
      users.each_with_index do |u, idx|
        u.settings['preferences']['logging_cutoff'] = 37
        u.settings['preferences']['logging_code'] = u.global_id
        u.save
        User.link_supervisor_to_user(@user, u)
        ts = (24 + (12 * idx)).hours.ago.to_i
        d = Device.create(:user => u)
        3.times do |i|
          LogSession.process_new({
            :events => [
              {'timestamp' => ts, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
              {'timestamp' => ts + 100, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
            ]
          }, {:user => u, :device => d, :author => u})
        end
      end
      Worker.process_queues
      expect(@user.reload.supervisees.length).to eq(3)
      get :index, params: {:user_id => @user.global_id, :supervisees => true}
      json = JSON.parse(response.body)
      logs = json['log'].sort_by{|l| l['id'] }
      expect(logs.length).to eq(6)
      expect(logs.map{|l| l['author']['id'] }.sort).to eq([users[0].global_id, users[0].global_id, users[0].global_id, users[1].global_id, users[1].global_id, users[1].global_id])
      expect(json['meta']['next_url']).to eq(nil)
      expect(json['meta']['logging_cutoffs']).to eq(true)
      expect(json['meta']['logging_cutoff_min']).to eq(37)

      request.headers["X-Logging-Code-For-#{users[0].global_id}"] = users[0].global_id
      request.headers["X-Logging-Code-For-#{users[1].global_id}"] = users[1].global_id
      request.headers["X-Logging-Code-For-#{users[2].global_id}"] = users[2].global_id
      get :index, params: {:user_id => @user.global_id, :supervisees => true}
      json = JSON.parse(response.body)
      logs = json['log'].sort_by{|l| l['id'] }
      expect(logs.length).to eq(9)
      expect(logs.map{|l| l['author']['id'] }.sort).to eq([users[0].global_id, users[0].global_id, users[0].global_id, users[1].global_id, users[1].global_id, users[1].global_id, users[2].global_id, users[2].global_id, users[2].global_id])
      expect(json['meta']['next_url']).to eq(nil)
      expect(json['meta']['logging_cutoffs']).to eq(nil)
      expect(json['meta']['logging_cutoff_min']).to eq(nil)
    end

    it "should filter by query parameters" do
      token_user
      geo = ClusterLocation.create(:user => @user, :cluster_type => 'geo')
      ip = ClusterLocation.create(:user => @user, :cluster_type => 'ip_address')
      l1 = LogSession.process_new({
        :events => [
          {'timestamp' => 3.weeks.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12']},
          {'timestamp' => 3.weeks.ago.to_i + 5, 'type' => 'button', 'button' => {'label' => 'x', 'board' => {'id' => '1_1'}}, 'ip_address' => '1.2.3.4'}
        ]
      }, {:user => @user, :device => @device, :author => @user, :ip_address => '1.2.3.4'})
      l1.update_columns(geo_cluster_id: geo.id, ip_cluster_id: ip.id)
      l2 = LogSession.process_new({
        :events => [
          {'timestamp' => 1.week.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}, 'geo' => ['13', '12']}
        ]
      }, {:user => @user, :device => @device, :author => @user})
      l2.update_columns(geo_cluster_id: geo.id)
      l3 = LogSession.process_new({
        :events => [
          {'timestamp' => 1.day.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}, 'ip_address' => '8.8.8.8'}
        ]
      }, {:user => @user, :device => @device, :author => @user, :ip_address => '8.8.8.8'})
      l3.update_columns(ip_cluster_id: ip.id)

      get :index, params: {:user_id => @user.global_id, :start => 2.weeks.ago.utc.strftime('%Y-%m-%d'), :end => 1.day.from_now.utc.strftime('%Y-%m-%d'), :device_id => @device.global_id}
      json = JSON.parse(response.body)
      expect(json['log'].length).to eq(2)
      expect(json['log'].map{|l| l['id'] }).to eq([l3.global_id, l2.global_id])

      get :index, params: {:user_id => @user.global_id, :device_id => "abc"}
      json = JSON.parse(response.body)
      expect(json['log'].length).to eq(0)

      get :index, params: {:user_id => @user.global_id, :end => 3.days.ago.to_s}
      json = JSON.parse(response.body)
      expect(json['log'].length).to eq(2)
      expect(json['log'].map{|l| l['id'] }).to eq([l2.global_id, l1.global_id])

      get :index, params: {:user_id => @user.global_id, :location_id => geo.global_id}
      json = JSON.parse(response.body)
      expect(json['log'].length).to eq(2)
      expect(json['log'].map{|l| l['id'] }).to eq([l2.global_id, l1.global_id])

      get :index, params: {:user_id => @user.global_id, :location_id => ip.global_id}
      json = JSON.parse(response.body)
      expect(json['log'].length).to eq(2)
      expect(json['log'].map{|l| l['id'] }).to eq([l3.global_id, l1.global_id])
    end
    
    it "should include query parameters in api next_url" do
      token_user
      (JsonApi::Log::DEFAULT_PAGE + 1).times do |i|
        LogSession.process_new({
          :events => [
            {'timestamp' => i.days.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
            {'timestamp' => (i.days.ago + 10).to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
          ]
        }, {:user => @user, :device => @device, :author => @user})
      end
      get :index, params: {:user_id => @user.global_id, :start => 2.weeks.ago.to_s}
      json = JSON.parse(response.body)
      expect(json['log'].length).to eq(JsonApi::Log::DEFAULT_PAGE)
      expect(json['meta']['next_url']).to match(/user_id=/)
      expect(json['meta']['next_url']).to match(/start=/)
      expect(json['meta']['next_url']).not_to match(/end=/)
      expect(json['meta']['next_url']).not_to match(/device_id=/)
      expect(json['meta']['next_url']).not_to match(/location_id=/)
    end

    it "should filter by goal_id" do
      token_user
      g = UserGoal.create(:user => @user)
      LogSession.process_new({
        :goal_id => g.global_id,
        :events => [
          {'timestamp' => 4.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 3.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => @user, :device => @device, :author => @user})
      LogSession.process_new({
        :goal_id => g.global_id,
        :events => [
          {'timestamp' => 8.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 7.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => @user, :device => @device, :author => @user})
      LogSession.process_new({
        :goal_id => g.global_id,
        :events => [
          {'timestamp' => 18.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 17.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => @user, :device => @device, :author => @user})
      get :index, params: {:user_id => @user.global_id, :goal_id => g.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['log'].length).to eq(3)
    end
    
    it "should return nothing for goal_id that doesn't match user" do
      token_user
      u = User.create
      g = UserGoal.create(:user => u)
      
      LogSession.process_new({
        :goal_id => g.global_id,
        :events => [
          {'timestamp' => 4.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 3.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => u, :device => @device, :author => @user})
      LogSession.process_new({
        :goal_id => g.global_id,
        :events => [
          {'timestamp' => 8.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 7.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => u, :device => @device, :author => @user})
      LogSession.process_new({
        :goal_id => g.global_id,
        :events => [
          {'timestamp' => 18.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 17.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => u, :device => @device, :author => @user})

      get :index, params: {:user_id => @user.global_id, :goal_id => g.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['log'].length).to eq(0)
    end

    it "should not include journal entries by default" do
      token_user
      a = LogSession.process_new({
        :events => [
          {'timestamp' => 4.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 3.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => @user, :device => @device, :author => @user})
      b = LogSession.process_new({
        :events => [
          {'timestamp' => 8.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 7.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => @user, :device => @device, :author => @user})
      c = LogSession.process_new({
        :type => 'journal',
        :vocalization => [],
        :category => 'journal'
      }, {:user => @user, :device => @device, :author => @user})

      get :index, params: {:user_id => @user.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['log'].length).to eq(2)
      expect(json['log'].map{|l| l['id'] }.sort).to eq([a.global_id, b.global_id].sort)
    end

    it "should show journal entries if specified and authorized" do
      token_user
      LogSession.process_new({
        :events => [
          {'timestamp' => 4.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 3.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => @user, :device => @device, :author => @user})
      LogSession.process_new({
        :events => [
          {'timestamp' => 8.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 7.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => @user, :device => @device, :author => @user})
      j = LogSession.process_new({
        :type => 'journal',
        :vocalization => [],
        :category => 'journal'
      }, {:user => @user, :device => @device, :author => @user})
      expect(j.id).to_not eq(nil)

      get :index, params: {:user_id => @user.global_id, :type => 'journal'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['log'].length).to eq(1)
      expect(json['log'][0]['id']).to eq(j.global_id)
    end

    it "should not show journal entries if specified but just a supervisor" do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u, nil, true)
      LogSession.process_new({
        :events => [
          {'timestamp' => 4.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 3.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => u, :device => @device, :author => @user})
      LogSession.process_new({
        :events => [
          {'timestamp' => 8.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 7.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => u, :device => @device, :author => @user})
      j = LogSession.process_new({
        :type => 'journal',
        :vocalization => [],
        :category => 'journal'
      }, {:user => u, :device => @device, :author => @user})

      get :index, params: {:user_id => u.global_id, :type => 'journal'}
      assert_unauthorized
    end

    it  "should not allow supervisors to see logs if private_logging is enabled" do
      token_user
      u = User.create
      u.settings['preferences']['private_logging'] = true
      u.save
      User.link_supervisor_to_user(@user, u, nil, true)
      LogSession.process_new({
        :events => [
          {'timestamp' => 11.hours.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 11.hours.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => u, :device => @device, :author => @user})
      LogSession.process_new({
        :events => [
          {'timestamp' => 13.hours.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 13.hours.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => u, :device => @device, :author => @user})
      get :index, params: {:user_id => u.global_id}
      assert_unauthorized
    end

    it "should limit logs based on logging_cutoff parameter" do
      token_user
      @user.settings['preferences']['logging_cutoff'] = 12
      @user.save
      expect(@user.logging_cutoff_for(@user, nil)).to eq(12)
      LogSession.process_new({
        :events => [
          {'timestamp' => 11.hours.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 11.hours.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => @user, :device => @device, :author => @user})
      LogSession.process_new({
        :events => [
          {'timestamp' => 13.hours.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 13.hours.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => @user, :device => @device, :author => @user})
      get :index, params: {:user_id => @user.global_id}
      json = assert_success_json
      expect(json['log'].length).to eq(1)
      expect(json['meta']['logging_cutoffs']).to eq(true)
      expect(json['meta']['logging_cutoff_min']).to eq(12)

      @user.settings['preferences']['logging_cutoff'] = 24
      @user.save
      expect(@user.logging_cutoff_for(@user, nil)).to eq(24)
      get :index, params: {:user_id => @user.global_id}
      json = assert_success_json
      expect(json['log'].length).to eq(2)
      expect(json['meta']['logging_cutoffs']).to eq(true)
      expect(json['meta']['logging_cutoff_min']).to eq(24)

      @user.settings['preferences']['logging_cutoff'] = 0
      @user.save
      expect(@user.logging_cutoff_for(@user, nil)).to eq(0)
      get :index, params: {:user_id => @user.global_id}
      json = assert_success_json
      # Users can always see their own logs when cutoff is 0 (avoids hiding just-created logs from self)
      expect(json['log'].length).to eq(2)
      # No cutoff applied when user views own logs with cutoff=0, so meta reflects that
      expect(json['meta']['logging_cutoffs']).to eq(nil)
      expect(json['meta']['logging_cutoff_min']).to eq(nil)
    end

    it "should allow overriding logging_cutoff with a valid logging code" do
      token_user
      @user.settings['preferences']['logging_cutoff'] = 12
      @user.settings['preferences']['logging_code'] = 'bacon'
      @user.save
      expect(@user.logging_cutoff_for(@user, nil)).to eq(12)
      LogSession.process_new({
        :events => [
          {'timestamp' => 11.hours.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 11.hours.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => @user, :device => @device, :author => @user})
      LogSession.process_new({
        :events => [
          {'timestamp' => 13.hours.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 13.hours.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => @user, :device => @device, :author => @user})
      get :index, params: {:user_id => @user.global_id}
      json = assert_success_json
      expect(json['log'].length).to eq(1)
      expect(json['meta']['logging_cutoffs']).to eq(true)
      expect(json['meta']['logging_cutoff_min']).to eq(12)

      request.headers["X-Logging-Code-For-#{@user.global_id}"] = 'bacon'
      get :index, params: {:user_id => @user.global_id}
      json = assert_success_json
      expect(json['log'].length).to eq(2)
      expect(json['meta']['logging_cutoffs']).to eq(nil)
      expect(json['meta']['logging_cutoff_min']).to eq(nil)
    end
  end

  
  describe "create" do
    it "should require api token" do
      post :create, params: {}
      assert_missing_token
    end
    
    it "should return unauthorized unless edit permissions allowed" do
      u = User.create
      token_user
      post :create, params: {:user_id => u.global_id}
      assert_unauthorized
    end
    
    it "should generate a log result and return it" do
      token_user
      post :create, params: {:log => {:events => [{'user_id' => @user.global_id, 'timestamp' => 5.hours.ago.to_i, 'type' => 'button', 'button' => {'label' => 'cool', 'spoken' => true, 'board' => {'id' => '1_1'}}}]}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['log']['pending']).to eq(true)
      Worker.process_queues
      log = LogSession.last
      expect(log.data['event_summary']).to eq('cool')
    end

    it "should try to extract and canonicalize the ip address" do
      token_user
      request.env['REMOTE_ADDR'] = '8.7.6.5'
      request.env['HTTP_X_FORWARDED_FOR'] = '8.7.6.5'
      post :create, params: {:log => {:events => [{'user_id' => @user.global_id, 'timestamp' => 5.hours.ago.to_i, 'type' => 'button', 'button' => {'label' => 'cool', 'spoken' => true, 'board' => {'id' => '1_1'}}}]}}
      expect(response).to be_successful
      Worker.process_queues
      s = LogSession.last
      json = JSON.parse(response.body)
      expect(json['log']['pending']).to eq(true)
      expect(s.data['event_summary']).to eq('cool')
      expect(s.data['ip_address']).to eq("0000:0000:0000:0000:0000:ffff:0807:0605")
    end
    
    it "should error gracefully on log update fail" do
      expect_any_instance_of(LogSession).to receive(:process_params){|u| u.add_processing_error("bacon") }.and_return(false)
      token_user
      post :create, params: {:log => {:events => [{'user_id' => @user.global_id, 'timestamp' => 5.hours.ago.to_i, 'type' => 'button', 'button' => {'label' => 'cool', 'board' => {'id' => '1_1'}}}]}}
      Worker.process_queues
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['log']['pending']).to eql(true)
    end
    
    it "should attach a note to a goal" do
      token_user
      g = UserGoal.create(:user => @user)
      post :create, params: {:log => {
        'note' => {
          'text' => 'ahem',
          'timestamp' => 1431461182
        },
        'goal_id' => g.global_id
      }}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      Worker.process_queues
      log = LogSession.last
      expect(log.data['event_summary']).to eq("Note by #{@user.user_name}: ahem")
      expect(log.goal).to eq(g)
      expect(log.log_type).to eq('note')
    end
    
    it "should ignore the goal_id when attaching a note to a goal if invalid" do
      token_user
      g = UserGoal.create(:user => @user)
      post :create, params: {:log => {
        'note' => {
          'text' => 'ahem',
          'timestamp' => 1431461182
        },
        'goal_id' => '12345'
      }}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      Worker.process_queues
      log = LogSession.last
      expect(log.data['event_summary']).to eq("Note by #{@user.user_name}: ahem")
      expect(log.goal).to eq(nil)
      expect(log.log_type).to eq('note')
    end
  end
  
  describe "update" do
    it "should require api token" do
      put 'update', params: {:id => '1234'}
      assert_missing_token
    end
    
    it "should require permission" do
      token_user
      u = User.create
      d = Device.create(:user => u)
      log = LogSession.create(:user => u, :author => u, :device => d)
      put 'update', params: {:id => log.global_id}
      assert_unauthorized
    end
    
    it "should limit log access based on logging_cutoff parameter" do
      token_user
      @user.settings['preferences']['logging_cutoff'] = 12
      @user.save
      d = Device.create(:user => @user)
      log = LogSession.process_new({
        :events => [
          {'timestamp' => 13.hours.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 13.hours.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => @user, :device => @device, :author => @user})
      put 'update', params: {:id => log.global_id, 'log' => {}}
      assert_unauthorized

      @user.settings['preferences']['logging_code'] = 'bacon'
      @user.save
      request.headers["X-Logging-Code-For-#{@user.global_id}"] = 'bacon'
      put 'update', params: {:id => log.global_id, 'log' => {}}
      json = assert_success_json

      request.headers["X-Logging-Code-For-#{@user.global_id}"] = 'wrong'
      @user.settings['preferences']['logging_cutoff'] = 14
      @user.save
      put 'update', params: {:id => log.global_id, 'log' => {}}
      json = assert_success_json
    end

    it "should call process with :update_only flag" do
      token_user
      d = Device.create(:user => @user)
      log = LogSession.create(:user => @user, :author => @user, :device => d)
      expect_any_instance_of(LogSession).to receive(:process_params).with({}, hash_including(:update_only => true))
      put 'update', params: {:id => log.global_id, 'log' => {}}
      expect(response).to be_successful
    end
    
    it "should update notes" do
      token_user
      d = Device.create(:user => @user)
      now = 1415689201
      params = {
        'events' => [
          {'id' => 'abc', 'type' => 'button', 'button' => {'label' => 'I', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 10, },
          {'id' => 'qwe', 'type' => 'button', 'button' => {'label' => 'like', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 8},
          {'id' => 'wer', 'type' => 'button', 'button' => {'label' => 'ok go', 'board' => {'id' => '1_1'}}, 'timestamp' => now}
        ]
      }
      log = LogSession.process_new(params, {
        :user => @user,
        :author => @user,
        :device => d
      })
      expect(log.data['events'].map{|e| e['id'] }).to eql(['abc', 'qwe', 'wer'])
      expect(log.data['events'].map{|e| e['notes'] }).to eql([nil, nil, nil])
      
      params = {
        'events' => [
          {'id' => 'abc', 'type' => 'button', 'button' => {'label' => 'I', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 10, 'notes' => [
            {'note' => 'ok cool'}
          ]},
          {'id' => 'qwe', 'type' => 'button', 'button' => {'label' => 'like', 'board' => {'id' => '1_1'}}, 'timestamp' => now - 8},
          {'id' => 'wer', 'type' => 'button', 'button' => {'label' => 'ok go', 'board' => {'id' => '1_1'}}, 'timestamp' => now, 'notes' => [
            {'note' => 'that is good'}
          ]}
        ]
      }
      put 'update', params: {:id => log.global_id, 'log' => params}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      
      expect(json['log']['events'].length).to eql(3)

      notes = json['log']['events'][0]['notes']
      expect(notes.length).to eql(1);
      note = notes[0]
      expect(note['note']).to eql('ok cool')
      expect(note['author']).to eql({
        'id' => @user.global_id,
        'user_name' => @user.user_name
      })

      note = json['log']['events'][2]['notes'][0]
      expect(note['note']).to eql('that is good')
      expect(note['author']).to eql({
        'id' => @user.global_id,
        'user_name' => @user.user_name
      })
    end
  end
  
  describe "lam" do
    it "should not require api token" do
      get 'lam', params: {:log_id => '1234'}
      expect(response).to be_successful
    end
    
    it "should error gracefully on not found" do
      get 'lam', params: {:log_id => '1234'}
      expect(response).to be_successful
      expect(response.body).to eql("Not found")
      
      u = User.create
      d = Device.create(:user => u)
      log = LogSession.create(:user => u, :device => d, :author => u, :data => {'nonce' => 'abc'})
      get 'lam', params: {:log_id => log.global_id}
      expect(response).to be_successful
      expect(response.body).to eql("Not found")
    end
    
    it "should render a LAM file on success" do
      u = User.create
      d = Device.create(:user => u)
      log = LogSession.create(:user => u, :device => d, :author => u, :data => {'nonce' => 'abc'})
      get 'lam', params: {:log_id => log.global_id, :nonce => log.data['nonce']}
      expect(response).to be_successful
      expect(response.body).to match(/CAUTION/)
      expect(response.body).to match(/LAM Version 2\.00/)
    end
  end

  describe "import" do
    it "should require an api token" do
      post 'import', params: {:user_id => 'asdf'}
      assert_missing_token
    end
    
    it "should error if the user doesn't exist" do
      token_user
      post 'import', params: {:user_id => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require authorization" do
      token_user
      u = User.create
      post 'import', params: {:user_id => u.global_id}
      assert_unauthorized
    end
    
    it "should return upload parameters if no url defined" do
      token_user
      post 'import', params: {:user_id => @user.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['remote_upload']).to_not eq(nil)
    end
    
    it "should process the data" do
      token_user
      post 'import', params: {:user_id => @user.global_id, :type => 'lam', :url => "some content"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['progress']).to_not eq(nil)
      progress = Progress.find_by_global_id(json['progress']['id'])
      expect(progress.settings['class']).to eq('Exporter')
      expect(progress.settings['method']).to eq('process_log')
      expect(progress.settings['arguments']).to eq(['some content', 'lam', @user.global_id, @user.global_id, @user.devices[0].global_id])
    end

    it "should import obl data" do
      token_user
      post 'import', params: {:user_id => @user.global_id, :type => 'obl', :url => "some content"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['progress']).to_not eq(nil)
      progress = Progress.find_by_global_id(json['progress']['id'])
      expect(progress.settings['class']).to eq('Exporter')
      expect(progress.settings['method']).to eq('process_log')
      expect(progress.settings['arguments']).to eq(['some content', 'obl', @user.global_id, @user.global_id, @user.devices[0].global_id])
    end
    
    it "should return a progress object" do
      token_user
      post 'import', params: {:user_id => @user.global_id, :type => 'lam', :url => "some content"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['progress']).to_not eq(nil)
      progress = Progress.find_by_global_id(json['progress']['id'])
      expect(progress).to_not eq(nil)
    end
  end
  
  describe "trends" do
    after(:each) do
      Permissable.permissions_redis.del('global/stats/trends')
    end

    it "should not require an api token" do
      expect(Permissable.permissions_redis).to receive(:get).with('global/stats/trends').and_return({'a' => 1, 'admin' => 'asdf'}.to_json)
      get 'trends'
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'a' => 1})
    end
    
    it "should return a progress object if no data cached" do
      expect(Permissable.permissions_redis).to receive(:get).and_return(nil)
      get 'trends'
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['progress']).to_not eq(nil)
      expect(json['progress']['id']).to_not eq(nil)
      expect(Worker.scheduled_for?('priority', Progress, 'perform_action', Progress.last.id)).to eq(true)
    end

    it "should return trend data" do
      expect(Permissable.permissions_redis).to receive(:get).and_return(nil)
      get 'trends'
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['progress']).to_not eq(nil)
      expect(json['progress']['id']).to_not eq(nil)
      expect(Worker.scheduled_for?('priority', Progress, 'perform_action', Progress.last.id)).to eq(true)
      p = Progress.last
      expect(p.settings['class']).to eq('WeeklyStatsSummary')
      expect(p.settings['method']).to eq('trends')
      expect(p.settings['arguments']).to eq([])
    end
    
    it "should return additional data for admins" do
      Permissable.permissions_redis.set('global/stats/trends', {'a' => 1, 'admin' => 'asdf'}.to_json)
      o = Organization.create(:admin => true)
      token_user
      o.add_manager(@user.user_name, true)

      get 'trends'
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'a' => 1, 'admin' => 'asdf'})
    end
  end

  describe "trends_slice" do
    it "should not require an api token" do
      get 'trends_slice'
      assert_error('Invalid credentials')
    end

    it "should error by default" do
      get 'trends_slice'
      assert_error('Invalid credentials')
    end

    it "should allow access for an authorized integration" do
      u = User.create
      ui = UserIntegration.create(user: u)
      ui.settings['allow_trends'] = true
      ui.save
      dk = DeveloperKey.create
      d = Device.create(user: u, user_integration_id: ui.id, developer_key_id: dk.id)
      get 'trends_slice', params: {integration_id: dk.key, integration_secret: dk.secret}
      assert_error("users must be requested in blocks of between five to ten at a time")
    end

    it "should error with too few user ids" do
      u = User.create
      ui = UserIntegration.create(user: u)
      ui.settings['allow_trends'] = true
      ui.save
      dk = DeveloperKey.create
      d = Device.create(user: u, user_integration_id: ui.id, developer_key_id: dk.id)
      get 'trends_slice', params: {integration_id: dk.key, integration_secret: dk.secret, user_ids: "a,b"}
      assert_error("users must be requested in blocks of between five to ten at a time")
    end

    it "should error with too many user ids" do
      u = User.create
      ui = UserIntegration.create(user: u)
      ui.settings['allow_trends'] = true
      ui.save
      dk = DeveloperKey.create
      d = Device.create(user: u, user_integration_id: ui.id, developer_key_id: dk.id)
      get 'trends_slice', params: {integration_id: dk.key, integration_secret: dk.secret, user_ids: "a,b,c,d,e,f,g,h,i,j,k,l"}
      assert_error("users must be requested in blocks of between five to ten at a time")
    end

    it "should error on invalid ids" do
      u = User.create
      ui = UserIntegration.create(user: u)
      ui.settings['allow_trends'] = true
      ui.save
      dk = DeveloperKey.create
      d = Device.create(user: u, user_integration_id: ui.id, developer_key_id: dk.id)
      get 'trends_slice', params: {integration_id: dk.key, integration_secret: dk.secret, user_ids: "a,b,c,d,e,f,g,h,i"}
      assert_error("invalid user ids")
      expect(@error_json['ids']).to eq(["a","b","c","d","e","f","g","h","i"])
    end

    it "should error with insufficient data if not enough results" do
      u = User.create
      ui = UserIntegration.create(user: u)
      ui.settings['allow_trends'] = true
      ui.save
      us = []
      8.times do |i|
        us << User.create
      end
      dk = DeveloperKey.create
      d = Device.create(user: u, user_integration_id: ui.id, developer_key_id: dk.id)
      get 'trends_slice', params: {integration_id: dk.key, integration_secret: dk.secret, user_ids: us.map{|u| ui.user_token(u) }.join(',')}
      assert_error("not enough users for report, only the specified ids contained usage data")
      expect(@error_json['ids']).to eq([])
    end

    it "should error with only one record-containing user" do
      u = User.create
      ui = UserIntegration.create(user: u)
      ui.settings['allow_trends'] = true
      ui.save
      us = []
      8.times do |i|
        u = User.create
        u.settings['preferences']['allow_log_reports'] = true
        u.save
        us << u
      end
      WeeklyStatsSummary.create(weekyear: WeeklyStatsSummary.date_to_weekyear(3.weeks.ago.to_date), user_id: us[0].id)
      dk = DeveloperKey.create
      d = Device.create(user: u, user_integration_id: ui.id, developer_key_id: dk.id)
      get 'trends_slice', params: {integration_id: dk.key, integration_secret: dk.secret, user_ids: us.map{|u| ui.user_token(u) }.join(',')}
      assert_error("not enough users for report, only the specified ids contained usage data")
      expect(@error_json['ids']).to eq([ui.user_token(us[0])])
    end

    it "should error with two record-containing users" do
      u = User.create
      ui = UserIntegration.create(user: u)
      ui.settings['allow_trends'] = true
      ui.save
      us = []
      8.times do |i|
        u = User.create
        u.settings['preferences']['allow_log_reports'] = true
        u.save
        us << u
      end
      WeeklyStatsSummary.create(weekyear: WeeklyStatsSummary.date_to_weekyear(3.weeks.ago.to_date), user_id: us[0].id)
      WeeklyStatsSummary.create(weekyear: WeeklyStatsSummary.date_to_weekyear(6.weeks.ago.to_date), user_id: us[1].id)
      WeeklyStatsSummary.create(weekyear: WeeklyStatsSummary.date_to_weekyear(36.weeks.ago.to_date), user_id: us[2].id)
      dk = DeveloperKey.create
      d = Device.create(user: u, user_integration_id: ui.id, developer_key_id: dk.id)
      get 'trends_slice', params: {integration_id: dk.key, integration_secret: dk.secret, user_ids: us.map{|us_u| ui.user_token(us_u) }.join(',')}
      assert_error("not enough users for report, only the specified ids contained usage data")
      expect(@error_json['ids']).to eq([ui.user_token(us[0]), ui.user_token(us[1])])
    end

    it "should return a progress result for three or more record-containing users" do
      u = User.create
      ui = UserIntegration.create(user: u)
      ui.settings['allow_trends'] = true
      ui.save
      us = []
      8.times do |i|
        u = User.create
        u.settings['preferences']['allow_log_reports'] = true
        u.save
        us << u
      end
      WeeklyStatsSummary.create(weekyear: WeeklyStatsSummary.date_to_weekyear(3.weeks.ago.to_date), user_id: us[0].id)
      WeeklyStatsSummary.create(weekyear: WeeklyStatsSummary.date_to_weekyear(6.weeks.ago.to_date), user_id: us[1].id)
      WeeklyStatsSummary.create(weekyear: WeeklyStatsSummary.date_to_weekyear(5.weeks.ago.to_date), user_id: us[2].id)
      dk = DeveloperKey.create
      d = Device.create(user: u, user_integration_id: ui.id, developer_key_id: dk.id)
      get 'trends_slice', params: {integration_id: dk.key, integration_secret: dk.secret, user_ids: us.map{|us_u| ui.user_token(us_u) }.join(',')}
      json = assert_success_json
      expect(json['message']).to eq('Data is generating, please check back soon...')
      expect(json['progress']).to_not eq(nil)
      p = Progress.find_by_global_id(json['progress']['id'])
      expect(p).to_not eq(nil)
      expect(p.settings['class']).to eq('WeeklyStatsSummary')
      expect(p.settings['method']).to eq('trends_for')
      expect(p.settings['arguments']).to eq([[us[0].global_id, us[1].global_id, us[2].global_id]])
    end

    it "should not include supervisors or users with research disabled" do
      u = User.create
      ui = UserIntegration.create(user: u)
      ui.settings['allow_trends'] = true
      ui.save
      us = []
      8.times do |i|
        u = User.create
        u.settings['preferences']['allow_log_reports'] = true
        u.save
        us << u
      end
      us[3].settings['preferences']['allow_log_reports'] = false
      us[3].save
      us[4].settings['preferences']['role'] = 'supporter'
      us[4].save
      WeeklyStatsSummary.create(weekyear: WeeklyStatsSummary.date_to_weekyear(3.weeks.ago.to_date), user_id: us[0].id)
      WeeklyStatsSummary.create(weekyear: WeeklyStatsSummary.date_to_weekyear(6.weeks.ago.to_date), user_id: us[1].id)
      WeeklyStatsSummary.create(weekyear: WeeklyStatsSummary.date_to_weekyear(5.weeks.ago.to_date), user_id: us[2].id)
      WeeklyStatsSummary.create(weekyear: WeeklyStatsSummary.date_to_weekyear(5.weeks.ago.to_date), user_id: us[3].id)
      WeeklyStatsSummary.create(weekyear: WeeklyStatsSummary.date_to_weekyear(5.weeks.ago.to_date), user_id: us[4].id)
      dk = DeveloperKey.create
      d = Device.create(user: u, user_integration_id: ui.id, developer_key_id: dk.id)
      get 'trends_slice', params: {integration_id: dk.key, integration_secret: dk.secret, user_ids: us.map{|us_u| ui.user_token(us_u) }.join(',')}
      json = assert_success_json
      expect(json['message']).to eq('Data is generating, please check back soon...')
      expect(json['progress']).to_not eq(nil)
      p = Progress.find_by_global_id(json['progress']['id'])
      expect(p).to_not eq(nil)
      expect(p.settings['class']).to eq('WeeklyStatsSummary')
      expect(p.settings['method']).to eq('trends_for')
      expect(p.settings['arguments']).to eq([[us[0].global_id, us[1].global_id, us[2].global_id]])
    end

    it "should not allow too many requests for the same user" do
      u = User.create
      ui = UserIntegration.create(user: u)
      ui.settings['allow_trends'] = true
      ui.save
      us = []
      8.times do |i|
        u = User.create
        u.settings['preferences']['allow_log_reports'] = true
        u.save
        us << u
      end
      dk = DeveloperKey.create
      d = Device.create(user: u, user_integration_id: ui.id, developer_key_id: dk.id)
      d = Device.create(user: u, user_integration_id: ui.id, developer_key_id: dk.id)
      get 'trends_slice', params: {integration_id: dk.key, integration_secret: dk.secret, user_ids: us.map{|us_u| ui.user_token(us_u) }.join(',')}
      assert_error("not enough users for report, only the specified ids contained usage data")
      expect(@error_json['ids']).to eq([])
      get 'trends_slice', params: {integration_id: dk.key, integration_secret: dk.secret, user_ids: us.map{|us_u| ui.user_token(us_u) }.join(',')}
      assert_error("exceeded quota for user ids")
      expect(@error_json['ids']).to eq(us.map{|us_u| ui.user_token(us_u) })
    end
  end

  describe "anonymous_logs" do
    after(:each) do
      Permissable.permissions_redis.del('global/anonymous/logs/url')
    end

    it "should not require an api token" do
      expect(Permissable.permissions_redis).to receive(:get).with('global/anonymous/logs/url').and_return({url: "http://www.example.com/logs.zip"}.to_json)
      get 'anonymous_logs'
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'url' => "http://www.example.com/logs.zip"})
    end
    
    it "should return a progress object if no data cached" do
      expect(Permissable.permissions_redis).to receive(:get).and_return(nil)
      get 'anonymous_logs'
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['progress']).to_not eq(nil)
      expect(json['progress']['id']).to_not eq(nil)
      expect(Worker.scheduled_for?('priority', Progress, 'perform_action', Progress.last.id)).to eq(true)
    end

    it "should return trend data" do
      expect(Permissable.permissions_redis).to receive(:get).and_return(nil)
      get 'anonymous_logs'
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['progress']).to_not eq(nil)
      expect(json['progress']['id']).to_not eq(nil)
      expect(Worker.scheduled_for?('priority', Progress, 'perform_action', Progress.last.id)).to eq(true)
      p = Progress.last
      expect(p.settings['class']).to eq('LogSession')
      expect(p.settings['method']).to eq('anonymous_logs')
      expect(p.settings['arguments']).to eq([])
    end

  end
  
  describe "show" do
    it 'should require an api token' do
      get 'show', params: {id: 'asdf'}
      assert_missing_token
    end

    it 'should require a valid record' do
      token_user
      get 'show', params: {id: 'asdf'}
      assert_not_found('asdf')
    end

    it 'should require supervision authorization on the logged user' do
      token_user
      u = User.create
      d = Device.create(user: u)
      log = LogSession.process_new({
        :events => [
          {'timestamp' => 4.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 3.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => u, :device => d, :author => u})
      get :show, params: {:id => log.global_id}
      assert_unauthorized
    end

    it "should limit log access based on logging_cutoff parameter" do
      token_user
      @user.settings['preferences']['logging_cutoff'] = 6
      @user.save
      log = LogSession.process_new({
        :events => [
          {'timestamp' => 7.hours.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 7.hours.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => @user, :device => @device, :author => @user})
      get :show, params: {:id => log.global_id}
      assert_unauthorized

      @user.settings['preferences']['logging_code'] = 'bacon'
      @user.save
      request.headers["X-Logging-Code-For-#{@user.global_id}"] = 'bacon'
      get :show, params: {:id => log.global_id}
      json = assert_success_json
      expect(json['log']['id']).to eq(log.global_id)

      request.headers["X-Logging-Code-For-#{@user.global_id}"] = 'wrong'
      @user.settings['preferences']['logging_cutoff'] = 8
      @user.save
      get :show, params: {:id => log.global_id}
      json = assert_success_json
      expect(json['log']['id']).to eq(log.global_id)
    end

    it 'should return a log result' do
      token_user
      log = LogSession.process_new({
        :events => [
          {'timestamp' => 4.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 3.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => @user, :device => @device, :author => @user})
      get :show, params: {:id => log.global_id}
      json = JSON.parse(response.body)
      expect(json['log']['id']).to eq(log.global_id)
    end

    it 'should return events data if no encryption header sent' do
      token_user
      log = LogSession.process_new({
        :events => [
          {'timestamp' => 4.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 3.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => @user, :device => @device, :author => @user})
      get :show, params: {:id => log.global_id}
      json = JSON.parse(response.body)
      expect(json['log']['id']).to eq(log.global_id)
      expect(json['log']['events']).to eq([{"id"=>1,
        "parts_of_speech"=>{"types"=>["other"]},
        "spoken"=>false,
        "summary"=>"ok",
        "timestamp"=>4.seconds.ago.to_i,
        "type"=>"button"},
      {"id"=>2,
        "parts_of_speech"=>{"types"=>["other"]},
        "spoken"=>false,
        "summary"=>"never mind",
        "timestamp"=>3.seconds.ago.to_i,
        "type"=>"button"
      }])
      expect(json['log']['data_url']).to eq(nil)
      expect(json['log']['encryption_settings']).to eq(nil)
    end

    it 'should return url if encryption header sent' do
      token_user
      log = LogSession.process_new({
        :events => [
          {'timestamp' => 4.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 3.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => @user, :device => @device, :author => @user})
      log.data['extra_data_encryption'] = ExternalNonce.init_client_encryption
      log.data['extra_data_public'] = true
      log.data['extra_data_nonce'] = 'abcdefg'
      log.save
      expect(log.extra_data_public_url).to_not eq(nil)
      request.headers['X-SUPPORTS-REMOTE-ENCRYPTION'] = 'true'
      get :show, params: {:id => log.global_id}
      json = JSON.parse(response.body)
      expect(json['log']['id']).to eq(log.global_id)
      expect(json['log']['events']).to eq(nil)
      expect(json['log']['data_url']).to_not eq(nil)
      expect(json['log']['encryption_settings']).to_not eq(nil)
      expect(json['log']['encryption_settings'].keys.sort).to eq(['hash', 'iv', 'key'])
    end
  end
  
  describe "obl" do
    it 'should require an api token' do
      get 'obl'
      assert_missing_token
    end

    it 'should require a valid log id' do
      token_user
      get :obl, params: {log_id: 'asdf'}
      assert_not_found('asdf')
    end

    it 'should require supervision permission on the logged user' do
      token_user
      u = User.create
      d = Device.create(user: u)
      log = LogSession.process_new({
        :events => [
          {'timestamp' => 4.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 3.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => u, :device => d, :author => u})
      get :obl, params: {log_id: log.global_id}
      assert_unauthorized
    end

    it "should limit log access based on logging_cutoff parameter" do
      token_user
      @user.settings['preferences']['logging_cutoff'] = 6
      @user.save
      log = LogSession.process_new({
        :events => [
          {'timestamp' => 7.hours.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 7.hours.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => @user, :device => @device, :author => @user})
      get :obl, params: {:log_id => log.global_id}
      assert_unauthorized

      request.headers["X-Logging-Code-For-#{@user.global_id}"] = 'bacon'
      @user.settings['preferences']['logging_code'] = 'bacon'
      @user.save
      get :obl, params: {:log_id => log.global_id}
      json = assert_success_json
      expect(json['progress']).to_not eq(nil)
      p = Progress.last
      expect(p.settings['method']).to eq('export_log')
      expect(p.settings['arguments']).to eq([log.global_id])

      request.headers["X-Logging-Code-For-#{@user.global_id}"] = 'wrong'
      @user.settings['preferences']['logging_cutoff'] = 8
      @user.save
      get :obl, params: {:log_id => log.global_id}
      json = assert_success_json
    end

    it 'should return a progress record when generating for the log record' do
      token_user
      log = LogSession.process_new({
        :events => [
          {'timestamp' => 4.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 3.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => @user, :device => @device, :author => @user})
      get :obl, params: {:log_id => log.global_id}
      json = JSON.parse(response.body)
      expect(json['progress']).to_not eq(nil)
      p = Progress.last
      expect(p.settings['method']).to eq('export_log')
      expect(p.settings['arguments']).to eq([log.global_id])
    end

    it 'should require a valid user id if specified' do
      token_user
      get :obl, params: {user_id: 'asdf'}
      assert_not_found('asdf')
    end

    it 'should require supervision permission on the user if specified' do
      token_user
      u = User.create
      get :obl, params: {user_id: u.global_id}
      assert_unauthorized
    end

    it "should not allow by user_id if there is a logging_cutoff parameter" do
      token_user
      @user.settings['preferences']['logging_cutoff'] = 8
      @user.save
      get :obl, params: {user_id: @user.global_id}
      assert_unauthorized

      @user.settings['preferences']['logging_code'] = 'bacon'
      @user.save
      request.headers["X-Logging-Code-For-#{@user.global_id}"] = 'bacon'
      get :obl, params: {user_id: @user.global_id}
      json = assert_success_json
      expect(json['progress']).to_not eq(nil)
      p = Progress.last
      expect(p.settings['method']).to eq('export_logs')
      expect(p.settings['arguments']).to eq([@user.global_id, false])

      request.headers["X-Logging-Code-For-#{@user.global_id}"] = 'wrong'
      get :obl, params: {user_id: @user.global_id}
      assert_unauthorized
    end

    it 'should return a progress record when generating for the user' do
      token_user
      get :obl, params: {user_id: @user.global_id}
      json = JSON.parse(response.body)
      expect(json['progress']).to_not eq(nil)
      p = Progress.last
      expect(p.settings['method']).to eq('export_logs')
      expect(p.settings['arguments']).to eq([@user.global_id, false])
    end
  end

  describe "code_check" do
    it "should require an API token" do
      post :code_check, params: {user_id: 'asdf', code: 'asdf'}
      assert_missing_token
    end

    it "should require a valid user" do
      token_user
      post :code_check, params: {user_id: 'asdf', code: 'asdf'}
      assert_not_found('asdf')
    end

    it "should require authorization" do
      token_user
      u = User.create
      post :code_check, params: {user_id: u.global_id, code: 'asdf'}
      assert_unauthorized
    end

    it "should not be allowed for supervisors if private_logging is enabled" do
      token_user
      u = User.create
      u.settings['preferences']['private_logging'] = true
      u.settings['preferences']['logging_code'] = 'tulip'
      u.save
      User.link_supervisor_to_user(@user, u, nil, true)
      post :code_check, params: {user_id: u.global_id, code: 'asdf'}
      assert_unauthorized
    end

    it "should return whether the code is valid" do
      token_user
      u = User.create
      u.settings['preferences']['logging_code'] = 'tulip'
      u.save
      User.link_supervisor_to_user(@user, u, nil, true)
      post :code_check, params: {user_id: u.global_id, code: 'tulip'}
      json = assert_success_json
      expect(json['valid']).to eq(true)

      post :code_check, params: {user_id: u.global_id, code: 'tulips'}
      json = assert_success_json
      expect(json['valid']).to eq(false)
    end
  end
end
