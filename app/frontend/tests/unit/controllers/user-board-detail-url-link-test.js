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

  test('a plain URL button routes through the canonical activation path, not a local launcher', function(assert) {
    var orig_find = editManager.find_button;
    editManager.find_button = () => EmberObject.create({ id: '1', label: 'web' });
    var activated = [];
    this.controller.set('model', EmberObject.create({
      buttons: [ { id: '1', label: 'web', url: 'https://site.test/page' } ]
    }));
    this.controller.set('app_state', EmberObject.create({
      launch_url: (btn) => this._launched.push({ url: btn && btn.url }),
      controller: { activateButton: (btn) => activated.push(btn) }
    }));

    try {
      this.controller.send('select_button', { id: '1', label: 'web', url: 'https://site.test/page' });
    } finally {
      editManager.find_button = orig_find;
    }

    // activate_button owns the board lock, the `external_links: 'prevent'` guard,
    // actionLock de-dup, usage logging and "also speak & add" — board-detail calling
    // launch_url itself would bypass every one of them.
    assert.equal(activated.length, 1, 'delegated to activateButton');
    assert.equal(activated[0].get('url'), 'https://site.test/page', 'carrying the url for activate_button to launch');
    assert.equal(this._launched.length, 0, 'board-detail did NOT call launch_url itself');
    assert.equal(this._opened.length, 0, 'and did NOT window_open the raw url');
  });

  test('a VIDEO url button carries video.popup into activation (→ in-app pane, not youtube.com)', function(assert) {
    var orig_find = editManager.find_button;
    editManager.find_button = () => EmberObject.create({ id: '1', label: 'clip' });
    var activated = [];
    this.controller.set('model', EmberObject.create({
      buttons: [ { id: '1', label: 'clip', url: 'https://www.youtube.com/watch?v=abc',
                   video: { type: 'youtube', id: 'abc', popup: true } } ]
    }));
    this.controller.set('app_state', EmberObject.create({
      launch_url: () => this._launched.push({}),
      controller: { activateButton: (btn) => activated.push(btn) }
    }));

    try {
      this.controller.send('select_button', { id: '1', label: 'clip', url: 'https://www.youtube.com/watch?v=abc' });
    } finally {
      editManager.find_button = orig_find;
    }

    assert.equal(activated.length, 1, 'delegated to activateButton');
    var v = activated[0].get('video');
    assert.ok(v && v.popup, 'video.popup survives, so launch_url opens the pane rather than a tab');
    assert.equal(this._opened.length, 0, 'never window_open-ed the youtube url');
  });

  test('a blank button launches nothing', function(assert) {
    this.controller.send('select_button', { id: '3' });
    assert.equal(this._launched.length, 0, 'nothing launched');
    assert.equal(this._opened.length, 0, 'nothing opened');
  });

  // "Disable this link action for now" (link_disabled) must suppress the URL/video
  // launch exactly as it suppresses folder navigation.
  //
  // NOTE the shape of this test: asserting only that select_button "falls through to
  // activation" is NOT enough, and asserting it against a stubbed activateButton is
  // actively misleading — the real activate_button opens the url itself, so a
  // fall-through with no guard downstream still launches the link. The enforcement
  // lives in app_state.activate_button (the one path every renderer funnels through);
  // its own coverage is in tests/unit/services/app-state-link-disabled-test.js. Here
  // we only pin that board-detail hands the flag DOWN correctly.
  test('a URL button with link_disabled does NOT launch, and passes link_disabled to activation', function(assert) {
    var orig_find = editManager.find_button;
    editManager.find_button = () => EmberObject.create({ id: '1', label: 'web', url: 'https://site.test' });
    var activated = [];
    this.controller.set('model', EmberObject.create({
      buttons: [ { id: '1', label: 'web', url: 'https://site.test', link_disabled: true } ]
    }));
    this.controller.set('app_state', EmberObject.create({
      launch_url: () => this._launched.push({}),
      controller: { activateButton: (btn) => activated.push(btn) }
    }));

    try {
      this.controller.send('select_button', { id: '1', label: 'web', url: 'https://site.test', link_disabled: true });
    } finally {
      editManager.find_button = orig_find;
    }

    assert.equal(this._launched.length, 0, 'board-detail does not launch it itself');
    assert.equal(this._opened.length, 0, 'and NOT window_open-ed');
    assert.equal(activated.length, 1, 'delegated to the canonical activation path');
    assert.strictEqual(activated[0].get('link_disabled'), true,
      'link_disabled reached the activated button, so activate_button can suppress the launch');
  });

  // Level rules can flip link_disabled (paint mode writes `mods.pre.link_disabled`),
  // and legacy/copied boards persist those rule values as the STRINGS "true"/"false"
  // — `!!"false"` is `true`, which would invert the guard. select_button must resolve
  // through the level rules AND coerce.
  test('link_disabled from a level rule is resolved and coerced, not read raw', function(assert) {
    var orig_find = editManager.find_button;
    editManager.find_button = () => EmberObject.create({ id: '1', label: 'web', url: 'https://site.test' });
    var activated = [];
    this.controller.set('stashes', EmberObject.create({ board_level: 3, sticky_board: false }));
    this.controller.set('model', EmberObject.create({
      buttons: [ { id: '1', label: 'web', url: 'https://site.test',
                   level_modifications: { pre: { link_disabled: 'true' }, 5: { link_disabled: 'false' } } } ]
    }));
    this.controller.set('app_state', EmberObject.create({
      launch_url: () => this._launched.push({}),
      controller: { activateButton: (btn) => activated.push(btn) }
    }));

    try {
      this.controller.send('select_button', { id: '1', label: 'web', url: 'https://site.test' });
    } finally {
      editManager.find_button = orig_find;
    }

    assert.equal(activated.length, 1, 'delegated to activation');
    assert.strictEqual(activated[0].get('link_disabled'), true,
      'at level 3 the `pre` rule applies, and the STRING "true" coerced to a real boolean');
  });

  test('a level rule that re-enables the link at the current level coerces "false" to false', function(assert) {
    var orig_find = editManager.find_button;
    editManager.find_button = () => EmberObject.create({ id: '1', label: 'web', url: 'https://site.test' });
    var activated = [];
    this.controller.set('stashes', EmberObject.create({ board_level: 5, sticky_board: false }));
    this.controller.set('model', EmberObject.create({
      buttons: [ { id: '1', label: 'web', url: 'https://site.test',
                   level_modifications: { pre: { link_disabled: 'true' }, 5: { link_disabled: 'false' } } } ]
    }));
    this.controller.set('app_state', EmberObject.create({
      launch_url: () => this._launched.push({}),
      controller: { activateButton: (btn) => activated.push(btn) }
    }));

    try {
      this.controller.send('select_button', { id: '1', label: 'web', url: 'https://site.test' });
    } finally {
      editManager.find_button = orig_find;
    }

    assert.strictEqual(activated[0].get('link_disabled'), false,
      'level 5 overrides `pre`, and the STRING "false" is not treated as truthy');
  });

  // The crux of the reported bug: board-detail rebuilds display buttons from
  // contextualized_buttons, so the object handed to select_button can be a STALE copy
  // that still has the pre-edit load_board (and no url/video). select_button must
  // resolve the action fields from the AUTHORITATIVE board.buttons entry (by id).
  test('a STALE display copy (still a folder) activates with the authoritative board button fields', function(assert) {
    var orig_find = editManager.find_button;
    // The editManager button is built from the rendered (stale) copy too, so it also
    // still looks like a folder — the overlay from board.buttons is what fixes it.
    editManager.find_button = () => EmberObject.create({ id: '9', label: 'go', load_board: { key: 'me/old-board' } });
    var activated = [];
    this.controller.set('model', EmberObject.create({
      buttons: [ { id: '9', label: 'go', load_board: null, url: 'https://site.test/x', video: { popup: true, type: 'youtube', id: 'x' } } ]
    }));
    this.controller.set('app_state', EmberObject.create({
      launch_url: () => this._launched.push({}),
      controller: { activateButton: (btn) => activated.push(btn) }
    }));

    try {
      this.controller.send('select_button', { id: '9', label: 'go', load_board: { key: 'me/old-board' } });
    } finally {
      editManager.find_button = orig_find;
    }

    assert.equal(activated.length, 1, 'activated rather than navigating to the stale folder');
    assert.equal(activated[0].get('load_board'), null, 'the stale load_board was cleared from the activated button');
    assert.equal(activated[0].get('url'), 'https://site.test/x', 'the current url');
    var v = activated[0].get('video');
    assert.ok(v && v.popup, 'and the current video (opens the pane)');
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
