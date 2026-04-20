require 'spec_helper'

describe Board, :type => :model do
  describe "paper_trail" do
    it "should make sure paper trail is doing its thing"
  end
  
  describe "permissions" do
    it "should allow view if public or author" do
      u = User.create
      b = Board.new(:user => u)
      u2 = User.new
      expect(b.allows?(nil, 'view')).to eq(false)
      expect(b.allows?(u, 'view')).to eq(true)
      expect(b.allows?(u2, 'view')).to eq(false)
      b.public = true
      expect(b.allows?(nil, 'view')).to eq(true)
      expect(b.allows?(u, 'view')).to eq(true)
      expect(b.allows?(u2, 'view')).to eq(true)
    end
    
    it "should allow edit and delete if author" do
      u = User.create
      b = Board.new(:user => u)
      u2 = User.new
      expect(b.allows?(nil, 'edit')).to eq(false)
      expect(b.allows?(u, 'edit')).to eq(true)
      expect(b.allows?(u2, 'edit')).to eq(false)
      expect(b.allows?(nil, 'delete')).to eq(false)
      expect(b.allows?(u, 'delete')).to eq(true)
      expect(b.allows?(u2, 'delete')).to eq(false)
      b.public = true
      expect(b.allows?(nil, 'edit')).to eq(false)
      expect(b.allows?(u, 'edit')).to eq(true)
      expect(b.allows?(u2, 'edit')).to eq(false)
      expect(b.allows?(nil, 'delete')).to eq(false)
      expect(b.allows?(u, 'delete')).to eq(true)
      expect(b.allows?(u2, 'delete')).to eq(false)
    end
    
    it "should allow supervisors to edit and delete" do
      u = User.create
      u2 = User.create
      User.link_supervisor_to_user(u2, u)
      b = Board.new(:user => u.reload)
      expect(b.permissions_for(u2)).to eq({
        'user_id' => u2.global_id,
        'view' => true,
        'edit' => true,
        'delete' => true,
        'share' => true
      })
    end

    it "should allow org admins to edit and delete" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
      m = User.create
      
      o.add_manager(m.user_name, true)
      o.add_user(u.user_name, false)
      m.reload
      u.reload
      b = Board.create(user: u)
      
      expect(b.allows?(m, 'view')).to eq(true)
      expect(b.allows?(m, 'edit')).to eq(true)
      expect(b.allows?(m, 'delete')).to eq(true)
    end

    it "should not allow global admins to edit and delete" do
      o = Organization.create(:admin => true, :settings => {'total_licenses' => 1})
      u = User.create
      m = User.create
      
      o.add_manager(m.user_name, true)
      m.reload
      b = Board.create(user: u)
      
      expect(b.allows?(m, 'view')).to eq(true)
      expect(b.allows?(m, 'edit')).to eq(false)
      expect(b.allows?(m, 'delete')).to eq(false)
    end

    it "should allow read-only supervisors to view but not edit or delete" do
      u = User.create
      u2 = User.create
      User.link_supervisor_to_user(u2, u, nil, false)
      b = Board.new(:user => u.reload)
      expect(b.permissions_for(u2)).to eq({
        'user_id' => u2.global_id,
        'view' => true
      })
    end
    
    it "should allow supervisors to view but not edit or delete if the board is created by someone else and shared privately with the communicator" do
      communicator = User.create
      supervisor = User.create
      random = User.create
      User.link_supervisor_to_user(supervisor, communicator, nil, true)
      b = Board.create(:user => random)
      b.share_with(communicator)
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      expect(b.reload.permissions_for(communicator.reload)).to eq({
        'user_id' => communicator.global_id,
        'view' => true
      })
      expect(b.permissions_for(supervisor.reload)).to eq({
        'user_id' => supervisor.global_id,
        'view' => true
      })
    end

    it 'should allow viewing a board that was shared with me' do
      u1 = User.create
      u2 = User.create
      b = Board.create(user: u2)
      b.share_with(u1)
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      expect(b.reload.permissions_for(u1.reload)).to eq({
        'user_id' => u1.global_id,
        'view' => true
      })
      expect(b.permissions_for(u2.reload)).to eq({
        'user_id' => u2.global_id,
        'view' => true,
        'edit' => true,
        'delete' => true,
        'share' => true
      })
    end

    it 'should allow edit-shared users to edit' do
      u1 = User.create
      u2 = User.create
      b = Board.create(user: u2)
      b.share_with(u1, false, true)
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      expect(b.reload.permissions_for(u1.reload)).to eq({
        'user_id' => u1.global_id,
        'view' => true,
        'edit' => true,
        'delete' => true,
        'share' => true
      })
      expect(b.permissions_for(u2.reload)).to eq({
        'user_id' => u2.global_id,
        'view' => true,
        'edit' => true,
        'delete' => true,
        'share' => true
      })
    end

    it 'should allow supervisors to view boards that have been shared with their supervisees' do
      sup = User.create
      com = User.create
      random = User.create
      User.link_supervisor_to_user(sup, com, nil, true)
      b = Board.create(user: random)
      b.share_with(com)
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      expect(b.reload.permissions_for(sup.reload)).to eq({
        'user_id' => sup.global_id,
        'view' => true
      })
      expect(b.permissions_for(com.reload)).to eq({
        'user_id' => com.global_id,
        'view' => true
      })
    end

    it 'should allow access to downstream shares' do
      u1 = User.create
      u2 = User.create
      b1 = Board.create(user: u2)
      b2 = Board.create(user: u2)
      b1.process({'buttons' => [
        {'id' => 1, 'label' => 'cats', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {user: u2})
      Worker.process_queues
      expect(b1.reload.settings['downstream_board_ids']).to eq([b2.global_id])
      b1.share_with(u1, true)
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      expect(b2.reload.permissions_for(u1.reload)).to eq({
        'user_id' => u1.global_id,
        'view' => true
      })
    end

    it 'should not allow access to downstream shares if not downstream share' do
      u1 = User.create
      u2 = User.create
      b1 = Board.create(user: u2)
      b2 = Board.create(user: u2)
      b1.process({'buttons' => [
        {'id' => 1, 'label' => 'cats', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {user: u2})
      Worker.process_queues
      expect(b1.reload.settings['downstream_board_ids']).to eq([b2.global_id])
      b1.share_with(u1)
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      expect(b2.reload.permissions_for(u1.reload)).to eq({
        'user_id' => u1.global_id
      })
    end

    it 'should allow edit access to downstream shares authored by the sharer' do
      u1 = User.create
      u2 = User.create
      b1 = Board.create(user: u2)
      b2 = Board.create(user: u2)
      b1.process({'buttons' => [
        {'id' => 1, 'label' => 'cats', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {user: u2})
      Worker.process_queues
      expect(b1.reload.settings['downstream_board_ids']).to eq([b2.global_id])
      b1.share_or_unshare(u1, true, :include_downstream => true, :allow_editing => true, :pending_allow_editing => false)
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      expect(b2.reload.permissions_for(u1.reload)).to eq({
        'user_id' => u1.global_id,
        'view' => true,
        'edit' => true,
        'delete' => true,
        'share' => true
      })
    end

    it "should not allow access to downstream shares by the sharer's supervisees" do
      u1 = User.create
      u2 = User.create
      u3 = User.create
      b1 = Board.create(user: u2)
      b2 = Board.create(user: u2)
      b3 = Board.create(user: u3)
      User.link_supervisor_to_user(u2, u3, nil, true)
      b1.process({'buttons' => [
        {'id' => 1, 'label' => 'cats', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {user: u2})
      Worker.process_queues
      expect(b1.reload.settings['downstream_board_ids']).to eq([b2.global_id])
      b1.share_or_unshare(u1, true, :include_downstream => true, :allow_editing => true, :pending_allow_editing => false)
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      expect(b2.reload.permissions_for(u1.reload)).to eq({
        'user_id' => u1.global_id,
        'view' => true,
        'edit' => true,
        'delete' => true,
        'share' => true
      })
      expect(b3.reload.permissions_for(u1.reload)).to eq({
        'user_id' => u1.global_id
      })
      expect(b2.reload.permissions_for(u2.reload)).to eq({
        'user_id' => u2.global_id,
        'view' => true,
        'edit' => true,
        'delete' => true,
        'share' => true
      })
    end

    it "should not allow edit access to downstream shares if not granted" do
      u1 = User.create
      u2 = User.create
      b1 = Board.create(user: u2)
      b2 = Board.create(user: u2)
      b1.process({'buttons' => [
        {'id' => 1, 'label' => 'cats', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {user: u2})
      Worker.process_queues
      expect(b1.reload.settings['downstream_board_ids']).to eq([b2.global_id])
      b1.share_or_unshare(u1, true, :include_downstream => true, :allow_editing => true, :pending_allow_editing => true)
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      expect(b2.reload.permissions_for(u1.reload)).to eq({
        'user_id' => u1.global_id,
        'view' => true
      })
    end

    it "should not allow org admins to view boards outside the org that have been shared with people in their org (unless you can find a way to make this performant)" do
      o = Organization.create(:settings => {'total_licenses' => 1})
      u = User.create
      m = User.create
      
      o.add_manager(m.user_name, true)
      o.add_user(u.user_name, false)
      m.reload
      u.reload
      b = Board.create(user: u)
      
      expect(b.allows?(m, 'view')).to eq(true)
      expect(b.allows?(m, 'edit')).to eq(true)
      expect(b.allows?(m, 'delete')).to eq(true)

      u2 = User.create
      b2 = Board.create(user: u2)
      b2.share_with(u, false, true)
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      expect(b2.reload.permissions_for(u.reload)).to eq({
        'user_id' => u.global_id,
        'view' => true,
        'edit' => true,
        'delete' => true,
        'share' => true
      })
      expect(b2.reload.permissions_for(m.reload)).to eq({
        'user_id' => m.global_id
      })
    end

    it "should not allow recursive permissions (I shouldn't be able to see the supervisee of my supervisee" do
      communicator = User.create
      supervisor = User.create
      communicators_supervisee = User.create
      User.link_supervisor_to_user(supervisor, communicator, nil, true)
      User.link_supervisor_to_user(communicator, communicators_supervisee, nil, true)
      b = Board.create(:user => communicators_supervisee.reload)
      expect(b.permissions_for(communicator.reload)).to eq({
        'user_id' => communicator.global_id,
        'view' => true,
        'edit' => true,
        'delete' => true,
        'share' => true
      })
      expect(b.permissions_for(supervisor.reload)).to eq({
        'user_id' => supervisor.global_id
      })
    end
    
    it "should not allow a supervisee to see their supervisor's boards" do
      u = User.create
      u2 = User.create
      User.link_supervisor_to_user(u2, u, nil, false)
      b = Board.new(:user => u2.reload)
      expect(b.permissions_for(u)).to eq({
        'user_id' => u.global_id
      })      
    end
  end
  
  describe "starred_by?" do
    it "should check list and match on global_id" do
      u = User.create
      b = Board.new(:user => u, :settings => {})
      u2 = User.new
      b.settings['starred_user_ids'] = ['a', 3, 'b', u.global_id, false, nil]
      expect(b.starred_by?(u)).to eq(true)
      expect(b.starred_by?(u2)).to eq(false)
      expect(b.starred_by?(nil)).to eq(false)
    end
  end

  describe "star" do
    it "should not fail if settings aren't set yet" do
      u = User.new
      u.id = 12
      b = Board.new
      b.star(u, true)
    end
    
    it "should add the user if set to star" do
      u = User.new
      u.id = 12
      expect(u.global_id).not_to eq(nil)
      b = Board.new
      b.star(u, true)
      expect(b.settings['starred_user_ids']).to eq(["en:" + u.global_id])
    end
    
    it "should not keep repeat ids" do
      u = User.new
      u.id = 12
      expect(u.global_id).not_to eq(nil)
      b = Board.new
      b.star(u, true)
      b.star(u, true)
      b.star(u, true)
      expect(b.settings['starred_user_ids']).to eq(["en:" + u.global_id])
      b.settings['starred_user_ids'] = [u.global_id]
      b.star(u, true)
      expect(b.settings['starred_user_ids']).to eq([u.global_id])
      b.settings['starred_user_ids'] = ["es:" + u.global_id]
      b.star(u, true)
      expect(b.settings['starred_user_ids']).to eq(["es:" + u.global_id])
    end
    
    it "should remove the user if set to unstar" do
      u = User.new
      u.id = 12
      expect(u.global_id).not_to eq(nil)
      b = Board.new
      b.star(u, true)
      expect(b.settings['starred_user_ids']).to eq(["en:" + u.global_id])
      b.star(u, true)
      expect(b.settings['starred_user_ids']).to eq(["en:" + u.global_id])
      b.star(u, false)
      expect(b.settings['starred_user_ids']).to eq([])
    end
    
    it "should schedule an update for the user record" do
      u = User.new
      u.id = 12
      expect(u.global_id).not_to eq(nil)
      b = Board.new
      b.star(u, true)
      expect(Worker.scheduled?(User, :perform_action, {'id' => u.id, 'method' => 'remember_starred_board!', 'arguments' => [b.id]})).to be_truthy
    end
    
    it "should save when star! is called" do
      u = User.create
      b = Board.new(:user => u)
      expect(b.id).to eq(nil)
      b.star(u, true)
      expect(b.id).to eq(nil)
      b.star!(u, true)
      expect(b.id).not_to eq(nil)
    end
    
    it "should override whodunnit when star! is called" do
      PaperTrail.request.whodunnit = "nunya"
      u = User.create
      b = Board.create(user: u)
      u2 = User.create
      b.star!(u2, true)
      expect(b.settings['starred_user_ids']).to eq(["en:" + u2.global_id])
      expect(b.versions.length).to be >= 1
      expect(b.versions.map(&:whodunnit).uniq).to eq(['nunya'])
    end
  end

  describe "stars" do
    it "should always return a value" do
      b = Board.new
      expect(b.stars).to eq(0)
      b.settings = {}
      b.settings['stars'] = 4
      expect(b.stars).to eq(4)
    end
  end

  describe "generate_stats" do
    it "should generate statistics" do
      b = Board.new(settings: {})
      b.generate_stats
      expect(b.settings['stars']).to eq(0)
      expect(b.settings['forks']).to eq(0)
      expect(b.settings['home_uses']).to eq(0)
      expect(b.settings['recent_home_uses']).to eq(0)
      expect(b.settings['uses']).to eq(0)
      expect(b.settings['recent_uses']).to eq(0)
      expect(b.settings['non_author_uses']).to eq(0)
      expect(b.settings['locale_stars']).to eq({})
      expect(b.settings['locale_home_forks']).to eq({})
      expect(b.settings['locale_home_uses']).to eq({})
      expect(b.popularity).to eq(0)
      expect(b.home_popularity).to eq(0)
    end
    
    it "should lookup connections" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      3.times do
        UserBoardConnection.create(:board_id => b.id, :home => true, :user_id => u2.id, locale: 'en_US')
      end
      UserBoardConnection.create(:board_id => b.id, :user_id => u.id, locale: 'es')
      UserBoardConnection.create(:board_id => b.id, :home => true, :user_id => u.id, locale: 'en')
      b.settings['starred_user_ids'] = [1,2]
      b.settings['buttons'] = [{}]
      b.generate_stats
      expect(b.settings['stars']).to eq(2)
      expect(b.settings['forks']).to eq(0)
      expect(b.settings['home_uses']).to eq(4)
      expect(b.settings['recent_home_uses']).to eq(4)
      expect(b.settings['uses']).to eq(5)
      expect(b.settings['recent_uses']).to eq(5)
      expect(b.settings['non_author_uses']).to eq(3)
      expect(b.settings['locale_stars']).to eq({} )
      expect(b.settings['locale_home_forks']).to eq({})
      expect(b.settings['locale_home_uses']).to eq({'en' => 4, 'en_US' => 3})
      expect(b.popularity).to eq(40)
      expect(b.any_upstream).to eq(false)
      expect(b.home_popularity).to eq(40)
    end

    it "should generate board locale records for each locale and lang" do
      u = User.create
      u2 = User.create
      u3 = User.create
      b = Board.create(:user => u)
      b.public = true
      UserBoardConnection.create(:board_id => b.id, :home => true, :user_id => u.id, locale: 'en-US')
      UserBoardConnection.create(:board_id => b.id, :home => true, :user_id => u.id, locale: 'en')
      UserBoardConnection.create(:board_id => b.id, :home => true, :user_id => u.id, locale: 'en-GB')
      UserBoardConnection.create(:board_id => b.id, :home => true, :user_id => u2.id, locale: 'en')
      UserBoardConnection.create(:board_id => b.id, :home => true, :user_id => u3.id, locale: 'es')
      UserBoardConnection.create(:board_id => b.id, :home => true, :user_id => u.id, locale: 'es_US')
      UserBoardConnection.create(:board_id => b.id, :user_id => u.id, locale: 'es_US')
      UserBoardConnection.create(:board_id => b.id, :user_id => u.id, locale: 'en')
      b.settings['starred_user_ids'] = ["en:1",2,"es_US:2","en-US:3"]
      b.settings['buttons'] = [{}]
      b.settings['translations'] = {'board_name' => {'es_US' => 'a', 'en-US' => 'b'}}
      b.save
      b.generate_stats
      expect(b.settings['stars']).to eq(4)
      expect(b.settings['forks']).to eq(0)
      expect(b.settings['home_uses']).to eq(6)
      expect(b.settings['recent_home_uses']).to eq(6)
      expect(b.settings['uses']).to eq(8)
      expect(b.settings['recent_uses']).to eq(8)
      expect(b.settings['non_author_uses']).to eq(2)
      expect(b.settings['locale_stars']).to eq({'en' => 2, 'en-US' => 1, 'es_US' => 1, 'es' => 1})
      expect(b.settings['locale_home_uses']).to eq({"en"=>4, "en-GB"=>1, "en-US"=>1, "es"=>2, "es_US"=>1})
      expect(b.settings['locale_home_forks']).to eq({})
      expect(b.popularity).to eq(72)
      expect(b.any_upstream).to eq(false)
      expect(b.home_popularity).to eq(58)
      bls = BoardLocale.where(board_id: b.id)
      expect(bls.count).to eq(4)
      expect(bls.map(&:locale).sort).to eq(["en", "en-US", "es", "es_US"])
    end

    it "should generate localized search strings" do
      u = User.create
      u2 = User.create
      u3 = User.create
      b = Board.create(:user => u)
      b.public = true
      UserBoardConnection.create(:board_id => b.id, :home => true, :user_id => u.id, locale: 'en-US')
      UserBoardConnection.create(:board_id => b.id, :home => true, :user_id => u.id, locale: 'en')
      UserBoardConnection.create(:board_id => b.id, :home => true, :user_id => u.id, locale: 'en-GB')
      UserBoardConnection.create(:board_id => b.id, :home => true, :user_id => u2.id, locale: 'en')
      UserBoardConnection.create(:board_id => b.id, :home => true, :user_id => u3.id, locale: 'es')
      UserBoardConnection.create(:board_id => b.id, :home => true, :user_id => u.id, locale: 'es_US')
      UserBoardConnection.create(:board_id => b.id, :user_id => u.id, locale: 'es_US')
      UserBoardConnection.create(:board_id => b.id, :user_id => u.id, locale: 'en')
      b.settings['starred_user_ids'] = ["en:1",2,"es_US:2","en-US:3"]
      b.settings['name'] = 'c'
      b.settings['buttons'] = [{id: '1', label: 'frogs'}, {id: '2', label: 'cheese'}]
      b.settings['translations'] = {
        'board_name' => {'es_US' => 'a', 'en-US' => 'b'},
        '1' => {'es_US' => {'label' => 'frogger'}, 'en' => {'label' => 'frogs'}, 'en-US' => {'label' => 'rather frog'}},
        '2' => {'es' => {'label' => 'cheddar'}, 'es_US' => {'label' => 'cheesy'}}
      }
      b.settings['grid'] =  {'rows' => 1, 'columns' => 2, 'order' => [['1', '2']]}
      b.save
      b.generate_stats
      expect(b.settings['stars']).to eq(4)
      expect(b.settings['forks']).to eq(0)
      expect(b.settings['home_uses']).to eq(6)
      expect(b.settings['recent_home_uses']).to eq(6)
      expect(b.settings['uses']).to eq(8)
      expect(b.settings['recent_uses']).to eq(8)
      expect(b.settings['non_author_uses']).to eq(2)
      expect(b.settings['locale_stars']).to eq({'en' => 2, 'en-US' => 1, 'es_US' => 1, 'es' => 1})
      expect(b.settings['locale_home_uses']).to eq({"en"=>4, "en-GB"=>1, "en-US"=>1, "es"=>2, "es_US"=>1})
      expect(b.settings['locale_home_forks']).to eq({})
      expect(b.popularity).to eq(72)
      expect(b.any_upstream).to eq(false)
      expect(b.home_popularity).to eq(58)
      bls = BoardLocale.where(board_id: b.id)
      expect(bls.count).to eq(4)
      expect(bls.order('id').map(&:locale)).to eq(["en", "es_US", "es", "en-US"])
      expect(bls.order('id').map(&:search_string)).to eq([
        "b b frogs, cheese, #{b.key} b c ",
        "a a frogger, cheesy, #{b.key} a c ",
        "a a frogger, cheddar, #{b.key} a c ",
        "b b rather frog, cheese, #{b.key} b c ",
      ])
      expect(bls.map(&:locale).sort).to eq(["en", "en-US", "es", "es_US"])
    end

    it "should clear board locales for non-public boards" do
      u = User.create
      b = Board.create(:user => u)
      BoardLocale.create(board_id: b.id)
      expect(BoardLocale.where(board_id: b.id).count).to eq(1)
      b.generate_stats
      expect(BoardLocale.where(board_id: b.id).count).to eq(0)
    end
  end

  describe "generate_download" do
    it "should raise if an invalid type is provided" do
      b = Board.new
      expect { b.generate_download(nil, 'bacon', {}) }.to raise_error(Progress::ProgressError, "Unexpected download type, bacon")
    end
    
    it "should raise if conversion fails" do
      b = Board.new
      expect(Converters::Utils).to receive(:board_to_remote).with(b, nil, {
        'file_type' => 'obf', 
        'include' => 'this', 
        'headerless' => false, 
        'text_on_top' => false, 
        'transparent_background' => false,
        'symbol_background' => nil, 
        'text_only' => false,
        'text_case' => nil,
        'font' => nil
      }).and_return(nil)
      expect { b.generate_download(nil, 'obf', {}) }.to raise_error(Progress::ProgressError, "No URL generated")
    end
    
    it "should return the download URL on success" do
      b = Board.new
      expect(Converters::Utils).to receive(:board_to_remote).with(b, nil, {
        'file_type' => 'obf', 
        'include' => 'this', 
        'headerless' => false, 
        'text_on_top' => false, 
        'transparent_background' => false,
        'text_only' => false,
        'text_case' => nil,
        'font' => nil,
        'symbol_background' => nil,
      }).and_return("http://www.file.com")
      expect(b.generate_download(nil, 'obf', {})).to eq({:download_url => "http://www.file.com"})
    end
    
    it "should periodically update progress" do
      b = Board.new
      expect(Converters::Utils).to receive(:board_to_remote).with(b, nil, {
        'file_type' => 'obf', 
        'include' => 'this', 
        'headerless' => false, 
        'text_on_top' => false, 
        'transparent_background' => false,
        'text_only' => false,
        'symbol_background' => nil,
        'text_case' => nil,
        'font' => nil
      }).and_return("http://www.file.com")
      expect(Progress).to receive(:update_current_progress).with(0.03, :generating_files)
      b.generate_download(nil, 'obf', {})
    end
    
    it "should allow an unauthenticated user" do
      b = Board.new
      expect(Converters::Utils).to receive(:board_to_remote).with(b, nil, {
        'file_type' => 'obf', 
        'include' => 'this', 
        'headerless' => false, 
        'text_on_top' => false, 
        'transparent_background' => false,
        'text_only' => false,
        'text_case' => nil,
        'symbol_background' => nil,
        'font' => nil
      }).and_return("http://www.file.com")
      expect(b.generate_download(nil, 'obf', {})).to eq({:download_url => "http://www.file.com"})
    end
  end

  describe "generate_defaults" do
    it "should generate default values" do
      b = Board.new
      b.generate_defaults
      expect(b.settings['name']).to eq('Unnamed Board')
      expect(b.settings['grid']['rows']).to eq(2)
      expect(b.settings['grid']['columns']).to eq(4)
      expect(b.settings['grid']['order']).to eq([[nil, nil, nil, nil], [nil, nil, nil, nil]])
      expect(b.settings['immediately_downstream_board_ids']).to eq([])
      expect(b.search_string).to eq("locale:en root")
      expect(b.settings['image_url']).to eq(Board::DEFAULT_ICON)
    end
    
    it "should not override existing values" do
      b = Board.new
      b.settings = {}
      b.settings['name'] = 'Friends and Romans'
      b.settings['description'] = "A good little board"
      b.settings['grid'] = {}
      b.settings['grid']['rows'] = 3
      b.settings['grid']['columns'] = 5
      b.settings['locale'] = 'es'
      
      b.generate_defaults
      expect(b.settings['name']).to eq('Friends and Romans')
      expect(b.settings['description']).to eq("A good little board")
      expect(b.settings['grid']['rows']).to eq(3)
      expect(b.settings['grid']['columns']).to eq(5)
      expect(b.settings['grid']['order']).to eq([[nil, nil, nil, nil, nil], [nil, nil, nil, nil, nil], [nil, nil, nil, nil, nil]])
      expect(b.settings['immediately_downstream_board_ids']).to eq([])
      expect(b.search_string).to eq("locale:es root")
    end
    
    it "should enforce proper format/dimensions for grid value" do
      b = Board.new
      b.settings = {}
      b.settings['grid'] = {'rows' => 2, 'columns' => 3}
      b.generate_defaults
      expect(b.settings['grid']['order']).to eq([[nil, nil, nil], [nil, nil, nil]])
      
      b.settings['grid'] = {'rows' => 2, 'columns' => 2, 'order' => [[1,2,3,4,5],[2,3,4,5,6],[3,4,5,6,7],[4,5,6,7,8]]}
      b.generate_defaults
      expect(b.settings['grid']['order']).to eq([[1,2],[2,3]])
    end
    
    it "should set immediate_downstream_board_ids" do
      b = Board.new
      b.settings = {}
      b.settings['buttons'] = [
        {'id' => 1},
        {'id' => 2, 'load_board' => {'id' => '12345'}},
        {'id' => 3, 'load_board' => {'id' => '12345'}},
        {'id' => 4, 'load_board' => {'id' => '23456'}}
      ]
      b.generate_defaults
      expect(b.settings['immediately_downstream_board_ids']).to eq(['12345', '23456'])
    end
    
    it "should track a revision if the content has changed" do
      b = Board.new
      b.generate_defaults
      expect(b.settings['revision_hashes'].length).to eq(1)
      expect(b.current_revision).to eq(b.settings['revision_hashes'][-1][0])
      expect(b.settings['revision_hashes'][0][1]).to be > 10.seconds.ago.to_i
      b.generate_defaults
      expect(b.settings['revision_hashes'].length).to eq(2)
      expect(b.current_revision).to eq(b.settings['revision_hashes'][-1][0])
      
      b.settings['buttons'] = [{'id' => 2, 'label' => 'bob'}]
      b.generate_defaults
      expect(b.settings['revision_hashes'].length).to eq(3)
      expect(b.current_revision).to eq(b.settings['revision_hashes'][-1][0])
      b.generate_defaults
      expect(b.settings['revision_hashes'].length).to eq(3)
      expect(b.current_revision).to eq(b.settings['revision_hashes'][-1][0])
      
      b.settings['buttons'] = [{'id' => 2, 'label' => 'bob'}]
      b.generate_defaults
      expect(b.settings['revision_hashes'].length).to eq(3)
      expect(b.current_revision).to eq(b.settings['revision_hashes'][-1][0])
      b.settings['grid']['rows'] = 4
      b.generate_defaults
      expect(b.settings['revision_hashes'].length).to eq(3)
      expect(b.current_revision).to eq(b.settings['revision_hashes'][-1][0])
    end
    
    it "should not clear the search_string for unlisted boards" do
      b = Board.new
      b.settings = {}
      b.settings['name'] = 'Friends and Romans'
      b.settings['description'] = "A good little board"
      b.settings['grid'] = {}
      b.settings['grid']['rows'] = 3
      b.settings['grid']['columns'] = 5
      b.settings['locale'] = 'es'
      b.generate_defaults
      expect(b.search_string).to eq("locale:es root")
      b.settings['unlisted'] = true
      b.generate_defaults
      expect(b.search_string).to eq("locale:es root")
    end

    it "should include all locales in the search string" do
      b = Board.new
      b.settings = {}
      b.settings['name'] = 'Friends and Romans'
      b.settings['description'] = "A good little board"
      b.settings['grid'] = {}
      b.settings['grid']['rows'] = 3
      b.settings['grid']['columns'] = 5
      b.settings['locale'] = 'es'
      b.settings['translations'] = {'board_name' => {'en' => 'assdf', 'fr' => 'qwert'}}
      b.generate_defaults
      expect(b.search_string).to eq("locale:es locale:en locale:fr root")
    end
  end
  
  describe "full_set_revision" do
    it "should push a revision hash change upstream when a new board is created" do
      u = User.create
      b1 = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b1.settings['buttons'] = [{'id' => 1, 'load_board' => {'id' => b2.global_id}, 'label' => 'hair'}]
      b1.instance_variable_set('@buttons_changed', true)
      b1.save
      Worker.process_queues
      Worker.process_queues
      b1.reload.track_downstream_boards!
      expect(b1.reload.settings['downstream_board_ids']).to eq([b2.global_id])
      expect(b2.reload.settings['immediately_upstream_board_ids']).to eq([b1.global_id])
      hash = b1.reload.settings['full_set_revision']
      current_hash = b1.current_revision
      b2.settings['buttons'] = [{'id' => 1, 'label' => 'feet'}]
      b2.instance_variable_set('@buttons_changed', true)
      b2.save
      RemoteAction.process_all
      Worker.process_queues
      Worker.process_queues
      b1.reload.track_downstream_boards!
      expect(b1.reload.settings['full_set_revision']).to_not eq(hash)
      expect(b1.current_revision).to eq(current_hash)
    end
    
    it "should push a revision hash change upstream when a board is modified" do
      u = User.create
      b1 = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b3 = Board.create(:user => u)
      b4 = Board.create(:user => u)
      b1.settings['buttons'] = [{'id' => 1, 'label' => 'cheese', 'load_board' => {'id' => b3.global_id}}]
      b1.instance_variable_set('@buttons_changed', true)
      b1.save
      b2.settings['buttons'] = [{'id' => 1, 'label' => 'cheese', 'load_board' => {'id' => b3.global_id}}]
      b2.instance_variable_set('@buttons_changed', true)
      b2.save
      b3.settings['buttons'] = [{'id' => 3, 'label' => 'chicken', 'load_board' => {'id' => b4.global_id}}]
      b3.instance_variable_set('@buttons_changed', true)
      b3.save
      Worker.process_queues
      expect(b1.reload.settings['downstream_board_ids'].sort).to eq([b3.global_id, b4.global_id])
      expect(b2.reload.settings['downstream_board_ids'].sort).to eq([b3.global_id, b4.global_id])
      expect(b3.reload.settings['downstream_board_ids']).to eq([b4.global_id])
      expect(b3.reload.settings['immediately_upstream_board_ids'].sort).to eq([b1.global_id, b2.global_id])
      expect(b4.reload.settings['immediately_upstream_board_ids'].sort).to eq([b3.global_id])
      rev = b4.current_revision
      hash1 = b1.reload.settings['full_set_revision']
      current1 = b1.current_revision
      hash2 = b2.reload.settings['full_set_revision']
      current2 = b2.current_revision
      hash3 = b3.reload.settings['full_set_revision']
      current3 = b3.current_revision
      b4.settings['buttons'] = [{'id' => 'asdf', 'label' => 'friend'}]
      b4.instance_variable_set('@buttons_changed', true)
      b4.save
      Board.last_scheduled_stamp = nil
      expect(b4.current_revision).to_not eq(rev)
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      b1.reload.track_downstream_boards!
      b2.reload.track_downstream_boards!
      b3.reload.track_downstream_boards!
      expect(b1.reload.settings['full_set_revision']).to_not eq(hash1)
      expect(b1.current_revision).to eq(current1)
      expect(b3.reload.settings['full_set_revision']).to_not eq(hash3)
      expect(b3.current_revision).to eq(current3)
      expect(b2.reload.settings['full_set_revision']).to_not eq(hash2)
      expect(b2.current_revision).to eq(current2)
    end
    
    it "should not push a revision has change downstream" do
      u = User.create
      b1 = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b1.settings['buttons'] = [{'id' => 1, 'label' => 'art', 'load_board' => {'id' => b2.global_id}}]
      b1.instance_variable_set('@buttons_changed', true)
      b1.save
      Worker.process_queues
      expect(b1.reload.settings['downstream_board_ids']).to eq([b2.global_id])
      expect(b2.reload.settings['immediately_upstream_board_ids']).to eq([b1.global_id])
      hash1 = b1.reload.settings['full_set_revision']
      current1 = b1.current_revision
      hash2 = b2.reload.settings['full_set_revision']
      current2 = b2.current_revision
      b1.settings['buttons'] = [{'id' => 1, 'label' => 'artist', 'load_board' => {'id' => b2.global_id}}]
      b1.instance_variable_set('@buttons_changed', true)
      b1.save
      Worker.process_queues
      Worker.process_queues
      b1.reload.track_downstream_boards!
      expect(b1.reload.settings['full_set_revision']).to_not eq(hash1)
      expect(b1.current_revision).to_not eq(current1)
      expect(b2.reload.settings['full_set_revision']).to eq(hash2)
      expect(b2.current_revision).to eq(current2)
    end
    
    it "should update for an unlinked board when it is modified" do
      u = User.create
      b = Board.create(:user => u)
      hash = b.full_set_revision
      current = b.current_revision
      b.settings['buttons'] = [{'id' => 1, 'label' => 'choker'}]
      b.instance_variable_set('@buttons_changed', true)
      b.save
      Worker.process_queues
      b.reload
      expect(b.full_set_revision).to_not eq(hash)
      expect(b.current_revision).to_not eq(current)
    end

    it "should update upstream boards when a shallow clone is edited" do
      u = User.create
      b1 = Board.create(:user => u, public: true)
      b2 = Board.create(:user => u, public: true)
      b1.settings['buttons'] = [{'id' => 1, 'label' => 'art', 'load_board' => {'id' => b2.global_id}}]
      b1.instance_variable_set('@buttons_changed', true)
      b1.save
      Worker.process_queues
      expect(b1.reload.settings['downstream_board_ids']).to eq([b2.global_id])
      expect(b2.reload.settings['immediately_upstream_board_ids']).to eq([b1.global_id])
      bb2 = Board.find_by_global_id("#{b2.global_id}-#{u.global_id}")
      b2c = bb2.copy_for(u)
      Worker.process_queues
      b1.reload
      bb1 = Board.find_by_global_id("#{b1.global_id}-#{u.global_id}")
      reva = bb1.full_set_revision
      expect(reva).to_not eq(b1.full_set_revision)
      b2c.settings['buttons'] = [{'id' => 1, 'label' => 'cart'}]
      b2c.instance_variable_set('@buttons_changed', true)
      b2c.save
      Worker.process_queues
      expect(bb1.reload.full_set_revision).to_not eq(reva)
    end
  end

  describe "labels" do
    it "should grab a list of labels using the grid of buttons from left to right" do
      b = Board.new
      b.settings = {}
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'a'},
        {'id' => 2, 'label' => 'b'},
        {'id' => 3, 'label' => 'c'}
      ]
      b.settings['grid'] = {
        'rows' => 2,
        'columns' => 4,
        'order' => [
          [1, 1, nil, nil],
          [2, 1, 3, nil]
        ]
      }
      expect(b.labels).to eq("a, b, a, a, c")
    end
  end

  describe "images_and_sounds_for" do
    it "should return a cached value if there is one" do
      b = Board.new
      expect(b).to receive(:get_cached).with('images_and_sounds_for/nobody').and_return({a: 1})
      expect(b.images_and_sounds_for(nil)).to eq({a: 1})

      u = User.create
      expect(b).to receive(:get_cached).with("images_and_sounds_for/#{u.cache_key}").and_return({b: 1})
      expect(b.images_and_sounds_for(u)).to eq({b: 1})
    end

    it "should call cached_copy_urls to check for cached urls" do
      b = Board.new
      expect(b).to receive(:get_cached).with('images_and_sounds_for/nobody').and_return(nil)
      expect(ButtonImage).to receive(:cached_copy_urls).with([], nil, nil, [])
      b.images_and_sounds_for(nil)
    end

    it "should map images and sounds to json and return the result" do
      u = User.create
      User.purchase_extras({'premium_symbols' => true, 'user_id' => u.global_id})
      u.reload
      u.settings['preferences']['preferred_symbols'] = 'original'
      u.save!
      b = Board.create(user: u)
      b.settings['buttons'] = [{'sound_id' => 'asdf'}]
      expect(b).to receive(:get_cached).with("images_and_sounds_for/#{u.cache_key}").and_return(nil)
      bi1 = ButtonImage.create(user: u, board: b, settings: {'protected' => true, 'protected_source' => 'pcs'}, url: 'http://www.example.com')
      bi2 = ButtonImage.create(user: u, board: b, settings: {'protected' => true, 'protected_source' => 'abs'}, url: 'http://www.example.com')
      bs1 = ButtonSound.create(user: u, board: b)
      expect(b).to receive(:known_button_images).and_return([bi1, bi2])
      expect(b).to receive(:known_button_sounds).and_return([bs1])
      expect(JsonApi::Image).to receive(:as_json).with(bi1, :allowed_sources => ['lessonpix', 'pcs', 'symbolstix'], :include_other_sources => false, :preferred_source => 'original').and_return({'bi1' => true})
      expect(JsonApi::Image).to receive(:as_json).with(bi2, :allowed_sources => ['lessonpix', 'pcs', 'symbolstix'], :include_other_sources => false, :preferred_source => 'original').and_return({'bi2' => true})
      expect(JsonApi::Sound).to receive(:as_json).with(bs1).and_return({'bs1' => true})
      expect(b.images_and_sounds_for(u)).to eq({
        'images' => [
          {'bi1' => true}, {'bi2' => true}
        ],
        'sounds' => [
          {'bs1' => true}
        ]
      })
    end

    it "should cache the result" do
      u = User.create
      User.purchase_extras({'premium_symbols' => true, 'user_id' => u.global_id})
      u.reload
      u.settings['preferences']['preferred_symbols'] = 'original'
      u.save!
      b = Board.create(user: u)
      b.settings['buttons'] = [{'sound_id' => 'asdf'}]
      expect(b).to receive(:get_cached).with("images_and_sounds_for/#{u.cache_key}").and_return(nil)
      bi1 = ButtonImage.create(user: u, board: b, settings: {'protected' => true, 'protected_source' => 'pcs'}, url: 'http://www.example.com')
      bi2 = ButtonImage.create(user: u, board: b, settings: {'protected' => true, 'protected_source' => 'abs'}, url: 'http://www.example.com')
      bs1 = ButtonSound.create(user: u, board: b)
      expect(b).to receive(:known_button_images).and_return([bi1, bi2])
      expect(b).to receive(:known_button_sounds).and_return([bs1])
      expect(JsonApi::Image).to receive(:as_json).with(bi1, :allowed_sources => ['lessonpix', 'pcs', 'symbolstix'], :include_other_sources => false, :preferred_source => 'original').and_return({'bi1' => true})
      expect(JsonApi::Image).to receive(:as_json).with(bi2, :allowed_sources => ['lessonpix', 'pcs', 'symbolstix'], :include_other_sources => false, :preferred_source => 'original').and_return({'bi2' => true})
      expect(JsonApi::Sound).to receive(:as_json).with(bs1).and_return({'bs1' => true})
      # expect(b).to receive(:set_cached).with("images_and_sounds_for/#{u.cache_key}", {"images"=>[{"bi1"=>true}, {"bi2"=>true}], "sounds"=>[{"bs1"=>true}]})
      expect(b.images_and_sounds_for(u)).to eq({
        'images' => [
          {'bi1' => true}, {'bi2' => true}
        ],
        'sounds' => [
          {'bs1' => true}
        ]
      })
    end

    it "should only return allowed protected sources" do
      u = User.create
      User.purchase_extras({'premium_symbols' => true, 'user_id' => u.global_id})
      u.reload
      u.settings['preferences']['preferred_symbols'] = 'original'
      u.save!
      b = Board.create(user: u)
      b.settings['buttons'] = [{'sound_id' => 'asdf'}]
      b.save
      expect(b).to receive(:get_cached).with("images_and_sounds_for/#{u.cache_key}").and_return(nil)
      bi1 = ButtonImage.create(user: u, board: b, settings: {'protected' => true, 'protected_source' => 'pcs'}, url: 'http://www.example.com')
      bi2 = ButtonImage.create(user: u, board: b, settings: {'protected' => true, 'protected_source' => 'abs'}, url: 'http://www.example.com')
      bs1 = ButtonSound.create(user: u, board: b)
      expect(b).to receive(:known_button_images).and_return([bi1, bi2])
      expect(b).to receive(:known_button_sounds).and_return([bs1])
      expect(JsonApi::Image).to receive(:as_json).with(bi1, :allowed_sources => ['lessonpix', 'pcs', 'symbolstix'], :include_other_sources => false, :preferred_source => 'original').and_return({'bi1' => true})
      expect(JsonApi::Image).to receive(:as_json).with(bi2, :allowed_sources => ['lessonpix', 'pcs', 'symbolstix'], :include_other_sources => false, :preferred_source => 'original').and_return({'bi2' => true})
      expect(JsonApi::Sound).to receive(:as_json).with(bs1).and_return({'bs1' => true})
      # expect(b).to receive(:set_cached).with("images_and_sounds_for/#{u.cache_key}", {"images"=>[{"bi1"=>true}, {"bi2"=>true}], "sounds"=>[{"bs1"=>true}]})
      expect(b.images_and_sounds_for(u)).to eq({
        'images' => [
          {'bi1' => true}, {'bi2' => true}
        ],
        'sounds' => [
          {'bs1' => true}
        ]
      })
    end

    it "should draw from the button list if not mapped yet" do
      u = User.create
      User.purchase_extras({'premium_symbols' => true, 'user_id' => u.global_id})
      u.reload
      u.settings['preferences']['preferred_symbols'] = 'original'
      u.save!
      b = Board.create(user: u)
      bi1 = ButtonImage.create(user: u, board: b, settings: {'protected' => true, 'protected_source' => 'pcs'}, url: 'http://www.example.com')
      bi2 = ButtonImage.create(user: u, board: b, settings: {'protected' => true, 'protected_source' => 'abs'}, url: 'http://www.example.com')
      bs1 = ButtonSound.create(user: u, board: b)
      b.settings['buttons'] = [
        {'id' => 'a', 'image_id' => bi1.global_id, 'sound_id' => 'asdf'},
        {'id' => 'b', 'image_id' => bi2.global_id, 'sound_id' => bs1.global_id}
      ]
      b.instance_variable_set('@map_later', true)
      expect(b.settings['images_not_mapped']).to eq(nil)
      b.save
      expect(b.settings['images_not_mapped']).to eq(true)
      expect(b).to receive(:get_cached).with("images_and_sounds_for/#{u.cache_key}").and_return(nil)
      expect(b.known_button_images).to eq([bi1, bi2])
      expect(b.button_sounds).to eq([])
      expect(b.known_button_sounds).to eq([bs1])
      expect(JsonApi::Image).to receive(:as_json).with(bi1, :allowed_sources => ['lessonpix', 'pcs', 'symbolstix'], :include_other_sources => false, :preferred_source => 'original').and_return({'bi1' => true})
      expect(JsonApi::Image).to receive(:as_json).with(bi2, :allowed_sources => ['lessonpix', 'pcs', 'symbolstix'], :include_other_sources => false, :preferred_source => 'original').and_return({'bi2' => true})
      expect(JsonApi::Sound).to receive(:as_json).with(bs1).and_return({'bs1' => true})
      # expect(b).to receive(:set_cached).with("images_and_sounds_for/#{u.cache_key}", {"images"=>[{"bi1"=>true}, {"bi2"=>true}], "sounds"=>[{"bs1"=>true}]})
      expect(b.images_and_sounds_for(u)).to eq({
        'images' => [
          {'bi1' => true}, {'bi2' => true}
        ],
        'sounds' => [
          {'bs1' => true}
        ]
      })
    end

    it "should allow protected sources used by supervisees" do
      u = User.create
      u2 = User.create
      User.link_supervisor_to_user(u, u2)
      User.purchase_extras({'premium_symbols' => true, 'user_id' => u2.global_id})
      u.reload
      u2.reload
      u.settings['preferences']['preferred_symbols'] = 'original'
      u.save!

      b = Board.create(user: u)
      expect(b).to receive(:get_cached).with("images_and_sounds_for/#{u.cache_key}").and_return(nil)
      bi1 = ButtonImage.create(user: u, board: b, settings: {'protected' => true, 'protected_source' => 'pcs'}, url: 'http://www.example.com')
      bi2 = ButtonImage.create(user: u, board: b, settings: {'protected' => true, 'protected_source' => 'abs'}, url: 'http://www.example.com')
      bi3 = ButtonImage.create(user: u, board: b, settings: {'protected' => true, 'protected_source' => 'cheese'}, url: 'http://www.example.com')
      expect(b).to receive(:known_button_images).and_return([bi1, bi2, bi3])
      expect(JsonApi::Image).to receive(:as_json).with(bi1, :allowed_sources => ['lessonpix', 'pcs', 'symbolstix'], :include_other_sources => true, :preferred_source => 'original').and_return({'bi1' => true})
      expect(JsonApi::Image).to receive(:as_json).with(bi2, :allowed_sources => ['lessonpix', 'pcs', 'symbolstix'], :include_other_sources => true, :preferred_source => 'original').and_return({'bi2' => true})
      expect(JsonApi::Image).to receive(:as_json).with(bi3, :allowed_sources => ['lessonpix', 'pcs', 'symbolstix'], :include_other_sources => true, :preferred_source => 'original').and_return({'bi3' => true})
      # expect(b).to receive(:set_cached).with("images_and_sounds_for/#{u.cache_key}", {"images"=>[{"bi1"=>true}, {"bi2"=>true}, {'bi3' => true}], "sounds"=>[]})
      expect(b.images_and_sounds_for(u)).to eq({
        'images' => [
          {'bi1' => true}, {'bi2' => true}, {'bi3' => true}
        ],
        'sounds' => []
      })
    end
  end

  describe "current_revision" do
    it "should return the current_revision attribute if set, otherwise retrieve it from settings" do
       b = Board.new
       expect(b.current_revision).to eq(nil)
       
       b.current_revision = 'asdfhjk'
       expect(b.current_revision).to eq('asdfhjk')
       
       b.current_revision = nil
       b.settings = {'revision_hashes' => [['qwert']]}
       expect(b.current_revision).to eq('qwert')
    end
  end

  describe "populate_buttons_from_labels" do
    it "should add new buttons with the specified labels" do
      b = Board.new
      b.generate_defaults
      b.settings['buttons'] = [{'id' => 4}]
      b.populate_buttons_from_labels("a,b,c,d,e\nf,g\nbacon and eggs,t,q", 'columns')
      expect(b.settings['buttons'][1]).to eq({'id' => 5, 'label' => "a", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['buttons'][2]).to eq({'id' => 6, 'label' => "b", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['buttons'][3]).to eq({'id' => 7, 'label' => "c", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['buttons'][4]).to eq({'id' => 8, 'label' => "d", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['buttons'][5]).to eq({'id' => 9, 'label' => "e", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['buttons'][6]).to eq({'id' => 10, 'label' => "f", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['buttons'][7]).to eq({'id' => 11, 'label' => "g", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['buttons'][8]).to eq({'id' => 12, 'label' => "bacon and eggs", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['buttons'][9]).to eq({'id' => 13, 'label' => "t", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['buttons'][10]).to eq({'id' => 14, 'label' => "q", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['grid']['order']).to eq([[5, 7, 9, 11], [6, 8, 10, 12]])
    end

    it "should add new buttons with the specified labels in row-first order" do
      b = Board.new
      b.generate_defaults
      b.settings['buttons'] = [{'id' => 4}]
      b.populate_buttons_from_labels("a,b,c,d,e\nf,g\nbacon and eggs,t,q", 'rows')
      expect(b.settings['buttons'][1]).to eq({'id' => 5, 'label' => "a", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['buttons'][2]).to eq({'id' => 6, 'label' => "b", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['buttons'][3]).to eq({'id' => 7, 'label' => "c", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['buttons'][4]).to eq({'id' => 8, 'label' => "d", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['buttons'][5]).to eq({'id' => 9, 'label' => "e", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['buttons'][6]).to eq({'id' => 10, 'label' => "f", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['buttons'][7]).to eq({'id' => 11, 'label' => "g", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['buttons'][8]).to eq({'id' => 12, 'label' => "bacon and eggs", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['buttons'][9]).to eq({'id' => 13, 'label' => "t", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['buttons'][10]).to eq({'id' => 14, 'label' => "q", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['grid']['order']).to eq([[5, 6, 7, 8], [9, 10, 11, 12]])
    end
    
    it "should put the new button in its proper location on the grid if there is one" do
      b = Board.new
      b.generate_defaults
      b.settings['buttons'] = [{'id' => 4}]
      b.populate_buttons_from_labels("a,b,c,d,e\nf,g\nbacon and eggs,t,q", 'columns')
      expect(b.settings['grid']['order']).to eq([[5, 7, 9, 11],[6, 8, 10, 12]])
    end

    it "should work for boards with board_content" do
      u = User.create
      b = Board.new(user: u)
      bc = BoardContent.new(settings: {})
      bc.settings['buttons'] = [{'id' => 4}]
      bc.save
      b.board_content = bc
      b.generate_defaults
      expect(b.settings['buttons']).to eq([])
      b.populate_buttons_from_labels("a,b,c,d,e\nf,g\nbacon and eggs,t,q", 'columns')
      expect(b.settings['buttons'][0]).to eq({'id' => 4})
      expect(b.settings['buttons'][1]).to eq({'id' => 5, 'label' => "a", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['buttons'][2]).to eq({'id' => 6, 'label' => "b", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['buttons'][3]).to eq({'id' => 7, 'label' => "c", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['buttons'][4]).to eq({'id' => 8, 'label' => "d", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['buttons'][5]).to eq({'id' => 9, 'label' => "e", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['buttons'][6]).to eq({'id' => 10, 'label' => "f", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['buttons'][7]).to eq({'id' => 11, 'label' => "g", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['buttons'][8]).to eq({'id' => 12, 'label' => "bacon and eggs", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['buttons'][9]).to eq({'id' => 13, 'label' => "t", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['buttons'][10]).to eq({'id' => 14, 'label' => "q", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['grid']['order']).to eq([[5, 7, 9, 11], [6, 8, 10, 12]])
      b.save
      b.reload
      expect(b.settings['buttons'].blank?).to eq(true)
      expect(bc.settings['buttons'].length).to be >= 1
      expect(b.settings['content_overrides']).to_not eq(nil)
      expect(b.buttons[0]).to eq({'id' => 4})
      expect(b.buttons[1]).to eq({'id' => 5, 'label' => "a", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.buttons[2]).to eq({'id' => 6, 'label' => "b", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.buttons[3]).to eq({'id' => 7, 'label' => "c", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.buttons[4]).to eq({'id' => 8, 'label' => "d", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.buttons[5]).to eq({'id' => 9, 'label' => "e", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.buttons[6]).to eq({'id' => 10, 'label' => "f", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.buttons[7]).to eq({'id' => 11, 'label' => "g", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.buttons[8]).to eq({'id' => 12, 'label' => "bacon and eggs", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.buttons[9]).to eq({'id' => 13, 'label' => "t", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.buttons[10]).to eq({'id' => 14, 'label' => "q", 'suggest_symbol' => true, 'hidden' => false, 'hide_label' => false})
      expect(b.settings['grid']['order']).to eq([[5, 7, 9, 11], [6, 8, 10, 12]])
    end
  end
  
  describe "private boards" do
    it "should allow making a private board public without a premium user account" do
      u = User.create(:expires_at => 3.days.ago)
      b = Board.create(:user => u, :public => false)
      expect { b.process({:public => true}, {:user => u}) }.to_not raise_error
    end
    
    it "should allow creating a public board without a premium user account" do
      u = User.create(:expires_at => 3.days.ago)
      expect { Board.process_new({:public => true}, {:user => u}) }.to_not raise_error
    end
    
    it "should allow updating a private board without a premium user account" do
      u = User.create(:expires_at => 3.days.ago)
      b = Board.create(:user => u, :public => false)
      expect { b.process({:title => "ok"}, {:user => u}) }.to_not raise_error
      expect { b.process({:public => false}, {:user => u}) }.to_not raise_error
    end
    
    it "should allow premium users to create and update private boards" do
      u = User.create
      expect(u.any_premium_or_grace_period?).to eq(true)
      expect { Board.process_new({:public => false}, {:user => u}) }.to_not raise_error
      b = Board.create(:user => u, :public => true)
      expect { b.process({:public => false}, {:user => u}) }.to_not raise_error
    end
  end

  describe "post processing" do
    it "should call map images" do
      u = User.create
      b = Board.new(:user => u)
      expect(b).to receive(:map_images)
      b.save
    end
    
    it "should schedule downstream tracking only if specified" do
      u = User.create
      b = Board.new(:user => u)
      b.save
      expect(RemoteAction.where(path: b.global_id, action: 'track_downstream_with_visited').count).to eq(1)
      RemoteAction.process_all
      RemoteAction.delete_all
      expect(Worker.scheduled_for?(:slow, Board, 'perform_action', {'id' => b.id, 'method' => 'track_downstream_with_visited', 'arguments' => []})).to eq(true)
      Worker.flush_queues
      b.instance_variable_set('@track_downstream_boards', false)
      b.save
      expect(RemoteAction.where(path: b.global_id, action: 'track_downstream_with_visited').count).to eq(0)
      Worker.flush_queues
      b.instance_variable_set('@buttons_changed', true)
      b.instance_variable_set('@button_links_changed', true)
      b.save
      expect(RemoteAction.where(path: b.global_id, action: 'track_downstream_with_visited').count).to eq(1)
      RemoteAction.process_all
      RemoteAction.delete_all
      expect(Worker.scheduled_for?(:slow, Board, 'perform_action', {'id' => b.id, 'method' => 'track_downstream_with_visited', 'arguments' => []})).to eq(true)
      Worker.flush_queues
      
      b.instance_variable_set('@track_downstream_boards', true)
      b.save
      expect(RemoteAction.where(path: b.global_id, action: 'track_downstream_with_visited').count).to eq(1)
      RemoteAction.process_all
      RemoteAction.delete_all
      expect(Worker.scheduled_for?(:slow, Board, 'perform_action', {'id' => b.id, 'method' => 'track_downstream_with_visited', 'arguments' => []})).to eq(true)
    end
  end
  
  describe "board changed notifications" do
    it "should alert connected users when the board changes" do
      u = User.create
      b = Board.create(:user => u)
      u.settings['preferences']['home_board'] = {'id' => b.global_id, 'key' => b.key }
      u.save
      
      expect(b).to receive(:notify) do |key, hash|
        expect(key).to eq('board_buttons_changed')
        expect(hash['revision']).not_to eq(nil)
      end
      b.process({'buttons' => [
        {'id' => 1},
        {'id' => 2, 'load_board' => {'id' => '12345'}},
        {'id' => 3, 'load_board' => {'id' => '12345'}},
        {'id' => 4, 'load_board' => {'id' => '23456'}}
      ]})
    end

    it "should add to the user's notification list when the board changes" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      u.settings['preferences']['home_board'] = {'id' => b.global_id, 'key' => b.key }
      u.save
      Worker.process_queues
      
      b.settings['buttons'] = [
        {'id' => 1},
        {'id' => 2, 'load_board' => {'id' => '12345'}},
        {'id' => 3, 'load_board' => {'id' => '12345'}},
        {'id' => 4, 'load_board' => {'id' => '23456'}}
      ]
      b.instance_variable_set('@buttons_changed', true)
      b.save
      Worker.process_queues

      expect(u.reload.settings['user_notifications'].length).to eq(1)
      expect(u.reload.settings['user_notifications'][0].except('occurred_at', 'added_at')).to eq({
        'id' => b.global_id,
        'type' => 'board_buttons_changed',
        'for_user' => true,
        'for_supervisees' => [],
        'previous_revision' => b.settings['revision_hashes'][-2][0],
        'name' => b.settings['name'],
        'key' => b.key,
      })
      expect(u.settings['user_notifications'][0]['occurred_at']).to be > (b.reload.updated_at - 5).iso8601
      expect(u.settings['user_notifications'][0]['occurred_at']).to be < (b.reload.updated_at + 5).iso8601
      expect(u.settings['user_notifications'][0]['added_at']).to be > (Time.now.utc - 5).iso8601
      expect(u.settings['user_notifications'][0]['added_at']).to be < (Time.now.utc + 5).iso8601
      expect(u2.reload.settings['user_notifications']).to eq(nil)
    end
    
    it "should alert supervisors of connected users when the board changes" do
      u = User.create
      u2 = User.create
      u3 = User.create
      User.link_supervisor_to_user(u3, u)
      b = Board.create(:user => u)
      u.settings['preferences']['home_board'] = {'id' => b.global_id, 'key' => b.key }
      u.save
      Worker.process_queues
      
      b.settings['buttons'] = [
        {'id' => 1},
        {'id' => 2, 'load_board' => {'id' => '12345'}},
        {'id' => 3, 'load_board' => {'id' => '12345'}},
        {'id' => 4, 'load_board' => {'id' => '23456'}}
      ]
      b.instance_variable_set('@buttons_changed', true)
      b.save
      Worker.process_queues

      expect(u.reload.settings['user_notifications'].length).to eq(1)
      expect(u.reload.settings['user_notifications'][0].except('occurred_at', 'added_at')).to eq({
        'id' => b.global_id,
        'type' => 'board_buttons_changed',
        'for_user' => true,
        'for_supervisees' => [],
        'previous_revision' => b.settings['revision_hashes'][-2][0],
        'name' => b.settings['name'],
        'key' => b.key
      })
      expect(u2.reload.settings['user_notifications']).to eq(nil)
      expect(u3.reload.settings['user_notifications'].length).to eq(1)
      expect(u3.reload.settings['user_notifications'][0].except('occurred_at', 'added_at')).to eq({
        'id' => b.global_id,
        'type' => 'board_buttons_changed',
        'for_user' => false,
        'for_supervisees' => [u.user_name],
        'previous_revision' => b.settings['revision_hashes'][-2][0],
        'name' => b.settings['name'],
        'key' => b.key,
      })
    end
    
    it "should not schedule track_boards when notifying users of board changes" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      u.settings['preferences']['home_board'] = {'id' => b.global_id, 'key' => b.key }
      u.save
      Worker.process_queues
      Worker.process_queues

      b.settings['buttons'] = [
        {'id' => 1},
        {'id' => 2, 'load_board' => {'id' => '12345'}},
        {'id' => 3, 'load_board' => {'id' => '12345'}},
        {'id' => 4, 'load_board' => {'id' => '23456'}}
      ]
      b.instance_variable_set('@buttons_changed', true)
      b.save
      expect(Worker.scheduled_for?(:slow, User, :perform_action, {'id' => u.id, 'method' => 'track_boards', 'arguments' => [true]})).to eq(false)
      expect(Worker.scheduled_for?(:slow, User, :perform_action, {'id' => u2.id, 'method' => 'track_boards', 'arguments' => [true]})).to eq(false)
      Worker.process_queues
      expect(Worker.scheduled_for?(:slow, User, :perform_action, {'id' => u.id, 'method' => 'track_boards', 'arguments' => [true]})).to eq(false)
      expect(Worker.scheduled_for?(:slow, User, :perform_action, {'id' => u2.id, 'method' => 'track_boards', 'arguments' => [true]})).to eq(false)

      expect(u.reload.settings['user_notifications'].length).to eq(1)
      expect(u2.reload.settings['user_notifications']).to eq(nil)
    end
    
    it "should not alert when the board buttons haven't actually changed" do
      u = User.create
      b = Board.create(:user => u)
      expect(b).not_to receive(:notify)
      u.settings['preferences']['home_board'] = {'id' => b.global_id, 'key' => b.key }
      u.save
      
      b.process({})
    end
  end

  describe "require_key" do
    it "should fail if no user is provided" do
      b = Board.new
      expect { b.require_key }.to raise_error("user required")
    end
    
    it "should generate a key if none is provided" do
      u = User.create
      b = Board.new(:user => u)
      b.require_key
      expect(b.key).to match(/\A[^\/]+\/board\z/)
      
      b.key = nil
      b.settings = {'name' => 'alfalfa'}
      b.require_key
      expect(b.key).to match(/\A[^\/]+\/alfalfa\z/)
    end
    
    it "shouldn't call generate_key if key is already set" do
      b = Board.new
      b.key = 'qwert'
      expect(b).not_to receive(:generate_key)
      b.require_key
    end
  end

  describe "cached_user_name" do
    it "should return the name part of the board key, if available" do
      b = Board.new
      expect(b.cached_user_name).to eq(nil)
      b.key = "asdf"
      expect(b.cached_user_name).to eq('asdf')
      b.key = "user/bacon"
      expect(b.cached_user_name).to eq("user")
    end
  end
  
  describe "process_buttons" do
    it "should update the buttons settings attribute" do
      b = Board.new
      b.settings ||= {}
      b.process_buttons([
        {'id' => '1_2', 'label' => 'hat'}
      ], nil)
      expect(b.settings['buttons']).not_to eq(nil)
      expect(b.settings['buttons'].length).to eq(1)
      expect(b.settings['buttons'][0]).to eq({
        'id' => '1_2',
        'label' => 'hat',
        'hidden' => false,
        'hide_label' => false,
        'text_only' => false
      })
    end
    
    it "should filter out unexpected options" do
      b = Board.new
      b.settings ||= {}
      b.process_buttons([
        {'id' => '1_2', 'label' => 'hat', 'hidden' => true, 'chicken' => '1234'}
      ], nil)
      expect(b.settings['buttons']).not_to eq(nil)
      expect(b.settings['buttons'].length).to eq(1)
      expect(b.settings['buttons'][0]).to eq({
        'id' => '1_2',
        'label' => 'hat',
        'hidden' => true,
        'hide_label' => false,
        'text_only' => false
      })
    end
    
    it "should remember link_disabled for only appropriate button types" do
      u1 = User.create
      b1 = Board.create!(:user => u1)
      b = Board.new
      b.settings ||= {}
      b.process_buttons([
        {'id' => '1_2', 'label' => 'hat', 'link_disabled' => true, 'chicken' => '1234'},
        {'id' => '1_3', 'label' => 'hat', 'link_disabled' => true, 'chicken' => '1234', 'url' => 'http://www.example.com'},
        {'id' => '1_4', 'label' => 'hat', 'link_disabled' => true, 'load_board' => {'id' => b1.global_id, 'key' => b1.key}},
        {'id' => '1_5', 'label' => 'hat', 'link_disabled' => true, 'chicken' => '1234', 'apps' => {}},
      ], u1)
      expect(b.settings['buttons']).not_to eq(nil)
      expect(b.settings['buttons'].length).to eq(4)
      expect(b.settings['buttons'][0]).to eq({
        'id' => '1_2',
        'label' => 'hat',
        'hidden' => false,
        'hide_label' => false,
        'text_only' => false
      })
      expect(b.settings['buttons'][1]).to eq({
        'id' => '1_3',
        'label' => 'hat',
        'link_disabled' => true,
        'url' => 'http://www.example.com',
        'hidden' => false,
        'hide_label' => false,
        'text_only' => false
      })
      expect(b.settings['buttons'][2]).to eq({
        'id' => '1_4',
        'label' => 'hat',
        'link_disabled' => true,
        'load_board' => {'id' => b1.global_id, 'key' => b1.key},
        'hidden' => false,
        'hide_label' => false,
        'text_only' => false
      })
      expect(b.settings['buttons'][3]).to eq({
        'id' => '1_5',
        'label' => 'hat',
        'link_disabled' => true,
        'apps' => {},
        'hidden' => false,
        'hide_label' => false,
        'text_only' => false
      })
    end
    
    it "should set @buttons_changed only if one or more buttons has changed" do
      b = Board.new
      b.settings ||= {}
      b.process_buttons([
        {'id' => '1_2', 'label' => 'hat', 'hidden' => true, 'chicken' => '1234'}
      ], nil)
      expect(b.settings['buttons']).not_to eq(nil)
      expect(b.settings['buttons'].length).to eq(1)
      expect(!!b.instance_variable_get('@buttons_changed')).to eq(true)
      b.instance_variable_set('@buttons_changed', false)
      b.process_buttons([
        {'id' => '1_2', 'label' => 'hat', 'hidden' => true, 'chicken' => '1234'}
      ], nil)
      expect(b.instance_variable_get('@buttons_changed')).to eq(false)
    end
    
    it "should check access permission for any newly-added linked boards" do
      u1 = User.create
      b1 = Board.create!(:user => u1)
      u2 = User.create
      b2 = Board.create!(:user => u2)
      u3 = User.create
      b3 = Board.create!(:user => u3)
      
      b = Board.new
      b.settings = {
        'buttons' => [
          {'id' => '1_1', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}
        ]
      }
      b.process_buttons([
        {'id' => '1_1', 'label' => 'hat', 'load_board' => {'id' => b1.global_id, 'key' => b1.key}},
        {'id' => '1_2', 'label' => 'cat', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}},
        {'id' => '1_3', 'label' => 'fat', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}
      ], u1)
      expect(b.settings['buttons']).not_to eq(nil)
      expect(b.settings['buttons'].length).to eq(3)
      expect(b.settings['buttons'][0]['id']).to eq('1_1')
      expect(b.settings['buttons'][0]['load_board']).not_to eq(nil)
      expect(b.settings['buttons'][1]['id']).to eq('1_2')
      expect(b.settings['buttons'][1]['load_board']).to eq(nil)
      expect(b.settings['buttons'][2]['id']).to eq('1_3')
      expect(b.settings['buttons'][2]['load_board']).not_to eq(nil)
    end
    
    it "should process translations from buttons" do
      b = Board.new
      b.settings ||= {}
      b.process_buttons([
        {'id' => '1_2', 'label' => 'hat', 'hidden' => true, 'chicken' => '1234', 'inflections' => ['b', 'c'], 'translations' => [
          {'locale' => 'en', 'label' => 'hat'},
          {'locale' => 'es', 'label' => 'hatzy', 'vocalization' => 'hatz', 'inflections' => ['a']}
        ]}
      ], nil)
      expect(b.settings['buttons']).not_to eq(nil)
      expect(b.settings['buttons'].length).to eq(1)
      expect(b.settings['buttons'][0]['inflections']).to eq(nil)
      expect(b.settings['translations']).to eq({
        '1_2' => {
          'en' => {
            'label' => 'hat'
          },
          'es' => {
            'label' => 'hatzy',
            'vocalization' => 'hatz',
            'inflections' => ['a']
          }
        }
      })
    end

    it "should process translations from the translations hash" do
      b = Board.new
      b.settings ||= {}
      b.process_buttons([
        {'id' => '1_2', 'label' => 'hat', 'hidden' => true, 'chicken' => '1234'}
      ], nil, nil, {
        '1_2' => [
          {'locale' => 'en', 'label' => 'hat'},
          {'locale' => 'es', 'label' => 'hatzy', 'vocalization' => 'hatz'}
        ]
      })
      expect(b.settings['buttons']).not_to eq(nil)
      expect(b.settings['buttons'].length).to eq(1)
      expect(b.settings['translations']).to eq({
        '1_2' => {
          'en' => {
            'label' => 'hat'
          },
          'es' => {
            'label' => 'hatzy',
            'vocalization' => 'hatz'
          }
        }
      })
    end

    it "should clear accidental language switches if there was no real content set for the new language" do
      u = User.create
      b = Board.create(user: u)
      b.process({'buttons' => [
        {'id' => '1_2', 'label' => 'hat', 'hidden' => true, 'chicken' => '1234'}
      ], 'locale' => 'en', 'name' => 'awesome board', 'translations' => {}})
      expect(b.settings['translations']).to eq({
        'board_name' => {'en' => 'awesome board'},
        'current_label' => 'en',
        'current_vocalization' => 'en',
        'default' => nil
      })
      expect(b.settings['locale']).to eq('en')
      b.process({'locale' => 'en_US', 'translations'=> {}})
      expect(b.settings['translations']).to eq({
        'board_name' => {'en_US' => 'awesome board'},
        'current_label' => 'en_US',
        'current_vocalization' => 'en_US',
        'default' => nil
      })
      expect(b.settings['locale']).to eq('en_US')
      b.process({'locale' => 'en', 'translations'=> {}})
      expect(b.settings['locale']).to eq('en')
      expect(b.settings['translations']).to eq({
        'board_name' => {'en' => 'awesome board'},
        'current_label' => 'en',
        'current_vocalization' => 'en',
        'default' => nil
      })
    end
  end

  describe "process_params" do
    it "should raise an error unless a user is provided" do
      b = Board.new
      expect { b.process_params({}, {}) }.to raise_error("user required as board author")
      u = User.create
      expect { b.process_params({}, {:user => u}) }.to_not raise_error
      
      expect(b.user).not_to eq(nil)
      expect { b.process_params({}, {}) }.to_not raise_error
    end
    
    it "should ignore non-sent parameters" do
      u = User.create
      b = Board.new(:user => u)
      b.process_params({}, {})
      expect(b.settings['name']).to eq(nil)
      expect(b.settings['buttons']).to eq(nil)
      expect(b.key).to eq(nil)
    end
    
    it "should set last_updated" do
      u = User.create
      b = Board.new(:user => u)
      b.process_params({}, {})
      expect(b.settings['last_updated']).to eq(Time.now.iso8601)
    end

    it "should not set name column" do
      u = User.create
      b = Board.new(:user => u)
      b.process_params({'name' => 'bacon cheese'}, {})
      expect(b.name).to eq(nil)
      expect(b.settings['name']).to eq('bacon cheese')
    end

    it "should process copy_key" do
      u = User.create
      u2 = User.create
      b = Board.create(user: u)
      b2 = Board.create(user: u)
      b3 = Board.create(user: u2, public: true)
      b2.process({'copy_key' => 'asdf'}, {'user' => u})
      expect(b2.settings['copy_id']).to eq(nil)
      b2.process({'copy_key' => b.key}, {'user' => u})
      expect(b2.settings['copy_id']).to eq(b.global_id)
      b.process({'copy_key' => b.key}, {'user' => u})
      expect(b.settings['copy_id']).to eq(nil)
      b2.process({'copy_key' => b3.key}, {'user' => u})
      expect(b2.settings['copy_id']).to eq(b.global_id)
      b2.process({'copy_key' => ''}, {'user' => u})
      expect(b2.settings['copy_id']).to eq(nil)
    end

    it "should update sub-boards to use the copy_id if updated" do
      u = User.create
      b1 = Board.create(user: u)
      b2 = Board.create(user: u)
      b3 = Board.create(user: u)
      b3.process({'copy_key' => b2.key}, {'user' => u})
      expect(b3.reload.settings['copy_id']).to eq(b2.global_id)
      b2.settings['downstream_board_ids'] = [b3.global_id]
      b2.process({'copy_key' => b1.key}, {'user' => u})
      expect(b2.reload.settings['copy_id']).to eq(b1.global_id)
      expect(b3.reload.settings['copy_id']).to eq(b1.global_id)
    end

    it "should not update sub-boards if copy_key results in same id as already set" do
      u = User.create
      b1 = Board.create(user: u)
      b2 = Board.create(user: u)
      b3 = Board.create(user: u)
      b3.process({'copy_key' => b2.key}, {'user' => u})
      expect(b3.reload.settings['copy_id']).to eq(b2.global_id)
      b2.settings['downstream_board_ids'] = [b3.global_id]
      b2.process({'copy_key' => b1.key}, {'user' => u})
      expect(b2.reload.settings['copy_id']).to eq(b1.global_id)
      expect(b3.reload.settings['copy_id']).to eq(b1.global_id)
      expect(Board).to_not receive(:find_all_by_global_id)
      b2.process({'copy_key' => b1.key}, {'user' => u})
    end
    
    it "should set settings" do
      u = User.create
      b = Board.new(:user => u)
      b.process_params({
        'name' => 'Fred',
        'grid' => {},
        'description' => 'Fred is my favorite board'
      }, {})
      expect(b.settings['name']).to eq("Fred")
      expect(b.settings['buttons']).to eq(nil)
      expect(b.settings['grid']).to eq({})
      expect(b.key).to eq(nil)
    end

    it "should process background settings" do
      u = User.create
      b = Board.create(user: u)
      b.process({
        'background' => {'a' => 1} 
      })
      expect(b.settings['background']).to eq({'a' => 1})
      expect(b.settings['edit_description']['notes']).to eq(['changed the background'])
    end

    it "should only set key if provided as a non-user parameter" do
      u = User.create
      b = Board.new(:user => u)
      b.process_params({}, {:key => "tmp_ignore"})
      expect(b.key).to eq(nil)

      b.process_params({}, {:key => "something_good"})
      expect(b.key).to match(/\A[^\/]+\/something_good\z/)
    end
    
    it "should sanitize board name and description" do
      u = User.create
      b = Board.create(:user => u)
      b.process({'name' => "<b>Coolness</b>", 'description' => "Something <a href='#'>fun</a>"})
      expect(b.settings['name']).to eq('Coolness')
      expect(b.settings['description']).to eq('Something fun')
    end
    
    it "should preserve the grid order correctly" do
      u = User.create
      b = Board.create(:user => u)
      b.process({
        'buttons' => [{'id' => 1, 'label' => 'friend'}, {'id' => 2, 'label' => 'send'}, {'id' => '3', 'label' => 'blend'}],
        'grid' => {
          'rows' => 3,
          'columns' => 3,
          'order' => [[nil,1,nil],[2,nil,3],[nil,nil,nil]]
        }
      })
      expect(b.settings['grid']['order']).to eq([[nil,1,nil],[2,nil,3],[nil,nil,nil]])
    end
    
    it "should not allow referencing a protected boards as parent board" do
      u = User.create
      b = Board.create(:user => u)
      b.settings['protected'] = {'vocabulary' => true}
      b.save
      b2 = Board.create(:user => u)
      b2.process({
        'parent_board_id' => b.global_id
      })
      expect(b2.errored?).to eq(true)
      expect(b2.processing_errors).to eq(['cannot copy protected boards'])
    end

    it "should allow referencing a protected boards as parent board if allowed" do
      u = User.create
      b = Board.create(:user => u)
      b.settings['protected'] = {'vocabulary' => true}
      b.save
      b2 = Board.create(:user => u)
      b2.process({
        'parent_board_id' => b.global_id
      }, {:allow_copying_protected_boards => true})
      expect(b2.errored?).to eq(false)
      expect(b2.settings['protected']).to eq({'vocabulary' => true, 'vocabulary_owner_id' => u.global_id})
      expect(b.copyable_if_authorized?(u)).to eq(true)
      expect(b2.copyable_if_authorized?(u)).to eq(true)
    end

    it "should allow a board author to protect their own board" do
      u = User.create
      b = Board.create(user: u)
      b.settings['protected'] = {'vocabulary' => true}
      b.save
      b.process({'categories' => ['protected_vocabulary']})
      expect(b.settings['protected']).to eq({'vocabulary' => true, 'vocabulary_owner_id' => u.global_id})
    end

    it "should allow a board author to un-protect their own board" do
      u = User.create
      b = Board.create(user: u)
      b.settings['protected'] = {'vocabulary' => true}
      b.save
      expect(b.copyable_if_authorized?(u)).to eq(true)
      b.process({'categories' => ['unprotected_vocabulary']})
      expect(b.settings['protected']).to eq({})
    end

    it "should not allow a protected copy to be un-protected" do
      u = User.create
      b = Board.create(user: u)
      b.settings['protected'] = {'vocabulary' => true}
      b.save
      b2 = Board.create(user: u, parent_board: b)
      b2.settings['protected'] = {'vocabulary' => true}
      b2.save
      b2.process({'categories' => ['unprotected_vocabulary']})
      expect(b2.settings['protected']).to eq({'vocabulary' => true})
    end

    it "should allow referencing an allowed board as parent board, and create a clone" do
      u = User.create
      b1 = Board.create(user: u, public: true)
      b1.process(buttons: [
        {id: 1, label: 'bacon'},
        {id: 2, label: 'cheddar'},
        {id: 3, label: 'broccoli'},
        {id: 4, label: 'sour cream'},
      ], grid: {
        rows: 2,
        columns: 2,
        order: [[1, 3], [2, 4]]
      })
      BoardContent.generate_from(b1)
      b2 = Board.create(:user => u)
      b2.process({
        buttons: [
          {id: 1, label: 'bacon'},
          {id: 2, label: 'cheddar'},
          {id: 3, label: 'broccoli'},
          {id: 4, label: 'sour cream'},
        ], grid: {
          rows: 2,
          columns: 2,
          order: [[1, 3], [2, 4]]
        },
        'parent_board_id' => b1.global_id
      })
      expect(b2.parent_board).to eq(b1)
      expect(b2.board_content).to_not eq(nil)
      expect(b2.board_content).to eq(b1.board_content)
      expect(b2.buttons.map{|b| b.slice('id', 'label')}).to eq([
        {'id'=> 1, 'label'=> 'bacon'},
        {'id'=> 2, 'label'=> 'cheddar'},
        {'id'=> 3, 'label'=> 'broccoli'},
        {'id'=> 4, 'label'=> 'sour cream'},
      ])
    end

    it "should generate board_content for the original when a copy is created" do
      u = User.create
      b1 = Board.create(user: u, public: true)
      b1.process(buttons: [
        {id: 1, label: 'bacon'},
        {id: 2, label: 'cheddar'},
        {id: 3, label: 'broccoli'},
        {id: 4, label: 'sour cream'},
      ], grid: {
        rows: 2,
        columns: 2,
        order: [[1, 3], [2, 4]]
      })
      b2 = Board.create(:user => u)
      b2.process({
        buttons: [
          {id: 1, label: 'bacon'},
          {id: 2, label: 'cheddar'},
          {id: 3, label: 'broccoli'},
          {id: 4, label: 'sour cream'},
        ], grid: {
          rows: 2,
          columns: 2,
          order: [[1, 3], [2, 4]]
        },
        'parent_board_id' => b1.global_id
      })
      expect(b2.parent_board).to eq(b1)
      expect(b2.board_content).to_not eq(nil)
      expect(b2.board_content).to eq(b1.reload.board_content)
      expect(b2.buttons.map{|b| b.slice('id', 'label')}).to eq([
        {'id'=> 1, 'label'=> 'bacon'},
        {'id'=> 2, 'label'=> 'cheddar'},
        {'id'=> 3, 'label'=> 'broccoli'},
        {'id'=> 4, 'label'=> 'sour cream'},
      ])
    end

    it "should set visibility to public" do
      u = User.create
      b = Board.create(:user => u)
      b.process({'visibility' => 'public'})
      expect(b.public).to eq(true)
      expect(b.settings['unlisted']).to eq(false)
    end
    
    it "should set visibility to unlisted" do
      u = User.create
      b = Board.create(:user => u)
      b.process({'visibility' => 'unlisted'})
      expect(b.public).to eq(true)
      expect(b.settings['unlisted']).to eq(true)
    end
    
    it "should set visibility to private" do
      u = User.create
      b = Board.create(:user => u, :public => true)
      b.process({'visibility' => 'private'})
      expect(b.public).to eq(false)
      expect(b.settings['unlisted']).to eq(false)
    end
    
    it "should mark an update to visibility" do
      u = User.create
      b = Board.create(:user => u)
      b.process({'visibility' => 'public'})
      expect(b.public).to eq(true)
      expect(b.settings['unlisted']).to eq(false)
      expect(b.settings['edit_description']['notes']).to eq(['set to public'])
    end

    it "should batch-update visibility for sub-boards if specified" do
      u = User.create
      b1 = Board.create(:user => u)
      b2 = Board.create(user: u)
      b3 = Board.create(user: u)
      b4 = Board.create(user: u)
      b1.process({'buttons' => [
        {'id' => 1, 'label' => 'a', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {'user' => u})
      b2.process({'buttons' => [
        {'id' => 1, 'label' => 'a', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}
      ]}, {'user' => u})
      b3.process({'buttons' => [
        {'id' => 1, 'label' => 'a', 'load_board' => {'id' => b4.global_id, 'key' => b4.key}},
        {'id' => 2, 'label' => 'b', 'load_board' => {'id' => b1.global_id, 'key' => b1.key}},
        {'id' => 3, 'label' => 'c', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}},
      ]}, {'user' => u})
      u2 = User.create
      b4.user = u2
      b4.save
      Worker.process_queues

      expect(b1.reload.public).to eq(false)
      expect(b2.reload.public).to eq(false)
      expect(b3.reload.public).to eq(false)
      expect(b4.reload.public).to eq(false)

      b1.process({'visibility' => 'public', 'update_visibility_downstream' => true})
      expect(b1.reload.public).to eq(true)
      expect(b2.reload.public).to eq(false)
      expect(b3.reload.public).to eq(false)
      expect(b4.reload.public).to eq(false)
      Worker.process_queues
      expect(b1.reload.public).to eq(true)
      expect(b2.reload.public).to eq(true)
      expect(b3.reload.public).to eq(true)
      expect(b4.reload.public).to eq(false)
    end
    
    it "should tie to the source board's copy id if defined" do
      u = User.create
      b = Board.create(:user => u, :settings => {'copy_id' => '123456'})
      b2 = Board.process_new({
        'source_id' => b.global_id
      }, {'user' => u})
      expect(b2.settings['copy_id']).to eq('123456')
    end
    
    it "should ignore source_id on update" do
      u = User.create
      b = Board.create(:user => u, :settings => {'copy_id' => '123456'})
      b2 = Board.create(:user => u)
      expect(b2.settings['copy_id']).to eq(nil)
      b2.process({
        'source_id' => b.global_id
      }) 
      expect(b2.settings['copy_id']).to eq(nil)
    end

    it "should use the source board's id as the copy id if defined" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.process_new({
        'source_id' => b.global_id
      }, {'user' => u})
      expect(b2.settings['copy_id']).to eq(b.global_id)
    end
    
    it "should not set the copy id if not allowed to edit the source board" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u, :settings => {'copy_id' => '123456'})
      b2 = Board.process_new({
        'source_id' => b.global_id
      }, {'user' => u2})
      expect(b2.settings['copy_id']).to eq(nil)
    end

    it "should update the translations hash for the board's current locale when buttons are updated" do
      u = User.create
      b = Board.create(:user => u)
      b.settings['translations'] = {
        '1' => {'en' => {'label' => 'whatever'}},
        '2' => {'en' => {'label' => 'whatever'}},
        '3' => {'en' => {'label' => 'whatever'}},
      }
      b.process({
        'buttons' => [{'id' => 1, 'label' => 'friend'}, {'id' => 2, 'label' => 'send'}, {'id' => '3', 'label' => 'blend'}],
        'grid' => {
          'rows' => 3,
          'columns' => 3,
          'order' => [[nil,1,nil],[2,nil,3],[nil,nil,nil]]
        }
      })
      expect(b.settings['grid']['order']).to eq([[nil,1,nil],[2,nil,3],[nil,nil,nil]])
      expect(b.settings['translations']).to eq({
        '1' => {'en' => {'label' => 'friend'}},
        '2' => {'en' => {'label' => 'send'}},
        '3' => {'en' => {'label' => 'blend'}},
      })
    end

    it "should create a new version when a board is updated" do
      u = User.create
      PaperTrail.request.whodunnit = "user:#{u.global_id}"
      b = Board.create(user: u)
      initial_count = Board.user_versions(b.global_id).count
      expect(initial_count).to be >= 1
      b.process({
        'buttons' => [{'id' => 1, 'label' => 'risk'}],
        'background' => {'a' => 1} 
      }, {'user' => u})
      expect(Board.user_versions(b.global_id).count).to eq(initial_count + 1)
    end

    it "should create a new version when a board_content-backed board is updated" do
      u = User.create
      PaperTrail.request.whodunnit = "user:#{u.global_id}"
      b = Board.create(user: u)
      initial_count = Board.user_versions(b.global_id).count
      expect(initial_count).to be >= 1
      BoardContent.generate_from(b)
      post_generate_count = Board.user_versions(b.global_id).count
      b.process({
        'buttons' => [{'id' => 1, 'label' => 'risk'}],
        'background' => {'a' => 1} 
      }, {'user' => u})
      expect(Board.user_versions(b.global_id).count).to eq(post_generate_count + 1)
      expect(b.buttons.length).to eq(1)
      expect(b.buttons[0]['id']).to eq(1)
      expect(b.buttons[0]['label']).to eq('risk')
    end

    it "should allow setting new_owner if authorized" do
      u1 = User.create
      u2 = User.create
      b1 = Board.create(user: u1, settings: {
        'protected' => {'vocabulary' => true, 'vocabulary_owner_id' => u1.global_id}
      })
      User.link_supervisor_to_user(u2, u1)
      Worker.process_queues

      b2 = Board.process_new({
        'buttons' => [{'id' => 12, 'label' => 'cart'}],
        'parent_board_id' => b1.global_id,
        'new_owner' => true
      }, {'user' => u2.reload, 'author' => u1.reload, 'allow_copying_protected_boards' => true})

      expect(b2.settings['protected']['vocabulary']).to eq(true)
      expect(b2.settings['protected']['vocabulary_owner_id']).to eq(u2.global_id)
      expect(b2.settings['protected']['sub_owner']).to eq(true)
    end

    it "should not allow setting new_owner if not authorized" do
      u1 = User.create
      u2 = User.create
      b1 = Board.create(user: u1, settings: {
        'protected' => {'vocabulary' => true, 'vocabulary_owner_id' => u1.global_id}
      })
      Worker.process_queues

      b2 = Board.process_new({
        'buttons' => [{'id' => 12, 'label' => 'cart'}],
        'parent_board_id' => b1.global_id,
        'new_owner' => true
      }, {'user' => u2.reload, 'allow_copying_protected_boards' => true})

      expect(b2.settings['protected']['vocabulary']).to eq(true)
      expect(b2.settings['protected']['vocabulary_owner_id']).to eq(u1.global_id)
      expect(b2.settings['protected']['sub_owner']).to eq(true)
    end

    it "should allow disconnecting if authorized" do
      u1 = User.create
      u2 = User.create
      b1 = Board.create(user: u1, settings: {
        'protected' => {'vocabulary' => true, 'vocabulary_owner_id' => u1.global_id}
      })
      User.link_supervisor_to_user(u2, u1)
      Worker.process_queues

      b2 = Board.process_new({
        'buttons' => [{'id' => 12, 'label' => 'cart'}],
        'parent_board_id' => b1.global_id,
        'disconnect' => true
      }, {'user' => u2.reload, 'author' => u1.reload, 'allow_copying_protected_boards' => true})

      expect(b2.settings['protected']['vocabulary']).to eq(true)
      expect(b2.settings['protected']['vocabulary_owner_id']).to eq(u1.global_id)
      expect(b2.settings['protected']['sub_owner']).to eq(nil)
      expect(b2.settings['copy_parent_board_id']).to eq(b1.global_id)
      expect(b2.parent_board).to eq(nil)
    end

    it "should not allow disconnecting if not authorized" do
      u1 = User.create
      u2 = User.create
      b1 = Board.create(user: u1, settings: {
        'protected' => {'vocabulary' => true, 'vocabulary_owner_id' => u1.global_id}
      })
      Worker.process_queues

      b2 = Board.process_new({
        'buttons' => [{'id' => 12, 'label' => 'cart'}],
        'parent_board_id' => b1.global_id,
        'disconnect' => true
      }, {'user' => u2.reload, 'allow_copying_protected_boards' => true})

      expect(b2.settings['protected']['vocabulary']).to eq(true)
      expect(b2.settings['protected']['vocabulary_owner_id']).to eq(u1.global_id)
      expect(b2.settings['protected']['sub_owner']).to eq(nil)
      expect(b2.settings['copy_parent_board_id']).to eq(nil)
      expect(b2.parent_board).to eq(b1)
    end

    it "should set sub_owner to false if disconnect AND new_owner" do
      u1 = User.create
      u2 = User.create
      b1 = Board.create(user: u1, settings: {
        'protected' => {'vocabulary' => true, 'vocabulary_owner_id' => u1.global_id}
      })
      User.link_supervisor_to_user(u2, u1)
      Worker.process_queues

      b2 = Board.process_new({
        'buttons' => [{'id' => 12, 'label' => 'cart'}],
        'parent_board_id' => b1.global_id,
        'new_owner' => true,
        'disconnect' => true
      }, {'user' => u2.reload, 'author' => u1.reload, 'allow_copying_protected_boards' => true})

      expect(b2.settings['protected']['vocabulary']).to eq(true)
      expect(b2.settings['protected']['vocabulary_owner_id']).to eq(u2.global_id)
      expect(b2.settings['protected']['sub_owner']).to eq(false)
    end
  end

  it "should securely serialize settings" do
    u = User.create
    b = Board.new(:user => u)
    b.generate_defaults
    settings = b.settings
    expect(GoSecure::SecureJson).to receive(:dump).with(b.settings)
    b.save
  end
  
  describe "post_process" do
    it "should search for a better default icon if the default icon is being used" do
      u = User.create
      b = Board.create(:user => u)
      b.settings = {'name' => 'chicken and fries'}
      b.generate_defaults
      expect(b.settings['image_url']).to eq(Board::DEFAULT_ICON)
      expect(b.settings['default_image_url']).to eq(Board::DEFAULT_ICON)
      res = OpenStruct.new(:body => [{}, {'license' => 'CC By', 'image_url' => 'http://example.com/pic.png'}].to_json)
      expect(Typhoeus).to receive(:get).with("https://www.opensymbols.org/api/v1/symbols/search?q=chicken+and+fries&locale=en", timeout: 5).and_return(res)
      b.save
      Worker.process_queues
      b.reload
      expect(b.settings['image_url']).to eq('http://example.com/pic.png')
      expect(b.settings['default_image_url']).to eq('http://example.com/pic.png')
    end
    
    it "should not search for a better default icon once it's already found a better default icon" do
      u = User.create
      b = Board.create(:user => u)
      b.settings = {'name' => 'chicken and fries'}
      b.generate_defaults
      expect(b.settings['image_url']).to eq(Board::DEFAULT_ICON)
      expect(b.settings['default_image_url']).to eq(Board::DEFAULT_ICON)
      res = OpenStruct.new(:body => [{}, {'license' => 'CC By', 'image_url' => 'http://example.com/pic.png'}].to_json)
      expect(Typhoeus).to receive(:get).with("https://www.opensymbols.org/api/v1/symbols/search?q=chicken+and+fries&locale=en", timeout: 5).and_return(res)
      b.save
      Worker.process_queues
      b.reload
      expect(b.settings['image_url']).to eq('http://example.com/pic.png')
      expect(b.settings['default_image_url']).to eq('http://example.com/pic.png')
      
      b.process_params({'name' => 'cool people'}, {})
      expect(Typhoeus).not_to receive(:get)
      b.save
      Worker.process_queues
      b.reload
      expect(b.settings['image_url']).to eq('http://example.com/pic.png')
      expect(b.settings['default_image_url']).to eq('http://example.com/pic.png')

      expect(Typhoeus).not_to receive(:get)
      b.save
      Worker.process_queues
      b.reload
      expect(b.settings['image_url']).to eq('http://example.com/pic.png')
      expect(b.settings['default_image_url']).to eq('http://example.com/pic.png')
    end
    
    it "should not search for a better default icon if no name set for the board" do
      u = User.create
      b = Board.create(:user => u)
      b.generate_defaults
      expect(b.settings['image_url']).to eq(Board::DEFAULT_ICON)
      expect(b.settings['default_image_url']).to eq(Board::DEFAULT_ICON)
      expect(Typhoeus).not_to receive(:get)
      b.save
      Worker.process_queues
      b.reload
      expect(b.settings['image_url']).to eq(Board::DEFAULT_ICON)
      expect(b.settings['default_image_url']).to eq(Board::DEFAULT_ICON)
    end
    
    it "should not search for a better default icon if an icon has been manually set" do
      u = User.create
      b = Board.create(:user => u)
      b.settings = {'name' => 'chicken and fries'}
      b.generate_defaults
      expect(b.settings['image_url']).to eq(Board::DEFAULT_ICON)
      expect(b.settings['default_image_url']).to eq(Board::DEFAULT_ICON)
      b.process({'image_url' => 'http://example.com/pic.png'})
      expect(b.settings['image_url']).to eq('http://example.com/pic.png')
      expect(b.settings['default_image_url']).to eq(nil)
      
      expect(Typhoeus).not_to receive(:get)
      b.save
      Worker.process_queues
      b.reload
      expect(b.settings['image_url']).to eq('http://example.com/pic.png')
      expect(b.settings['default_image_url']).to eq(nil)
      
      b = Board.create(:user => u)
      b.settings = {'image_url' => 'http://example.com/pic2.png'}
      b.generate_defaults
      expect(b.settings['image_url']).to eq('http://example.com/pic2.png')
      expect(b.settings['default_image_url']).to eq(nil)
      
      expect(Typhoeus).not_to receive(:get)
      b.save
      Worker.process_queues
      b.reload
      expect(b.settings['image_url']).to eq('http://example.com/pic2.png')
      expect(b.settings['default_image_url']).to eq(nil)

      b = Board.create(:user => u)
      b.settings = {'image_url' => Board::DEFAULT_ICON}
      b.generate_defaults
      expect(b.settings['image_url']).to eq(Board::DEFAULT_ICON)
      expect(b.settings['default_image_url']).to eq(nil)
      
      expect(Typhoeus).not_to receive(:get)
      b.save
      Worker.process_queues
      b.reload
      expect(b.settings['image_url']).to eq(Board::DEFAULT_ICON)
      expect(b.settings['default_image_url']).to eq(nil)
    end
  end
  
  describe "cleanup on destroy" do
    it "should remove related records" do
      u = User.create
      b = Board.create(:user => u)
      expect(DeletedBoard).to receive(:process).with(b)
      b.destroy
      Worker.process_queues
    end

    it "should clear home_board from users who had the board as home" do
      u = User.create
      b = Board.create(:user => u)
      u.settings['preferences'] ||= {}
      u.settings['preferences']['home_board'] = { 'id' => b.global_id, 'key' => b.key, 'locale' => 'en' }
      u.save
      Worker.process_queues  # track_boards creates UserBoardConnection
      expect(UserBoardConnection.where(board_id: b.id, home: true).count).to eq(1)
      b.destroy
      u.reload
      expect(u.settings['preferences']['home_board']).to eq(nil)
      expect(UserBoardConnection.where(board_id: b.id).count).to eq(0)
    end

    it "should remove board from sidebar when board is destroyed" do
      u = User.create
      b = Board.create(:user => u)
      u.settings['preferences'] ||= {}
      u.settings['preferences']['sidebar_boards'] = [{ 'key' => b.key, 'name' => 'Test', 'locale' => 'en' }]
      u.save
      Worker.process_queues  # track_boards creates UserBoardConnection
      expect(UserBoardConnection.where(board_id: b.id, home: false).count).to eq(1)
      b.destroy
      u.reload
      expect(u.settings['preferences']['sidebar_boards'].map { |s| s['key'] }).not_to include(b.key)
      expect(UserBoardConnection.where(board_id: b.id).count).to eq(0)
    end

    it "should schedule background job when many users affected to avoid blocking destroy" do
      stub_const('Board::HOME_SIDEBAR_CLEANUP_ASYNC_THRESHOLD', 2)
      u = User.create
      b = Board.create(:user => u, public: true)
      users = 3.times.map { User.create }
      users.each_with_index do |usr, i|
        usr.settings['preferences'] ||= {}
        usr.settings['preferences']['home_board'] = i < 2 ? { 'id' => b.global_id, 'key' => b.key } : nil
        usr.settings['preferences']['sidebar_boards'] = [{ 'key' => b.key, 'name' => 'Test' }]
        usr.save
        UserBoardConnection.create!(user: usr, board: b, home: i < 2)
      end
      Worker.process_queues  # run track_boards while board still exists
      expect(UserBoardConnection.where(board_id: b.id).count).to be >= 3
      b.destroy
      actions = Worker.scheduled_actions('slow')
      expect(actions.any? { |a| a['args'] && a['args'][0] == 'Board' && a['args'][2].to_h['method'] == 'clear_home_and_sidebar_for_deleted_board' }).to eq(true)
      Worker.process_queues
      users.each do |usr|
        usr.reload
        expect(usr.settings['preferences']['home_board']).to eq(nil)
        expect(usr.settings['preferences']['sidebar_boards'].map { |s| s['key'] }).not_to include(b.key)
      end
    end
  end
  
  describe "find_copies_by" do
    it "should return nothing if no user provided" do
      u = User.create
      b = Board.create(:user => u)
      expect(b.find_copies_by(nil)).to eq([])
    end
    
    it "should return nothing if no matching board found" do
      u1 = User.create
      b1 = Board.create(:user => u1)
      u2 = User.create
      expect(b1.find_copies_by(u2)).to eq([])
    end
    
    it "should return a result if any found" do
      u1 = User.create
      b1 = Board.create(:user => u1)
      u2 = User.create
      b2 = Board.create(:user => u2, :parent_board_id => b1.id)
      expect(b1.find_copies_by(u2)).to eq([b2])
    end
    
    it "should return the most recent result" do
      u1 = User.create
      b1 = Board.create(:user => u1)
      u2 = User.create
      b2 = Board.create(:user => u2, :parent_board_id => b1.id)
      b3 = Board.create(:user => u2, :parent_board_id => b1.id)
      expect(b1.find_copies_by(u2)).to eq([b3, b2])
    end
    
    it "should include copies by supervisees, but list them after the user's" do
      u1 = User.create
      u2 = User.create
      u3 = User.create
      b1 = Board.create(:user => u1)
      b2 = Board.create(:user => u2, :parent_board_id => b1.id)
      b3 = Board.create(:user => u3, :parent_board_id => b1.id)
      expect(b1.find_copies_by(u2)).to eq([b2])
      
      User.link_supervisor_to_user(u2, u3)
      Worker.process_queues
      
      expect(b1.find_copies_by(u2)).to eq([b2, b3])
    end
  end
  
  describe "check_for_parts_of_speech_and_inflections" do
    it "should call when board is processed" do
      u = User.create
      b = Board.create(:user => u)
      expect(b).to receive(:check_for_parts_of_speech_and_inflections).with(false).and_return(true)
      b.process({'buttons' => []})
    end
    
    it "should set part_of_speech for any buttons that don't have one set" do
      u = User.create
      WordData.create(word: 'hat', locale: 'en', data: {'types' => ['noun']})
      b = Board.create(:user => u)
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'hat'},
        {'id' => 2, 'label' => 'cat', 'part_of_speech' => 'verb'}
      ]
      b.save
      b.check_for_parts_of_speech_and_inflections
      expect(b.settings['buttons'][0]['part_of_speech']).to eq('noun')
      expect(b.settings['buttons'][0]['suggested_part_of_speech']).to eq('noun')
      expect(b.settings['buttons'][1]['part_of_speech']).to eq('verb')
      expect(b.settings['buttons'][1]['suggested_part_of_speech']).to eq(nil)
    end
    
    it "should not set part_of_speech for any buttons that have one set" do
      u = User.create
      WordData.create(word: 'hat', locale: 'en', data: {'types' => ['noun']})
      b = Board.create(:user => u)
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'hat'},
        {'id' => 2, 'label' => 'cat', 'part_of_speech' => 'verb'}
      ]
      b.save
      b.check_for_parts_of_speech_and_inflections
      expect(b.settings['buttons'][0]['part_of_speech']).to eq('noun')
      expect(b.settings['buttons'][0]['suggested_part_of_speech']).to eq('noun')
      expect(b.settings['buttons'][1]['part_of_speech']).to eq('verb')
      expect(b.settings['buttons'][1]['suggested_part_of_speech']).to eq(nil)
    end
    
    it "should record an event for any buttons that were manually set to something other than the suggested value" do
      RedisInit.default.del('overridden_parts_of_speech')
      u = User.create
      WordData.create(word: 'hat', locale: 'en', data: {'types' => ['noun']})
      WordData.create(word: 'cat', locale: 'en', data: {'types' => ['noun']})
      b = Board.create(:user => u)
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'hat'},
        {'id' => 2, 'label' => 'cat', 'part_of_speech' => 'verb', 'suggested_part_of_speech' => 'noun'}
      ]
      b.save
      b.check_for_parts_of_speech_and_inflections
      expect(b.settings['buttons'][0]['part_of_speech']).to eq('noun')
      expect(b.settings['buttons'][0]['suggested_part_of_speech']).to eq('noun')
      expect(b.settings['buttons'][1]['part_of_speech']).to eq('verb')
      
      words = RedisInit.default.hgetall('overridden_parts_of_speech')
      expect(words).not_to eq(nil)
      expect(words['cat-verb']).to eq("1")
      expect(words['cat']).to eq(nil)
    end

    it "should look up inflections for any buttons that have content" do
      o = Organization.create(admin: true)
      u = User.create
      o.add_manager(u.user_name, true)
      w = WordData.find_by(word: 'bacon', locale: 'en') || WordData.create(word: 'bacon', locale: 'en')
      w.process({
        'primary_part_of_speech' => 'noun',
        'parts_of_speech' => ['noun'],
        'antonyms' => 'grossness',
        'inflection_overrides' => {
          'plural' => 'bacons',
          'possessive' => "bacon's",
          'regulars' => ['possessive']
        }
      }, {updater: u.reload})
      WordData.create(word: 'cat', locale: 'en', data: {'types' => ['noun']})
      b = Board.create(user: u)
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'bacon'},
        {'id' => 2, 'label' => 'cat'}
      ]
      b.check_for_parts_of_speech_and_inflections
      expect(b.settings['buttons'][0]['part_of_speech']).to eq('noun')
      expect(b.settings['buttons'][0]['suggested_part_of_speech']).to eq('noun')
      expect(b.settings['buttons'][1]['part_of_speech']).to eq('noun')
      expect(b.settings['buttons'][1]['suggested_part_of_speech']).to eq('noun')
      expect(b.settings['buttons'][0]['inflection_defaults']).to eq({
        'c' => 'bacon',
        'n' => 'bacons',
        'se' => 'grossness',
        'src' => 'bacon',
        'types' => ['noun'],
        'v' => WordData::INFLECTIONS_VERSION
      })
      expect(b.settings['buttons'][1]['inflection_defaults']).to eq(nil)
    end

    it "should look up inflections for all locales for a board" do
      o = Organization.create(admin: true)
      u = User.create
      o.add_manager(u.user_name, true)
      w = WordData.find_by(word: 'bacon', locale: 'en') || WordData.create(word: 'bacon', locale: 'en')
      w.process({
        'primary_part_of_speech' => 'noun',
        'parts_of_speech' => ['noun'],
        'antonyms' => 'grossness',
        'inflection_overrides' => {
          'plural' => 'bacons',
          'possessive' => "bacon's",
          'regulars' => ['possessive']
        }
      }, {updater: u.reload})
      w = WordData.find_by(word: 'chat', locale: 'fr') || WordData.create(word: 'chat', locale: 'fr')
      w.process({
        'primary_part_of_speech' => 'noun',
        'parts_of_speech' => ['noun']
      }, {updater: u.reload})

      b = Board.create(user: u)
      b.settings['locale'] = 'fr'
      b.settings['locales'] = ['en', 'fr']
      b.settings['translations'] = {
        'default' => 'fr',
        'current_label' => 'fr',
        'current_vocalization' => 'fr',
        '1' => {
          'en' => {'label' => 'bacon'}, 'fr' => {'label' => 'baconne'}
        },
        '2' => {
          'en' => {'label' => 'cat'}, 'fr' => {'label' => 'chat'}
        }
      }
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'baconne'},
        {'id' => 2, 'label' => 'chat'}
      ]
      b.check_for_parts_of_speech_and_inflections
      expect(b.settings['buttons'][0]['part_of_speech']).to eq(nil)
      expect(b.settings['buttons'][0]['suggested_part_of_speech']).to eq(nil)
      expect(b.settings['buttons'][1]['part_of_speech']).to eq('noun')
      expect(b.settings['buttons'][1]['suggested_part_of_speech']).to eq('noun')
      expect(b.settings['buttons'][0]['inflection_defaults']).to eq(nil)
      expect(b.settings['buttons'][1]['inflection_defaults']).to eq(nil)
      expect(b.settings['translations']['1']['en']['inflection_defaults']).to eq({
        'c' => 'bacon',
        'n' => 'bacons',
        'se' => 'grossness',
        'src' => 'bacon',
        'types' => ['noun'],
        'v' => WordData::INFLECTIONS_VERSION
      })
      expect(b.settings['translations']['1']['fr']['inflection_defaults']).to eq(nil)
      expect(b.settings['translations']['2']['en']['inflection_defaults']).to eq(nil)
      expect(b.settings['translations']['2']['fr']['inflection_defaults']).to eq(nil)
    end

    it "should work for boards with board_content" do
      o = Organization.create(admin: true)
      u = User.create
      o.add_manager(u.user_name, true)
      w = WordData.find_by(word: 'bacon', locale: 'en') || WordData.create(word: 'bacon', locale: 'en')
      w.process({
        'primary_part_of_speech' => 'noun',
        'parts_of_speech' => ['noun'],
        'antonyms' => 'grossness',
        'inflection_overrides' => {
          'plural' => 'bacons',
          'possessive' => "bacon's",
          'regulars' => ['possessive']
        }
      }, {updater: u.reload})
      w = WordData.find_by(word: 'chat', locale: 'fr') || WordData.create(word: 'chat', locale: 'fr')
      w.process({
        'primary_part_of_speech' => 'noun',
        'parts_of_speech' => ['noun']
      }, {updater: u.reload})

      b = Board.create(user: u)
      b.settings['locale'] = 'fr'
      b.settings['locales'] = ['en', 'fr']
      b.settings['translations'] = {
        'default' => 'fr',
        'current_label' => 'fr',
        'current_vocalization' => 'fr',
        '1' => {
          'en' => {'label' => 'bacon'}, 'fr' => {'label' => 'baconne'}
        },
        '2' => {
          'en' => {'label' => 'cat'}, 'fr' => {'label' => 'chat'}
        }
      }
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'baconne'},
        {'id' => 2, 'label' => 'chat'}
      ]
      bc = BoardContent.new(settings: {})
      bc.settings['buttons'] = b.settings['buttons']
      bc.settings['translations'] = b.settings['translations']
      bc.save
      b.board_content = bc
      b.check_for_parts_of_speech_and_inflections
      expect(b.buttons[0]['label']).to eq('baconne')
      expect(b.buttons[0]['part_of_speech']).to eq(nil)
      expect(b.buttons[0]['suggested_part_of_speech']).to eq(nil)
      expect(b.buttons[1]['label']).to eq('chat')
      expect(b.buttons[1]['part_of_speech']).to eq('noun')
      expect(b.buttons[1]['suggested_part_of_speech']).to eq('noun')
      expect(b.buttons[0]['inflection_defaults']).to eq(nil)
      expect(b.buttons[1]['inflection_defaults']).to eq(nil)
      expect(BoardContent.load_content(b, 'translations')['1']['en']['inflection_defaults']).to eq({
        'c' => 'bacon',
        'n' => 'bacons',
        'se' => 'grossness',
        'src' => 'bacon',
        'types' => ['noun'],
        'v' => WordData::INFLECTIONS_VERSION
      })
      expect(BoardContent.load_content(b, 'translations')['1']['fr']['inflection_defaults']).to eq(nil)
      expect(BoardContent.load_content(b, 'translations')['1']['fr']['label']).to eq('baconne')
      expect(BoardContent.load_content(b, 'translations')['2']['en']['inflection_defaults']).to eq(nil)
      expect(BoardContent.load_content(b, 'translations')['2']['en']['label']).to eq('cat')
      expect(BoardContent.load_content(b, 'translations')['2']['fr']['inflection_defaults']).to eq(nil)
      expect(BoardContent.load_content(b, 'translations')['2']['fr']['label']).to eq('chat')
      b.save
      expect(b.settings['buttons']).to eq([])
      expect(b.settings['translations']).to eq(nil)
      expect(b.settings['content_overrides']).to_not eq(nil)
      expect(b.buttons[0]['label']).to eq('baconne')
      expect(b.buttons[0]['part_of_speech']).to eq(nil)
      expect(b.buttons[0]['suggested_part_of_speech']).to eq(nil)
      expect(b.buttons[1]['label']).to eq('chat')
      expect(b.buttons[1]['part_of_speech']).to eq('noun')
      expect(b.buttons[1]['suggested_part_of_speech']).to eq('noun')
      expect(b.buttons[0]['inflection_defaults']).to eq(nil)
      expect(b.buttons[1]['inflection_defaults']).to eq(nil)
      expect(BoardContent.load_content(b, 'translations')['1']['en']['inflection_defaults']).to eq({
        'c' => 'bacon',
        'n' => 'bacons',
        'se' => 'grossness',
        'src' => 'bacon',
        'types' => ['noun'],
        'v' => WordData::INFLECTIONS_VERSION
      })
      expect(BoardContent.load_content(b, 'translations')['1']['fr']['inflection_defaults']).to eq(nil)
      expect(BoardContent.load_content(b, 'translations')['1']['fr']['label']).to eq('baconne')
      expect(BoardContent.load_content(b, 'translations')['2']['en']['inflection_defaults']).to eq(nil)
      expect(BoardContent.load_content(b, 'translations')['2']['en']['label']).to eq('cat')
      expect(BoardContent.load_content(b, 'translations')['2']['fr']['inflection_defaults']).to eq(nil)
      expect(BoardContent.load_content(b, 'translations')['2']['fr']['label']).to eq('chat')
    end
  end

  describe "update_self_references" do
    it 'should change legacy parent refs to self refs only once' do
      u = User.create
      b = Board.create(user: u)
      b.generate_defaults
      b.parent_board_id = 99
      b.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => b.related_global_id(99)}},
        {'id' => 2, 'load_board' => {'id' => b.related_global_id(98)}},
        {'id' => 3, 'load_board' => {'id' => b.related_global_id(99)}},
      ]
      b.save
      expect(b.buttons).to eq([
        {'id' => 1, 'load_board' => {'id' => b.global_id, 'key' => b.key}},
        {'id' => 2, 'load_board' => {'id' => b.related_global_id(98)}},
        {'id' => 3, 'load_board' => {'id' => b.global_id, 'key' => b.key}},
      ])
      expect(b.settings['self_references_updated']).to eq(true)

      b.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => b.related_global_id(99)}},
        {'id' => 2, 'load_board' => {'id' => b.related_global_id(98)}},
        {'id' => 3, 'load_board' => {'id' => b.related_global_id(99)}},
      ]
      b.save
      expect(b.buttons).to eq([
        {'id' => 1, 'load_board' => {'id' => b.related_global_id(99)}},
        {'id' => 2, 'load_board' => {'id' => b.related_global_id(98)}},
        {'id' => 3, 'load_board' => {'id' => b.related_global_id(99)}},
      ])
    end

    it "should work for boards with board_content" do
      u = User.create
      b = Board.create(user: u)
      b.generate_defaults
      b.parent_board_id = 99
      b.settings['buttons'] = [
        {'id' => 1, 'load_board' => {'id' => b.related_global_id(99)}},
        {'id' => 2, 'load_board' => {'id' => b.related_global_id(98)}},
        {'id' => 3, 'load_board' => {'id' => b.related_global_id(99)}},
      ]
      bc = BoardContent.new(settings: {})
      bc.settings['buttons'] = b.settings['buttons']
      bc.save
      b.board_content = bc
      b.save
      expect(b.buttons).to eq([
        {'id' => 1, 'load_board' => {'id' => b.global_id, 'key' => b.key}},
        {'id' => 2, 'load_board' => {'id' => b.related_global_id(98)}},
        {'id' => 3, 'load_board' => {'id' => b.global_id, 'key' => b.key}},
      ])
      expect(bc.settings['buttons']).to eq([
        {'id' => 1, 'load_board' => {'id' => b.related_global_id(99)}},
        {'id' => 2, 'load_board' => {'id' => b.related_global_id(98)}},
        {'id' => 3, 'load_board' => {'id' => b.related_global_id(99)}},
      ])
      expect(b.settings['self_references_updated']).to eq(true)
    end
  end
  
  describe "edit_description" do
    it "should set proper edit description when known entries have changed" do
      u = User.create
      b = Board.create(:user => u)
      b.process(:name => "good board")
      expect(b.settings['edit_description']).not_to eq(nil)
      assert_timestamp(b.settings['edit_description']['timestamp'], Time.now.to_i)
    end
    
    it "should clear edit description on subsequent saves" do
      u = User.create
      b = Board.create(:user => u)
      b.process(:name => "good board")
      b.settings['edit_description']['timestamp'] = 5.seconds.ago.to_f
      b.save
      expect(b.settings['edit_description']).to eq(nil)
    end
    
    it "should set edit description when buttons are changed" do
      u = User.create
      b = Board.create(:user => u)
      b.process(:buttons => [{'id' => 1, 'label' => 'hat'}])
      expect(b.settings['edit_description']).not_to eq(nil)
      expect(b.settings['edit_description']['notes']).to eq(['modified buttons'])
    end
    
    it "should set edit description when description is changed" do
      u = User.create
      b = Board.create(:user => u)
      b.process(:description => "good board")
      expect(b.settings['edit_description']).not_to eq(nil)
      expect(b.settings['edit_description']['notes']).to eq(['updated the description'])
    end
    
    it "should set edit description when the grid is changed"
    
    it "should set edit description when the board name is changed" do
      u = User.create
      b = Board.create(:user => u)
      b.process(:name => "good board")
      expect(b.settings['edit_description']).not_to eq(nil)
      expect(b.settings['edit_description']['notes']).to eq(['renamed the board'])
    end
    
    it "should set edit description when the board license is changed" do
      u = User.create
      b = Board.create(:user => u)
      b.process(:license => {'type' => 'public_domain'})
      expect(b.settings['edit_description']).not_to eq(nil)
      expect(b.settings['edit_description']['notes']).to eq(['changed the license'])
    end
    
    it "should set edit description when the board image is changed" do
      u = User.create
      b = Board.create(:user => u)
      b.process(:image_url => "http://www.example.com/pic.png")
      expect(b.settings['edit_description']).not_to eq(nil)
      expect(b.settings['edit_description']['notes']).to eq(['changed the image'])
    end
    
    it "should set edit description when the board is changed to public or private" do
      u = User.create
      b = Board.create(:user => u)
      b.process(:public => true)
      expect(b.settings['edit_description']).not_to eq(nil)
      expect(b.settings['edit_description']['notes']).to eq(['set to public'])

      b.settings['edit_description']['timestamp'] = 6.seconds.ago.to_i
      b.process(:public => true)
      expect(b.settings['edit_description']).to eq(nil)

      b.process(:public => false)
      expect(b.settings['edit_description']).not_to eq(nil)
      expect(b.settings['edit_description']['notes']).to eq(['set to private'])

      b.settings['edit_description']['timestamp'] = 6.seconds.ago.to_i
      b.process(:public => false)
      expect(b.settings['edit_description']).to eq(nil)
    end
  end
  
  describe "import" do
    it "should convert boards" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      boards = [b, b2]
      expect(Converters::Utils).to receive(:remote_to_boards).with(u, 'http://www.example.com/board.obf').and_return(boards)
      res = Board.import(u.global_id, 'http://www.example.com/board.obf')
      expect(res.length).to eq(2)
      expect(res[0]['id']).to eq(b.global_id)
      expect(res[1]['id']).to eq(b2.global_id)
    end

    it "should assert imported set as part of the same bundle" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      boards = [b, b2]
      expect(Converters::Utils).to receive(:remote_to_boards).with(u, 'http://www.example.com/board.obf').and_return(boards)
      res = Board.import(u.global_id, 'http://www.example.com/board.obf')
      expect(res.length).to eq(2)
      expect(res[0]['id']).to eq(b.global_id)
      expect(b.reload.settings['copy_id']).to eq(b.global_id)
      expect(res[1]['id']).to eq(b2.global_id)
      expect(b2.reload.settings['copy_id']).to eq(b.global_id)
    end

    it "should return error hash for protected boards" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      boards = [b, b2]
      expect(Converters::Utils).to receive(:remote_to_boards).with(u, 'http://www.example.com/board.obf').and_raise("can't import protected boards to the wrong user")
      res = Board.import(u.global_id, 'http://www.example.com/board.obf')
      expect(res).to eq({:error => {:message=>"protected material cannot be imported", :protected=>true}})
      expect(Board.last).to eq(b2)
    end
  end
  
  describe "additional_webhook_codes" do
    it "should return empty list by default" do
      u = User.create
      b = Board.create(:user => u)
      expect(b.additional_webhook_record_codes('asdf', nil)).to eq([])
      expect(b.additional_webhook_record_codes('button_action', nil)).to eq([])
      expect(b.additional_webhook_record_codes('something', {'button_id' => 'asdf', 'user_id' => u.global_id})).to eq([])
      b.settings['buttons'] = [{
        'id' => '123'
      }]
      expect(b.additional_webhook_record_codes('button_action', {'button_id' => '123', 'user_id' => u.global_id})).to eq([])
    end
    
    it "should return the connect user_integration only if allowed" do
      u = User.create
      u2 = User.create
      u3 = User.create
      b = Board.create(:user => u)
      ui = UserIntegration.create(:user => u3, :settings => {'button_webhook_url' => 'http://www.example.com'})
      b.settings['buttons'] = [{}, {
        'id' => 'hat',
        'integration' => {'user_integration_id' => ui.global_id}
      }]
      expect(b.additional_webhook_record_codes('button_action', {'button_id' => 'hat', 'user_id' => u.global_id})).to eq([ui.record_code])
    end
  end
  
  describe "webhook_content" do
    it "should return nothing by default" do
      u = User.create
      b = Board.create(:user => u)
      expect(b.webhook_content(nil, nil, nil)).to eq("{}")
      expect(b.webhook_content('button_action', nil, nil)).to eq("{}")
      expect(b.webhook_content(nil, nil, {'button_id' => '123'})).to eq("{}")
      expect(b.webhook_content('button_action', nil, {'button_id' => '123', 'user_id' => u.global_id})).to eq("{}")
      b.settings['buttons'] = [{
        'id' => '123'
      }]
      expect(b.webhook_content('button_action', nil, {'button_id' => '123'})).to eq("{}")
    end
    
    it "should return button action information for a valid, authorized integration button" do
      u = User.create
      b = Board.create(:user => u)
      ui = UserIntegration.create(:user => u, :settings => {'button_webhook_url' => 'http://www.example.com'})
      b.settings['buttons'] = [{}, {
        'id' => '123',
        'integration' => {'user_integration_id' => ui.global_id}
      }]
      str = b.webhook_content('button_action', nil, {'button_id' => '123', 'user_id' => u.global_id})
      json = JSON.parse(str)
      expect(json['action']).to eq(nil)
      expect(json['placement_code']).to_not eq(nil)
      expect(json['user_code']).to_not eq(nil)
      expect(json['user_id']).to eq(nil)
    end
  end
  
  describe "update_affected_users" do
    it "should find and update all users attached to the board" do
      u = User.create
      b = Board.create(:user => u)
      u.settings['preferences']['home_board'] = {'id' => b.global_id}
      u.save
      Worker.process_queues
      Worker.process_queues
      User.where(:id => u.id).update_all(:updated_at => 2.months.ago)
      b.settings['buttons'] = [{'id' => 1, 'label' => 'whatever'}]
      b.instance_variable_set('@buttons_changed', true)
      b.save
      expect(u.reload.updated_at).to be < 2.weeks.ago
      Worker.process_queues
      expect(u.reload.updated_at).to be > 2.weeks.ago
    end
    
    it "should find and update supervisors of users attached to the board" do
      u = User.create
      u2 = User.create
      User.link_supervisor_to_user(u2, u)
      u.reload
      b = Board.create(:user => u)
      u.settings['preferences']['home_board'] = {'id' => b.global_id}
      u.save
      Worker.process_queues
      Worker.process_queues
      User.where(:id => [u.id, u2.id]).update_all(:updated_at => 2.months.ago)
      b.settings['buttons'] = [{'id' => 1, 'label' => 'whatever'}]
      b.save
      expect(u2.reload.updated_at).to be < 2.weeks.ago
      Worker.process_queues
      expect(u2.reload.updated_at).to be > 2.weeks.ago
    end
    
    it "should call 'track_boards' if it's a new board update" do
      u = User.create
      b = Board.create(:user => u)
      UserBoardConnection.create(:board_id => b.id, :user_id => u.id)
      list = [u]
      expect(User).to receive(:where).with(:id => [u.id.to_s]).and_return(list)
      expect(list).to receive(:find_in_batches) do |opts, &block|
        expect(opts[:batch_size]).to eq(20)
        block.call(list);
      end
      expect(u).to receive(:track_boards).with('schedule')
      expect(u).to receive(:track_boards).with(no_args)
      b.update_affected_users(true)
    end
    
    it "should not call 'track_boards' if it's not a new board update" do
      u = User.create
      b = Board.create(:user => u)
      UserBoardConnection.create(:board_id => b.id, :user_id => u.id)
      list = [u]
      expect(User).to receive(:where).with(:id => [u.id.to_s]).and_return(list)
      expect(list).to receive(:find_in_batches) do |opts, &block|
        expect(u.instance_variable_get('@do_track_boards')).to eq(false)
        expect(opts[:batch_size]).to eq(20)
        block.call(list);
      end
      expect(u)
      expect(u).to receive(:track_boards).with(no_args)
      b.update_affected_users(false)
    end
    
    it "should not update users if nothing has changed" do
      u = User.create
      b = Board.create(:user => u)
      u.settings['preferences']['home_board'] = {'id' => b.global_id}
      u.save
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      User.where(:id => u.id).update_all(:updated_at => 2.months.ago)
      b.save
      expect(u.reload.updated_at).to be < 2.weeks.ago
      Worker.process_queues
      expect(u.reload.updated_at).to be < 2.weeks.ago
    end
  end
  
  describe "UserBoardConnection" do
    it "should touch connected users when a new sub-board of their home board is created" do
      u = User.create
      b = Board.create(:user => u)
      u.settings['preferences']['home_board'] = {'id' => b.global_id}
      u.save
      b2 = Board.create(:user => u)
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      User.where(:id => u.id).update_all(:updated_at => 2.months.ago)
      b.settings['buttons'] = [{'id' => 1, 'label' => 'water', 'load_board' => {'id' => b2.global_id}}]
      b.instance_variable_set('@buttons_changed', true)
      b.save
      expect(u.reload.updated_at).to be < 2.weeks.ago
      Worker.process_queues
      u.reload
      expect(u.reload.updated_at).to be > 2.weeks.ago
    end
  
    it "should touch supervisors of connected users when a new sub-board of their home board is created" do
      u = User.create
      u2 = User.create
      User.link_supervisor_to_user(u2, u)
      b = Board.create(:user => u)
      u.settings['preferences']['home_board'] = {'id' => b.global_id}
      u.save
      b2 = Board.create(:user => u)
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      User.where(:id => u2.id).update_all(:updated_at => 2.months.ago)
      b.settings['buttons'] = [{'id' => 1, 'label' => 'water', 'load_board' => {'id' => b2.global_id}}]
      b.instance_variable_set('@buttons_changed', true)
      b.save
      expect(u2.reload.updated_at).to be < 2.weeks.ago
      RemoteAction.process_all
      Worker.process_queues
      u.reload
      expect(u2.reload.updated_at).to be > 2.weeks.ago
    end
    
    it "should touch connected users when a sub-board of their home board is modified" do
      u = User.create
      b = Board.create(:user => u)
      u.settings['preferences']['home_board'] = {'id' => b.global_id}
      u.save
      b2 = Board.create(:user => u)
      b.settings['buttons'] = [{'id' => 1, 'label' => 'water', 'load_board' => {'id' => b2.global_id}}]
      b.instance_variable_set('@buttons_changed', true)
      b.save
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      b2.settings['buttons'] = [{'id' => 1, 'label' => 'wishing'}]
      b2.instance_variable_set('@buttons_changed', true)
      b2.save
      User.where(:id => u.id).update_all(:updated_at => 2.months.ago)
      expect(u.reload.updated_at).to be < 2.weeks.ago
      Worker.process_queues
      u.reload
      expect(u.reload.updated_at).to be > 2.weeks.ago
    end
    
    it "should touch supervisors of connected users when a sub-board of their home board is modified" do
      u = User.create
      u2 = User.create
      User.link_supervisor_to_user(u2, u)
      b = Board.create(:user => u)
      u.settings['preferences']['home_board'] = {'id' => b.global_id}
      u.save
      b2 = Board.create(:user => u)
      b.settings['buttons'] = [{'id' => 1, 'label' => 'water', 'load_board' => {'id' => b2.global_id}}]
      b.instance_variable_set('@buttons_changed', true)
      b.save
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      b2.settings['buttons'] = [{'id' => 1, 'label' => 'wishing'}]
      b2.instance_variable_set('@buttons_changed', true)
      b2.save
      User.where(:id => u2.id).update_all(:updated_at => 2.months.ago)
      expect(u2.reload.updated_at).to be < 2.weeks.ago
      Worker.process_queues
      u.reload
      expect(u2.reload.updated_at).to be > 2.weeks.ago
    end
  end
  
  describe "protected_material?" do
    it "should return the correct value" do
      b = Board.new
      expect(b.protected_material?).to eq(false)
    end
    
    it "should not allow a board to be public if it is unshareable" do
      u = User.create
      b = Board.create(:user => u)
      b.public = true
      expect(b).to receive(:unshareable?).and_return(true)
      b.save
      expect(b.public).to eq(false)
    end

    it "should allow a board to be public if it is not unshareable but has protected material" do
      u = User.create
      b = Board.create(:user => u)
      b.public = true
      expect(b).to receive(:unshareable?).and_return(false)
      b.save
      expect(b.public).to eq(true)
    end
    
    it "should allow demo boards to be public with protected material" do
      u = User.create
      b = Board.create(:user => u)
      b.settings['protected'] = {'demo' => true, 'vocabulary' => true}
      b.public = true
      expect(b.protected_material?).to eq(true)
      b.save
      expect(b.public).to eq(true)
    end
    
    it "should mark board as protected if referencing a protected image" do
      u = User.create
      bi = ButtonImage.create(:user => u, :settings => {'protected' => true})
      b = Board.create(:user => u)
      expect(b.protected_material?).to eq(false)
      b.process({
        'buttons' => [
          {'id' => 12, 'label' => 'course', 'image_id' => bi.global_id}
        ]
      })
      expect(b.protected_material?).to eq(true)
      expect(b.settings['protected']['media']).to eq(true)
    end

    it "should mark board as protected if referencing a protected sound" do
      u = User.create
      bs = ButtonSound.create(:user => u, :settings => {'protected' => true})
      b = Board.create(:user => u)
      expect(b.protected_material?).to eq(false)
      b.process({
        'buttons' => [
          {'id' => 12, 'label' => 'course', 'sound_id' => bs.global_id}
        ]
      })
      expect(b.protected_material?).to eq(true)
      expect(b.settings['protected']['media']).to eq(true)
    end
    
    it "should clear a board's protected media status if no protected images or sounds" do
      u = User.create
      bi = ButtonImage.create(:user => u, :settings => {'protected' => true})
      b = Board.create(:user => u)
      expect(b.protected_material?).to eq(false)
      b.process({
        'buttons' => [
          {'id' => 12, 'label' => 'course', 'image_id' => bi.global_id}
        ]
      })
      expect(b.protected_material?).to eq(true)
      expect(b.settings['protected']['media']).to eq(true)
      b.process({
        'buttons' => [
          {'id' => 12, 'label' => 'course'}
        ]
      })
      expect(b.protected_material?).to eq(false)
      expect(b.settings['protected']['media']).to eq(false)
    end
    
    it "should mark a board as protected when created with protected images" do
      u = User.create
      bi = ButtonImage.create(:user => u, :settings => {'protected' => true})
      b = Board.process_new({
        'buttons' => [
          {'id' => 12, 'label' => 'course', 'image_id' => bi.global_id}
        ]
      }, {'user' => u})
      expect(b.protected_material?).to eq(true)
      expect(b.settings['protected']['media']).to eq(true)
    end
  end
  
  describe "translate_set" do
    it "should return done if user_id doesn't match" do
      u = User.create
      b = Board.create(:user => u)
      res = b.translate_set({}, 
      { 
        'source' => 'en', 
        'dest' => 'es', 
        'boards_ids' => [b.global_id], 
        'default' => true, 
        'user_key' => 'asdf', 
        'user_local_id' => 1234
      })
      expect(res).to eq({done: true, translated: false, reason: 'mismatched user'})
    end
    
    it "should do nothing if the board's locale already matches the desired locale" do
      u = User.create
      b = Board.create(:user => u, :settings => {'locale' => 'es'})
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'hat'},
        {'id' => 2, 'label' => 'cat'}
      ]
      b.save
      res = b.translate_set({'hat' => 'sat', 'cat' => 'rat'}, {
        'source' => 'en', 
        'dest' => 'es', 
        'board_ids' => [b.global_id]
      })
      expect(res[:done]).to eq(true)
      expect(b.settings['buttons'][0]['label']).to eq('hat')
    end
    
    it "should translate correct boards" do
      u = User.create
      b = Board.create(:user => u)
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'hat'},
        {'id' => 2, 'label' => 'cat'}
      ]
      b.settings['name'] = 'radish'
      b.save
      res = b.translate_set({'hat' => 'sat', 'cat' => 'rat'}, {
        'source' => 'en', 
        'dest' => 'es', 
        'board_ids' => [b.global_id]
      })
      expect(res[:done]).to eq(true)
      expect(b.settings['buttons'][0]['label']).to eq('sat')
      expect(b.settings['translations']).to eq({
        'default' => 'en',
        'current_label' => 'es',
        'current_vocalization' => 'es',
        'board_name' => {'en' => 'radish'},
        '1' => {
          'en' => {'label' => 'hat'},
          'es' => {'label' => 'sat'}
        },
        '2' => {
          'en' => {'label' => 'cat'},
          'es' => {'label' => 'rat'}
        }
      })
    end
    
    it "should keep translations after multiple iterations" do
      u = User.create
      b = Board.create(:user => u)
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'hat'},
        {'id' => 2, 'label' => 'cat'}
      ]
      b.save
      res = b.translate_set({'hat' => 'sat', 'cat' => 'rat'}, {
        'source' => 'en', 
        'dest' => 'es', 
        'board_ids' => [b.global_id]
      })
      expect(res[:done]).to eq(true)
      expect(b.settings['buttons'][0]['label']).to eq('sat')
      expect(b.settings['translations']).to eq({
        'default' => 'en',
        'current_label' => 'es',
        'current_vocalization' => 'es',
        'board_name' => {},
        '1' => {
          'en' => {'label' => 'hat'},
          'es' => {'label' => 'sat'}
        },
        '2' => {
          'en' => {'label' => 'cat'},
          'es' => {'label' => 'rat'}
        }
      })
      
      b.reload
      res = b.translate_set({'sat' => 'yat', 'rat' => 'eat'}, {
        'source' => 'es', 
        'dest' => 'fr', 
        'board_ids' => [b.global_id]
      })
      expect(res[:done]).to eq(true)
      expect(b.settings['buttons'][0]['label']).to eq('yat')
      expect(b.settings['translations']).to eq({
        'default' => 'en',
        'current_label' => 'fr',
        'current_vocalization' => 'fr',
        "board_name" => {},
        '1' => {
          'en' => {'label' => 'hat'},
          'es' => {'label' => 'sat'},
          'fr' => {'label' => 'yat'}
        },
        '2' => {
          'en' => {'label' => 'cat'},
          'es' => {'label' => 'rat'},
          'fr' => {'label' => 'eat'}
        }
      })
    end

    it "should translate but not switch if specified" do
      u = User.create
      b = Board.create(:user => u)
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'hat'},
        {'id' => 2, 'label' => 'cat'}
      ]
      b.settings['name'] = "my board"
      b.save
      res = b.translate_set({'hat' => 'sat', 'cat' => 'rat', 'my board' => 'boardiness'}, {
        'source' => 'en', 
        'dest' => 'es', 
        'board_ids' => [b.global_id], 
        'default' => false
      })
      expect(res[:done]).to eq(true)
      expect(b.settings['buttons'][0]['label']).to eq('hat')
      expect(b.settings['translations']).to eq({
        'default' => 'en',
        'current_label' => 'en',
        'current_vocalization' => 'en',
        'board_name' => {'en' => 'my board', 'es' => 'boardiness'},
        '1' => {
          'en' => {'label' => 'hat'},
          'es' => {'label' => 'sat'}
        },
        '2' => {
          'en' => {'label' => 'cat'},
          'es' => {'label' => 'rat'}
        }
      })
    end
    
    it "should recursively update only the correct boards" do
      u = User.create
      b1 = Board.create(:user => u)
      b2 = Board.create(:user => u, :settings => {'locale' => 'es'})
      b3 = Board.create(:user => u)
      b4 = Board.create(:user => u)
      b5 = Board.create(:user => u)
      b1.settings['buttons'] = [
        {'id' => 1, 'label' => 'hat', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}},
        {'id' => 2, 'label' => 'cat', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}},
        {'id' => 2, 'label' => 'rat', 'load_board' => {'id' => b5.global_id, 'key' => b5.key}}
      ]
      b1.save
      b2.settings['buttons'] = [
        {'id' => 1, 'label' => 'fat', 'load_board' => {'id' => b4.global_id, 'key' => b4.key}}
      ]
      b2.save
      b3.settings['buttons'] = [
        {'id' => 1, 'label' => 'cheese', 'vocalization' => 'hat'}
      ]
      b3.save
      b4.settings['buttons'] = [
        {'id' => 1, 'label' => 'hat', 'load_board' => {'id' => b1.global_id, 'key' => b1.key}}
      ]
      b4.save
      b5.settings['buttons'] = [
        {'id' => 1, 'label' => 'hat'}
      ]
      b5.save
      
      res = b1.translate_set({'hat' => 'top', 'cat' => 'feline', 'rat' => 'mouse', 'fat' => 'lard'}, {
        'source' => 'en', 
        'dest' => 'es', 
        'board_ids' => [b1.global_id, b2.global_id, b3.global_id, b4.global_id]
      })
      expect(res[:done]).to eq(true)
      expect(b1.reload.settings['buttons'].map{|b| b['label'] }).to eq(['top', 'feline', 'mouse'])
      expect(b2.reload.settings['buttons'].map{|b| b['label'] }).to eq(['fat']) # already translated
      expect(b3.reload.settings['buttons'].map{|b| b['label'] }).to eq(['cheese'])
      expect(b3.reload.settings['buttons'].map{|b| b['vocalization'] }).to eq(['top'])
      expect(b4.reload.settings['buttons'].map{|b| b['label'] }).to eq(['top'])
      expect(b5.reload.settings['buttons'].map{|b| b['label'] }).to eq(['hat'])
    end

    it "should not recurse beyond an unrecognized board" do
      u = User.create
      b1 = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b3 = Board.create(:user => u)
      b4 = Board.create(:user => u)
      b5 = Board.create(:user => u)
      b1.settings['buttons'] = [
        {'id' => 1, 'label' => 'hat', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}},
        {'id' => 2, 'label' => 'cat', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}},
        {'id' => 2, 'label' => 'rat', 'load_board' => {'id' => b5.global_id, 'key' => b5.key}}
      ]
      b1.save
      b2.settings['buttons'] = [
        {'id' => 1, 'label' => 'fat', 'load_board' => {'id' => b4.global_id, 'key' => b4.key}}
      ]
      b2.save
      b3.settings['buttons'] = [
        {'id' => 1, 'label' => 'cheese', 'vocalization' => 'hat'}
      ]
      b3.save
      b4.settings['buttons'] = [
        {'id' => 1, 'label' => 'hat', 'load_board' => {'id' => b1.global_id, 'key' => b1.key}}
      ]
      b4.save
      b5.settings['buttons'] = [
        {'id' => 1, 'label' => 'hat'}
      ]
      b5.save
      
      res = b1.translate_set({'hat' => 'top', 'cat' => 'feline', 'rat' => 'mouse', 'fat' => 'lard'}, {
        'source' => 'en', 
        'dest' => 'es', 
        'board_ids' => [b1.global_id, b3.global_id, b4.global_id]
      })
      expect(res[:done]).to eq(true)
      expect(b1.reload.settings['buttons'].map{|b| b['label'] }).to eq(['top', 'feline', 'mouse'])
      expect(b2.reload.settings['buttons'].map{|b| b['label'] }).to eq(['fat'])
      expect(b3.reload.settings['buttons'].map{|b| b['label'] }).to eq(['cheese'])
      expect(b3.reload.settings['buttons'].map{|b| b['vocalization'] }).to eq(['top'])
      expect(b4.reload.settings['buttons'].map{|b| b['label'] }).to eq(['hat'])
      expect(b5.reload.settings['buttons'].map{|b| b['label'] }).to eq(['hat'])
    end
    
    it "should remember button-level translations" do
      u = User.create
      b = Board.create(:user => u)
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'hat'},
        {'id' => 2, 'label' => 'cat'}
      ]
      b.save
      res = b.translate_set({'hat' => 'sat', 'cat' => 'rat'}, {
        'source' => 'en', 
        'dest' => 'es', 
        'board_ids' => [b.global_id]
      })
      expect(res[:done]).to eq(true)
      expect(b.settings['buttons'][0]['label']).to eq('sat')
      expect(b.settings['translations']).to eq({
        'default' => 'en',
        'current_label' => 'es',
        'current_vocalization' => 'es',
        'board_name' => {},
        '1' => {
          'en' => {
            'label' => 'hat'
          },
          'es' => {
            'label' => 'sat'
          }
        },
        '2' => {
          'en' => {
            'label' => 'cat'
          },
          'es' => {
            'label' => 'rat'
          }
        }
      })
    end

    it "should write a version for any boards that are translated" do
      u = User.create
      b = Board.create(:user => u)
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'hat'},
        {'id' => 2, 'label' => 'cat'}
      ]
      b.save
      Worker.process_queues
      Worker.process_queues
      versions = b.reload.versions.count

      b.schedule(:translate_set, {'hat' => 'sat', 'cat' => 'rat'}, {
        'source' => 'en', 
        'dest' => 'es', 
        'board_ids' => [b.global_id]
      })
      Worker.process_queues
      expect(b.reload.versions.count).to eq(versions + 1)
    end

    it "should allow for using existing known translations when translating if specified" do
      u = User.create
      b1 = Board.create(:user => u)
      b2 = Board.create(:user => u, :settings => {'locale' => 'es'})
      b3 = Board.create(:user => u)
      b4 = Board.create(:user => u)
      b5 = Board.create(:user => u)
      b1.settings['buttons'] = [
        {'id' => 1, 'label' => 'hat', 'vocalization' => 'cap', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}},
        {'id' => 2, 'label' => 'cat', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}},
        {'id' => 3, 'label' => 'rat', 'load_board' => {'id' => b5.global_id, 'key' => b5.key}}
      ]
      b1.settings['translations'] = {
        '1' => {'es' => {'label' => 'top'}},
        '2' => {'es' => {'label' => 'feline', 'vocalization' => 'meow'}},
        '3' => {'es' => {'label' => 'mouse'}}
      }
      b1.save
      b2.settings['buttons'] = [
        {'id' => 1, 'label' => 'fat', 'load_board' => {'id' => b4.global_id, 'key' => b4.key}}
      ]
      b2.settings['translations'] = {
        '1' => {'es' => {'label' => 'lard'}}
      }
      b2.save
      b3.settings['buttons'] = [
        {'id' => 1, 'label' => 'cheese', 'vocalization' => 'hat'}
      ]
      b3.settings['translations'] = {
        '1' => {'es' => {'vocalization' => 'top'}}
      }
      b3.save
      b4.settings['buttons'] = [
        {'id' => 1, 'label' => 'hat', 'load_board' => {'id' => b1.global_id, 'key' => b1.key}}
      ]
      b4.settings['translations'] = {
        '1' => {'es' => {'label' => 'frog'}}
      }
      b4.save
      b5.settings['buttons'] = [
        {'id' => 1, 'label' => 'hat'}
      ]
      b5.settings['translations'] = {
        '1' => {'es' => {'label' => 'top', 'vocalization' => 'wut'}}
      }
      b5.save
      
      # 'hat' => 'top', 'cat' => 'feline', 'rat' => 'mouse', 'fat' => 'lard'
      res = b1.translate_set({}, {
        'source' => 'en', 
        'dest' => 'es', 
        'allow_fallbacks' => true,
        'board_ids' => [b1.global_id, b2.global_id, b3.global_id, b4.global_id]
      })
      expect(res[:done]).to eq(true)
      expect(b1.reload.settings['buttons'].map{|b| b['label'] }).to eq(['top', 'feline', 'mouse'])
      expect(b1.reload.settings['buttons'].map{|b| b['vocalization'] }).to eq([nil, 'meow', nil])
      expect(b2.reload.settings['buttons'].map{|b| b['label'] }).to eq(['fat']) # already translated
      expect(b2.reload.settings['buttons'].map{|b| b['vocalization'] }).to eq([nil])
      expect(b3.reload.settings['buttons'].map{|b| b['label'] }).to eq([nil])
      expect(b3.reload.settings['buttons'].map{|b| b['vocalization'] }).to eq(['top'])
      expect(b4.reload.settings['buttons'].map{|b| b['label'] }).to eq(['frog'])
      expect(b4.reload.settings['buttons'].map{|b| b['vocalization'] }).to eq([nil])
      expect(b5.reload.settings['buttons'].map{|b| b['label'] }).to eq(['hat']) # not in to-translate list
      expect(b5.reload.settings['buttons'].map{|b| b['vocalization'] }).to eq([nil])
    end

    it 'should track image uses with new strings on the correct locale' do
      u = User.create
      b = Board.create(:user => u)
      bi1 = ButtonImage.create(user: u, board: b, settings: {external_id: 'adf'}, url: 'http://www.example.com/pic1.png')
      bi2 = ButtonImage.create(user: u, board: b, settings: {external_id: 'qwe'}, url: 'http://www.example.com/pic1.png')

      b.process({'buttons' => [
        {'id' => 1, 'label' => 'hat', 'image_id' => bi1.global_id},
        {'id' => 2, 'label' => 'cat', 'image_id' => bi2.global_id}
      ], 'public' => true, 'visibility' => 'public'}, {'user' => u})
      expect(b.known_button_images.count).to eq(2)
      Worker.process_queues
      Worker.process_queues
      versions = b.reload.versions.count

      expect(ButtonImage).to receive(:track_images) do |list|
        expect(list).to eq([
          {
            "id":bi1.global_id,
            "label":"sat",
            "user_id":u.global_id,
            "external_id":"adf",
            "locale":"es"},
          {
            "id":bi2.global_id,
            "label":"rat",
            "user_id":u.global_id,
            "external_id":"qwe",
            "locale":"es"}
        ])
      end
      b.schedule(:translate_set, {'hat' => 'sat', 'cat' => 'rat'}, {
        'source' => 'en', 
        'dest' => 'es', 
        'board_ids' => [b.global_id]
      })
      Worker.process_queues
      expect(b.reload.versions.count).to eq(versions + 1)
    end

    it "should work for boards with board_content" do
      u = User.create
      b1 = Board.create(:user => u)
      b2 = Board.create(:user => u, :settings => {'locale' => 'es'})
      b3 = Board.create(:user => u)
      b4 = Board.create(:user => u)
      b5 = Board.create(:user => u)
      b1.settings['buttons'] = [
        {'id' => 1, 'label' => 'hat', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}},
        {'id' => 2, 'label' => 'cat', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}},
        {'id' => 3, 'label' => 'rat', 'load_board' => {'id' => b5.global_id, 'key' => b5.key}}
      ]
      bc1 = BoardContent.new(settings: {})
      bc1.settings['buttons'] = b1.settings['buttons']
      bc1.save
      b1.board_content = bc1
      b1.save
      b2.settings['buttons'] = [
        {'id' => 1, 'label' => 'fat', 'load_board' => {'id' => b4.global_id, 'key' => b4.key}}
      ]
      b2.save
      b3.settings['buttons'] = [
        {'id' => 1, 'label' => 'cheese', 'vocalization' => 'hat'}
      ]
      b3.save
      b4.settings['buttons'] = [
        {'id' => 1, 'label' => 'hat', 'load_board' => {'id' => b1.global_id, 'key' => b1.key}}
      ]
      bc4 = BoardContent.new(settings: {})
      bc4.settings['buttons'] = b4.settings['buttons']
      bc4.save
      b4.board_content = bc4
      b4.save
      b5.settings['buttons'] = [
        {'id' => 1, 'label' => 'hat'}
      ]
      b5.save
      
      res = b1.translate_set({'hat' => 'top', 'cat' => 'feline', 'rat' => 'mouse', 'fat' => 'lard'}, {
        'source' => 'en', 
        'dest' => 'es', 
        'board_ids' => [b1.global_id, b2.global_id, b3.global_id, b4.global_id]
      })
      expect(res[:done]).to eq(true)
      expect(b1.reload.buttons.map{|b| b['label'] }).to eq(['top', 'feline', 'mouse'])
      expect(b2.reload.buttons.map{|b| b['label'] }).to eq(['fat']) # already translated
      expect(b3.reload.buttons.map{|b| b['label'] }).to eq(['cheese'])
      expect(b3.reload.buttons.map{|b| b['vocalization'] }).to eq(['top'])
      expect(b4.reload.buttons.map{|b| b['label'] }).to eq(['top'])
      expect(b5.reload.buttons.map{|b| b['label'] }).to eq(['hat'])
    end
  end

  describe 'update_privacy' do
    it 'should return on an empty library' do
      b = Board.new
      expect(b.update_privacy(nil, nil, nil)).to eq({done: true, updated: false, reason: 'no privacy level specified'})
      expect(b.update_privacy('', nil, nil)).to eq({done: true, updated: false, reason: 'no privacy level specified'})
    end
    
    it 'should return on a mismatched board' do
      b = Board.new
      expect(b.update_privacy('public', nil, [], 'asdf')).to eq({done: true, updated: false, reason: 'mismatched user'})
    end
    
    it 'should update privacy level' do
      u = User.create
      b = Board.create(:user => u)
      b.save
      res = b.update_privacy('public', u, [])
      expect(res).to eq({done: true, privacy_level: 'public', board_ids: [], updated: [b.global_id], visited: [b.global_id]})
      b.reload
      expect(b.public).to eq(true)
      expect(b.settings['unlisted']).to eq(false)
    end
    
    it 'should skip boards if not in list' do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u, :key => "#{u.user_name}/keyboard")
      b3 = Board.create(:user => u)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'cats', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {user: u})
      b2.process({'buttons' => [
        {'id' => 2, 'label' => 'hats', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}
      ]}, {user: u})
      b3.process({'buttons' => [
        {'id' => 3, 'label' => 'flats'}
      ]}, {user: u})
      Worker.process_queues
      expect(b.reload.settings['downstream_board_ids']).to eq([b2.global_id, b3.global_id])
      expect(b2.reload.settings['downstream_board_ids']).to eq([b3.global_id])
      
      list = [b.global_id, b3.global_id]
      res = b.update_privacy('unlisted', u, list)
      b.reload
      expect(b.public).to eq(true)
      expect(b.settings['unlisted']).to eq(true)
      b2.reload
      expect(b2.public).to eq(false)
      expect(b2.settings['unlisted']).to eq(nil)
      b3.reload
      expect(b3.public).to eq(false)
      expect(b3.settings['unlisted']).to eq(nil)
    end
    
    it 'should recursively find boards' do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b3 = Board.create(:user => u)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'cats', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {user: u})
      b2.process({'buttons' => [
        {'id' => 2, 'label' => 'hats', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}
      ]}, {user: u})
      b3.process({'buttons' => [
        {'id' => 3, 'label' => 'flats'}
      ]}, {user: u})
      Worker.process_queues
      expect(b.reload.settings['downstream_board_ids']).to eq([b2.global_id, b3.global_id])
      expect(b2.reload.settings['downstream_board_ids']).to eq([b3.global_id])
      
      res = b.update_privacy('public', u, [b.global_id, b2.global_id, b3.global_id])
      expect(res).to eq({done: true, privacy_level: 'public', board_ids: [b.global_id, b2.global_id, b3.global_id], updated: [b.global_id, b2.global_id, b3.global_id], visited: [b.global_id, b2.global_id, b3.global_id]})
      expect(b.reload.settings['unlisted']).to eq(false)
      expect(b.reload.public).to eq(true)
      expect(b2.reload.settings['unlisted']).to eq(false)
      expect(b2.reload.public).to eq(true)
      expect(b3.reload.settings['unlisted']).to eq(false)
      expect(b3.reload.public).to eq(true)
    end
    
    it 'should stop when the user no longer matches' do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u, :public => true)
      b2 = Board.create(:user => u2, :public => true)
      b3 = Board.create(:user => u, :public => true)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'cats', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {user: u2})
      b2.process({'buttons' => [
        {'id' => 2, 'label' => 'hats', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}
      ]}, {user: u})
      b3.process({'buttons' => [
        {'id' => 3, 'label' => 'flats'}
      ]}, {user: u})
      Worker.process_queues
      expect(b.reload.settings['downstream_board_ids']).to eq([b2.global_id, b3.global_id])
      expect(b2.reload.settings['downstream_board_ids']).to eq([b3.global_id])
      
      res = b.update_privacy('private', u, [b.global_id, b2.global_id, b3.global_id])
      expect(res).to eq({done: true, privacy_level: 'private', board_ids: [b.global_id, b2.global_id, b3.global_id], updated: [b.global_id], visited: [b.global_id, b2.global_id]})
      expect(b.reload.public).to eq(false)
      expect(b2.reload.public).to eq(true)
      expect(b3.reload.public).to eq(true)
    end
    
    it 'should only find boards it can access' do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b3 = Board.create(:user => u)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'cats', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {user: u})
      b2.process({'buttons' => [
        {'id' => 2, 'label' => 'hats', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}
      ]}, {user: u})
      b3.process({'buttons' => [
        {'id' => 3, 'label' => 'flats'}
      ]}, {user: u})
      Worker.process_queues
      expect(b.reload.settings['downstream_board_ids']).to eq([b2.global_id, b3.global_id])
      expect(b2.reload.settings['downstream_board_ids']).to eq([b3.global_id])
      
      res = b.update_privacy('public', u, [b.global_id, b3.global_id])
      expect(res).to eq({done: true, privacy_level: 'public', board_ids: [b.global_id, b3.global_id], updated: [b.global_id], visited: [b.global_id, b2.global_id]})
      expect(b.reload.public).to eq(true)
      expect(b2.reload.public).to eq(false)
      expect(b3.reload.public).to eq(false)
    end

    it "should allow batch updating shallow clones" do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u, public: true)
      b2 = Board.create(:user => u, public: true)
      b3 = Board.create(:user => u)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'cats', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {user: u})
      b2.process({'buttons' => [
        {'id' => 2, 'label' => 'hats', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}
      ]}, {user: u})
      b3.process({'buttons' => [
        {'id' => 3, 'label' => 'flats'}
      ]}, {user: u})
      Worker.process_queues
      Worker.process_queues
      b.reload.track_downstream_boards!
      b2.reload.track_downstream_boards!
      expect(b.reload.settings['downstream_board_ids']).to eq([b2.global_id, b3.global_id])
      expect(b2.reload.settings['downstream_board_ids']).to eq([b3.global_id])

      bb1 = Board.find_by_global_id("#{b.global_id}-#{u2.global_id}")
      expect(bb1.id).to eq(b.id)
      res = bb1.update_privacy('unlisted', u, [bb1.global_id, "#{b2.global_id}-#{u2.global_id}", "#{b3.global_id}-#{u2.global_id}"])
      expect(res).to eq({done: true, privacy_level: 'unlisted', board_ids: [bb1.global_id, "#{b2.global_id}-#{u2.global_id}", "#{b3.global_id}-#{u2.global_id}"], updated: [bb1.global_id, "#{b2.global_id}-#{u2.global_id}"], visited: [bb1.global_id, "#{b2.global_id}-#{u2.global_id}", "#{b3.global_id}-#{u2.global_id}"]})
      expect(b.reload.public).to eq(true)
      expect(b2.reload.public).to eq(true)
      expect(b3.reload.public).to eq(false)
      bb1 = Board.find_by_global_id("#{b.global_id}-#{u2.global_id}")
      expect(bb1.id).to_not eq(b.id)
      expect(bb1.public).to eq(true)
      expect(bb1.settings['unlisted']).to eq(true)
      bb2 = Board.find_by_global_id("#{b2.global_id}-#{u2.global_id}")
      expect(bb2.id).to_not eq(b2.id)
      expect(bb2.public).to eq(true)
      expect(bb2.settings['unlisted']).to eq(true)
      bb3 = Board.find_by_global_id("#{b3.global_id}-#{u2.global_id}")
      expect(bb3.id).to eq(b3.id)
      expect(bb3.public).to eq(false)
    end
  end
  
  describe 'swap_images' do
    it 'should return on an empty library' do
      b = Board.new
      expect(b.swap_images(nil, nil, nil)).to eq({done: true, id: nil, swapped: false, reason: 'no library specified'})
      expect(b.swap_images('', nil, nil)).to eq({done: true, id: nil, swapped: false, reason: 'no library specified'})
    end
    
    it 'should return on a mismatched board' do
      b = Board.new
      expect(b.swap_images('arasaac', nil, [], 'asdf')).to eq({done: true, id: nil, swapped: false, reason: 'mismatched user'})
    end
    
    it 'should call Uploader.find_image for all image buttons' do
      u = User.create
      b = Board.create(:user => u)
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'hats', 'image_id' => 'whatever'},
        {'id' => 2, 'label' => 'cats', 'image_id' => 'another'}
      ]
      b.save
      expect(Uploader).to receive(:find_images).with('hats', 'bacon', 'en', u, nil, true, false).and_return([])
      expect(Uploader).to receive(:find_images).with('cats', 'bacon', 'en', u, nil, true, false).and_return([{
        'url' => 'http://www.example.com/pic.png',
        'content_type' => 'image/png'
      }])
      res = b.swap_images('bacon', u, [])
      expect(res).to eq({done: true, id: b.global_id, library: 'bacon', board_ids: [], updated: [b.global_id], visited: [b.global_id]})
    end
    
    it 'should create and set button images for changed images, including creating board_button_image connections' do
      u = User.create
      b = Board.create(:user => u)
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'hats', 'image_id' => 'whatever'},
        {'id' => 2, 'label' => 'cats', 'image_id' => 'another'}
      ]
      b.save
      expect(Uploader).to receive(:find_images).with('hats', 'bacon', 'en', u, nil, true, false).and_return([])
      expect(Uploader).to receive(:find_images).with('cats', 'bacon', 'en', u, nil, true, false).and_return([{
        'url' => 'http://www.example.com/pic.png',
        'content_type' => 'image/png'
      }])
      res = b.swap_images('bacon', u, [])
      expect(res).to eq({done: true, id: b.global_id, library: 'bacon', board_ids: [], updated: [b.global_id], visited: [b.global_id]})
      b.reload
      b.instance_variable_set('@map_later', nil)
      b.save
      img = ButtonImage.last
      expect(b.reload.known_button_images.to_a).to eq([img])
      expect(b.settings['buttons']).to eq([
        {'id' => 1, 'label' => 'hats', 'image_id' => 'whatever'},
        {'id' => 2, 'label' => 'cats', 'image_id' => img.global_id}
      ])
    end
    
    it 'should do nothing when no images found' do
      u = User.create
      b = Board.create(:user => u)
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'hats', 'image_id' => 'whatever'},
        {'id' => 2, 'label' => 'cats', 'image_id' => 'another'}
      ]
      b.save
      expect(b).to_not receive(:save)
      expect(Uploader).to receive(:find_images).with('hats', 'bacon', 'en', u, nil, true, false).and_return([])
      expect(Uploader).to receive(:find_images).with('cats', 'bacon', 'en', u, nil, true, false).and_return([])
      res = b.swap_images('bacon', u, [])
      expect(res).to eq({done: true, id: b.global_id, library: 'bacon', board_ids: [], updated: [b.global_id], visited: [b.global_id]})
    end

    it 'should do nothing when asking for premium images but not enabled' do
      u = User.create
      u.settings['extras_disabled'] = true;
      u.save
      b = Board.create(:user => u)
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'hats', 'image_id' => 'whatever'},
        {'id' => 2, 'label' => 'cats', 'image_id' => 'another'}
      ]
      b.save
      res = b.swap_images('pcs', u, [])
      expect(res).to eq({done: true, id: b.global_id, swapped: false, reason: "not authorized to access premium library"})
    end

    it 'should look up default images for a quicker lookup process' do
      u = User.create
      b = Board.create(:user => u)
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'hats', 'image_id' => 'whatever'},
        {'id' => 2, 'label' => 'cats', 'image_id' => 'another'}
      ]
      b.save
      expect(Uploader).to receive(:default_images).with('bacon', ['hats', 'cats'], 'en', u, true, false).and_return({
        'cats' => {
          'url' => 'http://www.example.com/pic.png',
          'content_type' => 'image/png'
        }
      })
      expect(Uploader).to receive(:find_images).with('hats', 'bacon', 'en', u, nil, true, false).and_return([])
      expect(Uploader).to_not receive(:find_images).with('cats', 'bacon', 'en', u, nil, true, false)
      res = b.swap_images('bacon', u, [])
      expect(res).to eq({done: true, id: b.global_id, library: 'bacon', board_ids: [], updated: [b.global_id], visited: [b.global_id]})
    end

    it 'should skip keyboard boards if specified' do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u, :key => "#{u.user_name}/keyboard")
      b3 = Board.create(:user => u)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'cats', 'image_id' => 'asdf', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {user: u})
      b2.process({'buttons' => [
        {'id' => 2, 'label' => 'hats', 'image_id' => 'asdf', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}
      ]}, {user: u})
      b3.process({'buttons' => [
        {'id' => 3, 'label' => 'flats', 'image_id' => 'asdf'}
      ]}, {user: u})
      Worker.process_queues
      expect(b.reload.settings['downstream_board_ids']).to eq([b2.global_id, b3.global_id])
      expect(b2.reload.settings['downstream_board_ids']).to eq([b3.global_id])
      
      expect(Uploader).to_not receive(:find_images).with('hats', 'bacon', 'en', u, nil, true, false)
      expect(Uploader).to receive(:find_images).with('cats', 'bacon', 'en', u, nil, true, false).and_return([{
        'url' => 'http://www.example.com/cat.png', 'content_type' => 'image/png'
      }])
      expect(Uploader).to_not receive(:find_images).with('flats', 'bacon', 'en', u, nil, true, false)
      list = [b.global_id, b2.global_id, b3.global_id]
      list.instance_variable_set('@skip_keyboard', true)
      res = b.swap_images('bacon', u, list)
    end
    
    it 'should not error on buttons with no images' do
      u = User.create
      b = Board.create(:user => u)
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'hats', 'image_id' => 'asdf'},
        {'id' => 2, 'label' => 'cats', 'image_id' => 'asdf'}
      ]
      b.save
      expect(Uploader).to receive(:find_images).with('hats', 'bacon', 'en', u, nil, true, false).and_return([])
      expect(Uploader).to receive(:find_images).with('cats', 'bacon', 'en', u, nil, true, false).and_return([{
        'url' => 'http://www.example.com/pic.png',
        'content_type' => 'image/png'
      }])
      res = b.swap_images('bacon', u, [])
      expect(res).to eq({done: true, id: b.global_id, library: 'bacon', board_ids: [], updated: [b.global_id], visited: [b.global_id]})
      img = ButtonImage.last
      expect(b.settings['buttons']).to eq([
        {'id' => 1, 'label' => 'hats', 'image_id' => 'asdf'},
        {'id' => 2, 'label' => 'cats', 'image_id' => img.global_id}
      ])
    end
    
    it 'should recursively find boards' do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b3 = Board.create(:user => u)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'cats', 'image_id' => 'asdf', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {user: u})
      b2.process({'buttons' => [
        {'id' => 2, 'label' => 'hats', 'image_id' => 'asdf', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}
      ]}, {user: u})
      b3.process({'buttons' => [
        {'id' => 3, 'label' => 'flats'}
      ]}, {user: u})
      Worker.process_queues
      expect(b.reload.settings['downstream_board_ids']).to eq([b2.global_id, b3.global_id])
      expect(b2.reload.settings['downstream_board_ids']).to eq([b3.global_id])
      
      expect(Uploader).to receive(:find_images).with('hats', 'bacon', 'en', u, nil, true, false).and_return([{
        'url' => 'http://www.example.com/hat.png', 'content_type' => 'image/png'
      }])
      expect(Uploader).to receive(:find_images).with('cats', 'bacon', 'en', u, nil, true, false).and_return([{
        'url' => 'http://www.example.com/cat.png', 'content_type' => 'image/png'
      }])
      expect(Uploader).to_not receive(:find_images).with('flats', 'bacon', 'en', u, nil, true, false)
      res = b.swap_images('bacon', u, [b.global_id, b2.global_id])
      Worker.process_queues
      bis = b.reload.known_button_images
      expect(bis.count).to eq(1)
      bi = bis[0]
      bis2 = b2.reload.known_button_images
      expect(bis2.count).to eq(1)
      bi2 = bis2[0]
      bis3 = b3.reload.known_button_images
      expect(bis3.count).to eq(0)
      expect(res).to eq({done: true, library: 'bacon', id: b.global_id, board_ids: [b.global_id, b2.global_id], updated: [b.global_id, b2.global_id], visited: [b.global_id, b2.global_id, b3.global_id]})
      expect(b.reload.settings['buttons']).to eq([
        {'id' => 1, 'label' => 'cats', 'image_id' => bi.global_id, 'load_board' => {'id' => b2.global_id, 'key' => b2.key}, 'hidden' => false, 'hide_label' => false, 'link_disabled' => false, 'text_only' => false}
      ])
      expect(b2.reload.settings['buttons']).to eq([
        {'id' => 2, 'label' => 'hats', 'image_id' => bi2.global_id, 'load_board' => {'id' => b3.global_id, 'key' => b3.key}, 'hidden' => false, 'hide_label' => false, 'link_disabled' => false, 'text_only' => false}
      ])
      expect(b3.reload.settings['buttons']).to eq([
        {'id' => 3, 'label' => 'flats', 'hidden' => false, 'hide_label' => false, 'text_only' => false}
      ])
    end
    
    it 'should include unlisted board ids that match the copy_id' do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b3 = Board.create(:user => u)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'cats', 'image_id' => 'asdf', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {user: u})
      b2.process({'buttons' => [
        {'id' => 2, 'label' => 'hats', 'image_id' => 'asdf', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}
      ]}, {user: u})
      b2.settings['copy_id'] = b.global_id
      b2.save
      b3.process({'buttons' => [
        {'id' => 3, 'label' => 'flats'}
      ]}, {user: u})
      Worker.process_queues
      expect(b.reload.settings['downstream_board_ids']).to eq([b2.global_id, b3.global_id])
      expect(b2.reload.settings['downstream_board_ids']).to eq([b3.global_id])
      
      expect(Uploader).to receive(:find_images).with('hats', 'bacon', 'en', u, nil, true, false).and_return([{
        'url' => 'http://www.example.com/hat.png', 'content_type' => 'image/png'
      }])
      expect(Uploader).to receive(:find_images).with('cats', 'bacon', 'en', u, nil, true, false).and_return([{
        'url' => 'http://www.example.com/cat.png', 'content_type' => 'image/png'
      }])
      expect(Uploader).to_not receive(:find_images).with('flats', 'bacon', 'en', u, nil, true, false)
      res = b.swap_images('bacon', u, [b.global_id, "new:#{b.global_id}"])
      Worker.process_queues
      bis = b.reload.known_button_images
      expect(bis.count).to eq(1)
      bi = bis[0]
      bis2 = b2.reload.known_button_images
      expect(bis2.count).to eq(1)
      bi2 = bis2[0]
      bis3 = b3.reload.known_button_images
      expect(bis3.count).to eq(0)
      expect(res).to eq({done: true, id: b.global_id, library: 'bacon', board_ids: [b.global_id, "new:#{b.global_id}"], updated: [b.global_id, b2.global_id], visited: [b.global_id, b2.global_id, b3.global_id]})
      expect(b.reload.settings['buttons']).to eq([
        {'id' => 1, 'label' => 'cats', 'image_id' => bi.global_id, 'load_board' => {'id' => b2.global_id, 'key' => b2.key}, 'hidden' => false, 'hide_label' => false, 'link_disabled' => false, 'text_only' => false}
      ])
      expect(b2.reload.settings['buttons']).to eq([
        {'id' => 2, 'label' => 'hats', 'image_id' => bi2.global_id, 'load_board' => {'id' => b3.global_id, 'key' => b3.key}, 'hidden' => false, 'hide_label' => false, 'link_disabled' => false, 'text_only' => false}
      ])
      expect(b3.reload.settings['buttons']).to eq([
        {'id' => 3, 'label' => 'flats', 'hidden' => false, 'hide_label' => false, 'text_only' => false}
      ])
    end

    it 'should stop when the user no longer matches' do
      u = User.create
      u2 = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u2)
      b3 = Board.create(:user => u)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'cats', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}, 'image_id' => 'asdf'}
      ]}, {user: u2})
      b2.process({'buttons' => [
        {'id' => 2, 'label' => 'hats', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}, 'image_id' => 'asdf'}
      ]}, {user: u})
      b3.process({'buttons' => [
        {'id' => 3, 'label' => 'flats'}
      ]}, {user: u})
      Worker.process_queues
      b.reload.track_downstream_boards!
      b2.reload.track_downstream_boards!
      b3.reload.track_downstream_boards!
      expect(b.reload.settings['downstream_board_ids']).to eq([b2.global_id, b3.global_id])
      expect(b2.reload.settings['downstream_board_ids']).to eq([b3.global_id])
      
      expect(Uploader).to_not receive(:find_images).with('hats', 'bacon', 'en', u, nil, true, false)
      expect(Uploader).to receive(:find_images).with('cats', 'bacon', 'en', u, nil, true, false).and_return([{
        'url' => 'http://www.example.com/cat.png', 'content_type' => 'image/png'
      }])
      expect(Uploader).to_not receive(:find_images).with('flats', 'bacon', 'en', u, nil, true, false)
      res = b.swap_images('bacon', u, [b.global_id, b2.global_id, b3.global_id])
      b.reload
      b.instance_variable_set('@map_later', nil)
      b.save
      expect(b.reload.known_button_images.length).to eq(1)
      bis = b.reload.known_button_images
      expect(bis.count).to eq(1)
      bi = bis[0]
      bis2 = b2.reload.known_button_images
      expect(bis2.count).to eq(0)
      bis3 = b3.reload.known_button_images
      expect(bis3.count).to eq(0)
      expect(res).to eq({done: true, id: b.global_id, library: 'bacon', board_ids: [b.global_id, b2.global_id, b3.global_id], updated: [b.global_id], visited: [b.global_id, b2.global_id]})
      expect(b.reload.settings['buttons']).to eq([
        {'id' => 1, 'label' => 'cats', 'image_id' => bi.global_id, 'load_board' => {'id' => b2.global_id, 'key' => b2.key}, 'hidden' => false, 'hide_label' => false, 'link_disabled' => false, 'text_only' => false}
      ])
      expect(b2.reload.settings['buttons']).to eq([
        {'id' => 2, 'label' => 'hats', 'image_id' => 'asdf', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}, 'hidden' => false, 'hide_label' => false, 'link_disabled' => false, 'text_only' => false}
      ])
      expect(b3.reload.settings['buttons']).to eq([
        {'id' => 3, 'label' => 'flats', 'hidden' => false, 'hide_label' => false, 'text_only' => false}
      ])
    end
    
    it 'should only find boards it can access' do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b3 = Board.create(:user => u)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'cats', 'image_id' => 'asdf', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {user: u})
      b2.process({'buttons' => [
        {'id' => 2, 'label' => 'hats', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}
      ]}, {user: u})
      b3.process({'buttons' => [
        {'id' => 3, 'label' => 'flats'}
      ]}, {user: u})
      Worker.process_queues
      expect(b.reload.settings['downstream_board_ids']).to eq([b2.global_id, b3.global_id])
      expect(b2.reload.settings['downstream_board_ids']).to eq([b3.global_id])
      
      expect(Uploader).to_not receive(:find_images).with('hats', 'bacon', 'en', u, nil, true, false)
      expect(Uploader).to receive(:find_images).with('cats', 'bacon', 'en', u, nil, true, false).and_return([{
        'url' => 'http://www.example.com/cat.png', 'content_type' => 'image/png'
      }])
      expect(Uploader).to_not receive(:find_images).with('flats', 'bacon', 'en', u, nil, true, false)
      res = b.swap_images('bacon', u, [b.global_id, b3.global_id])
      b.reload
      b.instance_variable_set('@map_later', nil)
      b.save
      bis = b.reload.known_button_images
      expect(bis.count).to eq(1)
      bi = bis[0]
      bis2 = b2.reload.known_button_images
      expect(bis2.count).to eq(0)
      bis3 = b3.reload.known_button_images
      expect(bis3.count).to eq(0)
      expect(res).to eq({done: true, id: b.global_id, library: 'bacon', board_ids: [b.global_id, b3.global_id], updated: [b.global_id], visited: [b.global_id, b2.global_id]})
      expect(b.reload.settings['buttons']).to eq([
        {'id' => 1, 'label' => 'cats', 'image_id' => bi.global_id, 'load_board' => {'id' => b2.global_id, 'key' => b2.key}, 'hidden' => false, 'hide_label' => false, 'link_disabled' => false, 'text_only' => false}
      ])
      expect(b2.reload.settings['buttons']).to eq([
        {'id' => 2, 'label' => 'hats', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}, 'hidden' => false, 'hide_label' => false, 'link_disabled' => false, 'text_only' => false}
      ])
      expect(b3.reload.settings['buttons']).to eq([
        {'id' => 3, 'label' => 'flats', 'hidden' => false, 'hide_label' => false, 'text_only' => false}
      ])
    end

    it "should add a version for any boards with images swapped" do
      u = User.create
      b = Board.create(:user => u)
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'hats', 'image_id' => 'whatever'},
        {'id' => 2, 'label' => 'cats', 'image_id' => 'another'}
      ]
      b.save
      expect(Uploader).to receive(:find_images).with('hats', 'bacon', 'en', u, nil, true, false).and_return([])
      expect(Uploader).to receive(:find_images).with('cats', 'bacon', 'en', u, nil, true, false).and_return([{
        'url' => 'http://www.example.com/pic.png',
        'content_type' => 'image/png'
      }])
      Worker.process_queues
      Worker.process_queues
      versions = b.versions.count

      b.schedule(:swap_images, 'bacon', u.global_id, [])
      Worker.process_queues
      Worker.process_queues
      expect(b.versions.count).to eq(versions + 1)
      img = ButtonImage.last
      expect(b.reload.known_button_images.to_a).to eq([img])
      expect(b.settings['buttons']).to eq([
        {'id' => 1, 'label' => 'hats', 'image_id' => 'whatever'},
        {'id' => 2, 'label' => 'cats', 'image_id' => img.global_id}
      ])
    end

    it "should work for boards with board_content offload" do
      u = User.create
      b = Board.create(:user => u)
      b2 = Board.create(:user => u)
      b3 = Board.create(:user => u)
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'cats', 'image_id' => 'asdf', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {user: u})
      bc = BoardContent.generate_from(b)
      b2.process({'buttons' => [
        {'id' => 2, 'label' => 'hats', 'image_id' => 'asdf', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}
      ]}, {user: u})
      bc2 = BoardContent.generate_from(b2)
      b3.process({'buttons' => [
        {'id' => 3, 'label' => 'flats'}
      ]}, {user: u})
      bc3 = BoardContent.generate_from(b3)
      Worker.process_queues
      expect(b.reload.settings['downstream_board_ids']).to eq([b2.global_id, b3.global_id])
      expect(b2.reload.settings['downstream_board_ids']).to eq([b3.global_id])
      
      expect(Uploader).to receive(:find_images).with('hats', 'bacon', 'en', u, nil, true, false).and_return([{
        'url' => 'http://www.example.com/hat.png', 'content_type' => 'image/png'
      }])
      expect(Uploader).to receive(:find_images).with('cats', 'bacon', 'en', u, nil, true, false).and_return([{
        'url' => 'http://www.example.com/cat.png', 'content_type' => 'image/png'
      }])
      expect(Uploader).to_not receive(:find_images).with('flats', 'bacon', 'en', u, nil, true, false)
      res = b.swap_images('bacon', u, [b.global_id, b2.global_id])
      Worker.process_queues
      bis = b.reload.known_button_images
      expect(bis.count).to eq(1)
      bi = bis[0]
      bis2 = b2.reload.known_button_images
      expect(bis2.count).to eq(1)
      bi2 = bis2[0]
      bis3 = b3.reload.known_button_images
      expect(bis3.count).to eq(0)
      expect(res).to eq({done: true, id: b.global_id, library: 'bacon', board_ids: [b.global_id, b2.global_id], updated: [b.global_id, b2.global_id], visited: [b.global_id, b2.global_id, b3.global_id]})
      expect(b.reload.buttons).to eq([
        {'id' => 1, 'label' => 'cats', 'image_id' => bi.global_id, 'load_board' => {'id' => b2.global_id, 'key' => b2.key}, 'hidden' => false, 'hide_label' => false, 'link_disabled' => false, 'text_only' => false}
      ])
      expect(b2.reload.buttons).to eq([
        {'id' => 2, 'label' => 'hats', 'image_id' => bi2.global_id, 'load_board' => {'id' => b3.global_id, 'key' => b3.key}, 'hidden' => false, 'hide_label' => false, 'link_disabled' => false, 'text_only' => false}
      ])
      expect(b3.reload.buttons).to eq([
        {'id' => 3, 'label' => 'flats', 'hidden' => false, 'hide_label' => false, 'text_only' => false}
      ])
    end

    it "should specify important boards for long-caching results" do
      u = User.create

      root = Board.create(user: u)
      ex = User.create(user_name: 'important_stars')
      root.star(ex, true)
      root.save
      expect(root.reload.starred_by?(ex.reload)).to eq(true)

      b = Board.create(:user => u)
      b.settings['source_board_id'] = root.global_id
      b.settings['never_edited'] = true
      b.parent_board = root
      b.settings['buttons'] = [
        {'id' => 1, 'label' => 'hats', 'image_id' => 'asdf'},
        {'id' => 2, 'label' => 'cats', 'image_id' => 'asdf'}
      ]
      b.save
      expect(b.source_board).to eq(root)
      
      expect(Uploader).to receive(:find_images).with('hats', 'bacon', 'en', u, nil, true, true).and_return([])
      expect(Uploader).to receive(:find_images).with('cats', 'bacon', 'en', u, nil, true, true).and_return([{
        'url' => 'http://www.example.com/pic.png',
        'content_type' => 'image/png'
      }])
      res = b.swap_images('bacon', u, [])
      expect(res).to eq({done: true, id: b.global_id, library: 'bacon', board_ids: [], updated: [b.global_id], visited: [b.global_id]})
      img = ButtonImage.last
      expect(b.settings['buttons']).to eq([
        {'id' => 1, 'label' => 'hats', 'image_id' => 'asdf'},
        {'id' => 2, 'label' => 'cats', 'image_id' => img.global_id}
      ])
    end

    it "should create copies for shallow clones" do
      u = User.create
      b = Board.create(:user => u, public: true)
      b2 = Board.create(:user => u, public: true)
      b3 = Board.create(:user => u, public: true)
      u2 = User.create
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'cats', 'image_id' => 'asdf', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {user: u})
      b2.process({'buttons' => [
        {'id' => 2, 'label' => 'hats', 'image_id' => 'asdf', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}
      ]}, {user: u})
      b3.process({'buttons' => [
        {'id' => 3, 'label' => 'flats'}
      ]}, {user: u})
      Worker.process_queues
      expect(b.reload.settings['downstream_board_ids']).to eq([b2.global_id, b3.global_id])
      expect(b2.reload.settings['downstream_board_ids']).to eq([b3.global_id])
      
      expect(Uploader).to receive(:find_images).with('hats', 'bacon', 'en', u, nil, true, false).and_return([{
        'url' => 'http://www.example.com/hat.png', 'content_type' => 'image/png'
      }])
      expect(Uploader).to receive(:find_images).with('cats', 'bacon', 'en', u, nil, true, false).and_return([{
        'url' => 'http://www.example.com/cat.png', 'content_type' => 'image/png'
      }])
      expect(Uploader).to_not receive(:find_images).with('flats', 'bacon', 'en', u, nil, true, false)
      bb = Board.find_by_path("#{b.global_id}-#{u2.global_id}")
      expect(bb.id).to eq(b.id)
      bb2 = Board.find_by_path("#{b2.global_id}-#{u2.global_id}")
      expect(bb2.id).to eq(b2.id)
      res = bb.swap_images('bacon', u, [bb.global_id, bb2.global_id])
      Worker.process_queues
      bis = b.reload.known_button_images
      expect(bis.count).to eq(0)
      bi = bis[0]
      bis2 = b2.reload.known_button_images
      expect(bis2.count).to eq(0)
      bi2 = bis2[0]
      bis3 = b3.reload.known_button_images
      expect(bis3.count).to eq(0)

      bb = Board.find_by_path("#{b.global_id}-#{u2.global_id}")
      expect(bb.id).to_not eq(b.id)
      bb2 = Board.find_by_path("#{b2.global_id}-#{u2.global_id}")
      expect(bb2.id).to_not eq(b2.id)
      bb3 = Board.find_by_path("#{b3.global_id}-#{u2.global_id}")
      expect(bb3.id).to eq(b3.id)

      expect(res).to eq({done: true, library: 'bacon', 
        id: bb.global_id,
        board_ids: ["#{b.global_id}-#{u2.global_id}", "#{b2.global_id}-#{u2.global_id}"], 
        updated: ["#{b.global_id}-#{u2.global_id}", "#{b2.global_id}-#{u2.global_id}"], 
        visited: [bb.global_id, bb2.global_id, "#{b3.global_id}-#{u2.global_id}"]
      })
      bis = bb.reload.known_button_images
      expect(bis.count).to eq(1)
      bi = bis[0]
      bis2 = bb2.reload.known_button_images
      expect(bis2.count).to eq(1)
      bi2 = bis2[0]
      bis3 = bb3.reload.known_button_images
      expect(bis3.count).to eq(0)

      expect(bb.reload.buttons).to eq([
        {'id' => 1, 'label' => 'cats', 'image_id' => bi.global_id, 'load_board' => {'id' => b2.global_id, 'key' => b2.key}, 'hidden' => false, 'hide_label' => false, 'link_disabled' => false, 'text_only' => false}
      ])
      expect(bb2.reload.buttons).to eq([
        {'id' => 2, 'label' => 'hats', 'image_id' => bi2.global_id, 'load_board' => {'id' => b3.global_id, 'key' => b3.key}, 'hidden' => false, 'hide_label' => false, 'link_disabled' => false, 'text_only' => false}
      ])
      expect(bb3.reload.buttons).to eq([
        {'id' => 3, 'label' => 'flats', 'hidden' => false, 'hide_label' => false, 'text_only' => false}
      ])
    end

    it "should stop swapping images for shallow clone when the user name changes" do
      u = User.create
      u3 = User.create
      b = Board.create(:user => u, public: true)
      b2 = Board.create(:user => u3, public: true)
      b3 = Board.create(:user => u, public: true)
      u2 = User.create
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'cats', 'image_id' => 'asdf', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {user: u})
      b2.process({'buttons' => [
        {'id' => 2, 'label' => 'hats', 'image_id' => 'asdf', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}
      ]}, {user: u})
      b3.process({'buttons' => [
        {'id' => 3, 'label' => 'flats'}
      ]}, {user: u})
      Worker.process_queues
      expect(b.reload.settings['downstream_board_ids']).to eq([b2.global_id, b3.global_id])
      expect(b2.reload.settings['downstream_board_ids']).to eq([b3.global_id])
      
      expect(Uploader).to receive(:find_images).with('cats', 'bacon', 'en', u, nil, true, false).and_return([{
        'url' => 'http://www.example.com/cat.png', 'content_type' => 'image/png'
      }])
      expect(Uploader).to_not receive(:find_images).with('flats', 'bacon', 'en', u, nil, true, false)
      bb = Board.find_by_path("#{b.global_id}-#{u2.global_id}")
      expect(bb.id).to eq(b.id)
      bb2 = Board.find_by_path("#{b2.global_id}-#{u2.global_id}")
      expect(bb2.id).to eq(b2.id)
      res = bb.swap_images('bacon', u, [bb.global_id, bb2.global_id])
      Worker.process_queues
      bis = b.reload.known_button_images
      expect(bis.count).to eq(0)
      bi = bis[0]
      bis2 = b2.reload.known_button_images
      expect(bis2.count).to eq(0)
      bi2 = bis2[0]
      bis3 = b3.reload.known_button_images
      expect(bis3.count).to eq(0)

      bb = Board.find_by_path("#{b.global_id}-#{u2.global_id}")
      expect(bb.id).to_not eq(b.id)
      bb2 = Board.find_by_path("#{b2.global_id}-#{u2.global_id}")
      expect(bb2.id).to eq(b2.id)
      bb3 = Board.find_by_path("#{b3.global_id}-#{u2.global_id}")
      expect(bb3.id).to eq(b3.id)

      expect(res).to eq({done: true, library: 'bacon', 
        id: bb.global_id,
        board_ids: ["#{b.global_id}-#{u2.global_id}", "#{b2.global_id}-#{u2.global_id}"], 
        updated: ["#{b.global_id}-#{u2.global_id}",], 
        visited: [bb.global_id, bb2.global_id]
      })
      bis = bb.reload.known_button_images
      expect(bis.count).to eq(1)
      bi = bis[0]
      bis2 = bb2.reload.known_button_images
      expect(bis2.count).to eq(0)
      bis3 = bb3.reload.known_button_images
      expect(bis3.count).to eq(0)

      expect(bb.reload.buttons).to eq([
        {'id' => 1, 'label' => 'cats', 'image_id' => bi.global_id, 'load_board' => {'id' => b2.global_id, 'key' => b2.key}, 'hidden' => false, 'hide_label' => false, 'link_disabled' => false, 'text_only' => false}
      ])
      expect(b2.reload.buttons).to eq([
        {'id' => 2, 'label' => 'hats', 'image_id' => 'asdf', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}, 'hidden' => false, 'hide_label' => false, 'link_disabled' => false, 'text_only' => false}
      ])
      expect(bb2.reload.buttons).to eq([
        {'id' => 2, 'label' => 'hats', 'image_id' => 'asdf', 'load_board' => {'id' => bb3.shallow_id, 'key' => bb3.shallow_key}, 'hidden' => false, 'hide_label' => false, 'link_disabled' => false, 'text_only' => false}
      ])
      expect(bb3.reload.buttons).to eq([
        {'id' => 3, 'label' => 'flats', 'hidden' => false, 'hide_label' => false, 'text_only' => false}
      ])
    end

    it "should not swap images for shallow clones where access is not authorized" do
      u = User.create
      b = Board.create(:user => u, public: true)
      b2 = Board.create(:user => u)
      b3 = Board.create(:user => u)
      u2 = User.create
      b.process({'buttons' => [
        {'id' => 1, 'label' => 'cats', 'image_id' => 'asdf', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {user: u})
      b2.process({'buttons' => [
        {'id' => 2, 'label' => 'hats', 'image_id' => 'asdf', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}
      ]}, {user: u})
      b3.process({'buttons' => [
        {'id' => 3, 'label' => 'flats'}
      ]}, {user: u})
      Worker.process_queues
      expect(b.reload.settings['downstream_board_ids']).to eq([b2.global_id, b3.global_id])
      expect(b2.reload.settings['downstream_board_ids']).to eq([b3.global_id])
      
      expect(Uploader).to receive(:find_images).with('cats', 'bacon', 'en', u, nil, true, false).and_return([{
        'url' => 'http://www.example.com/cat.png', 'content_type' => 'image/png'
      }])
      expect(Uploader).to_not receive(:find_images).with('flats', 'bacon', 'en', u, nil, true, false)
      bb = Board.find_by_path("#{b.global_id}-#{u2.global_id}")
      expect(bb.id).to eq(b.id)
      bb2 = Board.find_by_path("#{b2.global_id}-#{u2.global_id}")
      expect(bb2.id).to eq(b2.id)
      res = bb.swap_images('bacon', u, [bb.global_id, bb2.global_id])
      Worker.process_queues
      bis = b.reload.known_button_images
      expect(bis.count).to eq(0)
      bi = bis[0]
      bis2 = b2.reload.known_button_images
      expect(bis2.count).to eq(0)
      bi2 = bis2[0]
      bis3 = b3.reload.known_button_images
      expect(bis3.count).to eq(0)

      bb = Board.find_by_path("#{b.global_id}-#{u2.global_id}")
      expect(bb.id).to_not eq(b.id)
      bb2 = Board.find_by_path("#{b2.global_id}-#{u2.global_id}")
      expect(bb2.id).to eq(b2.id)
      bb3 = Board.find_by_path("#{b3.global_id}-#{u2.global_id}")
      expect(bb3.id).to eq(b3.id)

      expect(res).to eq({done: true, library: 'bacon', 
        id: bb.global_id,
        board_ids: ["#{b.global_id}-#{u2.global_id}", "#{b2.global_id}-#{u2.global_id}"], 
        updated: ["#{b.global_id}-#{u2.global_id}"], 
        visited: [bb.global_id, "#{b2.global_id}-#{u2.global_id}"]
      })
      bis = bb.reload.known_button_images
      expect(bis.count).to eq(1)
      bi = bis[0]
      bis2 = bb2.reload.known_button_images
      expect(bis2.count).to eq(0)
      bi2 = bis2[0]
      bis3 = bb3.reload.known_button_images
      expect(bis3.count).to eq(0)

      expect(bb.reload.buttons).to eq([
        {'id' => 1, 'label' => 'cats', 'image_id' => bi.global_id, 'load_board' => {'id' => b2.global_id, 'key' => b2.key}, 'hidden' => false, 'hide_label' => false, 'link_disabled' => false, 'text_only' => false}
      ])
      expect(b2.reload.buttons).to eq([
        {'id' => 2, 'label' => 'hats', 'image_id' => 'asdf', 'load_board' => {'id' => b3.global_id, 'key' => b3.key}, 'hidden' => false, 'hide_label' => false, 'link_disabled' => false, 'text_only' => false}
      ])
      expect(bb2.reload.buttons).to eq([
        {'id' => 2, 'label' => 'hats', 'image_id' => 'asdf', 'load_board' => {'id' => bb3.global_id, 'key' => bb3.shallow_key}, 'hidden' => false, 'hide_label' => false, 'link_disabled' => false, 'text_only' => false}
      ])
      expect(bb3.reload.buttons).to eq([
        {'id' => 3, 'label' => 'flats', 'hidden' => false, 'hide_label' => false, 'text_only' => false}
      ])
    end
  end
  
  describe "process_button" do
    it "should update the button if found" do
      u = User.create
      b = Board.create(:user => u, :settings => {
        'buttons' => [
          {'id' => '123'}, {'id' => '234'}
        ]
      })
      b.process_button({
        'id' => '234',
        'sound_id' => '12345'
      })
      expect(b.reload.settings['buttons']).to eq([
        {'id' => '123'}, {'id' => '234', 'sound_id' => '12345'}
      ])
    end 
    
    it "should not schedule a button set update" do
      u = User.create
      b = Board.create(:user => u, :settings => {
        'buttons' => [
          {'id' => '123'}, {'id' => '234'}
        ]
      })
      b.process_button({
        'id' => '234',
        'sound_id' => '12345'
      })
      expect(b.reload.settings['buttons']).to eq([
        {'id' => '123'}, {'id' => '234', 'sound_id' => '12345'}
      ])
      expect(Worker.scheduled?(Board, :perform_action, {:id => b.id, :method => 'update_button_sets', :arguments => []})).to eq(false)
    end
    
    it "should align the button to the sound record" do
      u = User.create
      s = ButtonSound.create(:user => u)
      b = Board.create(:user => u, :settings => {
        'buttons' => [
          {'id' => '123'}, {'id' => '234'}
        ]
      })
      b.process_button({
        'id' => '234',
        'sound_id' => s.global_id
      })
      expect(b.reload.settings['buttons']).to eq([
        {'id' => '123'}, {'id' => '234', 'sound_id' => s.global_id}
      ])
      expect(b.button_sounds).to eq([s])
    end

    it "should work for boards with board_content" do
      u = User.create
      b = Board.create(:user => u, :settings => {
        'buttons' => [
          {'id' => '123'}, {'id' => '234'}
        ]
      })
      bc = BoardContent.generate_from(b)
      expect(b.reload.buttons).to eq([
        {'id' => '123'}, {'id' => '234'}
      ])
      b.process_button({
        'id' => '234',
        'sound_id' => '12345'
      })
      expect(b.reload.buttons).to eq([
        {'id' => '123'}, {'id' => '234', 'sound_id' => '12345'}
      ])
    end
  end
  
  # describe "update_button_sets" do
  #   it "should schedule updates for all upstream button sets" do
  #     u = User.create
  #     b1 = Board.create(:user => u)
  #     b2 = Board.create(:user => u, :settings => {
  #       'immediately_upstream_board_ids' => [b1.global_id]
  #     })
  #     b3 = Board.create(:user => u, :settings => {
  #       'immediately_upstream_board_ids' => [b2.global_id]
  #     })
  #     b2.settings['immediately_upstream_board_ids'] = [b1.global_id, b3.global_id]
  #     b2.save
  #     b3.update_button_sets
  #     expect(Worker.scheduled?(BoardDownstreamButtonSet, :perform_action, {:method => 'update_for', :arguments => [b1.global_id]})).to eq(true)
  #     expect(Worker.scheduled?(BoardDownstreamButtonSet, :perform_action, {:method => 'update_for', :arguments => [b2.global_id]})).to eq(true)
  #     expect(Worker.scheduled?(BoardDownstreamButtonSet, :perform_action, {:method => 'update_for', :arguments => [b3.global_id]})).to eq(true)
  #   end
  # end

  describe "restore_urls" do
    # if self.settings && self.settings['undeleted'] && (self.settings['image_urls'] || self.settings['sound_urls'])
    #   self.schedule(:restore_urls)
    # end

    # def restore_urls
    #   (self.settings['image_urls'] || {}).each do |id, url|
    #     bi = ButtonImage.find_by_global_id(id)
    #     if !bi
    #       bi = ButtonImage.new
    #       hash = Board.id_pieces(id)
    #       @buttons_changed = true
    #       parts = id.split(/_/)
    #       bi.id = hash[:id]
    #       bi.nonce = hash[:nonce]
    #       bi.user_id = self.user_id
    #       bi.settings = {'avatar' => false, 'badge' => false, 'protected' => false, 'pending' => false}
    #       bi.url = url
    #       bi.save
    #     end
    #   end
    #   (self.settings['sound_urls'] || {}).each do |id, url|
    #     bs = ButtonSound.find_by_global_id(id)
    #     if !bs
    #       bs = ButtonSound.new
    #       hash = Board.id_pieces(id)
    #       @buttons_changed = true
    #       parts = id.split(/_/)
    #       bs.id = hash[:id]
    #       bs.nonce = hash[:nonce]
    #       bs.user_id = self.user_id
    #       bs.settings = {'protected' => false, 'pending' => false}
    #       bs.url = url
    #       bs.save
    #     end
    #   end
    #   self.settings.delete('undeleted')
    #   self.settings.delete('image_urls')
    #   self.settings.delete('sound_urls')
    #   @buttons_changed = true
    #   self.save
    # end
    it "should schedule url restores when a board is undeleted" do
      u = User.create
      b = Board.create(user: u)
      b.settings['undeleted'] = true
      b.settings['image_urls'] = {}
      b.save
      expect(Worker.scheduled?(Board, :perform_action, {'id' => b.id, 'method' => 'restore_urls', 'arguments' => []})).to eq(true)
    end

    it "should use existing image if they haven't been deleted" do
      u = User.create
      u.settings['preferences']['preferred_symbols'] = 'original'
      u.save!
      b = Board.create(user: u)
      bi1 = ButtonImage.create(user: u, board: b, settings: {}, url: 'http://www.example.com/pic1.png')
      b.settings['buttons'] = [
        {'id' => 1, 'image_id' => bi1.global_id, 'label' => 'one'},
        {'id' => 2, 'image_id' => "1_#{bi1.id - 1}_298g4hag3g", 'label' => 'two'}
      ]
      b.settings['image_urls'] = {"1_#{bi1.id - 1}_298g4hag3g" => 'https://www.example.com/pic2.png'}
      b.settings['undeleted'] = true
      b.restore_urls
      expect(b.settings['undeleted']).to eq(nil)
      expect(b.settings['image_urls']).to eq(nil)
      json = JsonApi::Board.as_json(b, wrapper: true, permissions: u)

      expect(json['board']['image_urls'][bi1.global_id]).to eq('http://www.example.com/pic1.png')
      expect(json['board']['image_urls'].keys.length).to eq(2)
      expect(json['board']['image_urls']["1_#{bi1.id - 1}_298g4hag3g"]).to eq('https://www.example.com/pic2.png')
    end

    it "should restore images if they have been deleted" do
      u = User.create
      u.settings['preferences']['preferred_symbols'] = 'original'
      u.save!
      b = Board.create(user: u)
      bi1 = ButtonImage.create(user: u, board: b, settings: {}, url: 'http://www.example.com/pic1.png')
      b.settings['buttons'] = [
        {'id' => 1, 'image_id' => bi1.global_id, 'label' => 'one'},
        {'id' => 2, 'image_id' => "1_#{bi1.id - 1}_298g4hag3g", 'label' => 'two'}
      ]
      b.settings['image_urls'] = {"1_#{bi1.id - 1}_298g4hag3g" => 'https://www.example.com/pic2.png'}
      b.settings['undeleted'] = true
      b.restore_urls
      expect(b.settings['undeleted']).to eq(nil)
      expect(b.settings['image_urls']).to eq(nil)
      json = JsonApi::Board.as_json(b, wrapper: true, permissions: u)

      expect(json['board']['image_urls'][bi1.global_id]).to eq('http://www.example.com/pic1.png')
      expect(json['board']['image_urls'].keys.length).to eq(2)
      expect(json['board']['image_urls']["1_#{bi1.id - 1}_298g4hag3g"]).to eq('https://www.example.com/pic2.png')
    end

    it "should use sounds if they haven't been deleted" do
      u = User.create
      b = Board.create(user: u)
      bi1 = ButtonSound.create(user: u, board: b, settings: {}, url: 'http://www.example.com/sound1.mp3')
      b.settings['buttons'] = [
        {'id' => 1, 'sound_id' => bi1.global_id, 'label' => 'one'},
        {'id' => 2, 'sound_id' => "1_#{bi1.id - 1}_298g4hag3g", 'label' => 'two'}
      ]
      b.settings['sound_urls'] = {"1_#{bi1.id - 1}_298g4hag3g" => 'https://www.example.com/sound2.mp3'}
      b.settings['undeleted'] = true
      b.restore_urls
      expect(b.settings['undeleted']).to eq(nil)
      expect(b.settings['sound_urls']).to eq(nil)
      json = JsonApi::Board.as_json(b, wrapper: true, permissions: u)

      expect(json['board']['sound_urls'][bi1.global_id]).to eq('http://www.example.com/sound1.mp3')
      expect(json['board']['sound_urls'].keys.length).to eq(2)
      expect(json['board']['sound_urls']["1_#{bi1.id - 1}_298g4hag3g"]).to eq('https://www.example.com/sound2.mp3')
    end
    
    it "should restore sounds if they haven't been deleted" do
      u = User.create
      b = Board.create(user: u)
      bi1 = ButtonSound.create(user: u, board: b, settings: {}, url: 'http://www.example.com/sound1.mp3')
      b.settings['buttons'] = [
        {'id' => 1, 'sound_id' => bi1.global_id, 'label' => 'one'},
        {'id' => 2, 'sound_id' => "1_#{bi1.id - 1}_298g4hag3g", 'label' => 'two'}
      ]
      b.settings['sound_urls'] = {"1_#{bi1.id - 1}_298g4hag3g" => 'https://www.example.com/sound2.mp3'}
      b.settings['undeleted'] = true
      b.restore_urls
      expect(b.settings['undeleted']).to eq(nil)
      expect(b.settings['sound_urls']).to eq(nil)
      json = JsonApi::Board.as_json(b, wrapper: true, permissions: u)

      expect(json['board']['sound_urls'][bi1.global_id]).to eq('http://www.example.com/sound1.mp3')
      expect(json['board']['sound_urls'].keys.length).to eq(2)
      expect(json['board']['sound_urls']["1_#{bi1.id - 1}_298g4hag3g"]).to eq('https://www.example.com/sound2.mp3')
    end

    it "should remove cached image_urls and sound_urls once restored" do
      u = User.create
      b = Board.create(user: u)
      bi1 = ButtonSound.create(user: u, board: b, settings: {}, url: 'http://www.example.com/sound1.mp3')
      b.settings['buttons'] = [
        {'id' => 1, 'sound_id' => bi1.global_id, 'label' => 'one'},
        {'id' => 2, 'sound_id' => "1_#{bi1.id - 1}_298g4hag3g", 'label' => 'two'}
      ]
      b.settings['sound_urls'] = {"1_#{bi1.id - 1}_298g4hag3g" => 'https://www.example.com/sound2.mp3'}
      b.settings['undeleted'] = true
      b.restore_urls
      expect(b.settings['undeleted']).to eq(nil)
      expect(b.settings['sound_urls']).to eq(nil)
      json = JsonApi::Board.as_json(b, wrapper: true, permissions: u)

      expect(json['board']['sound_urls'][bi1.global_id]).to eq('http://www.example.com/sound1.mp3')
      expect(json['board']['sound_urls'].keys.length).to eq(2)
      expect(json['board']['sound_urls']["1_#{bi1.id - 1}_298g4hag3g"]).to eq('https://www.example.com/sound2.mp3')
    end
  end

  describe "sync_stamp" do
    it "should update sync_stamp when a user changes their home board" do
      u = User.create
      expect(u.sync_stamp).to eq(nil)
      b = Board.create(:user => u)
      u.settings['preferences']['home_board'] = {'id' => b.global_id, 'key' => b.key }
      u.save
      Worker.process_queues
      expect(u.reload.sync_stamp).to_not eq(nil)
    end

    it "should update sync_stamp when a board in the user's board set is changed" do
      u1 = User.create
      u2 = User.create
      b1 = Board.create(user: u2)
      b2 = Board.create(user: u2)
      u1.settings['preferences']['home_board'] = {'id' => b1.global_id, 'key' => b1.key }
      u1.save

      b1.process({'buttons' => [
        {'id' => 1, 'label' => 'cats', 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}
      ]}, {user: u2})
      Worker.process_queues
      expect(b1.reload.settings['downstream_board_ids']).to eq([b2.global_id])
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      ts = u1.reload.sync_stamp
      expect(ts).to_not eq(nil)
      ts2 = u1.reload.sync_stamp
      expect(ts2).to_not eq(nil)
      b2.process({'buttons' => [{'id' => 1, 'label' => 'frogs'}]}, {user: u2})
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      expect(u1.reload.sync_stamp).to be > ts
      expect(u2.reload.sync_stamp).to be >= ts2

    end
  end
  
  describe "check_for_variants" do
    it "should return false on not-found board" do
      expect(Board.check_for_variants('aaa')).to eq(false)
    end

    it "should have call check_for_variants on all button_images" do
      board = OpenStruct.new
      bi1 = OpenStruct.new
      bi2 = OpenStruct.new
      expect(Board).to receive(:find_by_path).with('aaa').and_return(board)
      expect(board).to receive(:known_button_images).and_return([bi1, bi2])
      expect(bi1).to receive(:check_for_variants).with(false).and_return(true)
      expect(bi2).to receive(:check_for_variants).with(false).and_return(true)
      expect(board).to receive(:touch)
      expect(Board.check_for_variants('aaa')).to eq(true)
    end

    it "should update on any change" do
      board = OpenStruct.new
      bi1 = OpenStruct.new
      bi2 = OpenStruct.new
      expect(Board).to receive(:find_by_path).with('aaa').and_return(board)
      expect(board).to receive(:known_button_images).and_return([bi1, bi2])
      expect(bi1).to receive(:check_for_variants).with(false).and_return(true)
      expect(bi2).to receive(:check_for_variants).with(false).and_return(true)
      expect(board).to receive(:touch)
      expect(Board.check_for_variants('aaa')).to eq(true)
    end

    it "should for re-check when specified" do
      board = OpenStruct.new
      bi1 = OpenStruct.new
      bi2 = OpenStruct.new
      expect(Board).to receive(:find_by_path).with('aaa').and_return(board)
      expect(board).to receive(:known_button_images).and_return([bi1, bi2])
      expect(bi1).to receive(:check_for_variants).with(true).and_return(true)
      expect(bi2).to receive(:check_for_variants).with(true).and_return(true)
      expect(board).to receive(:touch)
      expect(Board.check_for_variants('aaa', true)).to eq(true)
    end

    it "should not update on no change" do
      board = OpenStruct.new
      bi1 = OpenStruct.new
      bi2 = OpenStruct.new
      expect(Board).to receive(:find_by_path).with('aaa').and_return(board)
      expect(board).to receive(:known_button_images).and_return([bi1, bi2])
      expect(bi1).to receive(:check_for_variants).with(false).and_return(false)
      expect(bi2).to receive(:check_for_variants).with(false).and_return(false)
      expect(board).to_not receive(:touch)
      expect(Board.check_for_variants('aaa')).to eq(false)
    end
  end

  describe "copyable_if_authorized" do
    it "should be true for a public board" do
      u = User.create
      b = Board.create(user: u)
      expect(b.copyable_if_authorized?(nil)).to eq(true)
      expect(b.copyable_if_authorized?(u)).to eq(true)
      b.public = true
      expect(b.copyable_if_authorized?(nil)).to eq(true)
      expect(b.copyable_if_authorized?(u)).to eq(true)
    end

    it "should be true for an original protected board only for the author" do
      u = User.create
      u2 = User.create
      b = Board.create(user: u)
      b.settings['protected'] = {'vocabulary' => true}
      b.save
      expect(b.copyable_if_authorized?(nil)).to eq(false)
      expect(b.copyable_if_authorized?(u)).to eq(true)
      expect(b.copyable_if_authorized?(u2)).to eq(false)
    end

    it "should be false for the copy of a protected board" do
      u = User.create
      u2 = User.create
      b1 = Board.create(user: u)
      b1.settings['protected'] = {'vocabulary' => true}
      b1.save
      b2 = Board.create(user: u)
      b2.settings['protected'] = {'vocabulary' => true}
      b2.parent_board = b1
      b2.save
      expect(b1.copyable_if_authorized?(nil)).to eq(false)
      expect(b1.copyable_if_authorized?(u)).to eq(true)
      expect(b1.copyable_if_authorized?(u2)).to eq(false)
      expect(b2.copyable_if_authorized?(nil)).to eq(false)
      expect(b2.copyable_if_authorized?(u)).to eq(false)
      expect(b2.copyable_if_authorized?(u2)).to eq(false)
    end
  end

  describe "current_library" do
    it "should return swapped_library if defined" do
      b = Board.new
      b.settings = {'swapped_library' => 'whatever'}
      expect(b.current_library).to eq('whatever')
    end

    it "should return common_library if explicitly told to avoid lookup" do
      b = Board.new
      b.settings = {'swapped_library' => 'whatever'}
      expect(b.current_library(false)).to eq('whatever')
    end

    it "should return opensymbols if needed to schdule a lookup" do
      u = User.create
      b = Board.create(user: u)
      expect(b).to receive(:schedule).with(:current_library, true)
      expect(b.current_library).to eq('opensymbols')
    end

    it "should find the most common library used on buttons if forced to lookup" do
      u = User.create
      b = Board.create(user: u)
      list = []
      10.times do |i|
        bi = ButtonImage.create(user: u, settings: {'license' => {'author_name' => 'tobii', 'uneditable' => true, 'author_url' => ''}})
        list << bi
      end
      expect(b).to receive(:known_button_images).and_return(list)
      expect(b.current_library(true)).to eq('pcs')
      expect(b.settings['common_library']).to eq('pcs')
    end

    it "should return opensymbols if a mix of different free libraries" do
      u = User.create
      b = Board.create(user: u)
      list = []
      3.times do |i|
        bi = ButtonImage.create(user: u, settings: {'license' => {'author_name' => 'twitter', 'uneditable' => true, 'author_url' => ''}})
        list << bi
      end
      3.times do |i|
        bi = ButtonImage.create(user: u, settings: {'license' => {'author_name' => 'arasaac', 'uneditable' => true, 'author_url' => ''}})
        list << bi
      end
      3.times do |i|
        bi = ButtonImage.create(user: u, settings: {'license' => {'author_name' => 'paxtoncrafts', 'uneditable' => true, 'author_url' => ''}})
        list << bi
      end
      expect(b).to receive(:known_button_images).and_return(list)
      expect(b.current_library(true)).to eq('opensymbols')
      expect(b.settings['common_library']).to eq('opensymbols')
    end

    it "should return specific opensymbols library if a majority match" do
      u = User.create
      b = Board.create(user: u)
      list = []
      30.times do |i|
        bi = ButtonImage.create(user: u, settings: {'license' => {'author_name' => 'twitter', 'uneditable' => true, 'author_url' => ''}})
        list << bi
      end
      3.times do |i|
        bi = ButtonImage.create(user: u, settings: {'license' => {'author_name' => 'arasaac', 'uneditable' => true, 'author_url' => ''}})
        list << bi
      end
      3.times do |i|
        bi = ButtonImage.create(user: u, settings: {'license' => {'author_name' => 'paxtoncrafts', 'uneditable' => true, 'author_url' => ''}})
        list << bi
      end
      expect(b).to receive(:known_button_images).and_return(list)
      expect(b.current_library(true)).to eq('twemoji')
      expect(b.settings['common_library']).to eq('twemoji')
    end
  end

  describe "swap_images" do
    env_wrap('OPENSYMBOLS_TOKEN' => 'test_token') do
    it "should skip for various reasons" do
      u1 = User.create
      u2 = User.create
      b = Board.create(user: u1)
      u1.settings['extras_disabled'] = true
      expect(b.swap_images('twemoji', nil, [], 'bacon', [], [])).to eq({done: true, id: b.global_id, swapped: false, reason: 'mismatched user'})
      expect(b.swap_images(nil, nil, [], u1.id, [], [])).to eq({done: true, id: b.global_id, swapped: false, reason: 'no library specified'})
      expect(b.swap_images('original', nil, [], u1.id, [], [])).to eq({done: true, id: b.global_id, swapped: true, reason: 'kept same'})
      expect(b.swap_images('twemoji', nil, [], u1.id, [], [])).to eq({done: true, id: b.global_id, swapped: false, reason: 'author required'})
      expect(b.swap_images('pcs', u1, [], u1.id, [], [])).to eq({done: true, id: b.global_id, swapped: false, reason: 'not authorized to access premium library'})
      u1.settings['extras_disabled'] = false
      expect(b.swap_images('pcs', u1, [], u1.id, [], [])).to eq({done: true, id: b.global_id, library: 'pcs', board_ids: [], updated: [b.global_id], visited: [b.global_id]})
    end
    end

    it "should not swap images if there were previously no images on the button" do
      u = User.create
      b = Board.create(user: u)
      b.process_buttons([
        {'id' => '1_2', 'label' => 'hat'},
        {'id' => '1_3', 'label' => 'cat'},
      ], nil)
      expect(Uploader).to receive(:default_images).with('twemoji', ['hat', 'cat'], 'en', u, true, false).and_return({
        'cat' => {'url' => 'https://www.example.com/cat.png'},
        'hat' => {'url' => 'https://www.example.com/hat.png'}
      })
      res = b.swap_images('twemoji', u, [], nil)
      expect(res).to eq({done: true, id: b.global_id, library: 'twemoji', board_ids: [], updated: [b.global_id], visited: [b.global_id]})
      bis = ButtonImage.all.order('id ASC')
      expect(bis.count).to eq(0)
    end

    it "should use cached library images if available" do
      u = User.create
      bi = ButtonImage.create(user: u)
      b = Board.create(user: u)
      b.process_buttons([
        {'id' => '1_2', 'label' => 'hat', 'image_id' => bi.global_id},
        {'id' => '1_3', 'label' => 'cat', 'image_id' => bi.global_id},
      ], nil)
      expect(Uploader).to receive(:default_images).with('twemoji', ['hat', 'cat'], 'en', u, true, false).and_return({
        'cat' => {'url' => 'https://www.example.com/cat.png'},
        'hat' => {'url' => 'https://www.example.com/hat.png'}
      })

      b.settings['images_not_mapped'] = true
      expect(b.known_button_images.length).to eq(1)
      res = b.swap_images('twemoji', u, [], nil)
      expect(res).to eq({done: true, id: b.global_id, library: 'twemoji', board_ids: [], updated: [b.global_id], visited: [b.global_id]})
      bis = ButtonImage.all.order('id ASC')
      expect(bis.count).to eq(3)
      expect(bis[1].url).to eq("https://www.example.com/hat.png")
      expect(bis[2].url).to eq("https://www.example.com/cat.png")
      expect(b.reload.buttons.map{|b| b['image_id'] }).to eq([bis[1].global_id, bis[2].global_id])
    end

    it "should use cached library button_image ids if available" do
      u = User.create
      bi = ButtonImage.create(user: u)
      bi2 = ButtonImage.create(user: u)
      b = Board.create(user: u)
      b.process_buttons([
        {'id' => '1_2', 'label' => 'hat', 'image_id' => bi.global_id},
        {'id' => '1_3', 'label' => 'cat', 'image_id' => bi.global_id},
      ], nil)
      expect(Uploader).to receive(:default_images).with('twemoji', ['hat', 'cat'], 'en', u, true, false).and_return({
        'cat' => {'lingolinq_image_id' => bi2.global_id},
        'hat' => {'lingolinq_image_id' => bi2.global_id},
      })
      b.settings['images_not_mapped'] = true
      res = b.swap_images('twemoji', u, [], nil)
      expect(res).to eq({done: true, id: b.global_id, library: 'twemoji', board_ids: [], updated: [b.global_id], visited: [b.global_id]})
      bis = ButtonImage.all.order('id ASC')
      expect(bis.count).to eq(2)
      expect(b.reload.buttons.map{|b| b['image_id'] }).to eq([bi2.global_id, bi2.global_id])
    end

    it "should fall back to remote lookups if not in the cache" do
      u = User.create
      bi = ButtonImage.create(user: u)
      bi2 = ButtonImage.create(user: u)
      b = Board.create(user: u)
      b.process_buttons([
        {'id' => '1_2', 'label' => 'hat', 'image_id' => bi.global_id},
        {'id' => '1_3', 'label' => 'cat', 'image_id' => bi.global_id},
      ], nil)
      expect(Uploader).to receive(:find_images).with('hat', 'twemoji', 'en', u, nil, true, false).and_return([{
        'url' => 'https://www.example.com/cat2.png'
      }])
      expect(Uploader).to receive(:default_images).with('twemoji', ['hat', 'cat'], 'en', u, true, false).and_return({
        'cat' => {'lingolinq_image_id' => bi2.global_id},
      })
      
      b.settings['images_not_mapped'] = true
      res = b.swap_images('twemoji', u, [], nil)
      expect(res).to eq({done: true, id: b.global_id, library: 'twemoji', board_ids: [], updated: [b.global_id], visited: [b.global_id]})
      bis = ButtonImage.all.order('id ASC')
      expect(bis.count).to eq(3)
      expect(bis[2].url).to eq('https://www.example.com/cat2.png')
      expect(b.reload.buttons.map{|b| b['image_id'] }).to eq([bis[2].global_id, bi2.global_id])
    end

    it "should not use fallback lookups if the image is known to be missing from the library" do
      u = User.create
      bi = ButtonImage.create(user: u)
      b = Board.create(user: u)
      b.process_buttons([
        {'id' => '1_2', 'label' => 'hat', 'image_id' => bi.global_id},
        {'id' => '1_3', 'label' => 'cat', 'image_id' => bi.global_id},
      ], nil)
      expect(Uploader).to receive(:default_images).with('twemoji', ['hat', 'cat'], 'en', u, true, false).and_return({
        'cat' => {'url' => 'https://www.example.com/cat.png'},
        '_missing' => ['hat']
      })

      b.settings['images_not_mapped'] = true
      res = b.swap_images('twemoji', u, [], nil)
      expect(res).to eq({done: true, id: b.global_id, library: 'twemoji', board_ids: [], updated: [b.global_id], visited: [b.global_id]})
      bis = ButtonImage.all.order('id ASC')
      expect(bis.count).to eq(2)
      expect(bis[1].url).to eq("https://www.example.com/cat.png")
      expect(b.reload.buttons.map{|b| b['image_id'] }).to eq([bi.global_id, bis[1].global_id])
    end

    it "should not swap images for user-uploaded buttons" do
      u = User.create
      bi = ButtonImage.create(user: u)
      bi2 = ButtonImage.create(user: u, url: 'https://www.example.com/lingolinq-usercontent/pic.png')
      b = Board.create(user: u)
      b.instance_variable_set('@map_later', true)
      b.process_buttons([
        {'id' => '1_2', 'label' => 'hat', 'image_id' => bi.global_id},
        {'id' => '1_3', 'label' => 'cat', 'image_id' => bi2.global_id},
      ], nil)
      expect(Uploader).to receive(:default_images).with('twemoji', ['hat', 'cat'], 'en', u, true, false).and_return({
        'cat' => {'url' => 'https://www.example.com/cat.png'},
        'hat' => {'url' => 'https://www.example.com/hat.png'}
      })
      b.settings['images_not_mapped'] = true
      expect(b.known_button_images.length).to eq(2)

      res = b.swap_images('twemoji', u, [], nil)
      expect(res).to eq({done: true, id: b.global_id, library: 'twemoji', board_ids: [], updated: [b.global_id], visited: [b.global_id]})
      bis = ButtonImage.all.order('id ASC')
      expect(bis.count).to eq(3)
      expect(bis[2].url).to eq("https://www.example.com/hat.png")
      expect(b.reload.buttons.map{|b| b['image_id'] }).to eq([bis[2].global_id, bi2.global_id])
    end

    it "should generate a button_image for any new images" do
      u = User.create
      bi = ButtonImage.create(user: u)
      b = Board.create(user: u)
      b.process_buttons([
        {'id' => '1_2', 'label' => 'hat', 'image_id' => bi.global_id},
        {'id' => '1_3', 'label' => 'cat', 'image_id' => bi.global_id},
      ], nil)
      expect(Uploader).to receive(:default_images).with('twemoji', ['hat', 'cat'], 'en', u, true, false).and_return({
        'cat' => {'url' => 'https://www.example.com/cat.png'},
        'hat' => {'url' => 'https://www.example.com/hat.png'}
      })

      res = b.swap_images('twemoji', u, [], nil)
      expect(res).to eq({done: true, id: b.global_id, library: 'twemoji', board_ids: [], updated: [b.global_id], visited: [b.global_id]})
      bis = ButtonImage.all.order('id ASC')
      expect(bis.count).to eq(3)
      expect(bis[1].url).to eq("https://www.example.com/hat.png")
      expect(bis[2].url).to eq("https://www.example.com/cat.png")
      expect(b.reload.buttons.map{|b| b['image_id'] }).to eq([bis[1].global_id, bis[2].global_id])
    end

    it "should only save if buttons have actually changed" do
      u = User.create
      bi = ButtonImage.create(user: u)
      b = Board.create(user: u)
      b.process_buttons([
        {'id' => '1_2', 'label' => 'hat', 'image_id' => bi.global_id},
        {'id' => '1_3', 'label' => 'cat', 'image_id' => bi.global_id},
      ], nil)
      expect(Uploader).to receive(:default_images).with('twemoji', ['hat', 'cat'], 'en', u, true, false).and_return({
        '_missing' => ['cat', 'hat']
      })

      b.settings['images_not_mapped'] = true
      b.instance_variable_set('@buttons_changed', false)
      res = b.swap_images('twemoji', u, [], nil)
      expect(res).to eq({done: true, id: b.global_id, library: 'twemoji', board_ids: [], updated: [b.global_id], visited: [b.global_id]})
      bis = ButtonImage.all.order('id ASC')
      expect(bis.count).to eq(1)
      expect(b.settings['swapped_library']).to eq(nil)
    end

    it "should keep original images as fallbacks instead of finding new ones if the original images aren't protected" do
      u = User.create
      bi = ButtonImage.create(user: u, url: 'https://www.example.com/original.png')
      b = Board.create(user: u)
      b.process_buttons([
        {'id' => '1_2', 'label' => 'hat', 'image_id' => bi.global_id},
        {'id' => '1_3', 'label' => 'cat', 'image_id' => bi.global_id},
        {'id' => '1_4', 'label' => 'frat', 'image_id' => bi.global_id},
      ], nil)
      expect(Uploader).to receive(:default_images).with('twemoji', ['hat', 'cat', 'frat'], 'en', u, true, false).and_return({
        'cat' => {'url' => 'https://www.example.com/cat.png', 'protected' => true},
        'hat' => {'url' => 'https://www.example.com/hat.png', 'protected' => true},
        'frat' => {'url' => 'https://www.example.com/frat.png'}
      })

      b.settings['images_not_mapped'] = true
      expect(b.known_button_images.length).to eq(1)
      res = b.swap_images('twemoji', u, [], nil)
      expect(res).to eq({done: true, id: b.global_id, library: 'twemoji', board_ids: [], updated: [b.global_id], visited: [b.global_id]})
      bis = ButtonImage.all.order('id ASC')
      expect(bis.count).to eq(4)
      expect(bis[1].url).to eq("https://www.example.com/hat.png")
      expect(bis[1].settings['fallback']).to eq({'url' => "https://www.example.com/original.png", 'pending' => false, 'license' => {'type' => 'private'}})
      expect(bis[2].url).to eq("https://www.example.com/cat.png")
      expect(bis[2].settings['fallback']).to eq({'url' => "https://www.example.com/original.png", 'pending' => false, 'license' => {'type' => 'private'}})
      expect(bis[3].url).to eq("https://www.example.com/frat.png")
      expect(bis[3].settings['fallback']).to eq(nil)
      expect(b.reload.buttons.map{|b| b['image_id'] }).to eq([bis[1].global_id, bis[2].global_id, bis[3].global_id])
    end

    it "should record what library it was swapped to" do
      u = User.create
      bi = ButtonImage.create(user: u)
      b = Board.create(user: u)
      b.process_buttons([
        {'id' => '1_2', 'label' => 'hat', 'image_id' => bi.global_id},
        {'id' => '1_3', 'label' => 'cat', 'image_id' => bi.global_id},
      ], nil)
      expect(Uploader).to receive(:default_images).with('twemoji', ['hat', 'cat'], 'en', u, true, false).and_return({
        'cat' => {'url' => 'https://www.example.com/cat.png'},
        'hat' => {'url' => 'https://www.example.com/hat.png'}
      })

      res = b.swap_images('twemoji', u, [], nil)
      expect(res).to eq({done: true, id: b.global_id, library: 'twemoji', board_ids: [], updated: [b.global_id], visited: [b.global_id]})
      bis = ButtonImage.all.order('id ASC')
      expect(bis.count).to eq(3)
      expect(bis[1].url).to eq("https://www.example.com/hat.png")
      expect(bis[2].url).to eq("https://www.example.com/cat.png")
      expect(b.reload.buttons.map{|b| b['image_id'] }).to eq([bis[1].global_id, bis[2].global_id])
      expect(b.settings['swapped_library']).to eq('twemoji')
    end

    it "should recurse to downstream boards" do
      u = User.create
      bi = ButtonImage.create(user: u)
      expect(Uploader).to receive(:find_images).at_least(:once).and_return([])
      b1 = Board.create(user: u)
      b2 = Board.create(user: u)
      b1.process({'buttons' => [
        {'id' => '1_2', 'label' => 'hat', 'load_board' => {'key' => b2.key, 'id' => b2.global_id}, 'image_id' => bi.global_id},
        {'id' => '1_3', 'label' => 'cat', 'image_id' => bi.global_id},
      ]}, {user: u})
      expect(b1.buttons[0]['load_board']).to_not eq(nil)
      b2.process({'buttons' => [
        {'id' => '1_2', 'label' => 'hat', 'load_board' => {'key' => b1.key, 'id' => b1.global_id}, 'image_id' => bi.global_id},
        {'id' => '1_3', 'label' => 'cat', 'image_id' => bi.global_id},
      ]}, {user: u})
      Worker.process_queues
      expect(b1.reload.settings['downstream_board_ids']).to eq([b2.global_id])
      expect(b2.reload.settings['downstream_board_ids']).to eq([b1.global_id])

      res = b1.swap_images('twemoji', u, [], nil)
      expect(res).to eq({done: true, id: b1.global_id, library: 'twemoji', board_ids: [], updated: [b1.global_id, b2.global_id], visited: [b1.global_id, b2.global_id]})
    end

    it "should stop at boards with a different author" do
      u = User.create
      u2 = User.create
      bi = ButtonImage.create(user: u)
      expect(Uploader).to receive(:find_images).at_least(:once).and_return([])
      b1 = Board.create(user: u, public: true)
      b2 = Board.create(user: u2, public: true)
      b3 = Board.create(user: u2, public: true)
      b1.process({'buttons' => [
        {'id' => '1_2', 'label' => 'hat', 'load_board' => {'key' => b2.key, 'id' => b2.global_id}, 'image_id' => bi.global_id},
        {'id' => '1_3', 'label' => 'cat', 'image_id' => bi.global_id},
      ]}, {user: u})
      expect(b1.buttons[0]['load_board']).to_not eq(nil)
      b2.process({'buttons' => [
        {'id' => '1_2', 'label' => 'hat', 'load_board' => {'key' => b3.key, 'id' => b3.global_id}, 'image_id' => bi.global_id},
        {'id' => '1_3', 'label' => 'cat', 'image_id' => bi.global_id},
      ]}, {user: u})
      Worker.process_queues
      expect(b1.reload.settings['downstream_board_ids']).to eq([b2.global_id, b3.global_id])
      expect(b2.reload.settings['downstream_board_ids']).to eq([b3.global_id])

      res = b1.swap_images('twemoji', u, [], nil)
      expect(res).to eq({done: true, id: b1.global_id, library: 'twemoji', board_ids: [], updated: [b1.global_id], visited: [b1.global_id, b2.global_id]})
    end

    it "should not get stuck in an infinite loop with circular references" do
      u = User.create
      bi = ButtonImage.create(user: u)
      expect(Uploader).to receive(:find_images).at_least(:once).and_return([])
      b1 = Board.create(user: u)
      b2 = Board.create(user: u)
      b1.process({'buttons' => [
        {'id' => '1_2', 'label' => 'hat', 'load_board' => {'key' => b2.key, 'id' => b2.global_id}, 'image_id' => bi.global_id},
        {'id' => '1_3', 'label' => 'cat', 'image_id' => bi.global_id},
      ]}, {user: u})
      expect(b1.buttons[0]['load_board']).to_not eq(nil)
      b2.process({'buttons' => [
        {'id' => '1_2', 'label' => 'hat', 'load_board' => {'key' => b1.key, 'id' => b1.global_id}, 'image_id' => bi.global_id},
        {'id' => '1_3', 'label' => 'cat', 'image_id' => bi.global_id},
      ]}, {user: u})
      Worker.process_queues
      expect(b1.reload.settings['downstream_board_ids']).to eq([b2.global_id])
      expect(b2.reload.settings['downstream_board_ids']).to eq([b1.global_id])

      res = b1.swap_images('twemoji', u, [], nil)
      expect(res).to eq({done: true, id: b1.global_id, library: 'twemoji', board_ids: [], updated: [b1.global_id, b2.global_id], visited: [b1.global_id, b2.global_id]})
    end
  end

  describe "downstream_board_ids" do
    it "should return list of board ids" do
      u = User.create
      b = Board.create(user: u)
      b.settings['downstream_board_ids'] = ['a', 'b', 'c']
      expect(b.downstream_board_ids).to eq(['a', 'b', 'c'])
    end

    it "should include replacements for shallow clones" do
      u1 = User.create
      b1 = Board.create(user: u1, public: true)
      u2 = User.create
      b2 = Board.create(user: u2, public: true)
      b3 = Board.create(user: u1, public: true)
      b4 = Board.create(user: u1, public: true)
      b1.settings['downstream_board_ids'] = [b3.global_id]
      b1.save
      b2.settings['downstream_board_ids'] = [b4.global_id]
      b2.save
      expect(b1.downstream_board_ids).to eq([b3.global_id])
      
      bb = Board.find_by_global_id("#{b1.global_id}-#{u1.global_id}")
      expect(bb.instance_variable_get('@sub_global')).to eq(u1)
      expect(bb.global_id).to eq("#{b1.global_id}-#{u1.global_id}")
      expect(bb.downstream_board_ids).to eq(["#{b3.global_id}-#{u1.global_id}"])

      ue2 = UserExtra.create(user: u2)
      ue2.settings['replaced_boards'] = {}
      ue2.settings['replaced_boards'][b3.global_id] = b2.global_id
      ue2.save
      bb = Board.find_by_global_id("#{b1.global_id}-#{u2.global_id}")
      expect(bb.instance_variable_get('@sub_global')).to eq(u2)
      expect(bb.global_id).to eq("#{b1.global_id}-#{u2.global_id}")
      expect(bb.downstream_board_ids).to eq(["#{b3.global_id}-#{u2.global_id}", "#{b4.global_id}"])
    end

    it "should still include replaced shallow clones in case they are linked more than once" do
      u1 = User.create
      b1 = Board.create(user: u1, public: true)
      u2 = User.create
      b2 = Board.create(user: u2, public: true)
      b3 = Board.create(user: u1, public: true)
      b4 = Board.create(user: u1, public: true)
      b1.settings['downstream_board_ids'] = [b3.global_id]
      b1.save
      b2.settings['downstream_board_ids'] = [b4.global_id]
      b2.save
      expect(b1.downstream_board_ids).to eq([b3.global_id])
      
      bb = Board.find_by_global_id("#{b1.global_id}-#{u1.global_id}")
      expect(bb.instance_variable_get('@sub_global')).to eq(u1)
      expect(bb.global_id).to eq("#{b1.global_id}-#{u1.global_id}")
      expect(bb.downstream_board_ids).to eq(["#{b3.global_id}-#{u1.global_id}"])

      ue2 = UserExtra.create(user: u2)
      ue2.settings['replaced_boards'] = {}
      ue2.settings['replaced_boards'][b3.global_id] = b2.global_id
      ue2.save
      bb = Board.find_by_global_id("#{b1.global_id}-#{u2.global_id}")
      expect(bb.instance_variable_get('@sub_global')).to eq(u2)
      expect(bb.global_id).to eq("#{b1.global_id}-#{u2.global_id}")
      expect(bb.downstream_board_ids).to eq(["#{b3.global_id}-#{u2.global_id}", "#{b4.global_id}"])
    end
  end
end
