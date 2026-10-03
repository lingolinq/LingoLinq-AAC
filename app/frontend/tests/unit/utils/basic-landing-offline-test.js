import { module, test } from 'qunit';
import { basic_landing_for } from 'frontend/utils/basic_landing';

/* Requested 2026-09-30: "basic access -> take the user to the search page". The Basic Access page
 * (`offline_boards`, reached from Modern's Extras card) has no Basic navigation, so a switch to
 * Basic there stranded the user. It lands on the board search instead, the same page as the Basic
 * Extras drawer's "Search Boards" (`search`, 'any', '_'), and, like Search, it carries no tab.
 */
module('Unit | Utility | basic_landing Basic Access', function() {
  test('the Basic Access page lands on the board search', function(assert) {
    var landing = basic_landing_for('offline_boards');
    assert.strictEqual(landing.route, 'search', 'the search page');
    assert.deepEqual(landing.models, ['any', '_'], 'any language, no query: the same as Search Boards');
    assert.notOk(landing.index_nav, 'no home-page tab to hand off');
  });
});
