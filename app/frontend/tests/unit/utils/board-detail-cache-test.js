import { module, test } from 'qunit';
import RSVP from 'rsvp';
import boardDetailCache from 'frontend/utils/board_detail_cache';
import boardsPageListCache from 'frontend/utils/boards_page_list_cache';
import LingoLinq from 'frontend/app';
import { setupTest } from '../../helpers';
import { chainPersistenceAjax, persistenceTarget, stubOnPersistence } from '../../helpers/persistence-stub';
import { restoreStubs } from '../../helpers/jasmine';

var savedDocumentHiddenDesc = null;
var savedAppState = null;
var savedStore = null;

function restoreLingoLinqTestGlobals() {
  if (savedAppState !== null) {
    LingoLinq.appState = savedAppState;
    savedAppState = null;
  }
  if (savedStore !== null) {
    LingoLinq.store = savedStore;
    savedStore = null;
  }
}

function stashLingoLinqGlobals() {
  savedAppState = LingoLinq.appState;
  savedStore = LingoLinq.store;
}

function restoreDocumentHidden() {
  if (savedDocumentHiddenDesc) {
    Object.defineProperty(document, 'hidden', savedDocumentHiddenDesc);
    savedDocumentHiddenDesc = null;
    return;
  }
  try {
    delete document.hidden;
  } catch (e) { /* ignore */ }
}

function resetDocumentHiddenForTest() {
  restoreDocumentHidden();
  var hiddenDesc = Object.getOwnPropertyDescriptor(document, 'hidden');
  if (hiddenDesc && typeof hiddenDesc.get === 'function' && hiddenDesc.configurable) {
    savedDocumentHiddenDesc = hiddenDesc;
    try {
      delete document.hidden;
    } catch (e) { /* ignore */ }
  }
}

function stubBoardDetailCacheOnline() {
  var target = persistenceTarget();
  var priorGet = (target && typeof target.get === 'function') ? target.get.bind(target) : null;
  stubOnPersistence('get', function(key) {
    if (key === 'online') { return true; }
    if (priorGet) {
      return priorGet(key);
    }
    return undefined;
  });
}

function stubBoardDetailCacheAjax(ajaxFn) {
  stubBoardDetailCacheOnline();
  chainPersistenceAjax(ajaxFn);
}

function prefetchFeatureFlags(opts) {
  opts = opts || {};
  var flags = {};
  if (opts.catalog !== false) {
    flags.catalog_board_prefetch = true;
  }
  if (opts.background) {
    flags.background_board_prefetch = true;
  }
  return flags;
}

function runPrefetchPipeline(user, warmOpts) {
  return boardDetailCache._run_prefetch_pipeline(user, warmOpts, { gapMs: 0 });
}

