import { setupRenderingTest } from 'frontend/tests/helpers';
import { render, click } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import EmberObject from '@ember/object';
import * as QUnit from 'qunit';
import lingoLinqExtras from 'frontend/utils/extras';
import modal from 'frontend/utils/modal';
import i18n from 'frontend/utils/i18n';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';

/*
 * The Modern home "Sync failed" notice (authenticated-view.hbs). The sentence is the live
 * region; the card and its buttons are a normal section. Try Again starts a sync, which
 * removes the notice, so focus moves to the dashboard. Sync Details opens the details modal.
 */
QUnit.module('Integration | Component | sync failed notice', function(hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function() {
    this.persistence = this.owner.lookup('service:persistence');
    this.stashes = this.owner.lookup('service:stashes');
    this.appState = this.owner.lookup('service:app-state');
    this.saved = {
      ready: lingoLinqExtras.get('ready'),
      sync_status: this.persistence.get('sync_status'),
      sync_status_error: this.persistence.get('sync_status_error'),
      online: this.persistence.get('online'),
      last_sync_status: this.stashes.get('last_sync_status')
    };
    lingoLinqExtras.set('ready', true);
    this.persistence.set('online', true);
    this.persistence.set('sync_status', 'failed');
    this.persistence.set('sync_status_error', i18n.t('online_required_to_sync', "Must be online to sync."));
    this.stashes.set('last_sync_status', 'failed');
    this.appState.set('currentUser', EmberObject.create({
      user_name: 'ada',
      preferences: {},
      pending_org: { name: 'Test Org' }
    }));
  });

  hooks.afterEach(function() {
    restoreStubs();
    this.persistence.set('sync_status', this.saved.sync_status);
    this.persistence.set('sync_status_error', this.saved.sync_status_error);
    this.persistence.set('online', this.saved.online);
    this.stashes.set('last_sync_status', this.saved.last_sync_status);
    lingoLinqExtras.set('ready', this.saved.ready);
  });

  QUnit.test('the failure sentence is the live region, and it ends with a period', async function(assert) {
    await render(hbs`<Dashboard::AuthenticatedView />`);
    var card = document.querySelector('[data-test-sync-failed-notice]');
    var sentence = document.getElementById('sync-failed-notice-text');
    var approval = document.getElementById('pending-org-notice');
    assert.ok(card, 'the notice renders');
    assert.strictEqual(card.getAttribute('role'), null, 'the card is not a live region');
    assert.strictEqual(card.getAttribute('aria-labelledby'), 'sync-failed-notice-text');
    assert.strictEqual(sentence.getAttribute('role'), 'status', 'only the sentence is announced');
    assert.notStrictEqual(sentence.textContent.indexOf('Must be online to sync.'), -1, 'the error is its own sentence');
    assert.ok(approval, 'the approval notice renders with it');
    assert.strictEqual(approval.getAttribute('role'), 'status');
    assert.strictEqual(approval.closest('section').getAttribute('role'), null, 'the approval card is not a live region');
  });

  QUnit.test('Sync Details opens the sync details modal', async function(assert) {
    var opened = [];
    stub(modal, 'open', function(name) { opened.push(name); });
    await render(hbs`<Dashboard::AuthenticatedView />`);
    await click('[data-test-sync-failed-notice] .md-btn--ghost');
    assert.deepEqual(opened, ['sync-details']);
  });

  QUnit.test('Try Again starts a sync and leaves focus on the dashboard', async function(assert) {
    var syncs = 0;
    this.persistence.sync = function() {
      syncs = syncs + 1;
      this.set('sync_status', 'syncing');
      return Promise.resolve();
    }.bind(this.persistence);
    await render(hbs`<Dashboard::AuthenticatedView />`);
    await click('[data-test-sync-failed-notice] .md-btn--primary');
    assert.strictEqual(syncs, 1, 'Try Again starts a sync');
    var focusedId = document.activeElement ? document.activeElement.id : null;
    assert.strictEqual(focusedId, 'dashboard-main');
  });
});
