import { module, test } from 'qunit';
import { tourBuilderFor, tourKeyFor } from 'frontend/utils/tours/registry';

/* The guided-tour registry maps a page to its step builder.
 *
 * Before the classic branch existed, `user.home` mapped to the MODERN home builder
 * regardless of the user's view style — so a classic user who pressed "Take a tour" got a
 * tour whose eight targets are all `.md-*` selectors that do not exist on the classic
 * page. Not "no tour": a tour that spotlights nothing.
 *
 * These assert the branch itself rather than the step contents, because the branch is
 * what was wrong. The builders are exercised by their own DOM-driven skipping.
 */
module('Unit | Utility | tours registry — classic branch', function() {
  // Asserts the STEPS, not the thunks. Comparing the two returned functions with
  // notStrictEqual was hollow: the registry builds a fresh closure per call, so two
  // MODERN builders are already !== each other and the assertion passed with the classic
  // branch deleted. Step ids are what actually distinguish the two tours.
  //
  // Safe without a DOM: the interior steps resolve targets via visibleEl() and are all
  // skipped here, but the centered welcome step has no target and is always present.
  test('a classic user on the home route gets the CLASSIC steps', function(assert) {
    var classicSteps = tourBuilderFor('user.home', 'gentle', false, true)();
    var modernSteps = tourBuilderFor('user.home', 'gentle', false, false)();
    assert.strictEqual(classicSteps[0].id, 'classic_tour_welcome',
      'classic tour leads with its own welcome step');
    assert.notStrictEqual(modernSteps[0].id, 'classic_tour_welcome',
      'the modern tour does not — so the branch, not the closure identity, is what differs');
  });

  test('the classic home tour is reachable from the index route too', function(assert) {
    // The classic home renders on BOTH `/` (index) and `/:user_id/home` (user.home) —
    // templates/index.hbs hosts both views and user.home reuses its template. The modern
    // registry only ever handled user.home, so `/` had no tour at all.
    assert.strictEqual(typeof tourBuilderFor('index', 'gentle', false, true), 'function',
      'classic index resolves a builder');
    assert.strictEqual(tourBuilderFor('index', 'gentle', false, false), null,
      'a MODERN user on index still gets no tour — unchanged behaviour');
  });

  test('the classic tour has its own completion key', function(assert) {
    assert.strictEqual(tourKeyFor('user.home', 'gentle', false, true), 'home_classic',
      'classic key');
    assert.strictEqual(tourKeyFor('user.home', 'gentle', false, false), 'home_gentle',
      'modern key is unchanged');
    assert.strictEqual(tourKeyFor('index', 'gentle', false, true), 'home_classic',
      'index carries the same classic key, so the tour is not offered twice');
  });

  test('omitting isClassic leaves every existing caller on the modern builders', function(assert) {
    // The four existing tours call this with three arguments. The fourth must be
    // optional-and-falsy, not required.
    assert.strictEqual(tourKeyFor('user.home', 'focused'), 'home_focused', 'home focused');
    assert.strictEqual(tourKeyFor('caseload', 'gentle'), 'caseload_gentle', 'caseload');
    assert.strictEqual(typeof tourBuilderFor('board-picker', 'gentle'), 'function', 'board picker');
  });
});
