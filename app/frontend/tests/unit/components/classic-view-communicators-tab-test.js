import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* THE BASIC COMMUNICATORS TAB IS DRAWN FOR EVERYONE THE CASELOAD ADMITS (2026-10-02, requested:
 * "make it open communicators section with a drawn tab"). Switching to Basic from Caseload, or
 * arriving there by Back or a bookmark, opens the home page's Communicators section
 * (utils/basic_landing.js). The Caseload admits supporters, supporter-view users and anyone with
 * communicators (routes/caseload.js), but the tab was drawn for supporters only, so a parent with
 * communicators landed on a section with no tab lit. One rule now: utils/caseload_access.js.
 * Modeling-only accounts keep their earlier exclusion (the strip hides Communicators and Updates
 * for them).
 */
module('Unit | Component | classic-view communicators tab', function(hooks) {
  setupTest(hooks);

  function tab(context, attrs) {
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      currentUser: EmberObject.create(Object.assign({ preferences: {}, known_supervisees: [], save: function() { return Promise.resolve(); } }, attrs))
    }));
    var model = EmberObject.create({ id: '1_3', load_word_activities: function() {} });
    var c = context.owner.factoryFor('component:dashboard/classic-view').create({ model: model });
    return c.get('showCommunicatorsTab');
  }

  test('drawn for a supporter, a supporter-view user and anyone with communicators', function(assert) {
    assert.expect(3);
    assert.true(tab(this, { supporter_role: true }), 'supporter');
    assert.true(tab(this, { supporter_view: true }), 'supporter view');
    assert.true(tab(this, { known_supervisees: [{ id: '1_7', user_name: 'aiden_parker' }] }), 'a parent with a communicator');
  });

  test('not for someone with no communicators, nor a modeling-only account', function(assert) {
    assert.expect(2);
    assert.false(tab(this, {}), 'no communicators');
    assert.false(tab(this, { supporter_role: true, modeling_only: true }), 'modeling-only');
  });
});
