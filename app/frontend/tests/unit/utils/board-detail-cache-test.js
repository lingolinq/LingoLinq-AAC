import { module, test } from 'qunit';
import boardDetailCache from 'frontend/utils/board_detail_cache';

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
});
