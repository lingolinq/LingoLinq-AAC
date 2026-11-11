require 'spec_helper'

# THE STARTER BOARD IS LIKED AT SIGN-UP (Traci, 2026-11-11; PR #1268, proposals doc section 16). The sign-up
# provisioner copies the library sets for the new account in jobs; for the starter (Vocal Flair 60) the job also
# likes the person's own copy, so the offline sync keeps it from the first sync. The person can unlike it later.
describe User, "#provision_starter_board!" do
  def source_and_starter
    source = User.create(user_name: 'lingolinq')
    starter = Board.process_new({name: 'Vocal Flair 60', public: true}, {user: source, key: 'vocal-flair-60'})
    [source, starter]
  end

  it "copies the starter board into the user's library and likes the copy" do
    source, starter = source_and_starter
    user = User.create
    expect(user.provision_starter_board!({'id' => starter.global_id}, source.global_id)).to eq(true)
    copy = user.boards.where(parent_board: starter).order('id DESC').first
    expect(copy).to_not eq(nil)
    expect(copy.reload.starred_by?(user)).to eq(true)
    # Board#star schedules the liked-list update (User#remember_starred_board!) as a job of its own.
    Worker.process_queues
    user.reload
    expect(user.settings['starred_board_ids']).to eq([copy.global_id])
    expect(user.settings['starred_boards']).to eq(1)
  end

  it "does not save the user row it was loaded with (the liked list is written by a job on a fresh row)" do
    # Progress.perform_action loads the user when the job starts; the copy takes seconds, and a save of that
    # row afterwards would write over a home board chosen on the welcome card in the meantime.
    source, starter = source_and_starter
    user = User.create
    expect(user).to_not receive(:save)
    expect(user).to_not receive(:save!)
    expect(user).to_not receive(:save_with_sync)
    expect(user.provision_starter_board!({'id' => starter.global_id}, source.global_id)).to eq(true)
  end

  it "likes the home board when the person already made a copy of the starter their home, not the newest copy" do
    source, starter = source_and_starter
    user = User.create
    job_user = User.find_by(id: user.id)
    home_copy = starter.copy_for(user)
    newer_copy = starter.copy_for(user)
    user.reload
    user.settings['preferences']['home_board'] = {'id' => home_copy.global_id, 'key' => home_copy.key}
    user.save
    expect(newer_copy.id).to be > home_copy.id
    expect(job_user.provision_starter_board!({'id' => starter.global_id}, source.global_id)).to eq(true)
    expect(home_copy.reload.starred_by?(user)).to eq(true)
    expect(newer_copy.reload.starred_by?(user)).to eq(false)
  end

  it "likes an existing copy on a retry without listing it twice" do
    source, starter = source_and_starter
    user = User.create
    user.provision_starter_board!({'id' => starter.global_id}, source.global_id)
    user.provision_starter_board!({'id' => starter.global_id}, source.global_id)
    Worker.process_queues
    user.reload
    expect(user.boards.where(parent_board: starter).count).to eq(1)
    copy = user.boards.where(parent_board: starter).first
    expect(user.settings['starred_board_ids']).to eq([copy.global_id])
  end

  it "does nothing when the starter board is missing" do
    source = User.create(user_name: 'lingolinq')
    user = User.create
    expect(user.provision_starter_board!({'id' => 'nope'}, source.global_id)).to eq(false)
    Worker.process_queues
    expect(user.reload.settings['starred_board_ids']).to eq(nil)
  end
end
