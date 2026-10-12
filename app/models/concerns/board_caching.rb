module BoardCaching
  extend ActiveSupport::Concern
  
  # when to update this list for a user:
  # - board is shared/unshared with the user
  # - supervisee is added/removed
  # - authored/co-authored board is created, links modified, or changed to public/private
  # - board downstream of a authored/co-authored board is created, links modified, or changed to public/private
  # - board downstream of a downstream-shared board is created, links modified, or changed to public/private
  
  # explicitly-shared boards are viewable
  # the author's supervisors can view the author's boards
  # the user (and co-authors) should have edit and sharing access
  # the user and any of their editing supervisors should have edit access
  # the user should have edit and sharing access if a parent board is edit-shared including downstream with them
  # the user should have view access if the board is shared with any of their supervisees

  # How many times a run that found its user row moved (stale_after) is rescheduled before the
  # next run stores its result without that check.
  STALE_REFRESH_RETRIES = 3

  def update_available_boards(stale_retries=0)
    # TODO: sharding
    # Outbox release point. RemoteAction rows requesting this refresh are cleared
    # when the work is DONE, not when a job was accepted onto the queue --
    # Resque.enqueue returning only means Redis took an LPUSH, and
    # available_private_board_ids is authorization state (board.rb:76) with no TTL,
    # so a job lost to eviction, failover, or a SIGKILL past the shutdown grace
    # would otherwise leave a revoked supervisor's access in place indefinitely.
    # Clearing here keeps hourly remote_remove_batch as the real guarantee while
    # still collapsing the double recompute, for every producer of these rows
    # rather than only the supervising ones.
    started_at = Time.now

    if self.settings && self.settings['available_private_board_ids'] && (self.settings['available_private_board_ids']['generated'] || 0) > 60.minutes.ago.to_i
      # Schedule for later if already run recently
      if (self.settings['available_private_board_ids']['view'] ||[]).length > 500
        ra_cnt = RemoteAction.where(path: self.global_id, action: 'update_available_boards').count
        RemoteAction.create(path: self.global_id, action: 'update_available_boards', act_at: 30.minutes.from_now) if ra_cnt == 0
        return
      end
    end
    store_available_board_ids({'generated' => Time.now.to_i}, touch: false)
    authored = []
    # find all private boards authored by this user
    Board.where(:public => false, :user_id => self.id).select('id').find_in_batches(batch_size: 200) do |batch|
      batch.each do |brd|
        authored << brd.global_id
        authored << brd.shallow_id if brd.shallow_id != brd.global_id
      end
    end
    # find all private boards shared with this user
    # find all private boards where this user is a co-author
    # find all private boards downstream of boards shared with this user
    # find all private boards downstream of boards edit-shared with this user
    # Rebuilt, never read from the cache: its stamp does not move when an organization's home
    # boards or a membership change (sharing.rb all_shared_board_ids_for), so a cached list kept a
    # former district's private boards viewable.
    view_shared = Board.all_shared_board_ids_for(self, false, true)
    edit_shared = Board.all_shared_board_ids_for(self, true, true)


    # find all private boards available to this user's supervisees
    # find all private boards downstream of boards edit-shared with this user's supervisees
    supervisee_authored = []
    supervisee_view_shared = []
    supervisee_edit_shared = []
    self.supervisees.each do |sup| #.select{|s| self.edit_permission_for?(s) }.each do |sup|
      supervisee_view_shared += sup.private_viewable_board_ids 
      supervisee_edit_shared += sup.private_editable_board_ids if self.edit_permission_for?(sup)
