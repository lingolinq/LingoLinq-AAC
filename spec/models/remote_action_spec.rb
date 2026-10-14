require 'spec_helper'

describe RemoteAction, :type => :model do
  describe "process_action with an unknown action" do
    it "logs the action type instead of dropping the row silently" do
      allow(Rails.logger).to receive(:error)
      RemoteAction.new(action: 'not_a_known_action', path: 'x').process_action
      expect(Rails.logger).to have_received(:error).with(/unknown action not_a_known_action/)
    end

    # A row whose action this build does not know was written by a NEWER build (rolled back since,
    # or deploying alongside). Dropping it would lose that build's queued work, so it is kept until
    # a build that knows it processes it; the hourly batch's 3-month purge still bounds it.
    it "keeps a row whose action this code does not know" do
      ra = RemoteAction.create!(action: 'action_from_a_newer_build', path: 'x', act_at: 1.hour.ago)
      expect(ra.process_action).to eq(:keep)
    end

    it "logs the unknown action and the row, never the path" do
      allow(Rails.logger).to receive(:error)
      ra = RemoteAction.create!(action: 'action_from_a_newer_build', path: 'someuser::1_2', act_at: 1.hour.ago)
      ra.process_action
      expect(Rails.logger).to have_received(:error).with("RemoteAction#process_action: unknown action action_from_a_newer_build, row #{ra.id} kept")
    end

    it "is not destroyed by process_all, while a known row beside it still is" do
      ra = RemoteAction.create!(action: 'action_from_a_newer_build', path: 'x', act_at: 1.hour.ago)
      known = RemoteAction.create!(action: 'delete', path: 'file/1/pic.png', extra: 'chk1', act_at: 1.hour.ago)
      RemoteAction.process_all
      expect(RemoteAction.find_by(id: ra.id)).not_to eq(nil)
      expect(RemoteAction.find_by(id: known.id)).to eq(nil)
    end
  end

  # def process_action
  #   ra = self
  #   puts ra.action
  #   if ra.action == 'delete'
  #     if ra.path && ra.extra
  #       Worker.schedule_for(:slow, Uploader, :remote_remove, ra.path, ra.extra)
  #     end
  #   elsif ra.action == 'notify_unassigned'
  #     user_id, org_id = ra.path.split(/::/, 2)
  #     UserMailer.schedule_delivery(:organization_unassigned, user_id, org_id)
  #   elsif ra.action == 'upload_button_set'
  #     board_id, user_id = ra.path.split(/::/, 2)
  #     BoardDownstreamButtonSet.schedule_for(:slow, :update_for, board_id, true)
  #   elsif ra.action == 'upload_log_session'
  #     session = LogSession.find_by_global_id(ra.path)
  #     if session
  #       session.schedule_for(:slow, :detach_extra_data, true)
  #     end
  #   elsif ra.action == 'upload_extra_data'
  #     board_id, user_id = ra.path.split(/::/, 2)
  #     BoardDownstreamButtonSet.schedule_for(:slow, :generate_for, board_id, user_id)
  #   elsif ra.action == 'queued_goals'
  #     UserGoal.schedule(:handle_goals, ra.path)
  #   elsif ra.action == 'weekly_stats_update'
  #     user_id, weekyear = ra.path.split(/::/, 2)
  #     WeeklyStatsSummary.schedule(:update_now, user_id, weekyear)
  #   elsif ra.action == 'update_available_boards'
  #     user = User.find_by_path(ra.path)
  #     user.schedule_once_for(:slow, :update_available_boards) if user
  #   elsif ra.action == 'schedule_update_available_boards'
  #     board = Board.find_by_path(ra.path)
  #     board.schedule_once_for(:slow, :schedule_update_available_boards, ra.extra || 'all', true) if board
  #   elsif ra.action == 'track_downstream_with_visited'
  #     board = Board.find_by_path(ra.path)
  #     board.schedule_once_for(:slow, :track_downstream_with_visited) if board
  #   end
  # end

  it "should delete remote files" do
    ra = RemoteAction.new(action: 'delete')
    expect(Worker).to receive(:schedule_for).exactly(1).times
    ra.process_action

    ra.path = 'a'
    ra.process_action

    ra.extra = 'b'
    ra.process_action
  end
  
  it "should notify unassigned" do
    ra = RemoteAction.new(action: 'notify_unassigned', path: 'a::b')
    expect(UserMailer).to receive(:schedule_delivery).with(:organization_unassigned, 'a', 'b')
    ra.process_action
  end

  it "should upload button set" do
    ra = RemoteAction.new(action: 'upload_button_set', path: 'a::b')
    expect(BoardDownstreamButtonSet).to receive(:schedule_for).with(:slow, :update_for, 'a', true)
    ra.process_action
  end

  it "should upload log session" do
    u = User.create
    d = Device.create(user: u)
    obj = OpenStruct.new
    expect(LogSession).to receive(:find_by_global_id).with("bbb").and_return(nil)
    expect(LogSession).to receive(:find_by_global_id).with("aaa").and_return(obj)
    expect(obj).to receive(:schedule_for).with(:slow, :detach_extra_data, true).exactly(1).times
    s = LogSession.create(user: u, author: u, device: d)
    ra = RemoteAction.new(action: 'upload_log_session', path: 'aaa')
    ra.process_action
    ra.path = 'bbb'
    ra.process_action
  end

  it "should updload extra data" do
    ra = RemoteAction.new(action: 'upload_extra_data', path: 'a::b')
    expect(BoardDownstreamButtonSet).to receive(:schedule_for).with(:slow, :generate_for, 'a', 'b')
    ra.process_action
  end

  it "should handle queued goals" do
    ra = RemoteAction.new(action: 'queued_goals', path: 'aaa')
    expect(UserGoal).to receive(:schedule).with(:handle_goals, 'aaa')
    ra.process_action
  end

  it "should update weekly stats" do
    ra = RemoteAction.new(action: 'weekly_stats_update', path: 'a::b')
    expect(WeeklyStatsSummary).to receive(:schedule).with(:update_now, 'a', 'b')
    ra.process_action
  end

  it "should update available boards" do
    obj = OpenStruct.new
    expect(obj).to receive(:schedule_once_for).with(:slow, :update_available_boards).exactly(1).times
    expect(User).to receive(:find_by_path).with('aaa').and_return(obj)
    expect(User).to receive(:find_by_path).with('bbb').and_return(nil)
    ra = RemoteAction.new(action: 'update_available_boards', path: 'aaa')
    ra.process_action
    ra.path = 'bbb'
    ra.process_action
  end

  it "should schedule update_available_boards" do
    obj = OpenStruct.new
    expect(obj).to receive(:schedule_once_for).with(:slow, :schedule_update_available_boards, 'all', true).exactly(1).times
    obj2 = OpenStruct.new
    expect(obj2).to receive(:schedule_once_for).with(:slow, :schedule_update_available_boards, 'abc', true).exactly(1).times
    expect(Board).to receive(:find_by_path).with('aaa').and_return(obj)
    expect(Board).to receive(:find_by_path).with('bbb').and_return(nil)
    expect(Board).to receive(:find_by_path).with('ccc').and_return(obj2)
    ra = RemoteAction.new(action: 'schedule_update_available_boards', path: 'aaa')
    ra.process_action
    ra.path = 'bbb'
    ra.process_action
    ra.path = 'ccc'
    ra.extra = 'abc'
    ra.process_action
  end

  it "should track downstream_with_visited" do
    obj = OpenStruct.new
    expect(obj).to receive(:schedule_once_for).with(:slow, :track_downstream_with_visited).exactly(1).times
    expect(Board).to receive(:find_by_path).with('aaa').and_return(obj)
    expect(Board).to receive(:find_by_path).with('bbb').and_return(nil)
    ra = RemoteAction.new(action: 'track_downstream_with_visited', path: 'aaa')
    ra.process_action
    ra.path = 'bbb'
    ra.process_action
  end

  


  # A kept update_available_boards row is due every hour until its refresh completes. schedule_once
  # stops looking for an already queued job once the queue holds more than 500 entries (boy_band
  # scheduled_for?), so each hourly batch queued another copy of the same refresh.
  describe "a kept update_available_boards row" do
    def queued_refreshes(user)
      Worker.scheduled_actions('slow').select{|a| a['args'][2].is_a?(Hash) && a['args'][2]['id'] == user.id && a['args'][2]['method'] == 'update_available_boards' }
    end

    it "is dispatched once, not once per hourly batch, while the slow queue is long" do
      u = User.create
      Worker.flush_queues
      RemoteAction.where(path: u.global_id).delete_all
      RemoteAction.create!(action: 'update_available_boards', path: u.global_id, act_at: 1.minute.ago)
      allow(Worker).to receive(:queue_size).and_return(600)

      Uploader.remote_remove_batch
      Uploader.remote_remove_batch

      expect(queued_refreshes(u).length).to eq(1)
      expect(RemoteAction.where(path: u.global_id, action: 'update_available_boards').count).to eq(1)
    end

    # A row the run leaves behind (written after the run started) needs another dispatch, so the
    # run clears the stamp the batch left for the copy it was.
    it "can be dispatched again as soon as the dispatched refresh has started" do
      u = User.create
      Worker.flush_queues
      RemoteAction.where(path: u.global_id).delete_all
      ra = RemoteAction.create!(action: 'update_available_boards', path: u.global_id, act_at: 1.minute.ago)
      allow(Worker).to receive(:queue_size).and_return(600)
      Uploader.remote_remove_batch
      expect(ra.reload.extra).not_to eq(nil)
      # stands in for a change recorded on the row while the refresh runs
      ra.update_column(:act_at, 1.hour.from_now)

      User.find(u.id).update_available_boards

      expect(ra.reload.extra).to eq(nil)
    end

    it "is dispatched again once the earlier dispatch is old enough to count as lost" do
      u = User.create
      Worker.flush_queues
      RemoteAction.where(path: u.global_id).delete_all
      RemoteAction.create!(action: 'update_available_boards', path: u.global_id, act_at: 1.minute.ago)
      allow(Worker).to receive(:queue_size).and_return(600)

      Uploader.remote_remove_batch
      Worker.flush_queues
      RemoteAction.where(path: u.global_id).update_all(extra: (RemoteAction::REFRESH_REDISPATCH_AFTER + 1.minute).ago.to_i.to_s)
      Uploader.remote_remove_batch

      expect(queued_refreshes(u).length).to eq(1)
    end
  end

  describe "process_all" do
    it "should process all remote requests" do
      a = OpenStruct.new
      b = OpenStruct.new
      c = OpenStruct.new
      d = OpenStruct.new
      expect(RemoteAction).to receive(:all).and_return([a, b, c])
      expect(a).to receive(:process_action)
      expect(b).to receive(:process_action)
      expect(c).to receive(:process_action)
      expect(d).to_not receive(:process_action)
      RemoteAction.process_all
    end
  end
end
