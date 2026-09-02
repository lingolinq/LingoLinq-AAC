import { module, test } from 'qunit';
import { setupTest } from 'frontend/tests/helpers';
import RSVP from 'rsvp';
import EmberObject from '@ember/object';
import modal from 'frontend/utils/modal';

/*
 * LL-104bfa61dc + LL-53cb93fab1. These call the real setupController on
 * routes/index and routes/bento so a comment-only or helper-only change
 * cannot satisfy the assertions.
 */
function makeModel(overrides) {
  return EmberObject.create(Object.assign({
    id: '1_1',
    user_name: 'tester',
    terms_agree: false,
    really_fresh: true,
    eval_ended: false,
    currently_premium: false,
    supporter_view: false,
    has_management_responsibility: false,
    preferences: {},
    reload: function() { return RSVP.resolve(this); }
  }, overrides || {}));
}

module('Unit | Route | terms-agree gate (index + bento)', function(hooks) {
  setupTest(hooks);

  var originalOpen;
  var opens;

  hooks.beforeEach(function() {
    originalOpen = modal.open;
    opens = [];
    modal.open = function(template, options) {
      opens.push({ template: template, options: options || {} });
      return RSVP.resolve();
    };
  });

  hooks.afterEach(function() {
    modal.open = originalOpen;
  });

  function runSetup(routeName, model, showIntro) {
    var route = this.owner.lookup('route:' + routeName);
    var controller = this.owner.lookup('controller:' + routeName);
    var appState = this.owner.lookup('service:app-state');
    var store = this.owner.lookup('service:store');
    // setupController kicks off public-board queries when unauthenticated;
    // those .then() handlers set homeBoards after this test tears down.
    store.query = function() {
      return new RSVP.Promise(function() { /* never settle */ });
    };
    appState.set('show_intro', !!showIntro);
    appState.set('_index_login_entry', false);
    route.setupController(controller, model);
    return opens;
  }

  test('index really_fresh path opens terms-agree with scannable: true', function(assert) {
    var model = makeModel({ really_fresh: true });
    runSetup.call(this, 'index', model, false);
    var terms = opens.filter(function(o) { return o.template === 'terms-agree'; });
    assert.strictEqual(terms.length, 1, 'opens terms-agree once');
    assert.true(terms[0].options.scannable, 'scannable is true');
  });

  test('bento really_fresh path opens terms-agree with scannable: true', function(assert) {
    var model = makeModel({ really_fresh: true });
    runSetup.call(this, 'bento', model, false);
    var terms = opens.filter(function(o) { return o.template === 'terms-agree'; });
    assert.strictEqual(terms.length, 1, 'opens terms-agree once');
    assert.true(terms[0].options.scannable, 'scannable is true');
  });

  test('index reload path opens terms-agree with scannable: true', async function(assert) {
    var model = makeModel({ really_fresh: false });
    var persistence = this.owner.lookup('service:persistence');
    persistence.set('online', true);
    runSetup.call(this, 'index', model, false);
    await RSVP.resolve();
    var terms = opens.filter(function(o) { return o.template === 'terms-agree'; });
    assert.strictEqual(terms.length, 1, 'opens terms-agree after reload');
    assert.true(terms[0].options.scannable, 'scannable is true');
  });

  test('bento reload path opens terms-agree with scannable: true', async function(assert) {
    var model = makeModel({ really_fresh: false });
    var persistence = this.owner.lookup('service:persistence');
    persistence.set('online', true);
    runSetup.call(this, 'bento', model, false);
    await RSVP.resolve();
    var terms = opens.filter(function(o) { return o.template === 'terms-agree'; });
    assert.strictEqual(terms.length, 1, 'opens terms-agree after reload');
    assert.true(terms[0].options.scannable, 'scannable is true');
  });

  test('index really_fresh + show_intro opens terms-agree and not intro', function(assert) {
    var model = makeModel({ really_fresh: true });
    runSetup.call(this, 'index', model, true);
    var names = opens.map(function(o) { return o.template; });
    assert.ok(names.indexOf('terms-agree') !== -1, 'terms-agree opens');
    assert.ok(names.indexOf('intro') === -1, 'intro is deferred (LL-53cb93fab1)');
  });

  test('bento really_fresh + show_intro opens terms-agree and not intro', function(assert) {
    var model = makeModel({ really_fresh: true });
    runSetup.call(this, 'bento', model, true);
    var names = opens.map(function(o) { return o.template; });
    assert.ok(names.indexOf('terms-agree') !== -1, 'terms-agree opens');
    assert.ok(names.indexOf('intro') === -1, 'intro is deferred (LL-53cb93fab1)');
  });

  test('index show_intro still opens intro when terms already agreed', function(assert) {
    var model = makeModel({ terms_agree: true, really_fresh: true });
    runSetup.call(this, 'index', model, true);
    var names = opens.map(function(o) { return o.template; });
    assert.ok(names.indexOf('intro') !== -1, 'intro still opens when terms_agree is true');
    assert.ok(names.indexOf('terms-agree') === -1, 'terms-agree is not opened');
  });
});
