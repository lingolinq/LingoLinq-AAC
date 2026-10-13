import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import modal from 'frontend/utils/modal';
import { confirm_view_style_change } from 'frontend/utils/view_style';

/* Changing the view writes `board_view_style` ON A USER RECORD, and that user is not always
 * the person clicking: while a supervisor models for a communicator, or works on that
 * communicator's pages, `effective_view_user` resolves to the COMMUNICATOR. The same control
 * that changes your own view then changes someone else's saved default, on every device they
 * use, for good.
 *
 * `confirm_view_style_change` is the gate in front of every write path. What matters is that
 * it asks in exactly one situation and stays silent in the others: a warning that fires when
 * you change your OWN view would be pure noise, and noise is what teaches people to click
 * through the dialog that matters.
 *
 * Every test declares assert.expect(): each assertion runs inside a promise callback, so
 * without a declared count a promise that never resolved would pass the test having asserted
 * nothing at all.
 */
module('Unit | Utility | confirm_view_style_change', function(hooks) {
  setupTest(hooks);

  function state(current, effective) {
    return EmberObject.create({
      currentUser: current,
      effective_view_user: effective || current
    });
  }
  function user(id, name) {
    return EmberObject.create({ id: id, user_name: name });
  }

  hooks.beforeEach(function() {
    this.opened = [];
    this.original_open = modal.open;
    this.result = 'change_view';
    var _this = this;
    modal.open = function(template, options) {
      _this.opened.push({ template: template, options: options });
      return RSVP.resolve(_this.result);
    };
  });

  hooks.afterEach(function() {
    modal.open = this.original_open;
  });

  test('changing your OWN view asks nothing', function(assert) {
    assert.expect(2);
    var me = user('slp-1', 'sarah');
    var _this = this;
    return confirm_view_style_change(state(me, me), 'classic').then(function(ok) {
      assert.true(ok, 'proceeds');
      assert.strictEqual(_this.opened.length, 0, 'and never opened a modal');
    });
  });

  test('changing SOMEONE ELSE\'S view asks first, naming them', function(assert) {
    assert.expect(4);
    var slp = user('slp-1', 'sarah');
    var kiddo = user('kiddo-1', 'aiden');
    var _this = this;
    return confirm_view_style_change(state(slp, kiddo), 'classic').then(function(ok) {
      assert.strictEqual(_this.opened.length, 1, 'opened one modal');
      assert.strictEqual(_this.opened[0].template, 'confirm-view-style-change', 'the right one');
      assert.strictEqual(_this.opened[0].options.user_name, 'aiden',
        'naming the person whose preference is about to change');
      assert.true(ok, 'and proceeds once confirmed');
    });
  });

  /* The half that actually protects the communicator: a dismissed dialog has to stop the
     write, not merely delay it. Callers keep their save AND their navigation inside the
     `.then`, so a false here is what leaves the preference alone. */
  test('cancelling stops the change', function(assert) {
    assert.expect(1);
    var slp = user('slp-1', 'sarah');
    var kiddo = user('kiddo-1', 'aiden');
    this.result = undefined;          // the modal closed without confirming
    return confirm_view_style_change(state(slp, kiddo), 'classic').then(function(ok) {
      assert.false(ok, 'reports "do not proceed"');
    });
  });

  /* A record with no id cannot be shown to be somebody else, and a spurious warning about
     changing another person's settings is worse than none. */
  test('an unidentifiable record does not raise a false alarm', function(assert) {
    assert.expect(2);
    var slp = user('slp-1', 'sarah');
    var anon = EmberObject.create({ user_name: 'mystery' });
    var _this = this;
    return confirm_view_style_change(state(slp, anon), 'classic').then(function(ok) {
      assert.true(ok, 'proceeds');
      assert.strictEqual(_this.opened.length, 0, 'without prompting');
    });
  });

  test('a missing app state proceeds rather than blocking the control', function(assert) {
    assert.expect(2);
    var _this = this;
    return confirm_view_style_change(null, 'classic').then(function(ok) {
      assert.true(ok, 'proceeds');
      assert.strictEqual(_this.opened.length, 0, 'without prompting');
    });
  });
});
