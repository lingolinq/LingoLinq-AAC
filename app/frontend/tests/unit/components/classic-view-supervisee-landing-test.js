import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { settled } from '@ember/test-helpers';
import { setupTest } from '../../helpers';

/* ARRIVING FROM ONE COMMUNICATOR'S CASELOAD (requested 2026-09-30): the Basic home page opens the
 * Communicators tab, expands that communicator's card (its Extras panel, the state the card's
 * Extras button toggles) and scrolls the card into view.
 */
module('Unit | Component | classic-view supervisee landing', function(hooks) {
  setupTest(hooks);
  var planted = null;
  hooks.afterEach(function() {
    if (planted && planted.parentNode) { planted.parentNode.removeChild(planted); }
    planted = null;
  });

  function setup(context, pendingName) {
    var scrolls = [];
    // The rendered card, as classic-view.hbs draws it: an article holding the panel by id.
    var card = document.createElement('article');
    card.className = 'ch-comm';
    var panel = document.createElement('ul');
    panel.id = 'ch-extras-1_7';
    card.appendChild(panel);
    card.scrollIntoView = function(opts) { scrolls.push(opts); };
    (document.querySelector('#ember-testing') || document.body).appendChild(card);
    planted = card;
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      currentUser: EmberObject.create({
        preferences: {}, supporter_role: true,
        known_supervisees: [{ id: '1_5', user_name: 'other' }, { id: '1_7', user_name: 'aiden_parker' }],
        save: function() { return Promise.resolve(); }
      }),
      pending_index_nav: pendingName ? 'supervisees' : null,
      pending_open_supervisee: pendingName || null
    }));
    var model = EmberObject.create({ id: '1_3', supporter_role: true, load_word_activities: function() {} });
    var component = context.owner.factoryFor('component:dashboard/classic-view').create({ model: model });
    return { component: component, scrolls: scrolls };
  }

  function frame() { return settled().then(function() { return new Promise(function(r) { window.requestAnimationFrame(r); }); }); }

  test('arriving with a communicator handed off expands their card and scrolls to it', async function(assert) {
    var t = setup(this, 'aiden_parker');
    t.component.didInsertElement();
    await frame();
    assert.strictEqual(t.component.get('openSuperviseeId'), '1_7', 'their card is expanded');
    assert.strictEqual(t.scrolls.length, 1, 'and scrolled into view');
  });

  test('a name not on this caseload expands nothing', async function(assert) {
    var t = setup(this, 'someone_else');
    t.component.didInsertElement();
    await frame();
    assert.notOk(t.component.get('openSuperviseeId'), 'no card expanded');
    assert.strictEqual(t.scrolls.length, 0, 'no scroll');
  });

  test('an ordinary arrival expands nothing', async function(assert) {
    var t = setup(this, null);
    t.component.didInsertElement();
    await frame();
    assert.notOk(t.component.get('openSuperviseeId'));
    assert.strictEqual(t.scrolls.length, 0);
  });
});
