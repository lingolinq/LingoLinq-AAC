import { module, test } from 'qunit';
import { tourBuilderFor, tourKeyFor } from 'frontend/utils/tours/registry';

// The dispatcher maps (route, dashboard layout) -> the page's tour builder and a
// stable completion-flag key. These are pure functions (the returned builder is a
// thunk that is NOT invoked here, so no DOM is touched).
module('Unit | Utility | tours/registry', function() {
  test('tourKeyFor returns a per-view key for the home route', function(assert) {
    assert.equal(tourKeyFor('user.home', 'gentle'), 'home_gentle');
    assert.equal(tourKeyFor('user.home', 'focused'), 'home_focused');
  });

  test('tourKeyFor defaults an unknown/blank layout to gentle', function(assert) {
    assert.equal(tourKeyFor('user.home', undefined), 'home_gentle');
    assert.equal(tourKeyFor('user.home', 'nonsense'), 'home_gentle');
  });

  test('tourKeyFor returns null for routes with no tour', function(assert) {
    assert.equal(tourKeyFor('user.boards', 'gentle'), null);
    assert.equal(tourKeyFor('board.index', 'focused'), null);
    assert.equal(tourKeyFor(undefined, 'gentle'), null);
  });

  test('tourBuilderFor returns a builder thunk for the home route in both views', function(assert) {
    assert.equal(typeof tourBuilderFor('user.home', 'gentle'), 'function');
    assert.equal(typeof tourBuilderFor('user.home', 'focused'), 'function');
  });

  test('tourBuilderFor returns null for routes with no tour', function(assert) {
    assert.equal(tourBuilderFor('user.boards', 'gentle'), null);
    assert.equal(tourBuilderFor(undefined, undefined), null);
  });
});
