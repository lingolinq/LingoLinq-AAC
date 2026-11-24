import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import RSVP from 'rsvp';

/* `restore` with no stored token starts a "session lost" recovery that ends in `invalidate` or
 * `force_logout`. In the installed app that recovery waits on a native file lookup, so it can finish
 * after a new login has been stored, and would erase it (#1204). */
module('Unit | Service | session override and lost-session recovery', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    const session = this.session = this.owner.lookup('service:session');
    const stored = this.stored = {};
    const calls = this.calls = [];
    this.lookups = [];
    this.flushed = RSVP.defer();
    session._logout_landing = false;
    session.set('auth_settings_fallback_data', null);
    session.invalidate = () => { calls.push('invalidate'); };
    session.force_logout = () => { calls.push('force_logout'); };
    session.check_token = () => {};
    session.reload = (path) => { calls.push('reload ' + path); };
    session.persistence = { get: () => false, tokens: {} };
    session.stashes = this.stashes = {
      get: (key) => key === 'enabled',
      get_object: (key) => stored[key] || null,
      get_db_id: () => { const lookup = RSVP.defer(); this.lookups.push(lookup); return lookup.promise; },
      flush: () => { delete stored.auth_settings; return this.flushed.promise; },
      setup: () => {},
      persist_object: (key, data) => { stored[key] = data; return RSVP.resolve(); }
    };
    this.answer_lookups = async (db_id) => {
      this.lookups.forEach((lookup) => lookup.resolve({ db_id: db_id }));
      await settle();
    };
  });

  async function settle() {
    for(let idx = 0; idx < 6; idx++) { await RSVP.resolve(); }
  }

  const meta = { access_token: 'new-token', user_name: 'student', user_id: '1_1' };

  // `early`: a restore that was already waiting on its lookup when override ran.
  [false, true].forEach(function(early) {
    [null, 'someone'].forEach(function(db_id) {
      const when = (early ? ', earlier restore pending' : '') + (db_id ? ', device remembers a user' : '');

      test('a lookup that ends after the new login is stored does not undo it' + when, async function(assert) {
        if(early) { this.session.restore(); }
        this.session.override(meta);
        this.flushed.resolve();
        await settle();
        await this.answer_lookups(db_id);
        assert.deepEqual(this.calls, ['reload /']);
        assert.deepEqual(this.stored.auth_settings, meta);
      });

      test('a lookup that ends while the old data is being cleared does not undo it' + when, async function(assert) {
        if(early) { this.session.restore(); }
        this.session.override(meta);
        await this.answer_lookups(db_id);
        this.flushed.resolve();
        await settle();
        assert.deepEqual(this.calls, ['reload /']);
        assert.deepEqual(this.stored.auth_settings, meta);
      });
    });
  });

  test('a stored login that has lost its token does not undo it', async function(assert) {
    this.stored.auth_settings = { user_name: 'someone' };
    this.session.override(meta);
    this.flushed.resolve();
    await settle();
    assert.deepEqual(this.calls, ['reload /']);
    assert.deepEqual(this.stored.auth_settings, meta);
  });

  test('a login stored while the lookup was pending is kept', async function(assert) {
    this.session.restore();
    this.stored.auth_settings = meta;
    await this.answer_lookups(null);
    assert.deepEqual(this.calls, []);
  });

  test('a login held only in memory while the lookup was pending is kept', async function(assert) {
    this.session.restore();
    this.session.set('auth_settings_fallback_data', meta);
    await this.answer_lookups(null);
    assert.deepEqual(this.calls, []);
  });

  test('a session that is really lost still recovers', async function(assert) {
    this.session.restore();
    await this.answer_lookups(null);
    assert.deepEqual(this.calls, ['invalidate'], 'no earlier user');
    this.session.restore();
    await this.answer_lookups('someone');
    assert.deepEqual(this.calls, ['invalidate', 'force_logout'], 'an earlier user is told to log back in');
  });
});
