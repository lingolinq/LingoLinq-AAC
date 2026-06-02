require 'spec_helper'

describe SystemBoardSources do
  describe '.ensure_crisis_vocabulary!' do
    it 'returns the existing public board without re-importing' do
      owner = User.create(user_name: 'lingolinq')
      board = Board.process_new({name: 'Crisis Vocabulary', public: true}, {user: owner, key: 'crisis-vocabulary'})
      expect(Converters::LingoLinq).to_not receive(:from_obz)
      result = described_class.ensure_crisis_vocabulary!(owner)
      expect(result.id).to eq(board.id)
    end

    it 'returns nil when the OBZ file is missing and the board does not exist' do
      owner = User.create(user_name: 'lingolinq')
      allow(File).to receive(:exist?).and_call_original
      allow(File).to receive(:exist?).with(SystemBoardSources::CRISIS_VOCABULARY_OBZ).and_return(false)
      expect(described_class.ensure_crisis_vocabulary!(owner)).to eq(nil)
    end
  end
end