#       # TODO: sharding
#       supervisee_authored += Board.where(:public => false, :user_id => sup.id).select('id').map(&:global_id)
#       supervisee_view_shared += Board.all_shared_board_ids_for(sup, false)
#       supervisee_edit_shared += Board.all_shared_board_ids_for(sup, true)
    end
    # generate a list of all private boards this user can edit/delete/share
    edit_ids = (authored + edit_shared + supervisee_authored + supervisee_edit_shared).uniq
    # generate a list of all private boards this user can view
    view_ids = (edit_ids + view_shared + supervisee_view_shared).uniq
    # TODO: sharding
    new_view_ids = []
    new_edit_ids = []
    added_edit_ids = []
    Board.where(:public => false, :id => self.class.local_ids(view_ids)).select('id').find_in_batches(batch_size: 100) do |batch|
      batch.each do |brd|
        new_view_ids << brd.global_id
        if edit_ids.include?(brd.global_id)
          new_edit_ids << brd.global_id 
          added_edit_ids << brd.global_id
        end
      end
    end
    view_ids = new_view_ids.sort
    Board.where(:id => self.class.local_ids(edit_ids - added_edit_ids)).select('id').find_in_batches(batch_size: 100) do |batch|
      batch.each do |brd|
        new_edit_ids << brd.global_id
      end
    end
    edit_ids = new_edit_ids.uniq.sort
    ab_json = self.settings['available_private_board_ids'].slice('view', 'edit').to_json
    lists_changed = ab_json != {'view' => view_ids, 'edit' => edit_ids}.to_json
    Board.regenerate_shared_board_ids([self.global_id])
    # save those lists
    store_available_board_ids({'view' => view_ids, 'edit' => edit_ids, 'generated' => Time.now.to_i},
      # boards_updated_at is the stamp the shared-board lists are checked against (sharing.rb
      # boards_updated_stamp). The forced rebuild above just stored them with the current stamp,
      # so moving it when nothing changed made the very next read rebuild them again.
      # After STALE_REFRESH_RETRIES rescheduled runs the result is stored anyway: a user whose
      # row moves during every run otherwise never got a revocation stored. It was computed from
      # links read at this run's start, newer than what is stored; a change it missed left its own
      # outbox row (act_at after started_at), which survives below and triggers another run.
      boards_updated_at: (lists_changed ? Time.now : nil),
      stale_after: (stale_retries < STALE_REFRESH_RETRIES ? self.updated_at : nil),
      save_method: (lists_changed ? :save_with_sync : nil), save_args: (lists_changed ? ['board_list_changed'] : []),
      # updated_at moves only when access changed: it keys every cached permission (permissable
      # cache_key), which must not be reused after a change, and it is also the inactivity sweep's
      # activity signal (subscription.rb), which a no-op refresh must not reset
      touch: lists_changed)
    # if the lists changed, schedule this same update for all users
    # who would have been affected by a change (supervisors)
    if lists_changed
      self.supervisors.each do |sup|
        ra_cnt = RemoteAction.where(path: sup.global_id, action: 'update_available_boards').count
        RemoteAction.create(path: sup.global_id, action: 'update_available_boards', act_at: 5.minutes.from_now) if ra_cnt == 0
      end
    end
    # Only rows that were already pending when this run STARTED are satisfied by
    # it. A row written while the recompute was in flight represents a change this
    # pass did not see, so it must survive to trigger another one.
    RemoteAction.where(path: self.global_id, action: 'update_available_boards')
      .where('act_at <= ?', started_at).delete_all
  rescue ActiveRecord::StaleObjectError
    # Failed run: the row stays, so the fallback still fires.
    self.schedule_once(:update_available_boards, stale_retries + 1)
  end
  
  # Writes only available_private_board_ids entries (and boards_updated_at) onto a locked fresh
  # copy (User#update_settings_locked): settings is written whole, and this copy was loaded before
  # the walk, so saving it reverted settings saved meanwhile, including touch: false writes that
  # assert_current_record! cannot see. stale_after replaces assert_current_record! under the lock:
  # a row updated since then may carry link changes (user_link.rb touch_connections) this run did
  # not read, so it raises StaleObjectError and update_available_boards reschedules itself.
  def store_available_board_ids(entries, boards_updated_at: nil, stale_after: nil, **save_opts)
    self.update_settings_locked(**save_opts) do |fresh|
      raise ActiveRecord::StaleObjectError if stale_after && fresh.updated_at.to_f > stale_after.to_f
      fresh.settings['available_private_board_ids'] ||= {'view' => [], 'edit' => []}
      fresh.settings['available_private_board_ids'].merge!(entries)
      fresh.boards_updated_at = boards_updated_at if boards_updated_at
      true
    end
  end

  def private_viewable_board_ids
    self.settings ||= {}
    ((self.settings['available_private_board_ids'] || {})['view'] || [])
  end
  
  def private_editable_board_ids
    # kind of a lie, since it includes shared public boards as well
    self.settings ||= {}
    ((self.settings['available_private_board_ids'] || {})['edit'] || [])
  end
  
  def can_view?(board)
    private_viewable_board_ids.include?(board.global_id(true))
  end
  
  def can_edit?(board)
    private_editable_board_ids.include?(board.global_id(true))
  end
end

