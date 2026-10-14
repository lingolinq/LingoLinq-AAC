import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';
import { foldersLayout, FOLDERS_EXPANDED_KEY } from 'frontend/utils/folders_panel_state';

/* NO COLLAPSED FOLDERS PANEL IN SIDE-BY-SIDE (requested 2026-10-11). Above 1200px the page is
 * side-by-side and the expand caret is hidden (app.scss, the folders chevron rule), so a panel the
 * user had collapsed at a narrower width showed as an empty column with no New folder / Tag a board
 * buttons and nothing to open it with. In side-by-side the panel is always open; the stored
 * preference is left alone (it is the user's choice for the stacked layout) and is only written by
 * the user's own toggle. The component and controllers/user/index read the SAME side-by-side flag,
 * so they agree on whether foldered boards are held out of the main grid. */
module('Unit | Component | boards folders panel in side-by-side', function(hooks) {
  setupTest(hooks);
  var prior;
  var stored;
  hooks.beforeEach(function() {
    prior = foldersLayout.get('sideBySide');
    try { stored = localStorage.getItem(FOLDERS_EXPANDED_KEY); localStorage.setItem(FOLDERS_EXPANDED_KEY, 'false'); } catch (e) { /* no storage */ }
  });
  hooks.afterEach(function() {
    foldersLayout.set('sideBySide', prior);
    try { if (stored === null) { localStorage.removeItem(FOLDERS_EXPANDED_KEY); } else { localStorage.setItem(FOLDERS_EXPANDED_KEY, stored); } } catch (e) { /* no storage */ }
  });

  function section(owner) {
    var ctrl = EmberObject.create({ model: EmberObject.create({ id: '1_1' }) });
    return owner.factoryFor('component:available-boards-section').create({ boardsCtrl: ctrl });
  }

  test('side-by-side: open even when the stored choice is collapsed', function(assert) {
    foldersLayout.set('sideBySide', true);
    var comp = section(this.owner);
    assert.false(comp.get('foldersExpanded'), 'the stored choice is untouched');
    assert.true(comp.get('foldersOpen'), 'but the panel is open');
    comp.destroy();
  });

  test('side-by-side: the title cannot collapse it, and the stored choice is not rewritten', function(assert) {
    foldersLayout.set('sideBySide', true);
    var comp = section(this.owner);
    comp.send('toggleFoldersExpanded');
    assert.true(comp.get('foldersOpen'), 'still open');
    assert.strictEqual(localStorage.getItem(FOLDERS_EXPANDED_KEY), 'false', 'stacked-layout choice kept');
    comp.destroy();
  });

  test('stacked: follows the stored choice and the toggle, as before', function(assert) {
    foldersLayout.set('sideBySide', false);
    var comp = section(this.owner);
    assert.false(comp.get('foldersOpen'));
    comp.send('toggleFoldersExpanded');
    assert.true(comp.get('foldersOpen'));
    assert.strictEqual(localStorage.getItem(FOLDERS_EXPANDED_KEY), 'true');
    comp.destroy();
  });

  test('widening into side-by-side opens it; narrowing restores the stored choice', function(assert) {
    foldersLayout.set('sideBySide', false);
    var comp = section(this.owner);
    assert.false(comp.get('foldersOpen'));
    foldersLayout.set('sideBySide', true);
    assert.true(comp.get('foldersOpen'));
    foldersLayout.set('sideBySide', false);
    assert.false(comp.get('foldersOpen'));
    comp.destroy();
  });

  test('controllers/user/index agrees: foldered boards are held out of the grid in side-by-side', function(assert) {
    var ctrl = this.owner.lookup('controller:user/index');
    ctrl.set('mineFoldersPanelExpanded', false);
    foldersLayout.set('sideBySide', true);
    assert.true(ctrl.get('mineFoldersPanelOpen'));
    foldersLayout.set('sideBySide', false);
    assert.false(ctrl.get('mineFoldersPanelOpen'));
  });
});
