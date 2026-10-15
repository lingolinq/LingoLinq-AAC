import { module, test } from 'qunit';
import { snapshotTiles, playHomeMove } from 'frontend/utils/home-move';

/* FOLLOW THE HOME BOARD TO THE TOP (requested 2026-10-11): setting a home board re-sorts My Boards
 * (home first) while the "open it?" dialog is still up. On "Not now" the tiles glide from where they
 * were to where they are now (FLIP), so the board does not seem to vanish, and the page scrolls to it.
 * A board that was not on screen before (a new copy) arrives with an entrance highlight instead. */
module('Unit | Utility | home-move', function(hooks) {
  var grid;
  hooks.beforeEach(function() {
    grid = document.createElement('div');
    grid.className = 'ub-boards-page__board-grid';
    grid.innerHTML = ['a', 'b', 'c'].map(function(k) {
      return '<div class="ub-boards-page__board-item" data-board-key="u/' + k + '" style="height:40px">' + k + '</div>';
    }).join('');
    (document.querySelector('#ember-testing') || document.body).appendChild(grid);
  });
  hooks.afterEach(function() { if (grid.parentNode) { grid.parentNode.removeChild(grid); } });

  function tile(k) { return grid.querySelector('[data-board-key="u/' + k + '"]'); }

  test('a tile that moved starts at its old place and glides to its new one', function(assert) {
    var snap = snapshotTiles(grid);
    grid.insertBefore(tile('c'), tile('a')); // c becomes home: now first
    playHomeMove(grid, snap, 'u/c', { reducedMotion: false, scroll: false });
    var c = tile('c');
    assert.strictEqual(c.style.transform, '', 'released to its new place');
    assert.notStrictEqual(c.style.transition.indexOf('transform'), -1, 'gliding there: ' + c.style.transition);
    assert.notStrictEqual(tile('a').style.transition.indexOf('transform'), -1, 'the tiles it displaced glide too');
    assert.ok(c.classList.contains('ub-boards-page__board-item--home-moved'), 'the home tile is highlighted');
  });

  test('a home tile that was not there before arrives with the entrance highlight', function(assert) {
    var snap = snapshotTiles(grid);
    var n = document.createElement('div');
    n.className = 'ub-boards-page__board-item'; n.setAttribute('data-board-key', 'u/new'); n.style.height = '40px';
    grid.insertBefore(n, tile('a'));
    playHomeMove(grid, snap, 'u/new', { reducedMotion: false, scroll: false });
    assert.ok(n.classList.contains('ub-boards-page__board-item--home-arrived'));
  });

  test('the scrolling container scrolls to where the board ENDS UP, not where it is drawn mid-glide', function(assert) {
    // The boards page scrolls inside #content, not the window. Right after the glide starts the
    // board is still drawn at its old (visible) place, so a check made then never scrolled.
    var box = document.createElement('div');
    box.style.cssText = 'height:100px;overflow:auto;position:relative';
    var g = document.createElement('div'); // unstyled: the app's grid class lays tiles out in a row
    for (var i = 0; i < 10; i++) { g.innerHTML += '<div data-board-key="u/k' + i + '" style="display:block;height:40px">k' + i + '</div>'; }
    box.appendChild(g);
    grid.parentNode.appendChild(box);
    box.scrollTop = 300; // k8 (320-360) is on screen
    var snap = snapshotTiles(g);
    var k8 = g.querySelector('[data-board-key="u/k8"]');
    g.insertBefore(k8, g.firstChild); // k8 is home: now first, above the visible area
    var calls = [];
    box.scrollTo = function(opts) { calls.push(opts); };
    playHomeMove(g, snap, 'u/k8', { reducedMotion: false });
    box.parentNode.removeChild(box);
    assert.strictEqual(calls.length, 1, 'the container scrolls');
    assert.true(calls[0].top < 40, 'up to the top, where the board is now: ' + calls[0].top);
    assert.strictEqual(calls[0].behavior, 'smooth');
  });

  test('reduced motion: no gliding, still highlighted', function(assert) {
    var snap = snapshotTiles(grid);
    grid.insertBefore(tile('c'), tile('a'));
    playHomeMove(grid, snap, 'u/c', { reducedMotion: true, scroll: false });
    assert.strictEqual(tile('c').style.transform, '', 'no transform');
    assert.ok(tile('c').classList.contains('ub-boards-page__board-item--home-moved'));
  });
});
