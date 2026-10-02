import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { settled } from '@ember/test-helpers';
import { setupTest } from '../../helpers';

/* THE BASIC LANDING FROM ONE COMMUNICATOR'S CASELOAD ROW (2026-10-02, adversarial review, requested:
 * "fix"). Three gaps:
 *  - a MODELING-ONLY communicator's card was expanded (its actions menu). The Modern caseload only
 *    highlights that row (controllers/caseload.js deep link); Basic now highlights and scrolls too;
 *  - with the communicator list not yet loaded when the page opened, nothing happened. It now
 *    waits for the list, as the Modern deep link does;
 *  - the Communicators tab handoff was dropped for anyone who is not `supporter_role`
 *    (`_tabShown`), although the tab itself is drawn for everyone the Caseload admits
 *    (`showCommunicatorsTab`, 2026-10-02). One rule now.
 */
module('Unit | Component | classic-view caseload landing gaps', function(hooks) {
  setupTest(hooks);
  var planted = [];
  hooks.afterEach(function() { planted.forEach(function(el) { if(el.parentNode) { el.parentNode.removeChild(el); } }); planted = []; });

  function plantCard(id) {
    var card = document.createElement('article');
    card.className = 'ch-comm';
    var panel = document.createElement('ul');
    panel.id = 'ch-extras-' + id;
    card.appendChild(panel);
    card.scrollIntoView = function() { card.__scrolled = true; };
    (document.querySelector('#ember-testing') || document.body).appendChild(card);
    planted.push(card);
    return card;
  }

  function setup(context, attrs, pending) {
    var me = EmberObject.create(Object.assign({ preferences: {}, save: function() { return Promise.resolve(); } }, attrs));
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      currentUser: me, pending_index_nav: 'supervisees', pending_open_supervisee: pending
    }));
    var model = EmberObject.create({ id: '1_3', load_word_activities: function() {} });
    return { me: me, component: context.owner.factoryFor('component:dashboard/classic-view').create({ model: model }) };
  }
  function frame() { return settled().then(function() { return new Promise(function(r) { window.requestAnimationFrame(r); }); }); }

  test('a modeling-only communicator is highlighted and scrolled to, not expanded', async function(assert) {
    assert.expect(3);
    var card = plantCard('1_9');
    var t = setup(this, { supporter_role: true, known_supervisees: [{ id: '1_9', user_name: 'mo_kid', modeling_only: true }] }, 'mo_kid');
    t.component.didInsertElement();
    await frame();
    assert.notOk(t.component.get('openSuperviseeId'), 'no actions menu opened');
    assert.strictEqual(t.component.get('highlightedSuperviseeId'), '1_9', 'the card is highlighted');
    assert.true(!!card.__scrolled, 'and scrolled into view');
  });

  test('a list that arrives after the page opened still expands the card', async function(assert) {
    assert.expect(2);
    plantCard('1_7');
    var t = setup(this, { supporter_role: true, known_supervisees: [] }, 'aiden_parker');
    t.component.didInsertElement();
    await frame();
    assert.notOk(t.component.get('openSuperviseeId'), 'nothing to expand yet');
    t.me.set('known_supervisees', [{ id: '1_7', user_name: 'aiden_parker' }]);
    await frame();
    assert.strictEqual(t.component.get('openSuperviseeId'), '1_7', 'expanded once the list arrived');
  });

  test('a parent with communicators keeps the Communicators handoff', async function(assert) {
    assert.expect(1);
    plantCard('1_7');
    var t = setup(this, { supporter_role: false, known_supervisees: [{ id: '1_7', user_name: 'aiden_parker' }] }, 'aiden_parker');
    t.component.didInsertElement();
    await frame();
    assert.strictEqual(t.component.get('openSuperviseeId'), '1_7', 'the tab handoff and the card both apply');
  });
});
