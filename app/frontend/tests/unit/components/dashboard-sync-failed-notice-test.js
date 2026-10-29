import { module, test } from 'qunit';
import Service from '@ember/service';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';
import lingoLinqExtras from 'frontend/utils/extras';
import capabilities from 'frontend/utils/capabilities';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';

/* The sync-failed notice on the Modern home page (components/dashboard/authenticated-view.js
 * #sync_failed_notice). Automatic syncs fail quietly (no popup), and two failures in a row pause
 * automatic sync for 48 hours (services/persistence.js, the failure branch of sync), so without
 * this notice a Modern view user never learns the boards are not ready offline. The failure is
 * read from `sync_status` during the session and from the stashed `last_sync_status` after a
 * reload, when `sync_status` starts empty again. */
module('Unit | Component | dashboard sync failed notice', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.persistence = this.owner.lookup('service:persistence');
    this.stashes = this.owner.lookup('service:stashes');
    this.saved = {
      ready: lingoLinqExtras.get('ready'),
      sync_status: this.persistence.get('sync_status'),
      last_sync_status: this.stashes.get('last_sync_status')
    };
    lingoLinqExtras.set('ready', true);
  });

  hooks.afterEach(function() {
    restoreStubs();
    this.persistence.set('sync_progress', null);
    this.persistence.set('sync_status', this.saved.sync_status);
    this.stashes.set('last_sync_status', this.saved.last_sync_status);
    lingoLinqExtras.set('ready', this.saved.ready);
  });

  function home(context) {
    return context.owner.factoryFor('component:dashboard/authenticated-view').create();
  }

  function state(context, sync_status, last_sync_status) {
    context.persistence.set('sync_status', sync_status);
    context.stashes.set('last_sync_status', last_sync_status);
  }

  test('shows after a sync fails in this session', function(assert) {
    state(this, 'failed', 'failed');
    assert.true(home(this).get('sync_failed_notice'));
  });

  test('still shows after a reload when the last sync on this device failed', function(assert) {
    state(this, null, 'failed');
    assert.true(home(this).get('sync_failed_notice'));
  });

  test('hidden when the last sync succeeded or finished with some board errors', function(assert) {
    state(this, null, 'succeeded');
    assert.false(home(this).get('sync_failed_notice'), 'after a success');
    state(this, null, 'finished');
    assert.false(home(this).get('sync_failed_notice'), 'after a partial success');
    state(this, null, null);
    assert.false(home(this).get('sync_failed_notice'), 'before any sync');
  });

  test('hidden while a new sync runs, and gone once it succeeds', function(assert) {
    var c = home(this);
    state(this, 'syncing', 'failed');
    assert.false(c.get('sync_failed_notice'), 'during the retry');
    state(this, 'succeeded', 'succeeded');
    assert.false(c.get('sync_failed_notice'), 'after it succeeds');
    state(this, 'failed', 'failed');
    assert.true(c.get('sync_failed_notice'), 'back when it fails again');
  });

  test('hidden for an account that uses an external device, which never syncs here', function(assert) {
    this.owner.unregister('service:app-state');
    this.owner.register('service:app-state', Service.extend({
      currentUser: EmberObject.create({ preferences: {}, supervisees: [], external_device: true }),
      feature_flags: {}
    }));
    state(this, 'failed', 'failed');
    assert.false(home(this).get('sync_failed_notice'));
  });

  // After a sign-out that skips the reload, the open database is still the previous user's: their
  // failure is not this user's, and "Try Again" would sync into that database
  // (services/persistence.js, local_db_is_current_user).
  test('hidden while the open database belongs to another user', function(assert) {
    stub(this.stashes, 'get_object', function(key) { return key === 'auth_settings' ? {user_name: 'ada'} : null; });
    state(this, 'failed', 'failed');
    stub(capabilities, 'db_name', 'lingolinqStorage::bob===db');
    assert.false(home(this).get('sync_failed_notice'), 'another user\'s database');
    stub(capabilities, 'db_name', 'lingolinqStorage::ada===db');
    assert.true(home(this).get('sync_failed_notice'), 'this user\'s database');
  });

  // Cancelling a sync ends in its failure branch; the user stopped it, so it is not reported.
  test('hidden after the user cancels a sync', function(assert) {
    this.persistence.set('sync_progress', {root_user: 'ada'});
    this.persistence.cancel_sync();
    state(this, 'failed', 'failed');
    assert.false(home(this).get('sync_failed_notice'));
  });
});
