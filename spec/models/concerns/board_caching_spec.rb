require 'spec_helper'

describe BoardCaching, :type => :model do
  describe "private_viewable_board_ids" do
    it "should return an empty list if not defined" do
      u = User.new
      expect(u.private_viewable_board_ids).to eq([])
      u.settings = {}
      expect(u.private_viewable_board_ids).to eq([])
      u.settings['available_private_board_ids'] = {}
      expect(u.private_viewable_board_ids).to eq([])
    end
    
    it "should return a list of available" do
      u = User.new
      u.settings = {'available_private_board_ids' => {'view' => ['a', 'b', 'c']}}
      expect(u.private_viewable_board_ids).to eq(['a', 'b', 'c'])
    end
  end
  
  describe "private_editable_board_ids" do
    it "should return an empty list if not defined" do
      u = User.new
      expect(u.private_editable_board_ids).to eq([])
      u.settings = {}
      expect(u.private_editable_board_ids).to eq([])
      u.settings['available_private_board_ids'] = {}
      expect(u.private_editable_board_ids).to eq([])
    end
    
    it "should return a list of available" do
      u = User.new
      u.settings = {'available_private_board_ids' => {'view' => ['a', 'b', 'c']}}
      expect(u.private_editable_board_ids).to eq([])
      u.settings = {'available_private_board_ids' => {'edit' => ['a', 'b', 'c']}}
      expect(u.private_editable_board_ids).to eq(['a', 'b', 'c'])
    end
  end
  
  describe "can_view?" do
    it "should return false if not included" do
      u = User.new
      b = Board.new
      b.id = 121
      expect(u.can_view?(b)).to eq(false)
      u.settings = {}
      expect(u.can_view?(b)).to eq(false)
      u.settings['available_private_board_ids'] = {}
      expect(u.can_view?(b)).to eq(false)
      u.settings['available_private_board_ids']['view'] = []
      expect(u.can_view?(b)).to eq(false)
      u.settings['available_private_board_ids']['view'] = ['123', '234']
      expect(u.can_view?(b)).to eq(false)
    end
  
    it "should return true if included" do
      b = Board.new
      b.id = 134
      u = User.new(:settings => {'available_private_board_ids' => {'view' => [b.global_id]}})
      expect(u.can_view?(b)).to eq(true)
    end
  end
  
  describe "can_edit?" do
    it "should return false if not included" do
      u = User.new
      b = Board.new
      b.id = 121
      expect(u.can_edit?(b)).to eq(false)
      u.settings = {}
      expect(u.can_edit?(b)).to eq(false)
      u.settings['available_private_board_ids'] = {}
      expect(u.can_edit?(b)).to eq(false)
      u.settings['available_private_board_ids']['edit'] = []
      expect(u.can_edit?(b)).to eq(false)
      u.settings['available_private_board_ids']['edit'] = ['123', '234']
      expect(u.can_edit?(b)).to eq(false)
    end
  
    it "should return true if included" do
      b = Board.new
      b.id = 134
      u = User.new(:settings => {'available_private_board_ids' => {'edit' => [b.global_id]}})
      expect(u.can_edit?(b)).to eq(true)
    end
  end

  describe "update_available_boards" do
    # if someone downstream-edit-shares a board with me, and someone else on the team creates a new board and links to it, I should see it
    it "should handle new boards by co-authors" do
      u1 = User.create(:user_name => "user1")
      u2 = User.create(:user_name => "user2")
      u3 = User.create(:user_name => "user3")
      b = Board.create(:user => u1)
      b.reload.share_or_unshare(u2, true, {include_downstream: true, allow_editing: true, pending_allow_editing: false})
      b.reload.share_or_unshare(u3, true, {include_downstream: true, allow_editing: true, pending_allow_editing: false})
      Worker.process_queues
      Worker.process_queues
      expect(u1.reload.private_viewable_board_ids).to eq([b.global_id])
      expect(u2.reload.private_viewable_board_ids).to eq([b.global_id])
      expect(u3.reload.private_viewable_board_ids).to eq([b.global_id])
      
      b2 = Board.create(:user => u2)
      b.reload.process({'buttons' => [{'id' => 1, 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}]}, {:user => u2})
      b.reload.track_downstream_boards!
      b2.reload.track_downstream_boards!
      RedisInit.permissions.keys.each{|k| RedisInit.permissions.del(k) }
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      RemoteAction.process_all
      expect(u2.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id])
      expect(u3.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id])
      expect(u1.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id])
    end

    # if someone downstream-edit-shares a board with me, and someone else on the team creates a new board and links to it, I should see it
    it "should handle re-queueing" do
      u1 = User.create(:user_name => "user1")
      u2 = User.create(:user_name => "user2")
      u3 = User.create(:user_name => "user3")
      b = Board.create(:user => u1)
      b.reload.share_or_unshare(u2, true, {include_downstream: true, allow_editing: true, pending_allow_editing: false})
      b.reload.share_or_unshare(u3, true, {include_downstream: true, allow_editing: true, pending_allow_editing: false})
      
      b2 = Board.create(:user => u2)
      b.reload.process({'buttons' => [{'id' => 1, 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}]}, {:user => u2})
      RedisInit.permissions.keys.each{|k| RedisInit.permissions.del(k) }
      Worker.process_queues
      Worker.process_queues
      expect(u2.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id])
      expect(u3.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id])
      expect(u1.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id])
    end

    # if someone shares a board with me and creates a private sub-board, I shouldn't see it
    it "should ignore downstream boards without downstream share" do
      u1 = User.create(:user_name => "user1")
      u2 = User.create(:user_name => "user2")
      b = Board.create(:user => u1)
      b.reload.share_or_unshare(u2, true, {include_downstream: false, allow_editing: true, pending_allow_editing: false})
      Worker.process_queues
      Worker.process_queues
      expect(u1.reload.private_viewable_board_ids).to eq([b.global_id])
      expect(u2.reload.private_viewable_board_ids).to eq([b.global_id])
      
      b2 = Board.create(:user => u2)
      b.reload.process({'buttons' => [{'id' => 1, 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}]}, {:user => u2})
      RedisInit.permissions.keys.each{|k| RedisInit.permissions.del(k) }
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      expect(u2.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id])
      expect(u1.reload.private_viewable_board_ids.sort).to eq([b.global_id])
    end

    # if someone downstream-shares a board with me and creates a private sub-board, I should see it
    it "should include downstream-shared boards" do
      u1 = User.create(:user_name => "user1")
      u2 = User.create(:user_name => "user2")
      b = Board.create(:user => u1)
      b.reload.share_or_unshare(u2, true, {include_downstream: true, allow_editing: true, pending_allow_editing: false})
      Worker.process_queues
      Worker.process_queues
      expect(u1.reload.private_viewable_board_ids).to eq([b.global_id])
      expect(u2.reload.private_viewable_board_ids).to eq([b.global_id])
      
      b2 = Board.create(:user => u2)
      b.reload.process({'buttons' => [{'id' => 1, 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}]}, {:user => u2})
      b.reload.track_downstream_boards!
      b2.reload.track_downstream_boards!
      RedisInit.permissions.keys.each{|k| RedisInit.permissions.del(k) }
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      expect(u2.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id])
      expect(u1.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id])
    end

    # if someone downstream-shares a board with me and one of the board's downstream-co-authors creates a private sub-board, I should see it
    it "should handle private downstream boards by co-authors" do
      u1 = User.create(:user_name => "user1")
      u2 = User.create(:user_name => "user2")
      u3 = User.create(:user_name => "user3")
      b = Board.create(:user => u1)
      b.reload.share_or_unshare(u2, true, {include_downstream: true, allow_editing: true, pending_allow_editing: false})
      b.reload.share_or_unshare(u3, true, {include_downstream: true, allow_editing: false, pending_allow_editing: false})
      Worker.process_queues
      Worker.process_queues
      expect(u1.reload.private_viewable_board_ids).to eq([b.global_id])
      expect(u2.reload.private_viewable_board_ids).to eq([b.global_id])
      expect(u3.reload.private_viewable_board_ids).to eq([b.global_id])
      
      b2 = Board.create(:user => u2)
      b.reload.process({'buttons' => [{'id' => 1, 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}]}, {:user => u2})
      b.reload.track_downstream_boards!
      b2.reload.track_downstream_boards!
      RedisInit.permissions.keys.each{|k| RedisInit.permissions.del(k) }
      Worker.process_queues
      Worker.process_queues

      expect(RemoteAction.where(action: 'update_available_boards', path: u3.global_id).count).to be >= 1
      RemoteAction.process_all
      Worker.process_queues
      expect(u2.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id])
      expect(u3.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id])
      expect(u1.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id])
    end

    # if someone downstream-shares a board with me and one of the board's downstream-co-authors creates a public board, it shouldn't bother updating
    it "should ignore public downstream boards by co-authors" do
      u1 = User.create(:user_name => "user1")
      u2 = User.create(:user_name => "user2")
      u3 = User.create(:user_name => "user3")
      b = Board.create(:user => u1)
      b.reload.share_or_unshare(u2, true, {include_downstream: true, allow_editing: true, pending_allow_editing: false})
      b.reload.share_or_unshare(u3, true, {include_downstream: true, allow_editing: true, pending_allow_editing: false})
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      expect(u1.reload.private_viewable_board_ids).to eq([b.global_id])
      expect(u2.reload.private_viewable_board_ids).to eq([b.global_id])
      expect(u3.reload.private_viewable_board_ids).to eq([b.global_id])
      
      b2 = Board.create(:user => u2, :public => true)
      b.reload.process({'buttons' => [{'id' => 1, 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}]}, {:user => u2})
      RedisInit.permissions.keys.each{|k| RedisInit.permissions.del(k) }

      expect(RemoteAction.where(action: 'update_available_boards', path: u3.global_id).count).to eq(0)
      Worker.process_queues
      Worker.process_queues
      expect(RemoteAction.where(action: 'update_available_boards', path: u3.global_id).count).to eq(1)
      Worker.process_queues
      expect(u2.reload.private_viewable_board_ids.sort).to eq([b.global_id])
      expect(u3.reload.private_viewable_board_ids.sort).to eq([b.global_id])
      expect(u1.reload.private_viewable_board_ids.sort).to eq([b.global_id])
    end

    # if someone downstream-shares a board with me and one of the board's downstream-co-authors creates a 
    # public board that links to a different downstream-co-author's private board, I should see it
    it "should handle multi-step downstream board shares by co-authors" do
      u1 = User.create(:user_name => "user1")
      u2 = User.create(:user_name => "user2")
      u3 = User.create(:user_name => "user3")
      u4 = User.create(:user_name => "user4")
      b = Board.create(:user => u1)
      b.reload.share_or_unshare(u2, true, {include_downstream: true, allow_editing: true, pending_allow_editing: false})
      b.reload.share_or_unshare(u3, true, {include_downstream: true, allow_editing: true, pending_allow_editing: false})
      Worker.process_queues
      Worker.process_queues
      expect(u1.reload.private_viewable_board_ids).to eq([b.global_id])
      expect(u2.reload.private_viewable_board_ids).to eq([b.global_id])
      expect(u3.reload.private_viewable_board_ids).to eq([b.global_id])
      
      b2 = Board.create(:user => u4, :public => true)
      b.reload.process({'buttons' => [{'id' => 1, 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}]}, {:user => u2})
      b3 = Board.create(:user => u2)
      b2.reload.process({'buttons' => [{'id' => 1, 'load_board' => {'id' => b3.global_id, 'key' => b3.key}}]}, {:user => u2})
      b.reload.track_downstream_boards!
      b2.reload.track_downstream_boards!
      b3.reload.track_downstream_boards!
      RedisInit.permissions.keys.each{|k| RedisInit.permissions.del(k) }
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      RemoteAction.process_all
      Worker.process_queues
      Worker.process_queues
      # Explicitly run update_available_boards - RemoteAction schedules to slow queue
      [u1, u2, u3].each { |usr| usr.reload.update_available_boards }
      expect(u2.reload.private_viewable_board_ids.sort).to eq([b.global_id, b3.global_id])
      expect(u3.reload.private_viewable_board_ids.sort).to eq([b.global_id, b3.global_id])
      expect(u1.reload.private_viewable_board_ids.sort).to eq([b.global_id, b3.global_id])
    end
  
    # if I create a board downstream of a downstream-co-authored board (me not the author) that links
    # to the private board of a third co-author, I should see it added
    it "should handle multi-author multi-step downstream board links by co-authors" do
      u1 = User.create(:user_name => "user1")
      u2 = User.create(:user_name => "user2")
      u3 = User.create(:user_name => "user3")
      b = Board.create(:user => u1)
      b.reload.share_or_unshare(u2, true, {include_downstream: true, allow_editing: true, pending_allow_editing: false})
      b.reload.share_or_unshare(u3, true, {include_downstream: true, allow_editing: true, pending_allow_editing: false})
      Worker.process_queues
      Worker.process_queues
      expect(u1.reload.private_viewable_board_ids).to eq([b.global_id])
      expect(u2.reload.private_viewable_board_ids).to eq([b.global_id])
      expect(u3.reload.private_viewable_board_ids).to eq([b.global_id])
      expect(u1.reload.private_editable_board_ids).to eq([b.global_id])
      expect(u2.reload.private_editable_board_ids).to eq([b.global_id])
      expect(u3.reload.private_editable_board_ids).to eq([b.global_id])
      
      b2 = Board.create(:user => u2)
      b.reload.process({'buttons' => [{'id' => 1, 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}]}, {:user => u2})
      b.reload.track_downstream_boards!
      b2.reload.track_downstream_boards!
      RedisInit.permissions.keys.each{|k| RedisInit.permissions.del(k) }
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      RemoteAction.process_all
      expect(u2.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id])
      expect(u3.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id])
      expect(u1.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id])
      expect(u2.reload.private_editable_board_ids.sort).to eq([b.global_id, b2.global_id])
      expect(u3.reload.private_editable_board_ids.sort).to eq([b.global_id, b2.global_id])
      expect(u1.reload.private_editable_board_ids.sort).to eq([b.global_id, b2.global_id])
    end

    # if me and someone else supervise each other, we shouldn't get caught in a loop on update
    it "should not get stuck in supervision loops" do
      u1 = User.create(:user_name => "user1")
      u1.update_subscription('subscribe' => true, 'plan_id' => 'slp_monthly_granted', 'subscription_id' => 'free')
      u2 = User.create(:user_name => "user2")
      u2.update_subscription('subscribe' => true, 'plan_id' => 'slp_monthly_granted', 'subscription_id' => 'free')
      Worker.process_queues
      expect(u1.reload.grace_period?).to eq(false)
      expect(u2.reload.grace_period?).to eq(false)
      b = Board.create(:user => u1)
      User.link_supervisor_to_user(u1.reload, u2.reload)
      User.link_supervisor_to_user(u2.reload, u1.reload)
      expect(u1.reload.supervisors).to eq([u2])
      expect(u2.reload.supervisors).to eq([u1])
      u1.reload.update_available_boards
      expect(RemoteAction.find_by(path: u2.global_id, action: 'update_available_boards')).to_not eq(nil)
      # expect(Worker.scheduled_for?(:slow, User, :perform_action, {
      #   'id' => u2.id,
      #   'method' => 'update_available_boards',
      #   'arguments' => []
      # })).to eq(true)
      Worker.process_queues
      expect(u1.reload.supervisors).to eq([u2])
      expect(u2.reload.supervisors).to eq([u1])
      expect(RemoteAction.find_by(path: u1.global_id, action: 'update_available_boards')).to_not eq(nil)
      # expect(Worker.scheduled_for?(:slow, User, :perform_action, {
      #   'id' => u1.id,
      #   'method' => 'update_available_boards',
      #   'arguments' => []
      # })).to eq(true)
      RemoteAction.process_all
      Worker.process_queues
      Worker.process_queues
      expect(RemoteAction.find_by(path: u1.global_id, action: 'update_available_boards')).to eq(nil)
      expect(Worker.scheduled_for?(:slow, User, :perform_action, {
        'id' => u1.id,
        'method' => 'update_available_boards',
        'arguments' => []
      })).to eq(false)
      expect(RemoteAction.find_by(path: u2.global_id, action: 'update_available_boards')).to eq(nil)
      expect(Worker.scheduled_for?(:slow, User, :perform_action, {
        'id' => u2.id,
        'method' => 'update_available_boards',
        'arguments' => []
      })).to eq(false)
      Worker.process_queues
      expect(u1.reload.private_viewable_board_ids.sort).to eq([b.global_id])
      expect(u2.reload.private_viewable_board_ids.sort).to eq([b.global_id])
    end

    # if nothing changed, don't update supervisors
    it "should not update supervisors if the lists don't actually change" do
      u1 = User.create(:user_name => "user1", :settings => {})
      b = Board.create(:user => u1)
      u1.settings['available_private_board_ids'] = {'view' => [b.global_id], 'edit' => [b.global_id]}
      u1.save
      u2 = User.create(:user_name => "user2")
      User.link_supervisor_to_user(u2.reload, u1.reload)
      expect(u1.supervisors).to eq([u2])
      expect(u2.supervisors).to eq([])
      Worker.flush_queues
      u1.reload.update_available_boards
      expect(Worker.scheduled_for?(:slow, User, :perform_action, {
        'id' => u2.id,
        'method' => 'update_available_boards',
        'arguments' => []
      })).to eq(false)
    end

    # if something changed, update supervisors
    it "should update supervisors the lists actually changed" do
      u1 = User.create(:user_name => "user1", :settings => {})
      b = Board.create(:user => u1)
      u2 = User.create(:user_name => "user2")
      User.link_supervisor_to_user(u2.reload, u1.reload)
      expect(u1.supervisors).to eq([u2])
      expect(u2.supervisors).to eq([])
      Worker.flush_queues
      u1.reload.update_available_boards
      expect(RemoteAction.find_by(path: u2.global_id, action: 'update_available_boards')).to_not eq(nil)
      # expect(Worker.scheduled_for?(:slow, User, :perform_action, {
      #   'id' => u2.id,
      #   'method' => 'update_available_boards',
      #   'arguments' => []
      # })).to eq(true)
    end

    # if a shared board is changed from public to private, I should see it
    it "should update when board is changed to private" do
      u1 = User.create(:user_name => "user1")
      u2 = User.create(:user_name => "user2")
      b = Board.create(:user => u1, :public => true)
      b.share_with(u2)
      Worker.process_queues
      expect(u1.reload.private_viewable_board_ids).to eq([])
      expect(u2.reload.private_viewable_board_ids).to eq([])
      
      b.reload.process({:public => false}, {:user => u1})
      Worker.process_queues
      expect(u2.reload.private_viewable_board_ids).to eq([b.global_id])
      expect(u1.reload.private_viewable_board_ids).to eq([b.global_id])
    end

    # if a shared board is changed from private to public, it should not show up in the private board list
    it "should update when board is changed to private" do
      u1 = User.create(:user_name => "user1")
      u2 = User.create(:user_name => "user2")
      b = Board.create(:user => u1, :public => false)
      b.share_with(u2)
      Worker.process_queues
      Worker.process_queues
      expect(u1.reload.private_viewable_board_ids).to eq([b.global_id])
      expect(u2.reload.private_viewable_board_ids).to eq([b.global_id])
      
      b.reload.process({:public => true}, {:user => u1})
      Worker.process_queues
      Worker.process_queues
      expect(u2.reload.private_viewable_board_ids).to eq([])
      expect(u1.reload.private_viewable_board_ids).to eq([])
    end

    # if an authored board is created private, it should show up in the private board list
    it "should update when a private board is created" do
      u1 = User.create(:user_name => "user1")
      b = Board.create(:user => u1)
      Worker.process_queues
      Worker.process_queues
      expect(u1.reload.private_viewable_board_ids).to eq([b.global_id])
    end

    # if an authored board is created public, it shouldn't show up in the private board list
    it "should not update when a public board is created" do
      u1 = User.create(:user_name => "user1")
      b = Board.create(:user => u1, :public => true)
      Worker.process_queues
      expect(u1.reload.private_viewable_board_ids).to eq([])
    end

    # if an authored board gets a link to another board and there are no co-authors, it shouldn't bother updating
    it "should update on new links when there are no co-authors, in case there are some upstream" do
      u1 = User.create(:user_name => "user1")
      b = Board.create(:user => u1)
      b2 = Board.create(:user => u1)
      Worker.process_queues
      Worker.flush_queues
      
      b.process({'buttons' => [{'id' => 1, 'load_board' => {'id' => b2.global_id}}]}, {'user' => u1})

      Worker.process_queues
      Worker.process_queues
      expect(RemoteAction.where(action: 'update_available_boards', path: u1.global_id).count).to eq(1)
      RemoteAction.process_all
      Worker.process_queues
      
      expect(u1.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id])
    end

    # if a co-authored board gets a link to a private board by one of the authors, it should update
    it "should update on new links to co-author boards" do
      u1 = User.create(:user_name => "user1")
      u2 = User.create(:user_name => "user2")
      u3 = User.create(:user_name => "user3")
      b = Board.create(:user => u1)
      b.reload.share_or_unshare(u2, true, {include_downstream: true, allow_editing: true, pending_allow_editing: false})
      b.reload.share_or_unshare(u3, true, {include_downstream: true, allow_editing: true, pending_allow_editing: false})
      Worker.process_queues
      Worker.process_queues
      expect(u1.reload.private_viewable_board_ids).to eq([b.global_id])
      expect(u2.reload.private_viewable_board_ids).to eq([b.global_id])
      expect(u3.reload.private_viewable_board_ids).to eq([b.global_id])
      
      b2 = Board.create(:user => u2)
      b.reload.process({'buttons' => [{'id' => 1, 'load_board' => {'id' => b2.global_id, 'key' => b2.key}}]}, {:user => u2})
      b.reload.track_downstream_boards!
      b2.reload.track_downstream_boards!
      RedisInit.permissions.keys.each{|k| RedisInit.permissions.del(k) }
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      RemoteAction.process_all
      Worker.process_queues
      Worker.process_queues
      [u1, u2, u3].each { |usr| usr.reload.update_available_boards }
      expect(u2.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id])
      expect(u3.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id])
      expect(u1.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id])
    end

    # if an editable supervisee creates a board I should see it
    it "should update when editable supervisees create private boards" do
      u1 = User.create(:user_name => "user1")
      u2 = User.create(:user_name => "user2")
      User.link_supervisor_to_user(u1, u2, nil, true)
      u1.reload
      u2.reload
      expect(u1.edit_permission_for?(u2)).to eq(true)
      
      b = Board.create(:user => u2)
      Worker.process_queues
      Worker.process_queues
      Worker.process_queues
      expect(u2.reload.private_viewable_board_ids).to eq([b.global_id])
      expect(u1.reload.private_viewable_board_ids).to eq([b.global_id])
    end

    it "should not update when editable supervisees create public boards" do
      u1 = User.create(:user_name => "user1")
      u2 = User.create(:user_name => "user2")
      User.link_supervisor_to_user(u1, u2, nil, true)
      u1.reload
      u2.reload
      expect(u1.edit_permission_for?(u2)).to eq(true)
      
      b = Board.create(:user => u2, :public => true)
      Worker.process_queues
      expect(u2.reload.private_viewable_board_ids).to eq([])
      expect(u1.reload.private_viewable_board_ids).to eq([])
    end

    # if an uneditable supervisee creates a board I should not see it
    it "should not update when uneditable supervisees create private boards" do
      u1 = User.create(:user_name => "user1")
      u2 = User.create(:user_name => "user2")
      User.link_supervisor_to_user(u1, u2, nil, false)
      u1.reload
      u2.reload
      expect(u1.edit_permission_for?(u2)).to eq(false)
      
      b = Board.create(:user => u2)
      Worker.process_queues
      Worker.process_queues
      expect(u2.reload.private_viewable_board_ids).to eq([b.global_id])
      expect(u1.reload.private_viewable_board_ids).to eq([])
    end

    # if an editable supervisee is added, it should update
    it "should update when editable supervisees are added" do
      u1 = User.create(:user_name => "user1")
      u2 = User.create(:user_name => "user2")
      
      b = Board.create(:user => u2)
      Worker.process_queues
      Worker.process_queues
      expect(u2.reload.private_viewable_board_ids).to eq([b.global_id])
      expect(u1.reload.private_viewable_board_ids).to eq([])

      User.link_supervisor_to_user(u1, u2, nil, true)
      u1.reload
      u2.reload
      expect(u1.edit_permission_for?(u2)).to eq(true)
      Worker.process_queues
      Worker.process_queues
      expect(u2.reload.private_viewable_board_ids).to eq([b.global_id])
      expect(u1.reload.private_viewable_board_ids).to eq([b.global_id])
    end

    # if an uneditable supervisee is added, it should not update
    it "should not update when uneditable supervisees are added" do
      u1 = User.create(:user_name => "user1")
      u2 = User.create(:user_name => "user2")
      
      b = Board.create(:user => u2)
      Worker.process_queues
      Worker.process_queues
      expect(u2.reload.private_viewable_board_ids).to eq([b.global_id])
      expect(u1.reload.private_viewable_board_ids).to eq([])

      User.link_supervisor_to_user(u1, u2, nil, false)
      u1.reload
      u2.reload
      expect(u1.edit_permission_for?(u2)).to eq(false)
      Worker.process_queues
      Worker.process_queues
      expect(u2.reload.private_viewable_board_ids).to eq([b.global_id])
      expect(u1.reload.private_viewable_board_ids).to eq([b.global_id])
    end

    # if a supervisee has access to a board, so should I (see use cases above)
    it "should include boards available to supervisees" do
      u1 = User.create(:user_name => "user1")
      u2 = User.create(:user_name => "user2")
      u3 = User.create
      u4 = User.create(:user_name => "user4")
      b = Board.create(:user => u3)
      User.link_supervisor_to_user(u1, u2, nil, true)
      User.link_supervisor_to_user(u4, u1, nil, true)
      u1.reload
      u2.reload
      expect(u1.edit_permission_for?(u2)).to eq(true)
      u2.settings['available_private_board_ids'] = {'view' => ['a', 'b', 'c', b.global_id]}
      u2.save
      u1.update_available_boards
      expect(u1.private_viewable_board_ids).to eq([b.global_id])
      expect(RemoteAction.find_by(path: u4.global_id, action: 'update_available_boards')).to_not eq(nil)
      # expect(Worker.scheduled_for?(:slow, User, :perform_action, {
      #   'id' => u4.id,
      #   'method' => 'update_available_boards',
      #   'arguments' => []
      # })).to eq(true)
    end
  end
end
