import { module, test } from 'qunit';
import Service from '@ember/service';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';

/* The Need Attention card on the Modern home page (components/dashboard/authenticated-view.js
 * #attentionShown / #attentionOverflow): three rows, and "View all communicators" whenever more
 * than three are flagged (spec 2026-09-29). Kept from dashboard-compressed-home-test.js, which
 * ran these in both modes, when Compressed View was removed (2026-10-10).
 *
 * app-state is stubbed with only what these computeds read, and re-registered for each case (a bare
 * `register` over an existing service is ignored, as the view-switcher availability module notes). */
module('Unit | Component | dashboard need attention', function(hooks) {
  setupTest(hooks);

  // `flagged` supervisees whose org_status is one of ATTENTION_STATUS_IDS
  // (utils/dashboard_sections.js), which is what feeds attentionCommunicators.
  function stub(context, flagged) {
    var supervisees = [];
    for (var i = 0; i < (flagged || 0); i++) {
      supervisees.push({ user_name: 'c' + i, org_status: { state: 'unchecked' } });
    }
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      currentUser: EmberObject.create({ preferences: {}, supervisees: supervisees }),
      feature_flags: {}
    }));
  }

  function home(context) {
    return context.owner.factoryFor('component:dashboard/authenticated-view').create();
  }

  test('Need Attention lists three and links to the rest', function(assert) {
    stub(this, 6);
    var c = home(this);
    assert.strictEqual(c.get('attentionCommunicators.length'), 6, 'six flagged');
    assert.strictEqual(c.get('attentionShown.length'), 3, 'three rows');
    assert.true(c.get('attentionOverflow'), 'a View all link');
  });

  test('Need Attention with three or fewer shows them all and no link', function(assert) {
    stub(this, 3);
    var c = home(this);
    assert.strictEqual(c.get('attentionShown.length'), 3, 'all three');
    assert.false(c.get('attentionOverflow'), 'no View all link at exactly three');
    stub(this, 2);
    assert.strictEqual(home(this).get('attentionShown.length'), 2, 'both of two');
  });
});
