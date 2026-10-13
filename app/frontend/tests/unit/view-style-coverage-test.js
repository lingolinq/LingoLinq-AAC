import { module, test } from 'qunit';
import { setupTest } from '../helpers';
import EmberObject from '@ember/object';
import { is_classic } from 'frontend/utils/view_style';
import { board_view_route, board_edit_route, board_edit_needs_mode } from 'frontend/utils/board_view';

/* "Does EVERY page and modal honour the Basic/Modern preference?"
 *
 * Enumerating the ~40 routes and ~130 modals one by one would be a long test that still
 * proves less than it looks, because it can only cover the pages that exist on the day it is
 * written -- the page added next month is exactly the one that surprises somebody.
 *
 * The guarantee is structural instead, and these tests pin the structure:
 *
 *   1. The style is stamped ONCE, on <body>, from a single app-state observer. Every page and
 *      every modal renders inside <body>, so none of them can be missed and none can differ.
 *   2. Nothing else in the app may toggle those classes, or a page could quietly disagree
 *      with the preference.
 *   3. Nothing may read the raw preference behind the resolver's back, or a page would miss
 *      the modelling rule and show a supervisor's view during a communicator's session.
 *
 * (2) and (3) are checked by scanning EVERY loaded application module rather than a list, so
 * a new page or modal that breaks the rule fails this test on the day it is added. That is
 * the part a hand-written per-page list cannot do.
 */
