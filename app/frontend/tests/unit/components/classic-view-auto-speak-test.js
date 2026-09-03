import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';

/* The classic home page's "start app in Speak Mode" checkbox.
 *
 * It is wired as `{{on "change" (this.ctrlAction "toggle_auto_speak")}}`, and
 * `ctrlAction` (classic-view.js) unconditionally pops a trailing DOM event off the
 * argument list before dispatching — every other call site passes bound arguments and
 * wants the event dropped. This one passed ONLY the event, so the handler received
 * `undefined` and could never read `checked`.
 *
 * The preference is therefore driven from the component's own state rather than from
 * the event: the input's `checked` attribute is bound to the same property, so the two
 * cannot disagree.
 */
module('Unit | Component | classic-view auto-speak toggle', function(hooks) {
  setupTest(hooks);

  function setup(context, initial) {
    var saves = [];
    var user = EmberObject.create({
      preferences: { auto_open_speak_mode: initial },
      save: function() { saves.push(this.get('preferences.auto_open_speak_mode')); return Promise.resolve(this); }
    });
    // Unregister first — a bare register over an existing service is ignored, which
    // would leave every read `undefined` and let these assertions pass hollowly.
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({ currentUser: user }));
    var component = context.owner.factoryFor('component:dashboard/classic-view').create();
    return { component: component, user: user, saves: saves };
  }

  // A `change` event is not cancelable, so the box appears ticked either way — the
  // only observable is what gets written to the preference.
  function fakeChangeEvent(checked) {
    return { type: 'change', target: { checked: checked }, preventDefault: function() {} };
  }

  test('ticking the box turns auto-open-speak-mode ON', function(assert) {
    var t = setup(this, false);
    t.component.ctrlAction('toggle_auto_speak')(fakeChangeEvent(true));
    assert.true(t.user.get('preferences.auto_open_speak_mode'), 'the preference was turned on');
  });

  test('unticking the box turns it back OFF', function(assert) {
    var t = setup(this, true);
    t.component.ctrlAction('toggle_auto_speak')(fakeChangeEvent(false));
    assert.false(t.user.get('preferences.auto_open_speak_mode'), 'the preference was turned off');
  });

  test('an unset preference turns ON at the first click rather than staying off', function(assert) {
    var t = setup(this, undefined);
    t.component.ctrlAction('toggle_auto_speak')(fakeChangeEvent(true));
    assert.true(!!t.user.get('preferences.auto_open_speak_mode'), 'undefined is treated as off, so the first click turns it on');
  });

  test('the change is persisted', function(assert) {
    var t = setup(this, false);
    t.component.ctrlAction('toggle_auto_speak')(fakeChangeEvent(true));
    assert.deepEqual(t.saves, [true], 'save() ran once with the new value');
  });
});
