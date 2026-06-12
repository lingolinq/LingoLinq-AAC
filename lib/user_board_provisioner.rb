# Copies default vocabulary boards into a new user's library on signup.
class UserBoardProvisioner
  def self.provision_for(user)
    return [] unless user && FeatureFlags.signup_default_library_boards_enabled?(user)

    source_user = SystemBoardSources.owner
    unless source_user
      Rails.logger.warn("[UserBoardProvisioner] System board owner #{SystemBoardSources::USER_NAME} not found")
      return []
    end

    progresses = []
    slugs = if FeatureFlags.signup_spanish_library_boards_enabled?(user)
      SystemBoardSources::SPANISH_LIBRARY_SLUGS
    else
      SystemBoardSources::SIGNUP_LIBRARY_SLUGS
    end
    slugs.each do |slug|
      key = SystemBoardSources.board_key(slug)
      board = Board.find_by_path(key)
      unless board&.public?
        Rails.logger.warn("[UserBoardProvisioner] Skipping missing or non-public board: #{key}")
        next
      end

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
end
