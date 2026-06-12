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
end
