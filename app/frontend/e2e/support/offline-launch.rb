# Creates (or resets) the synthetic local users the offline launch spec signs in as
# (e2e/offline-launch.spec.js). A PRIVATE LOCAL lingolinq-e2e* DATABASE ONLY, with the upload settings
# blank (dotenv never overrides a variable that is already set, even to ''). Every value here is made up.
#
#   AWS_KEY= AWS_SECRET= UPLOADS_S3_BUCKET= STATIC_S3_BUCKET= RAILS_ENV=development DB_USER=... \
#     DATABASE_URL=postgres:///lingolinq-e2e-<name> bin/rails runner app/frontend/e2e/support/offline-launch.rb
#
# One user per board view: Classic opens boards in `user.board-alt`, Modern in `user.board-detail`.
require_relative 'local_e2e'
assert_local_e2e_database!

# A board whose buttons have labels and no pictures. Created empty, then given its buttons in a
# second save: on the save that creates a board, buttons without pictures get default symbols
# (Board#process_suggested_symbols asks OpenSymbols, and the pictures then load from its CDN), and
# a public board's picture use is reported back to OpenSymbols (ButtonImage#track_image_use). These
# boards stay on this machine.
def offline_e2e_text_board(user, slug, name, is_public, labels)
  key = "#{user.user_name}/#{slug}"
  b = Board.find_by(key: key)
  return b if b
  b = Board.process_new({ 'name' => name, 'key' => slug, 'public' => is_public }, { user: user })
  b.process({
    'grid' => { 'rows' => 1, 'columns' => labels.length, 'order' => [(1..labels.length).to_a] },
    'buttons' => labels.each_with_index.map { |label, idx| { 'id' => idx + 1, 'label' => label } }
  }, { user: user })
  raise "#{key} was saved as #{b.key.inspect}" unless b.key == key
  b
end

def without_pictures!(board)
  # Pictures are referenced from the buttons (an imported board has no board_button_images rows).
  return board unless (board.buttons || []).any? { |button| button['image_id'] || button['sound_id'] }
  raise "#{board.key} here has pictures (an imported copy, or seeded by an older version of this script); seed a new private lingolinq-e2e* database instead"
end

# Every new user's default sidebar names the system board <system user>/crisis-vocabulary
# (User.merge_missing_default_sidebar_boards), and sync reports an error for a sidebar board it
# cannot fetch. Deployed environments import it from the bundled OBZ (lib/tasks/system_boards.rake),
# pictures included. Here it is a text-only stand-in under the same key: sync finds the board and
# fetches nothing from outside this machine (with the imported pictures, sync fetched each one from
# the uploads bucket, and one slow DNS lookup failed the run). Only in a private lingolinq-e2e*
# database, never the shared development one, and only while upload credentials are unset: creating
# boards and syncing them writes button-set caches to the uploads bucket when it is configured
# (BoardDownstreamButtonSet -> Uploader.remote_upload).
db_name = ActiveRecord::Base.connection.raw_connection.db.to_s
raise "refusing: the system board stand-in is for a private lingolinq-e2e* database, not #{db_name.inspect}" unless db_name =~ /\Alingolinq-e2e[\w-]*\z/
%w[AWS_KEY AWS_SECRET UPLOADS_S3_BUCKET STATIC_S3_BUCKET].each do |name|
  raise "unset #{name} (or set it empty) before running this seed: board writes upload to the bucket it names" if ENV[name].present?
end

system_owner = SystemBoardSources.owner || e2e_user(SystemBoardSources::USER_NAME, {})
crisis_key = SystemBoardSources.board_key(SystemBoardSources::CRISIS_VOCABULARY_SLUG)
crisis = Board.find_by_path(crisis_key) ||
  offline_e2e_text_board(system_owner, SystemBoardSources::CRISIS_VOCABULARY_SLUG, 'Crisis Vocabulary', true, %w[help stop break])
without_pictures!(crisis)
raise "the stand-in was saved as #{crisis.key.inspect}, not #{crisis_key}" unless crisis.key == crisis_key
# The same finishing step deployed environments get for an existing board (public, listed, stats).
raise 'could not finish the crisis vocabulary system board' unless SystemBoardSources.ensure_crisis_vocabulary!(system_owner)

# The default sidebar (User.default_sidebar_boards) shows icons from opensymbols.s3.amazonaws.com and
# flaticon.com. A stored sidebar that already names the crisis board is kept as it is
# (User.merge_missing_default_sidebar_boards), so these users get that one entry with an icon Rails
# serves from public/.
e2e_sidebar = [{ 'name' => 'Crisis Vocabulary', 'key' => crisis_key, 'image' => '/images/square.svg', 'home_lock' => false }]

result = {}
{ 'classic' => 'e2e_offline_classic', 'modern' => 'e2e_offline_modern' }.each do |view, user_name|
  user = e2e_user(user_name, 'board_view_style' => view, 'word_suggestions' => false, 'sidebar_boards' => e2e_sidebar)
  name = "E2E Offline #{view.capitalize} Home"
  board = without_pictures!(offline_e2e_text_board(user, name.parameterize, name, false, ['hello', 'more', 'all done']))
  # A folder on the home board: the board-page checks need a board that is not the home board, which
  # is protected (utils/board_revocation.js is_protected_board).
  folder = without_pictures!(offline_e2e_text_board(user, "e2e-offline-#{view}-folder", "E2E Offline #{view.capitalize} Folder", false, %w[cookie milk]))
  buttons = board.buttons.map { |button| button['label'] == 'more' ? button.merge('load_board' => { 'id' => folder.global_id, 'key' => folder.key }) : button }
  board.process({ 'buttons' => buttons }, { user: user })
  user.process_home_board({ 'id' => board.global_id, 'key' => board.key }, {})
  user.save!
  result[view] = { user: user.user_name, board: board.key, folder: folder.key }
end

puts result.to_json
