require 'spec_helper'

describe SystemSidebarBoards do
  describe ".ensure_for" do
    it "generates keyboard and inflections boards for the content user when missing" do
      user = User.create(user_name: 'lingolinq')
      boards = described_class.ensure_for(user)
      expect(boards.length).to eq(3)
      expect(Board.find_by_path('lingolinq/keyboard')).to_not eq(nil)
      expect(Board.find_by_path('lingolinq/inflections')).to_not eq(nil)
      expect(Board.find_by_path('lingolinq/inflections-es')).to_not eq(nil)
      expect(Board.find_by_path('lingolinq/keyboard').public).to eq(true)
      expect(Board.find_by_path('lingolinq/keyboard').settings['locale']).to eq('en')
      expect(Board.find_by_path('lingolinq/inflections').public).to eq(true)
      expect(Board.find_by_path('lingolinq/inflections-es').public).to eq(true)
      expect(Board.find_by_path('lingolinq/inflections-es').settings['locale']).to eq('es')
    end

    it "imports the committed Vocal Flair keyboard OBZ in preference to legacy/generator" do
      example_user = User.create(user_name: 'example')
      Board.process_new({name: 'Keyboard', public: true}, {user: example_user, key: 'keyboard'})
      user = User.create(user_name: 'lingolinq')
      board = described_class.ensure_utility_board(user, described_class::UTILITIES.first)
      expect(board.user_id).to eq(user.id)
      # imported, not copied from the legacy example board
      expect(board.parent_board_id).to eq(nil)
      expect(board.settings['name']).to eq('Vocal Flair 84 - Keyboard')
      by_label = board.buttons.index_by { |b| b['label'] }
      expect(by_label['shift']['vocalization']).to eq(':shift')
      expect(by_label['space']['vocalization']).to eq(':space')
      expect(by_label['a']['vocalization']).to eq('+a')
    end

    it "falls back to copying the legacy example board when the OBZ is missing" do
      example_user = User.create(user_name: 'example')
      source = Board.process_new({name: 'Keyboard', public: true}, {user: example_user, key: 'keyboard'})
      user = User.create(user_name: 'lingolinq')
      allow(File).to receive(:exist?).and_call_original
      allow(File).to receive(:exist?).with(SystemSidebarBoards::SYSTEM_BOARDS_DIR.join('keyboard.obz')).and_return(false)
      board = described_class.ensure_utility_board(user, described_class::UTILITIES.first)
      expect(board.user_id).to eq(user.id)
      expect(board.parent_board_id).to eq(source.id)
    end

    it "repairs a stale keyboard locale on the content user" do
      user = User.create(user_name: 'lingolinq')
      keyboard = described_class.generate_keyboard(user)
      keyboard.settings['locale'] = 'es'
      keyboard.save!

      board = described_class.ensure_utility_board(user, described_class::UTILITIES.first)
      expect(board.settings['locale']).to eq('en')
    end

    it "restores missing keyboard control vocalizations from the committed OBZ" do
      user = User.create(user_name: 'lingolinq')
      Board.process_new({
        'name' => 'Vocal Flair 84 - Keyboard',
        'public' => true,
        'locale' => 'en',
        'buttons' => [
          {'id' => 36, 'label' => 'shift'},
          {'id' => 44, 'label' => 'space'},
          {'id' => 27, 'label' => 'a'}
        ],
        'grid' => {'rows' => 1, 'columns' => 3, 'order' => [[36, 44, 27]]}
      }, {user: user, key: 'keyboard'})

      board = described_class.ensure_utility_board(user, described_class::UTILITIES.first)
      by_label = board.buttons.index_by { |b| b['label'] }
      expect(by_label['shift']['vocalization']).to eq(':shift')
      expect(by_label['space']['vocalization']).to eq(':space')
      expect(by_label['a']['vocalization']).to eq('+a')
    end

    it "is idempotent" do
      user = User.create(user_name: 'lingolinq')
      first = described_class.ensure_for(user)
      second = described_class.ensure_for(user)
      expect(first.map(&:id)).to eq(second.map(&:id))
    end
  end
end
