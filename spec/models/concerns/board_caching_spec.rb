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
      expect(u2.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id].sort)
      expect(u3.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id].sort)
      expect(u1.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id].sort)
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
      expect(u2.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id].sort)
      expect(u3.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id].sort)
      expect(u1.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id].sort)
    end

    # The update_available_boards row is the outbox for authorization state: removed when the hourly
    # batch enqueued its job, a lost job left the stale board list in place. update_available_boards
    # removes it when the refresh completes.
    it "keeps a due refresh row through the hourly batch until the refresh completes" do
      u = User.create(:user_name => "outbox_user")
      Worker.flush_queues
      RemoteAction.where(path: u.global_id).delete_all
      ra = RemoteAction.create!(action: 'update_available_boards', path: u.global_id, act_at: 1.minute.ago)
      Uploader.remote_remove_batch
      expect(RemoteAction.where(id: ra.id).count).to eq(1)
      expect(ra.reload.act_at).to be < Time.now
      u.reload.update_available_boards
      expect(RemoteAction.where(id: ra.id).count).to eq(0)
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
      expect(u2.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id].sort)
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
      expect(u2.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id].sort)
      expect(u1.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id].sort)
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
      # One wave only: a second process_queues runs process_all and destroys these user RAs.
      Worker.process_queues

      expect(RemoteAction.where(action: 'update_available_boards', path: u3.global_id).count).to be >= 1
      RemoteAction.process_all
      Worker.process_queues
      expect(u2.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id].sort)
      expect(u3.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id].sort)
      expect(u1.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id].sort)
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
      # the sharing above left refresh rows due in an hour, kept until a refresh run after then
      # deletes them; its refreshes already ran, so clear them and count only what b2 adds
      RemoteAction.where(action: 'update_available_boards', path: [u1, u2, u3].map(&:global_id)).delete_all
      
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
      expect(u2.reload.private_viewable_board_ids.sort).to eq([b.global_id, b3.global_id].sort)
      expect(u3.reload.private_viewable_board_ids.sort).to eq([b.global_id, b3.global_id].sort)
      expect(u1.reload.private_viewable_board_ids.sort).to eq([b.global_id, b3.global_id].sort)
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
      expect(u2.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id].sort)
      expect(u3.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id].sort)
      expect(u1.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id].sort)
      expect(u2.reload.private_editable_board_ids.sort).to eq([b.global_id, b2.global_id].sort)
      expect(u3.reload.private_editable_board_ids.sort).to eq([b.global_id, b2.global_id].sort)
      expect(u1.reload.private_editable_board_ids.sort).to eq([b.global_id, b2.global_id].sort)
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
      # rows are kept until a refresh that starts after their act_at (the board's debounce also
      # pushes them out an hour): make them due before each wave, so a loop shows as a new row
      due = -> { RemoteAction.where(action: 'update_available_boards').update_all(act_at: 1.minute.ago) }
      due.call
      RemoteAction.process_all
      due.call
      Worker.process_queues
      due.call
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
      
      expect(u1.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id].sort)
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
      expect(u2.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id].sort)
      expect(u3.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id].sort)
      expect(u1.reload.private_viewable_board_ids.sort).to eq([b.global_id, b2.global_id].sort)
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

    # settings is written whole on save; the refresh must store only its own keys, so settings
    # saved by another process before or during the refresh survive it.
    describe "saving the refreshed lists" do
      def shared_board_user
        author = User.create
        u = User.create
        b = Board.create(:user => author)
        b.share_with(u)
        Worker.flush_queues
        [User.find(u.id), b]
      end

      # Runs the block once, while the refresh walks the shared boards (before its saves).
      def during_refresh(&block)
        ran = false
        allow(Board).to receive(:all_shared_board_ids_for).and_wrap_original do |original, *args|
          unless ran
            ran = true
            block.call
          end
          original.call(*args)
        end
      end

      it "keeps a touch: false write made while the lists were being built" do
        u, b = shared_board_user
        during_refresh do
          quiet = User.find(u.id)
          quiet.settings['spec_quiet'] = 'touch false'
          quiet.save(touch: false)
        end

        u.update_available_boards

        stored = User.find(u.id)
        expect(stored.settings['spec_quiet']).to eq('touch false')
        expect(stored.private_viewable_board_ids).to eq([b.global_id])
      end

      it "retries instead of saving over a normal save made while the lists were being built" do
        u, b = shared_board_user
        during_refresh do
          other = User.find(u.id)
          other.settings['preferences']['spec_marker'] = 'normal save'
          other.save
        end

        u.update_available_boards

        stored = User.find(u.id)
        expect(stored.settings['preferences']['spec_marker']).to eq('normal save')
        # rescheduled with its retry count (bounded, STALE_REFRESH_RETRIES)
        expect(Worker.scheduled_for?('default', User, :perform_action, {'id' => u.id, 'method' => 'update_available_boards', 'arguments' => [1]})).to eq(true)
      end

      # A run whose user row moved meanwhile reschedules itself (stale_after), so a user whose row
      # moves during every run never got a revocation stored; retries are now bounded.
      it "stores a revocation within a few runs even when the user row moves during every run" do
        u, b = shared_board_user
        u.update_available_boards
        expect(User.find(u.id).private_viewable_board_ids).to eq([b.global_id])
        UserLink.remove(User.find(u.id), b, 'board_share')
        Worker.flush_queues
        allow(Board).to receive(:regenerate_shared_board_ids).and_wrap_original do |original, *args|
          busy = User.find(u.id)
          busy.settings['preferences']['spec_busy'] = rand(1000000)
          busy.save
          original.call(*args)
        end

        User.find(u.id).update_available_boards
        5.times { Worker.process_queues }

        expect(User.find(u.id).private_viewable_board_ids).to eq([])
      end

      # A run that ran within the hour for a user with more than 500 viewable boards is parked 30
      # minutes out. A retry rescheduled by the stale check always ran within the hour, so for those
      # users the retry bound never applied: each retry was parked instead of running.
      describe "a user with more than 500 viewable boards" do
        def large_list_user
          u, b = shared_board_user
          u.update_available_boards
          big = User.find(u.id)
          big.settings['available_private_board_ids'] = {'view' => (1..501).map{|i| "1_#{900000 + i}" }, 'edit' => [], 'generated' => Time.now.to_i}
          big.save(touch: false)
          [u, b]
        end

        it "runs a rescheduled retry instead of parking it" do
          u, b = large_list_user

          User.find(u.id).update_available_boards(1)

          expect(User.find(u.id).private_viewable_board_ids).to eq([b.global_id])
          expect(RemoteAction.where(path: u.global_id, action: 'update_available_boards').where('act_at > ?', 10.minutes.from_now).count).to eq(0)
        end

        it "still parks a first run within the hour" do
          u, b = large_list_user

          User.find(u.id).update_available_boards

          expect(User.find(u.id).private_viewable_board_ids.length).to eq(501)
          expect(RemoteAction.where(path: u.global_id, action: 'update_available_boards').where('act_at > ?', 10.minutes.from_now).count).to eq(1)
        end
      end

      # A refused store (the access this run read changed meanwhile) reschedules the refresh. That
      # retry ran with stale_retries 0, so for a user with more than 500 viewable boards it hit the
      # 60-minute parking the refused run's own 'generated' stamp had just armed.
      describe "a refused store's retry" do
        def large_list_user
          u = User.create
          u.settings['available_private_board_ids'] = {'view' => (1..501).map{|i| "1_#{900000 + i}" }, 'edit' => [], 'generated' => 2.hours.ago.to_i}
          u.save
          u.reload
        end

        it "runs instead of being parked for a user with more than 500 viewable boards" do
          u = large_list_user
          checks = 0
          allow_any_instance_of(User).to receive(:available_boards_inputs_current?) { checks += 1; checks > 1 }

          u.update_available_boards
          expect(User.find(u.id).private_viewable_board_ids.length).to eq(501)
          Worker.process_queues

          expect(User.find(u.id).private_viewable_board_ids).to eq([])
          expect(checks).to be >= 2
        end

        # A store refused every time (continuous churn) must not recompute in a loop. A cap would
        # drop the refresh and could leave a revoked board viewable, so after a few immediate retries
        # the row waits with backoff instead, and the hourly batch picks it up.
        it "stops retrying at once after a few refusals and leaves the row due later" do
          u = User.create
          checks = 0
          allow_any_instance_of(User).to receive(:available_boards_inputs_current?) { checks += 1; false }

          Worker.flush_queues
          u.update_available_boards
          # the queued retries alone (Worker.process_queues also dispatches every row, due or not)
          while (job = Resque.pop('default'))
            Worker.perform(*job['args'])
          end
          # the hourly batch dispatches only due rows
          Uploader.remote_remove_batch
          expect(Resque.size('slow')).to eq(0)

          expect(checks).to eq(1 + BoardCaching::REFUSED_STORE_RETRIES)
          rows = RemoteAction.where(path: u.global_id, action: 'update_available_boards')
          expect(rows.count).to eq(1)
          expect(rows.first.act_at).to be > 50.minutes.from_now
        end

        def run_queued_refreshes(limit=40)
          ran = 0
          while ran < limit && (job = Resque.pop('default'))
            Worker.perform(*job['args'])
            ran += 1
          end
          ran
        end

        # Each kind of retry used to reset the other's count, so stores that were refused and found
        # stale in turn were retried at once, unparked, without end.
        it "stops retrying at once when refusals and stale rows alternate" do
          u = large_list_user
          finals = 0
          allow_any_instance_of(User).to receive(:store_available_board_ids).and_wrap_original do |m, entries, **kw|
            if kw[:inputs_read]
              finals += 1
              raise ActiveRecord::StaleObjectError if finals.odd?
              false
            else
              m.call(entries, **kw)
            end
          end
          Worker.flush_queues

          u.update_available_boards
          run_queued_refreshes

          expect(Resque.size('default')).to eq(0)
          expect(finals).to be <= 1 + BoardCaching::STALE_REFRESH_RETRIES + BoardCaching::REFUSED_STORE_RETRIES
        end

        # A revocation that commits while the last immediate retry runs pulls the row forward and
        # queues its own refresh. Backing that row off with the others delayed it by up to a day,
        # and its own refresh was parked by the refused run's fresh 'generated' stamp.
        it "leaves a revocation that arrives during the last refused run due, and runs its refresh" do
          u = large_list_user
          checks = 0
          revocation_at = nil
          allow_any_instance_of(User).to receive(:available_boards_inputs_current?) do
            checks += 1
            if checks == 1 + BoardCaching::REFUSED_STORE_RETRIES
              User.persist_board_cache_refresh(u, true)
              revocation_at = Time.now
            end
            checks > 1 + BoardCaching::REFUSED_STORE_RETRIES
          end
          Worker.flush_queues
          RemoteAction.where(path: u.global_id).delete_all
          RemoteAction.create!(path: u.global_id, action: 'update_available_boards', act_at: 1.minute.ago, created_at: 3.days.ago)

          u.update_available_boards
          run_queued_refreshes
          expect(checks).to eq(1 + BoardCaching::REFUSED_STORE_RETRIES)
          rows = RemoteAction.where(path: u.global_id, action: 'update_available_boards')
          expect(rows.count).to eq(1)
          expect(rows.first.act_at).to be <= Time.now

          # the revocation's own refresh (schedule_board_cache_refresh queues it with no arguments)
          User.find(u.id).update_available_boards

          expect(checks).to eq(2 + BoardCaching::REFUSED_STORE_RETRIES)
          expect(User.find(u.id).private_viewable_board_ids).to eq([])
          expect(RemoteAction.where(path: u.global_id, action: 'update_available_boards').count).to eq(0)
        end
      end

      # The capped retry stores without the stale_after check. A run that read a supervision link,
      # a share or an org home board which was removed while it ran, after a newer refresh had
      # already stored the revocation and cleared the outbox row, merged its older list over it
      # and re-granted the removed access with nothing left to correct it.
      describe "access removed while a capped retry runs" do
        include ActiveSupport::Testing::TimeHelpers

        # Runs the block once, after the refresh has read its inputs and before it stores.
        def before_refresh_stores(&block)
          ran = false
          allow(Board).to receive(:regenerate_shared_board_ids).and_wrap_original do |original, *args|
            unless ran
              ran = true
              block.call
            end
            original.call(*args)
          end
        end

        def supervisor_of_child_with_private_board
          sup = User.create(:user_name => "capped_sup")
          child = User.create(:user_name => "capped_child")
          board = Board.create(:user => child)
          User.link_supervisor_to_user(sup, child, nil, true)
          Worker.flush_queues
          User.find(child.id).update_available_boards
          User.find(sup.id).update_available_boards
          expect(User.find(sup.id).private_viewable_board_ids).to include(board.global_id)
          expect(board.reload.allows?(User.find(sup.id), 'view')).to eq(true)
          [sup, child, board]
        end

        def unlink_and_refresh_during(sup, child)
          before_refresh_stores do
            User.unlink_supervisor_from_user(User.find(sup.id), User.find(child.id))
            # a newer refresh completes first: it stores the revocation and clears the outbox row
            User.find(sup.id).update_available_boards
            expect(RemoteAction.where(path: sup.global_id, action: 'update_available_boards').count).to eq(0)
          end
        end

        it "does not re-grant a removed supervisor's view of the child's private board" do
          sup, child, board = supervisor_of_child_with_private_board
          running = User.find(sup.id)
          unlink_and_refresh_during(sup, child)

          running.update_available_boards(BoardCaching::STALE_REFRESH_RETRIES)

          stored = User.find(sup.id)
          expect(stored.private_viewable_board_ids).not_to include(board.global_id)
          expect(board.reload.allows?(stored, 'view')).to eq(false)
          # the refused store leaves a refresh pending, so the current links get computed
          expect(RemoteAction.where(path: sup.global_id, action: 'update_available_boards').where('act_at <= ?', Time.now).count).to eq(1)
        end

        it "does not re-grant it on a first run either" do
          sup, child, board = supervisor_of_child_with_private_board
          running = User.find(sup.id)
          unlink_and_refresh_during(sup, child)

          running.update_available_boards(0)

          stored = User.find(sup.id)
          expect(stored.private_viewable_board_ids).not_to include(board.global_id)
          expect(board.reload.allows?(stored, 'view')).to eq(false)
        end

        it "does not re-grant a board unshared from the user" do
          u, b = shared_board_user
          u.update_available_boards
          expect(User.find(u.id).private_viewable_board_ids).to eq([b.global_id])
          running = User.find(u.id)
          before_refresh_stores do
            # the unshare path runs the user's refresh as a direct job, with no outbox row
            b.reload.unshare_with(User.find(u.id))
            User.find(u.id).update_available_boards
          end

          running.update_available_boards(BoardCaching::STALE_REFRESH_RETRIES)

          stored = User.find(u.id)
          expect(stored.private_viewable_board_ids).to eq([])
          expect(b.reload.allows?(stored, 'view')).to eq(false)
        end

        # An org's home boards are read from the organization, not from a link, so only the newer
        # refresh's generated stamp shows this run's list is older than the stored one.
        it "does not store over the list a newer refresh stored" do
          manager = User.create
          member = User.create
          board = Board.create(:user => manager)
          org = Organization.create
          org.settings['default_home_boards'] = [{'id' => board.global_id, 'key' => board.key}]
          org.save
          org.add_user(member.user_name, false, false)
          member.reload.update_available_boards
          expect(User.find(member.id).private_viewable_board_ids).to include(board.global_id)
          running = User.find(member.id)
          before_refresh_stores do
            org.reload.settings.delete('default_home_boards')
            org.save
            travel(5.seconds) { User.find(member.id).update_available_boards }
          end

          running.update_available_boards(BoardCaching::STALE_REFRESH_RETRIES)

          expect(User.find(member.id).private_viewable_board_ids).not_to include(board.global_id)
        end

        # The same within one second, as two refreshes of a small user usually are: a whole-second
        # 'generated' stamp could not tell the newer run from the older one.
        it "does not store over the list a newer refresh stored in the same second" do
          manager = User.create
          member = User.create
          board = Board.create(:user => manager)
          org = Organization.create
          org.settings['default_home_boards'] = [{'id' => board.global_id, 'key' => board.key}]
          org.save
          org.add_user(member.user_name, false, false)
          member.reload.update_available_boards
          expect(User.find(member.id).private_viewable_board_ids).to include(board.global_id)
          running = User.find(member.id)
          before_refresh_stores do
            org.reload.settings.delete('default_home_boards')
            org.save
            User.find(member.id).update_available_boards
            expect(User.find(member.id).private_viewable_board_ids).not_to include(board.global_id)
          end

          # one wall-clock second for both runs
          travel_to(Time.at(Time.now.to_i + 0.1)) do
            running.update_available_boards(BoardCaching::STALE_REFRESH_RETRIES)
          end

          expect(User.find(member.id).private_viewable_board_ids).not_to include(board.global_id)
          # the refused run leaves a refresh pending
          expect(RemoteAction.where(path: member.global_id, action: 'update_available_boards').count).to eq(1)
        end
      end

      it "keeps a write made after the caller loaded the user and before the refresh started" do
        u, b = shared_board_user
        quiet = User.find(u.id)
        quiet.settings['spec_quiet'] = 'touch false'
        quiet.save(touch: false)

        u.update_available_boards

        stored = User.find(u.id)
        expect(stored.settings['spec_quiet']).to eq('touch false')
        expect(stored.private_viewable_board_ids).to eq([b.global_id])
      end

      # updated_at is both the inactivity sweep's activity signal (subscription.rb, 12 months) and
      # part of every cached permission key (permissable cache_key), so the refresh moves it only
      # when access actually changed.
      # The refresh rebuilds the shared-board list (forced) and then moved boards_updated_at, the
      # stamp that list is checked against, so the next plain read rebuilt it again (links walk,
      # row lock, write). A refresh that changes nothing now leaves the stamp alone.
      it "leaves a shared-board list that the next read uses without rebuilding" do
        u, b = shared_board_user
        u.update_available_boards
        User.find(u.id).update_available_boards
        expect(User.find(u.id).private_viewable_board_ids).to eq([b.global_id])

        expect(UserLink).not_to receive(:links_for)
        expect(Board.all_shared_board_ids_for(User.find(u.id))).to eq([b.global_id])
        expect(Board.all_shared_board_ids_for(User.find(u.id), true)).to eq([])
      end

      it "leaves updated_at alone when the lists did not change" do
        u, b = shared_board_user
        u.update_available_boards
        User.where(id: u.id).update_all(updated_at: 13.months.ago)
        before = User.find(u.id).updated_at

        User.find(u.id).update_available_boards

        stored = User.find(u.id)
        expect(stored.updated_at).to eq(before)
        expect(stored.private_viewable_board_ids).to eq([b.global_id])
        expect(stored.boards_updated_at).to be > 5.minutes.ago
      end

      it "moves updated_at when the lists changed, so cached permissions are not reused" do
        u, b = shared_board_user
        u.update_available_boards
        b.reload.unshare_with(User.find(u.id))
        User.where(id: u.id).update_all(updated_at: 13.months.ago)

        User.find(u.id).update_available_boards

        stored = User.find(u.id)
        expect(stored.private_viewable_board_ids).to eq([])
        expect(stored.updated_at).to be > 5.minutes.ago
      end

      it "syncs devices when the lists change and keeps the generated stamp" do
        u, b = shared_board_user
        User.where(id: u.id).update_all(sync_stamp: 6.hours.ago)

        u.reload.update_available_boards

        stored = User.find(u.id)
        expect(stored.sync_stamp).to be > 5.minutes.ago
        expect(stored.settings['sync_stamp_reason']).to eq('board_list_changed')
        expect(stored.settings['available_private_board_ids']['generated']).to be >= 1.minute.ago.to_i
        expect(stored.boards_updated_at).to be > 5.minutes.ago
      end
    end

    # A district's private home boards reach its members through the shared-board list
    # (sharing.rb, Organization.attached_orgs). That list is cached on the user and served while
    # its stamp is >= boards_updated_at, which an org membership or home-board change does not
    # move, so the refresh rebuilt from the cached list and the member kept the district's board.
    describe "a former organization's private home board" do
      def org_member_with_private_home_board
        manager = User.create
        member = User.create
        board = Board.create(:user => manager)
        org = Organization.create
        org.settings['default_home_boards'] = [{'id' => board.global_id, 'key' => board.key}]
        org.save
        org.add_user(member.user_name, false, false)
        member.reload.update_available_boards
        expect(member.reload.private_viewable_board_ids).to include(board.global_id)
        # a later read (a board listing, the regenerate job) stamps the cached list with the
        # current boards_updated_at, as happens between a refresh and a detach in production
        expect(Board.all_shared_board_ids_for(User.find(member.id))).to include(board.global_id)
        [org, member, board]
      end

      it "removes view access to a former org's private home board after one refresh" do
        org, member, board = org_member_with_private_home_board

        org.detach_user(User.find(member.id), 'user')
        User.find(member.id).update_available_boards

        expect(User.find(member.id).private_viewable_board_ids).not_to include(board.global_id)
      end

      it "removes view access once the org drops the board as a home board" do
        org, member, board = org_member_with_private_home_board

        org.reload.settings.delete('default_home_boards')
        org.save
        User.find(member.id).update_available_boards

        expect(User.find(member.id).private_viewable_board_ids).not_to include(board.global_id)
      end
    end
  end
end
