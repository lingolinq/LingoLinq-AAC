import {
  describe,
  it,
  expect,
  beforeEach
} from 'frontend/tests/helpers/jasmine';
import 'frontend/tests/helpers/ember_helper';

/*
 * grid-size-picker component coverage.
 *
 * Added with the inline conversion (the picker used to be a popover behind a
 * toggle and had no tests at all). These lock the logic the rewrite kept --
 * the fill matrix, the hover preview, the readout and commit-on-click -- so the
 * removal of the popover apparatus around them is verifiable rather than assumed.
 *
 * Unit tests on the computeds and actions, driven by direct property sets and
 * synthetic delegated events, matching the style of create-board-new-test.js.
 */
describe('GridSizePickerComponent', 'component:grid-size-picker', function() {
  var testOwner;

  beforeEach(function() {
    testOwner = this.owner;
  });

  function makePicker(attrs) {
    var picker = testOwner.factoryFor('component:grid-size-picker').create();
    picker.set('rows', 5);
    picker.set('columns', 6);
    for (var key in (attrs || {})) { picker.set(key, attrs[key]); }
    return picker;
  }

  /* The component reads coordinates off the delegated event's target via
     `closest('.nb-grid-picker__cell')`, so a synthetic event only needs to
     answer that call and the two data attributes. */
  function cellEvent(row, col) {
    var el = {
      getAttribute: function(name) {
        if (name === 'data-row') { return String(row); }
        if (name === 'data-col') { return String(col); }
        return null;
      }
    };
    return {
      target: { closest: function() { return el; } },
      preventDefault: function() {}
    };
  }

  function cellAt(picker, row, col) {
    return picker.get('matrix')[row - 1].cells[col - 1];
  }

  describe('matrix (the painted fill)', function() {
    it('fills exactly the rectangle up to the current selection', function() {
      var c = makePicker();
      expect(cellAt(c, 5, 6).on).toEqual(true);
      expect(cellAt(c, 1, 1).on).toEqual(true);
      expect(cellAt(c, 6, 6).on).toEqual(false);
      expect(cellAt(c, 5, 7).on).toEqual(false);
    });

    it('marks exactly one cell selected and tabbable (roving tabindex)', function() {
      var c = makePicker();
      var selected = [];
      var focusable = [];
      c.get('matrix').forEach(function(line) {
        line.cells.forEach(function(cell) {
          if (cell.selected) { selected.push(cell); }
          if (cell.focusable) { focusable.push(cell); }
        });
      });
      expect(selected.length).toEqual(1);
      expect(focusable.length).toEqual(1);
      expect(selected[0].row).toEqual(5);
      expect(selected[0].col).toEqual(6);
    });

    /* The ceiling is 14, lowered from 15 on request. A board ABOVE it still renders --
       it fills the grid to the edge rather than marking nothing -- and the steppers can
       still take the board past it; the picker just stops being able to show the shape. */
    it('fills to the grid edge for a board larger than the picker ceiling', function() {
      var c = makePicker({ rows: 18, columns: 4 });
      expect(c.get('markRow')).toEqual(14);
      expect(cellAt(c, 14, 4).on).toEqual(true);
      expect(cellAt(c, 14, 5).on).toEqual(false);
    });

    it('is a 14 x 14 matrix, not 15 x 15', function() {
      var c = makePicker();
      var m = c.get('matrix');
      expect(m.length).toEqual(14);
      expect(m[0].cells.length).toEqual(14);
    });
  });

  /* Going over the ceiling is ALLOWED -- the steppers are the primary control and are not
     capped -- but the picker can no longer show the shape, so it says so instead of
     silently misrepresenting the board. */
  describe('over_ceiling (the above-14 notice)', function() {
    it('is false at exactly 14 x 14, the boundary', function() {
      var c = makePicker({ rows: 14, columns: 14 });
      expect(c.get('over_ceiling')).toEqual(false);
    });

    it('is true when rows exceed the ceiling', function() {
      var c = makePicker({ rows: 15, columns: 6 });
      expect(c.get('over_ceiling')).toEqual(true);
    });

    it('is true when columns exceed the ceiling', function() {
      var c = makePicker({ rows: 5, columns: 20 });
      expect(c.get('over_ceiling')).toEqual(true);
    });

    it('exposes the ceiling for the notice copy', function() {
      var c = makePicker();
      expect(c.get('max_grid')).toEqual(14);
    });

    /* The readout keeps reporting the REAL size, not the clamped one -- reading "18 x 4"
       over a grid filled to 14 is correct; "14 x 4" would be a lie. */
    it('still reports the real size while over the ceiling', function() {
      var c = makePicker({ rows: 18, columns: 4 });
      expect(c.get('over_ceiling')).toEqual(true);
      expect(c.get('readout')).toEqual('18 × 4');
    });
  });

  describe('hover preview', function() {
    it('repaints the fill to the hovered cell, without committing', function() {
      var committed = [];
      var c = makePicker({ onChange: function(r, col) { committed.push([r, col]); } });
      c.send('preview_from_event', cellEvent(2, 3));
      expect(cellAt(c, 2, 3).on).toEqual(true);
      expect(cellAt(c, 5, 6).on).toEqual(false);
      expect(committed.length).toEqual(0);
    });

    it('falls back to the real selection once the pointer leaves', function() {
      var c = makePicker();
      c.send('preview_from_event', cellEvent(2, 3));
      c.send('clear_preview');
      expect(cellAt(c, 5, 6).on).toEqual(true);
      expect(cellAt(c, 2, 3).on).toEqual(true);
      expect(cellAt(c, 6, 6).on).toEqual(false);
    });
  });

  describe('readout', function() {
    it('shows the caller\'s real size when not hovering', function() {
      var c = makePicker();
      expect(c.get('readout')).toEqual('5 × 6');
    });

    it('shows the hovered size while sweeping', function() {
      var c = makePicker();
      c.send('preview_from_event', cellEvent(2, 3));
      expect(c.get('readout')).toEqual('2 × 3');
    });

    it('stays truthful for a board larger than the grid', function() {
      var c = makePicker({ rows: 18, columns: 4 });
      expect(c.get('readout')).toEqual('18 × 4');
    });
  });

  // The total number of buttons beside the size (requested 2026-10-02): rows x columns, and the
  // hovered size's total while sweeping, as the readout does.
  describe('total_buttons', function() {
    it('is rows times columns', function() {
      expect(makePicker().get('total_buttons')).toEqual(30);
      expect(makePicker({ rows: 18, columns: 4 }).get('total_buttons')).toEqual(72);
    });

    it('follows the hovered size while sweeping', function() {
      var c = makePicker();
      c.send('preview_from_event', cellEvent(2, 3));
      expect(c.get('total_buttons')).toEqual(6);
    });
  });

  describe('picking a cell', function() {
    it('commits straight to onChange -- no OK step', function() {
      var committed = [];
      var c = makePicker({ onChange: function(r, col) { committed.push([r, col]); } });
      c.send('pick_from_event', cellEvent(3, 7));
      expect(committed.length).toEqual(1);
      expect(committed[0][0]).toEqual(3);
      expect(committed[0][1]).toEqual(7);
    });

    /* The pick has to be visible. While the pointer is still over the grid after a click,
       sweeping on used to repaint the fill under it, so the size looked unpicked. The
       picked size now holds until the pointer leaves the grid and comes back. */
    describe('holding the picked size', function() {
      function pointerOver(row, col) {
        var ev = cellEvent(row, col);
        ev.type = 'mouseover';
        return ev;
      }
      function keyboardFocus(row, col) {
        var ev = cellEvent(row, col);
        ev.type = 'focusin';
        return ev;
      }
      function pickAt(row, col) {
        var c = makePicker();
        c.set('onChange', function(r, col2) { c.set('rows', r); c.set('columns', col2); });
        c.send('preview_from_event', pointerOver(row, col));
        c.send('pick_from_event', pointerOver(row, col));
        return c;
      }

      it('keeps the picked size painted while the pointer moves on over the grid', function() {
        var c = pickAt(3, 4);
        c.send('preview_from_event', pointerOver(8, 9));
        expect(cellAt(c, 3, 4).on).toEqual(true);
        expect(cellAt(c, 8, 9).on).toEqual(false);
        expect(c.get('readout')).toEqual('3 × 4');
      });

      it('previews again once the pointer has left the grid and come back', function() {
        var c = pickAt(3, 4);
        c.send('clear_preview');
        c.send('preview_from_event', pointerOver(8, 9));
        expect(cellAt(c, 8, 9).on).toEqual(true);
        expect(c.get('readout')).toEqual('8 × 9');
      });

      it('still previews keyboard focus after a pick', function() {
        var c = pickAt(3, 4);
        c.send('preview_from_event', keyboardFocus(5, 5));
        expect(cellAt(c, 5, 5).on).toEqual(true);
        expect(c.get('readout')).toEqual('5 × 5');
      });
    });

    it('ignores a click that landed on the grid but not on a cell', function() {
      var committed = [];
      var c = makePicker({ onChange: function(r, col) { committed.push([r, col]); } });
      c.send('pick_from_event', { target: { closest: function() { return null; } } });
      expect(committed.length).toEqual(0);
    });

    it('does not throw when no onChange was supplied', function() {
      var c = makePicker({ onChange: null });
      c.send('pick_from_event', cellEvent(3, 7));
      expect(c.get('readout')).toEqual('5 × 6');
    });
  });
});
