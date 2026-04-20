require 'spec_helper'

describe BoardsController, :type => :controller do
  describe "index" do
    it "should render" do
      get "index"
      expect(response).to be_successful
    end
  end
  
  describe "about" do
    it "should render" do
      get "about"
      expect(response).to be_successful
      expect(assigns[:meta_record]).not_to eq(nil)
    end
  end
  
  describe "log_goal_status" do
    it "should render if status not set" do
      ls = LogSession.new
      expect(LogSession).to receive(:find_by_global_id).with('oho').and_return(ls)
      get "log_goal_status", params: {:goal_id => 'asdf', :goal_code => 'asdf', :log_id => 'oho'}
      expect(response).to be_successful
      expect(assigns[:log]).to eq(ls)
    end
    
    it "should call process_status_from_code if status set" do
      u = User.create
      g = UserGoal.create(:user => u)
      expect(UserGoal).to receive(:process_status_from_code).with(g.global_id, '4', 'asdf').and_return(nil)
      get "log_goal_status", params: {:goal_id => g.global_id, :goal_code => 'asdf', :status => '4'}
      expect(response).to be_successful
      expect(assigns[:error]).to eq(true)
    end
    
    it "should redirect if status successfully set" do
      u = User.create
      d = Device.create(:user => u)
      g = UserGoal.create(:user => u)
      get "log_goal_status", params: {:goal_id => g.global_id, :goal_code => g.goal_code(u), :status => '3'}
      expect(response).to be_redirect
      s = LogSession.last
      expect(s.user).to eq(u)
      expect(s.data['goal']['id']).to eq(g.global_id)
      expect(s.data['goal']['status']).to eq(3)
      expect(response.location).to match(/goal_status\/#{g.global_id}\/.+\?log_id=#{s.global_id}\&result_status=3/)
    end
    
    it "should render with error if status unsuccessfully set" do
      u = User.create
      g = UserGoal.create(:user => u)
      expect(UserGoal).to receive(:process_status_from_code).with(g.global_id, '4', 'asdf').and_return(nil)
      get "log_goal_status", params: {:goal_id => g.global_id, :goal_code => 'asdf', :status => '4'}
      expect(response).to be_successful
      expect(assigns[:error]).to eq(true)
    end

    it "should allow logging on a user's general status" do
      u = User.create
      d = Device.create(:user => u)
      get "log_goal_status", params: {:goal_id => "status-#{u.global_id}", :goal_code => UserGoal.goal_code('status', u), :status => '3'}
      expect(response).to be_redirect
      s = LogSession.last
      expect(s.user).to eq(u)
      expect(s.data['goal']['id']).to eq(nil)
      expect(s.data['goal']['global']).to eq(true)
      expect(s.data['goal']['status']).to eq(3)
      expect(response.location).to match(/goal_status\/status-#{u.global_id}\/.+\?log_id=#{s.global_id}\&result_status=3/)
    end
  end
  
  describe "board" do
    it "should set a meta attribute if public" do
      u = User.create
      b = Board.create(:user => u, :public => true)
      meta = b.meta_record
      expect_any_instance_of(Board).to receive(:meta_record).and_return(meta)
      get :board, params: {:id => b.key}
      expect(response).to be_successful
    end

    it "should not set a meta attribute if private" do
      u = User.create
      b = Board.create(:user => u)
      meta = b.meta_record
      expect_any_instance_of(Board).to_not receive(:meta_record)
      get :board, params: {:id => b.key}
      expect(response).to be_successful
    end
    
    it "should redirect when old key found" do
      u = User.create
      b = Board.create(:user => u)
      OldKey.create(:type => 'board', :key => 'bob/fred', :record_id => b.global_id)
      get :board, params: {:id => 'bob/fred'}
      expect(response).to be_redirect
      expect(response.location).to match(/\/#{b.key}$/)
    end
  end
  
  describe "user" do
    it "should set a meta attribute" do
      u = User.create(:settings => {'public' => true})
      meta = u.meta_record
      expect_any_instance_of(User).to receive(:meta_record).and_return(meta)
      get :user, params: {:id => u.global_id}
      expect(response).to be_successful
    end

    it "should redirect when old key found" do
      u = User.create
      OldKey.create(:type => 'user', :key => 'bobfred', :record_id => u.global_id)
      get :user, params: {:id => 'bobfred'}
      expect(response).to be_redirect
      expect(response.location).to match(/\/#{u.user_name}$/)
    end
  end
  
  describe "icon" do
    it "should redirect to the icon's url" do
      u = User.create
      b = Board.create(:user => u)
      get :icon, params: {:id => b.global_id}
      expect(response).to be_redirect
      expect(response.location).to eq(b.icon_url_or_fallback)
    end
  end
  
  describe "utterance" do
    it "should render templates, right now it's rendering empty string in tests"
    
    it "should load the utterance record" do
      user = User.create
      u = Utterance.create(:user => user, :data => {:sentence => "ok guys"})
      get :utterance, params: {:id => u.global_id}
#      response.should be_success
    end
    
    it "should set a meta attribute" do
      user = User.create
      u = Utterance.create(:user => user, :data => {:sentence => "ok guys"})
      meta = u.meta_record
      expect_any_instance_of(Utterance).to receive(:meta_record).and_return(meta)
      get :utterance, params: {:id => u.global_id}
      expect(response).to be_successful
      expect(assigns[:meta_record]).not_to eq(nil)
#      response.body.should match(/meta name="twitter:description" content="ok guys"/)
    end
  end

  
  describe "GET utterance_redirect" do
    it 'should not require an access token' do
      get 'utterance_redirect', params: {'reply_code' => 'asdf'}
      expect(response).to be_redirect
    end

    it 'should redirect to an error if not found' do
      u = User.create
      ut = Utterance.create(user: u)
      get 'utterance_redirect', params: {'reply_code' => 'asdf'}
      expect(response).to be_redirect
      expect(response.location).to match(/\/utterances\/not_found/)
    end

    it 'should redirect to an error if expired' do
      u = User.create
      ut = Utterance.create(user: u)
      Utterance.where(id: ut.id).update_all(created_at: 6.weeks.ago)
      get 'utterance_redirect', params: {'reply_code' => ut.reply_nonce}
      expect(response).to be_redirect
      expect(response.location).to match(/\/utterances\/expired/)
    end

    it 'should redirect to not_found with invalid share index' do
      u = User.create
      ut = Utterance.create(user: u)
      ut.data['share_user_ids'] = ['a', 'b']
      ut.save
      get 'utterance_redirect', params: {'reply_code' => "#{ut.reply_nonce}#{Utterance.to_alpha_code(2)}"}
      expect(response).to be_redirect
      expect(response.location).to match(/\/utterances\/not_found/)
    end

    it 'should include the share index if set' do
      u = User.create
      ut = Utterance.create(user: u)
      ut.data['share_user_ids'] = ['a', 'b']
      ut.save
      get 'utterance_redirect', params: {'reply_code' => "#{ut.reply_nonce}#{Utterance.to_alpha_code(1)}"}
      expect(response).to be_redirect
      expect(response.location).to match(/\/utterances\/#{ut.global_id}x#{ut.reply_nonce}#{Utterance.to_alpha_code(1)}/)
    end
  end
end
