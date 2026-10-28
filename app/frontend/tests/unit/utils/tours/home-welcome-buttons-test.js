import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import EmberObject from '@ember/object';
import { buildHomeSteps } from 'frontend/utils/tours/home';
import { buildClassicHomeSteps } from 'frontend/utils/tours/classic-home';
import { start_talking_now, STARTER_BOARD_KEY } from 'frontend/utils/tours/start_talking';

/* THE COMMUNICATOR WELCOME (tour redesign, 2026-10-12: docs/task-management/2026-10-12_tour-redesign.md).
   "One clear welcome: a primary Start talking now button with the board picture and 'We'll set up Vocal
   Flair 60. You can change it anytime.' Add a secondary Choose a different board and a small Take a quick
   tour (1 min) link." The board choices are found by their ACTIONS, not their wording. */
module('Unit | Utility | tours | communicator welcome', function(hooks) {
  setupTest(hooks);
  var text = function(html) {
    var d = document.createElement('div'); d.innerHTML = html.replace(/<br\s*\/?>/gi, ' ');
    return d.textContent.replace(/\s+/g, ' ').trim();
  };
  var actions = function(html) {
    var d = document.createElement('div'); d.innerHTML = html;
    return Array.prototype.map.call(d.querySelectorAll('[data-tour-action]'), function(b) { return b.getAttribute('data-tour-action'); });
  };

  test('Modern: Start talking now, Choose a different board, and the two quick-tour links', function(assert) {
    // Updated 2026-10-14 (requested): the welcome's quick-tour link is now the SPEAK-page tour, relabelled
    // "...of the speak page (1 min)", and a second HOME-page tour link ("...of my home page (1 min)",
    // data-tour-action="next") advances into the 4-step communicator home tour appended below.
    var html = buildHomeSteps('gentle', {})[0].text;
    assert.deepEqual(actions(html), ['speak', 'picker', 'speak_tour', 'home_tour'], 'primary, secondary, speak-page link, home-page link');
    assert.true(text(html).includes('Start talking now'), 'primary label');
    assert.true(text(html).includes("We'll set up Vocal Flair 60. You can change it anytime."), 'its note');
    assert.true(text(html).includes('Choose a different board'), 'secondary');
    assert.true(text(html).includes('Take a quick tour of the speak page (1 min)'), 'the speak-page link');
    assert.true(text(html).includes('Take a quick tour of my home page (1 min)'), 'the home-page link');
    assert.true(html.includes('/images/vocal-flair-60.png'), 'with the board picture');
  });

  test('Basic: the same card in Basic\'s skin', function(assert) {
    var steps = buildClassicHomeSteps({});
    assert.strictEqual(steps.length, 1);
    assert.deepEqual(actions(steps[0].text), ['speak', 'picker', 'speak_tour']);
    assert.true(steps[0].classes.includes('ch-tour__step'), 'Basic skin');
  });

  test('a supporter does not get the board-setup welcome', function(assert) {
    var html = buildHomeSteps('gentle', { supporter: true })[0].text;
    assert.false(actions(html).includes('speak'), 'Modern');
    assert.false(actions(buildClassicHomeSteps({ supporter: true })[0].text || '').includes('speak'), 'Basic');
  });

  function deps(classic, fail) {
    var calls = { copied: [], speak: [], errors: [], transitions: [], set: {} };
    var user = EmberObject.create({ id: '1_7', user_name: 'aiden', preferences: { board_view_style: classic ? 'classic' : 'modern' } });
    var appState = {
      get: function(k) { return k === 'currentUser' || k === 'effective_view_user' ? user : (k === 'label_locale' ? 'en' : null); },
      set: function(k, v) { calls.set[k] = v; },
      home_in_speak_mode: function(o) { calls.speak.push(o); }
    };
    return {
      calls: calls, user: user,
      opts: {
        appState: appState,
        router: { transitionTo: function(r) { calls.transitions.push(r); } },
        findBoard: function(key) { calls.found = key; return Promise.resolve({ key: key }); },
        copyAsHome: fail ? function() { return Promise.reject('Copy failed'); } :
          function(board, u) { calls.copied.push([board.key, u.get('user_name')]); return Promise.resolve(EmberObject.create({ id: '1_60', key: 'aiden/vocal-flair-60' })); },
        showError: function(m) { calls.errors.push(m); }
      }
    };
  }

  test('Start talking now: Vocal Flair 60 becomes their home board, then Speak Mode on it', async function(assert) {
    var d = deps(false);
    await start_talking_now(d.opts);
    assert.strictEqual(d.calls.found, STARTER_BOARD_KEY, 'the catalog Vocal Flair 60');
    assert.deepEqual(d.calls.copied, [['lingolinq/vocal-flair-60', 'aiden']], 'copied or reused for them');
    assert.deepEqual(d.calls.speak[0].force_board_state, { id: '1_60', key: 'aiden/vocal-flair-60' }, 'Speak Mode on their copy');
    assert.strictEqual(d.calls.speak[0].user, d.user, 'as them');
    assert.notOk(d.calls.set.board_detail_tour_pending_speak, 'no tour armed');
  });

  test('Take a quick tour: the same, with the board tour armed for the view', async function(assert) {
    var m = deps(false); m.opts.withTour = true;
    await start_talking_now(m.opts);
    assert.strictEqual(m.calls.set.board_detail_tour_pending_speak, 'aiden/vocal-flair-60', 'Modern board tour');
    var b = deps(true); b.opts.withTour = true;
    await start_talking_now(b.opts);
    assert.strictEqual(b.calls.set.board_alt_tour_pending, 'aiden/vocal-flair-60', 'Basic board tour');
  });

  test('if it cannot be set up, it says so and opens the board picker', async function(assert) {
    var d = deps(false, true);
    await start_talking_now(d.opts);
    assert.deepEqual(d.calls.errors, ['Copy failed']);
    assert.deepEqual(d.calls.transitions, ['board-picker']);
    assert.strictEqual(d.calls.speak.length, 0);
  });
  /* A COMMUNICATOR WHO ALREADY HAS A HOME BOARD (adversary review, 2026-10-13). A manual "Take a tour" shows
     this card too, and its buttons made Vocal Flair 60 the home board over the one their SLP set up. With a
     home board, both buttons open THAT board and nothing is copied or saved. */
  function withHome(d) { d.user.set('preferences', Object.assign({}, d.user.get('preferences'), { home_board: { id: '1_5', key: 'aiden/my-board' } })); return d; }

  test('Start talking now with a home board already set: opens it; nothing copied, home board unchanged', async function(assert) {
    var d = withHome(deps(false));
    await start_talking_now(d.opts);
    assert.strictEqual(d.calls.found, undefined, 'Vocal Flair 60 not even looked up');
    assert.deepEqual(d.calls.copied, [], 'nothing copied or set');
    assert.deepEqual(d.calls.speak[0].force_board_state, { id: '1_5', key: 'aiden/my-board' }, 'Speak Mode on their own home board');
    assert.strictEqual(d.user.get('preferences.home_board.key'), 'aiden/my-board', 'home board unchanged');
  });

  test('Take a quick tour with a home board already set: the board tour runs on that board', async function(assert) {
    var m = withHome(deps(false)); m.opts.withTour = true;
    await start_talking_now(m.opts);
    assert.deepEqual(m.calls.copied, [], 'nothing copied');
    assert.strictEqual(m.calls.set.board_detail_tour_pending_speak, 'aiden/my-board', 'Modern board tour on their board');
    var b = withHome(deps(true)); b.opts.withTour = true;
    await start_talking_now(b.opts);
    assert.strictEqual(b.calls.set.board_alt_tour_pending, 'aiden/my-board', 'Basic board tour on their board');
  });

  test('the card for someone with a home board does not promise to set up Vocal Flair 60', function(assert) {
    assert.expect(8);
    [buildHomeSteps('gentle', { hasHome: true })[0].text, buildClassicHomeSteps({ hasHome: true })[0].text].forEach(function(html) {
      // Modern adds a 4th "next" (home-page tour) link; Basic has only the three. Check the shared three.
      assert.deepEqual(actions(html).slice(0, 3), ['speak', 'picker', 'speak_tour'], 'the same three choices');
      assert.false(text(html).includes('Vocal Flair 60'), 'no Vocal Flair 60 note');
      assert.false(html.includes('/images/vocal-flair-60.png'), 'no Vocal Flair 60 picture');
      assert.true(text(html).includes('Opens your home board.'), 'says what it does');
    });
  });

  /* THE COMMUNICATOR HOME-PAGE TOUR (2026-10-14, requested): the welcome plus four DOM-driven spotlights
     over the Modern home cards, reached from the welcome's home-page link. Targets are injected so the
     count is the tour's own, not a missing target's (mirrors board-detail-four-steps-test). */
  test('Modern: the home-page tour is the welcome plus four spotlights over the home cards', function(assert) {
    assert.expect(1);
    var added = [];
    ['md-card--speak', 'md-card--boards', 'md-card--extras', 'md-pillnav'].forEach(function(cls) {
      var el = document.createElement('div'); el.className = cls; el.style.height = '20px'; el.textContent = 'x';
      document.body.appendChild(el); added.push(el);
    });
    try {
      var ids = buildHomeSteps('gentle', {}).map(function(s) { return s.id; });
      assert.deepEqual(ids,
        ['home_tour_welcome', 'comm_home_tour_speak', 'comm_home_tour_extras', 'comm_home_tour_boards', 'comm_home_tour_nav'],
        'welcome, then Speak, Extras (right after Speak), Boards, nav');
    } finally {
      added.forEach(function(e) { e.remove(); });
    }
  });

  test('a home card not on screen is skipped (the tour is DOM-driven)', function(assert) {
    assert.expect(1);
    var added = [];
    ['md-card--speak', 'md-pillnav'].forEach(function(cls) {
      var el = document.createElement('div'); el.className = cls; el.style.height = '20px'; el.textContent = 'x';
      document.body.appendChild(el); added.push(el);
    });
    try {
      var ids = buildHomeSteps('gentle', {}).map(function(s) { return s.id; });
      assert.deepEqual(ids, ['home_tour_welcome', 'comm_home_tour_speak', 'comm_home_tour_nav'],
        'only the welcome and the two present targets');
    } finally {
      added.forEach(function(e) { e.remove(); });
    }
  });

  test('Basic: no home-page tour link and no appended home steps', function(assert) {
    var steps = buildClassicHomeSteps({});
    assert.strictEqual(steps.length, 1, 'just the welcome, no appended home steps in Basic');
    assert.false(actions(steps[0].text).includes('home_tour'), 'and no home-page tour link');
  });
});
