import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';
import stashes from 'frontend/utils/_stashes';

/*
 * The Alerts modal is opened with `scannable: true` from the speak menu
 * (components/speak-menu.js:655, controllers/speak-menu.js:165), so a switch
 * user drives it entirely through the scanner.
 *
 * utils/modal.js#scannable_targets scopes its query to descendants of a
 * `.modal_targets` container -- only `.la-modal-close` is matched unscoped:
 *
 *   .modal-dialog .modal_targets .btn, ... a, ..., .modal-dialog .la-modal-close
 *
 * inbox.hbs put `modal_targets` on the modal-BODY, while the footer is a
 * SIBLING of the body. So every footer control -- Speak, Reply, Back, Clear
 * All, Close, and critically Accept Pairing / Cancel Pairing -- fell outside
 * the query. Only the header x was reachable.
 *
 * Why the footer count is the instrument: no body branch except the alerts
 * list contains a `.btn` at all (pair-request, message detail, loading, error
 * and empty are <p>/<img>/<span> only), and a rendering test cannot produce
 * alerts -- there is no referenced_user, so persistence.fetch_inbox rejects
 * and the error branch renders. Whatever the body does, it contributes zero.
 * A non-zero count here therefore comes from the footer and nowhere else.
 *
 * Asserted as an EXACT count, not `.exists()`: a >0 assertion would also pass
 * against the old body-only markup as soon as any alert row existed, which is
 * the bug this pins.
 *
 * Assert against the utils/modal.js selector, NOT services/modal.js#scannableTargets
 * -- the latter is a drifted dead copy (it lacks the .la-modal-close clause) and
 * utils/scanner.js:206 calls only the former.
 */
QUnit.module('Integration | inbox footer scannable', function(hooks) {
  setupRenderingTest(hooks);

  QUnit.test('footer controls sit inside the scanner region', async function(assert) {
    assert.expect(3);
    // Guarantees the footer's optional compose button does not render, so the
    // expected count is exactly Clear All + Close.
    stashes.set('working_vocalization', []);
    try {
      // `render` already awaits settled(); a second call right after is a no-op.
      await render(hbs`<Inbox />`);

      assert.dom('.modal-dialog .modal_targets').exists('scanner container is present');
      assert.dom('.modal-dialog .la-inbox-modal-footer .btn').exists({ count: 2 },
        'precondition: the footer renders Clear All and Close');
      assert.strictEqual(
        document.querySelectorAll('.modal-dialog .modal_targets .btn').length,
        2,
        'both footer controls are reachable by utils/modal.js#scannable_targets'
      );
    } finally {
      stashes.set('working_vocalization', []);
    }
  });
});
