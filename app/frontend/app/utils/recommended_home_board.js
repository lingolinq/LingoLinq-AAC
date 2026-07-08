import LingoLinq from '../app';
import modal from './modal';
import i18n from './i18n';
import app_state from './app_state';

// Open the RECOMMENDED starter home board ("Vocal Flair 84") in its board-preview
// modal (recommend:true) — the "pick a board (page-set) for me" flow. Confirming
// with "Pick this Board" copies it home and hands the user into board-detail SPEAK
// mode, where the speak guided-tour auto-starts (board-preview-overlay
// _finishPickForHome sets app_state.board_detail_tour_pending_speak, scoped to the
// board key). Shared by the standalone board picker AND the home-tour welcome
// "start speaking" button so the recommendation logic lives in ONE place. Returns
// the store-query promise so callers can toggle a loading flag around it.
export default function openRecommendedHomeBoard() {
  return LingoLinq.store.query('board', { q: 'Vocal Flair 84', public: true, per_page: 10 }).then(function(results) {
    var list = (results && results.slice) ? results.slice() : (results || []);
    var pick = function(re) {
      for (var i = 0; i < list.length; i++) {
        if (re.test((list[i].get('key') || ''))) { return list[i]; }
      }
      return null;
    };
    var board = pick(/(^|\/)vocal-flair-84$/) || pick(/vocal-flair-84/) || list[0];
    if (!board) {
      modal.error(i18n.t('home_board_assign_not_found', "We couldn't find the recommended home board. Please pick one below."));
      return;
    }
    board.preview_locale = board.get('localized_locale') || app_state.get('label_locale');
    // recommend:true swaps the preview header to the "We recommend this board" copy.
    modal.board_preview(board, board.preview_locale, false, null, { recommend: true });
  }, function() {
    modal.error(i18n.t('home_board_assign_not_found', "We couldn't find the recommended home board. Please pick one below."));
  });
}
