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
import modal from 'frontend/utils/modal';
import scanner from 'frontend/utils/scanner';
import frame_listener from 'frontend/utils/frame_listener';

describe('HighlightController', 'controller:highlight', function() {
  it("should exist", function() {
    expect(this).not.toEqual(null);
    expect(this).not.toEqual(window);
  });
});
// import Ember from 'ember';
// import modal from '../utils/modal';
// import scanner from '../utils/scanner';
// 
// export default EmberObjectController.extend({
//   needs: ['application', 'board'],
//   opening: function() {
//     modal.highlight_controller = this;
//     scanner.setup(this);
//   },
//   closing: function() {
//     modal.highlight_controller = null;
//   },
//   compute_styles: function() {
//     var opacity = "0.3";
//     var display = this.get('overlay') ? '' : 'display: none;';
//     if(this.get('clear_overlay')) {
//       opacity = "0.0";
//     }
//     this.set('top_style', display + "z-index: 9; position: absolute; top: 0; left: 0; background: #000; opacity: " + opacity + "; width: 100%; height: " + this.get('top') + "px;");
//     this.set('left_style', display + "z-index: 9; position: absolute; top: " + this.get('top') + "px; left: 0; background: #000; opacity: " + opacity + "; width: " + this.get('left') + "px; height: " + this.get('height') + "px;");
//     this.set('right_style', display + "z-index: 9; position: absolute; top: " + this.get('top') + "px; left: calc(" + this.get('left') + "px + " + this.get('width') + "px); background: #000; opacity: " + opacity + "; width: calc(100% - " + this.get('left') + "px - " + this.get('width') + "px); height: " + this.get('height') + "px;");
//     this.set('bottom_style', display + "z-index: 9; position: absolute; top: " + this.get('bottom') + "px; left: 0; background: #000; opacity: " + opacity + "; width: 100%; height: 5000px;");
//     this.set('highlight_style', "z-index: 10; position: absolute; top: " + this.get('top') + "px; left: " + this.get('left') + "px; width: " + this.get('width') + "px; height: " + this.get('height') + "px; border: 4px solid #f00; cursor: pointer;");
//   }.observes('left', 'top', 'width', 'height', 'bottom', 'right', 'overlay'),
//   actions: {
//     select: function() {
//       if(this.get('defer')) {
//         this.get('defer').resolve();
//       }
//       if(!this.get('prevent_close')) {
//         modal.close();
//       }
//     },
//     close: function() {
//       if(this.get('select_anywhere')) { // whole-screen is giant switch
//         this.send('select');
//       } else {
//         if(this.get('defer')) {
//           this.get('defer').reject();
//         }
//         if(!this.get('prevent_close')) {
//           modal.close();
//         }
//       }
//     }
//   }
// });
describe('HighlightController scanner hand-off', function() {
  var testOwner, saved;
  beforeEach(function() {
    testOwner = this.owner;
    saved = { appState: scanner.get('appState'), controller: scanner.controller, highlight: modal.highlight_controller,
      last: modal.last_controller, settings: modal.settings_for['highlight'],
      frameController: frame_listener.controller, frameAppState: frame_listener.appState };
  });
  afterEach(function() {
    scanner.set('appState', saved.appState);
    scanner.controller = saved.controller;
    modal.highlight_controller = saved.highlight;
    modal.last_controller = saved.last;
    modal.settings_for['highlight'] = saved.settings;
    frame_listener.controller = saved.frameController;
    frame_listener.appState = saved.frameAppState;
  });

  // utils/scanner.js start() reads `this.get('appState.currentUser.preferences.device.scanning')`
  // and stops when it is falsy; the highlight's opening() hands itself to scanner.setup(), which
  // sets scanner.appState from the controller. Without an app-state on the controller every
  // restart after a switch selection stopped scanning (modern view, auto-home off).
  it("hands this app's app-state to the scanner when it opens", function() {
    var appState = testOwner.lookup('service:app-state');
    var controller = testOwner.lookup('controller:highlight');
    scanner.set('appState', null);
    // controllers/highlight.js actions.opening copies its model from settings_for['highlight'].
    modal.settings_for['highlight'] = { left: 0, top: 0, width: 10, height: 10 };
    controller.send('opening');
    expect(scanner.controller).toEqual(controller);
    expect(scanner.get('appState') === appState).toEqual(true);
    controller.closing();
  });
});

