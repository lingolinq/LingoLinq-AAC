import { module, test } from 'qunit';
import BoardDetailController from 'frontend/controllers/user/board-detail';

module('Unit | Controller | user/board-detail image cache', function(hooks) {
  var controller;
  var persistenceSvc;
  var url_cache_backup;
  var url_uncache_backup;

  hooks.beforeEach(function() {
    persistenceSvc = window.persistence;
    if(!persistenceSvc) {
      persistenceSvc = { url_cache: {}, url_uncache: {}, primed: false };
      window.persistence = persistenceSvc;
    }
    url_cache_backup = persistenceSvc.url_cache;
    url_uncache_backup = persistenceSvc.url_uncache;
    persistenceSvc.url_cache = {};
    persistenceSvc.url_uncache = {};
    controller = BoardDetailController.create();
  });

  hooks.afterEach(function() {
    if(persistenceSvc) {
      persistenceSvc.url_cache = url_cache_backup;
      persistenceSvc.url_uncache = url_uncache_backup;
    }
    if(controller) { controller.destroy(); }
  });

  test('_resolve_cached_image_url returns remote URL when cache is empty', function(assert) {
    var remote = 'https://cdn.example.com/symbol.png';
    assert.equal(controller._resolve_cached_image_url(remote), remote);
  });

  test('_resolve_cached_image_url prefers url_cache entry', function(assert) {
    var remote = 'https://cdn.example.com/symbol.png';
    var local = 'file:///local/symbol.png';
    persistenceSvc.url_cache[remote] = local;
    assert.equal(controller._resolve_cached_image_url(remote), local);
  });

  test('_resolve_cached_image_url skips url_uncache entries', function(assert) {
    var remote = 'https://cdn.example.com/symbol.png';
    persistenceSvc.url_cache[remote] = 'file:///local/symbol.png';
    persistenceSvc.url_uncache[remote] = true;
    assert.equal(controller._resolve_cached_image_url(remote), remote);
  });

  test('_make_btn uses cached image URL when available', function(assert) {
    var remote = 'https://cdn.example.com/bi1.png';
    var local = 'file:///local/bi1.png';
    persistenceSvc.url_cache[remote] = local;
    var btn = controller._make_btn({ id: '1', image_id: 'bi1', label: 'go' }, { bi1: remote });
    assert.equal(btn.image_url, local);
  });
});
