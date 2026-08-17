require 'spec_helper'

describe SystemBoardSources do
  describe '.ensure_crisis_vocabulary!' do
    it 'returns the existing public board without re-importing' do
      owner = User.create(user_name: 'lingolinq')
      board = Board.process_new({name: "Crisis Vocabulary", public: true}, {user: owner, key: 'crisis-vocabulary'})
      expect(Converters::LingoLinq).to_not receive(:from_obz)
      result = described_class.ensure_crisis_vocabulary!(owner)
      expect(result.id).to eq(board.id)
    end

    it 'publishes an existing private board at the target key without re-importing' do
      owner = User.create(user_name: 'lingolinq')
      board = Board.process_new({name: "Crisis Vocabulary", public: false}, {user: owner, key: 'crisis-vocabulary'})
      board.settings['unlisted'] = true
      board.save!
      expect(Converters::LingoLinq).to_not receive(:from_obz)

      result = described_class.ensure_crisis_vocabulary!(owner)

      expect(result.id).to eq(board.id)
      expect(result.reload.public).to eq(true)
      expect(result.settings['unlisted']).to eq(false)
    end

    it 'returns nil when the OBZ file is missing and the board does not exist' do
      owner = User.create(user_name: 'lingolinq')
      allow(File).to receive(:exist?).and_call_original
      allow(File).to receive(:exist?).with(SystemBoardSources::CRISIS_VOCABULARY_OBZ).and_return(false)
      expect(described_class.ensure_crisis_vocabulary!(owner)).to eq(nil)
    end

    it 'stores the imported root board at the configured full board key' do
      owner = User.create(user_name: 'lingolinq')
      root = Board.process_new({name: "Imported Root", public: false}, {user: owner, key: 'imported-root'})
      allow(File).to receive(:exist?).and_call_original
      allow(File).to receive(:exist?).with(SystemBoardSources::CRISIS_VOCABULARY_OBZ).and_return(true)
      expect(Converters::LingoLinq).to receive(:from_obz).and_return([root])

      result = described_class.ensure_crisis_vocabulary!(owner)

      expect(result.reload.key).to eq(SystemBoardSources.board_key(SystemBoardSources::CRISIS_VOCABULARY_SLUG))
      expect(result.public).to eq(true)
      expect(result.settings['name']).to eq("Imported Root")
    end
  end

  describe '.ensure_senner_baud!' do
    it 'returns the existing public board without re-importing' do
      owner = User.create(user_name: 'lingolinq')
      board = Board.process_new({name: SystemBoardSources::SENNER_BAUD_NAME, public: true}, {user: owner, key: 'senner-baud'})
      expect(Converters::LingoLinq).to_not receive(:from_obz)
      result = described_class.ensure_senner_baud!(owner)
      expect(result.id).to eq(board.id)
    end

    it 'publishes an existing private board at the target key without re-importing' do
      owner = User.create(user_name: 'lingolinq')
      board = Board.process_new({name: SystemBoardSources::SENNER_BAUD_NAME, public: false}, {user: owner, key: 'senner-baud'})
      board.settings['unlisted'] = true
      board.save!
      expect(Converters::LingoLinq).to_not receive(:from_obz)

      result = described_class.ensure_senner_baud!(owner)

      expect(result.id).to eq(board.id)
      expect(result.reload.public).to eq(true)
      expect(result.settings['unlisted']).to eq(false)
    end

    it 'returns nil when the OBZ cannot be fetched, local fallback is missing, and the board does not exist' do
      owner = User.create(user_name: 'lingolinq')
      allow(described_class).to receive(:fetch_senner_baud_obz).and_return(nil)
      allow(described_class).to receive(:local_senner_baud_obz_path).and_return(nil)
      expect(described_class.ensure_senner_baud!(owner)).to eq(nil)
    end

    it 'imports from the local tmp fallback when S3 fetch fails' do
      owner = User.create(user_name: 'lingolinq')
      root = Board.process_new({name: "Senner-Baud greetings", public: false}, {user: owner, key: 'imported-root'})
      allow(described_class).to receive(:fetch_senner_baud_obz).and_return(nil)
      allow(described_class).to receive(:local_senner_baud_obz_path).and_return('/tmp/fake-senner.obz')
      expect(Converters::LingoLinq).to receive(:from_obz).with('/tmp/fake-senner.obz', hash_including('user' => owner)).and_return([root])

      result = described_class.ensure_senner_baud!(owner)

      expect(result.reload.key).to eq(SystemBoardSources.board_key(SystemBoardSources::SENNER_BAUD_SLUG))
      expect(result.settings['name']).to eq(SystemBoardSources::SENNER_BAUD_NAME)
    end

    it 'stores the imported root at the full key and forces the library name' do
      owner = User.create(user_name: 'lingolinq')
      root = Board.process_new({name: "Senner-Baud greetings", public: false}, {user: owner, key: 'imported-root'})
      allow(described_class).to receive(:fetch_senner_baud_obz).and_return(['https://example.s3.amazonaws.com/system-boards/senner-baud.obz', 'obz-bytes'])
      expect(Converters::LingoLinq).to receive(:from_obz).and_return([root])

      result = described_class.ensure_senner_baud!(owner)

      expect(result.reload.key).to eq(SystemBoardSources.board_key(SystemBoardSources::SENNER_BAUD_SLUG))
      expect(result.public).to eq(true)
      expect(result.settings['name']).to eq(SystemBoardSources::SENNER_BAUD_NAME)
    end

    it 'rewrites stale load_board.key values to match the board resolved by id' do
      owner = User.create(user_name: 'lingolinq')
      target = Board.process_new({name: "Keyboard", public: true}, {user: owner, key: 'keyboard'})
      root = Board.process_new({
        name: "Senner-Baud greetings",
        public: false,
        buttons: [
          {
            id: 1,
            label: "Keyboard",
            load_board: {id: target.global_id, key: 'lingolinq/keyboard_7'}
          }
        ],
        grid: {rows: 1, columns: 1, order: [[1]]}
      }, {user: owner, key: 'imported-root'})

      allow(described_class).to receive(:fetch_senner_baud_obz).and_return(['https://example.s3.amazonaws.com/system-boards/senner-baud.obz', 'obz-bytes'])
      expect(Converters::LingoLinq).to receive(:from_obz).and_return([root])

      result = described_class.ensure_senner_baud!(owner)
      btn = result.reload.settings['buttons'].detect { |b| b['id'] == 1 }
      expect(btn['load_board']['key']).to eq(target.key)
    end
  end

  describe '.relinquish_bare_core_roots!' do
    it 'moves bare core-N roots to senner-baud-core-N and leaves child keys alone' do
      owner = User.create(user_name: 'lingolinq')
      rootish = Board.process_new({name: "Senner-Baud main social actions", public: true}, {user: owner, key: 'core-60'})
      child = Board.process_new({name: "Core 60 - when", public: true}, {user: owner, key: 'core-60-when'})

      described_class.relinquish_bare_core_roots!([rootish, child], owner)

      expect(rootish.reload.key).to eq('lingolinq/senner-baud-core-60')
      expect(child.reload.key).to eq('lingolinq/core-60-when')
    end
  end

  describe '.rekey_quick_core_root!' do
    it 'maps quick-core-60.obz root onto the signup library key' do
      owner = User.create(user_name: 'lingolinq')
      root = Board.process_new({name: "Quick Core 60", public: true}, {user: owner, key: 'core-60'})

      result = described_class.rekey_quick_core_root!(root, 'quick-core-60.obz', owner)

      expect(result).to eq('lingolinq/quick-core-60')
      expect(root.reload.key).to eq('lingolinq/quick-core-60')
    end

    it 'returns nil for non-quick-core filenames' do
      owner = User.create(user_name: 'lingolinq')
      root = Board.process_new({name: "Vocal Flair 60", public: true}, {user: owner, key: 'vocal-flair-60'})
      expect(described_class.rekey_quick_core_root!(root, 'vocal-flair-60.obz', owner)).to eq(nil)
      expect(root.reload.key).to eq('lingolinq/vocal-flair-60')
    end
  end

  describe '.quick_core_root_slug_for_filename' do
    it 'parses quick-core sizes and ignores other files' do
      expect(described_class.quick_core_root_slug_for_filename('quick-core-60.obz')).to eq('quick-core-60')
      expect(described_class.quick_core_root_slug_for_filename('vocal-flair-60.obz')).to eq(nil)
    end
  end

  describe '.sync_load_board_keys!' do
    it 'updates load_board.key when it disagrees with the board found by id' do
      owner = User.create(user_name: 'lingolinq')
      target = Board.process_new({name: "People", public: true}, {user: owner, key: 'people'})
      board = Board.process_new({
        name: "Root",
        public: true,
        buttons: [
          {id: 1, label: "People", load_board: {id: target.global_id, key: 'lingolinq/people_4'}}
        ],
        grid: {rows: 1, columns: 1, order: [[1]]}
      }, {user: owner, key: 'sync-root'})

      described_class.sync_load_board_keys!([board])
      expect(board.reload.settings['buttons'].first['load_board']['key']).to eq(target.key)
    end
  end

  describe '.local_senner_baud_obz_path' do
    it 'prefers SENNER_BAUD_OBZ_PATH when the file exists' do
      path = Rails.root.join('tmp', 'seed-boards-spec-senner.obz').to_s
      FileUtils.mkdir_p(File.dirname(path))
      File.write(path, 'x')
      previous = ENV['SENNER_BAUD_OBZ_PATH']
      begin
        ENV['SENNER_BAUD_OBZ_PATH'] = path
        expect(described_class.local_senner_baud_obz_path).to eq(path)
      ensure
        ENV['SENNER_BAUD_OBZ_PATH'] = previous
        FileUtils.rm_f(path)
      end
    end
  end
end
