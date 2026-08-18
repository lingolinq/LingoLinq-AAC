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
      # Sort BOTH sides. global_ids are strings, so once the UserBadge sequence
      # crosses a digit boundary the lexicographic order of two consecutively
      # created badges inverts ("1_1000" < "1_999") and the sorted actual stops
      # matching a literal written in creation order. Latent since this example was
      # written; it only fires on a test database whose sequence happens to straddle
      # the boundary.
      expect(json['badge'].map{|b| b['id']}.sort).to eq([b.global_id, b2.global_id].sort)
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

    it "should not leak a public account's supervisees' badges to a stranger via recent" do
      token_user
      pub = User.create(:settings => {'public' => true})
      # NOT public, and with no relationship whatsoever to the caller.
      child = User.create
      User.link_supervisor_to_user(pub, child, nil, 'edit')

      childs = UserBadge.create(:user => child, :earned => true)
      pubs = UserBadge.create(:user => pub, :earned => true, :highlighted => true)

      # The caller is a total stranger to both accounts. `view_detailed` still
      # passes on `pub` (user.rb:58 grants it to ['*'] for a public account), so
      # the request reaches the recent branch.
      expect(pub.reload.allows?(@user.reload, 'view_detailed')).to eq(true)
      expect(@user.modeling_only_for?(child)).to eq(false)

      get 'index', params: {:user_id => pub.global_id, recent: true}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      # Previously the exclusion filter negated to "visible" for a stranger and
      # the supervisee was folded into user_ids, handing back a non-public
      # child's goal progress.
      expect(json['badge'].map{|b| b['id']}).to_not include(childs.global_id)
      expect(json['badge'].map{|b| b['id']}).to eq([pubs.global_id])
    end

    it "should apply the highlighted downgrade on the recent branch too" do
      token_user
      pub = User.create(:settings => {'public' => true})
      shown = UserBadge.create(:user => pub, :earned => true, :highlighted => true)
      hidden = UserBadge.create(:user => pub, :earned => true)

      expect(pub.reload.allows?(@user.reload, 'supervise')).to eq(false)

      get 'index', params: {:user_id => pub.global_id, recent: true}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      # The else-branch already limited an unauthorized caller to the public
      # showcase; this branch dropped the forced `highlighted` filter on the
      # floor and returned un-highlighted badges as well.
      expect(json['badge'].map{|b| b['id']}).to eq([shown.global_id])
    end

    # Both org specs below put the caller in a SUPERVISORY relationship with the
    # queried account (`holder`), so `user.allows?(@api_user,'supervise')` is true
    # and the `highlighted` downgrade is NOT forced. That matters: if the caller
    # were a stranger to `holder`, the downgrade alone would hide an unhighlighted
    # badge and the negative spec would pass without ever exercising the
    # cross-account authorization check it claims to test.
    it "should not leak a supervisee's badges across an organization boundary" do
      token_user
      holder = User.create
      User.link_supervisor_to_user(@user, holder, nil, 'edit')

      other_org = Organization.create(:settings => {'total_licenses' => 1})
      comm = User.create
      other_org.add_user(comm.user_name, true, false)
      User.link_supervisor_to_user(holder, comm.reload, nil, 'edit')

      my_org = Organization.create(:settings => {'total_licenses' => 1})
      my_org.add_manager(@user.user_name, true)

      comm.reload
      @user.reload
      # Preconditions, asserted so this cannot pass vacuously: the downgrade is
      # NOT in play, and the caller holds no permission on this communicator.
      expect(holder.reload.allows?(@user, 'supervise')).to eq(true)
      expect(Organization.manager_for?(@user, comm, true)).to eq(false)
      expect(comm.allows?(@user, 'set_goals')).to eq(false)

      leaked = UserBadge.create(:user => comm, :earned => true)

      get 'index', params: {:user_id => holder.global_id, recent: true}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      # Managing SOME org does not authorize reading a communicator in another.
      expect(json['badge'].map{|b| b['id']}).to_not include(leaked.global_id)
    end

    it "should return a supervisee's badges to a manager of that supervisee's own org" do
      token_user
      holder = User.create
      User.link_supervisor_to_user(@user, holder, nil, 'edit')

      org = Organization.create(:settings => {'total_licenses' => 2})
      comm = User.create
      org.add_user(comm.user_name, false, false)
      org.add_manager(@user.user_name, true)
      comm.reload
      @user.reload
      User.link_supervisor_to_user(holder, comm, nil, 'edit')

      # The other half of the boundary: a manager OF this communicator's own org
      # holds set_goals (user.rb:85) and must not be denied by the new check.
      expect(Organization.manager_for?(@user, comm, true)).to eq(true)
      expect(comm.reload.allows?(@user, 'set_goals')).to eq(true)

      visible = UserBadge.create(:user => comm, :earned => true)

      get 'index', params: {:user_id => holder.reload.global_id, recent: true}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['badge'].map{|b| b['id']}).to include(visible.global_id)
    end

    it "should still return every supervisee's badges to a legitimate supervisor via recent" do
      token_user
      a = User.create
      b = User.create
      User.link_supervisor_to_user(@user, a, nil, 'edit')
      User.link_supervisor_to_user(@user, b, nil, false)

      mine = UserBadge.create(:user => @user)
      abadge = UserBadge.create(:user => a, :earned => true)
      bbadge = UserBadge.create(:user => b, :earned => true)

      # Guards the fix against over-tightening: a read-only ('false' link) and an
      # edit-level supervisor both hold set_goals, so neither may be dropped.
      expect(a.reload.allows?(@user.reload, 'set_goals')).to eq(true)
      expect(b.reload.allows?(@user.reload, 'set_goals')).to eq(true)

      get 'index', params: {:user_id => @user.global_id, recent: true}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['badge'].map{|b| b['id']}.sort).to eq([mine.global_id, abadge.global_id, bbadge.global_id].sort)
    end
  end
  
  describe "show" do
    it "should not return an unhighlighted badge of a public account to a stranger" do
      token_user
      pub = User.create(:settings => {'public' => true})
      hidden = UserBadge.create(:user => pub, :earned => true)
      shown = UserBadge.create(:user => pub, :earned => true, :highlighted => true)

      # Pins the boundary a review flagged as a possible bypass of the recent-branch
      # fix. It is not one: UserBadge#view (user_badge.rb:19-21) grants a stranger
      # `view` ONLY for a highlighted badge on a public account, so `allowed?` denies
      # the unhighlighted record before require_progress_visible! is ever consulted.
      expect(hidden.reload.allows?(@user.reload, 'view')).to eq(false)
      expect(shown.reload.allows?(@user.reload, 'view')).to eq(true)

      get 'show', params: {:id => hidden.global_id}
      expect(response).to_not be_successful

      # The public showcase half still works, so the denial above is a real gate
      # and not the endpoint being broken for everyone.
      get 'show', params: {:id => shown.global_id}
      expect(response).to be_successful
    end

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

  # See the matching blocks in goals_controller_spec.rb / images_controller_spec.rb.
  # UserBadge#process_params:152-153 reads both flags through `!!params[...]` with
  # no string coercion, so the form-encoded string "false" becomes TRUE. Every
  # other spec in this file only ever sets these to true, so nothing here noticed.
  describe "update with a raw JSON body" do
    it "should let highlighted be turned OFF" do
      token_user
      b = UserBadge.create(:user => @user, :highlighted => true)
      request.headers['Content-Type'] = 'application/json'
      put :update, params: {:id => b.global_id}, body: {
        :badge => {:highlighted => false}
      }.to_json
      expect(response).to be_successful
      expect(b.reload.highlighted).to eq(false)
      expect(b.highlighted).to be_a(FalseClass)
    end

    it "should let disabled be turned OFF" do
      token_user
      b = UserBadge.create(:user => @user, :disabled => true)
      request.headers['Content-Type'] = 'application/json'
      put :update, params: {:id => b.global_id}, body: {
        :badge => {:disabled => false}
      }.to_json
      expect(response).to be_successful
      expect(b.reload.disabled).to eq(false)
    end

    it "should not clobber highlighted when the client omits it" do
      # Unset attributes serialize to null and the `!= nil` guard skips them.
      # Under the form-encoded shape they arrived as "", passed the guard, and
      # forced the flag TRUE on every save.
      token_user
      b = UserBadge.create(:user => @user, :highlighted => false)
      request.headers['Content-Type'] = 'application/json'
      put :update, params: {:id => b.global_id}, body: {
        :badge => {:highlighted => nil, :disabled => nil}
      }.to_json
      expect(response).to be_successful
      expect(b.reload.highlighted).to eq(false)
    end
  end
end
