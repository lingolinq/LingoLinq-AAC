import { module, test } from 'qunit';
import { setupTest } from '../../helpers';

/* "LOGS" MEANS THE FULL LOG; "UPDATES" MEANS MESSAGES ONLY.
 *
 * Those are two different entry points to the same route, and they are deliberately kept
 * apart: the account rail's Logs row (components/account-rail.hbs) passes NO query, while the
 * Updates pill (components/user-pill-nav.hbs, components/dashboard/authenticated-view.hbs)
 * passes `type=note`.
 *
 * WHAT BROKE THAT. Ember query params are sticky — the controller's value carries into the
 * next visit that does not state one. `reset_params` runs on exit (routes/user/logs.js, in
 * `resetController`) and used to null every param and then set `type` back to 'note', which
 * is NOT the declared default. So after one visit through Updates, the rail's un-queried Logs
 * row inherited 'note' and landed on messages-only, with a `?type=note` in the URL that no
 * link contains. Measured in a browser, in-app clicks only, before the fix.
 *
 * AND IT WROTE TO THE USER RECORD. The mark-as-read block (~:185) is gated on
 * `type == 'note'` alone — it does not care how you arrived — so the stale filter made
 * clicking "Logs" persist `last_message_read`. Two `PUT /users/...` were observed on that
 * click.
 *
 * FOUR entry points omit `type`, not one -- an earlier version of this comment said one,
 * because the grep behind it only covered templates and missed programmatic navigation:
 *   - components/account-rail.hbs (the rail's Logs row, no @query)
 *   - components/dashboard/classic-view.js#load_sessions
 *   - controllers/user/board-detail.js (the board menu's `sessions` item)
 *   - components/eval-quick-screen.js, after saving an eval
 * All four want the full log, so all four were wrong in the same way, and the two that use
 * `user_name` shared the rail's cache bucket and so shared its exact symptom. Every link
 * that wants messages states `type="note"` itself, so none of them is affected by this.
 *
 * ONLY NAMED IN-APP TRANSITIONS HYDRATE. A bookmark, a reload, a typed URL or the Back
 * button go through a different path and always got the default -- which is why the first
 * attempt to reproduce this with a full page load returned a confident false negative.
 *
 * A fresh session was already correct; this makes every later visit behave like the first.
 */
module('Unit | Controller | user/logs reset_params', function(hooks) {
  setupTest(hooks);

  function logs(context) {
    return context.owner.lookup('controller:user/logs');
  }

  test('the declared default for type is null, i.e. the full log', function(assert) {
    assert.strictEqual(logs(this).get('type'), null,
      'an untouched controller filters nothing');
  });

  /* THE RED TEST. Before the fix this returned 'note'. */
  test('leaving the page forgets the filter instead of remembering "messages only"', function(assert) {
    var c = logs(this);
    c.set('type', 'note');
    c.reset_params();
    assert.strictEqual(c.get('type'), null,
      'exit must leave type at its default, or it leaks into the next un-queried visit');
  });

  test('every other query param is cleared on exit too', function(assert) {
    var c = logs(this);
    ['start', 'end', 'highlighted', 'device_id', 'location_id', 'nav'].forEach((p) => c.set(p, 'x'));
    c.reset_params();
    assert.expect(6);
    ['start', 'end', 'highlighted', 'device_id', 'location_id', 'nav'].forEach((p) => {
      assert.strictEqual(c.get(p), null, p + ' is cleared');
    });
  });

  /* The consequence the contract actually cares about, asserted on the computeds the
     template renders from rather than on `type` alone. */
  test('after exit the page would render the full log, not messages only', function(assert) {
    assert.expect(2);
    var c = logs(this);
    c.set('type', 'note');
    c.reset_params();
    assert.false(c.get('messages_only'), 'not filtered to messages');
    assert.true(c.get('all_logs'), 'showing the full log');
  });

  /* The Updates pill states its filter explicitly, so it must be unaffected by any of this. */
  test('an explicit type=note still filters to messages', function(assert) {
    assert.expect(2);
    var c = logs(this);
    c.set('type', 'note');
    assert.true(c.get('messages_only'), 'Updates still shows messages only');
    assert.false(c.get('all_logs'), 'and is not the full log');
  });
});
