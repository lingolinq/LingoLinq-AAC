import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import BoardIndexController from 'frontend/controllers/board/index';

module('Unit | Controller | board/index word prediction locale', function(hooks) {
  var controller;

  hooks.beforeEach(function() {
    controller = BoardIndexController.create();
  });

  hooks.afterEach(function() {
    if(controller) { controller.destroy(); }
  });

  test('word_prediction_locale uses the visible label locale first', function(assert) {
    controller.set('appState', EmberObject.create({
      label_locale: 'es',
      currentBoardState: { default_locale: 'en' }
    }));
    controller.set('model', EmberObject.create({ locale: 'en' }));

    assert.equal(controller.word_prediction_locale(), 'es');
  });
});
