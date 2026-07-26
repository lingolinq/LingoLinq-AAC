import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';
import capabilities from 'frontend/utils/capabilities';
import modal from 'frontend/utils/modal';
import editManager from 'frontend/utils/edit_manager';

// Guards board-detail `select_button` for URL-link buttons (speak mode).
//
// board-detail renders buttons as <button> (not the classic <a target="_blank" href>),
// so the anchor-open path in raw_events never fires; select_button must launch the link
// itself. It must:
//   - delegate to the canonical app_state.launch_url (which opens an in-app VIDEO PANE
//     for a video.popup link, a book pane for tarheel, or a browser tab for a plain
//     web link) — NOT window_open the raw url (that sent video links to youtube.com);
//   - resolve the action fields from the AUTHORITATIVE board.buttons entry, since the
//     rendered copy handed to select_button can be stale after an in-place edit;
//   - never launch when the button still carries a load_board (folder navigation wins).
module('Unit | Controller | user/board-detail URL-link select_button', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.controller = this.owner.factoryFor('controller:user/board-detail').create();
    this.controller.set('edit_mode', false);

    // Capture launch_url calls (the canonical launcher) + window_open fallback.
    this._launched = [];
    this._opened = [];
    this.controller.set('app_state', EmberObject.create({
      launch_url: (btn) => {
        var g = (o, k) => (o && o.get ? o.get(k) : o && o[k]);
        this._launched.push({ url: g(btn, 'url'), video: g(btn, 'video') });
      }
    }));
    this._orig_window_open = capabilities.window_open;
    capabilities.window_open = (url, target) => { this._opened.push({ url: url, target: target }); return null; };
  });

  hooks.afterEach(function() {
    capabilities.window_open = this._orig_window_open;
    if(this.controller) { this.controller.destroy(); this.controller = null; }
  });

  test('a plain URL button routes to launch_url (which opens a tab), not window_open directly', function(assert) {
    this.controller.send('select_button', { id: '1', label: 'web', url: 'https://site.test/page' });

    assert.equal(this._launched.length, 1, 'delegated to launch_url');
    assert.equal(this._launched[0].url, 'https://site.test/page', 'with the button url');
    assert.equal(this._opened.length, 0, 'did NOT window_open the raw url itself');
  });

  test('a VIDEO url button hands launch_url a video.popup button (→ in-app video pane, not youtube.com)', function(assert) {
    this.controller.send('select_button', {
      id: '1', label: 'clip',
      url: 'https://www.youtube.com/watch?v=abc',
      video: { type: 'youtube', id: 'abc', popup: true }
    });

    assert.equal(this._launched.length, 1, 'delegated to launch_url');
    assert.ok(this._launched[0].video && this._launched[0].video.popup, 'launch_url receives the video.popup so it opens the pane');
    assert.equal(this._opened.length, 0, 'never window_open-ed the youtube url');
  });

  test('a blank button launches nothing', function(assert) {
    this.controller.send('select_button', { id: '3' });
    assert.equal(this._launched.length, 0, 'nothing launched');
    assert.equal(this._opened.length, 0, 'nothing opened');
  });

  // The crux of the reported bug: board-detail rebuilds display buttons from
  // contextualized_buttons, so the object handed to select_button can be a STALE copy
  // that still has the pre-edit load_board (and no url/video). select_button must
  // resolve the action fields from the AUTHORITATIVE board.buttons entry (by id).
  test('a STALE display copy (still a folder) launches the url from the authoritative board button', function(assert) {
    this.controller.set('model', EmberObject.create({
      buttons: [ { id: '9', label: 'go', load_board: null, url: 'https://site.test/x', video: { popup: true, type: 'youtube', id: 'x' } } ]
    }));
    // ...but the passed (rendered) button is the stale copy that still looks like a folder.
    this.controller.send('select_button', { id: '9', label: 'go', load_board: { key: 'me/old-board' } });

    assert.equal(this._launched.length, 1, 'launched from the authoritative entry, not the stale copy');
    assert.equal(this._launched[0].url, 'https://site.test/x', 'the current url');
    assert.ok(this._launched[0].video && this._launched[0].video.popup, 'and the current video (opens the pane)');
  });

  // Regression: board-detail's speak-mode display builder (_make_btn) emits a
  // hand-picked subset of fields. It dropped url/video/add_to_vocalization/home_lock/
  // link_disabled, so those vanished on every speak-mode re-render — the tapped button
  // lost its action and reopening Button Settings showed the option cleared. They must
  // now survive _make_btn.
  test('_make_btn carries the action/option fields onto the speak-mode display button', function(assert) {
    var out = this.controller._make_btn({
      id: '1', label: 'go',
      load_board: { key: 'me/b' },
      url: 'https://x.test', video: { type: 'youtube', id: 'z', popup: true },
      apps: { web: {} }, integration: { x: 1 },
      add_to_vocalization: true, add_vocalization: true,
      home_lock: true, link_disabled: true, sound_id: 's1'
    }, {}, null, false);

    assert.equal(out.url, 'https://x.test', 'url carried');
    assert.ok(out.video && out.video.popup, 'video carried');
    assert.ok(out.apps, 'apps carried');
    assert.ok(out.integration, 'integration carried');
    assert.strictEqual(out.add_to_vocalization, true, 'add_to_vocalization carried');
    assert.strictEqual(out.add_vocalization, true, 'add_vocalization carried');
    assert.strictEqual(out.home_lock, true, 'home_lock carried');
    assert.strictEqual(out.link_disabled, true, 'link_disabled carried');
    assert.equal(out.sound_id, 's1', 'sound_id carried');
  });

  // "Also speak & add to the vocalization box" / "Set as temporary home when loaded" are
  // handled by the canonical app_state.activate_button (utterance add + jump_to_board home
  // lock), which board-detail's fast custom routing skips. A folder button with either
  // option must DELEGATE to the app controller; a plain folder must NOT (keeps fast routing).
  test('a folder button with add_to_vocalization delegates activation to the app controller', function(assert) {
    var activated = [];
    var orig_find = editManager.find_button;
    editManager.find_button = () => EmberObject.create({ id: '9', label: 'go', load_board: { key: 'me/b' }, add_to_vocalization: true });
    this.controller.set('model', EmberObject.create({
      buttons: [ { id: '9', label: 'go', load_board: { key: 'me/b' }, add_to_vocalization: true } ]
    }));
    this.controller.set('stashes', EmberObject.create({ sticky_board: false }));
    this.controller.set('app_state', EmberObject.create({
      controller: { activateButton: (btn) => activated.push(btn) },
      launch_url: () => {}
    }));

    try {
      this.controller.send('select_button', { id: '9', label: 'go', load_board: { key: 'me/b' } });
    } finally {
      editManager.find_button = orig_find;
    }

    assert.equal(activated.length, 1, 'delegated to app_state.controller.activateButton');
  });

  test('a PLAIN folder button (no add_to_vocalization/home_lock) does NOT delegate — keeps fast routing', function(assert) {
    var activated = [];
    this.controller.set('model', EmberObject.create({
      buttons: [ { id: '9', label: 'go', load_board: { key: 'me/b' } } ]
    }));
    // sticky_board on -> the fast-routing branch returns at the board-lock guard, proving
    // it took the custom path (not delegation).
    this.controller.set('stashes', EmberObject.create({ sticky_board: true }));
    this.controller.set('app_state', EmberObject.create({
      controller: { activateButton: (btn) => activated.push(btn) },
      launch_url: () => {}
    }));
    var warned = [];
    var orig_warning = modal.warning;
    modal.warning = function(msg) { warned.push(msg); };
    try {
      this.controller.send('select_button', { id: '9', label: 'go' });
    } finally {
      modal.warning = orig_warning;
    }
    assert.equal(activated.length, 0, 'did NOT delegate');
    assert.equal(warned.length, 1, 'took the fast custom-routing path (board-lock guard fired)');
  });

  test('an authoritative folder button still navigates even if the passed copy lost its load_board', function(assert) {
    this.controller.set('model', EmberObject.create({
      buttons: [ { id: '9', label: 'go', load_board: { key: 'me/current' } } ]
    }));
    this.controller.set('stashes', EmberObject.create({ sticky_board: true }));
    var warned = [];
    var orig_warning = modal.warning;
    modal.warning = function(msg) { warned.push(msg); };
    try {
      this.controller.send('select_button', { id: '9', label: 'go' });
    } finally {
      modal.warning = orig_warning;
    }
    assert.equal(this._launched.length, 0, 'did not launch a url');
    assert.equal(warned.length, 1, 'entered the load_board branch from the authoritative folder entry');
  });
});
