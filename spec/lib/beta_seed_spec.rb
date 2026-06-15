require 'spec_helper'

describe BetaSeed do
  describe '.ensure_baseline!' do
    it 'creates beta baseline users, admin access, and lingolinq starter boards' do
      allow(SystemBoardSources).to receive(:ensure_crisis_vocabulary!).and_return(nil)

      described_class.ensure_baseline!

      content_user = User.find_by(user_name: 'lingolinq')
      admin_user = User.find_by(user_name: 'lingolinq_admin')

      expect(content_user).to_not eq(nil)
      expect(admin_user).to_not eq(nil)
      expect(Organization.admin_manager?(admin_user)).to eq(true)
      expect(User.find_by(user_name: 'example')).to eq(nil)

      %w[one two three yesno keyboard inflections].each do |slug|
        board = Board.find_by_path(SystemBoardSources.board_key(slug))
        expect(board).to_not eq(nil)
        expect(board.public).to eq(true)
      end
    end
  end

  describe '.verify_beta_seed' do
    it 'returns no baseline misses after required templates are present' do
      allow(SystemBoardSources).to receive(:ensure_crisis_vocabulary!).and_return(nil)
      described_class.ensure_baseline!

      UserIntegration.create!(template: true, integration_key: 'core_word_list', settings: {})
      EvalProtocol::STATIC_PROFILES.each do |code|
        EvalProtocol.create!(
          public_protocol_id: code,
          population_profile: code,
          protocol_version: '1.0',
          settings: {'public' => true, 'protocol' => EvalProtocol.static_protocol_definition(code)}
        )
      end

      expect(described_class.verify_beta_seed(require_library_boards: false)).to eq([])
    end

    it 'reports missing signup library boards when required' do
      allow(SystemBoardSources).to receive(:ensure_crisis_vocabulary!).and_return(nil)
      described_class.ensure_baseline!

      missing = described_class.verify_beta_seed(require_library_boards: true)

      expect(missing).to include('board:lingolinq/quick-core-60')
      expect(missing).to include('board:lingolinq/vocal-flair-60')
      expect(missing).to include('board:lingolinq/vocal-flair-84')
    end
  end

  describe '.delete_content_boards!' do
    it 'destroys only the given user\'s boards and returns the count' do
      owner = User.create(user_name: 'lingolinq')
      other = User.create(user_name: 'someone-else')
      Board.process_new({name: 'A', public: true}, {user: owner, key: 'a'})
      Board.process_new({name: 'B', public: true}, {user: owner, key: 'b'})
      keep = Board.process_new({name: 'C', public: true}, {user: other, key: 'c'})

      deleted = described_class.delete_content_boards!(owner)

      expect(deleted).to eq(2)
      expect(Board.where(user_id: owner.id).count).to eq(0)
      expect(Board.find_by(id: keep.id)).to_not eq(nil)
    end

    it 'raises without a user' do
      expect { described_class.delete_content_boards!(nil) }.to raise_error(ArgumentError)
    end
  end
end
