# Creates (or resets) the synthetic local users e2e/save-waits.spec.js signs in as.
# LOCAL DEV DATABASE ONLY: the spec clicks real buttons. Every value here is made up.
#
#   DB_USER=... bin/rails runner app/frontend/e2e/support/users-save-waits.rb
#
# One user in Modern view and one in Basic, each with a "Save Waits" board of four labelled
# buttons and no pictures or sounds, reset on every run so each test starts from empty buttons.
require_relative 'local_e2e'
assert_local_e2e_database!

BUTTONS = [
  { 'id' => 1, 'label' => 'apple' }, { 'id' => 2, 'label' => 'ball' },
  { 'id' => 3, 'label' => 'cat' }, { 'id' => 4, 'label' => 'dog' }
].freeze
GRID = { 'rows' => 1, 'columns' => 4, 'order' => [[1, 2, 3, 4]] }.freeze

def save_waits_board(user)
  key = "#{user.user_name}/save-waits"
  board = Board.find_by(key: key)
  if board
    # Board#process keeps a button's image_id when the new data leaves it out, so the reset
    # writes the button list directly.
    board.settings['buttons'] = BUTTONS.map(&:dup)
    board.settings['grid'] = GRID.dup
    board.save!
  else
    board = Board.process_new({
      'name' => 'Save Waits', 'key' => 'save-waits', 'public' => false, 'locale' => 'en',
      'grid' => GRID.dup, 'buttons' => BUTTONS.map(&:dup)
    }, { user: user })
    # A new board can be given pictures for its labels on creation; start from empty buttons.
    board.settings['buttons'] = BUTTONS.map(&:dup)
    board.save!
  end
  board.reload
  raise "#{key} still has pictures or sounds" if board.buttons.any? { |b| b['image_id'] || b['sound_id'] }
  user.settings['preferences']['home_board'] = { 'id' => board.global_id, 'key' => board.key, 'locale' => 'en' }
  user.save!
  board
end

[['e2e_save_waits_modern', 'modern'], ['e2e_save_waits_basic', 'classic']].each do |name, style|
  user = e2e_user(name, 'board_view_style' => style, 'locale' => 'en')
  board = save_waits_board(user)
  puts "seeded #{name} (#{style}) with #{board.key}"
end
