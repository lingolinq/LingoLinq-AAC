import { module, test } from 'qunit';
import buttonTracker from 'frontend/utils/raw_events';
import editManager from 'frontend/utils/edit_manager';

module('Unit | Utility | raw-events', function(hooks) {
  hooks.beforeEach(function() {
    Array.prototype.forEach.call(document.querySelectorAll('.board'), function(node) {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    });
    var container = document.getElementById('ember-testing-container');
    if (container) {
      Array.prototype.forEach.call(container.querySelectorAll('.board'), function(node) {
        node.parentNode.removeChild(node);
      });
    }
    this._hiddenSidebar = document.getElementById('sidebar');
    if (this._hiddenSidebar) {
      this._sidebarDisplay = this._hiddenSidebar.style.display;
      this._hiddenSidebar.style.display = 'none';
    }
  });

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
    var chromeView = document.querySelector('.board-detail-view[data-test-raw-events-chrome]');
    if(chromeView && chromeView.parentNode) {
      chromeView.parentNode.removeChild(chromeView);
    }
    if(this._hiddenSidebar) {
      this._hiddenSidebar.style.display = this._sidebarDisplay || '';
      this._hiddenSidebar = null;
      this._sidebarDisplay = null;
    }
  });

  test('locate_button_on_board handles activations without prior hit history', function(assert) {
    var board = document.createElement('div');
    board.className = 'board';
    board.setAttribute('data-test-raw-events-board', 'true');
    board.style.width = '200px';
    board.style.height = '100px';
    board.style.display = 'block';
    board.style.position = 'absolute';
    board.style.left = '0';
    board.style.top = '0';
    document.body.appendChild(board);
    board.offsetHeight;

    delete buttonTracker.hit_spots;

    var event = {
      clientX: 50,
      clientY: 50
    };
    var location = buttonTracker.locate_button_on_board('button-1', event);

    var $board = window.$('.board');
    assert.equal($board.length, 1, 'uses the test board as the only .board match');
    var left = $board.offset().left;
    var top = $board.offset().top;
    var sidebar_width = 0;
    var width = $board.width() + left + sidebar_width;
    var height = $board.height() + top;
    var expected_x = Math.round((event.clientX - left) / width * 1000) / 1000;
    var expected_y = Math.round((event.clientY - top) / height * 1000) / 1000;

    assert.equal(location.percent_x, expected_x);
    assert.equal(location.percent_y, expected_y);
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

  test('button_select defers speak-mode mouse clicks on board-detail grid to Ember', function(assert) {
    var grid = document.createElement('div');
    grid.className = 'md-board-detail-grid';
    grid.setAttribute('data-test-raw-events-grid', 'true');
    var card = document.createElement('div');
    card.className = 'button md-board-detail-symbol-card';
    card.setAttribute('data-id', '99');
    grid.appendChild(card);
    document.body.appendChild(grid);

    var sent = [];
    editManager.controller = {
      send: function(action, id) {
        sent.push([action, id]);
      }
    };
    buttonTracker.appState = {
      get: function(key) {
        if(key === 'speak_mode') { return true; }
        if(key === 'edit_mode') { return false; }
        return null;
      }
    };
    buttonTracker.lastReleaseEvent = { type: 'mouseup' };

    var wrap = buttonTracker.element_wrap(card);
    buttonTracker.button_select(wrap, null, 'click');

    assert.deepEqual(sent, [], 'mouse click defers to Ember {{on}}, not buttonSelect');

    buttonTracker.lastReleaseEvent = { type: 'touchend' };
    buttonTracker.button_select(wrap, null, 'click');
    assert.deepEqual(sent, [['buttonSelect', '99']], 'touch still routes through buttonSelect');

    delete editManager.controller;
    delete buttonTracker.appState;
    delete buttonTracker.lastReleaseEvent;
  });

  test('defer_board_detail_chrome_click_to_ember skips mouse click on options toggle in speak mode', function(assert) {
    var view = document.createElement('div');
    view.className = 'board-detail-view';
    view.setAttribute('data-test-raw-events-chrome', 'true');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'md-board-detail-actions-toggle';
    btn.setAttribute('data-bd-action', 'toggle_options_menu');
    view.appendChild(btn);
    document.body.appendChild(view);

    buttonTracker.appState = {
      get: function(key) { return key === 'speak_mode'; }
    };
    buttonTracker.lastReleaseEvent = { type: 'mouseup' };

    assert.ok(buttonTracker.defer_board_detail_chrome_click_to_ember({ dom: btn }, 'click'));

    buttonTracker.lastReleaseEvent = { type: 'touchend' };
    assert.notOk(buttonTracker.defer_board_detail_chrome_click_to_ember({ dom: btn }, 'click'),
      'touch release must still use boardDetailChromeRelease');

    delete buttonTracker.appState;
    delete buttonTracker.lastReleaseEvent;
  });

  test('defer_board_detail_chrome_click_to_ember does not defer My Board Collection to Ember', function(assert) {
    var view = document.createElement('div');
    view.className = 'board-detail-view';
    var collection = document.createElement('div');
    collection.className = 'md-board-collection';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'md-board-collection__back';
    collection.appendChild(btn);
    view.appendChild(collection);
    document.body.appendChild(view);

    buttonTracker.appState = {
      get: function(key) { return key === 'speak_mode'; }
    };
    buttonTracker.lastReleaseEvent = { type: 'mouseup' };

    assert.notOk(buttonTracker.defer_board_detail_chrome_click_to_ember({ dom: btn }, 'click'),
      'collection must route through boardDetailChromeRelease, not defer');

    if(view.parentNode) { view.parentNode.removeChild(view); }
    delete buttonTracker.appState;
    delete buttonTracker.lastReleaseEvent;
  });

  test('resolve_board_detail_chrome_action maps My Board Collection back and row', function(assert) {
    var back = document.createElement('button');
    back.className = 'md-board-collection__back';
    document.body.appendChild(back);

    var resolvedBack = buttonTracker.resolve_board_detail_chrome_action(back);
    assert.ok(resolvedBack);
    assert.equal(resolvedBack.action, 'close_board_collection');
    assert.deepEqual(resolvedBack.args, []);

    var item = document.createElement('button');
    item.className = 'md-board-collection__item';
    item.setAttribute('data-bd-arg', 'example/quick-core-60');
    document.body.appendChild(item);

    var resolvedItem = buttonTracker.resolve_board_detail_chrome_action(item);
    assert.ok(resolvedItem);
    assert.equal(resolvedItem.action, 'select_board_from_collection');
    assert.deepEqual(resolvedItem.args, ['example/quick-core-60']);

    if(back.parentNode) { back.parentNode.removeChild(back); }
    if(item.parentNode) { item.parentNode.removeChild(item); }
  });

  test('resolve_board_detail_chrome_action maps edit panel Done Editing', function(assert) {
    var btn = document.createElement('button');
    btn.className = 'md-board-edit-session__btn md-board-edit-session__btn--save';
    btn.setAttribute('data-bd-action', 'back_to_boards');
    document.body.appendChild(btn);

    var resolved = buttonTracker.resolve_board_detail_chrome_action(btn);
    assert.ok(resolved);
    assert.equal(resolved.action, 'back_to_boards');
    assert.deepEqual(resolved.args, []);
    assert.equal(resolved.controller, 'board');

    if(btn.parentNode) { btn.parentNode.removeChild(btn); }
  });

  test('resolve_board_detail_chrome_action maps category filter option args', function(assert) {
    var li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.setAttribute('data-bd-action', 'set_panel_category');
    li.setAttribute('data-bd-arg', 'noun');
    document.body.appendChild(li);

    var resolved = buttonTracker.resolve_board_detail_chrome_action(li);
    assert.ok(resolved);
    assert.equal(resolved.action, 'set_panel_category');
    assert.deepEqual(resolved.args, ['noun']);

    if(li.parentNode) { li.parentNode.removeChild(li); }
  });

  test('boardDetailChromeTargetFromEvent ignores modal close buttons', function(assert) {
    var wrap = document.createElement('div');
    wrap.className = 'board-detail-view';
    var modal = document.createElement('div');
    modal.className = 'modal-content';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'la-modal-close';
    modal.appendChild(btn);
    wrap.appendChild(modal);
    document.body.appendChild(wrap);

    var event = { target: btn, closest: function(sel) { return btn.closest(sel); } };
    assert.notOk(buttonTracker.board_detail_chrome_target_from_event(event));

    if(wrap.parentNode) { wrap.parentNode.removeChild(wrap); }
  });

  test('resolve_board_detail_chrome_action maps edit right panel section toggles', function(assert) {
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'md-board-edit-right-panel__section-toggle';
    var icon = document.createElement('span');
    icon.className = 'md-board-edit-right-panel__section-icon';
    icon.setAttribute('data-section', 'paint-tool');
    toggle.appendChild(icon);
    document.body.appendChild(toggle);

    var resolved = buttonTracker.resolve_board_detail_chrome_action(icon);
    assert.ok(resolved);
    assert.equal(resolved.action, 'toggle_right_panel_section');
    assert.deepEqual(resolved.args, ['paint-tool']);
    assert.equal(resolved.controller, 'board');

    if(toggle.parentNode) { toggle.parentNode.removeChild(toggle); }
  });

  test('defer_board_detail_chrome_click_to_ember defers edit-mode panel mouse clicks', function(assert) {
    var view = document.createElement('div');
    view.className = 'board-detail-view';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'md-board-edit-right-panel__collapse-btn';
    btn.setAttribute('data-bd-action', 'toggle_right_panel');
    view.appendChild(btn);
    document.body.appendChild(view);

    buttonTracker.appState = {
      get: function(key) { return key === 'edit_mode'; }
    };
    buttonTracker.lastReleaseEvent = { type: 'mouseup' };

    assert.ok(buttonTracker.defer_board_detail_chrome_click_to_ember({ dom: btn }, 'click'));

    buttonTracker.lastReleaseEvent = { type: 'touchend' };
    assert.notOk(buttonTracker.defer_board_detail_chrome_click_to_ember({ dom: btn }, 'click'),
      'touch release must still use boardDetailChromeRelease');

    if(view.parentNode) { view.parentNode.removeChild(view); }
    delete buttonTracker.appState;
    delete buttonTracker.lastReleaseEvent;
  });

  test('resolve_board_detail_grid_edit_action maps inline edit toolbar clicks', function(assert) {
    var grid = document.createElement('div');
    grid.className = 'md-board-detail-grid';
    var card = document.createElement('div');
    card.className = 'button md-board-detail-symbol-card';
    card.setAttribute('data-id', '7');
    var editBtn = document.createElement('button');
    editBtn.className = 'md-board-detail-symbol-card__edit-btn';
    editBtn.setAttribute('data-bd-edit-action', 'edit_button_settings');
    card.appendChild(editBtn);
    grid.appendChild(card);
    document.body.appendChild(grid);

    editManager.find_button = function(id) {
      return id === '7' ? { id: '7', label: 'No' } : null;
    };
    editManager.controller = {
      send: function() {}
    };
    buttonTracker.appState = {
      get: function(key) { return key === 'edit_mode'; }
    };

    var resolved = buttonTracker.resolve_board_detail_grid_edit_action(editBtn);
    assert.ok(resolved);
    assert.equal(resolved.action, 'edit_button_settings');
    assert.equal(resolved.args[0].label, 'No');

    if(grid.parentNode) { grid.parentNode.removeChild(grid); }
    delete editManager.controller;
    delete editManager.find_button;
    delete buttonTracker.appState;
  });
});
