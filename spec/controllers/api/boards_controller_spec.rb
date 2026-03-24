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

    it "should not 500 on custom_order sort when a starred board has nil settings" do
      token_user
      u = @user
      u.settings['public'] = true
      u.save
      b = Board.create(user: u, public: true)
      b.update_column(:settings, nil)
      u.reload
      u.settings['starred_board_ids'] = [b.global_id]
      u.save
      get :index, params: {
        user_id: u.global_id,
        public: 'true',
        starred: 'true',
        sort: 'custom_order',
        category: 'robust'
      }
      expect(response).to be_successful
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
      BoardLocale.where(board_id: [b.id, b2.id]).find_each do |bl|
        ActiveRecord::Base.connection.execute("UPDATE board_locales SET tsv_search_string = to_tsvector('simple', coalesce(search_string, '')) WHERE id = #{bl.id}")
      end
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
      [bl1, bl2, bl3, bl4].each do |bl|
        ActiveRecord::Base.connection.execute("UPDATE board_locales SET tsv_search_string = to_tsvector('simple', coalesce(search_string, '')) WHERE id = #{bl.id}")
      end

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
      [bl1, bl2, bl3, bl4].each do |bl|
        ActiveRecord::Base.connection.execute("UPDATE board_locales SET tsv_search_string = to_tsvector('simple', coalesce(search_string, '')) WHERE id = #{bl.id}")
      end

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
      b3.reload.track_downstream_boards!
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
      b3.reload.track_downstream_boards!
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
      b3.reload.track_downstream_boards!
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

  describe "show" do
    it "should not require api token" do
      u = User.create
      b = Board.create(:user => u, :public => true)
      get :show, params: {:id => b.global_id}
      expect(response).to be_successful
    end
    
    it "should require existing object" do
      u = User.create
      b = Board.create(:user => u)
      get :show, params: {:id => '1_19999'}
      assert_not_found
    end

    it "should require authorization" do
      u = User.create
      b = Board.create(:user => u)
      get :show, params: {:id => b.global_id}
      assert_unauthorized
    end
    
    it "should return a json response" do
      token_user
      b = Board.create(:user => @user)
      get :show, params: {:id => b.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['id']).to eq(b.global_id)
    end
    
    it "should return deleted status if the information is allowed" do
      token_user
      b = Board.create(:user => @user)
      key = b.key
      b.destroy
      Worker.process_queues
      get :show, params: {:id => key}
      assert_not_found(key)
      json = JSON.parse(response.body)
      expect(json['deleted']).to eq(true)
    end
    
    it "should not return deleted status for non-existent boards" do
      token_user
      Worker.process_queues
      get :show, params: {:id => "#{@user.user_name}/not-a-board"}
      assert_not_found("#{@user.user_name}/not-a-board")
      json = JSON.parse(response.body)
      expect(json['deleted']).to eq(nil)
    end

    it "should return deleted status if the information is allowed when searching by id" do
      token_user
      b = Board.create(:user => @user)
      key = b.global_id
      b.destroy
      Worker.process_queues
      get :show, params: {:id => key}
      assert_not_found(key)
      json = JSON.parse(response.body)
      expect(json['deleted']).to eq(true)
    end
    
    it "should not return deleted status if not allowed" do
      token_user
      u = User.create
      b = Board.create(:user => u, :public => true)
      key = b.key
      b.destroy
      Worker.process_queues
      get :show, params: {:id => key}
      assert_not_found
      json = JSON.parse(response.body)
      expect(json['deleted']).to eq(nil)
    end
    
    it "should return never_existed status if allowed" do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u)
      get :show, params: {:id => "#{u.user_name}/bacon"}
      assert_not_found("#{u.user_name}/bacon")
      json = JSON.parse(response.body)
      expect(json['deleted']).to eq(nil)
      expect(json['never_existed']).to eq(true)
    end
    
    it "should not return never_existed status if not allowed" do
      token_user
      u = User.create
      get :show, params: {:id => "#{u.user_name}/bacon"}
      assert_not_found
      json = JSON.parse(response.body)
      expect(json['deleted']).to eq(nil)
      expect(json['never_existed']).to eq(nil)
    end

    it "should return a shallow clone if specified" do
      u = User.create
      b = Board.create(user: u, public: true)
      b.settings['name'] = 'a'
      b.save
      token_user
      get :show, params: {id: "#{b.global_id}-#{@user.global_id}"}
      json = assert_success_json
      expect(json['board']['id']).to eq("#{b.global_id}-#{@user.global_id}")
      expect(json['board']['key']).to eq("#{@user.user_name}/my:#{b.key.sub(/\//, ':')}")
      expect(json['board']['name']).to eq("a")

      get :show, params: {id: "#{@user.user_name}/my:#{b.key.sub(/\//, ':')}"}
      json = assert_success_json
      expect(json['board']['id']).to eq("#{b.global_id}-#{@user.global_id}")
      expect(json['board']['key']).to eq("#{@user.user_name}/my:#{b.key.sub(/\//, ':')}")
      expect(json['board']['name']).to eq("a")
    end

    it "should not allow access to an unauthorized shallow clone" do
      u = User.create
      b = Board.create(user: u)
      token_user
      get :show, params: {id: "#{b.global_id}-#{@user.global_id}"}
      assert_unauthorized
      
      get :show, params: {id: "#{@user.user_name}/my:#{b.key.sub(/\//, ':')}"}
      assert_unauthorized
    end

    it "should retrieve an updated shallow clone if edited" do
      u = User.create
      b = Board.create(user: u)
      b.settings['name'] = 'a'
      b.save
      token_user
      bb = Board.find_by_path("#{b.global_id}-#{@user.global_id}")
      b2 = bb.copy_for(@user)
      b2.settings['name'] = 'b'
      b2.save

      get :show, params: {id: "#{b.global_id}-#{@user.global_id}"}
      json = assert_success_json
      expect(json['board']['id']).to eq("#{b.global_id}-#{@user.global_id}")
      expect(json['board']['key']).to eq("#{@user.user_name}/my:#{b.key.sub(/\//, ':')}")
      expect(json['board']['name']).to eq("b")

      get :show, params: {id: "#{@user.user_name}/my:#{b.key.sub(/\//, ':')}"}
      json = assert_success_json
      expect(json['board']['id']).to eq("#{b.global_id}-#{@user.global_id}")
      expect(json['board']['key']).to eq("#{@user.user_name}/my:#{b.key.sub(/\//, ':')}")
      expect(json['board']['name']).to eq("b")
    end

    it "should retrieve the original shallow clone if the updated clone is deleted" do
      u = User.create
      b = Board.create(user: u, public: true)
      b.settings['name'] = 'a'
      b.save
      token_user
      bb = Board.find_by_path("#{b.global_id}-#{@user.global_id}")
      b2 = bb.copy_for(@user)
      b2.settings['name'] = 'b'
      b2.save

      get :show, params: {id: "#{b.global_id}-#{@user.global_id}"}
      json = assert_success_json
      expect(json['board']['id']).to eq("#{b.global_id}-#{@user.global_id}")
      expect(json['board']['key']).to eq("#{@user.user_name}/my:#{b.key.sub(/\//, ':')}")
      expect(json['board']['name']).to eq("b")

      get :show, params: {id: "#{@user.user_name}/my:#{b.key.sub(/\//, ':')}"}
      json = assert_success_json
      expect(json['board']['id']).to eq("#{b.global_id}-#{@user.global_id}")
      expect(json['board']['key']).to eq("#{@user.user_name}/my:#{b.key.sub(/\//, ':')}")
      expect(json['board']['name']).to eq("b")

      b2.destroy
      get :show, params: {id: "#{b.global_id}-#{@user.global_id}"}
      json = assert_success_json
      expect(json['board']['id']).to eq("#{b.global_id}-#{@user.global_id}")
      expect(json['board']['key']).to eq("#{@user.user_name}/my:#{b.key.sub(/\//, ':')}")
      expect(json['board']['name']).to eq("a")

      get :show, params: {id: "#{@user.user_name}/my:#{b.key.sub(/\//, ':')}"}
      json = assert_success_json
      expect(json['board']['id']).to eq("#{b.global_id}-#{@user.global_id}")
      expect(json['board']['key']).to eq("#{@user.user_name}/my:#{b.key.sub(/\//, ':')}")
      expect(json['board']['name']).to eq("a")
    end
  end
  
  describe "create" do
    it "should require api token" do
      post :create
      assert_missing_token
    end

    it "should not raise when board param is omitted (legacy clients)" do
      token_user
      expect {
        post :create, params: {}
      }.not_to raise_error
      expect(response.status).to_not eq(500)
    end
    
    it "should create a new board" do
      token_user
      post :create, params: {:board => {:name => "my board"}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['name']).to eq('my board')
    end
    
    it "should error gracefully on board creation fail" do
      expect_any_instance_of(Board).to receive(:process_params){|u| u.add_processing_error("bacon") }.and_return(false)
      token_user
      post :create, params: {:board => {:name => "my board"}}
      json = JSON.parse(response.body)
      expect(json['error']).to eq("board creation failed")
      expect(json['errors']).to eq(["bacon"])
    end
    
    it "should allow creating a board for a supervisee" do
      token_user
      com = User.create
      User.link_supervisor_to_user(@user, com, nil, true)
      post :create, params: {:board => {:name => "my board", :for_user_id => com.global_id}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['name']).to eq('my board')
      expect(json['board']['user_name']).to eq(com.user_name)
    end
    
    it "should not allow creating a board from a protected board" do
      token_user
      com = User.create
      bb = Board.create(user: @user)
      bb.settings['protected'] = {'vocabulary' => true}
      bb.save
      b = Board.create(user: @user, parent_board: bb)
      b.settings['protected'] = {'vocabulary' => true}
      b.save
      User.link_supervisor_to_user(@user, com, nil, true)
      post :create, params: {:board => {:name => "my board", :for_user_id => com.global_id, :parent_board_id => b.global_id}}
      expect(response).to_not be_successful
      json = JSON.parse(response.body)
      expect(json['errors']).to eq(["cannot copy protected boards"])
    end

    it "should allow creating a board for a supervisee from a protected board" do
      token_user
      b = Board.create(user: @user)
      b.settings['protected'] = {'vocabulary' => true}
      b.save
      com = User.create
      User.link_supervisor_to_user(@user, com, nil, true)
      post :create, params: {:board => {:name => "my board", :for_user_id => com.global_id, :parent_board_id => b.global_id}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['name']).to eq('my board')
      expect(json['board']['user_name']).to eq(com.user_name)
    end

    it "should allow links if the author can access the links but not the supervisee" do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u, nil, true)
      b = Board.create(:user => @user)
      post :create, params: {:board => {:name => "copy", :for_user_id => u.global_id, :buttons => [{'id' => '1', 'load_board' => {'id' => b.global_id}, 'label' => 'farce'}]}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['id']).to_not eq(nil)
      Worker.process_queues
      b2 = Board.find_by_path(json['board']['id'])
      expect(b2).to_not eq(b)
      expect(b2.settings['downstream_board_ids']).to eq([b.global_id])
    end

    it "should allow links if the supervisee can access the links but not the author" do
      token_user
      u = User.create
      User.link_supervisor_to_user(@user, u, nil, true)
      b = Board.create(:user => u)
      post :create, params: {:board => {:name => "copy", :for_user_id => u.global_id, :buttons => [{'id' => '1', 'load_board' => {'id' => b.global_id}, 'label' => 'farce'}]}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['id']).to_not eq(nil)
      Worker.process_queues
      b2 = Board.find_by_path(json['board']['id'])
      expect(b2).to_not eq(b)
      expect(b2.settings['downstream_board_ids']).to eq([b.global_id])
    end
    
    it "should not allow links if the supervisee can access the links but not the author" do
      token_user
      u = User.create
      u2 = User.create
      User.link_supervisor_to_user(@user, u, nil, true)
      b = Board.create(:user => u2)
      post :create, params: {:board => {:name => "copy", :for_user_id => u.global_id, :buttons => [{'id' => '1', 'load_board' => {'id' => b.global_id}, 'label' => 'farce'}]}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['id']).to_not eq(nil)
      Worker.process_queues
      b2 = Board.find_by_path(json['board']['id'])
      expect(b2).to_not eq(b)
      expect(b2.downstream_board_ids).to eq([])
    end
    
    it "should not allow creating a board for a random someone else" do
      token_user
      com = User.create
      post :create, params: {:board => {:name => "my board", :for_user_id => com.global_id}}
      assert_unauthorized
    end
    
    it "should not allow creating a board for a supervisee if you don't have edit privileges" do
      token_user
      com = User.create
      User.link_supervisor_to_user(@user, com, nil, false)
      post :create, params: {:board => {:name => "my board", :for_user_id => com.global_id}}
      assert_unauthorized
    end

    it "should preserve grid order" do
      token_user
      request.headers['Content-Type'] = 'application/json'
      post :create, params: {}, body: 
      {
        :board => {
          :name => "cool board 2",
          :buttons => [{'id' => '1', 'label' => 'can'}, {'id' => '2', 'label' => 'span'}],
          :grid => {
            'rows' => 1, 'columns' => 3,
            'order' => [[1, nil, 2]]
          }
        }
      }.to_json
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['name']).to eq("cool board 2")
      expect(json['board']['grid']['order']).to eq([[1, nil, 2]])
    end
  end
  
  describe "update" do
    it "should require api token" do
      put :update, params: {:id => "1_1"}
      assert_missing_token
    end
    
    it "should error on not found" do
      u = User.create
      token_user
      put :update, params: {:id => "1_19999"}
      assert_not_found('1_19999')
    end

    it "should require edit permissions" do
      u = User.create
      b = Board.create(:user => u)
      token_user
      put :update, params: {:id => b.global_id}
      assert_unauthorized
    end

    it "should not be allowed in valet mode" do
      valet_token_user
      b = Board.create(:user => @user)
      put :update, params: {:id => b.global_id, :board => {:name => "cool board 2"}}
      assert_unauthorized
    end
    
    it "should update the board" do
      token_user
      b = Board.create(:user => @user)
      put :update, params: {:id => b.global_id, :board => {:name => "cool board 2"}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['name']).to eq("cool board 2")
    end
    
    it "should allow linking to private boards with access permission" do
      token_user
      b = Board.create(:user => @user)
      b2 = Board.create(:user => @user)
      button = {:id => 123, :load_board => {:id => b2.global_id, :key => b2.key}}
      put :update, params: {:id => b.global_id, :board => {:name => "cool board 2", :buttons => [button]}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['name']).to eq("cool board 2")
      expect(json['board']['buttons'].length).to eq(1)
      expect(json['board']['buttons'][0]['load_board']).to eq({'id' => b2.global_id, 'key' => b2.key})
    end
    
    it "should now allow linking to private boards without access permission" do
      token_user
      @u2 = User.create
      b = Board.create(:user => @user)
      b2 = Board.create(:user => @u2)
      button = {:id => 123, :load_board => {:id => b2.global_id, :key => b2.key}}
      put :update, params: {:id => b.global_id, :board => {:name => "cool board 2", :buttons => [button]}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['name']).to eq("cool board 2")
      expect(json['board']['buttons'].length).to eq(1)
      expect(json['board']['buttons'][0]['load_board']).to eq(nil)
    end
    
    it "should error gracefully on board update fail" do
      expect_any_instance_of(Board).to receive(:process_params){|u| u.add_processing_error("bacon") }.and_return(false)
      token_user
      b = Board.create(:user => @user)
      put :update, params: {:id => b.global_id, :board => {:name => "cool board 2"}}

      json = JSON.parse(response.body)
      expect(json['error']).to eq("board update failed")
      expect(json['errors']).to eq(["bacon"])
    end
    
    it "should properly share with a second user" do
      token_user
      u2 = User.create
      u3 = User.create
      b = Board.create(:user => @user)
      b.share_with(u2)
      b = Board.find(b.id)
      @user = User.find(@user.id)
      
      put :update, params: {:id => b.global_id, :board => {:sharing_key => "add_shallow-#{@user.user_name}"}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['shared_users'].length).to eq(2)
      
      b = Board.find(b.id)
      expect(b.shared_users.length).to eq(2)
    end
    
    it "should preserve grid order" do
      token_user
      b = Board.create(:user => @user)
      request.headers['Content-Type'] = 'application/json'
      put :update, params: {:id => b.global_id}, body: 
      {
        :board => {
          :name => "cool board 2",
          :buttons => [{'id' => '1', 'label' => 'can'}, {'id' => '2', 'label' => 'span'}],
          :grid => {
            'rows' => 1, 'columns' => 3,
            'order' => [[1, nil, 2]]
          }
        }
      }.to_json
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['name']).to eq("cool board 2")
      expect(json['board']['grid']['order']).to eq([[1, nil, 2]])
    end
    
    it "should support single-button updating" do
      token_user
      b = Board.create(:user => @user)
      b.settings['buttons'] = [
        {'id' => '1', 'label' => 'fred'}, {'id' => '2', 'label' => 'drop dead'}
      ]
      b.save
      put :update, params: {:id => b.global_id, 'button' => {
        'id' => '2',
        'sound_id' => '12345'
      }}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['buttons'][1]).to eq({'id' => '2', 'label' => 'drop dead', 'sound_id' => '12345'})
    end

    it "should allow restoring a deleted board" do
      token_user
      b = Board.create(user: @user)
      b.settings['buttons'] = [
        {'id' => '1', 'label' => 'fred'}, {'id' => '2', 'label' => 'drop dead'}
      ]
      b.save
      get :show, params: {id: b.global_id}
      json = assert_success_json
      expect(json['board']['id']).to eq(b.global_id)
      b.destroy
      expect(Board.find_by_global_id(b.global_id)).to eq(nil)
      get :show, params: {id: b.global_id}
      assert_error('Record not found')
      put :update, params: {
        id: b.global_id, board: {key: b.key, buttons: [{'id' => '1', 'label' => 'fred'}, {'id' => '2', 'label' => 'drop dead'}]}
      }
      json = assert_success_json
      b.reload
      expect(Board.find_by_global_id(b.global_id)).to_not eq(nil)
    end

    it "should not allow restoring a deleted board without supervise permission" do
      u = User.create
      token_user
      b = Board.create(user: u)
      b.settings['buttons'] = [
        {'id' => '1', 'label' => 'fred'}, {'id' => '2', 'label' => 'drop dead'}
      ]
      b.save
      b.destroy
      put :update, params: {
        id: b.global_id, board: {key: b.key, buttons: [{'id' => '1', 'label' => 'fred'}, {'id' => '2', 'label' => 'drop dead'}]}
      }
      assert_unauthorized
      expect(Board.find_by_global_id(b.global_id)).to eq(nil)
    end

    it "should not allow restoring a deleted board when the board has been replaced already" do
      token_user
      b = Board.create(user: @user)
      DeletedBoard.create(key: b.key, board_id: b.id, user: @user)
      put :update, params: {
        id: b.related_global_id(b.id - 1), board: {key: b.key, buttons: [{'id' => '1', 'label' => 'fred'}, {'id' => '2', 'label' => 'drop dead'}]}
      }
      assert_unauthorized
    end

    it "should save image_urls and sound_urls to the board when restoring for reliable access" do
      token_user
      b = Board.create(user: @user)
      b.settings['buttons'] = [
        {'id' => '1', 'label' => 'fred'}, {'id' => '2', 'label' => 'drop dead'}
      ]
      b.save
      get :show, params: {id: b.global_id}
      json = assert_success_json
      expect(json['board']['id']).to eq(b.global_id)
      b.destroy
      expect(Board.find_by_global_id(b.global_id)).to eq(nil)
      get :show, params: {id: b.global_id}
      assert_error('Record not found')
      put :update, params: {
        id: b.global_id, board: {
          key: b.key, 
          buttons: [{'id' => '1', 'label' => 'fred', 'image_id' => '123'}, {'id' => '2', 'label' => 'drop dead', 'image_id' => '234', 'sound_id' => '345'}],
          image_urls: {
            '123' => 'https://www.example.com/pic.png',
            '234' => 'https://www.example.com/pic2.png'
          },
          sound_urls: {
            '345' => 'https://www.example.com/sound.mp3'
          }
        }
      }
      json = assert_success_json
      expect(json['board']['image_urls']).to eq({
        '123' => 'https://www.example.com/pic.png',
        '234' => 'https://www.example.com/pic2.png'
      })
      expect(json['board']['sound_urls']).to eq({
        '345' => 'https://www.example.com/sound.mp3'
      })
      b.reload
      expect(b.settings['image_urls']).to_not eq(nil)
      expect(b.settings['sound_urls']).to_not eq(nil)
      expect(b.settings['undeleted']).to eq(true)
      expect(Board.find_by_global_id(b.global_id)).to_not eq(nil)
    end

    it "should allow editing a clone" do
      token_user
      author = User.create
      b = Board.new(user: author, public: true)
      b.settings = {}
      b.settings['buttons'] = [
        {'id' => '1', 'label' => 'fred'}, {'id' => '2', 'label' => 'drop dead'}
      ]
      b.save
      get :show, params: {id: b.global_id}
      json = assert_success_json
      expect(json['board']['id']).to eq(b.global_id)
      expect(json['board']['key']).to eq(b.key)
      expect(json['board']['permissions']).to eq({'user_id' => @user.global_id, 'view' => true})
      expect(json['board']['shallow_clone']).to eq(nil)

      get :show, params: {id: "#{b.global_id}-#{@user.global_id}"}
      json = assert_success_json
      expect(json['board']['id']).to eq("#{b.global_id}-#{@user.global_id}")
      expect(json['board']['key']).to eq("#{@user.user_name}/my:#{b.key.sub(/\//, ':')}")
      expect(json['board']['shallow_clone']).to eq(true)
      expect(json['board']['permissions']).to eq({'user_id' => @user.global_id, 'view' => true, 'edit' => true})

      put :update, params: {
        id: "#{b.global_id}-#{@user.global_id}", board: {
          name: 'best board',
          buttons: [
            {'id' => '2', 'label' => 'fred'}
          ]
        }
      }
      json = assert_success_json
      expect(json['board']['id']).to eq("#{b.global_id}-#{@user.global_id}")
      expect(json['board']['key']).to eq("#{@user.user_name}/my:#{b.key.sub(/\//, ':')}")
      expect(json['board']['name']).to eq("best board")
      b.reload
      expect(b.settings['name']).to_not eq('best board')
      expect(json['board']['shallow_clone']).to eq(nil)
      expect(json['board']['permissions']).to eq({'user_id' => @user.global_id, 'view' => true, 'edit' => true, 'share' => true, 'delete' => true})
      b2 = Board.last
      expect(b2).to_not eq(b)
      expect(b2.shallow_source).to_not eq(nil)
      expect(b2.shallow_source[:id]).to eq(json['board']['id'])
      expect(b2.shallow_source[:key]).to eq(json['board']['key'])
      ue = @user.reload.user_extra
      expect(ue.settings['replaced_boards']).to_not eq(nil)
      expect(ue.settings['replaced_boards']["#{b.global_id}"]).to eq(b2.global_id)
      expect(Board.find_by_global_id("#{b.global_id}-#{@user.global_id}")).to eq(b2)
    end

    it "should set copy_id to match on an edited shallow clone" do
      token_user
      author = User.create
      b = Board.new(user: author, public: true)
      b.settings = {'copy_id' => '1_456'}
      b.settings['buttons'] = [
        {'id' => '1', 'label' => 'fred'}, {'id' => '2', 'label' => 'drop dead'}
      ]
      b.save
      get :show, params: {id: b.global_id}
      json = assert_success_json
      expect(json['board']['id']).to eq(b.global_id)
      expect(json['board']['key']).to eq(b.key)
      expect(json['board']['permissions']).to eq({'user_id' => @user.global_id, 'view' => true})
      expect(json['board']['shallow_clone']).to eq(nil)

      get :show, params: {id: "#{b.global_id}-#{@user.global_id}"}
      json = assert_success_json
      expect(json['board']['id']).to eq("#{b.global_id}-#{@user.global_id}")
      expect(json['board']['key']).to eq("#{@user.user_name}/my:#{b.key.sub(/\//, ':')}")
      expect(json['board']['shallow_clone']).to eq(true)
      expect(json['board']['permissions']).to eq({'user_id' => @user.global_id, 'view' => true, 'edit' => true})
      expect(json['board']['buttons'].map{|b| b['label']}).to eq(['fred', 'drop dead'])

      put :update, params: {
        id: "#{b.global_id}-#{@user.global_id}", board: {
          name: 'best board',
          buttons: [
            {'id' => '2', 'label' => 'fred'}
          ]
        }
      }
      json = assert_success_json
      expect(json['board']['id']).to eq("#{b.global_id}-#{@user.global_id}")
      expect(json['board']['key']).to eq("#{@user.user_name}/my:#{b.key.sub(/\//, ':')}")
      expect(json['board']['name']).to eq("best board")
      expect(json['board']['buttons'].map{|b| b['label']}).to eq(['fred', 'fred'])
      b.reload
      expect(b.settings['name']).to_not eq('best board')
      expect(json['board']['shallow_clone']).to eq(nil)
      expect(json['board']['permissions']).to eq({'user_id' => @user.global_id, 'view' => true, 'edit' => true, 'share' => true, 'delete' => true})
      b2 = Board.last
      expect(b2).to_not eq(b)
      expect(b2.settings['copy_id']).to eq('1_456')
      expect(b2.shallow_source).to_not eq(nil)
      expect(b2.shallow_source[:id]).to eq(json['board']['id'])
      expect(b2.shallow_source[:key]).to eq(json['board']['key'])
      ue = @user.reload.user_extra
      expect(ue.settings['replaced_boards']).to_not eq(nil)
      expect(ue.settings['replaced_boards']["#{b.global_id}"]).to eq(b2.global_id)
      expect(Board.find_by_global_id("#{b.global_id}-#{@user.global_id}")).to eq(b2)
    end    

    it "should not allow an unauthorized user to access another user's shallow clones" do
      token_user
      author = User.create
      b = Board.new(user: author, public: true)
      b.settings = {}
      b.settings['buttons'] = [
        {'id' => '1', 'label' => 'fred'}, {'id' => '2', 'label' => 'drop dead'}
      ]
      b.save
      get :show, params: {id: b.global_id}
      json = assert_success_json
      expect(json['board']['id']).to eq(b.global_id)
      expect(json['board']['key']).to eq(b.key)
      expect(json['board']['permissions']).to eq({'user_id' => @user.global_id, 'view' => true})
      expect(json['board']['shallow_clone']).to eq(nil)

      get :show, params: {id: "#{b.global_id}-#{author.global_id}"}
      assert_unauthorized

      put :update, params: {
        id: "#{b.global_id}-#{author.global_id}", board: {
          buttons: [
            {'id' => '2', 'label' => 'fred'}
          ]
        }
      }
      assert_unauthorized
    end

    it "should copy instead of trying to edit a shallow clone" do
      token_user
      author = User.create
      b = Board.new(user: author, public: true)
      b.settings = {}
      b.settings['buttons'] = [
        {'id' => '1', 'label' => 'fred'}, {'id' => '2', 'label' => 'drop dead'}
      ]
      b.save
      put :update, params: {
        id: "#{b.global_id}-#{@user.global_id}", board: {
          buttons: [
            {'id' => '2', 'label' => 'fred'}
          ]
        }
      }
      json = assert_success_json
      expect(json['board']['id']).to eq("#{b.global_id}-#{@user.global_id}")
      expect(json['board']['key']).to eq("#{@user.user_name}/my:#{b.key.sub(/\//, ':')}")
      expect(json['board']['buttons'].map{|b| b['label']}).to eq(['fred', 'fred'])
    end
    
    it "should copy boards with existing edited board_content instead of trying to edit a shallow clone" do
      token_user
      author = User.create
      author2 = User.create
      b = Board.new(user: author, public: true)
      b.settings = {}
      b.settings['buttons'] = [
        {'id' => '1', 'label' => 'fred'}, {'id' => '2', 'label' => 'drop dead'}
      ]
      b.save
      b2 = b.copy_for(author2, make_public: true)
      Worker.process_queues
      b2.reload
      expect(b2.board_content).to_not eq(nil)
      b2.settings['content_overrides']['a'] = 'asdf'
      b2.save

      put :update, params: {
        id: "#{b2.global_id}-#{@user.global_id}", board: {
          name: 'best board',
          buttons: [
            {'id' => '2', 'label' => 'fred'}
          ]
        }
      }
      json = assert_success_json
      expect(json['board']['id']).to eq("#{b2.global_id}-#{@user.global_id}")
      expect(json['board']['key']).to eq("#{@user.user_name}/my:#{b2.key.sub(/\//, ':')}")
      expect(json['board']['name']).to eq("best board")
      expect(json['board']['buttons'].map{|b| b['label']}).to eq(['fred', 'fred'])
    end
  end
  
  describe "star" do
    it "should require api token" do
      post :star, params: {:board_id => "1_1"}
      assert_missing_token
    end
    
    it "should error on not found" do
      token_user
      post :star, params: {:board_id => "1_1"}
      assert_not_found('1_1')
    end
    
    it "should star the board and return a json response" do
      token_user
      b = Board.create(:user => @user)
      post :star, params: {:board_id => b.global_id}
      expect(response).to be_successful
      expect(b.reload.settings['starred_user_ids']).to eq(["en:" + @user.global_id])
      json = JSON.parse(response.body)
      expect(json).to eq({'starred' => true, 'stars' => 1, 'user_id' => @user.global_id})
    end
  end
  
  describe "unstar" do
    it "should require api token" do
      delete :star, params: {:board_id => "1_1"}
      assert_missing_token
    end

    it "should error on not found" do
      token_user
      delete :star, params: {:board_id => "1_1"}
      assert_not_found('1_1')
    end

    it "should unstar the board and return a json response" do
      token_user
      b = Board.create(:user => @user, :settings => {'starred_user_ids' => [@user.global_id]})
      delete :unstar, params: {:board_id => b.global_id}
      expect(response).to be_successful
      expect(b.reload.settings['starred_user_ids']).to eq([])
      json = JSON.parse(response.body)
      expect(json).to eq({'starred' => false, 'stars' => 0, 'user_id' => @user.global_id})
    end

    it "should unstar a starred shallow clone" do
      token_user
      u = User.create
      b = Board.create(:user => u, public: true)
      delete :destroy, params: {:id => "#{b.global_id}-#{@user.global_id}"}

      post :star, params: {:board_id => "#{b.global_id}-#{@user.global_id}"}
      expect(response).to be_successful
      expect(@user.reload.settings['starred_board_ids']).to eq(nil)
      Worker.process_queues
      expect(b.reload.settings['starred_user_ids']).to eq(["en:" + @user.global_id])
      expect(@user.reload.settings['starred_board_ids']).to eq(["#{b.global_id}-#{@user.global_id}"])
      json = JSON.parse(response.body)
      expect(json).to eq({'starred' => true, 'stars' => 1, 'user_id' => @user.global_id})

      delete :unstar, params: {:board_id => "#{b.global_id}-#{@user.global_id}"}
      expect(response).to be_successful
      expect(b.reload.settings['starred_user_ids']).to eq([])
      expect(@user.reload.settings['starred_board_ids']).to eq(["#{b.global_id}-#{@user.global_id}"])
      Worker.process_queues
      expect(@user.reload.settings['starred_board_ids']).to eq([])
      json = JSON.parse(response.body)
      expect(json).to eq({'starred' => false, 'stars' => 0, 'user_id' => @user.global_id})
    end

  end
  
  describe "destroy" do
    it "should require api token" do
      delete :destroy, params: {:id => "1_1"}
      assert_missing_token
    end

    it "should error on not found" do
      token_user
      delete :destroy, params: {:id => "1_1"}
      assert_not_found
    end
    
    it "should require permission" do
      u = User.create
      b = Board.create(:user => u)
      token_user
      delete :destroy, params: {:id => b.global_id}
      assert_unauthorized
    end
    
    it "should delete the board and return a json response" do
      token_user
      b = Board.create(:user => @user)
      delete :destroy, params: {:id => b.global_id}
      expect(response).to be_successful
      expect(Board.find_by(:id => b.id)).to eq(nil)
      json = JSON.parse(response.body)
      expect(json['board']['id']).to eq(b.global_id)
    end

    it "should not error when deleting a shallow clone" do
      token_user
      user = User.create
      b = Board.create(:user => user, public: true)
      delete :destroy, params: {:id => "#{b.global_id}-#{@user.global_id}"}
      expect(response).to be_successful
      expect(Board.find_by(:id => b.id)).to_not eq(nil)
      json = JSON.parse(response.body)
      expect(json['board']['id']).to eq("#{b.global_id}-#{@user.global_id}")
    end

    it "should revert to the originals when deleting an edited shallow clone" do
      token_user
      user = User.create
      b = Board.create(:user => user, public: true)
      bb = Board.find_by_global_id("#{b.global_id}-#{@user.global_id}")
      b2 = bb.copy_for(@user)
      b2.settings['name'] = "better board"
      b2.save
      expect(b2.id).to_not eq(b.id)
      delete :destroy, params: {:id => "#{b.global_id}-#{@user.global_id}"}
      expect(response).to be_successful
      expect(Board.find_by(:id => b2.id)).to eq(nil)
      expect(Board.find_by(:id => b.id)).to_not eq(nil)
      json = JSON.parse(response.body)
      expect(json['board']['id']).to eq(bb.global_id)
      expect(json['board']['name']).to eq("better board")
      expect(json['board']['shallow_clone']).to eq(nil)

      get :show, params: {id: "#{b.global_id}-#{@user.global_id}"}
      json = JSON.parse(response.body)
      expect(json['board']['shallow_clone']).to eq(true)
      expect(json['board']['name']).to eq("Unnamed Board")
      expect(json['board']['id']).to eq(bb.global_id)
    end

    it "should remove a replaced root for a root that was added when a shallow clone was created" do
      u = User.create
      token_user
      b1 = Board.create(user: u, public: true)
      b2 = Board.create(user: u, public: true)
      b1.process({'buttons' => [
        {'id' => 1, 'label' => 'cat', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {'user' => u})
      b2.process({'copy_key' => b1.global_id}, {'user' => u})
      expect(b2.settings['copy_id']).to eq(b1.global_id)
      expect(b2.root_board).to eq(b1)
      Worker.process_queues
      bb2 = Board.find_by_global_id("#{b2.global_id}-#{@user.global_id}")
      bb2 = bb2.copy_for(@user, {copy_id: b1.global_id})
      expect(bb2.settings['copy_id']).to eq(b1.global_id)
      Worker.process_queues
      ue = UserExtra.find_by(user: @user)
      expect(ue).to_not eq(nil)
      expect(ue.settings['replaced_roots']).to_not eq(nil)
      expect(ue.settings['replaced_roots'][b1.global_id]).to eq({'id' => "#{b1.global_id}-#{@user.global_id}", 'key' => "#{@user.user_name}\/my:#{b1.key.sub(/\//, ':')}"})
      delete :destroy, params: {id: "#{b1.global_id}-#{@user.global_id}"}
      json = assert_success_json
      ue.reload
      expect(ue.settings['replaced_roots']).to_not eq(nil)
      expect(ue.settings['replaced_roots'][b1.global_id]).to eq(nil)
    end
    
    it "should remove replaced_roots reference for an edited shallow clone when deleting" do
      u = User.create
      token_user
      b1 = Board.create(user: u, public: true)
      b2 = Board.create(user: u, public: true)
      b1.process({'buttons' => [
        {'id' => 1, 'label' => 'cat', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {'user' => u})
      b2.process({'copy_key' => b1.global_id}, {'user' => u})
      expect(b2.settings['copy_id']).to eq(b1.global_id)
      expect(b2.root_board).to eq(b1)
      Worker.process_queues
      bb1 = Board.find_by_global_id("#{b2.global_id}-#{@user.global_id}")
      bb1 = bb1.copy_for(@user, {copy_id: b1.global_id})
      expect(bb1.settings['copy_id']).to eq(b1.global_id)
      Worker.process_queues
      ue = UserExtra.find_by(user: @user)
      expect(ue).to_not eq(nil)
      expect(ue.settings['replaced_roots']).to_not eq(nil)
      expect(ue.settings['replaced_roots'][b1.global_id]).to eq({'id' => "#{b1.global_id}-#{@user.global_id}", 'key' => "#{@user.user_name}\/my:#{b1.key.sub(/\//, ':')}"})
      delete :destroy, params: {id: "#{b1.global_id}-#{@user.global_id}"}
      json = assert_success_json
      ue.reload
      expect(ue.settings['replaced_roots']).to_not eq(nil)
      expect(ue.settings['replaced_roots'][b1.global_id]).to eq(nil)
    end
  end
  
  describe "stats" do
    it "should require api token" do
      get :stats, params: {:board_id => '1_1'}
      assert_missing_token
    end
    
    it "should require permission" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      get :stats, params: {:board_id => b.global_id}
      assert_unauthorized
    end
    
    it "should return basic stats" do
      token_user
      b = Board.create(:user => @user)
      b.settings['stars'] = 4
      b.settings['uses'] = 3
      b.settings['home_uses'] = 4
      b.settings['forks'] = 1
      b.save
      
      get :stats, params: {:board_id => b.global_id}
      expect(response).to be_successful
      hash = JSON.parse(response.body)
      expect(hash['uses']).to eq(4)
    end
  end
  
  describe "download" do
    it "should not error on not found" do
      post :download, params: {:board_id => "1_19999"}
      assert_not_found
    end

    it "should not require api token" do
      u = User.create
      b = Board.create(:user => u, :public => true)
      post :download, params: {:board_id => b.global_id}
      expect(response).to be_successful
    end
    
    it "should require permission" do
      u = User.create
      b = Board.create(:user => u)
      post :download, params: {:board_id => b.global_id}
      assert_unauthorized
    end
    
    it "should allow unauthenticated user to download if public"
    
    it "should return a progress record" do
      u = User.create
      b = Board.create(:user => u, :public => true)
      post :download, params: {:board_id => b.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['progress']['id']).not_to eq(nil)
    end

    it "should schedule the correct parameters" do
      u = User.create
      b = Board.create(:user => u, :public => true)
      post :download, params: {:board_id => b.global_id}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['progress']['id']).not_to eq(nil)
      progress = Progress.find_by_global_id(json['progress']['id'])
      expect(progress.settings['class']).to eq('Board')
      expect(progress.settings['id']).to eq(b.id)
      expect(progress.settings['method']).to eq('generate_download')
      expect(progress.settings['arguments']).to eq([nil, nil, {
        'include' => nil, 
        'headerless' => false, 
        'text_on_top' => false, 
        'transparent_background' => false,
        'symbol_background' => nil,
        'text_only' => false,
        'text_case' => nil,
        'font' => nil
      }])

      token_user
      post :download, params: {:board_id => b.global_id, 'type' => 'bacon', 'include' => 'something', 'headerless' => '1', 'text_on_top' => '0', 'transparent_background' => '1', 'text_only' => '1', 'text_case' => 'lower', 'font' => 'cheddar'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['progress']['id']).not_to eq(nil)
      progress = Progress.find_by_global_id(json['progress']['id'])
      expect(progress.settings['class']).to eq('Board')
      expect(progress.settings['id']).to eq(b.id)
      expect(progress.settings['method']).to eq('generate_download')
      expect(progress.settings['arguments']).to eq([@user.global_id, 'bacon', {
        'include' => 'something', 
        'headerless' => true, 
        'text_on_top' => false, 
        'transparent_background' => true,
        'symbol_background' => nil,
        'text_only' => true,
        'text_case' => 'lower',
        'font' => 'cheddar'
      }])
    end
  end

  
  describe "rename" do
    it "should require api token" do
      post :rename, params: {:board_id => "1_1"}
      assert_missing_token
    end
    
    it "should error on not found" do
      token_user
      post :rename, params: {:board_id => "1_19999"}
      assert_not_found
    end

    it "should require edit permissions" do
      u = User.create
      b = Board.create(:user => u)
      token_user
      post :rename, params: {:board_id => b.global_id}
      assert_unauthorized
    end
    
    it "should rename the board" do
      token_user
      b = Board.create(:user => @user)
      post :rename, params: {:board_id => b.global_id, :old_key => b.key, :new_key => "#{@user.user_name}/bacon"}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json).to eq({'rename' => true, 'key' => "#{@user.user_name}/bacon"})
    end

    it "should require the correct old_key" do
      token_user
      b = Board.create(:user => @user)
      post :rename, params: {:board_id => b.global_id, :old_key => b.key + "asdf", :new_key => "#{@user.user_name}/bacon"}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).not_to eq(nil)
      expect(json['error']).to eq('board rename failed')
    end
    
    it "should require a valid new_key" do
      token_user
      b = Board.create(:user => @user)
      post :rename, params: {:board_id => b.global_id, :old_key => b.key}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).not_to eq(nil)
      expect(json['error']).to eq('board rename failed')
    end
    
    it "should report if there was a new_key name collision" do
      token_user
      b = Board.create(:user => @user)
      b2 = Board.create(:user => @user)
      post :rename, params: {:board_id => b.global_id, :old_key => b.key, :new_key => b2.key}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).not_to eq(nil)
      expect(json['error']).to eq('board rename failed')
      expect(json['collision']).to eq(true)
    end
    
    it "should not allow changing the username prefix for the new_key" do
      token_user
      b = Board.create(:user => @user)
      post :rename, params: {:board_id => b.global_id, :old_key => b.key, :new_key => "#{@user.user_name}x/bacon"}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json).not_to eq(nil)
      expect(json['error']).to eq('board rename failed')
    end
  end
  
  describe "import" do
    it "should require api token" do
      post :import, params: {:url => 'http://www.example.com/file.obf'}
      assert_missing_token
    end
    
    it "should schedule processing for url" do
      token_user
      p = Progress.create
      expect(Progress).to receive(:schedule).with(Board, :import, @user.global_id, 'http://www.example.com/file.obf').and_return(p)
      post :import, params: {:url => 'http://www.example.com/file.obf'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['progress']['id']).to eq(p.global_id)
    end
    
    it "should return import upload parameters for no url" do
      token_user
      post :import, params: {:type => 'obf'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['remote_upload']).to_not eq(nil)
      expect(json['remote_upload']['upload_url']).to_not eq(nil)
    end
  end
  
  describe "unlink" do
    it "should require api token" do
      post :unlink
      assert_missing_token
    end
    
    it "should require a valid board" do
      token_user
      post :unlink, params: {:board_id => 'asdf'}
      assert_not_found
    end
    
    it "should require user edit permission" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      post :unlink, params: {:board_id => b.global_id, :user_id => u.global_id}
      assert_unauthorized
    end
    
    it "should require delete permission to delete a board" do
      token_user
      u = User.create
      u2 = User.create
      b = Board.create(:user => u2)
      User.link_supervisor_to_user(@user, u, nil, true)
      post :unlink, params: {:board_id => b.global_id, :user_id => u.global_id, :type => 'delete'}
      assert_unauthorized
    end
    
    it "should delete a board if allowed" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      User.link_supervisor_to_user(@user, u, nil, true)
      post :unlink, params: {:board_id => b.global_id, :user_id => u.global_id, :type => 'delete'}
      expect(response).to be_successful
    end
    
    it "should unstar a board for the specified user" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      b.star!(u, true)
      expect(b.starred_by?(u)).to eq(true)
      User.link_supervisor_to_user(@user, u, nil, true)
      post :unlink, params: {:board_id => b.global_id, :user_id => u.global_id, :type => 'unstar'}
      expect(response).to be_successful
      expect(b.reload.starred_by?(u)).to eq(false)
    end
    
    it "should error on an unrecognized action" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      b.star!(u, true)
      User.link_supervisor_to_user(@user, u, nil, true)
      post :unlink, params: {:board_id => b.global_id, :user_id => u.global_id, :type => 'bacon'}
      expect(response).not_to be_successful
      json = JSON.parse(response.body)
      expect(json['error']).to eq('unrecognized type')
    end
    
    it "should unlink a shared board for the specified user" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      b.share_with(@user)
      expect(b.shared_with?(@user)).to eq(true)
      post :unlink, params: {:board_id => b.global_id, :user_id => @user.global_id, :type => 'unlink'}
      expect(response).to be_successful
      expect(b.reload.shared_with?(@user.reload)).to eq(false)
    end

    it "should untag a tagged board for the specified user" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      e = UserExtra.create(user: @user)
      e.settings['board_tags'] = {
        'bacon' => [b.global_id],
        'cheddar' => ['a', 'b', b.global_id, 'c']
      }
      e.save
      post :unlink, params: {:board_id => b.global_id, :user_id => @user.global_id, :type => 'untag', :tag => 'bacon'}
      expect(response).to be_successful
      expect(e.reload.settings['board_tags']).to eq({
        'cheddar' => ['a', 'b', b.global_id, 'c']
      })

      post :unlink, params: {:board_id => b.global_id, :user_id => @user.global_id, :type => 'untag', :tag => 'cheddar'}
      expect(response).to be_successful
      expect(e.reload.settings['board_tags']).to eq({
        'cheddar' => ['a', 'b', 'c']
      })

    end
  end
  
  describe "history" do
    it "should require an access token" do
      get :history, params: {:board_id => "asdf/asdf"}
      assert_missing_token
    end
    
    it "should require a valid board" do
      token_user
      get :history, params: {:board_id => "asdf/asdf"}
      assert_not_found
    end
    
    it "should require permission" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      get :history, params: {:board_id => b.key}
      assert_unauthorized
    end
    
    with_versioning do
      it "should return a list of versions" do
        token_user
        PaperTrail.request.whodunnit = "user:#{@user.global_id}"
        b = Board.create(:user => @user, :settings => {'buttons' => []})
        get :history, params: {:board_id => b.key}
        expect(response).to be_successful
        json = JSON.parse(response.body)
        expect(json['boardversion']).not_to eq(nil)
        expect(json['boardversion'].length).to be >= 1
        created = json['boardversion'].find { |v| v['action'] == 'created' }
        expect(created).to_not eq(nil)
        expect(created['modifier']['user_name']).to eq(@user.user_name)
      end
    
      it "should return a list of versions for a deleted board" do
        token_user
        PaperTrail.request.whodunnit = "user:#{@user.global_id}"
        b = Board.create(:user => @user, :settings => {'buttons' => []})
        key = b.key

        vs = b.versions.where('whodunnit IS NOT NULL')
        expect(vs.length).to be >= 1
        vs.update_all(:created_at => 5.seconds.ago)
        
        b.destroy

        vs = b.versions.where('whodunnit IS NOT NULL')
        expect(vs.length).to be >= 2
        
        get :history, params: {:board_id => key}
        expect(response).to be_successful
        json = JSON.parse(response.body)
        expect(json['boardversion']).not_to eq(nil)
        expect(json['boardversion'].length).to be >= 2
        expect(json['boardversion'][0]['action']).to eq('deleted')
        created = json['boardversion'].find { |v| v['action'] == 'created' }
        expect(created).to_not eq(nil)
        expect(created['modifier']['user_name']).to eq(@user.user_name)
      end
      
      it "should include board copy as a version" do
        token_user
        PaperTrail.request.whodunnit = "user:#{@user.global_id}"
        u = User.create
        b = Board.create(:user => u, :public => true)
        b2 = Board.create(:user => u, :public => true)
        b.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b2.global_id}}]
        b.instance_variable_set('@buttons_changed', true)
        b.save
        Worker.process_queues
        new_b = b.reload.copy_for(@user)
        Worker.process_queues
        
        @user.copy_board_links(old_board_id: b.global_id, new_board_id: new_b.global_id, ids_to_copy: [], user_for_paper_trail: "user:#{@user.global_id}")
        Worker.process_queues
        
        new_b.reload
        expect(new_b.settings['downstream_board_ids'].length).to eq(1)
        expect(new_b.settings['downstream_board_ids'][0]).to_not eq(b2.global_id)
        new_b2 = Board.find_by_global_id(new_b.settings['downstream_board_ids'][0])
        expect(new_b2).to_not eq(nil)
        expect(new_b2.parent_board_id).to eq(b2.id)
        
        vs = Board.user_versions(new_b.global_id)
        expect(vs.length).to be >= 2
        vs2 = Board.user_versions(new_b2.global_id)
        expect(vs2.length).to be >= 1
        
        get :history, params: {:board_id => new_b2.key}
        expect(response).to be_successful
        json = JSON.parse(response.body)
        expect(json['boardversion']).not_to eq(nil)
        expect(json['boardversion'].length).to be >= 1
        initial = json['boardversion'].find { |v| ['created', 'copied'].include?(v['action']) }
        expect(initial).to_not eq(nil)
        expect(initial['modifier']).to_not eq(nil)
        expect(initial['modifier']['user_name']).to eq(@user.user_name)
        
        new_b2.save!
        vs2 = Board.user_versions(new_b2.global_id)
        expect(vs2.length).to be >= 2
        get :history, params: {:board_id => new_b2.key}
        expect(response).to be_successful
        json = JSON.parse(response.body)
        expect(json['boardversion']).not_to eq(nil)
        expect(json['boardversion'].length).to be >= 2
        updated = json['boardversion'].find { |v| v['action'] == 'updated' }
        expect(updated).to_not eq(nil)
        expect(updated['modifier']).not_to eq(nil)
        expect(updated['modifier']['user_name']).to eq(@user.user_name)
        copied = json['boardversion'].find { |v| v['action'] == 'copied' }
        expect(copied).to_not eq(nil)
        expect(copied['modifier']).not_to eq(nil)
        expect(copied['modifier']['user_name']).to eq(@user.user_name)
      end
    
      it "should not return a list of versions for a deleted board if not allowed" do
        token_user
        u = User.create
        b = Board.create(:user => u, :settings => {'buttons' => []}, :public => true)
        key = b.key
        b.destroy
        get :history, params: {:board_id => key}
        assert_unauthorized
      end
    end
  end
  
  describe "share_response" do
    it "should require api token" do
      post :share_response, params: {:board_id => "asdf/asdf"}
      assert_missing_token
    end
    
    it "should require a valid board" do
      token_user
      post :share_response, params: {:board_id => "asdf/asdf"}
      assert_not_found
    end
    
    it "should require view permission" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      post :share_response, params: {:board_id => b.key}
      assert_unauthorized
    end
    
    it "should approve if specified" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      b.share_with(@user, true, true)
      Worker.process_queues
      Worker.process_queues
      post :share_response, params: {:board_id => b.key, :approve => 'true'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['approved']).to eq(true)
      expect(json['updated']).to eq(true)
    end
    
    it "should reject if specified" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      b.share_with(@user, true, true)
      Worker.process_queues
      Worker.process_queues
      post :share_response, params: {:board_id => b.key, :approve => 'false'}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['approved']).to eq(false)
      expect(json['updated']).to eq(true)
    end
    
    it "should error if unexpected response" do
      token_user
      u = User.create
      b = Board.create(:user => u, :public => true)
      post :share_response, params: {:board_id => b.key, :approve => 'true'}
      assert_error('board share update failed', 400)
    end
  end
  
  describe "copies" do
    it "should require api token" do
      get :copies, params: {:board_id => "asdf/asdf"}
      assert_missing_token
    end
    
    it "should require a valid board" do
      token_user
      get :copies, params: {:board_id => "asdf/asdf"}
      assert_not_found
    end
    
    it "should require view permission" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      get :copies, params: {:board_id => b.key}
      assert_unauthorized
    end
    
    it "should return a list of copies for the user" do
      token_user
      b = Board.create(:user => @user)
      b2 = b.copy_for(@user)
      get :copies, params: {:board_id => b.key}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board'].length).to eq(1)
    end
  end
  
  describe "translate" do
    it "should require api token" do
      post 'translate', params: {:board_id => '1_1234'}
      assert_missing_token
    end
    
    it "should require a valid board" do
      token_user
      post 'translate', params: {:board_id => '1_1234'}
      assert_not_found('1_1234')
    end
    
    it "should require permission" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      post 'translate', params: {:board_id => b.global_id}
      assert_unauthorized
    end
    
    it "should schedule a translation" do
      token_user
      b = Board.create(:user => @user)
      post 'translate', params: {:board_id => b.global_id, 'translations' => {}, 'source_lang' => 'en', 'destination_lang' => 'es', 'board_ids_to_translate' => []}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['progress']).to_not eq(nil)
      progress = Progress.find_by_global_id(json['progress']['id'])
      expect(Worker.scheduled_for?('priority', Progress, :perform_action, progress.id)).to eq(true)
      expect(progress.settings['method']).to eq('translate_set')
    end
  end
  
  describe "update_privacy" do
    it "should require api token" do
      post 'update_privacy', params: {:board_id => '1_1234'}
      assert_missing_token
    end
    
    it "should require a valid board" do
      token_user
      post 'update_privacy', params: {:board_id => '1_1234'}
      assert_not_found('1_1234')
    end
    
    it "should require permission" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      post 'update_privacy', params: {:board_id => b.global_id}
      assert_unauthorized
    end
    
    it "should schedule an update" do
      token_user
      b = Board.create(:user => @user)
      post 'update_privacy', params: {:board_id => b.global_id, 'privacy' => 'public', 'board_ids_to_update' => []}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['progress']).to_not eq(nil)
      progress = Progress.find_by_global_id(json['progress']['id'])
      expect(Worker.scheduled_for?('priority', Progress, :perform_action, progress.id)).to eq(true)
      expect(progress.settings['method']).to eq('update_privacy')
    end
  end

  describe "swap_images" do
    it "should require api token" do
      post 'swap_images', params: {:board_id => '1_1234'}
      assert_missing_token
    end
    
    it "should require a valid board" do
      token_user
      post 'swap_images', params: {:board_id => '1_1234'}
      assert_not_found('1_1234')
    end
    
    it "should require permission" do
      token_user
      u = User.create
      b = Board.create(:user => u)
      post 'swap_images', params: {:board_id => b.global_id}
      assert_unauthorized
    end
    
    it "should schedule a swap" do
      token_user
      b = Board.create(:user => @user)
      post 'swap_images', params: {:board_id => b.global_id, 'library' => 'asdf', 'board_ids_to_translate' => []}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['progress']).to_not eq(nil)
      progress = Progress.find_by_global_id(json['progress']['id'])
      expect(Worker.scheduled_for?('priority', Progress, :perform_action, progress.id)).to eq(true)
      expect(progress.settings['method']).to eq('swap_images')
    end
  end

  
  describe "protected image use" do
    it "should correctly mark a board as protected" do
      token_user
      post :create, params: {"board":
        {"name": "lptest","key": nil,"description": nil,"created": nil,"updated": nil,"user_name": nil,"locale": "en_US","full_set_revision": nil,"current_revision": nil,"for_user_id": "self","parent_board_id": nil,"parent_board_key": nil,"link": nil,"image_url": nil,"grid": {"rows": 2,"columns": 4},"license": {"type": "private"},"copies": nil,"word_suggestions": false,"public": true,"brand_new": false,"protected": false,"non_author_uses": nil,"downstream_boards": nil,"immediately_upstream_boards": nil,"unlinked_buttons": nil,"forks": nil,"total_buttons": nil,"sharing_key": nil,"starred": false,"stars": nil,"non_author_starred": false,"retrieved": nil,"images": []}
      }
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['name']).to eq('lptest')
      expect(json['board']['public']).to eq(true)
      b = Board.find_by_path(json['board']['id'])
      expect(b).to_not eq(nil)
      Worker.process_queues

      bi1 = ButtonImage.process_new({"url": "http://localhost:3000/api/v1/users/1_1/protected_image/lessonpix/30983","content_type": nil,"width": nil,"height": nil,"pending": false,"avatar": false,"badge": false,"protected": true,"suggestion": "cat","external_id": nil,"search_term": nil,"license": {"type": "private","source_url": "https://lessonpix.com/pictures/30983/cat","author_name": "LessonPix","author_url": "https://lessonpix.com","uneditable": true},"file": false,"retrieved": nil}, {:user => @user, :remote_upload_possible => true})
      expect(bi1.protected?).to eq(true)
      bi2 = ButtonImage.create(:settings => {'protected' => true})
      bi3 = ButtonImage.create(:settings => {'protected' => false})
      Worker.process_queues
      put :update, params: {:id => b.global_id, "board":{"name": "lptest","key": "example/lptest_2","description": nil,"created": "2017-02-24T20:12:01.000Z","updated": "2017-02-24T20:12:01.000Z","user_name": "example","locale": "en_US","full_set_revision": "0b5d2fa3a4f31f42301f34fa6e288f97","current_revision": "0b5d2fa3a4f31f42301f34fa6e288f97","for_user_id": "self","parent_board_id": nil,"parent_board_key": nil,"link": "http://localhost:3000/example/lptest_2","image_url": "https://opensymbols.s3.amazonaws.com/libraries/arasaac/board_3.png","buttons": [{"label": "cat","image_id": bi1.global_id,"background_color": "rgb(255, 204, 170)","border_color": "rgb(255, 112, 17)","hidden": false,"link_disabled": false,"add_to_vocalization": false,"home_lock": false,"blocking_speech": false,"part_of_speech": "noun","suggested_part_of_speech": "noun","id": 1,"dark_border_color": "rgb(246, 98, 0)","dark_background_color": "rgb(255, 189, 144)","text_color": "rgb(0, 0, 0)"}],"grid": {"rows": 2,"columns": 4,"order": [[1,nil,nil,nil],[nil,nil,nil,nil]]},"license": {"type": "private"},"permissions": {"user_id": "1_1","view": true,"edit": true,"delete": true,"share": true},"copies": 0,"word_suggestions": false,"public": true,"brand_new": false,"protected": false,"non_author_uses": 0,"downstream_boards": 0,"immediately_upstream_boards": 0,"unlinked_buttons": 0,"forks": 0,"total_buttons": 0,"shared_users": [],"sharing_key": nil,"starred": false,"stars": 0,"non_author_starred": false,"retrieved": 1487967122808,"images": []}}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['protected']).to eq(true)
      expect(json['board']['public']).to eq(true)

      b.reload
      b.settings['protected']['vocabulary'] = true
      b.save

      put :update, params: {:id => b.global_id, :board => {
        'public' => true,
        'buttons' => [
          {'id' => 1, 'image_id' => bi1.global_id, 'label' => 'a'},
          {'id' => 2, 'image_id' => bi2.global_id, 'label' => 'b'}
        ],
        'grid' => {
          rows: 2,
          columns: 4,
          order: [
            [1, 2, nil, nil],
            [nil, nil, nil, nil]
          ]
        }
      }}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['protected']).to eq(true)
      expect(json['board']['public']).to eq(false)

      b.reload
      b.settings['protected'].delete('vocabulary')
      b.save

      put :update, params: {:id => b.global_id, :board => {
        'public' => true,
        'buttons' => [
          {'id' => 1, 'image_id' => bi3.global_id, 'label' => 'a'}
        ],
        'grid' => {
          rows: 2,
          columns: 4,
          order: [
            [1, nil, nil, nil],
            [nil, nil, nil, nil]
          ]
        }
      }}
      expect(response).to be_successful
      json = JSON.parse(response.body)
      expect(json['board']['protected']).to eq(false)
      expect(json['board']['public']).to eq(true)
    end
  end

  describe "tag" do
    it "should require an api token" do
      post :tag, params: {board_id: 'asdf/asdf'}
      assert_missing_token
    end

    it "should require a valid board" do
      token_user
      post :tag, params: {board_id: 'asdf/asdf'}
      assert_not_found('asdf/asdf')
    end

    it "should require board authorization" do
      token_user
      u = User.create
      b = Board.create(user: u)
      post :tag, params: {board_id: b.global_id}
      assert_unauthorized
    end
    
    it "should not generate a blank tag" do
      token_user
      b = Board.create(user: @user)
      post :tag, params: {board_id: b.global_id, tag: ''}
      json = assert_success_json
      expect(json['tagged']).to eq(false)
      expect(json['board_tags']).to eq(nil)
    end

    it "should generate a tag" do
      token_user
      b = Board.create(user: @user)
      post :tag, params: {board_id: b.global_id, tag: 'bacon'}
      json = assert_success_json
      expect(json['tagged']).to eq(true)
      expect(json['board_tags']).to eq(['bacon'])
      expect(@user.reload.user_extra.settings['board_tags']['bacon']).to eq([b.global_id])
    end

    it "should tag downstream boards as well if specified" do
      token_user
      b = Board.create(user: @user)
      b2 = Board.create(user: @user)
      b3 = Board.create(user: @user)
      b4 = Board.create(user: @user)
      b5 = Board.create(user: @user)
      b6 = Board.create(user: @user)
      b.settings['downstream_board_ids'] = [b2.global_id, b3.global_id, b5.global_id, b6.global_id]
      b.save
      post :tag, params: {board_id: b.global_id, tag: 'bacon', downstream: true}
      json = assert_success_json
      expect(json['tagged']).to eq(true)
      expect(json['board_tags']).to eq(['bacon'])
      expect(@user.reload.user_extra.settings['board_tags']['bacon']).to eq([b.global_id, b2.global_id, b3.global_id, b5.global_id, b6.global_id])
    end

    it "should remove a tag" do
      token_user
      b = Board.create(user: @user)
      post :tag, params: {board_id: b.global_id, tag: 'bacon', remove: true}
      json = assert_success_json
      expect(json['tagged']).to eq(true)
      expect(json['board_tags']).to eq([])

      post :tag, params: {board_id: b.global_id, tag: 'bacon'}
      json = assert_success_json
      expect(json['tagged']).to eq(true)
      expect(json['board_tags']).to eq(['bacon'])
      expect(@user.reload.user_extra.settings['board_tags']['bacon']).to eq([b.global_id])

      post :tag, params: {board_id: b.global_id, tag: 'bacon', remove: true}
      json = assert_success_json
      expect(json['tagged']).to eq(true)
      expect(json['board_tags']).to eq([])
      expect(@user.reload.user_extra.settings['board_tags']['bacon']).to eq(nil)
    end

    it "should return a list of tags on success" do
      token_user
      b = Board.create(user: @user)
      e = UserExtra.create(user: @user)
      e.settings['board_tags'] = {'chocolate' => ['a', 'b'], 'alt' => ['cc']}
      e.save
      post :tag, params: {board_id: b.global_id, tag: 'bacon'}
      json = assert_success_json
      expect(json['tagged']).to eq(true)
      expect(json['board_tags']).to eq(['alt', 'bacon', 'chocolate'])
    end
  end

  describe "rollback" do
    it "should require a valid token" do
      post 'rollback', params: {:board_id => '1_123'}
      assert_missing_token
    end

    it "should require a valid board" do
      token_user
      post 'rollback', params: {board_id: '1_123'}
      assert_not_found('1_123')
    end

    it "should allow a valid deleted board" do
      token_user
      b = Board.create(user: @user)
      id = b.global_id
      b.destroy
      post 'rollback', params: {board_id: id}
      assert_error('invalid date')
    end

    it "should require a valid date" do
      token_user
      b = Board.create(user: @user)
      post 'rollback', params: {board_id: b.global_id, date: 'abcdefg'}
      assert_error('invalid date')
    end

    it "should require a valid date" do
      token_user
      b = Board.create(user: @user)
      post 'rollback', params: {board_id: b.global_id, date: '2000-01-01'}
      assert_error('only 6 months history allowed')
    end

    it "should require permission to restore a deleted board" do
      token_user
      u = User.create
      b = Board.create(user: u)
      id = b.global_id
      b.destroy
      post 'rollback', params: {board_id: id, date: Date.today.iso8601}
      assert_unauthorized
    end

    it "should require permission to rollback a board" do
      token_user
      u = User.create
      b = Board.create(user: u)
      id = b.global_id
      post 'rollback', params: {board_id: id, date: Date.today.iso8601}
      assert_unauthorized
    end

    with_versioning do
      it "should roll back for an active board" do
        token_user
        PaperTrail.request.whodunnit = "user:#{@user.global_id}"
        b = Board.create(:user => @user, :settings => {'buttons' => [{'id' => 1}, {'id' => 2}]})
        key = b.key

        vs = b.versions.where('whodunnit IS NOT NULL')
        expect(vs.length).to be >= 1
        vs.update_all(:created_at => 5.seconds.ago)
        
        b.settings['buttons'] = [{'id' => 3}]
        b.save

        vs = b.versions.where('whodunnit IS NOT NULL')
        expect(vs.length).to be >= 2

        b.settings['buttons'] = [{'id' => 5}]
        b.save

        vs = b.versions.where('whodunnit IS NOT NULL')
        expect(vs.length).to be >= 3

        get :history, params: {:board_id => key}
        expect(response).to be_successful
        json = JSON.parse(response.body)
        expect(json['boardversion']).not_to eq(nil)
        expect(json['boardversion'].length).to be >= 3
        expect(json['boardversion'][0]['action']).to eq('updated')
        expect(json['boardversion'][1]['action']).to eq('updated')
        created = json['boardversion'].find { |v| v['action'] == 'created' }
        expect(created).to_not eq(nil)
        expect(json['boardversion'][1]['modifier']['user_name']).to eq(@user.user_name)
        vs = b.versions.where('whodunnit IS NOT NULL')
        expect(vs.length).to be >= 3
        dt = 6.weeks.ago
        first_update_v = vs.find { |v| (loaded = Board.load_version(v) rescue nil) && loaded.settings['buttons'] == [{'id' => 3}] }
        first_update_v ||= vs[1]
        PaperTrail::Version.where(id: vs[0].id).update_all(created_at: 1.week.ago)
        PaperTrail::Version.where(id: first_update_v.id).update_all(created_at: dt)
        post 'rollback', params: {board_id: b.global_id, date: 2.weeks.ago.to_date.iso8601}
        json = assert_success_json
        expect(json).to eq({'board_id' => b.global_id, 'key' => b.key, 'restored' => false, 'reverted' => dt.iso8601})
        expect(b.reload.settings['buttons']).to eq([{'id' => 3}])
      end

      it "should roll back for an active board" do
        token_user
        PaperTrail.request.whodunnit = "user:#{@user.global_id}"
        b = Board.create(:user => @user, :settings => {'buttons' => [{'id' => 1}, {'id' => 2}]})
        key = b.key

        vs = b.versions.where('whodunnit IS NOT NULL')
        expect(vs.length).to be >= 1
        vs.update_all(:created_at => 5.seconds.ago)
        
        b.settings['buttons'] = [{'id' => 3}]
        b.save

        vs = b.versions.where('whodunnit IS NOT NULL')
        expect(vs.length).to be >= 2

        b.settings['buttons'] = [{'id' => 5}]
        b.save

        vs = b.versions.where('whodunnit IS NOT NULL')
        expect(vs.length).to be >= 3

        get :history, params: {:board_id => key}
        expect(response).to be_successful
        json = JSON.parse(response.body)
        expect(json['boardversion']).not_to eq(nil)
        expect(json['boardversion'].length).to be >= 3
        expect(json['boardversion'][0]['action']).to eq('updated')
        expect(json['boardversion'][1]['action']).to eq('updated')
        created = json['boardversion'].find { |v| v['action'] == 'created' }
        expect(created).to_not eq(nil)
        expect(json['boardversion'][1]['modifier']['user_name']).to eq(@user.user_name)
        vs = b.versions.where('whodunnit IS NOT NULL')
        expect(vs.length).to be >= 3
        dt = 6.weeks.ago
        first_update_v = vs.find { |v| (loaded = Board.load_version(v) rescue nil) && loaded.settings['buttons'] == [{'id' => 3}] }
        first_update_v ||= vs[1]
        PaperTrail::Version.where(id: vs[0].id).update_all(created_at: 1.week.ago)
        PaperTrail::Version.where(id: first_update_v.id).update_all(created_at: dt)
        post 'rollback', params: {board_id: b.global_id, date: 2.weeks.ago.to_date.iso8601}
        json = assert_success_json
        expect(json).to eq({'board_id' => b.global_id, 'key' => b.key, 'restored' => false, 'reverted' => dt.iso8601})
        expect(b.reload.settings['buttons']).to eq([{'id' => 3}])
      end

      it "should roll back for a deleted board" do
        token_user
        PaperTrail.request.whodunnit = "user:#{@user.global_id}"
        b = Board.create(:user => @user, :settings => {'buttons' => [{'id' => 1}, {'id' => 2}]})
        key = b.key

        vs = b.versions.where('whodunnit IS NOT NULL')
        expect(vs.length).to be >= 1
        vs.update_all(:created_at => 5.seconds.ago)
        
        b.settings['buttons'] = [{'id' => 3}]
        b.save

        vs = b.versions.where('whodunnit IS NOT NULL')
        expect(vs.length).to be >= 2

        b.destroy

        vs = b.versions.where('whodunnit IS NOT NULL')
        expect(vs.length).to be >= 3

        get :history, params: {:board_id => key}
        expect(response).to be_successful
        json = JSON.parse(response.body)
        expect(json['boardversion']).not_to eq(nil)
        expect(json['boardversion'].length).to be >= 3
        expect(json['boardversion'][0]['action']).to eq('deleted')
        expect(json['boardversion'][1]['action']).to eq('updated')
        created = json['boardversion'].find { |v| v['action'] == 'created' }
        expect(created).to_not eq(nil)
        expect(json['boardversion'][1]['modifier']['user_name']).to eq(@user.user_name)
        vs = b.versions.where('whodunnit IS NOT NULL')
        expect(vs.length).to be >= 3
        dt = 6.weeks.ago
        first_update_v = vs.find { |v| (loaded = Board.load_version(v) rescue nil) && loaded.settings['buttons'] == [{'id' => 3}] }
        first_update_v ||= vs[1]
        PaperTrail::Version.where(id: vs[0].id).update_all(created_at: 1.week.ago)
        PaperTrail::Version.where(id: first_update_v.id).update_all(created_at: dt)
        post 'rollback', params: {board_id: b.global_id, date: 2.weeks.ago.to_date.iso8601}
        json = assert_success_json
        expect(json).to eq({'board_id' => b.global_id, 'key' => b.key, 'restored' => true, 'reverted' => dt.iso8601})
        expect(Board.find_by_global_id(b.global_id).settings['buttons']).to eq([{'id' => 3}])
      end

    end
  end
  
  describe "slice_locales" do
    it "should require an api token" do
      post 'slice_locales', params: {board_id: '1_1234'}
      assert_missing_token
    end

    it "should require a valid board" do
      token_user
      post 'slice_locales', params: {board_id: '1_1234'}
      assert_not_found('1_1234')
    end

    it "should require authorization" do
      token_user
      u = User.create
      b = Board.create(user: u)
      post 'slice_locales', params: {board_id: b.global_id}
      assert_unauthorized
    end

    it "should schedule a slice with the correct parameters" do
      token_user
      b = Board.create(user: @user)
      post 'slice_locales', params: {board_id: b.global_id, 'ids_to_update' => ['a', 'b']}
      json = assert_success_json
      expect(json['progress']).to_not eq(nil)
      p = Progress.find_by_path(json['progress']['id'])
      expect(p.settings['class']).to eq('Board')
      expect(p.settings['method']).to eq('slice_locales')
      expect(p.settings['id']).to eq(b.id)
      expect(p.settings['arguments']).to eq([nil, ['a', 'b'], @user.global_id])
    end

    it "should return a progress record" do
      token_user
      b = Board.create(user: @user)
      post 'slice_locales', params: {board_id: b.global_id, 'ids_to_update' => ['a', 'b']}
      json = assert_success_json
      expect(json['progress']).to_not eq(nil)
      p = Progress.find_by_path(json['progress']['id'])
      expect(p.settings['class']).to eq('Board')
      expect(p.settings['method']).to eq('slice_locales')
      expect(p.settings['id']).to eq(b.id)
      expect(p.settings['arguments']).to eq([nil, ['a', 'b'], @user.global_id])
    end
  end
end
