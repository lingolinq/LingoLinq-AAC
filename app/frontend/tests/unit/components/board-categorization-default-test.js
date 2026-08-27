import { module, test } from 'qunit';
import Service from '@ember/service';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';

/* CATEGORIZATION IS OPT-IN. Turning grouping on MOVES vocabulary out of the cells a
 * communicator has built positional motor memory on — a clinical change, not a cosmetic
 * one — so a user must switch it on deliberately, and absence must never mean "on".
 *
 * The server half of this guarantee is pinned in spec/lib/feature_flags_spec.rb
 * ("defaults to OFF for every user"). This is the CLIENT half, and it matters
 * independently: `generate_defaults` backfills preference_defaults onto every existing
 * user, so the client must treat a MISSING preference as off rather than trusting that
 * the backfill ran. The guard is `=== true`, never `!== false` — the permissive form
 * shipped once and regrouped every board the moment the feature flag went on.
 *
 * The feature FLAG being on is not the same thing as grouping being on: the flag only
 * decides whether the Categorize control is offered.
 *
 * HARNESS NOTE, worth reading before editing: `app_state` is SET ON THE INSTANCE, not
 * registered as `service:app-state`. Registering it does not take here — the component
 * still reads an app_state whose properties are all undefined, which makes every
 * "grouping is off" assertion below pass for the WRONG REASON (no flag => off). That is
 * why the "ON only for a real boolean true" case exists: it is the positive control that
 * proves the harness is actually wired up. Keep it, and keep it passing.
 */
module('Unit | Component | board categorization default', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.owner.register('service:modal', Service.extend({}));
    this.owner.register('service:persistence', Service.extend({}));
  });

  // flagOn defaults true so the flag is never the reason a case reads as OFF.
  function grid(owner, prefs, attrs, flagOn) {
    var g = owner.factoryFor('component:board-detail-grid').create(attrs || {});
    g.set('app_state', EmberObject.create({
      feature_flags: { board_category_grouping: flagOn === undefined ? true : flagOn },
      referenced_user: EmberObject.create({ preferences: prefs })
    }));
    return g;
  }

  test('ON only for a real boolean true (POSITIVE CONTROL — proves the harness is wired)', function(assert) {
    var g = grid(this.owner, { board_category_grouping: { enabled: true } });
    assert.true(g.get('groupingEnabled'), 'an explicit opt-in turns it on');
  });

  test('OFF when the user has no board_category_grouping preference at all', function(assert) {
    var g = grid(this.owner, {});
    assert.false(g.get('groupingEnabled'),
      'an absent preference must read as OFF, not as opt-in-by-default');
  });

  test('OFF when the preference exists but enabled was never set', function(assert) {
    var g = grid(this.owner, { board_category_grouping: { order: [] } });
    assert.false(g.get('groupingEnabled'), 'a hash without `enabled` is still OFF');
  });

  test('OFF for the values a permissive `!== false` check would have let through', function(assert) {
    var _this = this;
    var VALUES = ['false', 0, null, undefined, '', 'true', 1];
    // Explicit count so a silently-empty loop cannot pass as a green test.
    assert.expect(VALUES.length);
    VALUES.forEach(function(v) {
      var g = grid(_this.owner, { board_category_grouping: { enabled: v } });
      assert.false(g.get('groupingEnabled'), JSON.stringify(v) + ' is OFF');
    });
  });

  test('a per-board override OFF wins over a user default of ON', function(assert) {
    var g = grid(this.owner, { board_category_grouping: { enabled: true } }, { categoryEnabled: false });
    assert.false(g.get('groupingEnabled'), 'the board the user turned off stays off');
  });

  test('a per-board override of a non-boolean is not an opt-in', function(assert) {
    var g = grid(this.owner, { board_category_grouping: { enabled: false } }, { categoryEnabled: 'true' });
    assert.false(g.get('groupingEnabled'), 'a STRING "true" per-board is not an opt-in');
  });

  test('the feature flag being OFF forces grouping off regardless of the preference', function(assert) {
    var g = grid(this.owner, { board_category_grouping: { enabled: true } }, {}, false);
    assert.false(g.get('groupingEnabled'),
      'removing the flag returns every board to ungrouped, even for a user who opted in');
  });

  test('a KEYBOARD board is never regrouped, even with grouping explicitly on', function(assert) {
    var g = grid(this.owner, { board_category_grouping: { enabled: true } },
      { board: EmberObject.create({ key: 'someone/vocal-flair-84-keyboard' }) });
    assert.false(g.get('groupingEnabled'), 'QWERTY layout is spatial and must survive');
  });
});
