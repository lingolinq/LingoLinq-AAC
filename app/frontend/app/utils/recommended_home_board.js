import LingoLinq from '../app';
import modal from './modal';
import i18n from './i18n';
import app_state from './app_state';

// Open the RECOMMENDED starter home board ("Vocal Flair 84") in its board-preview
// modal (recommend:true) — the "pick a board (page-set) for me" flow. Confirming
// with "Pick this Board" copies it home and hands the user into board-detail SPEAK
// mode, where the speak guided-tour auto-starts (board-preview-overlay
// _finishPickForHome sets app_state.board_detail_tour_pending_speak, scoped to the
// board key). Shared by the standalone board picker, the home-tour welcome
// "start speaking" button, AND the Quick Eval report, so the recommendation logic
// lives in ONE place. Returns the store-query promise so callers can toggle a
// loading flag around it.
//
// `buttons` selects which Vocal Flair set to open. The five published sets line up
// 1:1 with GRID_BANDS in eval_recommend, so the eval report can hand its
// recommended grid straight through. Defaults to 84 — what every caller relied on
// before this took an argument.
export const VOCAL_FLAIR_BUTTON_COUNTS = [24, 40, 60, 84, 112];

// Map a recommendation grid ({rows, cols}) to a published Vocal Flair set.
// Off-catalogue sizes fall back to the largest set that does not exceed them.
export function vocalFlairButtonsForGrid(grid) {
  var total = grid ? (parseInt(grid.rows, 10) || 0) * (parseInt(grid.cols, 10) || 0) : 0;
  if (VOCAL_FLAIR_BUTTON_COUNTS.indexOf(total) >= 0) { return total; }
  var best = VOCAL_FLAIR_BUTTON_COUNTS[0];
  VOCAL_FLAIR_BUTTON_COUNTS.forEach(function(n) { if (total >= n) { best = n; } });
  return best;
}

export default function openRecommendedHomeBoard(buttons) {
  var n = VOCAL_FLAIR_BUTTON_COUNTS.indexOf(buttons) >= 0 ? buttons : 84;
  var exact = new RegExp('(^|/)vocal-flair-' + n + '$');
  var loose = new RegExp('vocal-flair-' + n);
  return LingoLinq.store.query('board', { q: 'Vocal Flair ' + n, public: true, per_page: 10 }).then(function(results) {
    var list = (results && results.slice) ? results.slice() : (results || []);
    var pick = function(re) {
      for (var i = 0; i < list.length; i++) {
        if (re.test((list[i].get('key') || ''))) { return list[i]; }
      }
      return null;
    };
    var board = pick(exact) || pick(loose) || list[0];
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
