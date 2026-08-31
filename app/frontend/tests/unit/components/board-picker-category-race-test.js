import { module, test } from 'qunit';
import { run } from '@ember/runloop';
import RSVP from 'rsvp';
import { setupTest } from 'frontend/tests/helpers';
import LingoLinq from 'frontend/app';

/*
 * All Available Boards waits for a paged
 * mine/shared query plus a public query before painting. Switching to Cause
 * and Effect (or any other category) used to leave those requests running;
 * when they finished they wrote into the one shared `category_boards` list
 * while the selected tab was already somewhere else.
 */
module('Unit | board-picker category load race', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.origQuery = LingoLinq.store.query;
    this.buckets = {
      mine: [],
      availablePublic: [],
      starred: [],
      categoryPublic: [],
      other: []
    };
    var buckets = this.buckets;
    LingoLinq.store.query = function(type, args) {
      var defer = RSVP.defer();
      if (args && args.starred) {
        buckets.starred.push(defer);
      } else if (args && args.include_shared) {
        buckets.mine.push(defer);
      } else if (args && args.category) {
        buckets.categoryPublic.push(defer);
      } else if (args && args.public && args.per_page === 24) {
        buckets.availablePublic.push(defer);
      } else {
        buckets.other.push(defer);
      }
      return defer.promise;
    };
  });

  hooks.afterEach(function() {
    LingoLinq.store.query = this.origQuery;
    if (this.component && !this.component.isDestroyed) {
      // Testing mode disables autorun; classic component destroy needs a loop.
      // eslint-disable-next-line ember/no-runloop
      run(() => this.component.destroy());
    }
    this.component = null;
  });

  function identityList(boards) {
    var out = [];
    if (boards && boards.forEach) {
      boards.forEach(function(b) { if (b) { out.push(b); } });
    }
    return out;
  }

  function build(owner) {
    var c = owner.factoryFor('component:board-picker').create({
      searchAtTop: true
    });
    c._subjectBoardUserId = function() { return 'u1'; };
    c._preparePickerBoardList = identityList;
    c._scheduleExplainOverflowCheck = function() {};
    return c;
  }

  async function resolve(defer, boards) {
    // Testing mode disables autorun; promise then-callbacks call this.set.
    // eslint-disable-next-line ember/no-runloop
    run(function() { defer.resolve(boards.slice()); });
    await defer.promise;
    await RSVP.resolve();
  }

  test('stale All Available results do not paint into Cause and Effect', async function(assert) {
    var c = build(this.owner);
    this.component = c;

    c.send('set_category', 'available_boards');
    assert.strictEqual(this.buckets.mine.length, 1, 'mine/shared query started');
    assert.strictEqual(this.buckets.availablePublic.length, 1, 'public available query started');

    c.send('set_category', 'cause_effect');
    assert.strictEqual(c.get('current_category'), 'cause_effect');
    assert.true(!!c.get('category_boards.loading'), 'grid is loading for the new category');
    assert.strictEqual(this.buckets.starred.length, 1, 'cause-and-effect starred query started');

    await resolve(this.buckets.mine[0], [{ name: 'Available Mine', key: 'user/available-mine' }]);
    await resolve(this.buckets.availablePublic[0], [{ name: 'Available Public', key: 'public/available' }]);

    assert.strictEqual(c.get('current_category'), 'cause_effect', 'tab is still Cause and Effect');
    assert.true(!!c.get('category_boards.loading'),
      'All Available finishing late must not replace the Cause and Effect loading state');

    await resolve(this.buckets.starred[0], [{ name: 'Cause Board', key: 'public/cause' }]);

    var boards = c.get('category_boards');
    assert.strictEqual(boards.length, 1, 'Cause and Effect results paint once their own query finishes');
    assert.strictEqual(boards[0].name, 'Cause Board');
  });

  test('stale Cause and Effect results do not paint into All Available', async function(assert) {
    var c = build(this.owner);
    this.component = c;

    c.send('set_category', 'cause_effect');
    assert.strictEqual(this.buckets.starred.length, 1, 'cause-and-effect query started');

    c.send('set_category', 'available_boards');
    assert.strictEqual(c.get('current_category'), 'available_boards');
    assert.true(!!c.get('category_boards.loading'), 'grid is loading for All Available');
    assert.strictEqual(this.buckets.mine.length, 1, 'available mine query started after the switch');

    await resolve(this.buckets.starred[0], [{ name: 'Cause Board', key: 'public/cause' }]);

    assert.strictEqual(c.get('current_category'), 'available_boards');
    assert.true(!!c.get('category_boards.loading'),
      'Cause and Effect finishing late must not replace the All Available loading state');

    await resolve(this.buckets.mine[0], [{ name: 'Available Mine', key: 'user/available-mine' }]);
    await resolve(this.buckets.availablePublic[0], [{ name: 'Available Public', key: 'public/available' }]);

    var boards = c.get('category_boards');
    assert.strictEqual(boards.length, 2, 'All Available paints its own combined list');
    assert.strictEqual(boards[0].name, 'Available Mine');
    assert.strictEqual(boards[1].name, 'Available Public');
  });

  test('All Available still paints when the user stays on that tab', async function(assert) {
    var c = build(this.owner);
    this.component = c;

    c.send('set_category', 'available_boards');
    await resolve(this.buckets.mine[0], [{ name: 'Available Mine', key: 'user/available-mine' }]);
    await resolve(this.buckets.availablePublic[0], [{ name: 'Available Public', key: 'public/available' }]);

    var boards = c.get('category_boards');
    assert.strictEqual(boards.length, 2);
    assert.strictEqual(boards[0].name, 'Available Mine');
    assert.strictEqual(boards[1].name, 'Available Public');
  });

  test('returning to All Available reuses the in-session list instead of refetching', async function(assert) {
    var c = build(this.owner);
    this.component = c;

    c.send('set_category', 'available_boards');
    await resolve(this.buckets.mine[0], [{ name: 'Available Mine', key: 'user/available-mine' }]);
    await resolve(this.buckets.availablePublic[0], [{ name: 'Available Public', key: 'public/available' }]);

    c.send('set_category', 'cause_effect');
    await resolve(this.buckets.starred[0], [{ name: 'Cause Board', key: 'public/cause' }]);
    assert.strictEqual(c.get('category_boards')[0].name, 'Cause Board');

    c.send('set_category', 'available_boards');
    assert.strictEqual(this.buckets.mine.length, 1, 'does not start a second mine query');
    assert.strictEqual(this.buckets.availablePublic.length, 1, 'does not start a second public query');
    assert.strictEqual(c.get('current_category'), 'available_boards');
    assert.strictEqual(c.get('category_boards')[0].name, 'Available Mine');
    assert.strictEqual(c.get('category_boards')[1].name, 'Available Public');
  });

  test('All Available keeps loading in the background and paints when the user returns', async function(assert) {
    var c = build(this.owner);
    this.component = c;

    c.send('set_category', 'available_boards');
    c.send('set_category', 'cause_effect');
    assert.strictEqual(this.buckets.mine.length, 1, 'the original available query is still the only one');

    c.send('set_category', 'available_boards');
    assert.strictEqual(this.buckets.mine.length, 1, 'returning mid-load does not start a second query');
    assert.true(!!c.get('category_boards.loading'), 'still loading until the first fetch finishes');

    await resolve(this.buckets.mine[0], [{ name: 'Available Mine', key: 'user/available-mine' }]);
    await resolve(this.buckets.availablePublic[0], [{ name: 'Available Public', key: 'public/available' }]);

    assert.strictEqual(c.get('current_category'), 'available_boards');
    assert.strictEqual(c.get('category_boards').length, 2);
    assert.strictEqual(c.get('category_boards')[0].name, 'Available Mine');
  });

  test('Keyboards loads tagged boards instead of coming-soon placeholders', async function(assert) {
    var c = build(this.owner);
    this.component = c;

    c.send('set_category', 'keyboards');
    assert.strictEqual(c.get('current_category'), 'keyboards');
    assert.true(!!c.get('category_boards.loading'), 'starts a real category load');
    assert.strictEqual(c.get('keyboard_placeholders'), undefined, 'placeholder cards are gone');
    assert.strictEqual(this.buckets.starred.length, 1, 'queries public boards tagged keyboards');

    await resolve(this.buckets.starred[0], [{ name: 'QWERTY Keyboard', key: 'lingolinq/keyboard' }]);
    assert.strictEqual(c.get('category_boards').length, 1);
    assert.strictEqual(c.get('category_boards')[0].name, 'QWERTY Keyboard');
  });
});
