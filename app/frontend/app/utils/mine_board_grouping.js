import EmberObject from '@ember/object';
import { get as emberGet } from '@ember/object';
import LingoLinq from '../app';

/* ──────────────────────────────────────────────────────────────────
   mine_board_grouping
   ──────────────────────────────────────────────────────────────────
   Shared helper for the Mine-tab transformation that the boards page
   (user/index.js#board_list) applies on top of the flat list returned
   by the server. Used by:
     - controllers/user/index.js     (boards page Mine list)
     - controllers/application.js    (My Boards picker Mine tab)
   Keeping both surfaces in sync was the whole reason this lives
   here — when the My Boards picker showed many more boards than the
   page, it was because the page silently applied this transform
   client-side and the picker didn't.

   The three exports are intentionally independent (each can be used
   on its own), but the canonical pipeline is:
     filtered = filter_tag_folders(rows, tag_map, drill_in)
     grouped  = group_copies(filtered, user_id, { cluster_orphans })
     sorted   = sort_mine(grouped, home_board_key)
   For backwards-compat with the existing boards-page in-place logic,
   user/index.js still inlines its own implementation; this helper
   mirrors that exact behavior so the picker doesn't drift.
   ────────────────────────────────────────────────────────────── */

export function invert_board_tag_map(map) {
  var inv = {};
  if (!map || typeof map !== 'object') { return inv; }
  Object.keys(map).forEach(function(tag) {
    (map[tag] || []).forEach(function(gid) {
      if (!gid) { return; }
      inv[gid] = inv[gid] || [];
      if (inv[gid].indexOf(tag) === -1) {
        inv[gid].push(tag);
      }
    });
  });
  return inv;
}

export function all_tagged_global_ids(map) {
  var s = {};
  if (!map || typeof map !== 'object') { return s; }
  Object.keys(map).forEach(function(tag) {
    (map[tag] || []).forEach(function(gid) {
      if (gid) { s[gid] = true; }
    });
  });
  return s;
}

/* Group flat board list by copy lineage. Mirrors the loop at
   user/index.js#board_list lines 446-520. Each root becomes a
   { board, children: [{board}], orphan? } row; copies whose root
   isn't present cluster under an "Orphan Boards id:<copy_id>" row
   when `cluster_orphans` is true (Mine-tab default). Shallow clones
   ("<copy>-<user>" ids) belonging to the current user are treated
   as roots themselves and absorb their child shallow clones. */
export function group_copies(flat_boards, user_id, options) {
  options = options || {};
  var cluster_orphans = !!options.cluster_orphans;
  var list = flat_boards || [];
  var copies = {};
  var roots = [];
  var shallow_roots = {};

  list.forEach(function(b) {
    if (!b) { return; }
    var bidRaw = emberGet(b, 'id');
    if (bidRaw == null || bidRaw === '') { return; }
    var bid = String(bidRaw);
    if (bid.match(/-/) && (!emberGet(b, 'copy_id') || emberGet(b, 'copy_id') == bid || emberGet(b, 'copy_id') == bid.split(/-/)[0])) {
      var owner_id = bid.split(/-/)[1];
      if (owner_id == user_id) {
        shallow_roots[emberGet(b, 'copy_id') || bid.split(/-/)[0]] = b;
      }
    }
  });

  list.forEach(function(b) {
    if (!b) { return; }
    var bidRaw2 = emberGet(b, 'id');
    if (bidRaw2 == null || bidRaw2 === '') { return; }
    var bid = String(bidRaw2);
    if (bid.match(/-/) && bid.split(/-/)[1] == user_id && emberGet(b, 'copy_id') && shallow_roots[emberGet(b, 'copy_id')]) {
      var shallow = shallow_roots[emberGet(b, 'copy_id')];
      var sid = emberGet(shallow, 'id');
      copies[sid] = copies[sid] || [];
      copies[sid].push(b);
    } else if (emberGet(b, 'copy_id') && emberGet(b, 'copy_id') != bid) {
      var copy_id = emberGet(b, 'copy_id');
      copies[copy_id] = copies[copy_id] || [];
      copies[copy_id].push(b);
    } else {
      roots.push(b);
    }
  });

  var rows = [];
  roots.forEach(function(b) {
    if (!b) { return; }
    var obj = { board: b, children: [] };
    var id = emberGet(b, 'id');
    if (copies[id]) {
      copies[id].forEach(function(c) { obj.children.push({ board: c }); });
      delete copies[id];
    }
    rows.push(obj);
  });

  /* Leftover copies (root never present in the list). Mine-tab
     clusters them under a synthetic "Orphan Boards id:<copy_id>"
     row; other tabs would just flatten them as siblings. */
  for (var orphan_id in copies) {
    if (cluster_orphans) {
      var obj = {
        board: LingoLinq.store.createRecord('board', { name: 'Orphan Boards id:' + orphan_id }),
        children: [],
        orphan: true
      };
      copies[orphan_id].forEach(function(c) { obj.children.push({ board: c }); });
      rows.push(obj);
    } else {
      copies[orphan_id].forEach(function(c) {
        rows.push({ board: c, children: [] });
      });
    }
  }

  return rows;
}

