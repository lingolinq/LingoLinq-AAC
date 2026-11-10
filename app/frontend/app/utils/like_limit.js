import i18n from './i18n';

// What a person is told after liking a board (Traci, 2026-11-10). Liked boards are kept on the device for
// offline use, but only the first LIKED_BOARD_REFS_LIMIT of them (app/models/user.rb): the like answer says
// whether this board is kept (`kept_offline`), with the count (`liked_boards`) and the limit (`liked_limit`),
// computed in app/controllers/api/boards_controller.rb#liked_boards_summary. An answer without them (an older
// server) gets the plain message. Returns {kind: 'success'|'warning', text}.
export function like_message(data) {
  var limit = data && data.liked_limit;
  if(data && data.kept_offline === false && limit) {
    return { kind: 'warning', text: i18n.t('liked_past_limit', "Liked, but not kept on this device: you have reached the limit of %{limit} liked boards kept for offline use. Unlike a board to make room for this one.", { limit: limit }) };
  }
  if(data && limit && data.liked_boards >= limit) {
    return { kind: 'success', text: i18n.t('liked_at_limit', "Liked. This board will be kept on this device for offline use after the next sync. You have reached the limit of %{limit} liked boards kept on this device.", { limit: limit }) };
  }
  return { kind: 'success', text: i18n.t('liked_kept_offline', "Liked. This board will be kept on this device for offline use after the next sync.") };
}
