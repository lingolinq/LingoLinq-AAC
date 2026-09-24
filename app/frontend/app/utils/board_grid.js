/* Grid geometry for the create-board flow.
 *
 * `create-board-new` keeps the board's labels as ONE STRING (`model.grid.labels`) and its
 * shape as two separate numbers (`model.grid.rows`, `model.grid.columns`). Nothing in that
 * representation knows which cell a label lands in -- the mapping between the two lives in
 * the `preview_grid` computed, and until now it lived there ONLY.
 *
 * The Save Board completeness guard needs the same mapping to answer "is this board
 * actually finished?", so it is lifted here rather than copied: a second copy that drifted
 * would tell someone a row is empty while the grid in front of them shows it full.
 *
 * The mapping is `components/create-board-new.js:1126`:
 *
 *     idx = (order === 'columns') ? (c * rows + r) : (r * cols + c)
 *
 * The label string is split exactly as `positional_labels` splits it -- on commas AND
 * newlines, trimmed, WITHOUT dropping empties -- because a blank between two commas is a
 * deliberately empty cell (drag-dropping a tile onto a blank leaves one behind), not
 * whitespace to discard. `parsed_labels` is the filtered twin and is the wrong source here:
 * filtering is what would make a half-finished board look complete.
 *
 * Pure: no Ember, no DOM, no service lookups. Everything it needs arrives as arguments.
 */

/** Splits a labels string into a position-preserving array of cell labels.
 *  Mirrors `create-board-new.js#positional_labels`, including its tolerance for a
 *  non-string value arriving from a stash or a CSV import. */
export function split_labels(raw) {
  if(raw === null || raw === undefined) { raw = ''; }
  if(typeof raw !== 'string') { raw = '' + raw; }
  return raw.split(/\n|,/).map(function(s) { return s.trim(); });
}

/** Non-negative integer, tolerating the strings the rows/cols number inputs produce. */
function whole(value) {
  var n = parseInt(value, 10);
  if(isNaN(n) || n < 0) { return 0; }
  return n;
}

/**
 * Describes how complete a board's grid is, and how it would look with its empty rows and
 * columns removed.
 *
 * @param {Object} opts
 * @param {string} opts.labels    the raw `model.grid.labels` string
 * @param {number} opts.rows      `model.grid.rows`
 * @param {number} opts.columns   `model.grid.columns`
 * @param {string} [opts.order]   `model.grid.labels_order`; 'columns' for column-major,
 *                                anything else (the default) for row-major
 * @returns {Object} with:
 *   total         cell count (rows * columns)
 *   filled        cells holding a label
 *   empty_count   cells holding nothing
 *   is_empty      the grid has no labels at all (or no cells)
 *   is_partial    some cells are filled and some are not
 *   empty_rows    indices of rows where EVERY cell is blank
 *   empty_columns indices of columns where EVERY cell is blank
 *   can_trim      there is at least one whole empty row or column to remove, and removing
 *                 them still leaves a board
 *   trimmed       {rows, columns, labels} after removal, or null when `can_trim` is false
 */
export function analyze_grid(opts) {
  opts = opts || {};
  var rows = whole(opts.rows);
  var columns = whole(opts.columns);
  var order = (opts.order === 'columns') ? 'columns' : 'rows';
  var positional = split_labels(opts.labels);

  /* Cells are read out of the flat array rather than the array being reshaped, so labels
     PAST the end of the grid simply never get read. Over-supply is the existing
     `too_many_labels` warning's business; this guard only describes the cells that exist. */
  var cells = [];
  var filled = 0;
  for(var r = 0; r < rows; r++) {
    var row = [];
    for(var c = 0; c < columns; c++) {
      var idx = (order === 'columns') ? (c * rows + r) : (r * columns + c);
      var label = positional[idx] || '';
      if(label) { filled++; }
      row.push(label);
    }
    cells.push(row);
  }

  var total = rows * columns;
  var empty_count = total - filled;
  var is_empty = (total === 0) || (filled === 0);
  var is_partial = (filled > 0) && (empty_count > 0);

  var empty_rows = [];
  for(var er = 0; er < rows; er++) {
    var row_blank = cells[er].every(function(label) { return !label; });
    if(row_blank) { empty_rows.push(er); }
  }
  var empty_columns = [];
  for(var ec = 0; ec < columns; ec++) {
    var col_blank = true;
    for(var cr = 0; cr < rows; cr++) {
      if(cells[cr][ec]) { col_blank = false; break; }
    }
    if(col_blank) { empty_columns.push(ec); }
  }

  /* An all-blank grid trims to nothing, so it is deliberately excluded: that board is
     `is_empty`, and the empty-board dialog is the one that should speak for it. */
  var can_trim = !is_empty && (empty_rows.length > 0 || empty_columns.length > 0);

  var trimmed = null;
  if(can_trim) {
    var keep_rows = [];
    for(var kr = 0; kr < rows; kr++) {
      if(empty_rows.indexOf(kr) === -1) { keep_rows.push(kr); }
    }
    var keep_cols = [];
    for(var kc = 0; kc < columns; kc++) {
      if(empty_columns.indexOf(kc) === -1) { keep_cols.push(kc); }
    }
    /* Re-serialised in the SAME order it was read in, so a column-major board stays
       column-major and nothing appears to shuffle when the grid shrinks. */
    var out = [];
    if(order === 'columns') {
      keep_cols.forEach(function(c2) {
        keep_rows.forEach(function(r2) { out.push(cells[r2][c2]); });
      });
    } else {
      keep_rows.forEach(function(r2) {
        keep_cols.forEach(function(c2) { out.push(cells[r2][c2]); });
      });
    }
    trimmed = {
      rows: keep_rows.length,
      columns: keep_cols.length,
      labels: out.join(',')
    };
  }

  return {
    rows: rows,
    columns: columns,
    order: order,
    cells: cells,
    total: total,
    filled: filled,
    empty_count: empty_count,
    is_empty: is_empty,
    is_partial: is_partial,
    empty_rows: empty_rows,
    empty_columns: empty_columns,
    can_trim: can_trim,
    trimmed: trimmed
  };
}

export default analyze_grid;
