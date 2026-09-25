/**
 * MATCHING A TYPED QUERY AGAINST THE COMMUNICATOR PICKER'S LIST.
 *
 * `components/user-select` serves several callers -- the Select User for Reports modal
 * (`switch-communicators`), copy-board, button-suggestions, assessment-settings -- and only some
 * of them show a search box. The matching RULE lives here so the component is left deciding one
 * thing: whether to render the box. The rule itself is tested in
 * tests/unit/utils/user-filter-test.js.
 *
 * A BLANK QUERY RETURNS THE SAME ARRAY, not a filtered copy. The picker renders this on every
 * path, including for callers with no search box at all, so "no query" has to mean "no change" --
 * and returning the identical reference keeps Ember from re-rendering the grid for nothing.
 *
 * The entries are plain objects built in `users_with_extras` (`{id, name, image, disabled}`),
 * plus synthetic rows for the loading, error and divider states. Anything without a usable name
 * is skipped rather than throwing, because those rows are in the same list.
 */
export function filter_users(list, query) {
  if(!list) { return []; }
  var q = (query || '').trim().toLowerCase();
  if(!q) { return list; }
  return list.filter(function(u) {
    if(!u) { return false; }
    /* BOTH NAMES. The picker shows the display name, but a supervisor knows people by their
       login too -- "Dana Whitfield" is `district_admin`, and typing either has to find her. */
    var name = (u.name || '').toString().toLowerCase();
    var user_name = (u.user_name || '').toString().toLowerCase();
    return name.indexOf(q) !== -1 || user_name.indexOf(q) !== -1;
  });
}

export default filter_users;
