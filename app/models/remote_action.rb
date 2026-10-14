class RemoteAction < ApplicationRecord
  # A kept update_available_boards row is dispatched again only once its last dispatch is this old:
  # the job is then taken as lost (eviction, failover, a killed worker).
  REFRESH_REDISPATCH_AFTER = 3.hours

  # Actions whose row process_action keeps (:keep) until their job deletes it on completion, other
  # than the delete retries (Uploader::REMOTE_DELETE_RETRY_ACTIONS). The 3-month purge reports
  # these (Uploader.report_purged_kept_remote_actions).
  KEPT_UNTIL_DONE_ACTIONS = ['clean_up_destroyed_org', 'clean_up_destroyed_unit', 'room_member_removal', 'update_available_boards'].freeze

  def process_action
    ra = self
    if ra.action == 'delete'
      if ra.path && ra.extra
        Worker.schedule_for(:slow, Uploader, :remote_remove, ra.path, ra.extra)
      end
    elsif Uploader::REMOTE_DELETE_RETRY_ACTIONS.include?(ra.action)
      # deletes deferred for missing S3 credentials (Uploader.record_remote_delete_retry); extra may be nil
      if ra.path
        # Kept until Uploader.retry_remote_delete deletes it on completion; pushed out a day first,
        # so the hourly batch does not enqueue it again while that job is pending.
        ra.update_column(:act_at, Uploader::REMOTE_DELETE_RETRY_DELAY.from_now)
        Worker.schedule_for(:slow, Uploader, :retry_remote_delete, ra.action, ra.path, ra.extra, ra.created_at.to_i)
        return :keep
      end
    elsif ra.action == 'notify_unassigned'
      user_id, org_id = ra.path.split(/::/, 2)
      UserMailer.schedule_delivery(:organization_unassigned, user_id, org_id)
    elsif ra.action == 'upload_button_set'
      board_id, user_id = ra.path.split(/::/, 2)
      BoardDownstreamButtonSet.schedule_for(:slow, :update_for, board_id, true)
    elsif ra.action == 'upload_log_session'
      session = LogSession.find_by_global_id(ra.path)
      if session
        session.schedule_for(:slow, :detach_extra_data, true)
      end
    elsif ra.action == 'upload_extra_data'
      board_id, user_id = ra.path.split(/::/, 2)
      BoardDownstreamButtonSet.schedule_for(:slow, :generate_for, board_id, user_id)
    elsif ra.action == 'queued_goals'
      UserGoal.schedule(:handle_goals, ra.path)
    elsif ra.action == 'weekly_stats_update'
      user_id, weekyear = ra.path.split(/::/, 2)
      WeeklyStatsSummary.schedule(:update_now, user_id, weekyear)
    elsif ra.action == 'update_available_boards'
      user = User.find_by_path(ra.path)
      if user
        # Kept until update_available_boards completes: it deletes the rows due when it started
        # (board_caching.rb), so act_at stays put. extra (unused otherwise for this action) holds
        # the last dispatch time until that job starts (it clears it), and while it is set the
        # hourly batch dispatches again only after REFRESH_REDISPATCH_AFTER. schedule_once alone did
        # not dedupe: it stops looking for a queued copy once the queue holds more than 500 jobs
        # (boy_band scheduled_for?).
        dispatched_at = ra.extra.to_s.match?(/\A\d+\z/) ? Time.at(ra.extra.to_i) : nil
        return :keep if dispatched_at && dispatched_at > REFRESH_REDISPATCH_AFTER.ago
        user.schedule_once_for(:slow, :update_available_boards)
        ra.persisted? ? ra.update_column(:extra, Time.now.to_i.to_s) : ra.extra = Time.now.to_i.to_s
        return :keep
      end
    elsif ra.action == 'clean_up_destroyed_org'
      Organization.schedule(:clean_up_destroyed, ra.path.to_i)
      # Kept until Organization.clean_up_destroyed deletes it on completion.
      ra.retry_later_with_backoff
      return :keep
    elsif ra.action == 'clean_up_destroyed_unit'
      OrganizationUnit.schedule(:clean_up_destroyed, ra.path)
      # Kept until OrganizationUnit.clean_up_destroyed deletes it on completion.
      ra.retry_later_with_backoff
      return :keep
    elsif ra.action == 'room_member_removal'
      OrganizationUnit.schedule(:complete_member_removal, ra.path)
      # Kept until the removal completes (OrganizationUnit#member_removal_done).
      ra.retry_later_with_backoff
      return :keep
    elsif ra.action == 'update_library_cache'
      cache = LibraryCache.find_by_global_id(ra.path)
      cache.schedule_for(:slow, :find_expired_words) if cache
    elsif ra.action == 'badge_check'
      user_id, summary_id = ra.path.split(/::/, 2)
      UserBadge.schedule_once_for('slow', :check_for, user_id, summary_id)
    elsif ra.action == 'schedule_update_available_boards'
      board = Board.find_by_path(ra.path)
      board.schedule_once_for(:slow, :schedule_update_available_boards, ra.extra || 'all', true) if board
    elsif ra.action == 'track_downstream_with_visited'
      board = Board.find_by_path(ra.path)
      ts = ((board && (board.settings || {})['last_tracked']) || 0) - 1
      board.schedule_once_for(:slow, :track_downstream_with_visited) if board && ts < ra.updated_at.to_i
    elsif ra.action == 'save_sync_supervisors'
      user = User.find_by_path(ra.path)
      user.schedule(:save_sync_supervisors, true) if user
    elsif ra.action == 'audit_protected_sources'
      user = User.find_by_path(ra.path)
      user.schedule(:audit_protected_sources) if user
    else
      # An action this build does not know was written by a NEWER build (rolled back since, or
      # deploying alongside). Deleting the row would lose that build's queued work, so it is kept
      # (:keep) for a build that knows it; Uploader.remote_remove_batch still purges every row
      # older than 3 months. Logged without the path, which can identify a user.
      Rails.logger.error("RemoteAction#process_action: unknown action #{ra.action}, row #{ra.id} kept")
      return :keep
    end
  end

  # For a kept cleanup row whose job is lost or keeps failing: the next attempt waits as long as the
  # row has existed (so the wait doubles with each failed attempt), from an hour to a day. extra can
  # hold the job's own data (clean_up_destroyed_org), so the row's age stands in for an attempt
  # count. Rows older than 3 months are dropped, and reported, by Uploader.remote_remove_batch.
  def retry_later_with_backoff
    wait = (Time.now - self.created_at).seconds.clamp(1.hour, 1.day)
    self.update_column(:act_at, Time.now + wait)
  end

  # process_action returns :keep for a row that its job deletes when it completes, and for a row
  # whose action this build does not know.
  def self.process_all
    RemoteAction.all.each{|ra| ra.destroy unless ra.process_action == :keep }
  end
end
