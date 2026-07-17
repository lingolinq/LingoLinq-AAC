import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import BoardIndexController from 'frontend/controllers/board/index';

function stubInjectedService() {
  return EmberObject.create({
    get: function() { return null; },
    set: function() { return null; },
    addObserver: function() {},
    removeObserver: function() {}
  });
}

module('Unit | Controller | board/index word prediction locale', function() {
  test('word_prediction_locale uses the visible label locale first', function(assert) {
    var controller = BoardIndexController.create({
      appState: EmberObject.create({
        label_locale: 'es',
        currentBoardState: { default_locale: 'en' }
      }),
      model: EmberObject.create({ locale: 'en' }),
      persistence: stubInjectedService(),
      stashes: stubInjectedService(),
      router: stubInjectedService()
    });

    try {
      assert.equal(controller.word_prediction_locale(), 'es');
    } finally {
      controller.destroy();
    }
  });
});
