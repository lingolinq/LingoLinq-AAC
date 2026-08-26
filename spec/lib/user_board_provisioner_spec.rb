require 'spec_helper'

describe UserBoardProvisioner do
  describe ".provision_for" do
    it "schedules vocal-flair-84 first, then sidebar utilities, then remaining library boards when enabled" do
      source = User.create(user_name: 'lingolinq')
      user = User.create
      yesno = Board.process_new({name: 'Yes/No', public: true}, {user: source, key: 'yesno'})
      inflections = Board.process_new({name: 'Inflections', public: true}, {user: source, key: 'inflections'})
      b1 = Board.process_new({name: 'Quick Core 60', public: true}, {user: source, key: 'quick-core-60'})
      b2 = Board.process_new({name: 'Vocal Flair 60', public: true}, {user: source, key: 'vocal-flair-60'})
      b3 = Board.process_new({name: 'Vocal Flair 84', public: true}, {user: source, key: 'vocal-flair-84'})
      b4 = Board.process_new({name: 'Crisis Vocabulary', public: true}, {user: source, key: 'crisis-vocabulary'})

      allow(FeatureFlags).to receive(:signup_default_library_boards_enabled?).and_return(true)
      # VF84 must not be copied inline (Rack::Timeout on staging); all copies are Progress jobs.
      expect(user).to_not receive(:copy_board_to_library)
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
        {'id' => yesno.global_id},
        source.global_id,
        nil,
        for_user: user
      ).ordered
      expect(Progress).to receive(:schedule).with(
        user,
        :copy_board_to_library,
        {'id' => inflections.global_id},
        source.global_id,
        nil,
        for_user: user
      ).ordered
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
        {'id' => b4.global_id},
        source.global_id,
        nil,
        for_user: user
      ).ordered

      described_class.provision_for(user)
      user.reload
      sidebar_keys = (user.settings['preferences']['sidebar_boards'] || []).map { |b| b['key'] }
      expect(sidebar_keys).to include(SystemBoardSources.board_key('vocal-flair-84'))
      expect(sidebar_keys).to include(SystemBoardSources.board_key('senner-baud'))
      expect(sidebar_keys).not_to include(SystemBoardSources.board_key('vocal-flair-60'))
    end

    it "writes the signup sidebar even when library copies are disabled" do
      user = User.create
      allow(FeatureFlags).to receive(:signup_default_library_boards_enabled?).and_return(false)
      expect(Progress).to_not receive(:schedule)
      expect(user).to_not receive(:copy_board_to_library)
      expect(described_class.provision_for(user)).to eq([])
      user.reload
      sidebar_keys = (user.settings['preferences']['sidebar_boards'] || []).map { |b| b['key'] }
      expect(sidebar_keys).to include(SystemBoardSources.board_key('vocal-flair-84'))
      expect(sidebar_keys).to include(SystemBoardSources.board_key('senner-baud'))
    end

    it "does not copy boards when the feature is disabled" do
      user = User.create
      user.settings['preferences']['sidebar_boards'] = [{'key' => 'already/set'}]
      user.save
      allow(FeatureFlags).to receive(:signup_default_library_boards_enabled?).and_return(false)
      expect(Progress).to_not receive(:schedule)
      expect(user).to_not receive(:copy_board_to_library)
      expect(described_class.provision_for(user)).to eq([])
      user.reload
      expect(user.settings['preferences']['sidebar_boards']).to eq([{'key' => 'already/set'}])
    end

    it "skips missing boards without raising" do
      User.create(user_name: 'lingolinq')
      user = User.create
      allow(FeatureFlags).to receive(:signup_default_library_boards_enabled?).and_return(true)
      expect(Progress).to_not receive(:schedule)
      expect(user).to_not receive(:copy_board_to_library)
      expect(described_class.provision_for(user)).to eq([])
    end
  end
end
