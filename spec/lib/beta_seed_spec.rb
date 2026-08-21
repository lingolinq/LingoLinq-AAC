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

  describe '.missing_required_seed_env' do
    it 'is empty in the test environment (defaults apply)' do
      expect(described_class.missing_required_seed_env).to eq([])
    end

    it 'reports blank required vars when running as staging' do
      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with('RAILS_ENV').and_return('staging')
      allow(ENV).to receive(:[]).with('SEED_LINGOLINQ_PASSWORD').and_return(nil)
      allow(ENV).to receive(:[]).with('SEED_ADMIN_PASSWORD').and_return('set')

      expect(described_class.missing_required_seed_env).to eq(['SEED_LINGOLINQ_PASSWORD'])
    end
  end

  describe '.content_boards_referenced_by_others' do
    it 'counts distinct other users referencing the content user\'s boards' do
      owner = User.create(user_name: 'lingolinq')
      board = Board.process_new({name: 'Lib', public: true}, {user: owner, key: 'lib'})
      u1 = User.create(user_name: 'u1')
      u2 = User.create(user_name: 'u2')
      UserBoardConnection.create!(user_id: u1.id, board_id: board.id, home: true)
      UserBoardConnection.create!(user_id: u2.id, board_id: board.id, home: false)
      # the owner's own connection must not count
      UserBoardConnection.create!(user_id: owner.id, board_id: board.id, home: true)

      expect(described_class.content_boards_referenced_by_others(owner)).to eq(2)
    end

    it 'is zero when no other users reference the boards' do
      owner = User.create(user_name: 'lingolinq')
      Board.process_new({name: 'Lib', public: true}, {user: owner, key: 'lib'})
      expect(described_class.content_boards_referenced_by_others(owner)).to eq(0)
    end
  end

  describe '.rebuild_content_boards!' do
    it 'rolls back deletes and restores ENV when ensure_baseline! fails' do
      owner = User.create(user_name: 'lingolinq')
      Board.process_new({name: 'A', public: true}, {user: owner, key: 'a'})
      prior_openaac = ENV['SEED_IMPORT_OPENAAC_VOCABULARIES']
      prior_curated = ENV['SEED_IMPORT_CURATED_VOCABULARIES']
      ENV.delete('SEED_IMPORT_OPENAAC_VOCABULARIES')
      ENV.delete('SEED_IMPORT_CURATED_VOCABULARIES')
      allow(described_class).to receive(:ensure_baseline!).and_raise('seed failed')

      expect {
        described_class.rebuild_content_boards!(owner, import_vocabularies: true)
      }.to raise_error('seed failed')

      expect(Board.where(user_id: owner.id).count).to eq(1)
      expect(ENV['SEED_IMPORT_OPENAAC_VOCABULARIES']).to eq(prior_openaac)
      expect(ENV['SEED_IMPORT_CURATED_VOCABULARIES']).to eq(prior_curated)
    end

    it 'refuses when other users reference content boards without ALLOW_REFERENCED_DELETE' do
      owner = User.create(user_name: 'lingolinq')
      board = Board.process_new({name: 'Lib', public: true}, {user: owner, key: 'lib'})
      other = User.create(user_name: 'u1')
      UserBoardConnection.create!(user_id: other.id, board_id: board.id, home: true)
      prior = ENV['ALLOW_REFERENCED_DELETE']
      ENV.delete('ALLOW_REFERENCED_DELETE')
      begin
        expect {
          described_class.rebuild_content_boards!(owner)
        }.to raise_error(/reference these boards/)

        expect(Board.where(user_id: owner.id).count).to eq(1)
      ensure
        if prior.nil?
          ENV.delete('ALLOW_REFERENCED_DELETE')
        else
          ENV['ALLOW_REFERENCED_DELETE'] = prior
        end
      end
    end

    it 'deletes and re-seeds when pre-flight checks pass' do
      allow(SystemBoardSources).to receive(:ensure_crisis_vocabulary!).and_return(nil)
      owner = User.create(user_name: 'lingolinq')
      Board.process_new({name: 'Old', public: true}, {user: owner, key: 'old-lib'})

      deleted = described_class.rebuild_content_boards!(owner, import_vocabularies: false)

      expect(deleted).to eq(1)
      expect(Board.find_by_path(SystemBoardSources.board_key('one'))).to_not eq(nil)
    end
  end
end
