import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';

/* Basic view's "Boards on This Device" list (components/dashboard/device-boards.hbs, used by classic-view.hbs while
 * offline). Its state is unit-tested in tests/unit/components/classic-view-device-boards-test.js; this renders each
 * branch, including the "can't be shown" line the SPA sign-in guard leads to (docs/task-management/
 * 2026-11-16_offline-boards-page.md). */
QUnit.module('Integration | Component | dashboard/device-boards', function(hooks) {
  setupRenderingTest(hooks);

  QUnit.test('refused (the open database is not this person\'s): says the boards cannot be shown', async function(assert) {
    this.set('boards', null);
    await render(hbs`<Dashboard::DeviceBoards @boards={{this.boards}} @refused={{true}} />`);
    assert.dom('.ch-empty[role="status"]').hasText("Your boards can't be shown right now. Close and reopen the app, or connect to the internet.");
  });

  QUnit.test('a failed device read: the same line, not "none are saved"', async function(assert) {
    var failed = [];
    failed.read_failed = true;
    this.set('boards', failed);
    await render(hbs`<Dashboard::DeviceBoards @boards={{this.boards}} @refused={{false}} />`);
    assert.dom('.ch-empty[role="status"]').includesText("can't be shown right now");
  });

  QUnit.test('while reading: the finding line', async function(assert) {
    this.set('boards', { loading: true });
    await render(hbs`<Dashboard::DeviceBoards @boards={{this.boards}} />`);
    assert.dom('.ch-empty[role="status"]').hasText('Finding the boards on this device...');
  });

  QUnit.test('nothing on the device: says so, and how to fix it', async function(assert) {
    this.set('boards', []);
    await render(hbs`<Dashboard::DeviceBoards @boards={{this.boards}} />`);
    assert.dom('.ch-empty').hasText('No boards are saved on this device yet. Connect to the internet and sync to use your boards offline.');
  });

  QUnit.test('boards on the device: a tile each, the home board marked', async function(assert) {
    var store = this.owner.lookup('service:store');
    this.set('boards', [
      store.push({ data: { id: '1_1', type: 'board', attributes: { key: 'tester/home', name: 'Tester Home' } } }),
      store.push({ data: { id: '1_2', type: 'board', attributes: { key: 'tester/other', name: 'Other' } } })
    ]);
    await render(hbs`<Dashboard::DeviceBoards @boards={{this.boards}} @homeBoardKey="tester/home" />`);
    assert.dom('.ch-boards__cell').exists({ count: 2 });
    assert.dom('.ch-empty').doesNotExist();
    // Only the home board carries the home mark (board-icon.hbs `board-icon__home-glyph`), so a lost @homeBoardKey fails.
    assert.dom('.board-icon__home-glyph').exists({ count: 1 });
    assert.dom('.ch-boards__cell:first-child .board-icon__home-glyph').exists();
  });
});
