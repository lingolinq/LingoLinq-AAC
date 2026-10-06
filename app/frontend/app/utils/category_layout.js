/*
 * A board's SAVED category layout, resolved against the buttons the board page is showing
 * (2026-10-05; docs/task-management/2026-10-05_category-layout-on-board.md).
 *
 * The layout is stored on the board (`board.category_layout`, cleaned server-side by
 * Board#sanitize_category_layout, app/models/board.rb):
 *   {version, rows, columns, order: [[button_id|null]...], cells: [[block_index|null]...],
 *    blocks: [{category}...]}
 * `order` places each button; `cells` names the outlined block each cell belongs to, and the
 * block names its category. Outlines are drawn where the BLOCK changes, not the category, so two
 * blocks of one category (Vocal Flair 112's keyboard folder beside its keys) still get a line.
 *
 * Nothing falls back silently. A layout id the board no longer shows leaves an empty cell; a
 * shown button the layout does not place takes the first free cell (category extra). Either way
 * every button stays reachable and nothing else on the board moves.
 *
 * `order` in the result is the placement by button id, row by row: the matrix switch scanning
 * reads instead of the board's own grid order while the layout is on screen (utils/scanner.js).
 */

/* A KEYBOARD board is never categorized: its layout is spatial (QWERTY), not vocabulary.
   The one rule the grid (BoardDetailGrid#isKeyboardBoard) and the board page's scan grid
   (controllers/user/board-detail.js#category_layout_grid) both use, so they cannot disagree
   about whether the layout is on screen. Same key-suffix convention as models/board.js. */
export function is_keyboard_board_key(key) {
  return typeof key === 'string' && /(^|[-_/])keyboard$/i.test(key);
}

function read(obj, key) {
  if(!obj) { return null; }
  if(typeof obj.get === 'function') { return obj.get(key); }
  return obj[key];
}

function usable(layout) {
  if(!layout || typeof layout !== 'object') { return false; }
  var rows = parseInt(layout.rows, 10);
  var columns = parseInt(layout.columns, 10);
  return rows > 0 && columns > 0 && Array.isArray(layout.order);
}

export function resolve_category_layout(layout, button_rows) {
  if(!usable(layout)) { return null; }
  var rows = parseInt(layout.rows, 10);
  var columns = parseInt(layout.columns, 10);
  var blocks = Array.isArray(layout.blocks) ? layout.blocks : [];

  // The buttons on show, by id, in the board's reading order (so unplaced ones fill in order).
  var by_id = {};
  var shown = [];
  (button_rows || []).forEach(function(row) {
    (row || []).forEach(function(btn) {
      if(!btn || read(btn, 'empty')) { return; }
      var id = read(btn, 'id');
      if(id === null || id === undefined) { return; }
      var key = String(id);
      if(by_id[key]) { return; }
      by_id[key] = btn;
      shown.push(key);
    });
  });

  var grid = [];
  var placed = {};
  for(var r = 0; r < rows; r++) {
    var order_row = Array.isArray(layout.order[r]) ? layout.order[r] : [];
    var cell_row = Array.isArray((layout.cells || [])[r]) ? layout.cells[r] : [];
    grid.push([]);
    for(var c = 0; c < columns; c++) {
      var raw = order_row[c];
      var key = (raw === null || raw === undefined) ? null : String(raw);
      var btn = (key && by_id[key] && !placed[key]) ? by_id[key] : null;
      if(btn) { placed[key] = true; }
      var block = cell_row[c];
      block = (typeof block === 'number' && block >= 0 && block < blocks.length) ? block : null;
      grid[r].push({ row: r, col: c, btn: btn, id: btn ? read(btn, 'id') : null, block: block });
    }
  }

  // Shown buttons the layout does not place: first free cells, reading order. A free cell is one
  // with no button AND no block, so an intentionally empty slot inside a block stays empty.
  var unplaced = shown.filter(function(key) { return !placed[key]; });
  for(var r2 = 0; r2 < rows && unplaced.length; r2++) {
    for(var c2 = 0; c2 < columns && unplaced.length; c2++) {
      var cell = grid[r2][c2];
      if(!cell.btn && cell.block === null) {
        var next = by_id[unplaced.shift()];
        cell.btn = next;
        cell.id = read(next, 'id');
      }
    }
  }

  // A cell with no block is its own outline: give each one a unique identity for the compare.
  var identity = function(cell) { return cell.block === null ? ('solo_' + cell.row + '_' + cell.col) : ('b' + cell.block); };
  var same = function(r3, c3, me) {
    if(r3 < 0 || c3 < 0 || r3 >= rows || c3 >= columns) { return false; }
    return identity(grid[r3][c3]) === me;
  };

  var cells = [];
  var order = [];
  for(var r4 = 0; r4 < rows; r4++) {
    order.push([]);
    for(var c4 = 0; c4 < columns; c4++) {
      var cur = grid[r4][c4];
      var me = identity(cur);
      var blk = cur.block === null ? null : blocks[cur.block];
      cur.category = (blk && typeof blk.category === 'string' && blk.category) ? blk.category : 'extra';
      cur.edges = {
        top: !same(r4 - 1, c4, me),
        right: !same(r4, c4 + 1, me),
        bottom: !same(r4 + 1, c4, me),
        left: !same(r4, c4 - 1, me)
      };
      if(!cur.btn) {
        cur.btn = { id: 'layout_empty_' + r4 + '_' + c4, label: '', empty: true };
      }
      order[r4].push(cur.id === undefined ? null : cur.id);
      cells.push(cur);
    }
  }
  return { rows: rows, columns: columns, cells: cells, order: order };
}
