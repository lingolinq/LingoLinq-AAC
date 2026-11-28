import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';
import { settled } from '@ember/test-helpers';
import RSVP from 'rsvp';
import LingoLinq from 'frontend/app';
import sync from 'frontend/utils/sync';
import utterance from 'frontend/utils/utterance';
import modal from 'frontend/utils/modal';
import { utteranceRefreshPending, waitForUtteranceRefresh } from '../../helpers/utterance-refresh';

/* `app-state#sync_send_utterance` observes `stashes.working_vocalization` and runs inline when the
 * sentence changes, inside `activate_button`. A throw there ends the button press before its speech
 * and usage log, so these tests drive it through a real sentence change. */
module('Unit | Service | app-state sync_send_utterance', function(hooks) {
  setupTest(hooks);
  hooks.afterEach(function() { if (utteranceRefreshPending()) { return waitForUtteranceRefresh(); } });

  hooks.beforeEach(function() {
    this.svc = this.owner.lookup('service:app-state');
    this.stashes = this.owner.lookup('service:stashes');
    this.encrypted = [];
    this.updates = [];
    this.pending = [];
    this.saved = { store: LingoLinq.store, persistence: window.persistence, send_update: sync.send_update, con: sync.con };
    this.open = true;
    sync.con = {
      connection: { isOpen: () => this.open },
      subscriptions: { subscriptions: [{ user_id: '1_1', send() {} }] }
    };
    LingoLinq.store = this.owner.lookup('service:store');
    window.persistence = {
      ajax: (url, opts) => {
        this.encrypted.push({ url: url, text: opts.data.text });
        return new RSVP.Promise((resolve) => { this.pending.push(resolve); });
      }
    };
    sync.send_update = (user_id, extra) => {
      // check_scanning sends a bare update on a timer; only updates carrying data are under test
      if(extra) { this.updates.push({ user_id: user_id, extra: extra }); }
      return RSVP.resolve();
    };
    this.communicator = (preferences) => {
      const user = EmberObject.create({ id: '1_1', preferences: preferences, reload() { return RSVP.resolve(this); } });
      this.svc.set('sessionUser', user);
      this.svc.set('currentUser', user);
    };
    this.say = (label) => { this.stashes.persist('working_vocalization', [{ label: label }]); };
  });

  hooks.afterEach(function() {
    this.svc.set('sessionUser', null);
    this.stashes.persist('working_vocalization', []);
    sync.con = this.saved.con;
    LingoLinq.store = this.saved.store;
    window.persistence = this.saved.persistence;
    sync.send_update = this.saved.send_update;
  });

  test('a changed sentence is encrypted and sent when followers are automatically allowed', async function(assert) {
    this.communicator({ remote_modeling: true, remote_modeling_auto_follow: true });
    this.say('hello');
    assert.strictEqual(this.encrypted.length, 1, 'asked the server to encrypt the sentence');
    assert.strictEqual(this.encrypted[0].url, '/api/v1/users/1_1/ws_encrypt');
    assert.true(this.encrypted[0].text.includes('hello'), 'the sentence is what was encrypted');
    this.pending[0]({ encoded: 'secret' });
    await settled();
    assert.deepEqual(this.updates, [{ user_id: '1_1', extra: { utterance: 'secret' } }], 'sent to the room');
    assert.strictEqual(this.svc.get('sync_utterance.encoded'), 'secret', 'kept for the keepalive');
  });

  test('a paired communicator sends the sentence too', async function(assert) {
    this.communicator({ remote_modeling: true });
    this.svc.set('pairing', { model: true, user_id: '1_2' });
    this.say('hello');
    this.pending[0]({ encoded: 'secret' });
    await settled();
    assert.deepEqual(this.updates.map((u) => u.extra), [{ utterance: 'secret' }]);
  });

  test('an unchanged sentence reuses the encrypted copy', async function(assert) {
    this.communicator({ remote_modeling: true, remote_modeling_auto_follow: true });
    this.say('hello');
    this.pending[0]({ encoded: 'secret' });
    await settled();
    this.svc.sync_send_utterance();
    assert.strictEqual(this.encrypted.length, 1, 'no second encrypt request');
    assert.deepEqual(this.updates.map((u) => u.extra), [{ utterance: 'secret' }, { utterance: 'secret' }]);
  });

  test('an encrypted copy of an out-of-date sentence is not sent', async function(assert) {
    this.communicator({ remote_modeling: true, remote_modeling_auto_follow: true });
    this.say('hello');
    this.say('goodbye');
    this.pending[0]({ encoded: 'old' });
    this.pending[1]({ encoded: 'new' });
    await settled();
    assert.deepEqual(this.updates.map((u) => u.extra), [{ utterance: 'new' }]);
  });

  test('nothing is sent while remote modeling is off', function(assert) {
    this.communicator({ remote_modeling: false, remote_modeling_auto_follow: true });
    this.say('hello');
    assert.strictEqual(this.encrypted.length, 0);
  });

  test('the sentence stays on the device when no relay is connected', function(assert) {
    sync.con = null;
    this.communicator({ remote_modeling: true, remote_modeling_auto_follow: true });
    this.say('hello');
    assert.strictEqual(this.encrypted.length, 0);
  });

  test('a supporter view sends nothing', function(assert) {
    this.communicator({ remote_modeling: true, remote_modeling_auto_follow: true });
    this.svc.set('sessionUser.supporter_view', true);
    this.say('hello');
    assert.strictEqual(this.encrypted.length, 0);
  });

  test('followers allowed for this session also send the sentence', function(assert) {
    this.communicator({ remote_modeling: true });
    this.svc.set('followers', { allowed: true });
    this.say('hello');
    assert.strictEqual(this.encrypted.length, 1);
  });

  test('a failed encrypt sends nothing and does not throw', async function(assert) {
    window.persistence.ajax = () => RSVP.reject({ error: 'nope' });
    this.communicator({ remote_modeling: true, remote_modeling_auto_follow: true });
    this.say('hello');
    await settled();
    assert.deepEqual(this.updates, []);
  });

  test('a closed connection keeps the sentence on the device', function(assert) {
    this.open = false;
    this.communicator({ remote_modeling: true, remote_modeling_auto_follow: true });
    this.say('hello');
    assert.strictEqual(this.encrypted.length, 0);
  });

  test('a connection without this room keeps the sentence on the device', function(assert) {
    sync.con.subscriptions.subscriptions = [];
    this.communicator({ remote_modeling: true, remote_modeling_auto_follow: true });
    this.say('hello');
    assert.strictEqual(this.encrypted.length, 0);
  });

  test('a repeat firing while encrypting makes one request', async function(assert) {
    this.communicator({ remote_modeling: true, remote_modeling_auto_follow: true });
    this.say('hello');
    this.svc.sync_send_utterance();
    this.svc.sync_send_utterance();
    assert.strictEqual(this.encrypted.length, 1);
    this.pending[0]({ encoded: 'secret' });
    await settled();
    assert.deepEqual(this.updates.map((u) => u.extra), [{ utterance: 'secret' }]);
  });

  test('a failed encrypt can be tried again', async function(assert) {
    const ajax = window.persistence.ajax;
    window.persistence.ajax = () => RSVP.reject({ error: 'nope' });
    this.communicator({ remote_modeling: true, remote_modeling_auto_follow: true });
    this.say('hello');
    await settled();
    window.persistence.ajax = ajax;
    this.svc.sync_send_utterance();
    assert.strictEqual(this.encrypted.length, 1);
  });

  test('a sentence changed while sharing is off is not replaced by the old copy', async function(assert) {
    this.communicator({ remote_modeling: true, remote_modeling_auto_follow: true });
    this.say('hello');
    this.pending[0]({ encoded: 'old' });
    await settled();
    this.svc.set('sessionUser.preferences.remote_modeling_auto_follow', false);
    this.say('goodbye');
    assert.strictEqual(this.svc.get('sync_utterance.encoded'), undefined, 'the old copy is gone, so a keepalive cannot send it');
  });

  test('sharing leaves no records in the store', async function(assert) {
    this.communicator({ remote_modeling: true, remote_modeling_auto_follow: true });
    this.say('hello');
    this.pending[0]({ encoded: 'secret' });
    await settled();
    assert.strictEqual(LingoLinq.store.peekAll('utterance').length, 0);
  });

  module('a button press', function(hooks) {
    hooks.beforeEach(function() {
      this.logged = [];
      this.spoken = [];
      this.pressSaved = { log: this.stashes.log, speak: utterance.speak_button, raw: utterance.get('rawButtonList'), flash: modal.flash, notice: modal.notice, warning: modal.warning };
      // Entering speak mode raises flash messages, which throw outside a rendered app
      modal.flash = modal.notice = modal.warning = () => {};
      this.stashes.log = (obj) => { this.logged.push(obj.label); };
      // The first word of a sentence is capitalized
      utterance.speak_button = (button) => { this.spoken.push(button.label.toLowerCase()); };
      utterance.set('rawButtonList', []);
      this.press = (button) => this.svc.activate_button(button, { label: 'hello', button_id: 1, board: { id: '1_1', key: 'a/b' }, type: 'speak' });
      this.speakMode = () => {
        this.communicator({ remote_modeling: false, vocalize_buttons: true });
        this.stashes.persist('current_mode', 'speak');
        this.svc.set('speak_mode', true);
      };
    });

    hooks.afterEach(function() {
      this.stashes.log = this.pressSaved.log;
      utterance.speak_button = this.pressSaved.speak;
      modal.flash = this.pressSaved.flash;
      modal.notice = this.pressSaved.notice;
      modal.warning = this.pressSaved.warning;
      utterance.set('rawButtonList', this.pressSaved.raw);
      this.stashes.persist('current_mode', null);
    });

    test('finishes and is logged while the sentence is shared', function(assert) {
      this.communicator({ remote_modeling: true, remote_modeling_auto_follow: true });
      this.press({ label: 'hello' });
      assert.deepEqual(this.logged, ['hello']);
      assert.deepEqual(this.updates.map((u) => Object.keys(u.extra)), [['button']], 'the press reached the room');
    });

    test('with a known recorded sound is spoken and logged', function(assert) {
      this.speakMode();
      this.press({ label: 'hello', sound_url: 'https://example.com/hello.mp3' });
      assert.deepEqual(this.spoken, ['hello']);
      assert.deepEqual(this.logged, ['hello']);
    });

    test('with a sound still loading is logged at once and spoken once it loads', async function(assert) {
      this.speakMode();
      let loaded;
      this.press({ label: 'hello', sound_id: '1_9', load_sound: () => new RSVP.Promise((resolve) => { loaded = resolve; }) });
      assert.deepEqual(this.logged, ['hello'], 'logged without waiting for the sound');
      assert.deepEqual(this.spoken, [], 'speech waits for the sound');
      loaded({ url: 'https://example.com/hello.mp3' });
      await settled();
      assert.deepEqual(this.spoken, ['hello']);
    });
  });
});
