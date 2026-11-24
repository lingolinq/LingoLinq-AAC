# Creates (or resets) the synthetic local user e2e/basic-speak-home.spec.js signs in as.
# LOCAL DEV DATABASE ONLY: the spec clicks real buttons. Every value here is made up.
#
#   DB_USER=... bin/rails runner app/frontend/e2e/support/users-basic-speak.rb
#
# A Basic communicator whose home board has one folder leading to a second board, so the spec can
# leave the home board in speak mode and press Home to come back.
require_relative 'local_e2e'
assert_local_e2e_database!

user = e2e_user('e2e_basic_speak', 'board_view_style' => 'classic', 'locale' => 'en')

def e2e_board(user, key, name, buttons, order)
  Board.find_by(key: "#{user.user_name}/#{key}") || Board.process_new({
    'name' => name, 'key' => key, 'public' => false, 'locale' => 'en',
    'grid' => { 'rows' => 1, 'columns' => order.length, 'order' => [order] },
    'buttons' => buttons
  }, { user: user })
end

more = e2e_board(user, 'more-words', 'More Words',
  [{ 'id' => 1, 'label' => 'yes' }, { 'id' => 2, 'label' => 'no' }], [1, 2])
home = e2e_board(user, 'speak-home', 'Speak Home',
  [{ 'id' => 1, 'label' => 'hello' },
   { 'id' => 2, 'label' => 'more words', 'load_board' => { 'id' => more.global_id, 'key' => more.key } }], [1, 2])

user.settings['preferences']['home_board'] = { 'id' => home.global_id, 'key' => home.key, 'locale' => 'en' }
user.save!
puts "seeded basic speak e2e user (home #{home.key}, folder to #{more.key})"
