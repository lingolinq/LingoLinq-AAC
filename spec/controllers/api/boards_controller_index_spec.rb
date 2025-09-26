require 'spec_helper'

describe Api::BoardsController, :type => :controller do
  describe "index" do
    it "should not require api token" do
      get :index
      expect(response).to be_successful
    end
    
    it "should filter by user_id" do
      u = User.create(:settings => {:public => true})
      b = Board.create(:user => u, :public => true)
      b2 = Board.create(:user => u)
      get :index, params: {:user_id => u.global_id, :public => true}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board'].length).to eq(1)
      expect(json['board'][0]['id']).to eq(b.global_id)
    end

    it "should return root shallow clones for a user" do
      token_user
      u1 = User.create
      u2 = @user
      b1 = Board.create(user: u1, public: true)
      b2 = Board.create(user: u1, public: true)
      b3 = Board.create(user: u2)
      b1.process({'buttons' => [
        {'id' => 1, 'label' => 'chicken', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {'user' => u1})
      Worker.process_queues
      bb1 = Board.find_by_global_id("#{b1.global_id}-#{u2.global_id}")
      b1.star!(u2, true)
      Worker.process_queues
      u2.reload
      u2.enable_feature('shallow_clones')
      u2.save
      refs = u2.starred_board_refs
      expect(refs.length).to eq(1)
      expect(refs[0]['id']).to eq(bb1.global_id)
      get 'index', params: {user_id: u2.global_id}
      json = assert_success_json
      expect(json['board'].length).to eq(2)
      expect(json['board'][0]['id']).to eq(b3.global_id)
      expect(json['board'][1]['id']).to eq(bb1.global_id)
    end

    it "should include root shallow clones for edited boards, even if they're not in the root list" do
      token_user
      u1 = User.create
      u2 = @user
      u2.enable_feature('shallow_clones')
      u2.save
      b1 = Board.create(user: u1, public: true)
      b2 = Board.create(user: u1, public: true)
      b3 = Board.create(user: u2)
      b4 = Board.create(user: u1, public: true)
      b1.process({'buttons' => [
        {'id' => 1, 'label' => 'chicken', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {'user' => u1})
      b2.process({'copy_key' => b1.global_id}, {'user' => u1})
      Worker.process_queues
      bb4 = Board.find_by_global_id("#{b4.global_id}-#{u2.global_id}")
      b4.star!(u2, true)
      Worker.process_queues
      u2.reload
      expect(u2.settings['starred_board_ids']).to eq([b4.global_id])
      bb2 = Board.find_by_global_id("#{b2.global_id}-#{u2.global_id}")
      bb2 = bb2.copy_for(u2, {copy_id: b1.global_id})
      Worker.process_queues
      u2.reload
      expect(u2.settings['starred_board_ids']).to eq([b4.global_id])
      ue2 = UserExtra.find_by(user: u2)
      expect(ue2.settings['replaced_roots']).to_not eq(nil)
      expect(ue2.settings['replaced_roots']).to eq("#{b1.global_id}" => {'id' => "#{b1.global_id}-#{u2.global_id}", 'key' => "#{u2.user_name}/my:#{b1.key.sub(/\//, ':')}"})
      refs = u2.reload.starred_board_refs
      expect(refs.length).to eq(2)
      expect(refs[0]['id']).to eq(bb4.global_id)
      expect(refs[1]['id']).to eq("#{b1.global_id}-#{u2.global_id}")
      get 'index', params: {user_id: u2.global_id}
      json = assert_success_json
      expect(json['board'].length).to eq(4)
      expect(json['board'][0]['id']).to eq(bb2.shallow_id)
      expect(json['board'][1]['id']).to eq(b3.global_id)
      expect(json['board'][2]['id']).to eq("#{b4.global_id}-#{u2.global_id}")
      expect(json['board'][3]['id']).to eq("#{b1.global_id}-#{u2.global_id}")
    end
    
    it "should require view_detailed permissions when filtering by user_id" do
      u = User.create
      get :index, params: {:user_id => u.global_id}
      assert_unauthorized

      get :index, params: {:user_id => u.global_id, :public => true}
      assert_unauthorized
    end
    
    it "should require edit permissions when filtering by user_id unless public" do
      u = User.create(:settings => {:public => true})
      get :index, params: {:user_id => u.global_id}
      assert_unauthorized
      
      get :index, params: {:user_id => u.global_id, :public => true}
      expect(response).to be_successful
    end
    
    it "should allow filtering by user_id and private if authorized" do
      token_user
      @user.settings['public'] = true
      @user.save
      b = Board.create(:user => @user, :public => true)
      b2 = Board.create(:user => @user)
      get :index, params: {:user_id => @user.global_id, :private => true}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board'].length).to eq(1)
      expect(json['board'][0]['id']).to eq(b2.global_id)
    end
    
    it "should return only personal or public boards if authorized" do
      token_user
      b1 = Board.create(:user => @user)
      u2 = User.create
      b2 = Board.create(:user => u2)
      u3 = User.create
      b3 = Board.create(:user => u3, :public => true)
      @user.settings['starred_board_ids'] = [b1.global_id, b2.global_id, b3.global_id]
      @user.save
      get :index, params: {:user_id => @user.global_id, :starred => true}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board'].length).to eq(2)
      expect(json['board'].map{|b| b['id'] }).to be_include(b1.global_id)
      expect(json['board'].map{|b| b['id'] }).to be_include(b3.global_id)
      expect(json['board'].map{|b| b['id'] }).not_to be_include(b2.global_id)
    end

    it "should return supervisee boards if starred" do
      token_user
      b1 = Board.create(:user => @user)
      u2 = User.create
      b2 = Board.create(:user => u2)
      u3 = User.create
      b3 = Board.create(:user => u3, :public => true)
      User.link_supervisor_to_user(@user, u2)
      @user.reload
      u2.reload
      @user.settings['starred_board_ids'] = [b1.global_id, b2.global_id, b3.global_id]
      @user.save
      get :index, params: {:user_id => @user.global_id, :starred => true}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board'].length).to eq(3)
      expect(json['board'].map{|b| b['id'] }).to be_include(b1.global_id)
      expect(json['board'].map{|b| b['id'] }).to be_include(b3.global_id)
      expect(json['board'].map{|b| b['id'] }).to be_include(b2.global_id)
    end

    it "should return tagged boards if authorized" do
      token_user
      u2 = User.create
      u2.settings['public'] = true
      u2.save
      b1 = Board.create(user: @user)
      b2 = Board.create(user: @user)
      b3 = Board.create(user: u2)
      e = UserExtra.create(user: @user)
      e.settings['board_tags'] = {
        'bacon' => [b1.global_id, b3.global_id, 'a', 'b']
      }
      e.save
      get :index, params: {:user_id => @user.global_id, :tag => 'bacon'}
      json = assert_success_json
      expect(json['board'].length).to eq(1)
      expect(json['board'].map{|b| b['id'] }.sort).to eq([b1.global_id])
    end

    it "should not return tagged boards if unauthorized" do
      token_user
      u2 = User.create
      u2.settings['public'] = true
      u2.save
      b1 = Board.create(user: @user)
      b2 = Board.create(user: @user)
      b3 = Board.create(user: u2)
      e = UserExtra.create(user: @user)
      e.settings['board_tags'] = {
        'bacon' => [b1.global_id, b3.global_id, 'a', 'b']
      }
      get :index, params: {:user_id => u2.global_id, :tag => 'bacon'}
      assert_unauthorized
    end

    it "should include public, supervisee, and self-owned tagged boards, but not others" do
      token_user
      u2 = User.create
      u2.settings['public'] = true
      u2.save
      u3 = User.create
      User.link_supervisor_to_user(@user, u3)
      b1 = Board.create(user: @user)
      b2 = Board.create(user: @user)
      b3 = Board.create(user: u2)
      b4 = Board.create(user: u2, public: true)
      b5 = Board.create(user: u3)
      b6 = Board.create(user: u3, public: true)
      e = UserExtra.create(user: @user)
      e.tag_board(b1, 'water', false, false)
      e.tag_board(b3, 'water', false, false)
      e.tag_board(b4, 'water', false, false)
      e.tag_board(b5, 'water', false, false)
      e.tag_board(b6, 'water', false, false)
      get :index, params: {:user_id => @user.global_id, :tag => 'water'}
      json = assert_success_json
      expect(json['board'].length).to eq(4)
      expect(json['board'].map{|b| b['id'] }.sort).to eq([b1.global_id, b4.global_id, b5.global_id, b6.global_id])
    end
    
    it "should always filter by public when user_id is not provided" do
      u = User.create(:settings => {:public => true})
      b = Board.create(:user => u, :public => true)
      b2 = Board.create(:user => u)
      get :index
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board'].length).to eq(1)
      expect(json['board'][0]['id']).to eq(b.global_id)
    end
    
    it "should filter by a key" do
      u = User.create(:settings => {:public => true})
      b = Board.create(:user => u, :public => true)
      get :index, params: {:key => b.key}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board'].length).to eq(1)
      expect(json['board'][0]['id']).to eq(b.global_id)
    end
    
    it "should check for a user-owned board with the key name if valid access_token" do
      token_user
      @user.settings['public'] = true
      @user.save
      b = Board.create(:user => @user, :public => true)
      get :index, params: {:key => b.key.split(/\//)[1]}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board'].length).to eq(1)
      expect(json['board'][0]['id']).to eq(b.global_id)
    end
    
    it "should search by query string" do
      expect(BoardLocale.count).to eq(0)
      u = User.create(:settings => {:public => true})
      b = Board.create(:user => u, :public => true, :settings => {'name' => "one two three"})
      b2 = Board.create(:user => u, :public => true, :settings => {'name' => "four five six"})
      b.generate_stats
      b.save
      b2.generate_stats
      b2.save
      expect(BoardLocale.count).to eq(2)
      get :index, params: {:q => "two"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board'].length).to eq(1)
      expect(json['board'][0]['id']).to eq(b.global_id)

      get :index, params: {:q => "six"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board'].length).to eq(1)
      expect(json['board'][0]['id']).to eq(b2.global_id)
    end
    
    it "should search private boards by query string" do
      token_user
      b = Board.create(:user => @user, :settings => {'name' => "one two three"})
      b2 = Board.create(:user => @user, :settings => {'name' => "four five six"})
      get :index, params: {:user_id => @user.global_id, :q => "two"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board'].length).to eq(1)
      expect(json['board'][0]['id']).to eq(b.global_id)

      get :index, params: {:user_id => @user.global_id, :q => "six"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board'].length).to eq(1)
      expect(json['board'][0]['id']).to eq(b2.global_id)
    end
    
    it "should allow sorting by popularity or home_popularity" do
      u = User.create(:settings => {:public => true})
      b = Board.create(:user => u, :public => true)
      b2 = Board.create(:user => u, :public => true)
      b.generate_stats
      b.save
      b2.generate_stats
      b2.save
      Board.where(:id => b.id).update_all({:home_popularity => 3, :popularity => 1})
      Board.where(:id => b2.id).update_all({:home_popularity => 1, :popularity => 3})
      get :index, params: {:sort => "home_popularity"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board'].length).to eq(2)
      expect(json['board'][0]['id']).to eq(b.global_id)
      expect(json['board'][1]['id']).to eq(b2.global_id)

      get :index, params: {:sort => "popularity"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board'].length).to eq(2)
      expect(json['board'][0]['id']).to eq(b.global_id)
      expect(json['board'][1]['id']).to eq(b2.global_id)
    end
    
    it "should allow filtering by board category" do  
      u = User.create(:settings => {:public => true})
      b = Board.create(:user => u, :public => true, :settings => {'categories' => ['friends', 'ice_cream', 'cheese']})
      b2 = Board.create(:user => u, :public => true, :settings => {'categories' => ['ice_cream']})
      b3 = Board.create(:user => u, :public => true, :settings => {'categories' => ['cheese']})
      b.generate_stats
      b.save
      b2.generate_stats
      b2.save
      b3.generate_stats
      b3.save
      Board.where(:id => b.id).update_all({:home_popularity => 3, :popularity => 1})
      Board.where(:id => b2.id).update_all({:home_popularity => 1, :popularity => 3})
      Board.where(:id => b2.id).update_all({:home_popularity => 1, :popularity => 3})
      get :index, params: {:category => "ice_cream"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board'].length).to eq(2)
      expect(json['board'][0]['id']).to eq(b2.global_id)
      expect(json['board'][1]['id']).to eq(b.global_id)
    end
    
    it "should allow sorting by custom_order" do
      u = User.create(:settings => {:public => true})
      b = Board.create(:user => u, :public => true, :settings => {'custom_order' => 2})
      Board.where(:id => b.id).update_all({:home_popularity => 3, :popularity => 1})
      b2 = Board.create(:user => u, :public => true, :settings => {'custom_order' => 1})
      Board.where(:id => b2.id).update_all({:home_popularity => 1, :popularity => 3})
      get :index, params: {:sort => "custom_order"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board'].length).to eq(2)
      expect(json['board'][0]['id']).to eq(b2.global_id)
      expect(json['board'][1]['id']).to eq(b.global_id)
    end
    
    it "should only show boards with some home_popularity score when sorting by that" do
      u = User.create(:settings => {:public => true})
      b = Board.create(:user => u, :public => true)
      Board.where(:id => b.id).update_all({:home_popularity => 3})
      b2 = Board.create(:user => u, :public => true)
      get :index, params: {:sort => "home_popularity"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board'].length).to eq(1)
      expect(json['board'][0]['id']).to eq(b.global_id)
    end
    
    it "should include shared boards if the user has any in user-search results" do
      token_user
      u2 = User.create
      b = Board.create(:user => u2, :settings => {'name' => 'cool board'}, :public => true)
      b.share_with(@user)
      get :index, params: {:user_id => @user.global_id, :q => 'cool', :include_shared => true}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board'].length).to eq(1)
      expect(json['board'][0]['id']).to eq(b.global_id)
    end
    
    it "should include boards downstream of shared boards in user-search results if enabled" do
      token_user
      u2 = User.create
      b = Board.create(:user => u2, :settings => {'name' => 'cool board'}, :public => true)
      b.share_with(@user, true)
      b2 = Board.create(:user => u2, :settings => {'name' => 'awesome board'}, :public => true)
      b.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]
      b.save
      b3 = Board.create(:user => u2, :settings => {'name' => 'bodacious board'}, :public => true)
      b2.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}
      ]
      b2.save
      Worker.process_queues
      
      get :index, params: {:user_id => @user.global_id, :q => 'bodacious', :include_shared => true}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board'].length).to eq(1)
      expect(json['board'][0]['id']).to eq(b3.global_id)

      get :index, params: {:user_id => @user.global_id, :q => 'board', :include_shared => true}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board'].length).to eq(3)
      expect(json['board'].map{|b| b['id'] }.sort).to eq([b.global_id, b2.global_id, b3.global_id])
    end
    
    it "should not include boards downstream of shared boards in user-search results if by a different author" do
      token_user
      u2 = User.create
      u3 = User.create
      b = Board.create(:user => u2, :settings => {'name' => 'cool board'}, :public => true)
      b.share_with(@user, true)
      b2 = Board.create(:user => u3, :settings => {'name' => 'awesome board'}, :public => true)
      b.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]
      b.save
      b3 = Board.create(:user => u2, :settings => {'name' => 'bodacious board'}, :public => true)
      b2.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}
      ]
      b2.save
      Worker.process_queues
      
      get :index, params: {:user_id => @user.global_id, :q => 'awesome', :include_shared => true}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board'].length).to eq(0)

      get :index, params: {:user_id => @user.global_id, :q => 'board', :include_shared => true}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board'].length).to eq(2)
      expect(json['board'][0]['id']).to eq(b.global_id)
      expect(json['board'][1]['id']).to eq(b3.global_id)
    end

    it "should use board locales for searching public queries" do
      u = User.create
      b1 = Board.create(user: u, public: true, popularity: 10, home_popularity: 10)
      b2 = Board.create(user: u, public: true, popularity: 5, home_popularity: 5)
      bl1 = BoardLocale.create(board_id: b1.id, popularity: 5, home_popularity: 3, locale: 'en', search_string: "whatever cheese is good for you")
      bl2 = BoardLocale.create(board_id: b1.id, popularity: 1, home_popularity: 1, locale: 'en', search_string: "I don't know what to say about this, but, well, um, cheese")
      bl3 = BoardLocale.create(board_id: b1.id, popularity: 1, home_popularity: 1, locale: 'es', search_string: "whatever cheese is good for you")
      bl4 = BoardLocale.create(board_id: b2.id, popularity: 1, home_popularity: 1, locale: 'es', search_string: "this is the best frog I have ever eaten with cheese")
      Board.where(id: b2.id).update_all(home_popularity: 5)

      get :index, params: {public: true, locale: 'en-GB', q: 'cheese', sort: 'popularity'}
      json = assert_success_json
      expect(json['board'].length).to eq(1)
      expect(json['board'][0]['id']).to eq(b1.global_id)

      get :index, params: {public: true, locale: 'es', q: 'cheese', sort: 'popularity'}
      json = assert_success_json
      expect(json['board'].length).to eq(2)
      expect(json['board'][0]['id']).to eq(b2.global_id)
      expect(json['board'][1]['id']).to eq(b1.global_id)

      get :index, params: {public: true, locale: 'es_US', q: 'frog', sort: 'home_popularity'}
      json = assert_success_json
      expect(json['board'].length).to eq(1)
      expect(json['board'][0]['id']).to eq(b2.global_id)
    end

    it "should return a localized board name" do
      u = User.create
      b1 = Board.create(user: u, public: true, popularity: 10, home_popularity: 10)
      b1.settings['name'] = 'ahoo'
      b1.settings['translations'] = {
        'board_name' => {'es' => 'ahem'}
      }
      b1.save
      b2 = Board.create(user: u, public: true, popularity: 5, home_popularity: 5)
      b2.settings['name'] = 'ahii'
      b2.settings['translations'] = {
        'board_name' => {'es' => 'ahoy'}
      }
      b2.save
      bl1 = BoardLocale.create(board_id: b1.id, popularity: 5, home_popularity: 3, locale: 'en', search_string: "whatever cheese is good for you")
      bl2 = BoardLocale.create(board_id: b1.id, popularity: 1, home_popularity: 1, locale: 'en', search_string: "I don't know what to say about this, but, well, um, cheese")
      bl3 = BoardLocale.create(board_id: b1.id, popularity: 200, home_popularity: 1, locale: 'es', search_string: "whatever cheese is good for you cheese cheese")
      bl4 = BoardLocale.create(board_id: b2.id, popularity: 1, home_popularity: 1, locale: 'es', search_string: "this is the best frog I have ever eaten with cheese")
      Board.where(id: b2.id).update_all(home_popularity: 5)

      get :index, params: {public: true, locale: 'en-GB', q: 'cheese', sort: 'popularity'}
      json = assert_success_json
      expect(json['board'].length).to eq(1)
      expect(json['board'][0]['id']).to eq(b1.global_id)
      expect(json['board'][0]['name']).to eq('ahoo')
      expect(json['board'][0]['localized_name']).to eq('ahoo')

      get :index, params: {public: true, locale: 'es', q: 'cheese', sort: 'popularity'}
      json = assert_success_json
      expect(json['board'].length).to eq(2)
      expect(json['board'][0]['id']).to eq(b2.global_id)
      expect(json['board'][0]['name']).to eq('ahii')
      expect(json['board'][0]['localized_name']).to eq('ahoy')
      expect(json['board'][1]['id']).to eq(b1.global_id)
      expect(json['board'][1]['name']).to eq('ahoo')
      expect(json['board'][1]['localized_name']).to eq('ahem')

      get :index, params: {public: true, locale: 'es_US', q: 'frog', sort: 'home_popularity'}
      json = assert_success_json
      expect(json['board'].length).to eq(1)
      expect(json['board'][0]['id']).to eq(b2.global_id)
      expect(json['board'][0]['name']).to eq('ahii')
      expect(json['board'][0]['localized_name']).to eq('ahoy')
    end

    it "should use localized search string for searching private queries" do
      token_user
      u = @user
      b1 = Board.create(user: u)
      b1.settings['buttons'] = [
        {id: '1', 'label' => 'cheese'}      
      ]
      b1.settings['grid'] = {'rows' => 1, 'columns' => 1, 'order' => [['1']]}
      b1.settings['translations'] = {
        '1' => {
          'es' => {'label' => 'frog'}
        },
        '2' => {
          'es' => {'label' => 'frog'}
        }
      }
      b1.settings['locale'] = 'en'
      b1.popularity = 3
      b1.save
      b2 = Board.create(user: u)
      b2.settings['buttons'] = [
        {id: '1', 'label' => 'frog is fun'}      
      ]
      b2.settings['grid'] = {'rows' => 1, 'columns' => 1, 'order' => [['1']]}
      b2.settings['translations'] = {
        '1' => {
          'en' => {'label' => 'cheese'}
        }
      }
      b2.popularity = 5
      b2.settings['locale'] = 'es_SP'
      b2.save
      b3 = Board.create(user: u)
      b3.settings['buttons'] = [
        {id: '1', 'label' => 'frog is fun'}      
      ]
      b3.settings['grid'] = {'rows' => 1, 'columns' => 1, 'order' => [['1']]}
      b3.settings['translations'] = {
        '1' => {
          'en-US' => {'label' => 'cheese curds'}
        }
      }
      b3.settings['locale'] = 'es_SP'
      b3.popularity = 1
      b3.save

      get :index, params: {user_id: u.global_id, locale: 'en-GB', q: 'cheese', sort: 'popularity'}
      json = assert_success_json
      expect(json['board'].length).to eq(3)
      expect(json['board'][0]['id']).to eq(b1.global_id)
      expect(json['board'][1]['id']).to eq(b2.global_id)
      expect(json['board'][2]['id']).to eq(b3.global_id)

      get :index, params: {user_id: u.global_id, locale: 'es', q: 'cheese', sort: 'popularity'}
      json = assert_success_json
      expect(json['board'].length).to eq(0)

      get :index, params: {user_id: u.global_id, locale: 'es_US', q: 'frog', sort: 'home_popularity'}
      json = assert_success_json
      expect(json['board'].length).to eq(3)
      expect(json['board'][0]['id']).to eq(b3.global_id)
      expect(json['board'][1]['id']).to eq(b2.global_id)
      expect(json['board'][2]['id']).to eq(b1.global_id)
    end

    it "should include starred shallow clones" do
      token_user
      ub = Board.create(:user => @user)
      u = User.create
      b = Board.create(:user => u, public: true)
      post :star, params: {:board_id => b.global_id}
      expect(response).to be_successful
      expect(b.reload.settings['starred_user_ids']).to eq(["en:" + @user.global_id])
      json = JSON.parse(response.body)
      expect(json).to eq({'starred' => true, 'stars' => 1, 'user_id' => @user.global_id})

      post :star, params: {:board_id => "#{b.global_id}-#{@user.global_id}"}
      expect(response).to be_successful
      expect(b.reload.settings['starred_user_ids']).to eq(["en:" + @user.global_id])
      json = JSON.parse(response.body)
      expect(json).to eq({'starred' => true, 'stars' => 1, 'user_id' => @user.global_id})
      Worker.process_queues
      expect(@user.reload.settings['starred_board_ids']).to eq([b.global_id, "#{b.global_id}-#{@user.global_id}"])

      @user.settings['preferences']['sync_starred_boards'] = true
      @user.save
      expect(@user.starred_board_refs.length).to eq(2)

      get :index, params: {:user_id => @user.global_id}
      json = assert_success_json
      expect(json['board'].length).to eq(2)
      expect(json['board'][0]['id']).to eq(ub.global_id)
      expect(json['board'][1]['id']).to eq("#{b.global_id}-#{@user.global_id}")
    end

    it "should include a shallow clone home board" do
      token_user
      ub = Board.create(:user => @user)
      u = User.create
      b = Board.create(:user => u, public: true)
      post :star, params: {:board_id => b.global_id}
      expect(response).to be_successful
      expect(b.reload.settings['starred_user_ids']).to eq(["en:" + @user.global_id])
      json = JSON.parse(response.body)
      expect(json).to eq({'starred' => true, 'stars' => 1, 'user_id' => @user.global_id})

      post :star, params: {:board_id => "#{b.global_id}-#{@user.global_id}"}
      expect(response).to be_successful
      expect(b.reload.settings['starred_user_ids']).to eq(["en:" + @user.global_id])
      json = JSON.parse(response.body)
      expect(json).to eq({'starred' => true, 'stars' => 1, 'user_id' => @user.global_id})
      Worker.process_queues
      expect(@user.reload.settings['starred_board_ids']).to eq([b.global_id, "#{b.global_id}-#{@user.global_id}"])

      @user.settings['preferences']['sync_starred_boards'] = true
      @user.save
      expect(@user.starred_board_refs.length).to eq(2)

      b2 = Board.create(user: u, public: true)
      @user.settings['preferences']['home_board'] = {'id' => "#{b2.global_id}-#{@user.global_id}", 'key' => "#{@user.user_name}/my:#{b2.key.sub(/\//, ':')}"}
      @user.save

      get :index, params: {:user_id => @user.global_id}
      json = assert_success_json
      expect(json['board'].length).to eq(3)
      expect(json['board'].map{|b| b['id'] }.sort).to eq([ub.global_id, "#{b.global_id}-#{@user.global_id}", "#{b2.global_id}-#{@user.global_id}"])
      expect(json['board'][0]['id']).to eq(ub.global_id)
    end

    it "should include roots of edited shallow clones, even if not starred" do
      token_user
      ub = Board.create(:user => @user)
      u = User.create
      b = Board.create(:user => u, public: true)
      post :star, params: {:board_id => b.global_id}
      expect(response).to be_successful
      expect(b.reload.settings['starred_user_ids']).to eq(["en:" + @user.global_id])
      json = JSON.parse(response.body)
      expect(json).to eq({'starred' => true, 'stars' => 1, 'user_id' => @user.global_id})

      post :star, params: {:board_id => "#{b.global_id}-#{@user.global_id}"}
      expect(response).to be_successful
      expect(b.reload.settings['starred_user_ids']).to eq(["en:" + @user.global_id])
      json = JSON.parse(response.body)
      expect(json).to eq({'starred' => true, 'stars' => 1, 'user_id' => @user.global_id})
      Worker.process_queues
      expect(@user.reload.settings['starred_board_ids']).to eq([b.global_id, "#{b.global_id}-#{@user.global_id}"])

      @user.settings['preferences']['sync_starred_boards'] = true
      @user.save
      expect(@user.starred_board_refs.length).to eq(2)

      b2 = Board.create(user: u, public: true)
      @user.settings['preferences']['home_board'] = {'id' => "#{b2.global_id}-#{@user.global_id}", 'key' => "#{@user.user_name}/my:#{b2.key.sub(/\//, ':')}"}
      @user.save

      b3 = Board.create(user: u, public: true)
      b4 = Board.create(user: u, public: true)
      b3.process({'buttons' => [
        {'id' => 1, 'label' => 'can', 'load_board' => {'key' => b4.key, 'id' => b4.global_id}}
      ]}, {'user' => u})
      b4.settings['copy_id'] = b3.global_id
      b4.save_subtly
      Worker.process_queues
      expect(b3.reload.downstream_board_ids).to eq([b4.global_id])

      put :update, params: {:id => "#{b4.global_id}-#{@user.global_id}", :board => {:name => "cool board 2", :buttons => [{'id' => 1, 'label' => 'cat'}]}}
      bb4 = Board.find_by_global_id("#{b4.global_id}-#{@user.global_id}")
      expect(bb4.id).to_not eq(b4.id)
      expect(bb4.settings['name']).to eq('cool board 2')
      assert_success_json
      Worker.process_queues
      Worker.process_queues
      ue = UserExtra.find_by(user: @user)
      expect(ue.settings['replaced_roots']).to eq({"#{b3.global_id}" => {'id' => "#{b3.global_id}-#{@user.global_id}", 'key' => "#{@user.user_name}/my:#{b3.key.sub(/\//, ':')}"}})

      get :index, params: {:user_id => @user.global_id}
      json = assert_success_json
      expect(json['board'].length).to eq(5)
      expect(json['board'].map{|b| b['id'] }.sort).to eq([ub.global_id, "#{b.global_id}-#{@user.global_id}", "#{b2.global_id}-#{@user.global_id}", "#{b3.global_id}-#{@user.global_id}", "#{b4.global_id}-#{@user.global_id}"])
      expect(json['board'][0]['id']).to eq(ub.global_id)
      expect(json['board'][1]['id']).to eq("#{b4.global_id}-#{@user.global_id}")
      s1 = json['board'].detect{|b| b['id'] == "#{b3.global_id}-#{@user.global_id}"}
      s2 = json['board'].detect{|b| b['id'] == "#{b4.global_id}-#{@user.global_id}"}
      expect(s1['copy_id']).to eq(nil)
      expect(s1['shallow_clone']).to eq(true)
      expect(s2['copy_id']).to eq(b3.global_id)
      expect(s2['shallow_clone']).to eq(nil)
      expect(b4.reload.settings['name']).to_not eq('cool board 2')
      expect(bb4.reload.settings['name']).to eq('cool board 2')
      expect(s2['name']).to eq('cool board 2')
    end

    it "should include roots that have been set as home, even if no longer home" do
      token_user
      ub = Board.create(:user => @user)
      u = User.create
      b = Board.create(:user => u, public: true)

      b2 = Board.create(user: u, public: true)
      @user.copy_to_home_board({'id' => b2.global_id, 'key' => b2.key, 'shallow' => true}, u.global_id, nil)
      @user.reload
      expect(@user.settings['preferences']['home_board']).to eq({
        'id' => "#{b2.global_id}-#{@user.global_id}",
        'key' => "#{@user.user_name}/my:#{b2.key.sub(/\//, ':')}",
        'locale' => 'en'
      })
      ue = @user.user_extra
      expect(ue).to_not eq(nil)
      ue.reload
      expect(ue.settings['replaced_roots']).to_not eq(nil)
      
      get :index, params: {:user_id => @user.global_id}
      json = assert_success_json
      expect(json['board'].length).to eq(2)
      expect(json['board'].map{|b| b['id'] }.sort).to eq([ub.global_id, "#{b2.global_id}-#{@user.global_id}"])
      expect(json['board'][0]['id']).to eq(ub.global_id)
      expect(json['board'][1]['id']).to eq("#{b2.global_id}-#{@user.global_id}")
      s1 = json['board'].detect{|b| b['id'] == "#{b2.global_id}-#{@user.global_id}"}
      expect(s1['copy_id']).to eq(nil)
      expect(s1['shallow_clone']).to eq(true)

      @user.settings['preferences']['home_board'] = nil
      @user.save

      get :index, params: {:user_id => @user.global_id}
      json = assert_success_json
      expect(json['board'].length).to eq(2)
      expect(json['board'].map{|b| b['id'] }.sort).to eq([ub.global_id, "#{b2.global_id}-#{@user.global_id}"])
      expect(json['board'][0]['id']).to eq(ub.global_id)
      expect(json['board'][1]['id']).to eq("#{b2.global_id}-#{@user.global_id}")
      s1 = json['board'].detect{|b| b['id'] == "#{b2.global_id}-#{@user.global_id}"}
      expect(s1['copy_id']).to eq(nil)
      expect(s1['shallow_clone']).to eq(true)
    end

    it "should include edited shallow clone roots in a way that edited shallow clone sub-boards can be matched to them" do
      token_user
      ub = Board.create(:user => @user)
      u = User.create
      b = Board.create(:user => u, public: true)
      post :star, params: {:board_id => b.global_id}
      expect(response).to be_successful
      expect(b.reload.settings['starred_user_ids']).to eq(["en:" + @user.global_id])
      json = JSON.parse(response.body)
      expect(json).to eq({'starred' => true, 'stars' => 1, 'user_id' => @user.global_id})

      post :star, params: {:board_id => "#{b.global_id}-#{@user.global_id}"}
      expect(response).to be_successful
      expect(b.reload.settings['starred_user_ids']).to eq(["en:" + @user.global_id])
      json = JSON.parse(response.body)
      expect(json).to eq({'starred' => true, 'stars' => 1, 'user_id' => @user.global_id})
      Worker.process_queues
      expect(@user.reload.settings['starred_board_ids']).to eq([b.global_id, "#{b.global_id}-#{@user.global_id}"])

      @user.settings['preferences']['sync_starred_boards'] = true
      @user.save
      expect(@user.starred_board_refs.length).to eq(2)

      b2 = Board.create(user: u, public: true)
      @user.settings['preferences']['home_board'] = {'id' => "#{b2.global_id}-#{@user.global_id}", 'key' => "#{@user.user_name}/my:#{b2.key.sub(/\//, ':')}"}
      @user.save

      b3 = Board.create(user: u, public: true)
      b4 = Board.create(user: u, public: true)
      b3.process({'buttons' => [
        {'id' => 1, 'label' => 'can', 'load_board' => {'key' => b4.key, 'id' => b4.global_id}}
      ]}, {'user' => u})
      b4.settings['copy_id'] = b3.global_id
      b4.save_subtly
      Worker.process_queues
      expect(b3.reload.downstream_board_ids).to eq([b4.global_id])

      put :update, params: {:id => "#{b4.global_id}-#{@user.global_id}", :board => {:name => "cool board 2", :buttons => [{'id' => 1, 'label' => 'cat'}]}}
      assert_success_json
      bb4 = Board.find_by_global_id("#{b4.global_id}-#{@user.global_id}")
      expect(bb4.id).to_not eq(b4.id)
      expect(bb4.reload.settings['copy_id']).to eq(b3.global_id)
      Worker.process_queues
      Worker.process_queues
      ue = UserExtra.find_by(user: @user)
      expect(ue.settings['replaced_roots']).to eq({"#{b3.global_id}" => {'id' => "#{b3.global_id}-#{@user.global_id}", 'key' => "#{@user.user_name}/my:#{b3.key.sub(/\//, ':')}"}})

      put :update, params: {:id => "#{b3.global_id}-#{@user.global_id}", :board => {:name => "cool board 1", :buttons => [{'id' => 1, 'label' => 'cat', 'load_board' => {'id' => "#{b4.global_id}-#{@user.user_name}", 'key' => "#{@user.user_name}/my:#{b4.key.sub(/\//, ':')}"}}]}}
      assert_success_json
      Worker.process_queues
      Worker.process_queues
      ue = UserExtra.find_by(user: @user)
      expect(ue.settings['replaced_roots']).to eq({"#{b3.global_id}" => {'id' => "#{b3.global_id}-#{@user.global_id}", 'key' => "#{@user.user_name}/my:#{b3.key.sub(/\//, ':')}"}})

      get :index, params: {:user_id => @user.global_id}
      json = assert_success_json
      expect(json['board'].length).to eq(5)
      expect(json['board'].map{|b| b['id'] }.sort).to eq([ub.global_id, "#{b.global_id}-#{@user.global_id}", "#{b2.global_id}-#{@user.global_id}", "#{b3.global_id}-#{@user.global_id}", "#{b4.global_id}-#{@user.global_id}"])
      expect(json['board'][0]['id']).to eq(ub.global_id)
      expect(json['board'][1]['id']).to eq("#{b3.global_id}-#{@user.global_id}")
      expect(json['board'][2]['id']).to eq("#{b4.global_id}-#{@user.global_id}")
      s1 = json['board'].detect{|b| b['id'] == "#{b3.global_id}-#{@user.global_id}"}
      s2 = json['board'].detect{|b| b['id'] == "#{b4.global_id}-#{@user.global_id}"}
      expect(s1['copy_id']).to eq(nil)
      expect(s1['shallow_clone']).to eq(nil)
      expect(s2['copy_id']).to eq(b3.global_id)
      expect(s2['shallow_clone']).to eq(nil)
    end

    it "should stop including shallow clones, whether starred or edited, when removed" do
      token_user
      ub = Board.create(:user => @user)
      u = User.create
      b = Board.create(:user => u, public: true)
      post :star, params: {:board_id => b.global_id}
      expect(response).to be_successful
      expect(b.reload.settings['starred_user_ids']).to eq(["en:" + @user.global_id])
      json = JSON.parse(response.body)
      expect(json).to eq({'starred' => true, 'stars' => 1, 'user_id' => @user.global_id})

      post :star, params: {:board_id => "#{b.global_id}-#{@user.global_id}"}
      expect(response).to be_successful
      expect(b.reload.settings['starred_user_ids']).to eq(["en:" + @user.global_id])
      json = JSON.parse(response.body)
      expect(json).to eq({'starred' => true, 'stars' => 1, 'user_id' => @user.global_id})
      Worker.process_queues
      expect(@user.reload.settings['starred_board_ids']).to eq([b.global_id, "#{b.global_id}-#{@user.global_id}"])

      @user.settings['preferences']['sync_starred_boards'] = true
      @user.save
      expect(@user.starred_board_refs.length).to eq(2)

      b2 = Board.create(user: u, public: true)
      @user.settings['preferences']['home_board'] = {'id' => "#{b2.global_id}-#{@user.global_id}", 'key' => "#{@user.user_name}/my:#{b2.key.sub(/\//, ':')}"}
      @user.save

      b3 = Board.create(user: u, public: true)
      b4 = Board.create(user: u, public: true)
      b3.process({'buttons' => [
        {'id' => 1, 'label' => 'can', 'load_board' => {'key' => b4.key, 'id' => b4.global_id}}
      ]}, {'user' => u})
      b4.settings['copy_id'] = b3.global_id
      b4.save_subtly
      Worker.process_queues
      expect(b3.reload.downstream_board_ids).to eq([b4.global_id])

      put :update, params: {:id => "#{b4.global_id}-#{@user.global_id}", :board => {:name => "cool board 2", :buttons => [{'id' => 1, 'label' => 'cat'}]}}
      bb4 = Board.find_by_global_id("#{b4.global_id}-#{@user.global_id}")
      expect(bb4.id).to_not eq(b4.id)
      expect(bb4.settings['name']).to eq('cool board 2')
      assert_success_json
      Worker.process_queues
      Worker.process_queues
      ue = UserExtra.find_by(user: @user)
      expect(ue.settings['replaced_roots']).to eq({"#{b3.global_id}" => {'id' => "#{b3.global_id}-#{@user.global_id}", 'key' => "#{@user.user_name}/my:#{b3.key.sub(/\//, ':')}"}})

      get :index, params: {:user_id => @user.global_id}
      json = assert_success_json
      expect(json['board'].length).to eq(5)
      expect(json['board'].map{|b| b['id'] }.sort).to eq([ub.global_id, "#{b.global_id}-#{@user.global_id}", "#{b2.global_id}-#{@user.global_id}", "#{b3.global_id}-#{@user.global_id}", "#{b4.global_id}-#{@user.global_id}"])
      expect(json['board'][0]['id']).to eq(ub.global_id)
      expect(json['board'][1]['id']).to eq("#{b4.global_id}-#{@user.global_id}")
      s1 = json['board'].detect{|b| b['id'] == "#{b3.global_id}-#{@user.global_id}"}
      s2 = json['board'].detect{|b| b['id'] == "#{b4.global_id}-#{@user.global_id}"}
      expect(s1['copy_id']).to eq(nil)
      expect(s1['shallow_clone']).to eq(true)
      expect(s2['copy_id']).to eq(b3.global_id)
      expect(s2['shallow_clone']).to eq(nil)
      expect(b4.reload.settings['name']).to_not eq('cool board 2')
      expect(bb4.reload.settings['name']).to eq('cool board 2')
      expect(s2['name']).to eq('cool board 2')

      delete :unstar, params: {:board_id => "#{b.global_id}-#{@user.global_id}"}
      json = assert_success_json
      Worker.process_queues

      get :index, params: {:user_id => @user.global_id}
      json = assert_success_json
      expect(json['board'].length).to eq(4)

      delete :destroy, params: {:id => "#{b3.global_id}-#{@user.global_id}"}
      json = assert_success_json

      get :index, params: {:user_id => @user.global_id}
      json = assert_success_json
      expect(json['board'].length).to eq(3)
      expect(json['board'].map{|b| b['id'] }.sort).to eq([ub.global_id, "#{b2.global_id}-#{@user.global_id}", "#{b4.global_id}-#{@user.global_id}"])
      expect(json['board'][0]['id']).to eq(ub.global_id)
    end
  end
end
