import { module, test } from 'qunit';
import Service from '@ember/service';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import { setupTest } from '../../helpers';
import { settled } from '@ember/test-helpers';

/* Speak-mode sidebar Light/Dark (GitHub #1097). The labels used to be LinkTos
   that left the page. set_speak_board_theme writes the same
   preferences.board_dark_mode the modern board reads, and does not transition. */
module('Unit | Controller | application: speak sidebar theme', function(hooks) {
  setupTest(hooks);

  function userStub(dark) {
    var saves = [];
    var prefs = { device: {} };
    if(dark !== undefined) { prefs.board_dark_mode = dark; }
    var u = EmberObject.extend({
      save: function() { saves.push(this.get('preferences.board_dark_mode')); return RSVP.resolve(); }
    }).create({ preferences: prefs });
    u.saves = saves;
    return u;
  }

  function wire(context, user, route) {
    var transitions = [];
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      currentUser: user,
      current_route: route || 'board.index',
      currentBoardState: EmberObject.create({ id: '1', key: 'sam/home' })
    }));
    context.owner.unregister('service:router');
    context.owner.register('service:router', Service.extend({
      transitionTo: function() {
        transitions.push(Array.prototype.slice.call(arguments));
        return RSVP.resolve();
      }
    }));
    var c = context.owner.lookup('controller:application');
    c._themeTransitions = transitions;
    return c;
  }

  test('Dark sets the board colour preference and does not change route', async function(assert) {
    var user = userStub(undefined);
    var c = wire(this, user, 'board.index');
    c.send('set_speak_board_theme', true);
    await settled();
    assert.strictEqual(user.get('preferences.board_dark_mode'), true, 'preference set dark');
    assert.strictEqual(user.get('preferences.device.updated'), true, 'device dirty bit set');
    assert.strictEqual(user.saves.length, 1, 'saved once');
    assert.strictEqual(c._themeTransitions.length, 0, 'no route change');
    assert.true(c.get('speak_board_dark'), 'sidebar offers Light');
    assert.true(c.get('speak_board_theme_dark'), 'classic page takes the dark ground');
    assert.false(c.get('speak_board_theme_light'), 'light ground class stays off');
  });

  test('Light writes an explicit false when the preference was never set', async function(assert) {
    var user = userStub(undefined);
    var c = wire(this, user, 'user.board-alt.index');
    assert.true(c.get('speak_board_dark'), 'an unset preference on the dark page still offers Light');
    assert.false(c.get('speak_board_theme_light'), 'unset does not strip the route colour');
    c.send('set_speak_board_theme', false);
    await settled();
    assert.strictEqual(user.get('preferences.board_dark_mode'), false, 'explicit light is stored');
    assert.strictEqual(user.saves.length, 1, 'saved once');
    assert.strictEqual(c._themeTransitions.length, 0, 'no route change');
    assert.false(c.get('speak_board_dark'), 'sidebar offers Dark');
    assert.true(c.get('speak_board_theme_light'), 'dark page ground is cleared');
    assert.false(c.get('speak_board_theme_dark'));
  });

  test('clicking the colour already stored does not save or navigate', async function(assert) {
    var user = userStub(true);
    var c = wire(this, user, 'board.index');
    c.send('set_speak_board_theme', true);
    await settled();
    assert.strictEqual(user.saves.length, 0, 'not saved');
    assert.strictEqual(c._themeTransitions.length, 0, 'no route change');
  });

  test('the theme classes are only for the classic speak pages', function(assert) {
    var user = userStub(true);
    var c = wire(this, user, 'user.home');
    assert.true(c.get('speak_board_dark'));
    assert.false(c.get('speak_board_theme_dark'), 'home does not take the board ground');
    assert.false(c.get('speak_board_theme_light'));
  });
});