module('Unit | view style coverage', function(hooks) {
  setupTest(hooks);

  /* Every application module, as the AMD registry holds it. `callback.toString()` is the
     compiled module body, so string literals in the source are visible here. Tests and
     vendor/addon code are excluded: the rules below are about APPLICATION code. */
  function app_modules() {
    var entries = (window.requirejs && window.requirejs.entries) || (window.require && window.require.entries) || {};
    return Object.keys(entries).filter(function(name) {
      return name.indexOf('frontend/') === 0 &&
             name.indexOf('/tests/') === -1 &&
             name.indexOf('-test') === -1;
    }).map(function(name) {
      var src = '';
      try { src = String(entries[name].callback); } catch(e) { src = ''; }
      return { name: name, src: src };
    });
  }

  test('the app is actually being scanned (guards every assertion below)', function(assert) {
    var mods = app_modules();
    /* Without this, a registry that came back empty would make every scan below pass
       vacuously -- the failure mode that makes a green scan worthless. */
    assert.true(mods.length > 200, 'found ' + mods.length + ' application modules to scan');
    var names = mods.map(function(m) { return m.name; });
    assert.true(names.indexOf('frontend/services/app-state') !== -1, 'app-state is among them');
    assert.true(names.filter(function(n) { return n.indexOf('frontend/routes/') === 0; }).length > 20,
      'and the route modules are too, which is what "every page" means here');
  });

  /* RULE 1: exactly one place decides the body class. */
  test('only app.js toggles the view classes, so no page can disagree', function(assert) {
    var offenders = app_modules().filter(function(m) {
      /* QUOTED literals only. utils/view_style_state's header names `body.ll-view-basic` in
         prose to explain what the mirror is for, and a comment cannot toggle a class. */
      return (m.src.indexOf("'ll-view-basic'") !== -1 || m.src.indexOf("'ll-view-modern'") !== -1 ||
              m.src.indexOf('"ll-view-basic"') !== -1 || m.src.indexOf('"ll-view-modern"') !== -1) &&
             m.name !== 'frontend/app';
    }).map(function(m) { return m.name; });
    assert.deepEqual(offenders, [],
      'no module other than frontend/app may add or remove ll-view-* (found: ' + offenders.join(', ') + ')');
  });

  /* RULE 2: nothing reads the preference behind the resolver.
     A direct read is not a style nit -- it silently loses the modelling rule, so the page
     would show the SUPERVISOR's view during a communicator's session. */
  test('no page or modal reads board_view_style directly', function(assert) {
    var offenders = app_modules().filter(function(m) {
      /* Quoted forms only. app-state's own prose mentions the path in backticks to tell
         readers what NOT to use, and that comment should not fail its own rule. */
      return m.src.indexOf("'currentUser.preferences.board_view_style'") !== -1 ||
             m.src.indexOf('"currentUser.preferences.board_view_style"') !== -1 ||
             m.src.indexOf("appState.currentUser.preferences.board_view_style") !== -1 ||
             m.src.indexOf("app_state.currentUser.preferences.board_view_style") !== -1;
    }).filter(function(m) {
      /* app-state is the ONE legitimate exception: `sync_view_scope` has to observe the raw
         preference path, because an observer on a computed never fires (that mistake shipped
         once already and left the class unstamped on every page). */
      return m.name !== 'frontend/services/app-state';
    }).map(function(m) { return m.name; });
    assert.deepEqual(offenders, [],
      'every reader must go through effective_view_user (found: ' + offenders.join(', ') + ')');
    var app_state = app_modules().filter(function(m) { return m.name === 'frontend/services/app-state'; })[0];
    assert.true(!!app_state && app_state.src.indexOf("'currentUser.preferences.board_view_style'") !== -1,
      'and app-state still observes the raw path, so the exemption above is not covering its removal');
  });

  /* RULE 3: every modal the app can open is a real component, so none of them render outside
     the shell that carries the class. This is the "every modal" half, driven off the app's own
     registry rather than a list kept in this file. */
  test('every registered modal resolves to a real component', function(assert) {
    var entries = (window.requirejs && window.requirejs.entries) || {};
    var container = entries['frontend/components/modal-container'];
    var src = container ? String(container.callback) : '';
    var m = src.match(/convertedModals\s*=\s*\[([^\]]*)\]/);
    assert.true(!!m, 'found the modal registry in modal-container');
    var names = (m ? m[1] : '').split(',')
      .map(function(s) { return s.trim().replace(/^['"]|['"]$/g, ''); })
      .filter(function(s) { return s.length > 0; });
    assert.true(names.length > 100, 'registry lists ' + names.length + ' modals');

    var missing = names.filter(function(n) {
      /* 37 registry entries are written `modals/<name>`, but the component itself lives at
         components/<name> -- the prefix is a naming convention in the registry, not a path.
         (controllers/modals/<name>.js does exist for some, but those are the orphaned
         pre-component controllers CLAUDE.md warns about, and are not what renders.) */
      var base = n.replace(/^modals\//, '');
      /* A few legacy registry names keep underscores (`modals/push_to_cloud`) while the
         component that renders them is hyphenated (`push-to-cloud`). Same modal, older name. */
      var dashed = base.replace(/_/g, '-');
      return !entries['frontend/components/' + base] &&
             !entries['frontend/components/' + dashed] &&
             !entries['frontend/templates/components/' + base] &&
             !entries['frontend/templates/components/' + dashed] &&
             !entries['frontend/components/' + n];
    });
    assert.deepEqual(missing, [],
      'every registered modal has a component module (missing: ' + missing.join(', ') + ')');
    assert.true(names.indexOf('confirm-view-style-change') !== -1,
      'including the view-change confirmation added with this feature');
  });

  /* RULE 4: the behaviour the structure rests on. If the class did not track the resolved
     style, rules 1-3 would be guarding nothing. */
  module('the body class tracks the resolved style', function(inner) {
    inner.beforeEach(function() {
      this.svc = this.owner.lookup('service:app-state');
      this._body = document.body.className;
    });
    inner.afterEach(function() {
      document.body.className = this._body;
      this.svc.set('page_user', null);
      this.svc.set('current_route', null);
    });

    function user(id, style) {
      return EmberObject.create({ id: id, preferences: { board_view_style: style } });
    }
    function classes() {
      return {
        basic: document.body.classList.contains('ll-view-basic'),
        modern: document.body.classList.contains('ll-view-modern')
      };
    }

    test('Basic stamps ll-view-basic and only that', function(assert) {
      this.svc.set('currentUser', user('u-1', 'classic'));
      assert.strictEqual(this.svc.get('effective_view_style'), 'classic', 'resolves to classic');
      assert.deepEqual(classes(), { basic: true, modern: false }, 'exactly one class, the right one');
    });

    test('Modern stamps ll-view-modern and only that', function(assert) {
      this.svc.set('currentUser', user('u-2', 'modern'));
      assert.strictEqual(this.svc.get('effective_view_style'), 'modern', 'resolves to modern');
      assert.deepEqual(classes(), { basic: false, modern: true }, 'exactly one class, the right one');
    });

    /* The class has to follow a MANUAL switch without a reload, or the person who just changed
       their view sits in the old shell until they navigate. */
    test('it re-stamps when the session user switches their own view', function(assert) {
      var me = user('slp-1', 'modern');
      this.svc.set('currentUser', me);
      assert.deepEqual(classes(), { basic: false, modern: true }, 'starts on Modern');

      me.set('preferences.board_view_style', 'classic');
      assert.strictEqual(this.svc.get('effective_view_style'), 'classic', 'resolves to the new choice');
      assert.deepEqual(classes(), { basic: true, modern: false }, 'and the class followed, no reload');
    });

    /* CHANGED 2026-09-23. This previously asserted the OPPOSITE: that opening a communicator's
       board or boards list re-stamped the body to THEIR view. That branch was removed on
       request -- the view is now absolute and follows the session account everywhere except
       live modelling -- because in practice it flipped a supervisor's whole shell back and
       forth as they clicked between people. The assertion is inverted rather than deleted, so
       the removed behaviour cannot creep back unnoticed. */
    test('another person\'s page does not re-stamp the body', function(assert) {
      this.svc.set('currentUser', user('slp-1', 'modern'));
      assert.deepEqual(classes(), { basic: false, modern: true }, 'starts on the supervisor\'s view');

      this.svc.set('current_route', 'user.board-alt.index');
      this.svc.set('page_user', user('kiddo-1', 'classic'));
      assert.strictEqual(this.svc.get('effective_view_style'), 'modern', 'the page owner has no say');
      assert.deepEqual(classes(), { basic: false, modern: true }, 'so the shell does not flip');
    });
  });
});

/* `is_classic` and everything built on it, against a user record that is a PLAIN OBJECT.
 *
 * This is not hypothetical. `services/app-state.js:5166-5171` states that `currentUser` is
 * assigned a plain object in several places, and resolves `effective_view_user` with
 * `emberGet` for exactly that reason -- its comment records five unrelated tests dying when
 * it used `.get()`. Anything that reads the preference with `user.get(...)` therefore has to
 * survive the same shape.
 *
 * The consequence when it does not is silent and user-visible: `board_view_route` decides
 * where a user LANDS after creating, importing or picking a board, so a Basic user gets
 * pushed into the Modern board shell -- the exact thing the comment in
 * `components/create-board-new.js` says must not happen.
 */
module('Unit | view style with a plain-object user', function() {
  test('is_classic reads the preference off a plain object', function(assert) {
    assert.true(is_classic({ preferences: { board_view_style: 'classic' } }),
      'a Basic user held as a POJO reads as Basic');
    assert.false(is_classic({ preferences: { board_view_style: 'modern' } }),
      'a Modern user held as a POJO reads as Modern');
    assert.false(is_classic(null), 'null is still safe, and still Modern');
    assert.false(is_classic({}), 'a user with no preferences is Modern');
  });

  test('board_view_route sends a Basic POJO user to board-alt, not board-detail', function(assert) {
    assert.strictEqual(board_view_route({ preferences: { board_view_style: 'classic' } }),
      'user.board-alt', 'post-save routing honours Basic for a POJO user');
    assert.strictEqual(board_view_route({ preferences: { board_view_style: 'modern' } }),
      'user.board-detail', 'Modern is unchanged');
  });

  test('board_edit_route and board_edit_needs_mode agree for a Basic POJO user', function(assert) {
    assert.strictEqual(board_edit_route({ preferences: { board_view_style: 'classic' } }),
      'user.board-alt.index', 'classic has no /edit subroute, so it is the board itself');
    assert.true(board_edit_needs_mode({ preferences: { board_view_style: 'classic' } }),
      'and the caller is told to flip edit mode on arrival');
  });
});
