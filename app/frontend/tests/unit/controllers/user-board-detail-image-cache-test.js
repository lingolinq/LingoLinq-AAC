import { module, test } from 'qunit';
import { setupTest } from '../../helpers';
import EmberObject from '@ember/object';
import LingoLinq from 'frontend/app';
import 'frontend/models/board';
import { persistenceTarget } from '../../helpers/persistence-stub';

module('Unit | Controller | user/board-detail image cache', function(hooks) {
  setupTest(hooks);

  var url_cache_backup;
  var url_uncache_backup;

  hooks.beforeEach(function() {
    var persistenceSvc = persistenceTarget();
    url_cache_backup = persistenceSvc.url_cache;
    url_uncache_backup = persistenceSvc.url_uncache;
    persistenceSvc.url_cache = {};
    persistenceSvc.url_uncache = {};
    this.controller = this.owner.factoryFor('controller:user/board-detail').create();
  });

  hooks.afterEach(function() {
    var persistenceSvc = persistenceTarget();
    if(persistenceSvc) {
      persistenceSvc.url_cache = url_cache_backup;
      persistenceSvc.url_uncache = url_uncache_backup;
    }
    if(this.controller) {
      this.controller.destroy();
      this.controller = null;
    }
  });

  test('_resolve_cached_image_url returns remote URL when cache is empty', function(assert) {
    var remote = 'https://cdn.example.com/symbol.png';
    assert.equal(this.controller._resolve_cached_image_url(remote), remote);
  });

  test('_resolve_cached_image_url prefers url_cache entry', function(assert) {
    var remote = 'https://cdn.example.com/symbol.png';
    var local = 'file:///local/symbol.png';
    persistenceTarget().url_cache[remote] = local;
    assert.equal(this.controller._resolve_cached_image_url(remote), local);
  });

  test('_resolve_cached_image_url skips url_uncache entries', function(assert) {
    var remote = 'https://cdn.example.com/symbol.png';
    persistenceTarget().url_cache[remote] = 'file:///local/symbol.png';
    persistenceTarget().url_uncache[remote] = true;
    assert.equal(this.controller._resolve_cached_image_url(remote), remote);
  });

  test('_resolve_cached_image_url keeps skin-tone variant when only base is cached', function(assert) {
    var base = 'https://cdn.example.com/lib/sym.png';
    var skinned = base + '.variant-dark.png';
    persistenceTarget().url_cache[base] = 'file:///local/sym.png';
    assert.equal(this.controller._resolve_cached_image_url(skinned), skinned);
  });

  test('_make_btn uses cached image URL when available', function(assert) {
    var remote = 'https://cdn.example.com/bi1.png';
    var local = 'file:///local/bi1.png';
    persistenceTarget().url_cache[remote] = local;
    var btn = this.controller._make_btn({ id: '1', image_id: 'bi1', label: 'go' }, { bi1: remote });
    assert.equal(btn.image_url, local);
  });

  test('upgrade_url_for_skin_variants does not speculate .varianted-skin for plain library URLs', function(assert) {
    var plain = 'https://d18vdu4p71yql0.cloudfront.net/libraries/arasaac/different.png';
    assert.equal(LingoLinq.Board.upgrade_url_for_skin_variants(plain), plain);
    var skinBase = plain.replace('.png', '.png.varianted-skin.png');
    assert.equal(LingoLinq.Board.upgrade_url_for_skin_variants(skinBase), skinBase);
  });

  test('_make_btn applies skin tone via skin_image_map for varianted-skin URLs', function(assert) {
    this.controller.set('_preferred_symbols', null);
    var base = 'https://cdn.example.com/lib/sym.png.varianted-skin.png';
    var map = LingoLinq.Board.skin_image_map({ bi1: base }, 'medium');
    var btn = this.controller._make_btn({ id: '1', image_id: 'bi1', label: 'go' }, map);
    assert.ok(btn.image_url.indexOf('.variant-medium.png') > -1, 'expected medium skin variant URL');
  });

  test('_word_prediction_locale uses the visible label locale first', function(assert) {
    this.controller.set('app_state', EmberObject.create({
      label_locale: 'es',
      currentBoardState: { default_locale: 'en' }
    }));
    this.controller.set('model', EmberObject.create({ locale: 'en' }));
    this.controller.set('_last_raw', {});

    assert.equal(this.controller._word_prediction_locale(), 'es');
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

    assert.equal(this.controller._name_matches_translation(board, 'Vocabulario de Crisis'), true);
    assert.equal(this.controller._name_matches_translation(board, 'My Crisis Board'), false);
  });
});
