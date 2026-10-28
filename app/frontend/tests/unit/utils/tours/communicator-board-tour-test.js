import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import { buildCommunicatorBoardSteps } from 'frontend/utils/tours/communicator-board';
import { buildBoardDetailSpeakSteps } from 'frontend/utils/tours/board-detail-speak';
import { tourBuilderFor, tourKeyFor } from 'frontend/utils/tours/registry';

/* THE COMMUNICATOR'S BOARD TOUR (tour redesign, 2026-10-12): "4 or 5 steps per role. Communicators: review
   your board, switching boards, messages and help, the grown-ups area." Five steps on the board in Speak
   Mode, in Modern (board-detail) and Basic (board-alt). */
module('Unit | Utility | tours | communicator board tour', function(hooks) {
  setupTest(hooks);
  var added = [];
  function put(html) {
    var d = document.createElement('div'); d.innerHTML = html; var el = d.firstElementChild;
    el.style.height = '20px'; document.body.appendChild(el); added.push(el);
  }
  hooks.afterEach(function() { added.forEach(function(e) { e.remove(); }); added = []; });
  var IDS = ['comm_board_tour_welcome', 'comm_board_tour_board', 'comm_board_tour_switch', 'comm_board_tour_message', 'comm_board_tour_grownups'];
  var FORBIDDEN = /upgrade|customi[sz]e|\blogs?\b|reports?\b|subscription/i;

  test('Modern: five steps on the board page, none naming the supporter toolbox', function(assert) {
    ['<div class="md-board-detail-grid-fade">g</div>', '<button class="md-board-detail-home-btn">h</button>',
      '<div class="md-board-detail-sentence-row">m</div>', '<button class="md-board-detail-actions-toggle">o</button>'].forEach(put);
    var steps = buildCommunicatorBoardSteps('modern');
    assert.deepEqual(steps.map(function(s) { return s.id; }), IDS);
    assert.notOk(FORBIDDEN.test(steps.map(function(s) { return s.title + ' ' + s.text; }).join(' ')), 'no toolbox words');
    assert.strictEqual(steps[4].buttons[1].text, 'Got it', 'the last spotlight finishes the tour');
  });

  test('Basic: the same five steps on the Basic board page, in Basic\'s skin', function(assert) {
    ['<div class="board">g</div>', '<button id="home_button">h</button>', '<div id="speak">m</div>', '<a id="identity_button">o</a>'].forEach(put);
    var steps = buildCommunicatorBoardSteps('basic');
    assert.deepEqual(steps.map(function(s) { return s.id; }), IDS);
    assert.true(steps.every(function(s) { return s.classes.indexOf('ch-tour__step') === 0; }), 'Basic skin');
  });

  test('the Modern board tour hands a communicator this tour; a supporter keeps the 4-step one', function(assert) {
    ['<div class="md-board-detail-grid-fade">g</div>', '<div class="md-board-detail-sentence-row">m</div>'].forEach(put);
    assert.strictEqual(buildBoardDetailSpeakSteps('gentle', { supporter: false })[0].id, 'comm_board_tour_welcome', 'communicator');
    assert.strictEqual(buildBoardDetailSpeakSteps('gentle', { supporter: true })[0].id, 'board_detail_speak_tour_welcome', 'supporter');
    assert.strictEqual(buildBoardDetailSpeakSteps('gentle')[0].id, 'board_detail_speak_tour_welcome', 'a caller that does not say');
  });

  test('Basic\'s board page has this tour, with its own completion key; Modern users never reach board-alt', function(assert) {
    assert.strictEqual(typeof tourBuilderFor('user.board-alt.index', 'gentle', false, true), 'function', 'Basic, Speak Mode');
    assert.strictEqual(tourKeyFor('user.board-alt.index', 'gentle', false, true), 'board_alt_speak');
    assert.strictEqual(tourBuilderFor('user.board-alt.index', 'gentle', true, true), null, 'not in edit mode');
    assert.strictEqual(tourBuilderFor('user.board-alt.index', 'gentle', false, false), null, 'not for a Modern user');
  });
});
