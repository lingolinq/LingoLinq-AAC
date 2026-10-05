import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { basic_landing_for, hand_off_index_nav, take_pending_open_supervisee, query_string_for } from 'frontend/utils/basic_landing';

/* A single communicator's caseload (requested 2026-09-30): `caseload?supervisee=<name>` lands on
 * the Basic home page's Communicators tab with THAT communicator's card expanded (its Extras
 * panel open) and scrolled to. The name rides in the landing and the handoff, taken once, like
 * the Extras drawer.
 */
module('Unit | Utility | basic_landing supervisee', function() {
  test('a caseload URL naming a communicator carries the name', function(assert) {
    var landing = basic_landing_for('caseload', '/caseload?supervisee=aiden_parker');
    assert.strictEqual(landing.route, 'index');
    assert.strictEqual(landing.index_nav, 'supervisees');
    assert.strictEqual(landing.open_supervisee, 'aiden_parker');
  });

  test('a plain caseload URL carries no name, and the shared map entry is not changed', function(assert) {
    basic_landing_for('caseload', '/caseload?supervisee=aiden_parker');
    var landing = basic_landing_for('caseload', '/caseload');
    assert.notOk(landing.open_supervisee, 'no name');
  });

  test('the name is handed off with the tab and taken once', function(assert) {
    var appState = EmberObject.create();
    hand_off_index_nav(appState, 'supervisees', { open_supervisee: 'aiden_parker' });
    assert.strictEqual(take_pending_open_supervisee(appState), 'aiden_parker');
    assert.strictEqual(take_pending_open_supervisee(appState), null, 'gone after one take');
  });

  test('query_string_for reads a transition\'s query params as a URL query', function(assert) {
    assert.strictEqual(query_string_for({ to: { queryParams: { supervisee: 'aiden_parker' } } }), '?supervisee=aiden_parker');
    assert.strictEqual(query_string_for({ to: { queryParams: { nav: 'home', type: 'note' } } }), '?nav=home&type=note');
    assert.strictEqual(query_string_for({ to: { queryParams: {} } }), '');
    assert.strictEqual(query_string_for(null), '');
  });
});
