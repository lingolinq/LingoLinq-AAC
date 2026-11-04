# Creates (or resets) the synthetic local users the offline launch spec signs in as
# (e2e/offline-launch.spec.js). LOCAL DEV DATABASE ONLY. Every value here is made up.
#
#   DB_USER=... bin/rails runner app/frontend/e2e/support/offline-launch.rb
#
# One user per board view: Classic opens boards in `user.board-alt`, Modern in `user.board-detail`.
require_relative 'local_e2e'
assert_local_e2e_database!

def offline_e2e_board(user, name)
  key = "#{user.user_name}/#{name.parameterize}"
  b = Board.find_by(key: key)
  return b if b
  Board.process_new({
    'name' => name, 'key' => name.parameterize, 'public' => false,
    'grid' => { 'rows' => 1, 'columns' => 3, 'order' => [[1, 2, 3]] },
    'buttons' => [
      { 'id' => 1, 'label' => 'hello' },
      { 'id' => 2, 'label' => 'more' },
      { 'id' => 3, 'label' => 'all done' }
    ]
  }, { user: user })
end

# Every new user's default sidebar names the system board <system user>/crisis-vocabulary
# (User.merge_missing_default_sidebar_boards), and sync reports an error for a sidebar board it
# cannot fetch. Deployed environments have it; a bare local database does not. Create it the same
# way lib/tasks/system_boards.rake does, from the bundled public/system-boards OBZ. That import uploads
# its pictures (lib/converters/lingo_linq.rb upload_to_remote), so refuse while upload credentials are
# set: a local seed must never write to a real bucket. Run it with AWS_KEY, AWS_SECRET and
# UPLOADS_S3_BUCKET unset.
if SystemBoardSources.owner.nil? || !Board.find_by_path("#{SystemBoardSources::USER_NAME}/crisis-vocabulary")
  %w[AWS_KEY AWS_SECRET UPLOADS_S3_BUCKET].each do |name|
    raise "unset #{name} before running this seed: the system board import uploads its pictures" if ENV[name].present?
  end
end
system_owner = SystemBoardSources.owner || e2e_user(SystemBoardSources::USER_NAME, {})
raise 'could not create the crisis vocabulary system board' unless SystemBoardSources.ensure_crisis_vocabulary!(system_owner)

result = {}
{ 'classic' => 'e2e_offline_classic', 'modern' => 'e2e_offline_modern' }.each do |view, user_name|
  user = e2e_user(user_name, 'board_view_style' => view, 'word_suggestions' => false)
  board = offline_e2e_board(user, "E2E Offline #{view.capitalize} Home")
  user.process_home_board({ 'id' => board.global_id, 'key' => board.key }, {})
  user.save!
  result[view] = { user: user.user_name, board: board.key }
end

puts result.to_json
