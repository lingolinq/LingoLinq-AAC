import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';

/*
 * Gates for "Set as Home" and "Make a Copy" in VIEW mode. Both now render in the
 * OPTIONS MENU (.md-board-detail-actions-menu), which stays visible in view mode.
 *
 * History worth keeping, because it cost a full browser pass to find: these were
 * first added to the view-mode HEADER, and they never rendered. That header lives
 * inside .md-board-detail-header, which .md-shell--board-collapsed hides outright
 * (app.scss:76138), and `board_collapsed` defaults to true in view mode
 * (controllers/user/board-detail.js:267) -- it flips to false ONLY on entering
 * edit mode. So the buttons swapped a Handlebars edit-mode gate for a CSS one and
 * stayed exactly as unreachable. NOTHING at this unit-test layer can see that:
 * these gates were green the whole time. Placement is only verifiable in a
 * browser -- see app/frontend/scripts/claim-check-d1-d2-d10-qa.mjs.
 *
 * The gates are deliberately NOT can_edit_or_copy_board, which short-circuits
 * to true on edit permission and would therefore offer "Make a Copy" on a board
 * the owner is not permitted to copy. That case is the third test below.
 */
module('Unit | Controller | user/board-detail view-mode actions', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.controller = this.owner.factoryFor('controller:user/board-detail').create();
  });

  hooks.afterEach(function() {
    if(this.controller) {
      this.controller.destroy();
      this.controller = null;
    }
  });

  function board(attrs) {
    return EmberObject.create(attrs || {});
  }

  test('a signed-out visitor is offered neither', function(assert) {
    this.controller.set('app_state', EmberObject.create({ sessionUser: null }));
    this.controller.set('model', board({}));
    // Assert the properties EXIST before asserting they are false. `!!undefined`
    // is also false, so a bare assert.false would stay green if the computeds
    // were deleted outright -- a passing test for a control that no longer has
    // any gate at all.
    assert.strictEqual(typeof this.controller.get('can_set_as_home'), 'boolean', 'can_set_as_home is a real computed');
    assert.strictEqual(typeof this.controller.get('can_copy_board'), 'boolean', 'can_copy_board is a real computed');
    assert.false(this.controller.get('can_set_as_home'), 'no home board without an account');
    assert.false(this.controller.get('can_copy_board'), 'no copy without an account');
  });

  test('a signed-in visitor on someone else\'s copyable board is offered both', function(assert) {
    this.controller.set('app_state', EmberObject.create({ sessionUser: EmberObject.create({ id: '1_1' }) }));
    // no permissions.edit -- this is the evaluate-a-public-vocabulary case
    this.controller.set('model', board({ permissions: { edit: false } }));
    assert.true(!!this.controller.get('can_set_as_home'), 'can set a board they do not own as home');
    assert.true(!!this.controller.get('can_copy_board'), 'can copy it');
  });

  test('an owner is NOT offered a copy of an uncopyable board', function(assert) {
    this.controller.set('app_state', EmberObject.create({ sessionUser: EmberObject.create({ id: '1_1' }) }));
    this.controller.set('model', board({ permissions: { edit: true }, uncopyable: true }));
    assert.true(!!this.controller.get('can_edit_or_copy_board'),
      'can_edit_or_copy_board is true here -- which is exactly why it must not gate the copy button');
    assert.false(!!this.controller.get('can_copy_board'), 'copy is withheld on an uncopyable board');
  });

  test('a for-sale board cannot be copied', function(assert) {
    this.controller.set('app_state', EmberObject.create({ sessionUser: EmberObject.create({ id: '1_1' }) }));
    this.controller.set('model', board({ for_sale: true }));
    assert.false(!!this.controller.get('can_copy_board'), 'copy is withheld on a for-sale board');
    assert.true(!!this.controller.get('can_set_as_home'), 'but it can still be set as home');
  });

  /*
   * Guards the exact wiring the template depends on. This test earned its keep
   * immediately: the first version of the view-mode button sent "copy_board",
   * a name that does not exist on this controller (the copy action is
   * `make_a_copy`; `copy_board` is a method on the APPLICATION controller that
   * `make_a_copy` delegates to). Template-lint and eslint both pass on a
   * ctrlAction naming a non-existent action -- it simply does nothing at
   * runtime, which is the same silent-dead-control failure this whole change
   * exists to fix.
   */
  test('the actions the view-mode buttons send both exist', function(assert) {
    assert.strictEqual(typeof this.controller.actions.set_as_home, 'function', 'set_as_home');
    assert.strictEqual(typeof this.controller.actions.make_a_copy, 'function', 'make_a_copy');
  });

  /*
   * The five items that open a modal must close the options menu behind them.
   * `_closeDropdownsHandler` does not handle `show_options_menu` and the modal
   * overlay covers the backdrop scrim, so a menu left open is still there when
   * the modal closes.
   *
   * The FIRST assertion is the one that matters: `_close_options_menu` has to be
   * on the CONTROLLER, not in the `actions` hash. Written inside `actions` it is
   * reachable as `controller.actions._close_options_menu` but NOT as
   * `this._close_options_menu`, which is what the handlers call — so every one of
   * these five items would have thrown a TypeError on click. That is exactly
   * where it was first written, and nothing but the lint gate noticed.
   */
  test('_close_options_menu is on the controller, not in the actions hash', function(assert) {
    assert.strictEqual(typeof this.controller._close_options_menu, 'function',
      'callable as this._close_options_menu() from an action handler');
    assert.strictEqual(typeof (this.controller.actions || {})._close_options_menu, 'undefined',
      'not in the actions hash, where `this.` could not reach it');
  });

  test('_close_options_menu clears the menu and every submenu', function(assert) {
    assert.expect(6);
    this.controller.setProperties({
      show_options_menu: true,
      board_submenu_open: true,
      share_print_submenu_open: true,
      display_submenu_open: true,
      buttons_submenu_open: true,
      language_submenu_open: true
    });
    this.controller._close_options_menu();
    ['show_options_menu', 'board_submenu_open', 'share_print_submenu_open',
     'display_submenu_open', 'buttons_submenu_open', 'language_submenu_open'].forEach((k) => {
      assert.false(this.controller.get(k), k + ' cleared');
    });
  });

  /*
   * Customize Menu gating. Every other row on the options menu can be hidden from
   * the right panel; these five shipped gated only on permission, which made them
   * the only rows a user could not turn off. The panel is built from
   * SPEAK_MENU_ITEMS, so an id missing there never appears as a toggle.
   */
  test('the new menu rows are listed in the customize-menu catalog', function(assert) {
    assert.expect(5);
    const ids = (this.controller.get('speak_menu_sections_list') || [])
      .reduce((acc, group) => acc.concat((group.items || []).map((i) => i.id)), []);
    ['set_as_home', 'board_details', 'toggle_favorite', 'add_to_sidebar', 'other_board_actions']
      .forEach((id) => assert.true(ids.indexOf(id) >= 0, id + ' is toggleable in Customize Menu'));
  });

  /*
   * "Take a tour" replay. The once-per-user `tourAutoShown` gate lives in
   * components/guided-tour.js and swallowed this trigger for anyone who had
   * already picked a home board -- i.e. everyone -- because the manual path
   * writes the SAME `board_detail_tour_pending_speak` flag as the auto-open, and
   * the component's own Shepherd button is display:none, so the menu item is the
   * only way in.
   *
   * What is testable HERE is the flag-writing discipline, which is the fragile
   * half: the consumer reads `board_detail_tour_speak_manual` to decide whether
   * to skip the gate, so an edit that forgets to SET it re-breaks replay, and one
   * that forgets to CLEAR it (in board-preview-overlay.js and guided-tour.js's
   * own board-picker handoff) makes an auto-open skip its one-shot and re-fire on
   * every pick forever -- the original bug, inverted.
   *
   * Actually starting the tour needs Shepherd and a rendered board grid, so that
   * half is browser-only: scripts/a2c-click-tests-qa.mjs does not cover it either.
   * Manually confirmed 2026-08-24 (see CLAIM-CHECK-BACKLOG.md A2c).
   */
  /*
   * "Set as Home Board" is hidden when you are already standing on your home
   * board — otherwise the row is a no-op you have to open a modal to discover.
   * Subject is referenced_user (the communicator this page is scoped to) falling
   * back to the signed-in user, matching board-collection.js#_subjectHomeKey.
   *
   * The both-sides-non-empty case below is the one that bites: a user with no
   * home board set has `home_board.key === undefined`, and an `===` comparison
   * against a board whose key had not loaded would report EVERY board as
   * already-home and hide the row for exactly the users who most need it.
   */
  function userWithHome(key) {
    return EmberObject.create({ preferences: { home_board: key ? { key: key } : {} } });
  }

  test('Set as Home is hidden when the board IS the subject\'s home board', function(assert) {
    this.controller.set('app_state', EmberObject.create({
      sessionUser: userWithHome('bob/kb'),
      referenced_user: userWithHome('bob/kb')
    }));
    this.controller.set('model', board({ key: 'bob/kb' }));
    assert.true(this.controller.get('is_subject_home_board'), 'recognised as the home board');
    assert.false(this.controller.get('can_set_as_home'), 'row withheld — setting it again is a no-op');
  });

  test('Set as Home is offered on any OTHER board', function(assert) {
    this.controller.set('app_state', EmberObject.create({
      sessionUser: userWithHome('bob/kb'),
      referenced_user: userWithHome('bob/kb')
    }));
    this.controller.set('model', board({ key: 'bob/other' }));
    assert.false(this.controller.get('is_subject_home_board'), 'a different board');
    assert.true(this.controller.get('can_set_as_home'), 'row offered');
  });

  test('a user with NO home board is still offered the row', function(assert) {
    this.controller.set('app_state', EmberObject.create({
      sessionUser: userWithHome(null),
      referenced_user: userWithHome(null)
    }));
    this.controller.set('model', board({ key: 'bob/kb' }));
    assert.false(this.controller.get('is_subject_home_board'),
      'no home board set — must not match by both sides being empty');
    assert.true(this.controller.get('can_set_as_home'), 'the users who most need the row keep it');
  });

  test('a board whose key has not loaded is never treated as home', function(assert) {
    this.controller.set('app_state', EmberObject.create({
      sessionUser: userWithHome('bob/kb'),
      referenced_user: userWithHome('bob/kb')
    }));
    this.controller.set('model', board({}));
    assert.false(this.controller.get('is_subject_home_board'), 'no key means no match');
    assert.true(this.controller.get('can_set_as_home'));
  });

  test('the subject is referenced_user, not the signed-in supporter', function(assert) {
    // A supporter whose OWN home board is bob/kb, viewing a communicator whose
    // home board is something else. The row must stay — it would be set for the
    // communicator, and this is not their home board.
    this.controller.set('app_state', EmberObject.create({
      sessionUser: userWithHome('bob/kb'),
      referenced_user: userWithHome('amy/core')
    }));
    this.controller.set('model', board({ key: 'bob/kb' }));
    assert.false(this.controller.get('is_subject_home_board'),
      "the supporter's own home board is irrelevant to the communicator being viewed");
    assert.true(this.controller.get('can_set_as_home'));
  });

  test('start_speak_tour marks the request as a manual replay, not an auto-open', function(assert) {
    const app_state = EmberObject.create({ currentBoardState: EmberObject.create({ key: 'bob/kb' }) });
    this.controller.set('app_state', app_state);
    this.controller.set('show_options_menu', true);

    this.controller.send('start_speak_tour');

    assert.strictEqual(app_state.get('board_detail_tour_pending_speak'), 'bob/kb',
      'pending flag carries the board key, so a stale flag cannot fire on the wrong board');
    assert.true(app_state.get('board_detail_tour_speak_manual'),
      'manual discriminator set — without it the once-per-user gate swallows the replay');
    assert.false(this.controller.get('show_options_menu'), 'menu closes behind the tour');
  });

  test('start_speak_tour is inert without a current board key', function(assert) {
    const app_state = EmberObject.create({ currentBoardState: EmberObject.create({ key: null }) });
    this.controller.set('app_state', app_state);
    this.controller.send('start_speak_tour');
    assert.strictEqual(app_state.get('board_detail_tour_pending_speak'), undefined,
      'no key means no pending flag — a keyless flag would fire on an unrelated board later');
    assert.strictEqual(app_state.get('board_detail_tour_speak_manual'), undefined,
      'and no dangling manual flag to make the next AUTO open skip its one-shot');
  });

  test('the Board Actions submenu disappears when all four children are hidden', function(assert) {
    this.controller.set('speak_menu_hidden_items', []);
    assert.true(this.controller.get('board_submenu_has_visible_items'), 'shown by default');

    this.controller.set('speak_menu_hidden_items', ['board_details', 'toggle_favorite']);
    assert.true(this.controller.get('board_submenu_has_visible_items'),
      'still shown while any child remains');

    this.controller.set('speak_menu_hidden_items',
      ['board_details', 'toggle_favorite', 'add_to_sidebar', 'other_board_actions']);
    assert.false(this.controller.get('board_submenu_has_visible_items'),
      'hidden once every child is — a disclosure onto nothing is worse than none');
  });
});
