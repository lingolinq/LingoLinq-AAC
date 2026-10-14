import { module, test } from 'qunit';
import { gridLayoutState, AREA } from 'frontend/utils/dashboard_sections';

/* SPEAK AND EXTRAS SIDE BY SIDE, NOT ON TOP OF EACH OTHER (2026-10-10).
 *
 * bb07e4d7b paired Speak and Extras on one Gentle row (`"speak extras"`), but an older safety
 * net in app.scss forced both cards to `grid-column: 1 / -1 !important`, so both spanned the
 * whole row in the same cell and Extras painted over Speak (measured: both at x=276, 936x180,
 * on /example/home at 1280px). That rule exists for a card the browser would otherwise
 * auto-place into a new track because the layout gave it NO area. So the layout engine now
 * says which of the two it placed, and the rule applies only to a card it did not:
 * `md-grid--speak-placed` / `md-grid--extras-placed`.
 *
 * Swept every visibility combination of every section, in Gentle and in Focused under every
 * hero: in Gentle both cards always have an area (so the span was always wrong there). Focused
 * places Extras too since it started showing there (2026-10-10). The sweep below pins that the
 * flag tracks the areas exactly, whatever the layout places.
 */
module('Unit | Utility | dashboard grid: Speak/Extras placement flags', function() {
  function has(state, cls) { return state.classes.indexOf(cls) !== -1; }

  test('Gentle pairs Speak and Extras on one row, and flags both as placed', function(assert) {
    var s = gridLayoutState({ speak: true, extras: true, boards: true }, null, 'gentle', null);
    assert.deepEqual(s.areas[0], 'speak extras', 'the pair shares a row');
    assert.true(has(s, 'md-grid--speak-placed'));
    assert.true(has(s, 'md-grid--extras-placed'));
  });

  test('a lone Gentle Speak card is placed too (half a row, not stretched)', function(assert) {
    var s = gridLayoutState({ speak: true, boards: true }, null, 'gentle', null);
    assert.true(has(s, 'md-grid--speak-placed'));
    assert.false(has(s, 'md-grid--extras-placed'), 'Extras is not visible, so not placed');
  });

  test('Focused places Extras beside the Speak hero (2026-10-10), so it is flagged', function(assert) {
    var s = gridLayoutState({ speak: true, extras: true, boards: true }, null, 'focused', 'speak');
    assert.true(has(s, 'md-grid--extras-placed'));
    assert.true(has(s, 'md-grid--speak-placed'), 'the Speak hero owns its full row');
  });

  test('the flags match the built areas for every visibility combination and hero', function(assert) {
    var keys = Object.keys(AREA);
    var runs = [['gentle', null], ['focused', 'speak'], ['focused', 'caseload'], ['focused', 'org'], ['focused', 'rooms'], ['focused', 'attention']];
    var mismatches = [];
    for (var m = 0; m < (1 << keys.length); m++) {
      var vis = {};
      keys.forEach(function(k, i) { vis[k] = !!(m & (1 << i)); });
      runs.forEach(function(run) {
        var s = gridLayoutState(vis, null, run[0], run[1]);
        ['speak', 'extras'].forEach(function(card) {
          var inAreas = s.areas.some(function(row) { return row.split(' ').indexOf(card) !== -1; });
          if (inAreas !== has(s, 'md-grid--' + card + '-placed')) {
            mismatches.push(run.join('/') + ' ' + card + ' vis=' + JSON.stringify(vis));
          }
        });
      });
    }
    assert.deepEqual(mismatches.slice(0, 5), [], 'placed flag === card has an area, in every case');
  });
});
