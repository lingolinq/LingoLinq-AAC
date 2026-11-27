# Synthetic accounts for measuring the offline sync (phase 0.2 of the sync proposal,
# docs/task-management/2026-11-15_offline-sync-research-proposal.md, section 12). A PRIVATE LOCAL lingolinq-e2e*
# DATABASE ONLY, with the upload settings blank. Every user, label, picture and sound here is made up.
#
#   AWS_KEY= AWS_SECRET= UPLOADS_S3_BUCKET= STATIC_S3_BUCKET= RAILS_ENV=development DB_USER=... \
#     DATABASE_URL=postgres:///lingolinq-e2e-<name> bin/rails runner app/frontend/e2e/support/sync-measure.rb
#
# Shapes (what the measurement run in e2e/sync-measure.spec.js syncs):
# - sync_m_big: dev's shape, the account behind the Android emulator baseline (#1212; first written as synth_big in a
#   scratch script on 2026-11-16). A home board and 56 folders of 40 buttons whose pictures are kept INLINE in the
#   board JSON (generated noise PNGs, no upload settings): a folder's JSON is 1.52 MB as JsonApi::Board serializes
#   it (measured 2026-11-21), like dev's Quick Core 60 folders (about 1.5 MB).
# - sync_m_core: production's shape, like Quick Core 60 (61 boards, about 34 pictures each, every picture its own
#   record and URL on the picture host; nothing inline).
# - sync_m_supervisor with three supervisees (sync_m_child_1..3) on different skin tones; a quarter of each
#   supervisee's pictures are skin-tone library pictures (`.varianted-skin.png`), and sync_m_child_1's buttons carry
#   sounds. A supervisor's sync also syncs every supervisee.
# - sync_m_caseload: a supervisor of twelve small supervisees (sync_m_case_01..12).
#
# Pictures and sounds are on the picture host the specs answer themselves (support/sync.js routePictures): nothing is
# fetched from it. Not modelled: symbol-set alternates (library pictures with alternates need the symbol services).
# Running it again is safe: existing boards and links are kept.
require_relative 'sync-users'

SYNC_M_HOST = SYNC_E2E_PICTURE_HOST

# A board of `count` buttons (4 columns unless `columns`), each picture its own ButtonImage. Every `skinned`-th
# picture is a skin-tone library picture; every `sounds`-th button has a sound. Buttons listed in `links`
# (label => board) open that board. Created once: an existing board with this key is kept.
def sync_m_board(user, slug, count, links = {}, skinned: nil, sounds: nil, columns: 4)
  key = "#{user.user_name}/#{slug}"
  board = Board.find_by(key: key)
  return board if board
  name = slug.split('-').map(&:capitalize).join(' ')
  board = Board.process_new({ 'name' => name, 'key' => slug, 'public' => false }, { user: user })
  raise "#{key} was saved as #{board.key.inspect}" unless board.key == key
  labels = links.keys + (1..[count - links.length, 0].max).map { |n| "#{slug.tr('-', ' ')} word #{n}" }
  buttons = labels.each_with_index.map do |label, idx|
    n = idx + 1
    url = if skinned && (n % skinned).zero?
            "#{SYNC_M_HOST}/libraries/e2e/#{user.user_name}-#{slug}-#{n}.png.varianted-skin.png"
          else
            "#{SYNC_M_HOST}/#{user.user_name}/#{slug}-#{n}.png"
          end
    picture = ButtonImage.create!(user: user, board: board, url: url, public: false,
                                  settings: { 'content_type' => 'image/png', 'width' => 250, 'height' => 250, 'license' => { 'type' => 'private' } })
    button = { 'id' => n, 'label' => label, 'image_id' => picture.global_id }
    if sounds && (n % sounds).zero?
      sound = ButtonSound.create!(user: user, url: "#{SYNC_M_HOST}/sounds/#{user.user_name}-#{slug}-#{n}.mp3", public: false,
                                  settings: { 'content_type' => 'audio/mpeg', 'duration' => 1, 'license' => { 'type' => 'private' } })
      button['sound_id'] = sound.global_id
    end
    target = links[label]
    button['load_board'] = { 'id' => target.global_id, 'key' => target.key } if target
    button
  end
  rows = (buttons.length / columns.to_f).ceil
  order = (0...rows).map { |r| (0...columns).map { |c| (buttons[r * columns + c] || {})['id'] } }
  board.process({ 'grid' => { 'rows' => rows, 'columns' => columns, 'order' => order }, 'buttons' => buttons }, { user: user })
  board
end

