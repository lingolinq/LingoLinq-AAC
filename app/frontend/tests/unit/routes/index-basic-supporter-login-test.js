import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* AN SLP IN BASIC SIGNS IN TO THE COMMUNICATORS TAB (requested 2026-09-30: "for an slp user, if
 * they switch to basic view and that is their preference, when they log in next, take them to the
 * home page with the communicator page as the active page - it is currently taking them to the
 * modern communicator page").
 * At a login entry, a supporter whose view is Basic skips the remembered page (session resume,
 * which could be Modern's caseload) and lands on the Basic home page with the Communicators tab
 * handed off. `_basic_supporter_lands_home` is the decision; routes/index.js#afterModel asks it
 * just before session resume.
 */
module('Unit | Route | index Basic supporter login', function(hooks) {
  setupTest(hooks);

  function setup(context, loginEntry) {
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({ _index_login_entry: loginEntry }));
    return { route: context.owner.lookup('route:index'), appState: context.owner.lookup('service:app-state') };
  }

  function user(style, supporter) {
    return EmberObject.create({ user_name: 'example', supporter_role: supporter, preferences: { board_view_style: style } });
  }

  test('a supporter in Basic, signing in: the home page with Communicators handed off', function(assert) {
    var t = setup(this, true);
    assert.true(t.route._basic_supporter_lands_home(user('classic', true)), 'skips the remembered page');
    assert.strictEqual(t.appState.get('pending_index_nav'), 'supervisees', 'Communicators tab');
  });

  test('a supporter in Modern, signing in: unchanged (resume as before)', function(assert) {
    var t = setup(this, true);
    assert.false(t.route._basic_supporter_lands_home(user('modern', true)));
    assert.notOk(t.appState.get('pending_index_nav'), 'nothing handed off');
  });

  test('a communicator in Basic: unchanged (Basic hides Communicators from them)', function(assert) {
    var t = setup(this, true);
    assert.false(t.route._basic_supporter_lands_home(user('classic', false)));
    assert.notOk(t.appState.get('pending_index_nav'));
  });

  test('not a login entry (an in-app return to the home page): unchanged', function(assert) {
    var t = setup(this, false);
    assert.false(t.route._basic_supporter_lands_home(user('classic', true)));
    assert.notOk(t.appState.get('pending_index_nav'));
  });
});
