import { module, test } from 'qunit';
import { filter_users } from 'frontend/utils/user_filter';

/* THE SEARCH FILTER ON THE COMMUNICATOR PICKER.
 *
 * `components/user-select` renders the list for several callers -- the Select User for Reports
 * modal, copy-board, button-suggestions, assessment-settings -- so the MATCHING RULE lives here
 * rather than in the component: it is a fact about how a name is matched, the component only
 * decides whether to show the box at all.
 *
 * The entries are plain objects, not records: `{id, name, image, disabled}` built in
 * `users_with_extras`, plus synthetic rows for loading/error/divider states. Anything here must
 * survive all of those shapes without throwing, because the picker renders them in the same
 * list.
 */
module('Unit | Utility | user_filter', function() {
  var LIST = [
    { id: '1', name: 'aiden_parker' },
    { id: '2', name: 'Bella Martinez', user_name: 'bella_martinez' },
    { id: '3', name: 'charlie_kim' },
    { id: '4', name: 'Dana Whitfield', user_name: 'district_admin' }
  ];

  /* A blank box must not filter. The picker renders `filtered_users` unconditionally so that
     callers WITHOUT a search box get the same code path -- if an empty query dropped rows, every
     one of those callers would render an empty list. */
  test('a blank query returns the list untouched', function(assert) {
    assert.expect(4);
    assert.strictEqual(filter_users(LIST, ''), LIST, 'empty string is the same array, not a copy');
    assert.strictEqual(filter_users(LIST, null), LIST, 'null');
    assert.strictEqual(filter_users(LIST, undefined), LIST, 'undefined');
    assert.strictEqual(filter_users(LIST, '   '), LIST, 'whitespace only');
  });

  test('matches on the displayed name, case-insensitively', function(assert) {
    assert.expect(3);
    assert.deepEqual(filter_users(LIST, 'aiden').map((u) => u.id), ['1'], 'lower case');
    assert.deepEqual(filter_users(LIST, 'BELLA').map((u) => u.id), ['2'], 'upper case');
    assert.deepEqual(filter_users(LIST, 'Kim').map((u) => u.id), ['3'], 'mixed case, mid-name');
  });

  /* The picker shows the DISPLAY name, but a supervisor knows people by their login too --
     "Dana Whitfield" is `district_admin`, and typing the username must find her. */
  test('matches on user_name as well as name', function(assert) {
    assert.expect(2);
    assert.deepEqual(filter_users(LIST, 'district').map((u) => u.id), ['4'], 'username only');
    assert.deepEqual(filter_users(LIST, 'whitfield').map((u) => u.id), ['4'], 'display name only');
  });

  /* Substring, not prefix: a supervisor scanning for "martinez" should not have to remember
     whether the list shows first name first. */
  test('matches anywhere in the string, and returns several', function(assert) {
    assert.expect(2);
    assert.deepEqual(filter_users(LIST, 'a').map((u) => u.id), ['1', '2', '3', '4'], 'a common letter');
    assert.deepEqual(filter_users(LIST, 'zzz'), [], 'no match is an empty list, not everything');
  });

  /* Defensive, because the list really does carry rows with no name and the component hands
     this whatever `users` currently is -- including undefined during the first render. */
  test('survives the shapes the real list carries', function(assert) {
    assert.expect(3);
    assert.deepEqual(filter_users(undefined, 'x'), [], 'no list at all');
    assert.deepEqual(filter_users([{ id: 'divider' }, { id: '1', name: 'aiden' }], 'aiden').map((u) => u.id),
      ['1'], 'an entry with no name is skipped rather than throwing');
    assert.deepEqual(filter_users([{ id: 'x', name: null }], 'a'), [], 'a null name is skipped');
  });
});
