import { module, test } from 'qunit';
import { navPillSummary } from 'frontend/utils/tours/home';

/* THE HOME TOUR'S NAV OVERVIEW NAMES EACH PILL BY ITS LABEL (2026-10-01, review Low, verified). It
 * read each pill's whole `textContent`, so the Updates pill's count badge and its screen-reader text
 * ("has new updates", user-pill-nav.hbs) ran into its label: "Updates3has new updates".
 */
module('Unit | Utility | home tour navPillSummary', function(hooks) {
  var nav;
  hooks.afterEach(function() { if (nav && nav.parentNode) { nav.parentNode.removeChild(nav); } nav = null; });

  test('the Updates pill is named without its badge or screen-reader text', function(assert) {
    nav = document.createElement('nav');
    nav.className = 'md-pillnav';
    nav.innerHTML = '<a data-tour-pill>Boards</a><a data-tour-pill>Updates<span class="md-pillnav__badge">3</span><span class="sr-only">has new updates</span></a>';
    (document.querySelector('#ember-testing') || document.body).appendChild(nav);
    assert.strictEqual(navPillSummary(), 'Boards and Updates');
  });
});
