# Creates (or resets) the synthetic local users e2e/board-language.spec.js signs in
# as. LOCAL DEV DATABASE ONLY: the spec clicks real buttons. Every value here is made up.
#
#   DB_USER=... bin/rails runner app/frontend/e2e/support/users-language.rb
require_relative 'local_e2e'
assert_local_e2e_database!

def english_home(user)
  key = "#{user.user_name}/english-home"
  home = Board.find_by(key: key) || Board.process_new({
    'name' => 'English Home', 'key' => 'english-home', 'public' => false, 'locale' => 'en',
    'grid' => { 'rows' => 1, 'columns' => 2, 'order' => [[1, 2]] },
    'buttons' => [{ 'id' => 1, 'label' => 'hello' }, { 'id' => 2, 'label' => 'more' }]
  }, { user: user })
  user.settings['preferences']['home_board'] = { 'id' => home.global_id, 'key' => home.key, 'locale' => 'en' }
  user.save!
end

english_home(e2e_user('e2e_basic_lang', 'board_view_style' => 'classic', 'locale' => 'en'))
english_home(e2e_user('e2e_modern_lang', 'board_view_style' => 'modern', 'locale' => 'en'))

communicator = e2e_user('e2e_comm_es', 'locale' => 'es')
supporter = e2e_user('e2e_supporter_lang', 'locale' => 'en', 'role' => 'supporter')
User.link_supervisor_to_user(supporter, communicator, nil, true) unless communicator.reload.supervisor_user_ids.include?(supporter.global_id)
puts 'seeded language e2e users'
