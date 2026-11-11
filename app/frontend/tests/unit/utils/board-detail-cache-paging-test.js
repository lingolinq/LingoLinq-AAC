import { module, test } from 'qunit';
import RSVP from 'rsvp';
import boardDetailCache, { TREE_WARM_MAX_PAGES, TREE_WARM_MAX_PAGES_MOBILE } from 'frontend/utils/board_detail_cache';
import capabilities from 'frontend/utils/capabilities';
import LingoLinq from 'frontend/app';
import { setupTest } from '../../helpers';
import { chainPersistenceAjax, persistenceTarget, stubOnPersistence } from '../../helpers/persistence-stub';
import { restoreStubs } from '../../helpers/jasmine';

/* THE FULL TREE ARRIVES IN PAGES (#1219 units B and B2, PR #1268). warm_full_tree_if_root_only asks for
 * /tree?offset=0 and follows next_offset, ingesting every page; it stops at the page cap (smaller on a phone or
 * tablet) or when an answer does not advance; a failed page leaves the root-only mark and a resume offset, and a
 * second failure ends the warm as partial.
 */
module('Unit | Utility | board-detail-cache paging', function(hooks) {
  setupTest(hooks);

  var savedStore, savedMobile;

  function root_page(descendants, next_offset) {
    var page = {
      root: { board: { key: 'user/home', id: '1_1', buttons: [{ id: 1 }] } },
      descendants: descendants.map(function(n) { return { board: { key: 'user/folder' + n, id: '1_' + (10 + n), buttons: [] } }; })
    };
    if (next_offset !== undefined) { page.next_offset = next_offset; }
    return page;
  }

  function offset_of(url) {
    var m = url.match(/offset=(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }

  function start_root_only() {
    boardDetailCache.ingest_tree(root_page([]), null, { root_only: true });
  }

  hooks.beforeEach(function() {
    restoreStubs();
    boardDetailCache.clear();
    savedStore = LingoLinq.store;
    savedMobile = capabilities.mobile;
    capabilities.mobile = false;
    LingoLinq.store = {
      normalize: function(type, data) { return { type: type, data: data }; },
      push: function(payload) { return payload; }
    };
    var target = persistenceTarget();
    var priorGet = (target && typeof target.get === 'function') ? target.get.bind(target) : null;
    stubOnPersistence('get', function(key) {
      if (key === 'online') { return true; }
      return priorGet ? priorGet(key) : undefined;
    });
  });

  hooks.afterEach(function() {
    boardDetailCache.clear();
    LingoLinq.store = savedStore;
    capabilities.mobile = savedMobile;
    restoreStubs();
  });

  test('walks the pages by next_offset, ingesting each, and clears the root-only mark at the end', async function(assert) {
    var urls = [];
    chainPersistenceAjax(function(url) {
      urls.push(url);
      var offset = offset_of(url);
      if (offset === 0) { return RSVP.resolve(root_page([1], 1)); }
      if (offset === 1) { return RSVP.resolve(root_page([2])); }
      return RSVP.reject({ error: 'unexpected ' + url });
    });
    start_root_only();
    var result = await boardDetailCache.warm_full_tree_if_root_only('user/home');
    assert.deepEqual(urls.map(offset_of), [0, 1], 'each request carries the previous answer\'s next_offset');
    assert.true(result.warmed);
    assert.strictEqual(result.descendant_count, 2);
    assert.notOk(result.partial);
    assert.ok(boardDetailCache.get('user/folder1'), 'page 1 cached');
    assert.ok(boardDetailCache.get('user/folder2'), 'page 2 cached');
    assert.notOk(boardDetailCache.is_root_only('user/home'), 'the warm is complete');
    assert.notOk(boardDetailCache.is_root_only('user/home'), 'no second loop afterwards');
  });

  test('an answer without next_offset (a server from before paging) ends after one request', async function(assert) {
    var urls = [];
    chainPersistenceAjax(function(url) { urls.push(url); return RSVP.resolve(root_page([1])); });
    start_root_only();
    var result = await boardDetailCache.warm_full_tree_if_root_only('user/home');
    assert.strictEqual(urls.length, 1);
    assert.strictEqual(result.descendant_count, 1);
    assert.notOk(boardDetailCache.is_root_only('user/home'));
  });

  test('a next_offset that does not advance stops the loop', async function(assert) {
    var urls = [];
    chainPersistenceAjax(function(url) { urls.push(url); return RSVP.resolve(root_page([offset_of(url) + 1], 3)); });
    start_root_only();
    var result = await boardDetailCache.warm_full_tree_if_root_only('user/home');
    assert.deepEqual(urls.map(offset_of), [0, 3]);
    assert.strictEqual(result.descendant_count, 2);
    assert.notOk(boardDetailCache.is_root_only('user/home'));
  });

  test('stops at the page cap, smaller on a phone or tablet, and reports the warm as partial', async function(assert) {
    var urls = [];
    chainPersistenceAjax(function(url) { urls.push(url); var o = offset_of(url); return RSVP.resolve(root_page([o + 1], o + 1)); });
    start_root_only();
    var result = await boardDetailCache.warm_full_tree_if_root_only('user/home');
    assert.strictEqual(urls.length, TREE_WARM_MAX_PAGES);
    assert.true(result.partial);
    assert.strictEqual(result.descendant_count, TREE_WARM_MAX_PAGES);
    assert.notOk(boardDetailCache.is_root_only('user/home'), 'a capped warm counts as done; deeper folders load on tap');

    urls = [];
    boardDetailCache.clear();
    capabilities.mobile = true;
    start_root_only();
    result = await boardDetailCache.warm_full_tree_if_root_only('user/home');
    assert.strictEqual(urls.length, TREE_WARM_MAX_PAGES_MOBILE);
    assert.true(result.partial);
  });

  test('a failed later page leaves the mark and resumes there; a second failure ends the warm as partial', async function(assert) {
    var urls = [];
    chainPersistenceAjax(function(url) {
      urls.push(url);
      var offset = offset_of(url);
      if (offset === 0) { return RSVP.resolve(root_page([1], 1)); }
      return RSVP.reject({ error: 'server error', status: 500 });
    });
    start_root_only();
    var first = await boardDetailCache.warm_full_tree_if_root_only('user/home');
    assert.false(first.warmed);
    assert.ok(boardDetailCache.get('user/folder1'), 'the page that arrived is kept');
    assert.ok(boardDetailCache.is_root_only('user/home'), 'the mark stays: the warm is not complete');
    var second = await boardDetailCache.warm_full_tree_if_root_only('user/home');
    assert.deepEqual(urls.map(offset_of), [0, 1, 1], 'the second warm resumes at the failed page, not from the start');
    assert.true(second.partial);
    assert.notOk(boardDetailCache.is_root_only('user/home'), 'a page that cannot be served does not cause a warm on every open');
  });
});
