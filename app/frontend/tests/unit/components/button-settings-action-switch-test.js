import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import Button from 'frontend/utils/button';
import editManager from 'frontend/utils/edit_manager';
import Utils from 'frontend/utils/misc';

// Guards the Button Settings action-type switch (button-settings component).
//
// Regression (reported twice): a FOLDER button (load_board set) switched to
// "Open a web site in a browser tab" (a URL) still had its load_board, so tapping
// it in speak mode navigated to the old board instead of opening the URL. The
// button's action is DERIVED from its fields (utils/button.js `updateAction`, which
// prioritizes load_board over url), and board-detail `select_button` navigates ANY
// button that still has a load_board. So switching the action type MUST clear the
// conflicting fields.
//
// The first fix cleared load_board only on the DROPDOWN path
// (updateModelButtonAction). It missed the "Quick actions" shortcut
// (quick_action('url')), which set buttonAction directly and left load_board in
// place. The real fix routes BOTH entry points through one shared method,
// `_apply_button_action`. These tests pin BOTH entry points + the shared method.
module('Unit | Component | button-settings action switch', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    // _apply_button_action also syncs the cleared fields into board.buttons via
    // editManager.change_button (so speak-mode select_button sees them). Capture the
    // calls instead of driving a real board/editManager in a unit test.
    this._change_calls = [];
    this._orig_change_button = editManager.change_button;
    editManager.change_button = (id, opts) => { this._change_calls.push({ id: id, opts: opts }); };

    // The component's load_user_integrations observer can kick off an async
    // integrations fetch; if it resolves after the component is destroyed it throws
    // "set on destroyed object". Hand it a never-resolving thenable so no async set
    // outlives the test (irrelevant to the action-switch logic under test).
    this._orig_all_pages = Utils.all_pages;
    Utils.all_pages = () => ({ then: function() { return this; } });

    this.component = this.owner.factoryFor('component:button-settings').create();
  });

  hooks.afterEach(function() {
    editManager.change_button = this._orig_change_button;
    Utils.all_pages = this._orig_all_pages;
    if(this.component) { this.component.destroy(); this.component = null; }
  });

  // A folder button: load_board set → utils/button.js derives buttonAction 'folder'.
  function folderButton() {
    return Button.create({ id: '42', label: 'go', load_board: { key: 'me/somewhere' } });
  }

  test('folder button switched to "link" clears load_board and lands on buttonAction=link', function(assert) {
    var btn = folderButton();
    this.component.set('model', btn);
    assert.equal(btn.get('buttonAction'), 'folder', 'precondition: derived as a folder');

    this.component._apply_button_action('link');

    assert.strictEqual(btn.get('load_board'), null, 'load_board is cleared');
    assert.equal(btn.get('buttonAction'), 'link', 'buttonAction is link');
  });

  test('quick_action("url") clears load_board (regression: the previously-missed entry point)', function(assert) {
    var btn = folderButton();
    this.component.set('model', btn);

    this.component.send('quick_action', 'url');

    assert.strictEqual(btn.get('load_board'), null, 'load_board cleared via the Quick-actions shortcut');
    assert.equal(btn.get('buttonAction'), 'link', 'buttonAction is link');

    // And it STAYS link once the user types the URL — updateAction re-fires on the
    // url change, and with load_board gone it derives 'link' (the old bug reverted to
    // 'folder' here because load_board was still set).
    btn.set('url', 'https://example.com');
    assert.equal(btn.get('buttonAction'), 'link', 'stays link after the URL is entered');
  });

  test('updateModelButtonAction("link") clears load_board (dropdown entry point)', function(assert) {
    var btn = folderButton();
    this.component.set('model', btn);

    this.component.send('updateModelButtonAction', 'link');

    assert.strictEqual(btn.get('load_board'), null, 'load_board cleared via the action dropdown');
    assert.equal(btn.get('buttonAction'), 'link', 'buttonAction is link');
  });

  test('switching to "link" preserves an existing url but clears apps + integration', function(assert) {
    var btn = Button.create({
      id: '7', label: 'x',
      load_board: { key: 'a/b' }, url: 'https://keep.me',
      apps: { web: {} }, integration: { x: 1 }
    });
    this.component.set('model', btn);

    this.component._apply_button_action('link');

    assert.equal(btn.get('url'), 'https://keep.me', 'the chosen field (url) is preserved');
    assert.strictEqual(btn.get('load_board'), null, 'load_board cleared');
    assert.strictEqual(btn.get('apps'), null, 'apps cleared');
    assert.strictEqual(btn.get('integration'), null, 'integration cleared');
    assert.equal(btn.get('buttonAction'), 'link', 'buttonAction is link');
  });

  test('the cleared fields are synced to board.buttons via editManager.change_button', function(assert) {
    var btn = folderButton();
    this.component.set('model', btn);

    this.component._apply_button_action('link');

    assert.equal(this._change_calls.length, 1, 'change_button called once');
    assert.equal(this._change_calls[0].id, '42', 'for the edited button id');
    assert.strictEqual(this._change_calls[0].opts.load_board, null, 'sync clears load_board on the board button');
  });

  test('editing the URL syncs it to board.buttons via change_button (was model-only before)', function(assert) {
    var btn = Button.create({ id: '5', label: 'x', url: null });
    this.component.set('model', btn);
    // handle_updates gates the field-sync observers; the modal sets it true when a
    // button is loaded. Enable it, then clear the calls from setup.
    this.component.set('handle_updates', true);
    this._change_calls.length = 0;

    btn.set('url', 'https://typed.example/page');

    assert.ok(
      this._change_calls.some((c) => c.id === '5' && c.opts.url === 'https://typed.example/page'),
      'the typed url is pushed to the board button, not just the modal model'
    );
  });

  test('a YouTube url derives a video.popup and syncs it to board.buttons (for the in-app video pane)', function(assert) {
    var btn = Button.create({ id: '6', label: 'v' });
    this.component.set('model', btn);
    this.component.set('handle_updates', true);
    this._change_calls.length = 0;

    btn.set('url', 'https://www.youtube.com/watch?v=abc123');

    // resource_from_url (utils/button.js) turns a youtube link into video: {popup:true}
    assert.ok(btn.get('video') && btn.get('video').popup, 'the youtube url derived a video.popup on the model');
    assert.ok(
      this._change_calls.some((c) => c.id === '6' && c.opts.video && c.opts.video.popup),
      'the derived video.popup is synced to the board button so select_button can open the pane'
    );
  });

  test('quick_action("folder") clears a stale url (inverse direction)', function(assert) {
    var btn = Button.create({ id: '9', label: 'y', url: 'https://old.link' });
    this.component.set('model', btn);
    assert.equal(btn.get('buttonAction'), 'link', 'precondition: derived as a link');

    this.component.send('quick_action', 'folder');

    assert.strictEqual(btn.get('url'), null, 'url cleared when switching to a folder');
    assert.equal(btn.get('buttonAction'), 'folder', 'buttonAction is folder');
  });
});
