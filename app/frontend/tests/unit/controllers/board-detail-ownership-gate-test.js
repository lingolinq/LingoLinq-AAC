import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';

/* GROUPING IS GATED ON THE SUBJECT OWNING THE BOARD.
 *
 * A curated category arrangement belongs to the board it was designed for. On a board the
 * user does not own — a public library board, or someone else's board shared with them —
 * the arrangement is not theirs to rearrange, and showing a grouping they are stuck with
 * is worse than not grouping at all.
 *
 * The subject is `referenced_user`, NOT the viewer, and NOT `permissions.edit`:
 *
 *   - `permissions` is computed for the API user, so a MODELLING-ONLY supervisor reads
 *     edit:false on a communicator's board (`allows?(user,'model')` grants view;
 *     `allows?(user,'edit_boards')` grants view+edit). Gating on it would show the
 *     supervisor an ungrouped board while the communicator sees a grouped one — two
 *     people looking at differently-arranged copies of the same vocabulary.
 *   - Ownership, not edit rights: a board shared with edit rights still belongs to
 *     someone else.
 *
 * "Try this Board" needs no special case. It opens the ORIGINAL library board uncopied and
 * on purpose, so the subject does not own it and the trial renders ungrouped.
 */
module('Unit | Controller | board-detail ownership gate', function(hooks) {
  setupTest(hooks);

  function ctrl(owner, boardOwner, subjectName, prefEnabled, flagOn) {
    var c = owner.factoryFor('controller:user/board-detail').create();
    c.set('model', EmberObject.create({ user_name: boardOwner }));
    c.set('app_state', EmberObject.create({
      feature_flags: { board_category_grouping: flagOn === undefined ? true : flagOn },
      referenced_user: EmberObject.create({
        user_name: subjectName,
        preferences: { board_category_grouping: { enabled: prefEnabled } }
      })
    }));
    return c;
  }

  test('ON for a board the subject owns, with the preference on (POSITIVE CONTROL)', function(assert) {
    var c = ctrl(this.owner, 'sam', 'sam', true);
    assert.true(c.get('board_owned_by_subject'), 'PRECONDITION: ownership resolved');
    assert.true(c.get('grouping_active'), 'their own copy groups');
  });

  test('OFF on a public library board the subject does not own', function(assert) {
    var c = ctrl(this.owner, 'lingolinq', 'sam', true);
    assert.false(c.get('board_owned_by_subject'), 'lingolinq !== sam');
    assert.false(c.get('grouping_active'),
      'an arrangement the user cannot change is not shown');
  });

  /* THE SUPERVISOR CASE. referenced_user is the COMMUNICATOR when modelling, so a
     supervisor viewing the communicator's board sees what the communicator sees —
     regardless of the supervisor's own rights on it. */
  test('ON for a supervisor viewing the communicator board the COMMUNICATOR owns', function(assert) {
    // board owned by 'kid'; supervisor is driving, but referenced_user resolves to 'kid'
    var c = ctrl(this.owner, 'kid', 'kid', true);
    assert.true(c.get('grouping_active'),
      "the supervisor sees the communicator's rendered grouping, not their own permissions");
  });

  /* THE TRY-THIS-BOARD CASE, which needs no special handling: the tried board is the
     library original, uncopied by design. */
  test('OFF while trying a library board, ON once it has been copied', function(assert) {
    var trying = ctrl(this.owner, 'lingolinq', 'sam', true);
    assert.false(trying.get('grouping_active'), 'the trial renders ungrouped');
    var picked = ctrl(this.owner, 'sam', 'sam', true);
    assert.true(picked.get('grouping_active'), 'the owned copy groups');
  });

  test('the preference still gates an owned board', function(assert) {
    var c = ctrl(this.owner, 'sam', 'sam', false);
    assert.true(c.get('board_owned_by_subject'), 'PRECONDITION: they do own it');
    assert.false(c.get('grouping_active'), 'ownership does not override an off preference');
  });

  test('the feature flag still gates an owned board', function(assert) {
    var c = ctrl(this.owner, 'sam', 'sam', true, false);
    assert.false(c.get('grouping_active'), 'flag off means off');
  });

  test('a missing owner or subject reads as NOT owned, never as owned', function(assert) {
    assert.false(ctrl(this.owner, null, 'sam', true).get('board_owned_by_subject'),
      'an unloaded board must not be treated as owned');
    assert.false(ctrl(this.owner, 'sam', null, true).get('board_owned_by_subject'),
      'an unloaded user must not be treated as owner');
  });
});
