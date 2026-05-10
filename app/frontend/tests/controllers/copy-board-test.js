import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  waitsFor,
  runs,
  stub
} from 'frontend/tests/helpers/jasmine';
import { queryLog } from 'frontend/tests/helpers/ember_helper';
import EmberObject from '@ember/object';
import CopyBoardComponent from 'frontend/components/copy-board';

describe('CopyBoardController', 'controller:copy-board', function() {
  it("should exist", function() {
    expect(this).not.toEqual(null);
    expect(this).not.toEqual(window);
  });

  it("should treat downstream boards as linked even when linked_boards is empty", function() {
    var component = CopyBoardComponent.create({
      appState: EmberObject.create(),
      model: {
        board: EmberObject.create({
          buttons: [],
          downstream_boards: 3
        })
      }
    });
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