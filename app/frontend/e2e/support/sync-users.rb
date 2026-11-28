# Creates the synthetic local users the sync specs sign in as (e2e/sync-*.spec.js). A PRIVATE LOCAL
# lingolinq-e2e* DATABASE ONLY, with the upload settings blank. Every value here is made up.
#
#   AWS_KEY= AWS_SECRET= UPLOADS_S3_BUCKET= STATIC_S3_BUCKET= RAILS_ENV=development DB_USER=... \
#     DATABASE_URL=postgres:///lingolinq-e2e-<name> bin/rails runner app/frontend/e2e/support/sync-users.rb
#
# It runs offline-launch.rb first: that seed sets up the system Crisis Vocabulary board every user's sidebar
# names (sync reports an error for a sidebar board it cannot fetch). Running it again is safe.
#
# Each user's home board has folders; each folder has picture buttons; the first folder has a folder of its
# own (a second level). Pictures are ButtonImage rows on the symbol CDN host the app fetches directly
# (utils/direct_fetch.js); nothing is fetched from it: the specs answer that address themselves
# (support/sync.js routePictures). Every picture URL is distinct, as in production, where each button
# picture has its own record and URL.
require_relative 'offline-launch'
assert_local_e2e_database!

SYNC_E2E_PICTURE_HOST = 'https://d18vdu4p71yql0.cloudfront.net/e2e-sync'.freeze
SYNC_E2E_SIDEBAR = [{ 'name' => 'Crisis Vocabulary', 'key' => SystemBoardSources.board_key(SystemBoardSources::CRISIS_VOCABULARY_SLUG),
                      'image' => '/images/square.svg', 'home_lock' => false }].freeze

# A board of `count` picture buttons (a 4-column grid), each picture its own ButtonImage. Buttons listed in
# `links` (label => board) open that board. Created once: an existing board with this key is kept.
def sync_e2e_board(user, slug, count, links = {})
  key = "#{user.user_name}/#{slug}"
  board = Board.find_by(key: key)
  return board if board
  # The key is made from the name (as in offline-launch.rb), so the name is the slug in words.
  name = slug.split('-').map(&:capitalize).join(' ')
  board = Board.process_new({ 'name' => name, 'key' => slug, 'public' => false }, { user: user })
  raise "#{key} was saved as #{board.key.inspect}" unless board.key == key
  labels = links.keys + (1..[count - links.length, 0].max).map { |n| "#{slug.tr('-', ' ')} word #{n}" }
  buttons = labels.each_with_index.map do |label, idx|
    picture = ButtonImage.create!(user: user, board: board, url: "#{SYNC_E2E_PICTURE_HOST}/#{user.user_name}/#{slug}-#{idx + 1}.png",
                                  public: false, settings: { 'content_type' => 'image/png', 'width' => 250, 'height' => 250, 'license' => { 'type' => 'private' } })
    button = { 'id' => idx + 1, 'label' => label, 'image_id' => picture.global_id }
    target = links[label]
    button['load_board'] = { 'id' => target.global_id, 'key' => target.key } if target
    button
  end
  columns = 4
  rows = (buttons.length / columns.to_f).ceil
  order = (0...rows).map { |r| (0...columns).map { |c| (buttons[r * columns + c] || {})['id'] } }
  board.process({ 'grid' => { 'rows' => rows, 'columns' => columns, 'order' => order }, 'buttons' => buttons }, { user: user })
  board
end

# A user with a home board of `folders` folders, each of `per_folder` picture buttons, and one second-level folder.
def sync_e2e_user(user_name, view, folders, per_folder)
  user = e2e_user(user_name, 'board_view_style' => view, 'word_suggestions' => false, 'sidebar_boards' => SYNC_E2E_SIDEBAR)
  deep = sync_e2e_board(user, "#{user_name.tr('_', '-')}-deep", per_folder)
  folder_boards = (1..folders).map do |n|
    links = n == 1 ? { 'deeper' => deep } : {}
    sync_e2e_board(user, "#{user_name.tr('_', '-')}-folder-#{n}", per_folder, links)
  end
  links = folder_boards.each_with_index.to_h { |b, idx| ["folder #{idx + 1}", b] }
  home = sync_e2e_board(user, "#{user_name.tr('_', '-')}-home", folders + 4, links)
  user.process_home_board({ 'id' => home.global_id, 'key' => home.key }, {})
  user.save!
  { user: user.user_name, home: home.key, boards: [home.key] + folder_boards.map(&:key) + [deep.key] }
end

sync_result = {
  'modern' => sync_e2e_user('sync_e2e_modern', 'modern', 12, 24),
  'basic' => sync_e2e_user('sync_e2e_basic', 'classic', 6, 16),
  'other' => sync_e2e_user('sync_e2e_other', 'modern', 2, 8),
}
puts JSON.pretty_generate(sync_result)
