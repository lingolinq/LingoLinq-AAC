import { module, test } from 'qunit';
import BoardDetailController from 'frontend/controllers/user/board-detail';
import persistence from 'frontend/utils/persistence';

module('Unit | Controller | user/board-detail image cache', function(hooks) {
  var controller;
  var url_cache_backup;
  var url_uncache_backup;

  hooks.beforeEach(function() {
    url_cache_backup = persistence.url_cache;
    url_uncache_backup = persistence.url_uncache;
    persistence.url_cache = {};
    persistence.url_uncache = {};
    controller = BoardDetailController.create();
  });

  hooks.afterEach(function() {
    persistence.url_cache = url_cache_backup;
    persistence.url_uncache = url_uncache_backup;
    if(controller) { controller.destroy(); }
  });

  test('_resolve_cached_image_url returns remote URL when cache is empty', function(assert) {
    var remote = 'https://cdn.example.com/symbol.png';
    assert.equal(controller._resolve_cached_image_url(remote), remote);
  });

  test('_resolve_cached_image_url prefers url_cache entry', function(assert) {
    var remote = 'https://cdn.example.com/symbol.png';
    var local = 'file:///local/symbol.png';
    persistence.url_cache[remote] = local;
    assert.equal(controller._resolve_cached_image_url(remote), local);
  });

  test('_resolve_cached_image_url skips url_uncache entries', function(assert) {
    var remote = 'https://cdn.example.com/symbol.png';
    persistence.url_cache[remote] = 'file:///local/symbol.png';
    persistence.url_uncache[remote] = true;
    assert.equal(controller._resolve_cached_image_url(remote), remote);
  });

  test('_make_btn uses cached image URL when available', function(assert) {
    var remote = 'https://cdn.example.com/bi1.png';
    var local = 'file:///local/bi1.png';
    persistence.url_cache[remote] = local;
    var btn = controller._make_btn({ id: '1', image_id: 'bi1', label: 'go' }, { bi1: remote });
    assert.equal(btn.image_url, local);
  });
});
