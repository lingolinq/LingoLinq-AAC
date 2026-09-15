import { setupTest } from 'frontend/tests/helpers';
import * as QUnit from 'qunit';

/*
 * Measured placement for the listbox (`@auto_flip`).
 *
 * The registration month/year pickers sit near the BOTTOM of their step, so a downward
 * panel runs past the fold and the page has to be scrolled to see the whole thing. Rather
 * than flipping unconditionally -- which just trades a clipped bottom for a clipped top on
 * a short viewport -- the component measures on open and flips only when down cannot show
 * the whole panel AND up has more room.
 *
 * The decision is pure arithmetic on purpose. `#ember-testing` applies a transform, so any
 * assertion built on real getBoundingClientRect numbers would be measuring the harness as
 * much as the component. These pin the rule; the browser pass pins the geometry.
 */
QUnit.module('Unit | Component | bound-select auto-flip', function(hooks) {
  setupTest(hooks);

  function component(owner) {
    return owner.factoryFor('component:bound-select').create();
  }

  QUnit.test('stays DOWN when the panel fits below', function(assert) {
    var c = component(this.owner);
    // trigger 100..144 in an 800 viewport: 650 below, panel needs 360.
    assert.false(c._shouldFlip(100, 144, 360, 800), 'plenty of room below, so no flip');
    c.destroy();
  });

  QUnit.test('flips UP when the panel would need the page scrolled', function(assert) {
    var c = component(this.owner);
    // The real reported case: trigger 479..523 in an 800 viewport. Only 271 below.
    assert.true(c._shouldFlip(479, 523, 360, 800),
      'the year panel cannot show its whole self below, and there is more room above');
    assert.true(c._shouldFlip(479, 523, 289, 800),
      'the month panel is shorter but still does not fit, so it flips with the year');
    c.destroy();
  });

  QUnit.test('stays DOWN when up is no better -- never trade one clipped edge for another', function(assert) {
    var c = component(this.owner);
    // Trigger near the TOP: 40..84 in an 800 viewport. 710 below, only 34 above.
    assert.false(c._shouldFlip(40, 84, 900, 800),
      'the panel fits in neither direction, so it keeps the side with more room');
    c.destroy();
  });

  QUnit.test('the boundary is exact-fit, which stays DOWN', function(assert) {
    var c = component(this.owner);
    // 800 - 523 - 6 gap = 271 available below.
    assert.false(c._shouldFlip(479, 523, 271, 800), 'exactly fits below');
    assert.true(c._shouldFlip(479, 523, 272, 800), 'one pixel too tall flips');
    c.destroy();
  });

  /* The space a panel COULD occupy, not what it currently does. This is what makes the
     month and year pickers agree: both grid listboxes share one 360px cap, so a row of
     them flips together instead of splitting apart at some viewport heights. */
  QUnit.test('space needed is the max-height cap when there is one', function(assert) {
    var c = component(this.owner);
    assert.strictEqual(c._panelSpaceNeeded('360px', 289), 360,
      'a short month list still reserves the cap, so it decides the same as the year list');
    assert.strictEqual(c._panelSpaceNeeded('360px', 900), 360,
      'a long list is capped and scrolls internally, so it never needs more than the cap');
    c.destroy();
  });

  QUnit.test('space needed falls back to content height with no cap', function(assert) {
    var c = component(this.owner);
    assert.strictEqual(c._panelSpaceNeeded('none', 289), 289, 'no cap, so the content height');
    assert.strictEqual(c._panelSpaceNeeded('', 150), 150, 'unreadable cap, so the content height');
    c.destroy();
  });
});
