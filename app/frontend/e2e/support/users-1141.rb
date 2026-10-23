# Creates (or resets) the synthetic local users the 1141 follow-up specs sign in as
# (e2e/home-assign-and-preferences.spec.js). LOCAL DEV DATABASE ONLY: the specs click real
# buttons. Every value here is made up.
#
#   DB_USER=... bin/rails runner app/frontend/e2e/support/users-1141.rb
#
# Separate users so the specs never change the seeded `example` user's preferences
# (an e2e run that writes a shared user's device prefs poisons later runs).
raise 'refusing to run outside development' unless Rails.env.development?

def e2e_user(user_name, prefs)
  u = User.find_by(user_name: user_name) || User.process_new({
    'name' => user_name.tr('_', ' '), 'user_name' => user_name, 'email' => "#{user_name}@example.com",
    'password' => 'password', 'public' => false
  }, {})
  u.settings['subscription'] ||= {}
  u.settings['subscription']['never_expires'] = true
  u.settings['subscription']['plan_id'] = 'slp_monthly_granted'
  u.settings['terms_agreed'] ||= Time.now.to_i
  u.settings['preferences'] ||= {}
  u.settings['preferences'].merge!(prefs)
  u.settings['preferences']['progress'] = {
    'setup_done' => true, 'intro_watched' => true, 'speak_mode_intro_done' => true, 'modeling_intro_done' => true
  }
  u.save!
  u
end

def e2e_board(user, name)
  key = "#{user.user_name}/#{name.parameterize}"
  b = Board.find_by(key: key)
  return b if b
  b = Board.process_new({
    'name' => name, 'key' => name.parameterize, 'public' => false,
    'grid' => { 'rows' => 1, 'columns' => 2, 'order' => [[1, 2]] },
    'buttons' => [{ 'id' => 1, 'label' => 'hello' }, { 'id' => 2, 'label' => 'more' }]
  }, { user: user })
  b
end

basic = e2e_user('e2e_basic_1141', 'board_view_style' => 'classic', 'home_board' => nil)
one = e2e_board(basic, 'E2E Home One')
two = e2e_board(basic, 'E2E Home Two')
basic.settings['preferences'].delete('home_board')
basic.save!

modern = e2e_user('e2e_modern_1141', 'board_view_style' => 'modern', 'word_suggestions' => false,
  'ai_features_enabled' => true, 'ai_word_prediction' => true)
home = e2e_board(modern, 'E2E Modern Home')
# Copies an earlier run made: a copy that already exists is reused rather than copied again.
Board.where(user_id: modern.id).where.not(id: home.id).each(&:destroy)
modern.process_home_board({ 'id' => home.global_id, 'key' => home.key }, {})
modern.save!

# A public set for the trial bar to copy: a root that links to two sub-boards, ranked so the
# board picker lists it.
library = e2e_user('e2e_library_1141', 'board_view_style' => 'modern')
def e2e_public_board(user, name, links = [])
  key = "#{user.user_name}/#{name.parameterize}"
  b = Board.find_by(key: key)
  unless b
    buttons = [{ 'id' => 1, 'label' => 'hello' }]
    links.each_with_index do |sub, i|
      buttons << { 'id' => i + 2, 'label' => sub.settings['name'], 'load_board' => { 'id' => sub.global_id, 'key' => sub.key } }
    end
    b = Board.process_new({
      'name' => name, 'key' => name.parameterize, 'public' => true,
      'grid' => { 'rows' => 1, 'columns' => buttons.length, 'order' => [buttons.map { |btn| btn['id'] }] },
      'buttons' => buttons
    }, { user: user })
  end
  b.update_column(:home_popularity, 50) if b.home_popularity.to_i < 50
  BoardLocale.where(board_id: b.id).update_all(home_popularity: 50) if BoardLocale.column_names.include?('home_popularity')
  b
end
food = e2e_public_board(library, 'E2E Starter Food')
play = e2e_public_board(library, 'E2E Starter Play')
starter = e2e_public_board(library, 'E2E Starter', [food, play])
starter2 = e2e_public_board(library, 'E2E Second Starter')

puts({ basic: basic.user_name, basic_boards: [one.key, two.key], modern: modern.user_name, modern_home: home.key, starters: [starter.key, starter2.key] }.to_json)
