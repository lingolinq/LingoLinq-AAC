import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';
import capabilities from 'frontend/utils/capabilities';
import modal from 'frontend/utils/modal';

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
