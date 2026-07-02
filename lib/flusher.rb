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

    ai_logs = AiApiLog.where(user_global_id: user.global_id)
    ai_logs.find_each do |log|
      flush_record(log)
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
  
  # NOTE on item 3 ("expired developer keys"): DeveloperKey has no expiration
  # concept anywhere in this codebase (no expires_at column, no settings blob,
  # no expired? method). Session/device tokens expire (Device#settings['keys']),
  # but a DeveloperKey is a permanent OAuth client registration. Implementing
  # this item would mean inventing an unreviewed criterion for destroying live
  # client credentials, so it is deliberately left undone here. Tracked as a
  # follow-up: decide whether developer keys should expire at all before
  # writing deletion logic for them (see LL-991d259b2a).
  def self.flush_leftovers
    # 1. removable button_sounds at least a week old with no board connections left.
    #    "No board connections" means BOTH no board_button_sounds join row AND no
    #    direct board_id -- a sound can be tied to a board either way, and the join
    #    table alone is not a complete signal (see the button_images note below for
    #    why relying on a single join table is risky). Routed through flush_record
    #    so the has_paper_trail(:on => [:destroy]) version gets cleaned up too.
    #
    #    NOTE: button_images are deliberately NOT included here. The plan's
    #    original wording ("no board connections") assumed board_button_images
    #    reflects live usage, the same way board_button_sounds does for sounds.
    #    It doesn't: Board#map_images stopped calling BoardButtonImage.connect/
    #    disconnect (see the commented-out calls around board.rb's map_images),
    #    while BoardButtonSound.connect/disconnect are still active. Board image
    #    usage is now derived purely from grid_buttons ('image_id' on each button,
    #    see Board#known_button_images), not from the join table. Using
    #    board_button_images as the orphan signal would treat every actively-used
    #    image as orphaned and destroy it -- including its S3 file -- on the first
    #    run. Left undone until image usage can be checked against grid_buttons (or
    #    the join table is restored), rather than shipping a check known to delete
    #    live data. See LL-991d259b2a.
    button_sound_scope = ButtonSound.where(removable: true)
      .where('button_sounds.created_at < ?', 1.week.ago)
      .where(board_id: nil)
      .left_joins(:board_button_sounds).where(board_button_sounds: { id: nil })

    # 2. board_button_images/board_button_sounds with no linked board, button_image,
    #    or button_sound. Neither join model is paper-trailed, so a batched
    #    delete_all (no flush_record needed) matches how flush_board_by_db_id
    #    already cleans these same tables.
    board_button_image_scope = BoardButtonImage.left_joins(:board, :button_image)
      .where(boards: { id: nil }).or(
        BoardButtonImage.left_joins(:board, :button_image).where(button_images: { id: nil })
      )
    board_button_sound_scope = BoardButtonSound.left_joins(:board, :button_sound)
      .where(boards: { id: nil }).or(
        BoardButtonSound.left_joins(:board, :button_sound).where(button_sounds: { id: nil })
      )

    # 4. log_session_boards with no linked log_session or board. Not paper-trailed.
    log_session_board_scope = LogSessionBoard.left_joins(:log_session, :board)
      .where(log_sessions: { id: nil }).or(
        LogSessionBoard.left_joins(:log_session, :board).where(boards: { id: nil })
      )

    # 5. progress records more than a month old. Progress.clear_old_progresses
    #    already prunes finished progresses after 7 days, but only opportunistically
    #    (called from Progress.schedule) and only when finished_at is set, so a
    #    crashed/never-finished progress record sits forever. This closes that gap
    #    with an unconditional age check on created_at. Not paper-trailed.
    progress_scope = Progress.where('progresses.created_at < ?', 1.month.ago)

    # 6. user_board_connections with no linked board or user. Not paper-trailed.
    user_board_connection_scope = UserBoardConnection.left_joins(:board, :user)
      .where(boards: { id: nil }).or(
        UserBoardConnection.left_joins(:board, :user).where(users: { id: nil })
      )

    # 7. paper trail versions whose item_type no longer maps to any model class
    #    (e.g. a renamed/removed legacy model). REPORT-ONLY, not deleted: per
    #    docs/legal/DATA_RETENTION.md:30, authentication/audit-trail paper_trail
    #    versions (User/Board/LogSession) require 6-year retention with cold-storage
    #    archival, not deletion. safe_constantize returning nil proves the CODE was
    #    renamed/removed, not that the audit evidence those rows carry is disposable
    #    -- a stale item_type could just as easily be a pre-rename class name (this
    #    app is a rename of CoughDrop/SweetSuite) whose versions still matter. Log
    #    and count for visibility; actual disposition needs a real archival decision,
    #    not a mechanical delete. Tracked as a follow-up finding (see
    #    audit-reports/FINDINGS.json) rather than implemented here.
    known_types = PaperTrail::Version.distinct.pluck(:item_type).compact
    stale_types = known_types.reject { |t| t.safe_constantize }
    stale_version_scope = stale_types.any? ? PaperTrail::Version.where(item_type: stale_types) : PaperTrail::Version.none

    # Counts are computed BEFORE any deletion runs, and the AuditEvent is written
    # before any deletion runs, so a failed audit write aborts the whole job (it
    # raises out of flush_leftovers) instead of leaving deletions that happened
    # with no record of them. counts reflect what is ABOUT to be removed, not a
    # post-hoc tally, by design.
    counts = {
      'button_sounds' => button_sound_scope.count,
      'board_button_images' => board_button_image_scope.count,
      'board_button_sounds' => board_button_sound_scope.count,
      'log_session_boards' => log_session_board_scope.count,
      'progresses' => progress_scope.count,
      'user_board_connections' => user_board_connection_scope.count,
      'versions_stale_type_detected_not_deleted' => stale_version_scope.count
    }

    Rails.logger.info("[Flusher.flush_leftovers] #{counts.to_a.map { |k, v| "#{k}=#{v}" }.join(' ')}")
    AuditEvent.create!(
      user_key: 'system',
      event_type: 'retention_flush',
      summary: "retention_flush " + counts.to_a.map { |k, v| "#{k}=#{v}" }.join(' '),
      data: counts
    )

    button_sound_scope.find_each { |bs| flush_record(bs) }
    board_button_image_scope.in_batches.delete_all
    board_button_sound_scope.in_batches.delete_all
    log_session_board_scope.in_batches.delete_all
    progress_scope.in_batches.delete_all
    user_board_connection_scope.in_batches.delete_all
    # versions_stale_type_detected_not_deleted: intentionally not deleted, see note above.

    counts
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
    # Move org seats with the user so the seat is not orphaned on merge.
    License.where(user_id: source.id).update_all(user_id: target.id)

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
    License.where(user_id: user.id).each do |lic|
      lic.update!(user_id: nil, granted_at: nil)
      flush_versions(lic.id, 'License')
    end
  end
  
  def self.flush_user_completely(user_id, user_name)
    user = find_user(user_id, user_name)
    flush_user_content(user_id, user_name)
    # TODO: remove any public comments by the user
    LogSession.where(:author_id => user.id).each do |note|
      note.update_columns(author_id: nil)
    end
    gid = user.global_id
    flush_record(user, user.id, 'User')
    # Accounting-of-disclosure: timestamp the permanent destruction of a user's
    # education/health records at the async finalization step. No human actor is
    # in scope here (scheduled flush), so the actor key is 'system'.
    AuditEvent.log_command('system', {
      'type' => 'user_permanently_destroyed',
      'user_id' => gid
    })
  end
end