require 'spec_helper'

describe UserBoardProvisioner do
  describe ".provision_for" do
    it "schedules library copies for default vocab boards when enabled" do
      source = User.create(user_name: 'lingolinq')
      user = User.create
      b1 = Board.process_new({name: 'Quick Core 60', public: true}, {user: source, key: 'quick-core-60'})
      b2 = Board.process_new({name: 'Vocal Flair 60', public: true}, {user: source, key: 'vocal-flair-60'})
      b3 = Board.process_new({name: 'Vocal Flair 84', public: true}, {user: source, key: 'vocal-flair-84'})
      b4 = Board.process_new({name: 'Crisis Vocabulary', public: true}, {user: source, key: 'crisis-vocabulary'})

      allow(FeatureFlags).to receive(:signup_default_library_boards_enabled?).and_return(true)
      expect(Progress).to receive(:schedule).with(
        user,
        :copy_board_to_library,
        {'id' => b1.global_id},
        source.global_id,
        nil,
        for_user: user
      ).ordered
      expect(Progress).to receive(:schedule).with(
        user,
        :copy_board_to_library,
        {'id' => b2.global_id},
        source.global_id,
        nil,
        for_user: user
      ).ordered
      expect(Progress).to receive(:schedule).with(
        user,
        :copy_board_to_library,
        {'id' => b3.global_id},
        source.global_id,
        nil,
        for_user: user
      ).ordered
      expect(Progress).to receive(:schedule).with(
        user,
        :copy_board_to_library,
        {'id' => b4.global_id},
        source.global_id,
        nil,
        for_user: user
      ).ordered

      described_class.provision_for(user)
    end

    it "does nothing when the feature is disabled" do
      user = User.create
      allow(FeatureFlags).to receive(:signup_default_library_boards_enabled?).and_return(false)
      expect(Progress).to_not receive(:schedule)
      expect(described_class.provision_for(user)).to eq([])
    end

    it "skips missing boards without raising" do
      User.create(user_name: 'lingolinq')
      user = User.create
      allow(FeatureFlags).to receive(:signup_default_library_boards_enabled?).and_return(true)
      expect(Progress).to_not receive(:schedule)
      expect(described_class.provision_for(user)).to eq([])
    end
  end
end
