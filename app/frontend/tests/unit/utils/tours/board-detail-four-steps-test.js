import { module, test } from 'qunit';
import { buildBoardDetailSteps } from 'frontend/utils/tours/board-detail';
import { buildBoardDetailSpeakSteps } from 'frontend/utils/tours/board-detail-speak';

/* THE BOARD PAGE TOURS ARE 4 STEPS EACH (requested 2026-10-12: "the board page speak tour should be only
   4 steps total, the board page edit tour should be only 4 steps total"), as the home and board-picker
   tours were cut: welcome, two spotlights, finish. Every element either tour ever spotlighted is put on
   the page, so the count is the tour's own, not a missing target's. */
module('Unit | Utility | tours | board page tours are 4 steps', function(hooks) {
  var added = [];
  function put(html) {
    var div = document.createElement('div');
    div.innerHTML = html;
    var el = div.firstElementChild;
    el.style.height = '20px';
    document.body.appendChild(el);
    added.push(el);
  }
  hooks.beforeEach(function() {
    [
      '<div class="md-board-detail-grid md-board-detail-grid-fade"><div class="md-board-detail-symbol-card">x</div></div>',
      '<div id="speak-test-row" class="md-board-detail-sentence-row"><span class="md-board-detail-sentence-bar__text">t</span><button class="md-board-detail-sentence-bar__btn--speak">s</button><span class="md-board-detail-sentence-bar__tools">t</span><button class="md-board-detail-home-btn">h</button><button class="md-board-detail-actions-toggle">m</button></div>',
      '<div class="md-board-edit-session"><button class="md-board-edit-session__btn--save">s</button><button class="md-board-edit-session__btn--discard">d</button></div>',
      '<button data-bd-action="board_details">d</button>',
      '<div class="md-board-edit-panel">p</div>',
      '<div class="md-board-edit-right-panel">p</div>'
    ].forEach(put);
  });
  hooks.afterEach(function() { added.forEach(function(e) { e.remove(); }); added = []; });

  test('speak mode: welcome, the board, the message row, finish', function(assert) {
    var ids = buildBoardDetailSpeakSteps('gentle').map(function(s) { return s.id; });
    assert.deepEqual(ids, ['board_detail_speak_tour_welcome', 'board_detail_speak_tour_grid', 'board_detail_speak_tour_bar', 'board_detail_speak_tour_done']);
  });

  test('edit mode: welcome, the buttons, the editing bar, finish', function(assert) {
    var ids = buildBoardDetailSteps('gentle').map(function(s) { return s.id; });
    assert.deepEqual(ids, ['board_detail_tour_welcome', 'board_detail_tour_grid', 'board_detail_tour_session', 'board_detail_tour_done']);
  });
});
