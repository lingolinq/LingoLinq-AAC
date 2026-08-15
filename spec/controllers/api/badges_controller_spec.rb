require 'spec_helper'

describe Api::BadgesController, :type => :controller do
  describe "index" do
    it "should require an api token" do
      get 'index'
      assert_missing_token
    end
    
    it "should require an existing user" do
      token_user
      get 'index', params: {:user_id => 'asdf'}
      assert_not_found('asdf')
    end

    it "should require authorization" do
      token_user
      u = User.create
      get 'index', params: {:user_id => u.global_id}
      assert_unauthorized
    end
    
    it "should limit to highlighted results without supervisor authorization" do
      token_user
      u = User.create(:settings => {'public' => true})
      b = UserBadge.create(:user => u, :highlighted => true)
      b2 = UserBadge.create(:user => u)
      get 'index', params: {:user_id => u.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['badge'].length).to eq(1)
      expect(json['badge'][0]['id']).to eq(b.global_id)
    end
    
    it "should filter by goal if set" do
      token_user
      g = UserGoal.create(:user => @user)
      b = UserBadge.create(:user => @user, :user_goal => g)
      get 'index', params: {:user_id => @user.global_id, :goal_id => g.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['badge'].length).to eq(1)
      expect(json['badge'][0]['id']).to eq(b.global_id)
    end

    it "should let a read-only supervisor list badges for a supervisee goal by goal_id" do
      sup = User.create
      comm = User.create
      User.link_supervisor_to_user(sup, comm, nil, false)
      g = UserGoal.create(:user => comm)
      b = UserBadge.create(:user => comm, :user_goal => g)
      dev = Device.create(:user => sup, :developer_key_id => 1, :device_key => 'badge_goal_read')
      request.headers['Authorization'] = "Bearer #{dev.tokens[0]}"
      request.headers['Check-Token'] = 'true'
      get 'index', params: {:user_id => comm.global_id, :goal_id => g.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['badge'].length).to eq(1)
      expect(json['badge'][0]['id']).to eq(b.global_id)
    end
    
    it "should require a valid goal" do
      token_user
      get 'index', params: {:user_id => @user.global_id, :goal_id => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require goal visibility when filtering by goal_id" do
      token_user
      u = User.create
      g = UserGoal.create(:user => u)
      get 'index', params: {:user_id => @user.global_id, :goal_id => g.global_id}
      assert_unauthorized
    end

    it "should not allow public profile visibility alone to list goal badges by goal_id" do
      token_user
      u = User.create(:settings => {'public' => true})
      g = UserGoal.create(:user => u)
      UserBadge.create(:user => u, :user_goal => g, :highlighted => true)
      get 'index', params: {:user_id => u.global_id, :goal_id => g.global_id}
      assert_unauthorized
    end
    
    it "should return a paginated result" do
      token_user
      50.times do |i|
        b = UserBadge.create(:user => @user)
      end
      get 'index', params: {:user_id => @user.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['badge'].length).to eq(10)
      expect(json['meta']['more']).to eq(true)
    end
    
    it "should filter by superseded if not filtering by goal" do
      token_user
      b = UserBadge.create(:user => @user)
      b2 = UserBadge.create(:user => @user, :superseded => true)
      get 'index', params: {:user_id => @user.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['badge'].length).to eq(1)
      expect(json['badge'][0]['id']).to eq(b.global_id)
    end
    
    it "should filter by earned if specified" do
      token_user
      b = UserBadge.create(:user => @user)
      b2 = UserBadge.create(:user => @user, :earned => true)
      get 'index', params: {:user_id => @user.global_id, earned: true}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['badge'].length).to eq(1)
      expect(json['badge'][0]['id']).to eq(b2.global_id)
    end
    
    it "should filter to recently-earned (including supervisees) if specified" do
      token_user
      b = UserBadge.create(:user => @user)
      b2 = UserBadge.create(:user => @user, :earned => true)
      b3 = UserBadge.create(:user => @user, :earned => true)
      b3.data['earn_recorded'] = 6.months.ago.iso8601
      b3.save
      b4 = UserBadge.create(:user => @user, :superseded => true)
      UserBadge.where(id: b3.id).update_all(updated_at: 6.months.ago)
      get 'index', params: {:user_id => @user.global_id, recent: true}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['badge'].length).to eq(2)
      expect(json['badge'].map{|b| b['id']}.sort).to eq([b.global_id, b2.global_id])
    end

    it "should not include badges for supervisees the caller cannot view in detail" do
      token_user
      normal = User.create
      modeling = User.create
      User.link_supervisor_to_user(@user, normal, nil, 'edit')
      User.link_supervisor_to_user(@user, modeling, nil, 'modeling_only')

      # Precondition, asserted so a future permissions change cannot make the
      # expectation below pass vacuously: a modeling-only link is denied
      # 'view_detailed', an ordinary supervisor link is not.
      expect(normal.reload.allows?(@user.reload, 'view_detailed')).to eq(true)
      expect(modeling.reload.allows?(@user.reload, 'view_detailed')).to eq(false)

      mine = UserBadge.create(:user => @user)
      visible = UserBadge.create(:user => normal)
      UserBadge.create(:user => modeling)

      get 'index', params: {:user_id => @user.global_id, recent: true}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      # The modeling-only supervisee's badge must not appear: this branch returns
      # the supporter AND every supervisee in one payload, so it has to apply the
      # same per-communicator gate the non-recent branch gets for free.
      expect(json['badge'].map{|b| b['id']}.sort).to eq([mine.global_id, visible.global_id].sort)
    end

    it "should not include a modeling-only supervisee's badges even when that account is public" do
      token_user
      pub = User.create
      pub.settings['public'] = true
      pub.save
      User.link_supervisor_to_user(@user, pub, nil, 'modeling_only')

      # This is the case `view_detailed` alone could not catch: a public account
      # grants it to EVERYONE (user.rb:58), so the modeling-only link still passed.
      expect(pub.reload.allows?(@user.reload, 'view_detailed')).to eq(true)
      expect(@user.modeling_only_for?(pub)).to eq(true)

      mine = UserBadge.create(:user => @user)
      UserBadge.create(:user => pub)

      get 'index', params: {:user_id => @user.global_id, recent: true}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['badge'].map{|b| b['id']}).to eq([mine.global_id])
    end

    it "should not return a public communicator's badges to a modeling-only link on the per-user branch" do
      token_user
      pub = User.create
      pub.settings['public'] = true
      pub.save
      User.link_supervisor_to_user(@user, pub, nil, 'modeling_only')
      UserBadge.create(:user => pub)

      get 'index', params: {:user_id => pub.reload.global_id}
      expect(response).to_not be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq("Not authorized")
      expect(json['modeling_only']).to eq(true)
    end

    it "should still return the caller's OWN badges when their account is modeling-only" do
      token_user
      supervisee = User.create
      User.link_supervisor_to_user(@user, supervisee, nil, 'edit')
      @user.expires_at = 2.days.ago
      @user.save
      expect(@user.reload.modeling_only?).to eq(true)

      mine = UserBadge.create(:user => @user)
      UserBadge.create(:user => supervisee)

      get 'index', params: {:user_id => @user.global_id, recent: true}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      # Two guarantees at once: self stays exempt (or a modeling-only supporter
      # loses their own badges), and a globally modeling-only account is
      # modeling-only for EVERYONE (supervising.rb:122), so the supervisee drops.
      expect(json['badge'].map{|b| b['id']}).to eq([mine.global_id])
    end
  end
  
  describe "show" do
    it "should require an api token" do
      get 'show', params: {:id => 'asdf'}
      assert_missing_token
    end
    
    it "should require a valid record" do
      token_user
      get 'show', params: {:id => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require authorization" do
      token_user
      u = User.create
      b = UserBadge.create(:user => u)
      get 'show', params: {:id => b.global_id}
      assert_unauthorized
    end
    
    it "should return a record" do
      token_user
      b = UserBadge.create(:user => @user)
      get 'show', params: {:id => b.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['badge']).to_not eq(nil)
      expect(json['badge']['id']).to eq(b.global_id)
    end
  end

  describe "update" do
    it "should require an api token" do
      put 'update', params: {:id => 'asdf'}
      assert_missing_token
    end
    
    it "should require a valid record" do
      token_user
      put 'update', params: {:id => 'asdf'}
      assert_not_found('asdf')
    end
    
    it "should require authorization" do
      token_user
      u = User.create
      b = UserBadge.create(:user => u)
      put 'update', params: {:id => b.global_id, :badge => {'highlighted' => true}}
      assert_unauthorized
    end
    
    it "should update the record" do
      token_user
      b = UserBadge.create(:user => @user)
      put 'update', params: {:id => b.global_id, :badge => {'highlighted' => true}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['badge']['id']).to eq(b.global_id)
      expect(json['badge']['highlighted']).to eq(true)
      expect(b.reload.highlighted).to eq(true)
    end

    it "should allow a read-only supervisor with set_goals to update a supervisee badge" do
      sup = User.create
      comm = User.create
      User.link_supervisor_to_user(sup, comm, nil, false)
      g = UserGoal.create(:user => comm)
      b = UserBadge.create(:user => comm, :user_goal => g)
      dev = Device.create(:user => sup, :developer_key_id => 1, :device_key => 'badge_put_sup')
      request.headers['Authorization'] = "Bearer #{dev.tokens[0]}"
      request.headers['Check-Token'] = 'true'
      put 'update', params: {:id => b.global_id, :badge => {'highlighted' => true}}
      expect(response).to be_successful
      expect(b.reload.highlighted).to eq(true)
    end
  end
end
