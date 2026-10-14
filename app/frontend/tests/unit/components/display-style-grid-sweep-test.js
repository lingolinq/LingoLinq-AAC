import { module, test } from 'qunit';
import { _applyGridPresentation } from 'frontend/components/display-style';

/* THE DASHBOARD DESIGN PREVIEW RE-DERIVES THE GRID (adversary review, 2026-10-13). Its stale-class sweep
   (components/display-style.js#_applyGridPresentation) must cover every engine-driven grid class
   (utils/dashboard_sections.js), or a class from the live page styles the preview for the wrong layout.
   The caseload classes added on 2026-10-12 were missing: a Gentle grid's `md-grid--caseload-row-3` stayed on
   the clone after Extras was unchecked, sizing Caseload and Speak as thirds. */
module('Unit | Component | display-style | preview grid sweep', function() {
  test('the caseload layout classes are recomputed, not inherited from the live page', function(assert) {
    var grid = document.createElement('section');
    grid.className = 'md-grid md-grid--caseload-row md-grid--caseload-row-3 md-grid--caseload-beside md-grid--speak-beside';
    _applyGridPresentation(grid, { layout: 'gentle', grid: { classes: ['md-grid--caseload-row'], areasValue: '"caseload speak"', rows: 'auto' } });
    assert.true(grid.classList.contains('md-grid--caseload-row'), 'the one this layout wants is kept');
    assert.false(grid.classList.contains('md-grid--caseload-row-3'), 'a stale -3 is gone');
    assert.false(grid.classList.contains('md-grid--caseload-beside'), 'a stale caseload-beside is gone');
    assert.false(grid.classList.contains('md-grid--speak-beside'), 'as before');
  });
});
