import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import RSVP from 'rsvp';

/* `invalidate` only clears this device's copy of the token. `sign_out` also ends it on the server,
 * and must always finish signing out on the device, whatever the server does. */
module('Unit | Service | session sign_out', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.session = this.owner.lookup('service:session');
    this.calls = [];
    this.session.set('access_token', 'a-token');
    this.session.invalidate = (force) => { this.calls.push('invalidate:' + force); };
    this.session.persistence = {
      ajax: (url, opts) => {
        this.calls.push(opts.type + ' ' + url);
        return this.reply();
      }
    };
  });

  test('ends the token on the server, then signs out on the device', async function(assert) {
    this.reply = () => RSVP.resolve({ logout: true });
    await this.session.sign_out();
    assert.deepEqual(this.calls, ['DELETE /api/v1/token', 'invalidate:true']);
  });

  test('still signs out on the device when the server call fails', async function(assert) {
    this.reply = () => RSVP.reject({ error: 'offline' });
    await this.session.sign_out();
    assert.deepEqual(this.calls, ['DELETE /api/v1/token', 'invalidate:true']);
  });

  test('still signs out on the device when the server never answers', async function(assert) {
    this.reply = () => new RSVP.Promise(() => {});
    await this.session.sign_out(1);
    assert.deepEqual(this.calls, ['DELETE /api/v1/token', 'invalidate:true']);
  });

  test('signs out once when the answer arrives after the wait', async function(assert) {
    let answer;
    this.reply = () => new RSVP.Promise((resolve) => { answer = resolve; });
    await this.session.sign_out(1);
    answer({ logout: true });
    await RSVP.resolve();
    assert.deepEqual(this.calls, ['DELETE /api/v1/token', 'invalidate:true']);
  });

  test('signs out as the signed-in user, not a user being viewed', async function(assert) {
    this.session.set('as_user_id', 'someone');
    let viewing;
    this.reply = () => { viewing = this.session.get('as_user_id'); return RSVP.resolve({ logout: true }); };
    await this.session.sign_out();
    assert.notOk(viewing, 'cleared before the request, so extras.js adds no X-As-User-Id');
  });

  test('a second press while signing out does nothing more', async function(assert) {
    this.reply = () => RSVP.resolve({ logout: true });
    await RSVP.all([this.session.sign_out(), this.session.sign_out()]);
    assert.deepEqual(this.calls, ['DELETE /api/v1/token', 'invalidate:true']);
  });

  test('makes no server call without a token', async function(assert) {
    this.session.set('access_token', null);
    this.reply = () => RSVP.resolve({});
    await this.session.sign_out();
    assert.deepEqual(this.calls, ['invalidate:true']);
  });
});
