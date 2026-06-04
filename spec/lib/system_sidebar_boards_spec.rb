require 'spec_helper'

describe SystemSidebarBoards do
  describe ".ensure_for" do
    it "generates keyboard and inflections boards for the content user when missing" do
      user = User.create(user_name: 'lingolinq')
      boards = described_class.ensure_for(user)
      expect(boards.length).to eq(2)
      expect(Board.find_by_path('lingolinq/keyboard')).to_not eq(nil)
      expect(Board.find_by_path('lingolinq/inflections')).to_not eq(nil)
      expect(Board.find_by_path('lingolinq/keyboard').public).to eq(true)
      expect(Board.find_by_path('lingolinq/keyboard').settings['locale']).to eq('en')
      expect(Board.find_by_path('lingolinq/inflections').public).to eq(true)
    end

    it "copies from legacy example boards when present" do
      example_user = User.create(user_name: 'example')
      source = Board.process_new({name: 'Keyboard', public: true}, {user: example_user, key: 'keyboard'})
      user = User.create(user_name: 'lingolinq')
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

    it "is idempotent" do
      user = User.create(user_name: 'lingolinq')
      first = described_class.ensure_for(user)
      second = described_class.ensure_for(user)
      expect(first.map(&:id)).to eq(second.map(&:id))
    end
  end
end
