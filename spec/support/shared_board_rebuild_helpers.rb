# frozen_string_literal: true

# Helpers for specs that commit a sharing change while Board.all_shared_board_ids_for is
# rebuilding the cached shared-board list. Included by spec/models/concerns/sharing_spec.rb and
# spec/controllers/api/boards_controller_spec.rb.
module SharedBoardRebuildHelpers
  # Runs the block once, inside the next rebuild, after links_for and before the save
  # (Organization.attached_orgs runs there on the !plus_editing branch of all_shared_board_ids_for).
  def during_rebuild(&block)
    ran = false
    allow(Organization).to receive(:attached_orgs).and_wrap_original do |original, *args|
      unless ran
        ran = true
        block.call
      end
      original.call(*args)
    end
  end

  # Unshares `board` from `user` the first time the rebuild reaches Organization.attached_orgs,
  # which runs after links_for and before the save (sharing.rb, !plus_editing branch). With
  # run_jobs, the jobs the unshare queues also finish there, before the rebuild saves.
  def unshare_mid_rebuild(board, user, run_jobs: false)
    @unshared_mid_rebuild = false
    during_rebuild do
      @unshared_mid_rebuild = true
      board.reload.unshare_with(User.find(user.id))
      Worker.process_queues if run_jobs
    end
  end

  def shared_board_setup
    u = User.create
    u2 = User.create
    b = Board.create(:user => u)
    b.share_with(u2)
    Worker.process_queues
    [b, u2]
  end
end
