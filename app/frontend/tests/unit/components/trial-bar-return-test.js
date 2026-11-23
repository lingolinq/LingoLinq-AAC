import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* "TRY ANOTHER" RETURNS TO THE PICKER FOR THE SAME PERSON, in Basic too (measured live in Modern on develop,
 * 2026-11-20: an SLP's trial for a communicator came back to the SLP's own picker). The Basic bar has no
 * board-detail controller behind it: its own `exit` goes to the picker (components/trial-bar.js). */
module('Unit | Component | trial-bar returns to the right picker', function(hooks) {
  setupTest(hooks);

  function setup(context, marker) {
    var transitions = [];
    var me = EmberObject.create({ id: 'self', global_id: '1_25', user_name: 'elena_rodriguez_slp', preferences: { board_view_style: 'classic' } });
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      currentUser: me, sessionUser: me, effective_view_user: me,
      speak_mode: false, edit_mode: false,
      currentBoardState: { key: 'lingolinq/core-60' },
      basic_try_home: marker, board_detail_try_origin: null
    }));
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({
      transitionTo: function() { transitions.push(Array.prototype.slice.call(arguments)); }
    }));
    var bar = context.owner.factoryFor('component:trial-bar').create({ board: EmberObject.create({ key: 'lingolinq/core-60', name: 'Core 60' }), view: 'basic' });
    return { bar: bar, transitions: transitions, appState: context.owner.lookup('service:app-state') };
  }

  test('Basic: a trial for a communicator returns to their picker', function(assert) {
    var t = setup(this, { key: 'lingolinq/core-60', user_id: '1_40', user_name: 'oliver_harris' });
    t.bar.exit();
    assert.deepEqual(t.transitions, [['board-picker', { queryParams: { user_id: '1_40' } }]]);
    assert.notOk(t.appState.get('basic_try_home'), 'the trial is over');
  });

  test('CONTROL: Basic, a trial for yourself, the plain picker as before', function(assert) {
    var t = setup(this, { key: 'lingolinq/core-60', user_id: '1_25', user_name: 'elena_rodriguez_slp' });
    t.bar.exit();
    assert.deepEqual(t.transitions, [['board-picker']]);
  });
});
