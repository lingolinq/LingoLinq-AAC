import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* "Try New Style" in the classic header (templates/application.hbs).
 *
 * That control renders ONLY inside `{{#if this.app_state.speak_mode}}` — and in speak
 * mode `appState.currentUser` is not the person operating the device: `set_current_user`
 * reassigns it to `speakModeUser` (services/app-state.js:2463) whenever a supporter is
 * speaking AS a communicator. Writing the view preference to `currentUser` there would
 * flip and PERSIST the communicator's own stored setting because their supporter tried
 * a different UI.
 *
 * The preference belongs to the account that is signed in, so it is written to
 * `sessionUser`, which speak mode does not reassign.
 */
module('Unit | Controller | application "Try New Style"', function(hooks) {
  setupTest(hooks);

  function user(name, style) {
    return EmberObject.create({
      user_name: name,
      preferences: { board_view_style: style, device: {} },
      save: function() { return Promise.resolve(this); }
    });
  }

  function setup(context, state) {
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend(state));
    return context.owner.lookup('controller:application');
  }

  test('a supporter speaking AS a communicator changes their OWN preference, not the communicator\'s', function(assert) {
    var supporter = user('supporter', 'classic');
    var communicator = user('communicator', 'classic');
    // Exactly what app-state does in speak mode: currentUser IS the communicator.
    var controller = setup(this, {
      speak_mode: true,
      speakModeUser: communicator,
      currentUser: communicator,
      sessionUser: supporter,
      currentBoardState: null
    });

    controller.send('goToNewStyle');

    assert.strictEqual(communicator.get('preferences.board_view_style'), 'classic',
      'the AAC user\'s own chosen view is untouched');
    assert.strictEqual(supporter.get('preferences.board_view_style'), 'modern',
      'the signed-in supporter gets the new style they asked for');
  });

  test('a communicator speaking as themselves still changes their own preference', function(assert) {
    var self = user('self', 'classic');
    // keep_as_self: speakModeUser stays null, so currentUser === sessionUser.
    var controller = setup(this, {
      speak_mode: true,
      speakModeUser: null,
      currentUser: self,
      sessionUser: self,
      currentBoardState: null
    });

    controller.send('goToNewStyle');

    assert.strictEqual(self.get('preferences.board_view_style'), 'modern',
      'their own preference is theirs to change');
  });

  test('the preference is persisted, not just flipped in memory', function(assert) {
    var supporter = user('supporter', 'classic');
    var saved = [];
    supporter.save = function() { saved.push(this.get('preferences.board_view_style')); return Promise.resolve(this); };
    var controller = setup(this, {
      speak_mode: true, speakModeUser: user('communicator', 'classic'),
      currentUser: user('communicator', 'classic'), sessionUser: supporter,
      currentBoardState: null
    });

    controller.send('goToNewStyle');

    assert.deepEqual(saved, ['modern'], 'saved once with the new value');
  });
});