/* Apply the tag-folder filter. Mirrors user/index.js#board_list
   lines 531-577. When the user has board-folder tags configured,
   the Mine root view hides every board that's been sorted into a
   folder — those boards are visible only when the user drills
   into the folder. With `drill_in` set, ONLY boards in that
   folder are kept; otherwise tagged boards are filtered out and
   tagged children are filtered out of grouped rows. */
export function filter_tag_folders(rows, tag_map, drill_in) {
  if (!rows) { return []; }
  if (!tag_map || typeof tag_map !== 'object' || Object.keys(tag_map).length === 0) {
    return rows;
  }
  var tagged_set = all_tagged_global_ids(tag_map);
  var ids_in_drill = {};
  if (drill_in) {
    (tag_map[drill_in] || []).forEach(function(gid) {
      if (gid) { ids_in_drill[gid] = true; }
    });
  }
  var is_tagged = function(board) {
    if (!board || !board.get) { return false; }
    var gid = board.get('global_id');
    if (gid && tagged_set[gid]) { return true; }
    var bid = board.get('id');
    if (bid && bid !== gid && tagged_set[bid]) { return true; }
    return false;
  };
  var is_in_drill = function(board) {
    if (!board || !board.get) { return false; }
    var gid = board.get('global_id');
    if (gid && ids_in_drill[gid]) { return true; }
    var bid = board.get('id');
    if (bid && bid !== gid && ids_in_drill[bid]) { return true; }
    return false;
  };
  var filtered = rows.filter(function(row) {
    if (row.orphan) { return !drill_in; }
    if (!row.board || !row.board.get) { return true; }
    if (drill_in) { return is_in_drill(row.board); }
    return !is_tagged(row.board);
  });
  /* Also strip tagged children out of grouped rows so a root with
     a tagged copy doesn't leak the tagged copy into the main view. */
  if (!drill_in) {
    filtered.forEach(function(row) {
      if (row.children && row.children.length) {
        row.children = row.children.filter(function(child) {
          return !is_tagged(child.board);
        });
      }
    });
  }
  return filtered;
}

/* Mine-tab sort: Home Board first, then liked/favorite boards
   alphabetically by name, then everything else alphabetically.
   Mirrors user/index.js#board_list lines 578-605. */
export function sort_mine(rows, home_key) {
  if (!rows || !rows.slice) { return rows || []; }
  return rows.slice().sort(function(a, b) {
    var a_board = a && a.board;
    var b_board = b && b.board;
    if (!a_board || !a_board.get) { return 1; }
    if (!b_board || !b_board.get) { return -1; }
    var a_is_home = a_board.get('key') === home_key;
    var b_is_home = b_board.get('key') === home_key;
    if (a_is_home && !b_is_home) { return -1; }
    if (b_is_home && !a_is_home) { return 1; }
    var a_star = a_board.get('starred_for_current_user');
    var b_star = b_board.get('starred_for_current_user');
    if (a_star && !b_star) { return -1; }
    if (b_star && !a_star) { return 1; }
    var a_name = (a_board.get('name') || '').toLowerCase();
    var b_name = (b_board.get('name') || '').toLowerCase();
    return a_name.localeCompare(b_name);
  });
}

/* Convenience wrapper that runs the full pipeline. Returns the
   row list ready for rendering, plus a flat array of just the
   visible boards (one per row) for surfaces like the My Boards
   picker that render tiles rather than rows-with-children. */
export function transform_mine(flat_boards, user, options) {
  options = options || {};
  var user_id = user && user.get ? user.get('id') : (user && user.id);
  var tag_map = user && user.get ? user.get('board_tag_map') : (user && user.board_tag_map);
  var home_key = user && user.get
    ? user.get('preferences.home_board.key')
    : (user && user.preferences && user.preferences.home_board && user.preferences.home_board.key);

  var rows = group_copies(flat_boards, user_id, { cluster_orphans: true });
  rows = filter_tag_folders(rows, tag_map, options.drill_in);
  rows = sort_mine(rows, home_key);

  var flat_visible = rows
    .filter(function(row) { return row && row.board && !row.orphan; })
    .map(function(row) { return row.board; });

  return { rows: rows, boards: flat_visible };
}

/* Folder summaries for the strip: [{ tag, count }] sorted alpha.
   Mirrors user/index.js#mineTagFolderSummaries (unfiltered variant —
   we don't apply a filter-string filter here since the picker has
   its own filter UI flow). */
export function folder_summaries(tag_map) {
  if (!tag_map || typeof tag_map !== 'object') { return []; }
  var keys = Object.keys(tag_map).sort();
  return keys.map(function(tag) {
    return EmberObject.create({ tag: tag, count: (tag_map[tag] || []).length });
  });
}

export default {
  invert_board_tag_map: invert_board_tag_map,
  all_tagged_global_ids: all_tagged_global_ids,
  group_copies: group_copies,
  filter_tag_folders: filter_tag_folders,
  sort_mine: sort_mine,
  transform_mine: transform_mine,
  folder_summaries: folder_summaries
};
