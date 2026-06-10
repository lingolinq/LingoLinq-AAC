import { module, test } from 'qunit';
import buttonTracker from 'frontend/utils/raw_events';

module('Unit | Utility | raw-events', function(hooks) {
  hooks.afterEach(function() {
    delete buttonTracker.hit_spots;
    delete buttonTracker.lastReleaseEvent;
    delete buttonTracker.appState;
    var board = document.querySelector('.board[data-test-raw-events-board]');
    if(board && board.parentNode) {
      board.parentNode.removeChild(board);
    }
    var grid = document.querySelector('.md-board-detail-grid[data-test-raw-events-grid]');
    if(grid && grid.parentNode) {
      grid.parentNode.removeChild(grid);
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

  test('board_detail_grid_target detects symbol cards inside the grid', function(assert) {
    var grid = document.createElement('div');
    grid.className = 'md-board-detail-grid';
    grid.setAttribute('data-test-raw-events-grid', 'true');
    var card = document.createElement('div');
    card.className = 'button md-board-detail-symbol-card';
    card.setAttribute('data-id', '42');
    grid.appendChild(card);
    document.body.appendChild(grid);

    assert.ok(buttonTracker.board_detail_grid_target({ dom: card }));
    assert.notOk(buttonTracker.board_detail_grid_target({ dom: document.body }));
  });

  test('defer_board_detail_click_to_ember skips mouse click on board-detail grid in speak mode', function(assert) {
    var grid = document.createElement('div');
    grid.className = 'md-board-detail-grid';
    grid.setAttribute('data-test-raw-events-grid', 'true');
    var card = document.createElement('div');
    card.className = 'button md-board-detail-symbol-card';
    grid.appendChild(card);
    document.body.appendChild(grid);

    buttonTracker.appState = {
      get: function(key) { return key === 'speak_mode'; }
    };
    buttonTracker.lastReleaseEvent = { type: 'mouseup' };

    assert.ok(buttonTracker.defer_board_detail_click_to_ember({ dom: card }, 'click'));
  });

  test('defer_board_detail_click_to_ember keeps touch and alternate input paths', function(assert) {
    var grid = document.createElement('div');
    grid.className = 'md-board-detail-grid';
    grid.setAttribute('data-test-raw-events-grid', 'true');
    var card = document.createElement('div');
    card.className = 'button md-board-detail-symbol-card';
    grid.appendChild(card);
    document.body.appendChild(grid);

    buttonTracker.appState = {
      get: function(key) { return key === 'speak_mode'; }
    };
    buttonTracker.lastReleaseEvent = { type: 'touchend' };

    assert.notOk(buttonTracker.defer_board_detail_click_to_ember({ dom: card }, 'click'),
      'touch release must still use raw_events because Ember click is suppressed');
    assert.notOk(buttonTracker.defer_board_detail_click_to_ember({ dom: card }, 'dwell'),
      'dwell must still route through raw_events');
    assert.notOk(buttonTracker.defer_board_detail_click_to_ember({ dom: card }, 'keyboard'),
      'keyboard must still route through raw_events');
  });
});