# A user whose home board opens `folders` folders of `per_folder` buttons.
def sync_m_user(user_name, folders, per_folder, prefs = {}, **opts)
  user = e2e_user(user_name, { 'board_view_style' => 'modern', 'word_suggestions' => false, 'sidebar_boards' => SYNC_E2E_SIDEBAR }.merge(prefs))
  slug = user_name.tr('_', '-')
  folder_boards = (1..folders).map { |n| sync_m_board(user, "#{slug}-folder-#{n}", per_folder, {}, **opts) }
  links = folder_boards.each_with_index.to_h { |b, idx| ["folder #{idx + 1}", b] }
  home = sync_m_board(user, "#{slug}-home", folders + 4, links, **opts)
  user.process_home_board({ 'id' => home.global_id, 'key' => home.key }, {})
  user.save!
  { user: user.user_name, home: home.key, boards: 1 + folders }
end

def sync_m_supervise(supervisor_name, supervisee_names)
  supervisor = User.find_by!(user_name: supervisor_name)
  supervisee_names.each do |name|
    supervisee = User.find_by!(user_name: name)
    next if supervisee.reload.supervisor_user_ids.include?(supervisor.global_id)
    User.link_supervisor_to_user(supervisor, supervisee, nil, true)
  end
end

# sync_m_big: noise pictures kept inline (ButtonImage keeps a data URI when nothing is uploaded).
def sync_m_big
  user = e2e_user('sync_m_big', { 'sidebar_boards' => SYNC_E2E_SIDEBAR })
  home_key = "#{user.user_name}/sync-m-big-home"
  return { user: user.user_name, home: home_key, boards: 57 } if Board.find_by(key: home_key)
  images = (1..40).map do |n|
    out = `convert -size 48x48 -seed #{n} xc: +noise Random png:- | base64 -w0`
    raise 'ImageMagick convert failed' unless $?.success? && out.length > 1000
    bi = ButtonImage.process_new({ 'url' => "data:image/png;base64,#{out}", 'content_type' => 'image/png', 'width' => 48, 'height' => 48 }, { user: user })
    raise 'picture not saved' unless bi && bi.id
    bi
  end
  folders = (1..56).map do |f|
    slug = "sync-m-big-folder-#{f}"
    board = Board.find_by(key: "#{user.user_name}/#{slug}") || Board.process_new({ 'name' => slug.split('-').map(&:capitalize).join(' '), 'key' => slug, 'public' => false }, { user: user })
    buttons = (1..40).map { |i| { 'id' => i, 'label' => "word #{f}-#{i}", 'image_id' => images[i - 1].global_id } }
    order = (0...5).map { |r| (0...8).map { |c| buttons[r * 8 + c]['id'] } }
    board.process({ 'grid' => { 'rows' => 5, 'columns' => 8, 'order' => order }, 'buttons' => buttons }, { user: user })
    board
  end
  home_buttons = folders.each_with_index.map do |fb, idx|
    { 'id' => idx + 1, 'label' => "folder #{idx + 1}", 'image_id' => images[idx % 40].global_id, 'load_board' => { 'id' => fb.global_id, 'key' => fb.key } }
  end
  home_buttons += %w[I want more please].each_with_index.map { |word, idx| { 'id' => 100 + idx, 'label' => word, 'image_id' => images[idx].global_id } }
  home = Board.process_new({ 'name' => 'Sync M Big Home', 'key' => 'sync-m-big-home', 'public' => false }, { user: user })
  rows = (home_buttons.length / 8.0).ceil
  order = (0...rows).map { |r| (0...8).map { |c| (home_buttons[r * 8 + c] || {})['id'] } }
  home.process({ 'grid' => { 'rows' => rows, 'columns' => 8, 'order' => order }, 'buttons' => home_buttons }, { user: user })
  user.process_home_board({ 'id' => home.global_id, 'key' => home.key }, {})
  user.save!
  { user: user.user_name, home: home.key, boards: 57 }
end

measure = {
  'big' => sync_m_big,
  'core' => sync_m_user('sync_m_core', 60, 34),
  'supervisor' => sync_m_user('sync_m_supervisor', 4, 16),
  'children' => [
    sync_m_user('sync_m_child_1', 8, 24, { 'skin' => 'default' }, skinned: 4, sounds: 4),
    sync_m_user('sync_m_child_2', 8, 24, { 'skin' => 'medium' }, skinned: 4),
    sync_m_user('sync_m_child_3', 8, 24, { 'skin' => 'dark' }, skinned: 4),
  ],
  'caseload' => sync_m_user('sync_m_caseload', 2, 16),
  'cases' => (1..12).map { |n| sync_m_user(format('sync_m_case_%02d', n), 3, 16) },
}
sync_m_supervise('sync_m_supervisor', %w[sync_m_child_1 sync_m_child_2 sync_m_child_3])
sync_m_supervise('sync_m_caseload', (1..12).map { |n| format('sync_m_case_%02d', n) })
puts JSON.pretty_generate(measure)
