# Copies default vocabulary boards into a new user's library on signup.
class UserBoardProvisioner
  def self.provision_for(user)
    return [] unless user

    apply_signup_sidebar!(user)
    return [] unless FeatureFlags.signup_default_library_boards_enabled?(user)

    source_user = SystemBoardSources.owner
    unless source_user
      Rails.logger.warn("[UserBoardProvisioner] System board owner #{SystemBoardSources::USER_NAME} not found")
      return []
    end

    if FeatureFlags.signup_spanish_library_boards_enabled?(user)
      return schedule_slugs(
        user,
        source_user,
        SystemBoardSources::SPANISH_LIBRARY_SLUGS + SystemBoardSources::SPANISH_SIDEBAR_COPY_SLUGS,
        SystemBoardSources::SPANISH_STARTER_BOARD_SLUG
      )
    end

    sync_slugs(user, source_user, SystemBoardSources::SIGNUP_SYNC_SLUGS)
    schedule_slugs(user, source_user, SystemBoardSources::SIGNUP_ASYNC_SLUGS, SystemBoardSources::STARTER_BOARD_SLUG)
  end

  # Persist the signup sidebar once. Empty stored prefs keep using
  # default_active_sidebar_boards, so this must not run for existing users.
  def self.apply_signup_sidebar!(user)
    return unless user
    user.settings ||= {}
    user.settings['preferences'] ||= {}
    stored = user.settings['preferences']['sidebar_boards']
    return if stored.present?

    user.settings['preferences']['sidebar_boards'] = User.signup_sidebar_boards(user).map { |entry| entry.dup }
    user.save
  end

  def self.sync_slugs(user, source_user, slugs)
    slugs.each do |slug|
      board = public_system_board(slug)
      next unless board

      user.copy_board_to_library(
        {'id' => board.global_id},
        source_user.global_id,
        nil
      )
    end
  end

  # The starter's job copies and then likes the copy (User#provision_starter_board!), so the offline sync keeps
  # one core board from the first sync (Traci, 2026-11-11; PR #1268). One job for both, because two jobs on
  # parallel workers can run in either order.
  def self.schedule_slugs(user, source_user, slugs, starter_slug = nil)
    progresses = []
    slugs.each do |slug|
      board = public_system_board(slug)
      next unless board

      progress = if slug == starter_slug
        Progress.schedule(user, :provision_starter_board!, {'id' => board.global_id}, source_user.global_id, for_user: user)
      else
        Progress.schedule(
          user,
          :copy_board_to_library,
          {'id' => board.global_id},
          source_user.global_id,
          nil,
          for_user: user
        )
      end
      progresses << progress if progress
    end
    progresses
  end

  def self.public_system_board(slug)
    key = SystemBoardSources.board_key(slug)
    board = Board.find_by_path(key)
    unless board&.public?
      Rails.logger.warn("[UserBoardProvisioner] Skipping missing or non-public board: #{key}")
      return nil
    end
    board
  end
  private_class_method :sync_slugs, :schedule_slugs, :public_system_board
end
