import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';
import modal from 'frontend/utils/modal';

/* "RECENTLY TRIED" CHIPS ON THE PICKER (requested 2026-10-13: "Try another returns to the same spot in the
 * picker, with 'Recently tried' chips"). The list is utils/board_picker_trials.js#remember_trial's; a chip
 * opens that board's preview again (Try this Board / Set as Home Board), as its picker tile does. */
module('Unit | Controller | board-picker recently tried', function(hooks) {
  setupTest(hooks);

  test('lists the boards tried this session', function(assert) {
    var c = this.owner.lookup('controller:board-picker');
    c.get('appState').set('board_picker_recent', [{ key: 'lingolinq/vocal-flair-40', name: 'Vocal Flair 40' }, { key: 'lingolinq/quick-core-60', name: 'Quick Core 60' }]);
    assert.deepEqual(c.get('recentTries').map(function(r) { return r.name; }), ['Vocal Flair 40', 'Quick Core 60']);
    c.get('appState').set('board_picker_recent', []);
    assert.strictEqual(c.get('recentTries').length, 0, 'none: no chips');
  });

  test('a chip opens that board\'s preview', async function(assert) {
    assert.expect(1);
    var opened = [];
    var real = modal.board_preview;
    modal.board_preview = function(b) { opened.push(b.get('key')); };
    var vf40 = EmberObject.create({ key: 'lingolinq/vocal-flair-40', name: 'Vocal Flair 40' });
    this.owner.unregister('service:store');
    this.owner.register('service:store', Service.extend({ findRecord: function(t, key) { return Promise.resolve(key === vf40.get('key') ? vf40 : null); } }));
    try {
      var c = this.owner.lookup('controller:board-picker');
      await c.send('open_recent', 'lingolinq/vocal-flair-40');
      await new Promise(function(r) { setTimeout(r, 0); });
      assert.deepEqual(opened, ['lingolinq/vocal-flair-40']);
    } finally { modal.board_preview = real; }
  });
});
