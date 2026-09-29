import { module, test } from 'qunit';
import Service from '@ember/service';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';

/* Compressed View on the Modern home page (components/dashboard/authenticated-view.js):
 * the greeting hero and the My Caseload / Create a Board / Edit Dashboard cards give way to a
 * heading row, so those three leave the grid through the visibility map. The Need Attention
 * card lists three rows and links to the rest, in either mode. The account rail drops its Home Page row.
 *
 * app-state is stubbed with only what these computeds read, and re-registered for each case (a bare
 * `register` over an existing service is ignored, as the view-switcher availability module notes). */
module('Unit | Component | dashboard compressed home', function(hooks) {
  setupTest(hooks);

  // `flagged` supervisees whose org_status is one of ATTENTION_STATUS_IDS
  // (utils/dashboard_sections.js), which is what feeds attentionCommunicators.
  function stub(context, active, flagged) {
    var supervisees = [];
    for (var i = 0; i < (flagged || 0); i++) {
      supervisees.push({ user_name: 'c' + i, org_status: { state: 'unchecked' } });
    }
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      compressed_view_active: active,
      currentUser: EmberObject.create({ preferences: {}, supervisees: supervisees }),
      feature_flags: {}
    }));
  }

  function home(context) {
    return context.owner.factoryFor('component:dashboard/authenticated-view').create();
  }

  test('compressedHome is on only with Compressed View and only on the home tab', function(assert) {
    stub(this, true);
    var c = home(this);
    assert.true(c.get('compressedHome'), 'home tab');
    c.set('activeTab', 'extras');
    assert.false(c.get('compressedHome'), 'the Extras tab keeps its own header');
    stub(this, false);
    assert.false(home(this).get('compressedHome'), 'off without Compressed View');
  });

  test('the heading row replaces the caseload and action cards in the grid', function(assert) {
    var vis = { caseload: true, createboard: true, editdashboard: true, attention: true, rooms: true, speak: true };
    stub(this, true);
    var out = home(this)._compressVisibility(vis);
    assert.deepEqual(
      [out.caseload, out.createboard, out.editdashboard], [false, false, false],
      'caseload and both action cards leave the grid'
    );
    assert.deepEqual([out.attention, out.rooms, out.speak], [true, true, true], 'everything else is untouched');
    assert.true(vis.caseload, 'the input map is not mutated');
    stub(this, false);
    assert.strictEqual(home(this)._compressVisibility(vis), vis, 'without Compressed View the map passes through');
  });

  // Spec changed 2026-09-29 (Traci): three rows in BOTH modes, and "View all communicators"
  // whenever more than three are flagged.
  [true, false].forEach(function(compressed) {
    var mode = compressed ? 'compressed' : 'not compressed';

    test('Need Attention lists three and links to the rest (' + mode + ')', function(assert) {
      stub(this, compressed, 6);
      var c = home(this);
      assert.strictEqual(c.get('attentionCommunicators.length'), 6, 'six flagged');
      assert.strictEqual(c.get('attentionShown.length'), 3, 'three rows');
      assert.true(c.get('attentionOverflow'), 'a View all link');
    });

    test('Need Attention with three or fewer shows them all and no link (' + mode + ')', function(assert) {
      stub(this, compressed, 3);
      var c = home(this);
      assert.strictEqual(c.get('attentionShown.length'), 3, 'all three');
      assert.false(c.get('attentionOverflow'), 'no View all link at exactly three');
      stub(this, compressed, 2);
      assert.strictEqual(home(this).get('attentionShown.length'), 2, 'both of two');
    });
  });

  test('the account rail knows when to drop its Home Page row', function(assert) {
    stub(this, true);
    assert.true(this.owner.factoryFor('component:account-rail').create().get('compressed'), 'compressed');
    stub(this, false);
    assert.false(this.owner.factoryFor('component:account-rail').create().get('compressed'), 'not compressed');
  });
});
