import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import BoardDetailController from 'frontend/controllers/user/board-detail';
import LingoLinq from 'frontend/app';

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

  test('_resolve_cached_image_url keeps skin-tone variant when only base is cached', function(assert) {
    var base = 'https://cdn.example.com/lib/sym.png';
    var skinned = base + '.variant-dark.png';
    persistenceSvc.url_cache[base] = 'file:///local/sym.png';
    assert.equal(controller._resolve_cached_image_url(skinned), skinned);
  });

  test('_make_btn uses cached image URL when available', function(assert) {
    var remote = 'https://cdn.example.com/bi1.png';
    var local = 'file:///local/bi1.png';
    persistenceSvc.url_cache[remote] = local;
    var btn = controller._make_btn({ id: '1', image_id: 'bi1', label: 'go' }, { bi1: remote });
    assert.equal(btn.image_url, local);
  });

  test('upgrade_url_for_skin_variants does not speculate .varianted-skin for plain library URLs', function(assert) {
    var plain = 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/different.png';
    assert.equal(LingoLinq.Board.upgrade_url_for_skin_variants(plain), plain);
    var skinBase = plain.replace('.png', '.png.varianted-skin.png');
    assert.equal(LingoLinq.Board.upgrade_url_for_skin_variants(skinBase), skinBase);
  });

  test('_make_btn applies skin tone via skin_image_map for varianted-skin URLs', function(assert) {
    controller._preferred_symbols = null;
    var base = 'https://cdn.example.com/lib/sym.png.varianted-skin.png';
    var map = LingoLinq.Board.skin_image_map({ bi1: base }, 'medium');
    var btn = controller._make_btn({ id: '1', image_id: 'bi1', label: 'go' }, map);
    assert.ok(btn.image_url.indexOf('.variant-medium.png') > -1, 'expected medium skin variant URL');
  });

  test('_word_prediction_locale uses the visible label locale first', function(assert) {
    controller.set('app_state', EmberObject.create({
      label_locale: 'es',
      currentBoardState: { default_locale: 'en' }
    }));
    controller.set('model', EmberObject.create({ locale: 'en' }));

    assert.equal(controller._word_prediction_locale(), 'es');
  });

  test('_name_matches_translation detects localized board names', function(assert) {
    var board = EmberObject.create({
      locale: 'es',
      translations: {
        default: 'en',
        board_name: {
          en: 'Crisis Vocabulary',
          es: 'Vocabulario de Crisis'
        }
      }
    });

    assert.equal(controller._name_matches_translation(board, 'Vocabulario de Crisis'), true);
    assert.equal(controller._name_matches_translation(board, 'My Crisis Board'), false);
  });
});
