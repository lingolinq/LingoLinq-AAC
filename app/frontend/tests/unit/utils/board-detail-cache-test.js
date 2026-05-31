import { module, test } from 'qunit';
import RSVP from 'rsvp';
import boardDetailCache from 'frontend/utils/board_detail_cache';
import persistence from 'frontend/utils/persistence';
import LingoLinq from 'frontend/app';

module('Unit | Utility | board-detail-cache', function() {
  test('set skips re-caching a fresh entry unless force is true', function(assert) {
    boardDetailCache.clear();
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

  test('warm_linked_images warms cached child boards without refetching', function(assert) {
    boardDetailCache.clear();
    var done = assert.async();
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

    boardDetailCache.warm_linked_images(parent).then(function() {
      window.Image = OriginalImage;
      assert.equal(loadCount, 1, 'warms images for cached linked board');
      done();
    });
  });

  test('warm_images skips URLs already warmed for another board', function(assert) {
    boardDetailCache.clear();
    var done = assert.async();
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

    boardDetailCache.warm_images(raw1).then(function() {
      loadCount = 0;
      return boardDetailCache.warm_images(raw2);
    }).then(function() {
      window.Image = OriginalImage;
      assert.equal(loadCount, 0, 'does not create Image() for an already-warmed URL');
      done();
    });
  });

  test('prefetch_lingolinq_catalog lists roots then fetches each tree', function(assert) {
    boardDetailCache.clear();
    var calls = [];
    var origAjax = persistence.ajax;
    var origAppState = LingoLinq.appState;

    persistence.ajax = function(url, opts) {
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
    };

    LingoLinq.appState = {
      get: function(path) {
        if (path === 'feature_flags.catalog_board_prefetch') { return true; }
        return null;
      }
    };

    var user = {
      get: function(k) {
        if (k === 'id') { return '2_99'; }
        if (k === 'preferences.skin') { return 'default'; }
        if (k === 'preferences.preferred_symbols') { return 'original'; }
        if (k === 'preferences.locale') { return 'en'; }
        return null;
      }
    };

    return boardDetailCache.prefetch_lingolinq_catalog(user).then(function() {
      persistence.ajax = origAjax;
      LingoLinq.appState = origAppState;

      assert.ok(calls.some(function(c) { return c.url.indexOf('user_id=lingolinq') !== -1; }), 'lists lingolinq roots');
      var treeCalls = calls.filter(function(c) { return c.url.indexOf('/tree') !== -1; });
      assert.equal(treeCalls.length, 2, 'fetches a tree per root');
      assert.ok(treeCalls[0].url.indexOf('board-a') !== -1, 'first tree is board-a');
      assert.ok(treeCalls[1].url.indexOf('board-b') !== -1, 'second tree is board-b');
      assert.ok(boardDetailCache.get('lingolinq/sub-a'), 'caches descendants as JSON only');
    }, function(err) {
      persistence.ajax = origAjax;
      LingoLinq.appState = origAppState;
      throw err;
    });
  });

  test('prefetch_lingolinq_catalog skips roots already fresh in cache', function(assert) {
    boardDetailCache.clear();
    var calls = [];
    var origAjax = persistence.ajax;
    var origAppState = LingoLinq.appState;

    boardDetailCache.set({ key: 'lingolinq/board-a', id: '1_1', buttons: [] });

    persistence.ajax = function(url) {
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
    };

    LingoLinq.appState = {
      get: function(path) {
        if (path === 'feature_flags.catalog_board_prefetch') { return true; }
        return null;
      }
    };

    var user = {
      get: function(k) {
        if (k === 'id') { return '2_99'; }
        return null;
      }
    };

    return boardDetailCache.prefetch_lingolinq_catalog(user).then(function() {
      persistence.ajax = origAjax;
      LingoLinq.appState = origAppState;
      var treeCalls = calls.filter(function(u) { return u.indexOf('/tree') !== -1; });
      assert.equal(treeCalls.length, 1, 'only fetches uncached root');
      assert.ok(treeCalls[0].indexOf('board-b') !== -1, 'skipped cached board-a');
    }, function(err) {
      persistence.ajax = origAjax;
      LingoLinq.appState = origAppState;
      throw err;
    });
  });

  test('get_ordered_buttons returns null when url_cache_primed context differs', function(assert) {
    boardDetailCache.clear();
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
    boardDetailCache.clear();
    var origAjax = persistence.ajax;
    var origAppState = LingoLinq.appState;
    var warmCalls = [];
    var origWarm = boardDetailCache.warm_images;

    boardDetailCache.warm_images = function(raw) {
      warmCalls.push(raw && raw.key);
      return RSVP.resolve();
    };

    persistence.ajax = function(url) {
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
    };

    LingoLinq.appState = {
      get: function(path) {
        if (path === 'feature_flags.catalog_board_prefetch') { return true; }
        return null;
      }
    };

    var user = {
      get: function(k) {
        if (k === 'id') { return '2_99'; }
        return null;
      }
    };

    return boardDetailCache.prefetch_lingolinq_catalog(user).then(function() {
      persistence.ajax = origAjax;
      LingoLinq.appState = origAppState;
      boardDetailCache.warm_images = origWarm;
      assert.equal(warmCalls.length, 1, 'warms root images once');
      assert.equal(warmCalls[0], 'lingolinq/board-a', 'does not warm descendant images');
    }, function(err) {
      persistence.ajax = origAjax;
      LingoLinq.appState = origAppState;
      boardDetailCache.warm_images = origWarm;
      throw err;
    });
  });

  test('prefetch pipeline runs home then liked then owned when background flag enabled', function(assert) {
    boardDetailCache.clear();
    var done = assert.async();
    var treeOrder = [];
    var origAjax = persistence.ajax;
    var origAppState = LingoLinq.appState;
    var origGet = persistence.get;

    persistence.get = function(key) {
      if (key === 'online') { return true; }
      if (origGet) { return origGet.call(persistence, key); }
      return true;
    };

    LingoLinq.appState = {
      get: function(path) {
        if (path === 'feature_flags.background_board_prefetch') { return true; }
        return null;
      }
    };

    persistence.ajax = function(url) {
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
    };

    var user = {
      get: function(k) {
        if (k === 'id') { return '1_50'; }
        if (k === 'preferences.home_board') { return { key: 'user/home', id: '1_1' }; }
        if (k === 'preferences.skin') { return 'default'; }
        if (k === 'preferences.preferred_symbols') { return 'original'; }
        if (k === 'preferences.locale') { return 'en'; }
        if (k === 'stats.starred_board_refs') { return [{ key: 'user/liked' }]; }
        return null;
      }
    };

    boardDetailCache._run_prefetch_pipeline(user, { skin: 'default', preferred_symbols: 'original' }).then(function() {
      persistence.ajax = origAjax;
      LingoLinq.appState = origAppState;
      persistence.get = origGet;
      assert.deepEqual(treeOrder, ['user/home', 'user/liked', 'user/owned'], 'runs phased trees in order');
      done();
    }, function(err) {
      persistence.ajax = origAjax;
      LingoLinq.appState = origAppState;
      persistence.get = origGet;
      throw err;
    });
  });

  test('prefetch pipeline skips extended phases when background flag off', function(assert) {
    boardDetailCache.clear();
    var done = assert.async();
    var treeOrder = [];
    var origAjax = persistence.ajax;
    var origAppState = LingoLinq.appState;
    var origGet = persistence.get;

    persistence.get = function(key) {
      if (key === 'online') { return true; }
      if (origGet) { return origGet.call(persistence, key); }
      return true;
    };

    LingoLinq.appState = { get: function() { return null; } };

    persistence.ajax = function(url) {
      if (url.indexOf('/tree') !== -1) {
        var key = url.split('/boards/')[1].split('/tree')[0];
        treeOrder.push(key);
        return RSVP.resolve({
          root: { board: { key: key, id: '1_x', buttons: [] } },
          descendants: []
        });
      }
      return RSVP.reject({ error: 'unexpected ' + url });
    };

    var user = {
      get: function(k) {
        if (k === 'id') { return '1_50'; }
        if (k === 'preferences.home_board') { return { key: 'user/home', id: '1_1' }; }
        if (k === 'preferences.skin') { return 'default'; }
        if (k === 'preferences.preferred_symbols') { return 'original'; }
        if (k === 'stats.starred_board_refs') { return [{ key: 'user/liked' }]; }
        return null;
      }
    };

    boardDetailCache._run_prefetch_pipeline(user, { skin: 'default', preferred_symbols: 'original' }).then(function() {
      persistence.ajax = origAjax;
      LingoLinq.appState = origAppState;
      persistence.get = origGet;
      assert.deepEqual(treeOrder, ['user/home'], 'only home phase when flag off');
      done();
    }, function(err) {
      persistence.ajax = origAjax;
      LingoLinq.appState = origAppState;
      persistence.get = origGet;
      throw err;
    });
  });

  test('prefetch pipeline skips roots already fresh in cache', function(assert) {
    boardDetailCache.clear();
    var done = assert.async();
    var treeOrder = [];
    var origAjax = persistence.ajax;
    var origAppState = LingoLinq.appState;
    var origGet = persistence.get;

    boardDetailCache.set({ key: 'user/liked', id: '1_2', buttons: [] });

    persistence.get = function(key) {
      if (key === 'online') { return true; }
      if (origGet) { return origGet.call(persistence, key); }
      return true;
    };

    LingoLinq.appState = {
      get: function(path) {
        if (path === 'feature_flags.background_board_prefetch') { return true; }
        return null;
      }
    };

    persistence.ajax = function(url) {
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
    };

    var user = {
      get: function(k) {
        if (k === 'id') { return '1_50'; }
        if (k === 'preferences.home_board') { return { key: 'user/home', id: '1_1' }; }
        if (k === 'preferences.skin') { return 'default'; }
        if (k === 'preferences.preferred_symbols') { return 'original'; }
        if (k === 'preferences.locale') { return 'en'; }
        if (k === 'stats.starred_board_refs') { return [{ key: 'user/liked' }]; }
        return null;
      }
    };

    boardDetailCache._run_prefetch_pipeline(user, { skin: 'default', preferred_symbols: 'original' }).then(function() {
      persistence.ajax = origAjax;
      LingoLinq.appState = origAppState;
      persistence.get = origGet;
      assert.deepEqual(treeOrder, ['user/home'], 'skips cached liked board');
      done();
    }, function(err) {
      persistence.ajax = origAjax;
      LingoLinq.appState = origAppState;
      persistence.get = origGet;
      throw err;
    });
  });
});
