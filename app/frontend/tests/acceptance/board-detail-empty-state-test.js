import { setupApplicationTest } from 'ember-qunit';
import { setupMirage } from 'ember-cli-mirage/test-support';
import { visit } from '@ember/test-helpers';
import * as QUnit from 'qunit';

// Smoke test — proves registration + runner wiring. If this passes and the
// application-boot tests below hang, the infrastructure is healthy; the hang is
// about app-specific async setup (session, persistence bootstrap, etc.) that
// future work needs to mock/stub before `visit()` resolves.
QUnit.module('Acceptance | smoke', function() {
  QUnit.test('smoke: arithmetic works', function(assert) {
    assert.strictEqual(1 + 1, 2, 'basic arithmetic — proves QUnit.test registers and runs via testem');
  });
});

// These previously hung on `visit(...)`. The cause was NOT the session/auth
// bootstrap it was assumed to be: app_state#refresh_user re-scheduled itself
// every 15 minutes with `runLater`, which Ember's test waiters track, so the app
// never reached a settled state. That reschedule is now skipped under
// isTesting() (services/app-state.js), and mirage/config.js was migrated to the
// Mirage 3 signature with the models/handlers the boot chain actually requests.
QUnit.module('Acceptance | board-detail empty state', function(hooks) {
  setupApplicationTest(hooks);
  setupMirage(hooks);

  QUnit.test('shows the empty-state message and Edit CTA when board has no visible buttons', async function(assert) {
    // Booting the real app costs more than QUnit's 15s default: edit_manager's
    // `resume_scanning` retries via runLater on a 100ms..900ms backoff (~4.5s of
    // waiter-tracked timers) and that runs per render pass. Raise the ceiling for
    // acceptance tests that mount the whole app rather than trimming app behavior
    // to suit the harness.
    assert.timeout(60000);
    this.server.create('user', { user_name: 'tester' });
    this.server.create('board', {
      key: 'tester/empty',
      user_name: 'tester',
      buttons: [],
      grid: {
        rows: 3,
        columns: 4,
        order: [
          [null, null, null, null],
          [null, null, null, null],
          [null, null, null, null]
        ]
      },
      permissions: { view: true, edit: true }
    });

    await visit('/tester/board-detail/empty');

    assert.dom('.md-board-detail-empty-board').exists('empty-state block renders');
    assert.dom('.md-board-detail-empty-board p').includesText("hasn't been set up yet",
      'empty-state message is shown');
    assert.dom('.md-board-detail-empty-board button').hasText(/Edit this Board/i,
      'Edit this Board CTA is visible for users with edit permission');
  });

  QUnit.test('hides the Edit CTA when the user does not have edit permission', async function(assert) {
    assert.timeout(60000);
    this.server.create('user', { user_name: 'viewer' });
    // Key and owner must match the visited path — Mirage looks the board up by
    // `<user_name>/<boardname>` from the URL. This fixture said `tester/...`
    // while the test visited `/viewer/...`, so the lookup 404'd. The test had
    // never been run (it was skipped), so the mismatch went unnoticed.
    this.server.create('board', {
      key: 'viewer/view-only-empty',
      user_name: 'viewer',
      buttons: [],
      grid: {
        rows: 3,
        columns: 4,
        order: [
          [null, null, null, null],
          [null, null, null, null],
          [null, null, null, null]
        ]
      },
      permissions: { view: true, edit: false }
    });

    await visit('/viewer/board-detail/view-only-empty');

    assert.dom('.md-board-detail-empty-board').exists('empty-state block renders');
    assert.dom('.md-board-detail-empty-board p').includesText("hasn't been set up yet",
      'message still shown for view-only users');
    assert.dom('.md-board-detail-empty-board button').doesNotExist(
      'no Edit CTA when permission is missing');
  });
});
