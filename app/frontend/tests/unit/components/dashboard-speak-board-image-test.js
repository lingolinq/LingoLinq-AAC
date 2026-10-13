import { module, test } from 'qunit';
import Service from '@ember/service';
import EmberObject from '@ember/object';
import { setupTest } from '../../helpers';

/* THE SPEAK CARD SHOWS THE BOARD IT OPENS (requested 2026-10-13: "on the speak mode card, instead of
 * showing the image that is on that card, show the board's image for the board it will take the user
 * to"). components/dashboard/authenticated-view.js#speakBoardImage: the picture of the board `go('speak')`
 * opens (speak_target: the home board, else the last board used), or null so the card keeps its own image. */
module('Unit | Component | dashboard speak card board image', function(hooks) {
  setupTest(hooks);

  function board(id, key, img) { return EmberObject.create({ id: id, key: key, icon_url_with_fallback: img }); }

  function setup(context, opts) {
    var records = (opts.records || []).slice();
    var fetched = [];
    context.owner.unregister('service:app-state');
    context.owner.register('service:app-state', Service.extend({
      currentUser: EmberObject.create({ user_name: 'aiden', preferences: opts.home ? { home_board: opts.home } : {}, supervisees: [] }),
      feature_flags: {}
    }));
    context.owner.unregister('service:stashes');
    context.owner.register('service:stashes', Service.extend({
      get: function(k) { return k === 'root_board_state' ? (opts.last || null) : null; },
      persist: function() {}
    }));
    context.owner.unregister('service:store');
    context.owner.register('service:store', Service.extend({
      peekRecord: function(type, id) { return records.find(function(r) { return r.get('id') === id; }) || null; },
      peekAll: function() { return records; },
      findRecord: function(type, key) {
        fetched.push(key);
        var later = opts.loads && opts.loads[key];
        if (!later) { return Promise.reject({ status: 404 }); }
        // The record reaches the store when the request comes back, as a real fetch does.
        return Promise.resolve().then(function() { records.push(later); return later; });
      },
      query: function() { return Promise.resolve([]); }
    }));
    return { fetched: fetched, comp: context.owner.factoryFor('component:dashboard/authenticated-view').create() };
  }

  test('the home board\'s picture, when its record is loaded', function(assert) {
    var t = setup(this, { home: { id: '1_5', key: 'aiden/core' }, records: [board('1_5', 'aiden/core', '/img/core.png')] });
    assert.strictEqual(t.comp.get('speakBoardImage'), '/img/core.png');
    assert.deepEqual(t.fetched, [], 'nothing fetched');
  });

  test('a home board not in the store yet is loaded once, then its picture shows', async function(assert) {
    var t = setup(this, { home: { id: '1_6', key: 'lingolinq/keyboard' }, loads: { 'lingolinq/keyboard': board('1_6', 'lingolinq/keyboard', '/img/keyboard.png') } });
    assert.strictEqual(t.comp.get('speakBoardImage'), null, 'the card keeps its own image meanwhile');
    await new Promise(function(r) { setTimeout(r, 0); });
    assert.deepEqual(t.fetched, ['lingolinq/keyboard'], 'fetched by key, once');
    assert.strictEqual(t.comp.get('speakBoardImage'), '/img/keyboard.png');
  });

  test('no home board: the last board used', function(assert) {
    var t = setup(this, { last: { id: '1_9', key: 'aiden/food' }, records: [board('1_9', 'aiden/food', '/img/food.png')] });
    assert.strictEqual(t.comp.get('speakBoardImage'), '/img/food.png');
  });

  test('no board to go to: no picture, so the card keeps its own image', function(assert) {
    var t = setup(this, {});
    assert.strictEqual(t.comp.get('speakBoardImage'), null);
  });
});
