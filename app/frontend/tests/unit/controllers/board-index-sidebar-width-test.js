import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject, { computed } from '@ember/object';
import { run } from '@ember/runloop';
import BoardIndexController from 'frontend/controllers/board/index';

/* `#sidebar` is `position: absolute` (app.scss:9929-9933), so CSS never pushes the board
 * grid aside. The only thing that makes room is `computeHeight` subtracting the sidebar
 * width from the board width, and the SCSS comment states that contract directly:
 *
 *   "Width is published by board/index.js computeHeight as `--sidebar-width` ... The JS
 *    board-width reservation reads the same value, so grid + sidebar stay flush."
 *
 * The bug: the sidebar RENDERS on `sidebar_visible` but the width was RESERVED on a
 * second, narrower condition -- the since-deleted `sidebar_pinned`, which turned on
 * `effective_quick_sidebar` alone and never on `stashes.sidebarEnabled`. So every path
 * that sets `sidebarEnabled` alone (the sidebar tease, and the speak-menu "Show Sidebar"
 * item at controllers/application.js:784) produced a sidebar that overlays the board. The reported "it only works on the second click" is `stickSidebar` toggling
 * the EFFECTIVE state: from collapsed-and-unpinned the second click pins rather than
 * closes, and pinning is what finally reserved the width.
 *
 * THE CONTRACT these tests pin: the board reserves the sidebar's width exactly when the
 * sidebar is visible -- at every entry path, and at no other time.
 *
 * Two deliberate choices about HOW this is tested:
 *
 * 1. `sidebar_visible` is MIRRORED as a real computed over the same inputs production
 *    uses, and the tests drive `stashes.sidebarEnabled` and `preferences.quick_sidebar`
 *    -- never the boolean directly. Assigning it directly would let a test express states
 *    production cannot reach and would not exercise the disjunction that IS the bug.
 * 2. The expected width is asserted against the published `--sidebar-width` CSS var rather
 *    than re-deriving the clamp arithmetic. Re-deriving it would be a tautology that
 *    passes for any formula; reading the var asserts the actual stated contract, that CSS
 *    and JS move off ONE value. `assert_reserved` additionally requires that value to be
 *    non-zero, so a var that stopped being published cannot make the assertion vacuous.
 */
