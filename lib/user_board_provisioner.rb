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
      return schedule_slugs(user, source_user, SystemBoardSources::SPANISH_LIBRARY_SLUGS)
    end

    sync_slugs(user, source_user, SystemBoardSources::SIGNUP_SYNC_SLUGS)
    schedule_slugs(user, source_user, SystemBoardSources::SIGNUP_ASYNC_SLUGS)
  end

  # Persist the signup sidebar once. Empty stored prefs keep using
  # default_active_sidebar_boards, so this must not run for existing users.
  def self.apply_signup_sidebar!(user)
    return unless user
    user.settings ||= {}
    user.settings['preferences'] ||= {}
    stored = user.settings['preferences']['sidebar_boards']
    return if stored.present?

    user.settings['preferences']['sidebar_boards'] = User.signup_sidebar_boards.map { |entry| entry.dup }
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

  def self.schedule_slugs(user, source_user, slugs)
    progresses = []
    slugs.each do |slug|
      board = public_system_board(slug)
      next unless board

      progress = Progress.schedule(
        user,
        :copy_board_to_library,
        {'id' => board.global_id},
        source_user.global_id,
        nil,
        for_user: user
      )
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
