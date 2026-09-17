import { module, test } from 'qunit';
import { setupTest } from '../helpers';
import EmberObject from '@ember/object';

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

    /* The case the whole feature exists for: the page starts as the supervisor's and becomes a
       communicator's. The class has to follow WITHOUT a reload, or the first page of a
       modelling session wears the wrong shell. */
    test('it re-stamps when the resolved user changes', function(assert) {
      this.svc.set('currentUser', user('slp-1', 'modern'));
      assert.deepEqual(classes(), { basic: false, modern: true }, 'starts on the supervisor\'s view');

      /* A COMMUNICATION route, because that is the only kind the page-owner branch applies to
         (option C, 2026-09-17): a supervisor on a communicator's Reports page keeps their own
         shell, and this test is about the board case. */
      this.svc.set('current_route', 'user.board-alt.index');
      this.svc.set('page_user', user('kiddo-1', 'classic'));
      assert.strictEqual(this.svc.get('effective_view_style'), 'classic', 'resolves to the communicator');
      assert.deepEqual(classes(), { basic: true, modern: false }, 'and the class followed, no reload');
    });
  });
});
