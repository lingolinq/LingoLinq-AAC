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

// Point board-preview-overlay#pick_for_home at a specific communicator, for as
// long as the preview is open.
//
// That overlay resolves its target as `app_state.setup_user || app_state.currentUser`,
// and it reads it at PICK time — seconds after the preview opens. So the override
// has to outlive whatever opened the preview. It previously belonged to the
// calling component, restored in willDestroyElement, which is wrong: the eval
// report's page-set card unmounts when the SLP switches the report to School mode,
// and doing that with the preview still open reset setup_user to null. The next
// pick would then land the communicator's board on the signed-in SLP's own
// account — the exact outcome the card exists to prevent.
//
// Tying it to the preview's own lifetime is what makes it correct: set before
// opening, restore once the preview is gone, however it went away.
function claim_setup_user(for_user) {
  if (!for_user || !for_user.get) { return; }
  var prior = app_state.get('setup_user') || null;
  app_state.set('setup_user', for_user);
  var release = function() {
    // Only give it back if it is still ours — a later flow may have legitimately
    // claimed it in the meantime, and clobbering that would just move the bug.
    if (app_state.get('setup_user') === for_user) {
      app_state.set('setup_user', prior);
    }
  };
  // No close callback exists on the board preview (services/modal#_openBoardPreview
  // resolves immediately), so watch for it to disappear. Bounded so a preview that
  // never opens can't leave a timer running forever.
  var waited = 0;
  var opened = false;
  var tick = function() {
    if (modal.board_preview_open()) { opened = true; }
    else if (opened) { return release(); }
    waited = waited + 400;
    if (waited > (10 * 60 * 1000)) { return release(); }
    setTimeout(tick, 400);
  };
  setTimeout(tick, 400);
}

export default function openRecommendedHomeBoard(buttons, for_user) {
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
    // Claimed only once we know a preview is actually going to open — an early
    // return above (no board found) must not leave setup_user pointing anywhere.
    claim_setup_user(for_user);
    // recommend:true swaps the preview header to the "We recommend this board" copy.
    modal.board_preview(board, board.preview_locale, false, null, { recommend: true });
  }, function() {
    modal.error(i18n.t('home_board_assign_not_found', "We couldn't find the recommended home board. Please pick one below."));
  });
}
