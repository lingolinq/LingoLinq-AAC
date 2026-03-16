module Flusher
  def self.find_user(user_id, user_name)
    user = User.find_by_global_id(user_id)
    raise "user not found" unless user
    raise "wrong user!" unless user.user_name == user_name
    user
  end
  
  def self.flush_user_logs(user_id, user_name)
    user = find_user(user_id, user_name)
    # remove all logs tied to the user
    # don't remove anonymized user data from aggregate reports
    # make sure to remove from paper_trail as well
    sessions = LogSession.where(:user_id => user.id)
    sessions.each do |session|
      flush_record(session)
    end
    
    locations = ClusterLocation.where(:user_id => user.id)
    locations.each do |location|
      flush_record(location)
    end
    
    summaries = WeeklyStatsSummary.where(user_id: user.id)
    summaries.each do |summary|
      flush_record(summary)
    end
  end
  
  def self.flush_record(record, record_db_id=nil, record_class=nil)
    if record
      record.destroy 
      record_db_id = record.id
      record_class = record.class.to_s
    end
    flush_versions(record_db_id, record_class)
  end
  
  def self.flush_versions(record_db_id, record_class)
    PaperTrail::Version.where(:item_type => record_class, :item_id => record_db_id).delete_all
  end
  
  def self.flush_leftovers
    # 1. look for removable button_images and button_sounds and .destroy them if
    #    they are at least a week old and there are no board connections for them
    # 2. look for any board_button_images and board_button_sounds with no linked
    #    board, button or sound and .destroy them (also note it somewhere, in case
    #    there is a consistent leakage problem)
    # 3. look for any expired developer keys and .destroy them
    # 4. look for any log_session_boards that don't have a session or board
    #    and .destroy them (also note in case consistent leakage)
    # 5. look for any progress records more than a month old and destroy them
    # 6. look for any user_board_connections with no linked board or user
    #    and .destroy them (also note in case consistent leakage)
    # 7. look for any paper trail versions that point to records that
    #    don't exist anymore and .destroy them (also note in case consistent leakage)
    # TODO: also prune old versions? The list will get huge soon...
  end
  
  def self.flush_board(board_id, key, aggressive_flush=false)
    board = Board.find_by_global_id(board_id)
    raise "wrong board!" if !board || board.key != key
    flush_board_by_db_id(board.id, key, aggressive_flush)
  end
  
  def self.flush_board_by_db_id(board_db_id, key, aggressive_flush=false)
    # NOTE: the aggressive version of this method rips out anything used by the board, 
    # regardless of whether it is also used other places. For example, if I create a 
    # board and clone it and then aggressive-flush the cloned board, any images 
    # created on the original board will disappear.
    board = Board.find_by(:id => board_db_id)
    raise "wrong board!" if board && board.key != key
    # remove any button_image records
    # remove any board_button_images
    BoardButtonImage.where(:board_id => board_db_id).each do |bbi|
      bi = bbi.button_image
      full_flush = aggressive_flush && bi && bi.user_id == board.user_id
      full_flush ||= bi && bi.user_id == board.user_id && bi.board_button_images.count <= 1
      
      if bi && full_flush
        # TODO: reach into affected boards and remove the dead links
        BoardButtonImage.where(:button_image_id => bi.id).delete_all
        flush_record(bi)
      else
        BoardButtonImage.where(:id => bbi.id).delete_all
      end
    end
    # remove any button_sound records
    # remove any board_button_sounds
    BoardButtonSound.where(:board_id => board_db_id).each do |bbs|
      bs = bbs.button_sound
      full_flush = aggressive_flush && bs && bs.user_id == board.user_id
      full_flush ||= bs && bs.user_id == board.user_id && bs.board_button_sounds.count <= 1
      
      if bs && full_flush
        # TODO: reach into affected boards and remove the dead links
        BoardButtonSound.where(:button_sound_id => bs.id).delete_all
        flush_record(bs)
      else
        BoardButtonSound.where(:id => bbs.id).delete_all
      end
    end
    BoardDownstreamButtonSet.where(:board_id => board_db_id).each do |bs|
      flush_record(bs)
    end
    # remove any user_board_connections
    # remove as the home_board setting for any users
    # NOTE: this is aggressive, but probably necessary
    # TODO: build a notification for users who just lost their home board this way
    UserBoardConnection.where(:board_id => board_db_id).each do |bc|
      if bc.home && bc.user
        user = bc.user
        user.settings['preferences']['home_board'] = nil
        user.save_with_sync('flushed_home_board')
      end
      flush_record(bc)
    end
    LogSessionBoard.where(:board_id => board_db_id).each do |sb|
      flush_record(sb)
    end
    flush_record(board, board_db_id, 'Board')
    # make sure to remove from paper_trail as well
  end
  
  def self.flush_user_boards(user_id, user_name)
    user = find_user(user_id, user_name)
    # remove all boards created by the user
    # make sure to remove from paper_trail as well
    boards = Board.where(:user_id => user.id)
    boards.each do |board|
      # if the board has no parent board, it is an original and can be aggressively
      # flushed (i.e. any clones of the board that still use images from this board
      # will lose those images). This is an extreme measure, obviously.
      aggressive_flush = !board.parent_board_id
      flush_board(board.global_id, board.key, aggressive_flush)
    end
  end

  def self.flush_resque_errors
    RedisInit.flush_resque_errors
  end
  
  def self.flush_deleted_users
    users = User.where(['schedule_deletion_at < ?', Time.now]).limit(500).select('id, user_name')
    users.each do |user|
      Worker.schedule(Flusher, :flush_user_completely, user.global_id, user.user_name)
    end
    users.count
  end

  def self.transfer_user_content(source_user_id, source_user_name, target_user_id, target_user_name)
    source = find_user(source_user_id, source_user_name)
    target = find_user(target_user_id, target_user_name)
    return false unless source && target && source != target
    
    # we exclude logs because those are done elsewhere, to timebox the content that gets transferred

    # transfer boards
    boards = Board.where(:user_id => source.id)
    boards.each do |board|
      board.user_id = target.id
      board.save
      postfix = board.key.split(/\//)[1]
      # TODO: would it be easier to copy all the boards instead of transferring them?
      board.rename_to("#{target.user_name}/#{postfix}")
    end

    # transfer the rest

    # possible collision on uniqueness constraint
    NfcTag.where(:user_id => source.id).update_all(user_id: target.id) rescue nil
    UserIntegration.where(user_id: source.id).update_all(user_id: target.id)
    UserGoal.where(user_id: source.id).update_all(user_id: target.id)
    UserBadge.where(user_id: source.id).update_all(user_id: target.id)
    Webhook.where(user_id: source.id).update_all(user_id: target.id)
    UserBoardConnection.where(user_id: source.id).update_all(user_id: target.id)
    UserLink.where(user_id: source.id).update_all(user_id: target.id)
    ButtonSound.where(user_id: source.id).update_all(user_id: target.id)
    ButtonImage.where(user_id: source.id).update_all(user_id: target.id)
    UserVideo.where(user_id: source.id).update_all(user_id: target.id)

    #invalidate any caches
    source.touch
    target.touch
  end

  def self.flush_user_content(user_id, user_name, except_device=nil, except_org_links=false)
    user = find_user(user_id, user_name)
    flush_user_logs(user_id, user_name)
    flush_user_boards(user_id, user_name)
    # remove the user's devices and utterances
    Device.where(:user_id => user.id).each do |device|
      flush_record(device) unless device == except_device
    end
    Utterance.where(:user_id => user.id).each do |utterance|
      flush_record(utterance)
    end
    NfcTag.where(:user_id => user.id).each do |tag|
      flush_record(tag)
    end
    UserIntegration.where(user_id: user.id).each do |int|
      flush_record(int)
    end
    UserGoal.where(user_id: user.id).each do |goal|
      flush_record(goal)
    end
    UserBadge.where(user_id: user.id).each do |badge|
      flush_record(badge)
    end
    Webhook.where(user_id: user.id).each do |hook|
      flush_record(hook)
    end
    UserBoardConnection.where(user_id: user.id).each do |conn|
      flush_record(conn)
    end
    UserLink.where(user_id: user.id).each do |link|
      flush_record(link) unless except_org_links && link.record_code && link.record_code.match(/^Organization/)
    end
  end
  
  def self.flush_user_completely(user_id, user_name)
    user = find_user(user_id, user_name)
    flush_user_content(user_id, user_name)
    # TODO: remove any public comments by the user
    LogSession.where(:author_id => user.id).each do |note|
      note.update_columns(author_id: nil)
    end
    flush_record(user, user.id, 'User')
  end
end