module('Unit | Utility | board-detail-cache', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    restoreStubs();
    boardDetailCache.clear();
    boardsPageListCache.setMineListBusy(false);
    boardsPageListCache.setBoardsPageActive(false);
    resetDocumentHiddenForTest();
    stashLingoLinqGlobals();
    stubBoardDetailCacheOnline();
  });

  hooks.afterEach(function() {
    boardDetailCache.clear();
    boardsPageListCache.setMineListBusy(false);
    boardsPageListCache.setBoardsPageActive(false);
    restoreDocumentHidden();
    restoreLingoLinqTestGlobals();
    restoreStubs();
  });

  test('set skips re-caching a fresh entry unless force is true', function(assert) {
    var raw = { key: 'user/board-a', id: '1_1', buttons: [] };
    var first = boardDetailCache.set(raw);
    first.ordered_buttons = [[{ id: 'btn-1' }]];
    first.ordered_for = { skin: 'default' };

    var second = boardDetailCache.set({ key: 'user/board-a', id: '1_1', buttons: [{ id: 'new' }] });
    assert.strictEqual(second, first, 'returns existing entry');
    assert.strictEqual(second.raw.buttons.length, 0, 'does not replace raw payload');
    assert.ok(second.ordered_buttons, 'preserves ordered_buttons');

    var forced = boardDetailCache.set({ key: 'user/board-a', id: '1_1', buttons: [{ id: 'new' }] }, { force: true });
    assert.notStrictEqual(forced, first, 'force creates a new entry object');
    assert.strictEqual(forced.raw.buttons.length, 1, 'force replaces raw payload');
    assert.notOk(forced.ordered_buttons, 'force clears ordered_buttons');
  });

  test('ingest_tree with warm_root_images false still caches descendants without replacing a fresh root', function(assert) {
    var origStore = LingoLinq.store;
    var pushed = [];
    LingoLinq.store = {
      normalize: function(type, data) { return { type: type, data: data }; },
      push: function(payload) { pushed.push(payload); return payload; }
    };

    var rootRaw = { key: 'user/root', id: '1_100', buttons: [{ id: 1 }] };
    var rootEntry = boardDetailCache.set(rootRaw, { force: true });
    rootEntry.ordered_buttons = [[{ id: 1 }]];

    var tree = {
      root: { board: { key: 'user/root', id: '1_100', buttons: [{ id: 99 }] } },
      descendants: [
        { board: { key: 'user/child-a', id: '1_101', buttons: [] } },
        { board: { key: 'user/child-b', id: '1_102', buttons: [] } }
      ]
    };
    var ok = boardDetailCache.ingest_tree(tree, null, { force: false, warm_root_images: false });
    assert.ok(ok, 'ingest succeeds');
    assert.strictEqual(boardDetailCache.get('user/root'), rootEntry.raw, 'keeps painted root payload');
    assert.ok(rootEntry.ordered_buttons, 'preserves ordered_buttons on painted root');
    assert.ok(boardDetailCache.get('user/child-a'), 'caches first descendant');
    assert.ok(boardDetailCache.get('user/child-b'), 'caches second descendant');
    LingoLinq.store = origStore;
  });

  test('root_only ingest marks the entry; full-tree ingest clears it and caches descendants', function(assert) {
    var origStore = LingoLinq.store;
    LingoLinq.store = {
      normalize: function(type, data) { return { type: type, data: data }; },
      push: function(payload) { return payload; }
    };

    var lite = {
      root: { board: { key: 'user/home', id: '1_1', buttons: [{ id: 1 }] } },
      descendants: []
    };
    boardDetailCache.ingest_tree(lite, null, { root_only: true });
    assert.ok(boardDetailCache.is_root_only('user/home'), 'prefetch lite tree is marked root_only');
    assert.notOk(boardDetailCache.get('user/folder'), 'descendants are not cached yet');

    var skipped = boardDetailCache.set({ key: 'user/home', id: '1_1', buttons: [{ id: 9 }] });
    assert.ok(boardDetailCache.is_root_only('user/home'), 'bare set() does not clear the root_only mark');
    assert.strictEqual(skipped.raw.buttons[0].id, 1, 'bare set() does not replace lite payload');

    var full = {
      root: { board: { key: 'user/home', id: '1_1', buttons: [{ id: 1 }] } },
      descendants: [
        { board: { key: 'user/folder', id: '1_2', buttons: [] } }
      ]
    };
    boardDetailCache.ingest_tree(full, null, { force: false, warm_root_images: false, root_only: false });
    assert.notOk(boardDetailCache.is_root_only('user/home'), 'full tree clears root_only');
    assert.ok(boardDetailCache.get('user/folder'), 'full tree caches descendants');

    LingoLinq.store = origStore;
  });

  test('warm_full_tree_if_root_only fetches full /tree on a root_only hit and no-ops after', function(assert) {
    var origStore = LingoLinq.store;
    var treeUrls = [];
    LingoLinq.store = {
      normalize: function(type, data) { return { type: type, data: data }; },
      push: function(payload) { return payload; }
    };

    stubBoardDetailCacheAjax(function(url) {
      treeUrls.push(url);
      if (url.indexOf('/tree') !== -1 && url.indexOf('root_only') === -1) {
        return RSVP.resolve({
          root: { board: { key: 'user/home', id: '1_1', buttons: [{ id: 1 }] } },
          descendants: [
            { board: { key: 'user/folder', id: '1_2', buttons: [] } }
          ]
        });
      }
      return RSVP.reject({ error: 'unexpected ' + url });
    });

    boardDetailCache.ingest_tree({
      root: { board: { key: 'user/home', id: '1_1', buttons: [{ id: 1 }] } },
      descendants: []
    }, null, { root_only: true });

    return boardDetailCache.warm_full_tree_if_root_only('user/home').then(function(result) {
      assert.ok(result.warmed, 'warms from a root_only cache hit');
      assert.strictEqual(result.descendant_count, 1);
      assert.strictEqual(treeUrls.length, 1, 'issues one full /tree');
      assert.strictEqual(treeUrls[0].indexOf('root_only'), -1, 'full /tree has no root_only param');
      assert.ok(boardDetailCache.get('user/folder'), 'folder tap target is cached');
      assert.notOk(boardDetailCache.is_root_only('user/home'), 'mark cleared after ingest');
      return boardDetailCache.warm_full_tree_if_root_only('user/home');
    }).then(function(second) {
      assert.notOk(second.warmed, 'second call no-ops once the tree is full');
      assert.strictEqual(treeUrls.length, 1, 'does not refetch full /tree');
      LingoLinq.store = origStore;
    }, function(err) {
      LingoLinq.store = origStore;
      throw err;
    });
  });

  test('root_only ingest does not downgrade a fresh full-tree cache', function(assert) {
    var origStore = LingoLinq.store;
    LingoLinq.store = {
      normalize: function(type, data) { return { type: type, data: data }; },
      push: function(payload) { return payload; }
    };

    boardDetailCache.ingest_tree({
      root: { board: { key: 'user/home', id: '1_1', buttons: [] } },
      descendants: [{ board: { key: 'user/folder', id: '1_2', buttons: [] } }]
    }, null, { root_only: false });
    assert.notOk(boardDetailCache.is_root_only('user/home'));

    boardDetailCache.ingest_tree({
      root: { board: { key: 'user/home', id: '1_1', buttons: [] } },
      descendants: []
    }, null, { root_only: true });
    assert.notOk(boardDetailCache.is_root_only('user/home'), 'does not mark an already-full entry root_only');
    assert.ok(boardDetailCache.get('user/folder'), 'keeps descendants from the full tree');

    LingoLinq.store = origStore;
  });

  test('warm_linked_images warms cached child boards without refetching', function(assert) {
    var url = 'https://example.com/child-symbol.png';
    var parent = {
      key: 'user/parent',
      id: '1_10',
      buttons: [{ load_board: { key: 'user/child', id: '1_11' } }]
    };
    boardDetailCache.set({
      key: 'user/child',
      id: '1_11',
      buttons: [],
      images: [{ id: 'img-1', url: url }],
      image_urls: { 'img-1': url }
    });

    var OriginalImage = window.Image;
    var loadCount = 0;
    window.Image = function() {
      loadCount++;
      return { complete: true, onload: null, onerror: null, src: '' };
    };

    return boardDetailCache.warm_linked_images(parent).then(function() {
      window.Image = OriginalImage;
      assert.equal(loadCount, 1, 'warms images for cached linked board');
    }, function(err) {
      window.Image = OriginalImage;
      throw err;
    });
  });

  test('warm_images skips URLs already warmed for another board', function(assert) {
    var url = 'https://example.com/symbol-a.png';
    var sharedImage = { id: 'img-1', url: url };
    var raw1 = {
      key: 'user/board-b',
      id: '1_2',
      images: [sharedImage],
      image_urls: { 'img-1': url }
    };
    var raw2 = {
      key: 'user/board-c',
      id: '1_3',
      images: [sharedImage],
      image_urls: { 'img-1': url }
    };
    var OriginalImage = window.Image;
    var loadCount = 0;
    window.Image = function() {
      loadCount++;
      return { complete: true, onload: null, onerror: null, src: '' };
    };

    return boardDetailCache.warm_images(raw1).then(function() {
      loadCount = 0;
      return boardDetailCache.warm_images(raw2);
    }).then(function() {
      window.Image = OriginalImage;
      assert.equal(loadCount, 0, 'does not create Image() for an already-warmed URL');
    }, function(err) {
      window.Image = OriginalImage;
      throw err;
    });
  });

  test('prefetch_lingolinq_catalog lists roots then fetches each tree', function(assert) {
    var calls = [];
    var origAppState = LingoLinq.appState;

    stubBoardDetailCacheAjax(function(url, opts) {
      calls.push({ url: url, type: opts && opts.type });
      if (url.indexOf('user_id=lingolinq') !== -1) {
        return RSVP.resolve({
          board: [
            { key: 'lingolinq/board-a', id: '1_1' },
            { key: 'lingolinq/board-b', id: '1_2' }
          ],
          meta: { more: false }
        });
      }
      if (url.indexOf('q=&sort=popularity') !== -1 || url.indexOf('q=&') !== -1) {
        return RSVP.resolve({ board: [], meta: { more: false } });
      }
      if (url.indexOf('/tree') !== -1) {
        var key = url.split('/boards/')[1].split('/tree')[0];
        return RSVP.resolve({
          root: { board: { key: key, id: '1_root', buttons: [] } },
          descendants: key.indexOf('board-a') !== -1 ?
            [{ board: { key: 'lingolinq/sub-a', id: '1_sub', buttons: [] } }] : []
        });
      }
      return RSVP.reject({ error: 'unexpected url' });
    });

    LingoLinq.appState = {
      get: function(path) {
        if (path === 'feature_flags.catalog_board_prefetch') { return true; }
        return null;
      }
    };

    var user = {
      get: function(k) {
        if (k === 'feature_flags') { return prefetchFeatureFlags(); }
        if (k === 'id') { return '2_99'; }
        if (k === 'preferences.skin') { return 'default'; }
        if (k === 'preferences.preferred_symbols') { return 'original'; }
        if (k === 'preferences.locale') { return 'en'; }
        return null;
      }
    };

    return boardDetailCache.prefetch_lingolinq_catalog(user, null, { gapMs: 0 }).then(function() {
      LingoLinq.appState = origAppState;

      assert.ok(calls.some(function(c) { return c.url.indexOf('user_id=lingolinq') !== -1; }), 'lists lingolinq roots');
      var treeCalls = calls.filter(function(c) { return c.url.indexOf('/tree') !== -1; });
      assert.equal(treeCalls.length, 2, 'fetches a tree per root');
      assert.ok(treeCalls[0].url.indexOf('board-a') !== -1, 'first tree is board-a');
      assert.ok(treeCalls[1].url.indexOf('board-b') !== -1, 'second tree is board-b');
      assert.ok(boardDetailCache.get('lingolinq/sub-a'), 'caches descendants as JSON only');
    }, function(err) {
      LingoLinq.appState = origAppState;
      throw err;
    });
  });

  test('prefetch_lingolinq_catalog skips roots already fresh in cache', function(assert) {
    var calls = [];
    var origAppState = LingoLinq.appState;

    boardDetailCache.set({ key: 'lingolinq/board-a', id: '1_1', buttons: [] });

    stubBoardDetailCacheAjax(function(url) {
      calls.push(url);
      if (url.indexOf('user_id=lingolinq') !== -1) {
        return RSVP.resolve({
          board: [
            { key: 'lingolinq/board-a', id: '1_1' },
            { key: 'lingolinq/board-b', id: '1_2' }
          ],
          meta: { more: false }
        });
      }
      if (url.indexOf('q=&sort=popularity') !== -1 || url.indexOf('q=&') !== -1) {
        return RSVP.resolve({ board: [], meta: { more: false } });
      }
      if (url.indexOf('board-b/tree') !== -1) {
        return RSVP.resolve({
          root: { board: { key: 'lingolinq/board-b', id: '1_2', buttons: [] } },
          descendants: []
        });
      }
      return RSVP.reject({ error: 'unexpected url' });
    });

    LingoLinq.appState = {
      get: function(path) {
        if (path === 'feature_flags.catalog_board_prefetch') { return true; }
        return null;
      }
    };

    var user = {
      get: function(k) {
        if (k === 'feature_flags') { return prefetchFeatureFlags(); }
        if (k === 'id') { return '2_99'; }
        return null;
      }
    };

    return boardDetailCache.prefetch_lingolinq_catalog(user, null, { gapMs: 0 }).then(function() {
      LingoLinq.appState = origAppState;
      var treeCalls = calls.filter(function(u) { return u.indexOf('/tree') !== -1; });
      assert.equal(treeCalls.length, 1, 'only fetches uncached root');
      assert.ok(treeCalls[0].indexOf('board-b') !== -1, 'skipped cached board-a');
    }, function(err) {
      LingoLinq.appState = origAppState;
      throw err;
    });
  });

  test('get_ordered_buttons returns null when url_cache_primed context differs', function(assert) {
    var raw = { key: 'user/board-a', id: '1_1', buttons: [] };
    boardDetailCache.set(raw);
    var grid = [[{ id: 'btn-1' }]];
    boardDetailCache.set_ordered_buttons('user/board-a', grid, {
      skin: 'default',
      preferred_symbols: null,
      edit_mode: false,
      label_locale: 'en',
      url_cache_primed: false
    });
    var hit = boardDetailCache.get_ordered_buttons('user/board-a', {
      skin: 'default',
      preferred_symbols: null,
      edit_mode: false,
      label_locale: 'en',
      url_cache_primed: true
    });
    assert.notOk(hit, 'url_cache_primed mismatch invalidates ordered_buttons cache');
  });

  test('prefetch_lingolinq_catalog warms images for root only', function(assert) {
    var origAppState = LingoLinq.appState;
    var warmCalls = [];
    var origWarm = boardDetailCache.warm_images;

    boardDetailCache.warm_images = function(raw) {
      warmCalls.push(raw && raw.key);
      return RSVP.resolve();
    };

    stubBoardDetailCacheAjax(function(url) {
      if (url.indexOf('user_id=lingolinq') !== -1) {
        return RSVP.resolve({
          board: [{ key: 'lingolinq/board-a', id: '1_1' }],
          meta: { more: false }
        });
      }
      if (url.indexOf('q=&sort=popularity') !== -1 || url.indexOf('q=&') !== -1) {
        return RSVP.resolve({ board: [], meta: { more: false } });
      }
      if (url.indexOf('/tree') !== -1) {
        return RSVP.resolve({
          root: { board: { key: 'lingolinq/board-a', id: '1_1', buttons: [] } },
          descendants: [{ board: { key: 'lingolinq/sub-a', id: '1_sub', buttons: [] } }]
        });
      }
      return RSVP.reject({ error: 'unexpected url' });
    });

    LingoLinq.appState = {
      get: function(path) {
        if (path === 'feature_flags.catalog_board_prefetch') { return true; }
        return null;
      }
    };

    var user = {
      get: function(k) {
        if (k === 'feature_flags') { return prefetchFeatureFlags(); }
        if (k === 'id') { return '2_99'; }
        return null;
      }
    };

    return boardDetailCache.prefetch_lingolinq_catalog(user, null, { gapMs: 0 }).then(function() {
      LingoLinq.appState = origAppState;
      boardDetailCache.warm_images = origWarm;
      assert.equal(warmCalls.length, 1, 'warms root images once');
      assert.equal(warmCalls[0], 'lingolinq/board-a', 'does not warm descendant images');
    }, function(err) {
      LingoLinq.appState = origAppState;
      boardDetailCache.warm_images = origWarm;
      throw err;
    });
  });

  test('prefetch pipeline runs home then liked then owned when background flag enabled', function(assert) {
    var treeOrder = [];
    var origAppState = LingoLinq.appState;

    LingoLinq.appState = {
      get: function(path) {
        if (path === 'feature_flags.background_board_prefetch') { return true; }
        return null;
      }
    };

    stubBoardDetailCacheAjax(function(url) {
      if (url.indexOf('/tree') !== -1) {
        var key = url.split('/boards/')[1].split('/tree')[0];
        treeOrder.push(key);
        return RSVP.resolve({
          root: { board: { key: key, id: '1_x', buttons: [] } },
          descendants: []
        });
      }
      if (url.indexOf('user_id=1_50') !== -1) {
        return RSVP.resolve({
          board: [{ key: 'user/owned', id: '1_20' }],
          meta: { more: false }
        });
      }
      if (url.indexOf('user_id=lingolinq') !== -1) {
        return RSVP.resolve({ board: [], meta: { more: false } });
      }
      if (url.indexOf('q=&') !== -1) {
        return RSVP.resolve({ board: [], meta: { more: false } });
      }
      return RSVP.reject({ error: 'unexpected ' + url });
    });

    var user = {
      get: function(k) {
        if (k === 'feature_flags') { return prefetchFeatureFlags({ background: true, catalog: false }); }
        if (k === 'id') { return '1_50'; }
        if (k === 'preferences.home_board') { return { key: 'user/home', id: '1_1' }; }
        if (k === 'preferences.skin') { return 'default'; }
        if (k === 'preferences.preferred_symbols') { return 'original'; }
        if (k === 'preferences.locale') { return 'en'; }
        if (k === 'stats.starred_board_refs') { return [{ key: 'user/liked' }]; }
        return null;
      }
    };

    return runPrefetchPipeline(user, { skin: 'default', preferred_symbols: 'original' }).then(function() {
      LingoLinq.appState = origAppState;
      assert.deepEqual(treeOrder, ['user/home', 'user/liked', 'user/owned'], 'runs phased trees in order');
    }, function(err) {
      LingoLinq.appState = origAppState;
      throw err;
    });
  });

  test('prefetch pipeline skips extended phases when background flag off', function(assert) {
    var treeOrder = [];
    var origAppState = LingoLinq.appState;

    LingoLinq.appState = { get: function() { return null; } };

    stubBoardDetailCacheAjax(function(url) {
      if (url.indexOf('/tree') !== -1) {
        var key = url.split('/boards/')[1].split('/tree')[0];
        treeOrder.push(key);
        return RSVP.resolve({
          root: { board: { key: key, id: '1_x', buttons: [] } },
          descendants: []
        });
      }
      if (url.indexOf('user_id=1_50') !== -1 || url.indexOf('user_id=lingolinq') !== -1 || url.indexOf('q=&') !== -1) {
        return RSVP.resolve({ board: [], meta: { more: false } });
      }
      return RSVP.reject({ error: 'unexpected ' + url });
    });

    var user = {
      get: function(k) {
        if (k === 'feature_flags') { return prefetchFeatureFlags({ catalog: false, background: false }); }
        if (k === 'id') { return '1_50'; }
        if (k === 'preferences.home_board') { return { key: 'user/home', id: '1_1' }; }
        if (k === 'preferences.skin') { return 'default'; }
        if (k === 'preferences.preferred_symbols') { return 'original'; }
        if (k === 'stats.starred_board_refs') { return [{ key: 'user/liked' }]; }
        return null;
      }
    };

    return runPrefetchPipeline(user, { skin: 'default', preferred_symbols: 'original' }).then(function() {
      LingoLinq.appState = origAppState;
      assert.deepEqual(treeOrder, ['user/home'], 'only home phase when flag off');
    }, function(err) {
      LingoLinq.appState = origAppState;
      throw err;
    });
  });

  test('prefetch pipeline skips roots already fresh in cache', function(assert) {
    var treeOrder = [];
    var origAppState = LingoLinq.appState;

    boardDetailCache.set({ key: 'user/liked', id: '1_2', buttons: [] });

    LingoLinq.appState = {
      get: function(path) {
        if (path === 'feature_flags.background_board_prefetch') { return true; }
        return null;
      }
    };

    stubBoardDetailCacheAjax(function(url) {
      if (url.indexOf('/tree') !== -1) {
        var key = url.split('/boards/')[1].split('/tree')[0];
        treeOrder.push(key);
        return RSVP.resolve({
          root: { board: { key: key, id: '1_x', buttons: [] } },
          descendants: []
        });
      }
      if (url.indexOf('user_id=1_50') !== -1) {
        return RSVP.resolve({ board: [], meta: { more: false } });
      }
      if (url.indexOf('user_id=lingolinq') !== -1) {
        return RSVP.resolve({ board: [], meta: { more: false } });
      }
      if (url.indexOf('q=&') !== -1) {
        return RSVP.resolve({ board: [], meta: { more: false } });
      }
      return RSVP.reject({ error: 'unexpected ' + url });
    });

    var user = {
      get: function(k) {
        if (k === 'feature_flags') { return prefetchFeatureFlags({ background: true, catalog: false }); }
        if (k === 'id') { return '1_50'; }
        if (k === 'preferences.home_board') { return { key: 'user/home', id: '1_1' }; }
        if (k === 'preferences.skin') { return 'default'; }
        if (k === 'preferences.preferred_symbols') { return 'original'; }
        if (k === 'preferences.locale') { return 'en'; }
        if (k === 'stats.starred_board_refs') { return [{ key: 'user/liked' }]; }
        return null;
      }
    };

    return runPrefetchPipeline(user, { skin: 'default', preferred_symbols: 'original' }).then(function() {
      LingoLinq.appState = origAppState;
      assert.deepEqual(treeOrder, ['user/home'], 'skips cached liked board');
    }, function(err) {
      LingoLinq.appState = origAppState;
      throw err;
    });
  });

  test('prefetch pipeline does not mark phase done when interrupted mid-phase', function(assert) {
    var treeCount = 0;
    var origAppState = LingoLinq.appState;

    LingoLinq.appState = {
      get: function(path) {
        if (path === 'feature_flags.background_board_prefetch') { return true; }
        return null;
      }
    };

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: function() { return treeCount >= 1; }
    });

    stubBoardDetailCacheAjax(function(url) {
      if (url.indexOf('/tree') !== -1) {
        treeCount++;
        var key = url.split('/boards/')[1].split('/tree')[0];
        return RSVP.resolve({
          root: { board: { key: key, id: '1_x', buttons: [] } },
          descendants: []
        });
      }
      if (url.indexOf('user_id=1_50') !== -1) {
        return RSVP.resolve({ board: [], meta: { more: false } });
      }
      if (url.indexOf('user_id=lingolinq') !== -1) {
        return RSVP.resolve({ board: [], meta: { more: false } });
      }
      if (url.indexOf('q=&') !== -1) {
        return RSVP.resolve({ board: [], meta: { more: false } });
      }
      return RSVP.reject({ error: 'unexpected ' + url });
    });

    var user = {
      get: function(k) {
        if (k === 'feature_flags') { return prefetchFeatureFlags({ background: true, catalog: false }); }
        if (k === 'id') { return '1_50'; }
        if (k === 'preferences.home_board') { return { key: 'user/home', id: '1_1' }; }
        if (k === 'preferences.skin') { return 'default'; }
        if (k === 'preferences.preferred_symbols') { return 'original'; }
        if (k === 'preferences.locale') { return 'en'; }
        if (k === 'stats.starred_board_refs') {
          return [{ key: 'user/liked-a' }, { key: 'user/liked-b' }];
        }
        return null;
      }
    };

    return runPrefetchPipeline(user, { skin: 'default', preferred_symbols: 'original' }).then(function() {
      var phaseDone = boardDetailCache._prefetch_phase_done['1_50'] || {};
      assert.ok(phaseDone.phase1, 'phase1 marked done when home tree finishes');
      assert.notOk(phaseDone.phase2, 'phase2 stays incomplete when tab hidden mid-phase');
      LingoLinq.appState = origAppState;
    }, function(err) {
      LingoLinq.appState = origAppState;
      throw err;
    });
  });

  test('prefetch_caseload_for_user caps supervisees and dedupes reruns', function(assert) {
    var treeCalls = [];
    var findCalls = [];
    var origStore = LingoLinq.store;
    var origAppState = LingoLinq.appState;

    LingoLinq.appState = { get: function() { return null; } };
    LingoLinq.store = {
      peekRecord: function() {
        return null;
      },
      findRecord: function(type, id) {
        findCalls.push({ type: type, id: id });
        return RSVP.resolve({
          get: function(k) {
            if (k === 'id') { return id; }
            if (k === 'preferences.home_board') { return { key: 'student-' + id + '/home', id: id + '-home' }; }
            if (k === 'preferences.skin') { return 'default'; }
            if (k === 'preferences.preferred_symbols') { return 'original'; }
            if (k === 'stats.starred_board_refs') { return []; }
            return null;
          }
        });
      },
      normalize: function(type, raw) {
        return { data: { id: raw.id, type: type, attributes: raw } };
      },
      push: function() {}
    };

    stubBoardDetailCacheAjax(function(url) {
      if (url.indexOf('/tree') !== -1) {
        var key = url.split('/boards/')[1].split('/tree')[0];
        treeCalls.push(key);
        return RSVP.resolve({
          root: { board: { key: key, id: '1_x', buttons: [] } },
          descendants: []
        });
      }
      return RSVP.reject({ error: 'unexpected ' + url });
    });

    var supervisor = {
      get: function(k) {
        if (k === 'id') { return '9_1'; }
        if (k === 'supervisees') {
          return [
            { id: '1_1' },
            { id: '1_2' },
            { id: '1_3' }
          ];
        }
        return null;
      }
    };

    var first = boardDetailCache.prefetch_caseload_for_user(supervisor, { cap: 2, gapMs: 0, pipelineGapMs: 0 });
    var second = boardDetailCache.prefetch_caseload_for_user(supervisor, { cap: 2, gapMs: 0, pipelineGapMs: 0 });
    assert.strictEqual(second, first, 'returns the running prefetch promise for the same supervisor');

    return first.then(function() {
      return boardDetailCache.prefetch_caseload_for_user(supervisor, { cap: 2, gapMs: 0, pipelineGapMs: 0 });
    }).then(function() {
      LingoLinq.store = origStore;
      LingoLinq.appState = origAppState;

      assert.deepEqual(treeCalls, ['student-1_1/home', 'student-1_2/home'], 'prefetches only the capped supervisee set');
      assert.deepEqual(findCalls.map(function(c) { return c.id; }), ['1_1', '1_2'], 'loads full supervisee user records once');
    }, function(err) {
      LingoLinq.store = origStore;
      LingoLinq.appState = origAppState;
      throw err;
    });
  });

  test('prefetch_caseload_for_user retries after interrupted phased prefetch', function(assert) {
    var treeCalls = [];
    var treeCount = 0;
    var hidden = false;
    var origStore = LingoLinq.store;
    var origAppState = LingoLinq.appState;

    LingoLinq.appState = {
      get: function(path) {
        if (path === 'feature_flags.background_board_prefetch') { return true; }
        return null;
      }
    };
    LingoLinq.store = {
      peekRecord: function() {
        return null;
      },
      findRecord: function(type, id) {
        return RSVP.resolve({
          get: function(k) {
            if (k === 'feature_flags') { return prefetchFeatureFlags({ background: true, catalog: false }); }
            if (k === 'id') { return id; }
            if (k === 'preferences.home_board') { return { key: 'student/home', id: id + '-home' }; }
            if (k === 'preferences.skin') { return 'default'; }
            if (k === 'preferences.preferred_symbols') { return 'original'; }
            if (k === 'preferences.locale') { return 'en'; }
            if (k === 'stats.starred_board_refs') { return [{ key: 'student/liked' }]; }
            return null;
          }
        });
      },
      normalize: function(type, raw) {
        return { data: { id: raw.id, type: type, attributes: raw } };
      },
      push: function() {}
    };

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: function() { return hidden; }
    });

    stubBoardDetailCacheAjax(function(url) {
      if (url.indexOf('/tree') !== -1) {
        var key = url.split('/boards/')[1].split('/tree')[0];
        treeCalls.push(key);
        treeCount++;
        if (treeCount === 1) { hidden = true; }
        return RSVP.resolve({
          root: { board: { key: key, id: '1_x', buttons: [] } },
          descendants: []
        });
      }
      if (url.indexOf('user_id=1_1') !== -1) {
        return RSVP.resolve({ board: [], meta: { more: false } });
      }
      if (url.indexOf('user_id=lingolinq') !== -1) {
        return RSVP.resolve({ board: [], meta: { more: false } });
      }
      if (url.indexOf('q=&') !== -1) {
        return RSVP.resolve({ board: [], meta: { more: false } });
      }
      return RSVP.reject({ error: 'unexpected ' + url });
    });

    var supervisor = {
      get: function(k) {
        if (k === 'id') { return '9_1'; }
        if (k === 'supervisees') { return [{ id: '1_1' }]; }
        return null;
      }
    };

    return boardDetailCache.prefetch_caseload_for_user(supervisor, { cap: 1, gapMs: 0, pipelineGapMs: 0 }).then(function() {
      hidden = false;
      return boardDetailCache.prefetch_caseload_for_user(supervisor, { cap: 1, gapMs: 0, pipelineGapMs: 0 });
    }).then(function() {
      LingoLinq.store = origStore;
      LingoLinq.appState = origAppState;

      assert.deepEqual(treeCalls, ['student/home', 'student/liked'], 'reruns incomplete caseload prefetch phases after visibility returns');
    }, function(err) {
      LingoLinq.store = origStore;
      LingoLinq.appState = origAppState;
      throw err;
    });
  });

  test('prefetch pipeline defers phase-4 catalog /tree until Mine list busy clears', function(assert) {
    assert.expect(3);
    var done = assert.async();
    var treeOrder = [];
    var catalogListStarted = false;
    var sawCatalogWhileBusy = false;
    var origAppState = LingoLinq.appState;

    boardsPageListCache.setMineListBusy(true);

    LingoLinq.appState = {
      get: function(path) {
        if (path === 'feature_flags.catalog_board_prefetch') { return true; }
        if (path === 'feature_flags.background_board_prefetch') { return false; }
        return null;
      }
    };

    stubBoardDetailCacheAjax(function(url) {
      if (url.indexOf('/tree') !== -1) {
        var key = url.split('/boards/')[1].split('/tree')[0];
        treeOrder.push(key);
        return RSVP.resolve({
          root: { board: { key: key, id: '1_x', buttons: [] } },
          descendants: []
        });
      }
      if (url.indexOf('user_id=lingolinq') !== -1 || url.indexOf('q=&') !== -1) {
        catalogListStarted = true;
        if (boardsPageListCache.isMineListBusy()) {
          sawCatalogWhileBusy = true;
        }
        return RSVP.resolve({
          board: url.indexOf('user_id=lingolinq') !== -1
            ? [{ key: 'lingolinq/cat', id: '9_1' }]
            : [],
          meta: { more: false }
        });
      }
      return RSVP.reject({ error: 'unexpected ' + url });
    });

    var user = {
      get: function(k) {
        if (k === 'feature_flags') { return prefetchFeatureFlags({ catalog: true, background: false }); }
        if (k === 'id') { return '1_50'; }
        if (k === 'preferences.home_board') { return null; }
        if (k === 'preferences.skin') { return 'default'; }
        if (k === 'preferences.preferred_symbols') { return 'original'; }
        if (k === 'preferences.locale') { return 'en'; }
        return null;
      }
    };

    var pipeline = runPrefetchPipeline(user, { skin: 'default', preferred_symbols: 'original' });

    setTimeout(function() {
      assert.notOk(catalogListStarted, 'phase-4 has not started while Mine busy');
      boardsPageListCache.setMineListBusy(false);
    }, 50);

    pipeline.then(function() {
      LingoLinq.appState = origAppState;
      assert.notOk(sawCatalogWhileBusy, 'catalog list waited until Mine busy cleared');
      assert.notStrictEqual(treeOrder.indexOf('lingolinq/cat'), -1, 'catalog tree runs after Mine busy clears');
      done();
    }, function(err) {
      LingoLinq.appState = origAppState;
      done();
      throw err;
    });
  });

  test('prefetch pipeline defers phase-3 owned list and phase-4 while boards page is active', function(assert) {
    assert.expect(5);
    var done = assert.async();
    var ownedListStarted = false;
    var catalogListStarted = false;
    var homeTreeStarted = false;
    var treeOrder = [];
    var origAppState = LingoLinq.appState;

    boardsPageListCache.setBoardsPageActive(true);

    LingoLinq.appState = {
      get: function(path) {
        if (path === 'feature_flags.background_board_prefetch') { return true; }
        if (path === 'feature_flags.catalog_board_prefetch') { return true; }
        return null;
      }
    };

    stubBoardDetailCacheAjax(function(url) {
      if (url.indexOf('/tree') !== -1) {
        var key = url.split('/boards/')[1].split('/tree')[0];
        treeOrder.push(key);
        if (key === 'user/home') { homeTreeStarted = true; }
        return RSVP.resolve({
          root: { board: { key: key, id: '1_x', buttons: [] } },
          descendants: []
        });
      }
      if (url.indexOf('user_id=1_50') !== -1) {
        ownedListStarted = true;
        return RSVP.resolve({
          board: [{ key: 'user/owned', id: '1_20' }],
          meta: { more: false }
        });
      }
      if (url.indexOf('user_id=lingolinq') !== -1 || url.indexOf('q=&') !== -1) {
        catalogListStarted = true;
        return RSVP.resolve({
          board: url.indexOf('user_id=lingolinq') !== -1
            ? [{ key: 'lingolinq/cat', id: '9_1' }]
            : [],
          meta: { more: false }
        });
      }
      return RSVP.reject({ error: 'unexpected ' + url });
    });

    var user = {
      get: function(k) {
        if (k === 'feature_flags') { return prefetchFeatureFlags({ catalog: true, background: true }); }
        if (k === 'id') { return '1_50'; }
        if (k === 'preferences.home_board') { return { key: 'user/home', id: '1_1' }; }
        if (k === 'preferences.skin') { return 'default'; }
        if (k === 'preferences.preferred_symbols') { return 'original'; }
        if (k === 'preferences.locale') { return 'en'; }
        if (k === 'stats.starred_board_refs') { return []; }
        return null;
      }
    };

    var pipeline = runPrefetchPipeline(user, { skin: 'default', preferred_symbols: 'original' });

    setTimeout(function() {
      assert.notOk(homeTreeStarted, 'phase-1 home /tree has not started while boards page is active');
      assert.notOk(ownedListStarted, 'phase-3 owned list has not started while boards page is active');
      assert.notOk(catalogListStarted, 'phase-4 catalog list has not started while boards page is active');
      boardsPageListCache.setBoardsPageActive(false);
    }, 50);

    pipeline.then(function() {
      LingoLinq.appState = origAppState;
      assert.ok(ownedListStarted, 'owned list runs after boards page deactivates');
      assert.notStrictEqual(treeOrder.indexOf('lingolinq/cat'), -1, 'catalog tree runs after boards page deactivates');
      done();
    }, function(err) {
      LingoLinq.appState = origAppState;
      done();
      throw err;
    });
  });

  test('prefetch /tree requests use root_only=1', function(assert) {
    var treeUrls = [];
    var origAppState = LingoLinq.appState;

    LingoLinq.appState = { get: function() { return null; } };

    stubBoardDetailCacheAjax(function(url) {
      if (url.indexOf('/tree') !== -1) {
        treeUrls.push(url);
        return RSVP.resolve({
          root: { board: { key: 'user/home', id: '1_1', buttons: [] } },
          descendants: []
        });
      }
      return RSVP.reject({ error: 'unexpected ' + url });
    });

    var user = {
      get: function(k) {
        if (k === 'feature_flags') { return prefetchFeatureFlags({ catalog: false, background: false }); }
        if (k === 'id') { return '1_50'; }
        if (k === 'preferences.home_board') { return { key: 'user/home', id: '1_1' }; }
        if (k === 'preferences.skin') { return 'default'; }
        if (k === 'preferences.preferred_symbols') { return 'original'; }
        return null;
      }
    };

    return runPrefetchPipeline(user, { skin: 'default', preferred_symbols: 'original' }).then(function() {
      LingoLinq.appState = origAppState;
      assert.ok(treeUrls.length, 'issued at least one /tree');
      treeUrls.forEach(function(url) {
        assert.notStrictEqual(url.indexOf('root_only=1'), -1, url + ' includes root_only=1');
      });
      assert.ok(boardDetailCache.is_root_only('user/home'), 'prefetch ingest marks the home root as root_only');
    }, function(err) {
      LingoLinq.appState = origAppState;
      throw err;
    });
  });
});
