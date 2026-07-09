import {
  describe,
  it,
  expect,
  beforeEach
} from 'frontend/tests/helpers/jasmine';
import 'frontend/tests/helpers/ember_helper';
import EmberObject from '@ember/object';

describe('CopyBoardController', 'controller:copy-board', function() {
  var testOwner;

  beforeEach(function() {
    testOwner = this.owner;
  });

  it("should exist", function() {
    expect(this).not.toEqual(null);
    expect(this).not.toEqual(window);
  });

  it("should treat downstream boards as linked even when linked_boards is empty", function() {
    var component = testOwner.factoryFor('component:copy-board').create({
      appState: EmberObject.create()
    });
    component.set('model', EmberObject.create({
      board: EmberObject.create({
        buttons: [],
        downstream_boards: 3
      })
    }));
    expect(component.get('linked')).toEqual(true);
    component.destroy();
  });
});
// import modal from '../utils/modal';
// 
// export default modal.ModalController.extend({
//   opening: function() {
//     var settings = modal.settings_for['copy-board'];
//     this.set('model', {});
//     this.set('board_key', settings.board_key);
//   }
// });