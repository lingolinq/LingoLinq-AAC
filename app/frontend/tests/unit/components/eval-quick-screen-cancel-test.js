import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* Cancel on the Quick Screen eval goes home. In Basic the home page opens its Actions tab unless
 * told otherwise, but a Basic user reaches Quick Screen from a Communicators card (classic-view.hbs,
 * the card's Extras panel), so Cancel names that tab through the same one-shot handoff the view
 * switch uses (utils/basic_landing.js). Modern's home page has no tabs, so nothing is handed off.
 */
module('Unit | Component | eval-quick-screen cancel', function(hooks) {
  setupTest(hooks);

  function setup(context, style) {
    var transitions = [];
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      effective_view_user: EmberObject.create({ preferences: { board_view_style: style } })
    }));
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({
      transitionTo: function(route) { transitions.push(route); }
    }));
    var component = context.owner.factoryFor('component:eval-quick-screen').create({});
    return { component: component, transitions: transitions, appState: context.owner.lookup('service:app-state') };
  }

  test('in Basic, Cancel returns to the home page with the Communicators tab open', function(assert) {
    var t = setup(this, 'classic');
    t.component.send('cancel');
    assert.strictEqual(t.appState.get('pending_index_nav'), 'supervisees', 'the Communicators tab is handed off');
    assert.deepEqual(t.transitions, ['index'], 'and it goes home');
  });

  test('in Modern, Cancel goes home with nothing handed off', function(assert) {
    var t = setup(this, 'modern');
    t.component.send('cancel');
    assert.notOk(t.appState.get('pending_index_nav'), 'no tab is handed off');
    assert.deepEqual(t.transitions, ['index'], 'it goes home as before');
  });
});