module('Unit | Controller | board/index sidebar width reservation', function(hooks) {
  setupTest(hooks);

  function svc(values) {
    return EmberObject.create(Object.assign({
      addObserver: function() {}, removeObserver: function() {}
    }, values || {}));
  }

  /* Literal re-statements of services/app-state.js:3812-3832, kept verbatim rather than
     simplified. `effective_quick_sidebar` defaults to TRUE when the preference is unset,
     which is why every fixture below that wants it off sets `quick_sidebar: false`
     explicitly instead of leaving it out. */
  const AppStateStub = EmberObject.extend({
    speak_mode: true,
    eval_mode: false,
    header_height: 70,
    extra_header_height: 0,
    effective_quick_sidebar: computed('currentUser.preferences.quick_sidebar', function() {
      var qs = this.get('currentUser.preferences.quick_sidebar');
      return (qs === undefined || qs === null) ? true : !!qs;
    }),
    sidebar_visible: computed('speak_mode', 'stashes.sidebarEnabled', 'effective_quick_sidebar',
                              'eval_mode', function() {
      return this.get('speak_mode') && !this.get('eval_mode') &&
        (this.get('stashes.sidebarEnabled') || this.get('effective_quick_sidebar'));
    })
  });

  function build(opts) {
    opts = opts || {};
    /* One shared `stashes` object for the controller AND the app-state stub, because
       production shares one service: `sidebar_visible` reads `stashes.sidebarEnabled`
       through app_state's own injection. Two objects would let the test set a flag the
       computed never sees. */
    var stashes = svc({ sidebarEnabled: !!opts.sidebarEnabled });
    return BoardIndexController.create({
      appState: AppStateStub.create({
        stashes: stashes,
        eval_mode: !!opts.eval_mode,
        currentUser: EmberObject.create({
          preferences: { quick_sidebar: !!opts.quick_sidebar }
        })
      }),
      stashes: stashes,
      persistence: svc(),
      router: svc()
    });
  }

  /* Drive the real observer the way production does -- by setting a dependent key -- inside
     a runloop so the (async since Ember 3.13) observer flushes before the assertions.
     Deliberately NOT `settled()`: that waits for GLOBAL quiescence and hangs in the full
     suite on timers other modules leave pending (see the note in
     board-index-prediction-scope-test.js). `computeHeight` itself schedules no timers on
     this fixture -- both `runLater` branches need a `model`, and these fixtures have none. */
  function layout(controller) {
    // eslint-disable-next-line ember/no-runloop
    run(function() {
      controller.appState.notifyPropertyChange('revision_id');
    });
  }

  function sidebar_width() {
    return parseInt(document.documentElement.style.getPropertyValue('--sidebar-width'), 10);
  }

  function assert_reserved(assert, controller, label) {
    var sw = sidebar_width();
    assert.ok(sw > 0, label + ': a sidebar width was published (got ' + sw + ')');
    assert.equal(controller.get('width'), window.innerWidth - sw,
      label + ': board width reserves the sidebar');
  }

  function assert_not_reserved(assert, controller, label) {
    assert.equal(controller.get('width'), window.innerWidth,
      label + ': board width is the full viewport');
  }

  hooks.afterEach(function() {
    if(this.controller) { this.controller.destroy(); this.controller = null; }
    document.documentElement.style.removeProperty('--sidebar-width');
  });

  /* THE BUG. `sidebarEnabled` is what both the tease (components/sidebar-tease.js) and the
     speak-menu "Show Sidebar" item (controllers/application.js:784) write, and it is the
     only thing they write. */
  test('reserves width when the sidebar is shown without being pinned', function(assert) {
    this.controller = build({ sidebarEnabled: true, quick_sidebar: false });
    layout(this.controller);
    assert.equal(this.controller.get('appState.sidebar_visible'), true, 'sidebar is visible');
    assert.equal(this.controller.get('appState.effective_quick_sidebar'), false,
      'and the pinning preference is off -- the old gate\'s only input');
    assert_reserved(assert, this.controller, 'shown-not-pinned');
  });

  /* Without this case an implementation that subtracted unconditionally would pass the test
     above, so the module would be hollow. */
  test('does not reserve width when the sidebar is hidden', function(assert) {
    this.controller = build({ sidebarEnabled: false, quick_sidebar: false });
    layout(this.controller);
    assert.equal(this.controller.get('appState.sidebar_visible'), false, 'sidebar is hidden');
    assert_not_reserved(assert, this.controller, 'hidden');
  });

  /* Regression guard for the path that already worked: pinning must keep reserving. */
  test('reserves width when the sidebar is pinned', function(assert) {
    this.controller = build({ sidebarEnabled: false, quick_sidebar: true });
    layout(this.controller);
    assert.equal(this.controller.get('appState.sidebar_visible'), true, 'sidebar is visible');
    assert_reserved(assert, this.controller, 'pinned');
  });

  /* The deleted `sidebar_pinned` did not consult `eval_mode` but `sidebar_visible` does, so
     eval mode is the one state where the old gate's input was true and the sidebar was still
     not rendered. No width may be reserved there -- gating on `visible` is what keeps that
     true, and it is the reason the old condition ANDed the two together. */
  test('does not reserve width in eval mode, where the sidebar does not render', function(assert) {
    this.controller = build({ sidebarEnabled: true, quick_sidebar: true, eval_mode: true });
    layout(this.controller);
    assert.equal(this.controller.get('appState.sidebar_visible'), false, 'sidebar is hidden');
    assert_not_reserved(assert, this.controller, 'eval-mode');
  });
});
