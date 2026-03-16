require 'spec_helper'

describe Api::UnitsController, :type => :controller do
  describe "index" do
    it "should require an api token" do
      get :index
      assert_missing_token
    end
    
    it "should require an existing org" do
      token_user
      get :index, params: {:organization_id => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require authorization" do
      token_user
      o = Organization.create
      get :index, params: {:organization_id => o.global_id}
      assert_unauthorized
    end
    
    it "should return a paginated list" do
      token_user
      o = Organization.create
      o.add_manager(@user.global_id)
      ou = OrganizationUnit.create(:organization => o)
      ou2 = OrganizationUnit.create(:organization => o)
      get :index, params: {:organization_id => o.global_id}
      expect(response).to be_successful
      res = JSON.parse(response.body)
      expect(res['unit']).to_not eq(nil)
      expect(res['unit'].length).to eq(2)
      expect(res['meta']['more']).to eq(false)
    end
  end

  describe "create" do
    it "should require an api token" do
      post :create
      assert_missing_token
    end
    
    it "should require an existing org" do
      token_user
      post :create, params: {:unit => {'organization_id' => 'asdf'}}
      assert_not_found('asdf')
    end
    
    it "should require authorization" do
      token_user
      o = Organization.create
      post :create, params: {:unit => {'organization_id' => o.global_id}}
      assert_unauthorized
    end
    
    it "should create the unit and return the result" do
      token_user
      o = Organization.create
      o.add_manager(@user.user_name)
      post :create, params: {:unit => {'organization_id' => o.global_id, 'name' => 'Cool Room'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['unit']['name']).to eq('Cool Room')
    end
  end

  describe "show" do
    it "should require an api token" do
      get :show, params: {:id => 'asdf'}
      assert_missing_token
    end
    
    it "should require an existing record" do
      token_user
      get :show, params: {:id => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require authorization" do
      token_user
      o = Organization.create
      ou = OrganizationUnit.create(:organization => o)
      get :show, params: {:id => ou.global_id}
      assert_unauthorized
    end
    
    it "should return the result" do
      token_user
      o = Organization.create
      o.add_manager(@user.user_name)
      ou = OrganizationUnit.create(:organization => o)
      get :show, params: {:id => ou.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['unit']['id']).to eq(ou.global_id)
    end
  end
  
  describe "update" do
    it "should require an api token" do
      put :update, params: {:id => 'asdf'}
      assert_missing_token
    end
    
    it "should require an existing record" do
      token_user
      put :update, params: {:id => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require authorization" do
      token_user
      o = Organization.create
      ou = OrganizationUnit.create(:organization => o)
      put :update, params: {:id => ou.global_id}
      assert_unauthorized
    end
    
    it "should update the record and return the result" do
      token_user
      o = Organization.create
      o.add_manager(@user.user_name)
      ou = OrganizationUnit.create(:organization => o)
      put :update, params: {:id => ou.global_id, :unit => {'name' => 'Better Room'}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['unit']['id']).to eq(ou.global_id)
      expect(json['unit']['name']).to eq('Better Room')
    end
  end

  describe "destroy" do
    it "should require an api token" do
      delete :destroy, params: {:id => 'asdf'}
      assert_missing_token
    end
    
    it "should require an existing record" do
      token_user
      delete :destroy, params: {:id => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require authorization" do
      token_user
      o = Organization.create
      ou = OrganizationUnit.create(:organization => o)
      delete :destroy, params: {:id => ou.global_id}
      assert_unauthorized
    end
    
    it "should delete the record and return the result" do
      token_user
      o = Organization.create
      o.add_manager(@user.user_name)
      ou = OrganizationUnit.create(:organization => o)
      delete :destroy, params: {:id => ou.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['unit']['id']).to eq(ou.global_id)
      expect(OrganizationUnit.find_by_global_id(ou.global_id)).to eq(nil)
    end
  end
  
  describe "stats" do
    it "should require api token" do
      get :stats, params: {:unit_id => '1_1234'}
      assert_missing_token
    end
    
    it "should return not found unless org exists" do
      token_user
      get :stats, params: {:unit_id => '1_1234'}
      assert_not_found("1_1234")
    end
    
    it "should return unauthorized unless permissions allowed" do
      token_user
      o = Organization.create
      u = OrganizationUnit.create(:organization => o)
      get :stats, params: {:unit_id => u.global_id}
      assert_unauthorized
    end
    
    it "should return expected stats" do
      token_user
      user = User.create
      d = Device.create(:user => user)
      o = Organization.create
      u = OrganizationUnit.create(:organization => o)
      o.add_user(user.user_name, false, false)
      o.add_supervisor(@user.user_name, false)
      u.add_supervisor(@user.user_name)
      expect(u.reload.all_user_ids.length).to eq(1)
      get :stats, params: {:unit_id => u.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'weeks' => [], 'supervisor_weeks' => {}, 'user_weeks' => {}, 
        'user_counts' => {"goal_recently_logged"=>0, "goal_set"=>0, "modeled_word_counts"=>[], "recent_session_count"=>0, "recent_session_hours"=>0.0, "recent_session_seconds"=>0.0, "recent_session_user_count"=>0, "total_models"=>0, "total_seconds"=>0, "total_sessions"=>0, "total_user_weeks"=>0, "total_users"=>0, "total_words"=>0, "word_counts"=>[]}
      })
      
      LogSession.process_new({
        :events => [
          {'timestamp' => 4.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 3.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => user, :device => d, :author => user})
      LogSession.process_new({
        :events => [
          {'timestamp' => 4.weeks.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
          {'timestamp' => 4.weeks.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
        ]
      }, {:user => user, :device => d, :author => user})
      Worker.process_queues
      get :stats, params: {:unit_id => u.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'weeks' => [], 'supervisor_weeks' => {}, 'user_weeks' => {}, 
        'user_counts' => {"goal_recently_logged"=>0, "goal_set"=>0, "modeled_word_counts"=>[], "recent_session_count"=>0, "recent_session_hours"=>0.0, "recent_session_seconds"=>0.0, "recent_session_user_count"=>0, "total_models"=>0, "total_seconds"=>0, "total_sessions"=>0, "total_user_weeks"=>0, "total_users"=>0, "total_words"=>0, "word_counts"=>[]}
      })
      
      expect(u.add_communicator(user.user_name)).to eq(true)
      expect(u.reload.all_user_ids.length).to eq(2)
      get :stats, params: {:unit_id => u.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)['weeks']
      expect(json.length).to eq(2)
      expect(json[0]['sessions']).to eq(1)
      expect(json[0]['timestamp']).to be > 0
      expect(json[1]['sessions']).to eq(1)
      expect(json[1]['timestamp']).to be > 0
    end
    
    it "should include goal stats" do
      token_user
      user = User.create
      user.settings['primary_goal'] = {
        'id' => 'asdf',
        'last_tracked' => Time.now.iso8601
      }
      user.save
      d = Device.create(:user => user)
      o = Organization.create
      u = OrganizationUnit.create(:organization => o)
      o.add_supervisor(@user.user_name, false)
      o.add_user(user.user_name, false, false)
      u.add_supervisor(@user.user_name)
      expect(u.reload.all_user_ids.length).to eq(1)
      get :stats, params: {:unit_id => u.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'weeks' => [], 'supervisor_weeks' => {}, 'user_weeks' => {}, 
        'user_counts' => {"goal_recently_logged"=>0, "goal_set"=>0, "modeled_word_counts"=>[], "recent_session_count"=>0, "recent_session_hours"=>0.0, "recent_session_seconds"=>0.0, "recent_session_user_count"=>0, "total_models"=>0, "total_seconds"=>0, "total_sessions"=>0, "total_user_weeks"=>0, "total_users"=>0, "total_words"=>0, "word_counts"=>[]}
      })
      
      get :stats, params: {:unit_id => u.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user_counts']).to eq({
        'goal_set' => 0,
        'goal_recently_logged' => 0, 
        'recent_session_count' => 0, 
        'recent_session_user_count' => 0, 
        'recent_session_seconds' => 0.0,
        'recent_session_hours' => 0.0,
        "modeled_word_counts" => [],
        "total_models" => 0,
        "total_seconds" => 0,
        "total_sessions" => 0,
        "total_user_weeks" => 0,
        "total_words" => 0,
        "word_counts" => [],
        'total_users' => 0
      })
      
      u.add_communicator(user.user_name)
      expect(u.reload.all_user_ids.length).to eq(2)
      get :stats, params: {:unit_id => u.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user_counts']).to eq({
        'goal_set' => 1,
        'goal_recently_logged' => 1,
        'recent_session_count' => 0, 
        'recent_session_user_count' => 0,
        'recent_session_seconds' => 0.0,
        'recent_session_hours' => 0.0, 
        "modeled_word_counts" => [],
        "total_models" => 0,
        "total_seconds" => 0,
        "total_sessions" => 0,
        "total_user_weeks" => 0,
        "total_words" => 0,
        "word_counts" => [],
        'total_users' => 1
      })
    end

    it "should include statuses for communicators" do
      token_user
      user = User.create
      ts = Time.now.beginning_of_week(:monday).to_date.to_time(:utc) + 6.hours
      user.settings['primary_goal'] = {
        'id' => 'asdf',
        'last_tracked' => ts.iso8601
      }
      user.save
      d = Device.create(:user => user)
      LogSession.create(log_type: 'note', user: user, author: user, device: d, score: 3, started_at: ts, goal_id: 7, data: {'note' => {'text' => 'asdf', 'timestamp' => ts.to_i}})
      LogSession.process_new({'events' => [
        {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'this', 'button_id' => 1}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i + 5},
        {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'that', 'button_id' => 2}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i + 10},
        {'type' => 'button', 'button' => {'spoken' => true, 'label' => 'then', 'button_id' => 3}, 'geo' => ['13', '12'], 'timestamp' => ts.to_i + 15}
      ]}, {:user => user, :author => user, :device => d, goal_id: 7})
      
      o = Organization.create
      u = OrganizationUnit.create(:organization => o)
      o.add_supervisor(@user.user_name, false)
      o.add_user(user.user_name, false, false)
      u.add_supervisor(@user.user_name)
      expect(u.reload.all_user_ids.length).to eq(1)
      get :stats, params: {:unit_id => u.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'weeks' => [], 'supervisor_weeks' => {}, 'user_weeks' => {}, 
        'user_counts' => {"goal_recently_logged"=>0, "goal_set"=>0, "modeled_word_counts"=>[], "recent_session_count"=>0, "recent_session_hours"=>0.0, "recent_session_seconds"=>0.0, "recent_session_user_count"=>0, "total_models"=>0, "total_seconds"=>0, "total_sessions"=>0, "total_user_weeks"=>0, "total_users"=>0, "total_words"=>0, "word_counts"=>[]}
      })
      
      get :stats, params: {:unit_id => u.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user_weeks'][user.global_id]).to eq(nil)
      expect(json['user_counts']).to eq({
        'goal_set' => 0,
        'goal_recently_logged' => 0, 
        'recent_session_count' => 0, 
        'recent_session_user_count' => 0, 
        'recent_session_seconds' => 0.0,
        "modeled_word_counts" => [],
        "total_models" => 0,
        "total_seconds" => 0,
        "total_sessions" => 0,
        "total_user_weeks" => 0,
        "total_words" => 0,
        "word_counts" => [],
        'recent_session_hours' => 0.0,
        'total_users' => 0
      })
      
      u.add_communicator(user.user_name)
      expect(u.reload.all_user_ids.length).to eq(2)
      get :stats, params: {:unit_id => u.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['user_weeks'][user.global_id]).to_not eq(nil)
      week_entries = json['user_weeks'][user.global_id]
      week_with_statuses = week_entries.values.find { |v| v['statuses'] && v['statuses'].any? }
      expect(week_with_statuses).to_not eq(nil), "expected at least one week with statuses in #{week_entries.inspect}"
      expect(week_with_statuses['statuses']).to include({"from_unit"=>false, "goal_id"=>"1_7", "score"=>3})
      expect(json['user_counts']).to eq({
        'goal_set' => 1,
        'goal_recently_logged' => 1,
        'recent_session_count' => 1, 
        'recent_session_user_count' => 1,
        "modeled_word_counts" => [],
        "total_models" => 0,
        "total_seconds" => 0,
        "total_sessions" => 0,
        "total_user_weeks" => 0,
        "total_words" => 0,
        "word_counts" => [],
        'recent_session_seconds' => 10.0,
        'recent_session_hours' => 0.0, 
        'total_users' => 1
      })
    end

    it "should include daily_use event counts for supervisors" do
      token_user
      user = User.create
      d = Device.create(:user => user)
      o = Organization.create
      u = OrganizationUnit.create(:organization => o)
      o.add_user(user.user_name, false, false)
      o.add_supervisor(@user.user_name, false)
      u.add_supervisor(@user.user_name)
      expect(u.reload.all_user_ids.length).to eq(1)
      get :stats, params: {:unit_id => u.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'weeks' => [], 'supervisor_weeks' => {}, 'user_weeks' => {}, 
        'user_counts' => {"goal_recently_logged"=>0, "goal_set"=>0, "modeled_word_counts"=>[], "recent_session_count"=>0, "recent_session_hours"=>0.0, "recent_session_seconds"=>0.0, "recent_session_user_count"=>0, "total_models"=>0, "total_seconds"=>0, "total_sessions"=>0, "total_user_weeks"=>0, "total_users"=>0, "total_words"=>0, "word_counts"=>[]}
      })

      # Use dates derived from week starts so both events fall in the same week. Relative dates
      # like 2.weeks.ago and 2.weeks.ago+1 can span a week boundary (e.g. Sun+Mon) and fail.
      week_a_start = 2.weeks.ago.to_date.beginning_of_week(:monday)
      week_b_start = 4.weeks.ago.to_date.beginning_of_week(:monday)
      LogSession.process_daily_use({
        'events' => [
          {'date' => week_a_start.iso8601, 'active' => true, 'activity_level' => 3, 'models' => 4},
          {'date' => (week_a_start + 1).iso8601, 'active' => true, 'activity_level' => 1, 'models' => 2, 'focus_words' => 1},
          {'date' => week_b_start.iso8601, 'active' => true, 'activity_level' => 5, 'goals' => 1},
        ]
      }, {author: @user, device: @user.devices[0]})

      get :stats, params: {:unit_id => u.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['weeks']).to eq([])
      expect(json['supervisor_weeks']).to_not eq({})
      expect(json['supervisor_weeks'][@user.global_id]).to_not eq(nil)
      a = week_a_start.to_time(:utc).to_i.to_s
      b = week_b_start.to_time(:utc).to_i.to_s
      expect(json['supervisor_weeks'][@user.global_id][a]).to eq({
        'actives' => 2, 'average_level' => 0.8, 'days' => 2, 'focus_words' => 1, 'models' => 6, 'total_levels' => 4
      })
      expect(json['supervisor_weeks'][@user.global_id][b]).to eq({
        'actives' => 1, 'average_level' => 1.0, 'days' => 1, 'goals' => 1, 'total_levels' => 5
      })
    end
  end

  describe "log_stats" do
    it "should require an access token" do
      get 'log_stats', params: {unit_id: 'asdf'}
      assert_missing_token
    end

    it "should require a valid unit" do
      token_user
      get 'log_stats', params: {unit_id: 'asdf'}
      assert_not_found('asdf')
    end

    it "should require view_stats permission" do
      token_user
      o = Organization.create
      ou = OrganizationUnit.create(organization: o)
      get 'log_stats', params: {unit_id: ou.global_id}
      assert_unauthorized
    end

    it "should include words set in any user goals" do
      token_user
      u = User.create
      o = Organization.create(settings: {'total_licenses' => 1})
      o.add_user(u.user_name, false, true)
      o.add_supervisor(@user.user_name, false)
      ou = OrganizationUnit.create(organization: o)
      ou.add_communicator(u.user_name)
      ou.add_supervisor(@user.user_name)

      g = UserGoal.process_new({
        summary: "Good Goal",
        assessment_badge: {'instance_count' => 10, 'watchlist' => true, 'words_list' => ['hat', 'cat', 'sat', 'fat', 'rat']},
        badges: [
          {'watchlist' => true, 'words_list' => ['hat', 'cat', 'sat', 'fat', 'rat'], 'watch_type_minimum' => 1, 'watch_type_count' => 2, 'interval' => 'date', 'consecutive_units' => 21},
        ],
        active: true
      }, {user: u, author: u})
      g.settings['started_at'] = Time.parse('June 1, 2016').utc.iso8601
      g.save

      get 'log_stats', params: {unit_id: ou.global_id}
      json = assert_success_json
      expect(json['goal_word_counts']).to eq([
        {'word' => 'cat', 'cnt' => 1},
        {'word' => 'fat', 'cnt' => 1},
        {'word' => 'hat', 'cnt' => 1},
        {'word' => 'rat', 'cnt' => 1},
        {'word' => 'sat', 'cnt' => 1},
      ])
    end

    it "should not include data from pending users" do
      token_user
      u = User.create
      o = Organization.create(settings: {'total_licenses' => 1})
      o.add_user(u.user_name, true, true)
      o.add_supervisor(@user.user_name, false)
      ou = OrganizationUnit.create(organization: o)
      ou.add_communicator(u.user_name)
      ou.add_supervisor(@user.user_name)

      g = UserGoal.process_new({
        summary: "Good Goal",
        assessment_badge: {'instance_count' => 10, 'watchlist' => true, 'words_list' => ['hat', 'cat', 'sat', 'fat', 'rat']},
        badges: [
          {'watchlist' => true, 'words_list' => ['hat', 'cat', 'sat', 'fat', 'rat'], 'watch_type_minimum' => 1, 'watch_type_count' => 2, 'interval' => 'date', 'consecutive_units' => 21},
        ],
        active: true
      }, {user: u, author: u})
      g.settings['started_at'] = Time.parse('June 1, 2016').utc.iso8601
      g.save

      get 'log_stats', params: {unit_id: ou.global_id}
      json = assert_success_json
      expect(json['goal_word_counts']).to eq([])
    end

    it "should include word counts and totals" do
      token_user
      u1 = User.create
      d1 = Device.create(user: u1)
      u2 = User.create
      d2 = Device.create(user: u2)
      o = Organization.create(settings: {'total_licenses' => 2})
      o.add_user(u1.user_name, false, true)
      o.add_user(u2.user_name, false, true)
      o.add_supervisor(@user.user_name, false)
      ou = OrganizationUnit.create(organization: o)
      expect(ou.add_communicator(u1.user_name)).to eq(true)
      expect(ou.add_communicator(u2.user_name)).to eq(true)
      ou.add_supervisor(@user.user_name)
      Worker.process_queues
      expect(ou.reload.all_user_ids).to include(u1.global_id, u2.global_id)

      # Create WeeklyStatsSummary records directly to avoid flakiness from
      # LogSession->update_for flow (async workers, extra_data loading, etc.)
      # Use same weekyear calculation as controller to avoid timezone edge cases
      cutoff = 8.weeks.ago
      weekyears = []
      weekdate = cutoff
      while weekdate <= Time.now
        weekyears << WeeklyStatsSummary.date_to_weekyear(weekdate)
        weekdate += 1.week
      end
      weekyear = weekyears.last
      [u1, u2].each { |u| WeeklyStatsSummary.find_or_create_by!(user_id: u.id, weekyear: weekyear) }
      s1 = WeeklyStatsSummary.find_by!(user_id: u1.id, weekyear: weekyear)
      s2 = WeeklyStatsSummary.find_by!(user_id: u2.id, weekyear: weekyear)
      s1.data = {'stats' => {
        'total_sessions' => 6,
        'total_session_seconds' => 30.0,
        'all_word_counts' => {'this' => 6, 'that' => 6, 'then' => 6},
        'modeled_word_counts' => {'this' => 1}
      }}
      s2.data = {'stats' => {
        'total_sessions' => 1,
        'total_session_seconds' => 5.0,
        'all_word_counts' => {'this' => 3, 'that' => 1, 'then' => 1, 'thread' => 1},
        'modeled_word_counts' => {'this' => 3}
      }}
      s1.save!
      s2.save!

      UserLink.invalidate_cache_for(ou)

      # Stub WeeklyStatsSummary.where so controller finds our summaries (controller specs
      # can have transaction/visibility issues with direct DB creation).
      our_summaries = [s1, s2].sort_by(&:id)
      allow(WeeklyStatsSummary).to receive(:where).and_return(our_summaries)

      get 'log_stats', params: {unit_id: ou.global_id}
      json = assert_success_json
      expect(json['goal_word_counts']).to eq([])
      expect(json['modeled_word_counts']).to eq([{"cnt" => 8, "word" => "this"}])
      expect(json['total_models']).to eq(4)
      expect(json['total_seconds']).to eq(35.0)
      expect(json['total_sessions']).to eq(7)
      expect(json['total_user_weeks']).to eq(2)
      expect(json['total_users']).to eq(2)
      expect(json['total_words']).to eq(24)
      expect(json['word_count']).to match_array([
        {"cnt" => 18, "word" => "this"},
        {"cnt" => 14, "word" => "that"},
        {"cnt" => 14, "word" => "then"}
      ])
    end
  end
   
  describe "logs" do
    it "should require api token" do
      get :logs, params: {:unit_id => '1_1234'}
      assert_missing_token
    end
    
    it "should return not found unless org exists" do
      token_user
      get :logs, params: {:unit_id => '1_1234'}
      assert_not_found("1_1234")
    end
    
    it "should return unauthorized unless permissions allowed" do
      token_user
      o = Organization.create
      u = OrganizationUnit.create(:organization => o)
      get :logs, params: {:unit_id => u.global_id}
      assert_unauthorized
    end
    
    it "should return a paginated list of logs if authorized" do
      o = Organization.create(:settings => {'total_licenses' => 100})
      unit = OrganizationUnit.create(:organization => o)
      token_user
      o.add_manager(@user.user_name, true)
      15.times do |i|
        u = User.create
        o.add_user(u.user_name, false)
        unit.add_communicator(u.user_name)
        d = Device.create(:user => u)
        LogSession.process_new({
          :events => [
            {'timestamp' => 4.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => '1_1'}}},
            {'timestamp' => 3.seconds.ago.to_i, 'type' => 'button', 'button' => {'label' => 'never mind', 'board' => {'id' => '1_1'}}}
          ]
        }, {:user => u, :device => d, :author => u})
      end
      
      get :logs, params: {:unit_id => unit.global_id}
      expect(response.successful?).to eq(true)
      json = JSON.parse(response.body)
      expect(json['meta']).not_to eq(nil)
      expect(json['log'].length).to eq(10)
      expect(json['meta']['next_url']).to eq("#{JsonApi::Json.current_host}/api/v1/units/#{unit.global_id}/logs?offset=#{JsonApi::Log::DEFAULT_PAGE}&per_page=#{JsonApi::Log::DEFAULT_PAGE}")
    end
  end

  describe "note" do
    it "should require a valid token" do
      post :note, params: {unit_id: 'asdf'}
      assert_missing_token
    end

    it "should require a valid unit" do
      token_user
      post :note, params: {unit_id: 'asdf'}
      assert_not_found('asdf')
    end

    it "should require authorization" do
      token_user
      o = Organization.create
      ou = OrganizationUnit.create(organization: o)
      o.add_supervisor(@user.user_name)
      post :note, params: {unit_id: ou.global_id}
      assert_unauthorized
    end

    it "should message specified users" do
      token_user
      o = Organization.create
      ou = OrganizationUnit.create(organization: o)
      o.add_supervisor(@user.user_name)
      ou.add_supervisor(@user.user_name)
      post :note, params: {unit_id: ou.global_id, note: "Haldo!"}
      json = assert_success_json
      expect(json['targets']).to eq(1)
      Worker.process_queues
      s = LogSession.last
      expect(s).to_not eq(nil)
      expect(s.log_type).to eq('note')
      expect(s.data['note']['text']).to eq('Haldo!')
    end

    it "should include video if valid" do
      token_user
      u1 = User.create
      u2 = User.create
      o = Organization.create(settings: {'total_licenses' => 5})
      ou = OrganizationUnit.create(organization: o)
      o.add_supervisor(@user.user_name)
      ou.add_supervisor(@user.user_name)
      o.add_user(u1.user_name, false, true)
      ou.add_communicator(u1.user_name)
      o.add_user(u2.user_name, false, true)
      ou.add_communicator(u2.user_name)
      post :note, params: {unit_id: ou.global_id, target: 'communicators', note: "Haldo!", video_id: '111'}
      json = assert_success_json
      expect(json['targets']).to eq(2)
      Worker.process_queues
      s = LogSession.last
      expect(s).to_not eq(nil)
      expect(s.log_type).to eq('note')
      expect(s.data['note']['text']).to eq('Haldo!')
      expect(s.data['note']['video']).to eq(nil)

      vid = UserVideo.create(:user => @user, :settings => {duration: 12})
      post :note, params: {unit_id: ou.global_id, target: 'supervisors', note: "Haldo!", video_id: vid.global_id}
      json = assert_success_json
      expect(json['targets']).to eq(1)
      Worker.process_queues
      s = LogSession.last
      expect(s).to_not eq(nil)
      expect(s.log_type).to eq('note')
      expect(s.data['note']['text']).to eq('Haldo!')
      expect(s.data['note']['video']).to eq({'id' => vid.global_id, 'duration' => 12})
    end

    it "should exclude unit supervisors if sending to just communicators" do
      token_user
      u1 = User.create
      u2 = User.create
      o = Organization.create(settings: {'total_licenses' => 5})
      ou = OrganizationUnit.create(organization: o)
      o.add_supervisor(@user.user_name)
      ou.add_supervisor(@user.user_name)
      o.add_user(u1.user_name, false, true)
      ou.add_communicator(u1.user_name)
      o.add_user(u2.user_name, false, true)
      ou.add_communicator(u2.user_name)
      post :note, params: {unit_id: ou.global_id, target: 'communicators', note: "Haldo!"}
      json = assert_success_json
      expect(json['targets']).to eq(2)
      Worker.process_queues
      s = LogSession.last
      expect(s).to_not eq(nil)
      expect(s.log_type).to eq('note')
      expect(s.data['note']['text']).to eq('Haldo!')
      expect(s.data['notify_exclude_ids']).to eq([@user.global_id])
    end

    it "should include footer in email if specified" do
      token_user
      u1 = User.create
      u2 = User.create
      o = Organization.create(settings: {'total_licenses' => 5})
      ou = OrganizationUnit.create(organization: o)
      o.add_supervisor(@user.user_name)
      ou.add_supervisor(@user.user_name)
      o.add_user(u1.user_name, false, true)
      ou.add_communicator(u1.user_name)
      o.add_user(u2.user_name, false, true)
      ou.add_communicator(u2.user_name)
      post :note, params: {unit_id: ou.global_id, note: "Haldo!", include_footer: true}
      json = assert_success_json
      expect(json['targets']).to eq(3)
      Worker.process_queues
      s = LogSession.last
      expect(s).to_not eq(nil)
      expect(s.log_type).to eq('note')
      expect(s.data['note']['text']).to eq('Haldo!')
      expect(s.data['include_status_footer']).to eq(true)
    end
  end
end
