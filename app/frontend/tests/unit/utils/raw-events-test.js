import { module, test } from 'qunit';
import buttonTracker from 'frontend/utils/raw_events';

module('Unit | Utility | raw-events', function(hooks) {
  hooks.afterEach(function() {
    delete buttonTracker.hit_spots;
    var board = document.querySelector('.board[data-test-raw-events-board]');
    if(board && board.parentNode) {
      board.parentNode.removeChild(board);
    }
  });

  test('locate_button_on_board handles activations without prior hit history', function(assert) {
    var board = document.createElement('div');
    board.className = 'board';
    board.setAttribute('data-test-raw-events-board', 'true');
    board.style.width = '200px';
    board.style.height = '100px';
    document.body.appendChild(board);

    delete buttonTracker.hit_spots;

    var location = buttonTracker.locate_button_on_board('button-1', {
      clientX: 50,
      clientY: 50
    });

    assert.equal(location.percent_x, 0.25);
    assert.equal(location.percent_y, 0.5);
    assert.equal(location.prior_percent_x, undefined);
    assert.equal(location.prior_percent_y, undefined);
    assert.ok(location.percent_travel >= 0, 'falls back to edge-distance travel');
  });
});
