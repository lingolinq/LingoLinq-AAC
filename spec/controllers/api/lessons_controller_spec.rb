require 'spec_helper'

describe Api::LessonsController, :type => :controller do
  describe "index" do
    it "should return a result" do
      get 'index'
      json = assert_success_json
      expect(json['lesson']).to eq([])
    end

    it "should require user supervision for user_id param" do
      u = User.create
      get 'index', params: {user_id: u.global_id}
      assert_unauthorized
    end

    it "should return only public results by default" do
      l1 = Lesson.create(public: true)
      l2 = Lesson.create
      token_user
      get 'index', params: {user_id: @user.global_id}
      json = assert_success_json
      expect(json['lesson'].length).to eq(1)
      expect(json['lesson'][0]['id']).to eq(l1.global_id)
    end

    it "should update lesson completion based on the user provided" do
      l1 = Lesson.create(public: true)
      l2 = Lesson.create
      token_user
      ue = UserExtra.create(user: @user)
      ue.settings['completed_lessons'] = [
        {'id' => 'asdf'},
        {'id' => l1.global_id, 'ts' => 5.minutes.ago.to_i, 'rating' => 3}
      ]
      ue.save

      get 'index', params: {user_id: @user.global_id}
      json = assert_success_json
      expect(json['lesson'].length).to eq(1)
      expect(json['lesson'][0]['id']).to eq(l1.global_id)
      expect(json['lesson'][0]['completed']).to eq(true)
      expect(json['lesson'][0]['rating']).to eq(3)
    end

    it "should check for matching lessons in the user's extras" do
      l1 = Lesson.create(public: true, settings: {'url' => 'http://www.example.com/lesson1', 'past_cutoff' => 6.months.to_i})
      l2 = Lesson.create
      token_user
      ue = UserExtra.create(user: @user)
      ue.settings['completed_lessons'] = [
        {'id' => 'asdf', 'url' => 'http://www.example.com/lesson1', 'ts' => 5.minutes.ago.to_i, 'rating' => 2}
      ]
      ue.save

      get 'index', params: {user_id: @user.global_id, history_check: true}
      json = assert_success_json
      expect(json['lesson'].length).to eq(1)
      expect(json['lesson'][0]['id']).to eq(l1.global_id)
      expect(json['lesson'][0]['completed']).to eq(true)
      expect(json['lesson'][0]['rating']).to eq(nil)
    end

    it "should not accept old lessons for completion" do
      l1 = Lesson.create(public: true, settings: {'url' => 'http://www.example.com/lesson1', 'past_cutoff' => 6.months.to_i})
      l2 = Lesson.create
      token_user
      ue = UserExtra.create(user: @user)
      ue.settings['completed_lessons'] = [
        {'id' => 'asdf', 'url' => 'http://www.example.com/lesson1', 'ts' => 12.months.ago.to_i, 'rating' => 2}
      ]
      ue.save

      get 'index', params: {user_id: @user.global_id, history_check: true}
      json = assert_success_json
      expect(json['lesson'].length).to eq(1)
      expect(json['lesson'][0]['id']).to eq(l1.global_id)
      expect(json['lesson'][0]['completed']).to eq(nil)
      expect(json['lesson'][0]['rating']).to eq(nil)
    end

    it "should require a valid org if specified" do
      get 'index', params: {organization_id: 'asdf'}
      assert_not_found('asdf')
    end

    it "should require org edit permission if specified" do
      token_user
      o = Organization.create
      get 'index', params: {organization_id: o.global_id}
      assert_unauthorized

      o.add_manager(@user.user_name, false)
      @user.reload
    end

    it "should filter to org lessons if specified" do
      token_user
      o = Organization.create
      l1 = Lesson.create
      l2 = Lesson.create(public: true)
      Lesson.assign(l1, o, ['manager'], @user)
      o.add_manager(@user.user_name, false)
      get 'index', params: {organization_id: o.global_id, user_id: @user.global_id}
      json = assert_success_json
      expect(json['lesson'].length).to eq(1)
      expect(json['lesson'][0]['id']).to eq(l1.global_id)
    end

    it "should require a valid org unit if specified" do
      get 'index', params: {organization_unit_id: 'asdf'}
      assert_not_found('asdf')
    end

    it "should require edit permission on unit if specified" do
      o = Organization.create
      ou = OrganizationUnit.create(organization: o)
      get 'index', params: {organization_unit_id: ou.global_id}
      assert_unauthorized
    end

    it "should filter to unit lesson if specified" do
      token_user
      o = Organization.create
      ou = OrganizationUnit.create(organization: o)
      o.add_supervisor(@user.user_name, false, false)
      @user.reload
      ou.add_supervisor(@user.user_name, true)

      l1 = Lesson.create
      l2 = Lesson.create(public: true)
      Lesson.assign(l1, ou, ['supervisor'], @user)

      get 'index', params: {organization_unit_id: ou.global_id}
      json = assert_success_json
      expect(json['lesson'].length).to eq(1)
      expect(json['lesson'][0]['id']).to eq(l1.global_id)
    end
  end

  describe "create" do
    it "should require an api token" do
      post 'create', params: {'lesson' => {}}
      assert_missing_token
    end

    it "should require a valid target" do
      token_user
      post 'create', params: {'lesson' => {'a' => 1}}
      assert_unauthorized
    end

    it "should require a valid org if specified" do
      token_user
      post 'create', params: {'lesson' => {'organization_id' => 'asdf'}}
      assert_not_found('asdf')
    end

    it "should require org edit permission if specified" do
      token_user
      o = Organization.create
      post 'create', params: {'lesson' => {'organization_id' => o.global_id}}
      assert_unauthorized
    end

    it "should assign to the specified org" do
      token_user
      o = Organization.create
      o.add_manager(@user.user_name)
      post 'create', params: {'lesson' => {'title' => 'good one', 'organization_id' => o.global_id}}
      json = assert_success_json
      expect(json['lesson']).to_not eq(nil)
      expect(json['lesson']['title']).to eq('good one')
      id = json['lesson']['id']
      expect(o.reload.settings['lessons']).to_not eq(nil)
      expect(o.settings['lessons'][0]['id']).to eq(id)
    end

    it "should require a valid org unit if specified" do
      token_user
      post 'create', params: {'lesson' => {'organization_unit_id' => 'asdf'}}
      assert_not_found('asdf')
    end

    it "should require unit edit permission if specified" do
      token_user
      o = Organization.create
      ou = OrganizationUnit.create(organization_id: o.id)
      o.add_supervisor(@user.user_name, false, false)
      ou.add_supervisor(@user.reload.user_name, false)
      post 'create', params: {'lesson' => {'organization_unit_id' => ou.global_id}}
      assert_unauthorized
    end

     it "should assign to the specified unit" do
      token_user
      o = Organization.create
      ou = OrganizationUnit.create(organization_id: o.id)
      o.add_supervisor(@user.user_name, false, false)
      ou.add_supervisor(@user.reload.user_name, true)
      post 'create', params: {'lesson' => {'title' => 'cheddar', 'description' => 'bacon', 'past_cutoff' => '12345', 'organization_unit_id' => ou.global_id}}
      json = assert_success_json
      expect(json['lesson']).to_not eq(nil)
      expect(json['lesson']['title']).to eq('cheddar')
      expect(json['lesson']['description']).to eq('bacon')
      expect(json['lesson']['past_cutoff']).to eq(12345)
      id = json['lesson']['id']
      expect(ou.reload.settings['lesson']).to_not eq(nil)
      expect(ou.settings['lesson']['id']).to eq(id)
     end

     it "should require a valid user if specified" do
      token_user
      post 'create', params: {'lesson' => {'user_id' => 'asdf'}}
      assert_not_found('asdf')
     end

     it "should require supervise permission for specified user" do
      token_user
      u = User.create
      post 'create', params: {'lesson' => {'user_id' => u.global_id}}
      assert_unauthorized
     end

     it "should assign to the specified user" do
      token_user
      post 'create', params: {'lesson' => {'title' => 'cheddar', 'description' => 'bacon', 'past_cutoff' => '12345', 'user_id' => @user.global_id}}
      json = assert_success_json
      expect(json['lesson']).to_not eq(nil)
      expect(json['lesson']['title']).to eq('cheddar')
      expect(json['lesson']['description']).to eq('bacon')
      expect(json['lesson']['past_cutoff']).to eq(12345)
      id = json['lesson']['id']

      ue = UserExtra.find_by(user: @user)
      expect(ue.reload.settings['lessons']).to_not eq(nil)
      expect(ue.settings['lessons'][0]['id']).to eq(id)
     end
  end

  describe "show" do
    it "should require a valid lesson" do
      get 'show', params: {'id' => 'asdf'}
      assert_not_found('asdf')
    end

    it "should require view permission" do
      token_user
      l = Lesson.create
      get 'show', params: {'id' => l.global_id}
      assert_unauthorized
    end

    it "should not require view permission if nonce is known" do
      token_user
      l = Lesson.create
      get 'show', params: {'id' => "#{l.global_id}:#{l.nonce}:whatever"}
      json = assert_success_json
      expect(json['lesson']['id']).to eq(l.global_id)
    end

    it "should return a valid record" do
      token_user
      l = Lesson.create(user_id: @user.id)
      get 'show', params: {'id' => l.global_id}
      json = assert_success_json
      expect(json['lesson']['id']).to eq(l.global_id)
    end
  end

  describe "complete" do
    it "should require a fully-formed lesson_id" do
      post 'complete', params: {'lesson_id' => "asdf"}
      assert_not_found('asdf')
      l = Lesson.create
      post 'complete', params: {'lesson_id' => "#{l.global_id}:asdf:whatever"}
      assert_unauthorized
      post 'complete', params: {'lesson_id' => "#{l.global_id}:#{l.nonce}:whatever"}
      assert_not_found('whatever')
    end

    it "should mark as complete for the specified user (legacy permanent-token link still works)" do
      u = User.create
      l = Lesson.create
      id = "#{l.global_id}:#{l.nonce}:#{u.user_token}"
      post 'complete', params: {'lesson_id' => id}
      json = assert_success_json
      # The response now echoes a fresh EXPIRING lesson_share_token, not the permanent user_token
      # that was submitted (LL-90045bb29c option (b)): old permanent-token links self-upgrade.
      expect(json['lesson']['id']).to start_with("#{l.global_id}:#{l.nonce}:")
      returned_token = json['lesson']['id'].split(':')[2]
      expect(User.find_by_lesson_share_token(returned_token)).to eq(u)
      ue = UserExtra.find_by(user: u)
      expect(ue.settings['completed_lessons']).to_not eq(nil)
      expect(ue.settings['completed_lessons'][0]['id']).to eq(l.global_id)
      expect(l.reload.settings['completions']).to_not eq(nil)
      expect(l.settings['completions'][0]['user_id']).to eq(u.global_id)
    end

    it "should mark as complete when the new expiring lesson_share_token is used (LL-90045bb29c option (b))" do
      u = User.create
      l = Lesson.create
      id = "#{l.global_id}:#{l.nonce}:#{u.lesson_share_token}"
      post 'complete', params: {'lesson_id' => id}
      assert_success_json
      expect(l.reload.settings['completions']).to_not eq(nil)
      expect(l.settings['completions'][0]['user_id']).to eq(u.global_id)
    end
  end

  describe "assign" do
    it "should require an api token" do
      post 'assign', params: {'lesson_id' => 'asdf'}
      assert_missing_token
    end

    it "should require a valid lesson" do
      token_user
      post 'assign', params: {'lesson_id' => 'asdf'}
      assert_not_found('asdf')
    end

    it "should require permission on the lesson" do
      token_user
      l = Lesson.create
      post 'assign', params: {'lesson_id' => l.global_id}
      assert_unauthorized
    end

    it "should require a valid target" do
      token_user
      l = Lesson.create(user_id: @user.id)
      post 'assign', params: {'lesson_id' => l.global_id}
      assert_error('no target specified', 400)
    end

    it "should require a valid user if specified" do
      token_user
      l = Lesson.create(user_id: @user.id)
      post 'assign', params: {'user_id' => 'asdf', 'lesson_id' => l.global_id}
      assert_not_found('asdf')
    end

    it "should require supervise permission on specified user" do
      token_user
      u = User.create
      l = Lesson.create(user_id: @user.id)
      post 'assign', params: {'user_id' => u.global_id, 'lesson_id' => l.global_id}
      assert_unauthorized
    end

    it "should assign to the specified user" do
      token_user
      l = Lesson.create(user_id: @user.id)
      post 'assign', params: {'user_id' => @user.global_id, 'lesson_id' => l.global_id}
      json = assert_success_json
      expect(json['lesson']['id']).to eq(l.global_id)

      ue = UserExtra.find_by(user: @user)
      expect(ue.settings['lessons']).to_not eq(nil)
      expect(ue.settings['lessons'][0]['id']).to eq(l.global_id)
    end

    it "should require a valid org if specified" do
      token_user
      l = Lesson.create(user_id: @user.id)
      post 'assign', params: {'organization_id' => 'asdf', 'lesson_id' => l.global_id}
      assert_not_found('asdf')
    end

    it "should require edit permission on the org" do
      token_user
      o = Organization.create
      o.add_supervisor(@user.user_name, false, false)
      l = Lesson.create(user_id: @user.id)
      post 'assign', params: {'organization_id' => o.global_id, 'lesson_id' => l.global_id}
      assert_unauthorized
    end
    
    it "should assign to the specified org" do
      token_user
      o = Organization.create
      o.add_manager(@user.user_name)
      l = Lesson.create(user_id: @user.id)
      post 'assign', params: {'organization_id' => o.global_id, 'lesson_id' => l.global_id}
      json = assert_success_json
      expect(json['lesson']['id']).to eq(l.global_id)
      o.reload
      expect(o.settings['lessons']).to_not eq(nil)
      expect(o.settings['lessons'][0]['id']).to eq(l.global_id)
    end

    it "should require a valid unit if specified" do
      token_user
      l = Lesson.create(user_id: @user.id)
      post 'assign', params: {'organization_unit_id' => 'asdf', 'lesson_id' => l.global_id}
      assert_not_found('asdf')
    end

    it "should require edit permission on the specified unit" do
      token_user
      o = Organization.create
      ou = OrganizationUnit.create(organization: o)
      o.add_supervisor(@user.user_name, false, false)
      l = Lesson.create(user_id: @user.id)
      post 'assign', params: {'organization_unit_id' => ou.global_id, 'lesson_id' => l.global_id}
      assert_unauthorized
    end

    it "should assign to the specified unit" do
      token_user
      o = Organization.create
      ou = OrganizationUnit.create(organization: o)
      o.add_supervisor(@user.user_name, false, false)
      ou.add_supervisor(@user.user_name, true)
      l = Lesson.create(user_id: @user.id)
      post 'assign', params: {'organization_unit_id' => ou.global_id, 'lesson_id' => l.global_id}
      json = assert_success_json
      expect(json['lesson']['id']).to eq(l.global_id)
      ou.reload
      expect(ou.settings['lesson']).to_not eq(nil)
      expect(ou.settings['lesson']['id']).to eq(l.global_id)
    end
  end

  describe "unassign" do
    it "should require an api token" do
      post 'unassign', params: {'lesson_id' => 'asdf'}
      assert_missing_token
    end

    it "should require a valid lesson" do
      token_user
      post 'unassign', params: {'lesson_id' => 'asdf'}
      assert_not_found('asdf')
    end

    it "should require permission on the lesson" do
      token_user
      l = Lesson.create
      post 'unassign', params: {'lesson_id' => l.global_id}
      assert_unauthorized
    end

    it "should require a valid target" do
      token_user
      l = Lesson.create(user_id: @user.id)
      post 'unassign', params: {'lesson_id' => l.global_id}
      assert_error('no target specified', 400)
    end

    it "should require a valid user if specified" do
      token_user
      l = Lesson.create(user_id: @user.id)
      post 'unassign', params: {'user_id' => 'asdf', 'lesson_id' => l.global_id}
      assert_not_found('asdf')
    end

    it "should require supervise permission on specified user" do
      token_user
      u = User.create
      l = Lesson.create(user_id: @user.id)
      post 'unassign', params: {'user_id' => u.global_id, 'lesson_id' => l.global_id}
      assert_unauthorized
    end

    it "should unassign from the specified user" do
      token_user
      l = Lesson.create(user_id: @user.id)
      ue = UserExtra.create(user: @user)
      ue.settings['lessons'] = [{'id' => 'ha'}, {'id' => l.global_id}, {'id' => 'whatever'}]
      ue.save
      post 'unassign', params: {'user_id' => @user.global_id, 'lesson_id' => l.global_id}
      json = assert_success_json
      expect(json['lesson']['id']).to eq(l.global_id)

      ue.reload
      expect(ue.settings['lessons']).to_not eq(nil)
      expect(ue.settings['lessons'].map{|l| l['id'] }).to eq(['ha', 'whatever'])
    end

    it "should require a valid org if specified" do
      token_user
      l = Lesson.create(user_id: @user.id)
      post 'unassign', params: {'organization_id' => 'asdf', 'lesson_id' => l.global_id}
      assert_not_found('asdf')
    end

    it "should require edit permission on the org" do
      token_user
      o = Organization.create
      o.add_supervisor(@user.user_name, false, false)
      l = Lesson.create(user_id: @user.id)
      post 'unassign', params: {'organization_id' => o.global_id, 'lesson_id' => l.global_id}
      assert_unauthorized
    end
    
    it "should unassign from the specified org" do
      token_user
      o = Organization.create
      o.add_manager(@user.user_name)
      l = Lesson.create(user_id: @user.id)
      o.settings['lessons'] = [{'id' => 'ha'}, {'id' => l.global_id}, {'id' => 'whatever'}]
      o.save
      post 'unassign', params: {'organization_id' => o.global_id, 'lesson_id' => l.global_id}
      json = assert_success_json
      expect(json['lesson']['id']).to eq(l.global_id)
      o.reload
      expect(o.settings['lessons']).to_not eq(nil)
      expect(o.settings['lessons'].map{|l| l['id'] }).to eq(['ha', 'whatever'])
    end

    it "should require a valid unit if specified" do
      token_user
      l = Lesson.create(user_id: @user.id)
      post 'assign', params: {'organization_unit_id' => 'asdf', 'lesson_id' => l.global_id}
      assert_not_found('asdf')
    end

    it "should require edit permission on the specified unit" do
      token_user
      o = Organization.create
      ou = OrganizationUnit.create(organization: o)
      o.add_supervisor(@user.user_name, false, false)
      l = Lesson.create(user_id: @user.id)
      post 'unassign', params: {'organization_unit_id' => ou.global_id, 'lesson_id' => l.global_id}
      assert_unauthorized
    end

    it "should unassign from the specified unit" do
      token_user
      o = Organization.create
      ou = OrganizationUnit.create(organization: o)
      o.add_supervisor(@user.user_name, false, false)
      ou.add_supervisor(@user.user_name, true)
      l = Lesson.create(user_id: @user.id)
      ou.settings['lesson'] = {'id' => l.global_id}
      ou.save
      post 'unassign', params: {'organization_unit_id' => ou.global_id, 'lesson_id' => l.global_id}
      json = assert_success_json
      expect(json['lesson']['id']).to eq(l.global_id)
      ou.reload
      expect(ou.settings['lesson']).to eq(nil)
    end
  end

  describe "update" do
    it "should require an api token" do
      put 'update', params: {'id' => 'asdf'}
      assert_missing_token
    end

    it "should require a valid lesson" do
      token_user
      put 'update', params: {'id' => 'asdf'}
      assert_not_found('asdf')
    end

    it "should require authorization" do
      token_user
      l = Lesson.create
      put 'update', params: {'id' => l.global_id}
      assert_unauthorized
    end

    it "should update" do
      token_user
      l = Lesson.create(user_id: @user.id)
      put 'update', params: {'id' => l.global_id, 'lesson' => {'title' => 'a', 'time_estimate' => '5'}}
      json = assert_success_json
      expect(json['lesson']).to_not eq(nil)
      expect(json['lesson']['id']).to eq(l.global_id)
      expect(json['lesson']['title']).to eq('a')
      expect(json['lesson']['time_estimate']).to eq(5)
    end
  end
end
