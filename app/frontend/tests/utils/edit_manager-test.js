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
import RSVP from 'rsvp';
import editManager from '../../utils/edit_manager';
import Button from '../../utils/button';
import app_state from '../../utils/app_state';
import modal from '../../utils/modal';
import stashes from '../../utils/_stashes';
import contentGrabbers from '../../utils/content_grabbers';
import persistence from '../../utils/persistence';
import progress_tracker from '../../utils/progress_tracker';
import LingoLinq from '../../app';
import EmberObject from '@ember/object';
import $ from 'jquery';

describe('editManager', function() {
  var board = null;

  beforeEach(function() {
    var model = EmberObject.extend({
      set_all_ready: function() {
        var allReady = true;
        if(!this.get('pending_buttons')) { return; }
        this.get('pending_buttons').forEach(function(b) {
          if(b.get('content_status') != 'ready') { allReady = false; }
        });
        this.set('all_ready', allReady);
      }.observes('pending_buttons', 'pending_buttons.@each', 'pending_buttons.@each.content_status'),
      find_content_locally: function() {
        this.set('found_content_locally', true);
        return RSVP.resolve();
      },
      translated_buttons: function() {
        return this.get('buttons');
      }
    }).create();
    stub(app_state, 'controller', EmberObject.create({
      'current_mode': 'edit',
      'send': function(str) {
        board.sent_messages.push(str);
      }
    }));
    board = EmberObject.extend({
      model: model,
      redraw_if_needed: function() {
        this.redraw();
      },
      redraw: function() {
      }
    }).create({sent_messages: []});
    editManager.controller = null;
  });

  describe("setup", function() {
    it("should set board on init", function() {
      editManager.setup(board);
      expect(editManager.controller).toEqual(board);
    });
    it("should reset history and counters", function() {
      editManager.setup(board);
      editManager.setProperties({
        history: [1,2,3],
        future: [1,2],
        lastChange: {a: 1},
        bogus_id_counter :12
      });
      editManager.setup(board);
      expect(editManager.get('history')).toEqual([]);
      expect(editManager.get('future')).toEqual([]);
      expect(editManager.lastChange).toEqual({});
      expect(editManager.bogus_id_counter).toEqual(0);
      expect(editManager.controller.get('noRedo')).toEqual(true);
      expect(editManager.controller.get('noUndo')).toEqual(true);
    });
  });

  describe("state", function() {
    it("should create a deep copy of state on clone_state", function() {
      expect(editManager.clone_state()).toEqual(undefined);

      var button = Button.create({
        id: 1482,
        label: "ham and cheese"
      });
      board.set('ordered_buttons', [[
        button
      ]]);
      editManager.setup(board);
      var clone = editManager.clone_state();
      expect(clone.length).toEqual(1);
      expect(clone[0].length).toEqual(1);
      var clone_button = clone[0][0];
      expect(clone_button).not.toEqual(button);
      expect(clone_button.get('pending')).toEqual(false);
      expect(clone_button.get('id')).toEqual(1482);
      expect(clone_button.get('label')).toEqual('ham and cheese');
    });
    it("should not include image and sound in deep copy, but they should be retrieved anyway", function() {
      var old = editManager.Button;
      var called = false;
      editManager.Button = Button.extend({
        findContentLocally: function() {
          called = true;
          expect(this.get('image')).toEqual(undefined);
          expect(this.get('image_id')).toEqual(9);
          this._super();
        }
      });
      editManager.Button.attributes = Button.attributes;
      var image = LingoLinq.store.push({data: {type: 'image', id: 9, attributes: {
        id: 9,
        url: 'http://www.example.com/pic.png'
      }}});
      var button = editManager.Button.create({
        id: 1482,
        label: "ham and cheese",
        image_id: 9
      });
      expect(button.get('image')).not.toEqual(null);
      expect(button.get('image.id')).toEqual('9');
      expect(button.raw().image).toEqual(undefined);
      board.set('ordered_buttons', [[
        button
      ]]);
      editManager.setup(board);
      var clone = editManager.clone_state();
      expect(called).toEqual(true);
      var clone_button = clone[0][0];
      expect(clone_button).not.toEqual(button);
      expect(clone_button.get('image')).not.toEqual(null);
      expect(clone_button.get('image.id')).toEqual('9');
      editManager.Button = old;
    });

    it("should allow saving the current board state", function() {
      editManager.setup(board);
      var button = Button.create({
        id: 1482,
        label: "ham and cheese"
      });
      board.set('ordered_buttons', [[
        button
      ]]);
      editManager.save_state();
      expect(editManager.get('future')).toEqual([]);
      var history = editManager.get('history');
      expect(history.length).toEqual(1);
      var state = history[0];
      expect(state.length).toEqual(1);
      expect(state[0].length).toEqual(1);
      var clone_button = state[0][0];
      expect(clone_button).not.toEqual(button);
      expect(clone_button.get('pending')).toEqual(false);
      expect(clone_button.get('id')).toEqual(1482);
      expect(clone_button.get('label')).toEqual('ham and cheese');
    });

    it("should clear future edits (redo) on state change", function() {
      editManager.setup(board);
      editManager.set('future', [{}]);
      var button = Button.create({
        id: 1482,
        label: "ham and cheese"
      });
      board.set('ordered_buttons', [[
        button
      ]]);
      editManager.save_state();
      expect(editManager.get('future')).toEqual([]);
    });

    it("should not save the same edit to history more than once", function() {
      editManager.setup(board);
      var button = Button.create({
        id: 1482,
        label: "ham and cheese"
      });
      board.set('ordered_buttons', [[
        button
      ]]);
      editManager.save_state({button_id: 1482, changes: {}});
      expect(editManager.get('history').length).toEqual(1);
      editManager.save_state({button_id: 1482, changes: {}});
      expect(editManager.get('history').length).toEqual(1);
      editManager.save_state({button_id: 1482, changes: {}});
      expect(editManager.get('history').length).toEqual(1);
      editManager.save_state({mode: 'paint', paint_id: 1234567});
      expect(editManager.get('history').length).toEqual(2);
      editManager.save_state({mode: 'paint', paint_id: 1234567});
      expect(editManager.get('history').length).toEqual(2);
      editManager.save_state({mode: 'paint', paint_id: 1234567});
      expect(editManager.get('history').length).toEqual(2);
      editManager.save_state({mode: 'paint', paint_id: 12345678});
      expect(editManager.get('history').length).toEqual(3);
      editManager.save_state({});
      expect(editManager.get('history').length).toEqual(4);
      editManager.save_state({});
      expect(editManager.get('history').length).toEqual(5);
    });
    it("should properly clear history", function() {
      editManager.setup(board);
      editManager.set('history', [{}, {}]);
      editManager.set('future', [{}, {}]);
      editManager.lastChange = {a: 1};
      editManager.clear_history();
      expect(editManager.get('history')).toEqual([]);
      expect(editManager.get('future')).toEqual([]);
      expect(editManager.lastChange).toEqual({});
    });
    it("should properly set noRedo and noUndo", function() {
      editManager.setup(board);
      expect(board.get('noRedo')).toEqual(true);
      expect(board.get('noUndo')).toEqual(true);
      editManager.set('history', [{}, {}]);
      expect(board.get('noRedo')).toEqual(true);
      expect(board.get('noUndo')).toEqual(false);
      editManager.set('future', [{}, {}]);
      expect(board.get('noRedo')).toEqual(false);
      expect(board.get('noUndo')).toEqual(false);
      editManager.set('history', []);
      expect(board.get('noRedo')).toEqual(false);
      expect(board.get('noUndo')).toEqual(true);
    });
  });

  describe("start_edit_mode", function() {
    it("should not call toggleMode if long_press_edit not enabled", function() {
      var mode = null;
      stub(app_state.controller, 'toggleMode', function(val) {
        mode = val;
      });
      editManager.setup(board);
      app_state.set('edit_mode', false);
      var not_called = false;
      setTimeout(function() {
        not_called = (mode !== 'edit');
      }, 100);
      editManager.start_edit_mode();
      waitsFor(function() {
        return not_called;
      });
      runs();
    });
    it("should call toggleMode if long_press_edit enabled", function() {
      var mode = null;
      stub(app_state.controller, 'toggleMode', function(val) {
        mode = val;
      });
      editManager.setup(board);
      app_state.set('edit_mode', false);
      app_state.set('currentUser', EmberObject.create({
        preferences: {long_press_edit: true}
      }));
      editManager.start_edit_mode();
      waitsFor(function() {
        return mode === 'edit';
      });
      runs();
    });

    it("should open the pin confirmation dialog if protected", function() {
      var args = null;
      stub(modal, 'open', function(view, options) {
        args = {
          view: view,
          options: options
        };
      });
      editManager.setup(board);
      stashes.set('current_mode', 'speak');
      app_state.set('currentBoardState', {});
      app_state.set('currentUser', EmberObject.create({
        preferences: {
          require_speak_mode_pin: true,
          speak_mode_pin: '12345'
        }
      }));
      editManager.start_edit_mode();
      waitsFor(function() {
        return args;
      });
      runs(function() {
        expect(args.view).toEqual('speak-mode-pin');
        expect(args.options.actual_pin).toEqual('12345');
        expect(args.options.action).toEqual('edit');
      });
    });
  });

  describe("change_button", function() {
    it("should allow clearing known attributes on buttons", function() {
      editManager.setup(board);
      board.set('ordered_buttons', [[]]);
      editManager.clear_button(1);
      var button = Button.create({
        id: 123, label: 'happen', chicken: true
      });
      board.set('ordered_buttons', [[button]]);
      editManager.clear_button(123);
      expect(button.get('label')).toEqual('');
      expect(button.get('image')).toEqual(null);
      expect(button.get('empty')).toEqual(true);
      expect(button.get('chicken')).toEqual(true);
    });

    it("should error gracefully when it can't find the button", function() {
      editManager.setup(board);
      board.set('ordered_buttons', [[]]);
      expect(function() { editManager.change_button(1, {}); }).not.toThrow();

    });
    it("should update attributes on the button when found", function() {
      editManager.setup(board);
      board.set('ordered_buttons', [[]]);
      editManager.clear_button(1);
      var button = Button.create({
        id: 123, label: 'happen'
      });
      board.set('ordered_buttons', [[button]]);
      editManager.change_button(123, {label: 'square', horse: 'radish'});
      expect(button.get('label')).toEqual('square');
      expect(button.get('horse')).toEqual('radish');
      expect(editManager.lastChange).toEqual({button_id: 123, changes: ['label', 'horse']});
    });
    it("should add the prior state to the edit history", function() {
      editManager.setup(board);
      board.set('ordered_buttons', [[]]);
      editManager.clear_button(1);
      var button = Button.create({
        id: 123, label: 'happen'
      });
      board.set('ordered_buttons', [[button]]);
      editManager.change_button(123, {label: 'square', horse: 'radish'});
      var history = editManager.get('history');
      expect(history.length).toEqual(2);
      expect(history[0].length).toEqual(1);
      expect(history[0][0].length).toEqual(0);
      expect(history[1].length).toEqual(1);
      expect(history[1][0].length).toEqual(1);
      expect(history[1][0][0].id).toEqual(123);
      expect(history[1][0][0].label).toEqual('happen');
    });
    it("should mark cleared buttons as empty", function() {
      editManager.setup(board);
      board.set('ordered_buttons', [[]]);
      editManager.clear_button(1);
      var button = Button.create({
        id: 123, label: 'happen', chicken: true
      });
      board.set('ordered_buttons', [[button]]);
      editManager.clear_button(123);
      expect(button.get('empty')).toEqual(true);
    });
  });

  describe("stashed buttons", function() {
    it("should allow stashing a button", function() {
      stashes.persist('stashed_buttons', []);
      editManager.setup(board);
      var b = Button.create({id: 333, label: 'heel'});
      board.set('ordered_buttons', [[b]]);
      editManager.stash_button(333);
      expect(stashes.get('stashed_buttons').length).toEqual(1);
      expect(stashes.get('stashed_buttons')[0].label).toEqual('heel');
    });

    it("should fail gracefully if the button to stash is not found", function() {
      stashes.persist('stashed_buttons', []);
      editManager.setup(board);
      board.set('ordered_buttons', [[]]);
      editManager.stash_button(333);
      expect(stashes.get('stashed_buttons')).toEqual([]);
    });

    it("should retrieve button's raw attributes when preparing to apply", function() {
      editManager.setup(board);
      var button = Button.create({label: 'mighty', yearling: 'water'});
      expect(board.get('model.finding_target')).not.toEqual(true);
      editManager.get_ready_to_apply_stashed_button(button);
      expect(board.get('model.finding_target')).toEqual(true);
      expect(editManager.stashedButtonToApply).toEqual({label: 'mighty'});

      var called = false;
      stub(window.console, 'error', function(msg) {
        called = (msg === "raw buttons won't work");
      });
      editManager.get_ready_to_apply_stashed_button(button.raw());
      expect(called).toEqual(true);
    });
    it("should retrieve image and sound records when a stash is applied", function() {
      var image = LingoLinq.store.push({data: {type: 'image', id: 9, attributes: {
        id: 9,
        url: 'http://www.example.com/pic.png'
      }}});
      var button = Button.create({
        id: 1482,
        label: "ham and cheese",
        image_id: 9
      });
      var button2 = Button.create({id: 1483});
      board.set('ordered_buttons', [[button, button2]]);
      editManager.setup(board);
      editManager.stash_button(1482);
      var list = stashes.get('stashed_buttons');
      var stash = list.pop();
      stashes.persist('stashed_buttons', list);
      expect(stash.image).toEqual(undefined);
      editManager.get_ready_to_apply_stashed_button(button);
      expect(editManager.stashedButtonToApply).toEqual(button.raw());
      editManager.apply_stashed_button(1483);
      expect(button2.get('label')).toEqual('ham and cheese');
      expect(button2.get('image')).toEqual(image);
    });
    it("should apply a stashed button properly", function() {
      editManager.setup(board);
      var b = Button.create({id: 'cat', vocalization: 'meow'});
      board.set('ordered_buttons', [[b]]);
      editManager.stashedButtonToApply = {label: 'hiss'};
      editManager.apply_stashed_button('cat');
      expect(b.get('label')).toEqual('hiss');
      expect(b.get('vocalization')).toEqual('meow');
    });
    it("should not error if trying to apply a stashed button but none set", function() {
      expect(function() { editManager.apply_stashed_button(123); }).not.toThrow();
    });
    it("should properly handle apply_to_target", function() {
      var last_call = null;
      stub(editManager, 'switch_buttons', function(id, swap_id) {
        last_call = ['switch', id, swap_id];
      });
      stub(editManager, 'apply_stashed_button', function(id) {
        last_call = ['stash', id];
      });
      editManager.setup(board);
      board.set('model.finding_target', true);
      editManager.apply_to_target(123);
      expect(board.get('model.finding_target')).toEqual(false);
      expect(last_call).toEqual(null);
      editManager.swapId = 456;
      editManager.apply_to_target(234);
      expect(last_call).toEqual(['switch', 234, 456]);
      editManager.stashedButtonToApply = {};
      editManager.apply_to_target(345);
      expect(last_call).toEqual(['switch', 345, 456]);
      editManager.swapId = null;
      editManager.apply_to_target(456);
      expect(last_call).toEqual(['stash', 456]);
    });
  });

  describe("swapping buttons", function() {
    it("should properly handle apply_to_target", function() {
      var last_call = null;
      stub(editManager, 'switch_buttons', function(id, swap_id) {
        last_call = ['switch', id, swap_id];
      });
      stub(editManager, 'apply_stashed_button', function(id) {
        last_call = ['stash', id];
      });
      editManager.setup(board);
      board.set('model.finding_target', true);
      editManager.apply_to_target(123);
      expect(board.get('model.finding_target')).toEqual(false);
      expect(last_call).toEqual(null);
      editManager.swapId = 456;
      editManager.apply_to_target(234);
      expect(last_call).toEqual(['switch', 234, 456]);
      editManager.stashedButtonToApply = {};
      editManager.apply_to_target(345);
      expect(last_call).toEqual(['switch', 345, 456]);
      editManager.swapId = null;
      editManager.apply_to_target(456);
      expect(last_call).toEqual(['stash', 456]);
    });

    it("should properly initialize swap process", function() {
      editManager.setup(board);
      var b = Button.create({id: 123});
      board.set('ordered_buttons', [[b]]);
      editManager.prep_for_swap(123);
      expect(editManager.swapId).toEqual(123);
      expect(board.get('model.finding_target')).toEqual(true);
      expect(b.get('for_swap')).toEqual(true);
    });

    it("should not error in prep if button not found", function() {
      editManager.setup(board);
      board.set('ordered_buttons', [[]]);
      editManager.prep_for_swap(123);
      expect(editManager.swapId).toEqual(null);
      expect(board.get('model.finding_target')).not.toEqual(true);
    });

    it("should properly switch buttons", function() {
      var a = Button.create({id: 123, label: 'peanut butter', for_swap: true});
      var b = Button.create({id: 987, label: 'jelly', for_swap: true});
      editManager.setup(board);
      editManager.swapId = 888;
      board.set('ordered_buttons', [[a, b]]);
      editManager.switch_buttons(123, 987);
      expect(a.get('for_swap')).toEqual(false);
      expect(b.get('for_swap')).toEqual(false);
      expect(editManager.swapId).toEqual(null);
      var buttons = board.get('ordered_buttons');
      expect(buttons.length).toEqual(1);
      expect(buttons[0].length).toEqual(2);
      expect(buttons[0][0].id).toEqual(987);
      expect(buttons[0][1].id).toEqual(123);
      var state = editManager.get('history').pop();
      expect(state.length).toEqual(1);
      expect(state[0].length).toEqual(2);
      expect(state[0][0].id).toEqual(123);
      expect(state[0][1].id).toEqual(987);
    });
    it("should fail gracefully if either of the buttons isn't found", function() {
      var a = Button.create({id: 123, label: 'peanut butter', for_swap: true});
      var b = Button.create({id: 987, label: 'jelly', for_swap: true});
      editManager.setup(board);
      editManager.swapId = 888;
      board.set('ordered_buttons', [[a, b]]);
      editManager.switch_buttons(123, 876);
      var buttons = board.get('ordered_buttons');
      expect(buttons.length).toEqual(1);
      expect(buttons[0].length).toEqual(2);
      expect(buttons[0][0].id).toEqual(123);
      expect(buttons[0][1].id).toEqual(987);

      editManager.switch_buttons(234, 987);
      buttons = board.get('ordered_buttons');
      expect(buttons.length).toEqual(1);
      expect(buttons[0].length).toEqual(2);
      expect(buttons[0][0].id).toEqual(123);
      expect(buttons[0][1].id).toEqual(987);

      editManager.switch_buttons(234, 876);
      buttons = board.get('ordered_buttons');
      expect(buttons.length).toEqual(1);
      expect(buttons[0].length).toEqual(2);
      expect(buttons[0][0].id).toEqual(123);
      expect(buttons[0][1].id).toEqual(987);
    });

    it("should ask before swapping onto a folder button", function() {
      var opts = null;
      var template = null;
      stub(modal, 'open', function(t, o) {
        template = t;
        opts = o;
      });
      var a = Button.create({id: 123, label: 'peanut butter', for_swap: true});
      var b = Button.create({id: 987, label: 'jelly', for_swap: true, load_board: {key: 'a/b'}});
      editManager.setup(board);
      editManager.swapId = 888;
      board.set('ordered_buttons', [[a, b]]);
      editManager.switch_buttons(123, 987);
      expect(a.get('for_swap')).toEqual(true);
      expect(b.get('for_swap')).toEqual(true);
      expect(editManager.swapId).toEqual(888);
      var buttons = board.get('ordered_buttons');
      expect(buttons.length).toEqual(1);
      expect(buttons[0].length).toEqual(2);
      expect(buttons[0][0].id).toEqual(123);
      expect(buttons[0][1].id).toEqual(987);
      expect(template).toEqual('swap-or-drop-button');
      expect(opts.button).not.toEqual(null);
      expect(opts.button.get('id')).toEqual(123);
      expect(opts.folder).not.toEqual(null);
      expect(opts.folder.get('id')).toEqual(987);
    });

    it("should not ask when swapping onto a folder button if decision is specified", function() {
      var a = Button.create({id: 123, label: 'peanut butter', for_swap: true});
      var b = Button.create({id: 987, label: 'jelly', for_swap: true, load_board: {key: 'a/b'}});
      editManager.setup(board);
      editManager.swapId = 888;
      board.set('ordered_buttons', [[a, b]]);
      editManager.switch_buttons(123, 987, 'swap');
      expect(a.get('for_swap')).toEqual(false);
      expect(b.get('for_swap')).toEqual(false);
      expect(editManager.swapId).toEqual(null);
      var buttons = board.get('ordered_buttons');
      expect(buttons.length).toEqual(1);
      expect(buttons[0].length).toEqual(2);
      expect(buttons[0][0].id).toEqual(987);
      expect(buttons[0][1].id).toEqual(123);
    });

    describe("move_button", function() {
      it("should do nothing on invalid ids", function() {
        var cleared = false;
        stub(editManager, 'clear_button', function() {
          cleared = true;
        });
        editManager.setup(board);

        editManager.move_button(1, 2).then(null, function() { });
        expect(cleared).toEqual(false);

        var a = Button.create({id: 123, label: 'peanut butter', for_swap: true});
        var b = Button.create({id: 987, label: 'jelly', for_swap: true, load_board: {key: 'a/b'}});
        board.set('model.buttons', [a.raw(), b.raw()]);
        board.set('ordered_buttons', [[a, b]]);

        var errored = 0;
        editManager.move_button(a.get('id'), 0).then(null, function() {
          errored = 1;
        });
        waitsFor(function() { return errored === 1; });
        runs(function() {
          editManager.move_button(b.get('id'), 0).then(null, function() {
            errored = 2;
          });
        });

        waitsFor(function() { return errored === 2; });
        runs(function() {
          editManager.move_button(b.get('id'), a.get('id')).then(null, function() {
            errored = 3;
          });
        });

        waitsFor(function() { return errored === 3; });
        runs();
      });

      it("should clear the dropped button", function() {
        var cleared = false;
        stub(editManager, 'clear_button', function() {
          cleared = true;
        });
        editManager.setup(board);

        editManager.move_button(1, 2).then(null, function() { });
        expect(cleared).toEqual(false);
        var a = Button.create({id: 123, label: 'peanut butter', for_swap: true});
        var b = Button.create({id: 987, label: 'jelly', for_swap: true, load_board: {key: 'a/b'}});
        board.set('model.buttons', [a.raw(), b.raw()]);
        board.set('ordered_buttons', [[a, b]]);

        var errored = false;
        editManager.move_button(a.get('id'), b.get('id')).then(null, function() {
          errored = true;
        });
        waitsFor(function() { return errored; });
        runs(function() {
          expect(cleared).toEqual(true);
        });
      });

      it("should add the button to the linked board's list if the user has edit permissions", function() {
        editManager.setup(board);
        var matched = false;
        var fake_board = EmberObject.create();
        var res = {board: {
          id: 'a/b',
          key: 'a/b',
          name: 'Yellow Board',
          grid: {
            order: [[null]]
          },
          permissions: {edit: true}
        }};
        var message = null;
        stub(modal, 'success', function(text) {
          message = text;
        });
        queryLog.defineFixture({
          method: 'GET',
          type: 'board',
          id: 'a/b',
          response: RSVP.resolve(res)
        });
        queryLog.defineFixture({
          method: 'PUT',
          type: 'board',
          response: RSVP.resolve(res),
          compare: function(object) {
            var grid = object.get('grid');
            var buttons = object.get('buttons');
            if(buttons.length === 1 && buttons[0].id === 1) {
              if(grid && grid.order && grid.order[0] && grid.order[0][0] === 1) {
                matched = true;
                return true;
              }
            }
            return false;
          }
        });


        var a = Button.create({id: 123, label: 'peanut butter', for_swap: true});
        var b = Button.create({id: 987, label: 'jelly', for_swap: true, load_board: {key: 'a/b'}});
        board.set('model.buttons', [a.raw(), b.raw()]);
        board.set('ordered_buttons', [[a, b]]);
        var success = false;
        editManager.move_button(a.get('id'), b.get('id')).then(function(res) {
          success = res;
        });
        waitsFor(function() { return matched && success; });
        runs(function() {
          expect(success.visible).toEqual(true);
          expect(success.button).toNotEqual(null);
        });
      });

      it("should fail if the user has no view permissions", function() {
        editManager.setup(board);
        var matched = false;
        var fake_board = EmberObject.create();
        var res = {board: {
          id: 'a/b',
          key: 'a/b',
          name: 'Yellow Board',
          grid: {
            order: [[null]]
          }
        }};
        var message = null;
        stub(modal, 'success', function(text) {
          message = text;
        });
        queryLog.defineFixture({
          method: 'GET',
          type: 'board',
          id: 'a/b',
          response: RSVP.resolve(res)
        });


        var a = Button.create({id: 123, label: 'peanut butter', for_swap: true});
        var b = Button.create({id: 987, label: 'jelly', for_swap: true, load_board: {key: 'a/b'}});
        board.set('model.buttons', [a.raw(), b.raw()]);
        board.set('ordered_buttons', [[a, b]]);
        var error = false;
        editManager.move_button(a.get('id'), b.get('id'), 'copy').then(null, function(res) {
          error = res;
        });
        waitsFor(function() { return error; });
        runs(function() {
          expect(error).toEqual({error: "not authorized"});
        });
      });

      it("should fail if the user has only view permissions and no cloning decision has been made", function() {
        editManager.setup(board);
        var matched = false;
        var fake_board = EmberObject.create();
        var res = {board: {
          id: 'a/b',
          key: 'a/b',
          name: 'Yellow Board',
          grid: {
            order: [[null]]
          },
          permissions: {view: true}
        }};
        var message = null;
        stub(modal, 'success', function(text) {
          message = text;
        });
        queryLog.defineFixture({
          method: 'GET',
          type: 'board',
          id: 'a/b',
          response: RSVP.resolve(res)
        });

        var a = Button.create({id: 123, label: 'peanut butter', for_swap: true});
        var b = Button.create({id: 987, label: 'jelly', for_swap: true, load_board: {key: 'a/b'}});
        board.set('model.buttons', [a.raw(), b.raw()]);
        board.set('ordered_buttons', [[a, b]]);
        var error = false;
        editManager.move_button(a.get('id'), b.get('id')).then(null, function(res) {
          error = res;
        });
        waitsFor(function() { return error; });
        runs(function() {
          expect(error).toEqual({error: "view only"});
        });
      });

      it("should add the button a cloned version of the board if the user has only view permissions", function() {
        editManager.setup(board);
        var matched = false;
        var fake_board = EmberObject.create();
        var res = {board: {
          id: 'a/b',
          key: 'a/b',
          name: 'Yellow Board',
          grid: {
            order: [[null]]
          },
          permissions: {view: true}
        }};
        var res2 = {board: {
          id: 'c/d',
          key: 'c/d',
          name: 'Yellow Board (The Sequel)',
          grid: {
            order: [[null]]
          },
          permissions: {view: true}
        }};
        var message = null;
        stub(modal, 'success', function(text) {
          message = text;
        });
        queryLog.defineFixture({
          method: 'GET',
          type: 'board',
          id: 'a/b',
          response: RSVP.resolve(res)
        });
        queryLog.defineFixture({
          method: 'POST',
          type: 'board',
          response: RSVP.resolve(res2),
          compare: function(object) {
            var grid = object.get('grid');
            var buttons = object.get('buttons');
            if(buttons === undefined && object.get('parent_board_id') === 'a/b') {
              if(grid && grid.order && grid.order[0] && grid.order[0][0] === null) {
                return true;
              }
            }
            return false;
          }
        });
        queryLog.defineFixture({
          method: 'PUT',
          type: 'board',
          response: RSVP.resolve(res2),
          compare: function(object) {
            var grid = object.get('grid');
            var buttons = object.get('buttons');
            if(buttons.length === 1 && buttons[0].id === 1) {
              if(grid && grid.order && grid.order[0] && grid.order[0][0] === 1) {
                matched = true;
                return true;
              }
            }
            return false;
          }
        });


        var a = Button.create({id: 123, label: 'peanut butter', for_swap: true});
        var b = Button.create({id: 987, label: 'jelly', for_swap: true, load_board: {key: 'a/b'}});
        board.set('model.buttons', [a.raw(), b.raw()]);
        board.set('ordered_buttons', [[a, b]]);
        var success = false;
        editManager.move_button(a.get('id'), b.get('id'), 'copy').then(function(res) {
          success = res;
        });
        waitsFor(function() { return matched; });
        runs();
        waitsFor(function() { return success; });
        runs(function() {
          expect(success.visible).toEqual(true);
          expect(success.button).toNotEqual(null);
          var ob = board.get('ordered_buttons');
          expect(ob[0][1].load_board.key).toEqual('c/d');
        });
      });
    });
  });

  describe("multiple edits", function() {
    it("should aggregate multiple edits into a single undo", function() {
      editManager.setup(board);
      var button = Button.create({
        id: 1482,
        label: "ham and cheese"
      });
      board.set('ordered_buttons', [[
        button
      ]]);
      editManager.save_state({button_id: 1482, changes: {}});
      expect(editManager.get('history').length).toEqual(1);
      editManager.save_state({button_id: 1482, changes: {}});
      expect(editManager.get('history').length).toEqual(1);
      editManager.save_state({button_id: 1482, changes: {}});
      expect(editManager.get('history').length).toEqual(1);
    });
    it("should aggregate multiple paints into a single undo", function() {
      editManager.setup(board);
      var button = Button.create({
        id: 1482,
        label: "ham and cheese"
      });
      board.set('ordered_buttons', [[
        button
      ]]);
      editManager.save_state({mode: 'paint', paint_id: 1234567});
      expect(editManager.get('history').length).toEqual(1);
      editManager.save_state({mode: 'paint', paint_id: 1234567});
      expect(editManager.get('history').length).toEqual(1);
      editManager.save_state({mode: 'paint', paint_id: 1234567});
      expect(editManager.get('history').length).toEqual(1);
      editManager.save_state({mode: 'paint', paint_id: 12345678});
      expect(editManager.get('history').length).toEqual(2);
    });
    it("shouldn't aggregate edits on different buttons", function() {
      editManager.setup(board);
      var button = Button.create({
        id: 1482,
        label: "ham and cheese"
      });
      board.set('ordered_buttons', [[
        button
      ]]);
      editManager.save_state({button_id: 1482, changes: {}});
      expect(editManager.get('history').length).toEqual(1);
      editManager.save_state({button_id: 1483, changes: {}});
      expect(editManager.get('history').length).toEqual(2);
    });
    it("shouldn't aggregate edits on the same button for different attributes", function() {
      editManager.setup(board);
      var button = Button.create({
        id: 1482,
        label: "ham and cheese"
      });
      board.set('ordered_buttons', [[
        button
      ]]);
      editManager.save_state({button_id: 1482, changes: ['ears', 'nose']});
      expect(editManager.get('history').length).toEqual(1);
      editManager.save_state({button_id: 1482, changes: ['ears', 'nose']});
      expect(editManager.get('history').length).toEqual(1);
      editManager.save_state({button_id: 1482, changes:['nose']});
      expect(editManager.get('history').length).toEqual(2);
    });
    it("should aggregate edits on the same button for different edits to the same attributes", function() {
      editManager.setup(board);
      var button = Button.create({
        id: 1482,
        label: "ham and cheese"
      });
      board.set('ordered_buttons', [[
        button
      ]]);
      editManager.change_button(1482, {label: 'chicken and waffles'});
      expect(editManager.get('history').length).toEqual(1);
      editManager.change_button(1482, {label: 'cheese and crackers'});
      expect(editManager.get('history').length).toEqual(1);
    });
  });

  describe("undo/redo", function() {
    it("should allow undoing an edit", function() {
      editManager.setup(board);
      board.set('ordered_buttons', [[]]);
      editManager.set('history', [[[{id: 1}]]]);
      editManager.undo();
      expect(editManager.get('history').length).toEqual(0);
      expect(board.get('ordered_buttons')).toEqual([[{id: 1}]]);
    });
    it("should not do anything on undo when undo is empty", function() {
      editManager.setup(board);
      editManager.undo();
      editManager.undo();
      editManager.undo();
      editManager.set('future', [{}]);
      editManager.undo();
      expect(editManager.get('future')).toEqual([{}]);
    });
    it("should not do anything on redo when redo is empty", function() {
      editManager.setup(board);
      editManager.redo();
      editManager.redo();
      editManager.set('history', [{}]);
      editManager.redo();
      expect(editManager.get('history')).toEqual([{}]);
    });
    it("should populate future on undo commands", function() {
      editManager.setup(board);
      board.set('ordered_buttons', [[]]);
      editManager.set('history', [[[{id: 1}]]]);
      editManager.undo();
      expect(editManager.get('history').length).toEqual(0);
      expect(editManager.get('future').length).toEqual(1);
      expect(editManager.get('future')[0].length).toEqual(1);
      expect(editManager.get('future')[0][0].length).toEqual(0);
      expect(board.get('ordered_buttons')).toEqual([[{id: 1}]]);
    });
    it("should populate history on redo commands", function() {
      editManager.setup(board);
      board.set('ordered_buttons', [[]]);
      editManager.set('future', [[[{id: 1}]]]);
      editManager.redo();
      expect(editManager.get('future').length).toEqual(0);
      expect(editManager.get('history').length).toEqual(1);
      expect(editManager.get('history')[0].length).toEqual(1);
      expect(editManager.get('history')[0][0].length).toEqual(0);
      expect(board.get('ordered_buttons')).toEqual([[{id: 1}]]);
    });
    it("should allow redoing an edit after undo", function() {
      editManager.setup(board);
      board.set('ordered_buttons', [[]]);
      var b = Button.create({id: 133});
      editManager.set('future', [[[b]]]);
      editManager.redo();
      expect(editManager.get('future').length).toEqual(0);
      expect(editManager.get('history').length).toEqual(1);
      expect(editManager.get('history')[0].length).toEqual(1);
      expect(editManager.get('history')[0][0].length).toEqual(0);
      expect(board.get('ordered_buttons')).toEqual([[b]]);
      editManager.undo();
      expect(editManager.get('history').length).toEqual(0);
      expect(editManager.get('future').length).toEqual(1);
      expect(editManager.get('future')[0].length).toEqual(1);
      expect(editManager.get('future')[0][0].length).toEqual(1);
      expect(editManager.get('future')[0][0][0].get('id')).toEqual(b.get('id'));
      expect(board.get('ordered_buttons').length).toEqual(1);
      expect(board.get('ordered_buttons')[0].length).toEqual(0);
      editManager.redo();
      expect(editManager.get('future').length).toEqual(0);
      expect(editManager.get('history').length).toEqual(1);
      expect(editManager.get('history')[0].length).toEqual(1);
      expect(editManager.get('history')[0][0].length).toEqual(0);
      expect(board.get('ordered_buttons')[0][0].get('id')).toEqual(b.get('id'));
    });

    it("should clear redo history after undo and then another edit", function() {
      editManager.setup(board);
      var b = Button.create({id: 9124});
      board.set('ordered_buttons', [[]]);
      editManager.set('history', [[[b]]]);
      editManager.undo();
      expect(editManager.get('history').length).toEqual(0);
      expect(editManager.get('future').length).toEqual(1);
      editManager.clear_button(9124);
      expect(editManager.get('history').length).toEqual(1);
      expect(editManager.get('future').length).toEqual(0);
    });
  });

  describe("fake_button", function() {
    it("should create a valid fake button", function() {
      editManager.setup(board);
      var button = editManager.fake_button();
      expect(button.id).toBeLessThan(0);
      expect(button.get('label')).toEqual('');
      expect(button.get('image')).toEqual(undefined);
      expect(button.get('empty')).toEqual(true);
      expect(button.get('display_class')).toEqual('button b___ empty');
    });
  });

  describe("rows and columns", function() {
    it("should properly add a new row of fake buttons whose size matches the grid", function() {
      editManager.setup(board);
      var b = Button.create({id: 9});
      board.set('ordered_buttons', [[b]]);
      expect(editManager.get('history').length).toEqual(0);

      editManager.modify_size('row', 'add');
      var state = board.get('ordered_buttons');
      expect(state.length).toEqual(2);
      expect(state[1][0]).not.toEqual(null);
      expect(state[1][0].get('id') < 0).toEqual(true);
      expect(editManager.get('history').length).toEqual(1);

      editManager.modify_size('row', 'add', 0);
      state = board.get('ordered_buttons');
      expect(state.length).toEqual(3);
      expect(state[0][0]).not.toEqual(null);
      expect(state[0][0].get('id') < 0).toEqual(true);
      expect(editManager.get('history').length).toEqual(2);
    });

    it("should properly add a new column of fake buttons whose size matches the grid", function() {
      editManager.setup(board);
      var b = Button.create({id: 9});
      board.set('ordered_buttons', [[b]]);
      expect(editManager.get('history').length).toEqual(0);

      editManager.modify_size('column', 'add');
      var state = board.get('ordered_buttons');
      expect(state.length).toEqual(1);
      expect(state[0].length).toEqual(2);
      expect(state[0][1]).not.toEqual(null);
      expect(state[0][1].get('id') < 0).toEqual(true);
      expect(editManager.get('history').length).toEqual(1);

      editManager.modify_size('column', 'add', 0);
      state = board.get('ordered_buttons');
      expect(state.length).toEqual(1);
      expect(state[0].length).toEqual(3);
      expect(state[0][0]).not.toEqual(null);
      expect(state[0][0].get('id') < 0).toEqual(true);
      expect(editManager.get('history').length).toEqual(2);
    });

    it("should force at least one row", function() {
      editManager.setup(board);
      var b = Button.create({id: 9});
      board.set('ordered_buttons', [[b]]);
      expect(editManager.get('history').length).toEqual(0);

      editManager.modify_size('row', 'remove');
      var state = board.get('ordered_buttons');
      expect(state.length).toEqual(1);
      expect(state[0].length).toEqual(1);
      expect(editManager.get('history').length).toEqual(1);

      editManager.modify_size('row', 'remove');
      state = board.get('ordered_buttons');
      expect(state.length).toEqual(1);
      expect(state[0].length).toEqual(1);
      expect(editManager.get('history').length).toEqual(2);
    });

    it("should properly remove a row", function() {
      editManager.setup(board);
      var b = Button.create({id: 9});
      board.set('ordered_buttons', [[b]]);
      expect(editManager.get('history').length).toEqual(0);

      editManager.modify_size('row', 'remove');
      var state = board.get('ordered_buttons');
      expect(state.length).toEqual(1);
      expect(state[0].length).toEqual(1);
      expect(editManager.get('history').length).toEqual(1);

      editManager.modify_size('row', 'remove');
      state = board.get('ordered_buttons');
      expect(state.length).toEqual(1);
      expect(state[0].length).toEqual(1);
      expect(editManager.get('history').length).toEqual(2);

      editManager.modify_size('row', 'add');
      editManager.modify_size('column', 'add');
      editManager.modify_size('row', 'add');
      editManager.modify_size('row', 'remove');
      state = board.get('ordered_buttons');
      expect(state.length).toEqual(2);
      expect(state[0].length).toEqual(2);
    });

    it("should force at least one column", function() {
      editManager.setup(board);
      var b = Button.create({id: 9});
      board.set('ordered_buttons', [[b]]);
      expect(editManager.get('history').length).toEqual(0);

      editManager.modify_size('column', 'remove');
      var state = board.get('ordered_buttons');
      expect(state.length).toEqual(1);
      expect(state[0].length).toEqual(1);
      expect(editManager.get('history').length).toEqual(1);

      editManager.modify_size('column', 'remove');
      state = board.get('ordered_buttons');
      expect(state.length).toEqual(1);
      expect(state[0].length).toEqual(1);
      expect(editManager.get('history').length).toEqual(2);
    });

    it("should properly remove a column", function() {
      editManager.setup(board);
      var b = Button.create({id: 9});
      board.set('ordered_buttons', [[b]]);
      expect(editManager.get('history').length).toEqual(0);

      editManager.modify_size('column', 'remove');
      var state = board.get('ordered_buttons');
      expect(state.length).toEqual(1);
      expect(state[0].length).toEqual(1);
      expect(editManager.get('history').length).toEqual(1);

      editManager.modify_size('column', 'remove');
      state = board.get('ordered_buttons');
      expect(state.length).toEqual(1);
      expect(state[0].length).toEqual(1);
      expect(editManager.get('history').length).toEqual(2);

      editManager.modify_size('column', 'add');
      editManager.modify_size('row', 'add');
      editManager.modify_size('column', 'add');
      editManager.modify_size('column', 'remove');
      state = board.get('ordered_buttons');
      expect(state.length).toEqual(2);
      expect(state[0].length).toEqual(2);
    });
  });

  describe("painting", function() {
    it("should properly clear paint mode", function() {
      editManager.setup(board);
      editManager.paint_mode = {};
      board.set('paint_mode', true);
      editManager.clear_paint_mode();
      expect(board.get('paint_mode')).toEqual(false);
      expect(editManager.paint_mode).toEqual(null);
    });
    it("should allow setting a stroke", function() {
      editManager.setup(board);
      editManager.set_paint_mode('hide');
      expect(editManager.paint_mode.hidden).toEqual(true);
      expect(editManager.paint_mode.paint_id).not.toEqual(null);
      var last_id = editManager.paint_mode.paint_id;

      editManager.set_paint_mode('show');
      expect(editManager.paint_mode.hidden).toEqual(false);
      expect(editManager.paint_mode.paint_id).not.toEqual(null);
      expect(editManager.paint_mode.paint_id).not.toEqual(last_id);
      last_id = editManager.paint_mode.paint_id;

      editManager.set_paint_mode('#abf');
      expect(editManager.paint_mode.border).toEqual('rgb(17, 65, 255)');
      expect(editManager.paint_mode.fill).toEqual('rgb(170, 187, 255)');
      expect(editManager.paint_mode.paint_id).not.toEqual(last_id);
      last_id = editManager.paint_mode.paint_id;

      editManager.set_paint_mode('white');
      expect(editManager.paint_mode.border).toEqual('rgb(238, 238, 238)');
      expect(editManager.paint_mode.fill).toEqual('rgb(255, 255, 255)');
      expect(editManager.paint_mode.paint_id).not.toEqual(last_id);
      last_id = editManager.paint_mode.paint_id;

      editManager.set_paint_mode('#77aabbff');
      expect(editManager.paint_mode.border).toEqual('rgba(17, 65, 255, 0.47)');
      expect(editManager.paint_mode.fill).toEqual('rgba(170, 187, 255, 0.47)');
      expect(editManager.paint_mode.paint_id).not.toEqual(last_id);
      last_id = editManager.paint_mode.paint_id;

      editManager.set_paint_mode('#77002266');
      expect(editManager.paint_mode.border).toEqual('rgba(0, 85, 255, 0.47)');
      expect(editManager.paint_mode.fill).toEqual('rgba(0, 34, 102, 0.47)');
      expect(editManager.paint_mode.paint_id).not.toEqual(last_id);
      last_id = editManager.paint_mode.paint_id;
    });

    it("should allow setting part_of_speech on a paint stroke", function() {
      var b1 = Button.create({id: 123});
      var b2 = Button.create({id: 234, part_of_speech: 'noun', suggeseted_part_of_speech: 'noun'});
      var b3 = Button.create({id: 234, part_of_speech: 'noun', suggeseted_part_of_speech: 'verb'});
      board.set('ordered_buttons', [[b1, b2, b3]]);
      editManager.setup(board);
      editManager.set_paint_mode('#ff0000', null, 'noun');
      expect(editManager.paint_mode.fill).toEqual('rgb(255, 0, 0)');
      expect(editManager.paint_mode.part_of_speech).toEqual('noun');
      expect(editManager.get('history').length).toEqual(0);

      editManager.paint_button(123);
      expect(editManager.get('history').length).toEqual(1);
      expect(b1.get('border_color')).toEqual('rgb(102, 0, 0)');
      expect(b1.get('part_of_speech')).toEqual('noun');
      expect(b1.get('painted_part_of_speech')).toEqual('noun');
      expect(b2.get('border_color')).toEqual(undefined);
      expect(b2.get('background_color')).toEqual(undefined);
    });

    it("should appropriately update buttons using the current stroke", function() {
      var b1 = Button.create({id: 123});
      var b2 = Button.create({id: 234});
      board.set('ordered_buttons', [[b1, b2]]);
      editManager.setup(board);
      editManager.set_paint_mode('rgba(255, 0, 0, 0.5)');
      expect(editManager.get('history').length).toEqual(0);

      editManager.paint_button(123);
      expect(editManager.get('history').length).toEqual(1);
      expect(b1.get('border_color')).toEqual('rgba(102, 0, 0, 0.5)');
      expect(b1.get('background_color')).toEqual('rgba(255, 0, 0, 0.5)');
      expect(b2.get('border_color')).toEqual(undefined);
      expect(b2.get('background_color')).toEqual(undefined);

      editManager.paint_button(234);
      expect(editManager.get('history').length).toEqual(1);
      expect(b1.get('border_color')).toEqual('rgba(102, 0, 0, 0.5)');
      expect(b1.get('background_color')).toEqual('rgba(255, 0, 0, 0.5)');
      expect(b2.get('border_color')).toEqual('rgba(102, 0, 0, 0.5)');
      expect(b2.get('background_color')).toEqual('rgba(255, 0, 0, 0.5)');

      editManager.undo();
      expect(editManager.get('history').length).toEqual(0);
      var newb1 = board.get('ordered_buttons')[0][0];
      var newb2 = board.get('ordered_buttons')[0][1];
      expect(newb1.get('border_color')).toEqual(undefined);
      expect(newb1.get('background_color')).toEqual(undefined);
      expect(newb2.get('border_color')).toEqual(undefined);
      expect(newb2.get('background_color')).toEqual(undefined);
    });

    it("should create a new undo event when the stroke is reset", function() {
      var b1 = Button.create({id: 123});
      var b2 = Button.create({id: 234});
      board.set('ordered_buttons', [[b1, b2]]);
      editManager.setup(board);
      editManager.set_paint_mode('rgba(255, 0, 0, 0.5)');
      expect(editManager.get('history').length).toEqual(0);

      editManager.paint_button(123);
      expect(editManager.get('history').length).toEqual(1);
      expect(b1.get('border_color')).toEqual('rgba(102, 0, 0, 0.5)');
      expect(b1.get('background_color')).toEqual('rgba(255, 0, 0, 0.5)');
      expect(b2.get('border_color')).toEqual(undefined);
      expect(b2.get('background_color')).toEqual(undefined);

      editManager.set_paint_mode('rgba(124, 0, 0, 0.5)');
      editManager.paint_button(234);
      expect(editManager.get('history').length).toEqual(2);
      expect(b1.get('border_color')).toEqual('rgba(102, 0, 0, 0.5)');
      expect(b1.get('background_color')).toEqual('rgba(255, 0, 0, 0.5)');
      expect(b2.get('border_color')).toEqual('rgba(255, 22, 22, 0.5)');
      expect(b2.get('background_color')).toEqual('rgba(124, 0, 0, 0.5)');

      editManager.release_stroke();
      editManager.paint_button(123);
      expect(editManager.get('history').length).toEqual(3);
      expect(b1.get('border_color')).toEqual('rgba(255, 22, 22, 0.5)');
      expect(b1.get('background_color')).toEqual('rgba(124, 0, 0, 0.5)');
      expect(b2.get('border_color')).toEqual('rgba(255, 22, 22, 0.5)');
      expect(b2.get('background_color')).toEqual('rgba(124, 0, 0, 0.5)');
    });
  });

  describe("find_button", function() {
    it("should find matching button in the ordered_buttons list", function() {
      editManager.setup(board);
      board.set('ordered_buttons', [
        [{}, {}, {}],
        [
          {},
          {id: 1234, label: "chicken"},
          {id: 2345, label: "ham"}
        ]
      ]);
      var b = editManager.find_button(1234);
      expect(b).not.toEqual(null);
      expect(b.label).toEqual("chicken");
      b = editManager.find_button(2345);
      expect(b).not.toEqual(null);
      expect(b.label).toEqual("ham");
    });

    it("should find first empty button if specified", function() {
      editManager.setup(board);
      board.set('ordered_buttons', [
        [{}, {}, {empty: true, id: 999}],
        [
          {},
          {id: 1234, label: "chicken"},
          {id: 2345, label: "ham"}
        ]
      ]);
      var b = editManager.find_button('empty');
      expect(b).not.toEqual(null);
      expect(b.id).toEqual(999);
    });
  });

  describe("lucky_symbol", function() {
    it("should search for and set a searched image based on the label", function() {
      editManager.setup(board);
      app_state.set('edit_mode', true);
      var button = Button.create({id: 1, label: "ham"});
      board.set('ordered_buttons', [[
        button
      ]]);
      var defer = RSVP.defer();
      var ajaxed = false;
      stub(contentGrabbers.pictureGrabber, 'picture_search', function(library, label, user_name, fallback) {
        ajaxed = true;
        expect(label).toEqual('ham');
        expect(user_name).toEqual(undefined);
        expect(fallback).toEqual(true);
        return defer.promise;
      });
      stub(contentGrabbers.pictureGrabber, 'save_image_preview', function(preview) {
        return RSVP.resolve(EmberObject.create({
          id: '134'
        }));
      });
      editManager.lucky_symbol(1);
      expect(button.get('pending_image')).toEqual(true);
      expect(ajaxed).toEqual(true);


      queryLog.defineFixture({
        method: 'POST',
        type: 'image',
        response: RSVP.resolve({image: {id: '134', url: "http://www.example.com/pic2.png"}}),
        compare: function(object) {
          return object.get('license.type') === 'LGPL' &&
                  object.get('license.copyright_notice_url') === 'https://www.gnu.org/licenses/lgpl.html' &&
                  object.get('license.source_url') === 'http://www.example.com/' &&
                  object.get('license.author_name') === 'Bob Jones' &&
                  object.get('license.author_url') === '@bobjones' &&
                  object.get('url') === 'http://www.example.com/pic.png' &&
                  object.get('suggestion') === 'ham' &&
                  object.get('external_id') === 'bobs_pic';
        }
      });
      defer.resolve([{
        license: "LGPL",
        license_url: "https://www.gnu.org/licenses/lgpl.html",
        source_url: "http://www.example.com/",
        author: "Bob Jones",
        author_url: "@bobjones",
        image_url: "http://www.example.com/pic.png",
        id: "bobs_pic"
      }]);
      waitsFor(function() { return button.get('image'); });
      runs(function() {
        expect(button.get('image_id')).toEqual('134');
        expect(button.get('pending_image')).toEqual(false);
        expect(button.get('pending')).toEqual(false);
      });
    });

    it("should clear button's pending state when search returns no results", function() {
      editManager.setup(board);
      app_state.set('edit_mode', true);
      var button = Button.create({id: 1, label: "ham"});
      board.set('ordered_buttons', [[
        button
      ]]);
      var defer = RSVP.defer();
      var ajaxed = false;
      stub(persistence, 'ajax', function(url, opts) {
        if(url == '/api/v1/search/symbols?q=ham') {
          ajaxed = true;
          expect(url).toEqual('/api/v1/search/symbols?q=ham');
          expect(opts.type).toEqual('GET');
          return defer.promise;
        } else {
          return RSVP.reject();
        }
      });
      editManager.lucky_symbol(1);
      expect(button.get('pending_image')).toEqual(true);
      expect(ajaxed).toEqual(true);


      queryLog.defineFixture({
        method: 'POST',
        type: 'image',
        response: RSVP.resolve({image: {id: '134', url: "http://www.example.com/pic2.png"}}),
        compare: function(object) {
          return object.get('license.type') === 'LGPL' &&
                  object.get('license.copyright_notice_url') === 'https://www.gnu.org/licenses/lgpl.html' &&
                  object.get('license.source_url') === 'http://www.example.com/' &&
                  object.get('license.author_name') === 'Bob Jones' &&
                  object.get('license.author_url') === '@bobjones' &&
                  object.get('url') === 'http://www.example.com/pic.png' &&
                  object.get('suggestion') === 'ham' &&
                  object.get('external_id') === 'bobs_pic';
        }
      });
      defer.resolve([]);
      expect(button.get('pending')).toEqual(true);
      waitsFor(function() { return button.get('pending') === false; });
      runs(function() {
        expect(button.get('image_id')).toEqual(undefined);
        expect(button.get('pending_image')).toEqual(false);
      });
    });
    it("should search for parts of speech data", function() {
      editManager.setup(board);
      app_state.set('edit_mode', true);
      var button = Button.create({id: 1, label: "ham"});
      board.set('ordered_buttons', [[
        button
      ]]);
      var defer = RSVP.defer();
      var ajaxed = false;
      stub(persistence, 'ajax', function(url, opts) {
        if(url == '/api/v1/search/parts_of_speech' && opts.data.q == 'ham') {
          ajaxed = true;
          expect(opts.type).toEqual('GET');
          return defer.promise;
        } else {
          return RSVP.reject();
        }
      });
      editManager.lucky_symbol(1);
      expect(button.get('pending_image')).toEqual(true);
      expect(ajaxed).toEqual(true);

      queryLog.defineFixture({
        method: 'POST',
        type: 'image',
        response: RSVP.resolve({image: {id: '134', url: "http://www.example.com/pic2.png"}}),
        compare: function(object) {
          return object.get('license.type') == 'LGPL' &&
                  object.get('license.copyright_notice_url') == 'https://www.gnu.org/licenses/lgpl.html' &&
                  object.get('license.source_url') == 'http://www.example.com/' &&
                  object.get('license.author_name') == 'Bob Jones' &&
                  object.get('license.author_url') == '@bobjones' &&
                  object.get('url') == 'http://www.example.com/pic.png' &&
                  object.get('suggestion') == 'ham' &&
                  object.get('external_id') == 'bobs_pic';
        }
      });
      defer.resolve({
        word: 'ham',
        types: ['noun']
      });
      waitsFor(function() { return button.get('parts_of_speech_matching_word'); });
      runs(function() {
        expect(button.get('pending_image')).toEqual(false);
        expect(button.get('parts_of_speech_matching_word')).toEqual('ham');
        expect(button.get('background_color')).toEqual('#fca');
      });
    });
    it("should fail gracefully if the button doesn't have a label", function() {
      editManager.setup(board);
      app_state.set('edit_mode', true);
      var button = Button.create({id: 1});
      board.set('ordered_buttons', [[
        button
      ]]);
      var defer = RSVP.defer();
      var ajaxed = false;
      stub(persistence, 'ajax', function(url, opts) {
        ajaxed = true;
        return defer.promise;
      });
      editManager.lucky_symbol(1);
      expect(ajaxed).toEqual(false);
      expect(button.get('pending_image')).not.toEqual(true);
    });
    it("should fail gracefully on ajax error", function() {
      editManager.setup(board);
      app_state.set('edit_mode', true);
      var button = Button.create({id: 1, label: "onward"});
      board.set('ordered_buttons', [[
        button
      ]]);
      var defer = RSVP.defer();
      var ajaxed = false;
      stub(persistence, 'ajax', function(url, opts) {
        if(url == '/api/v1/search/symbols?q=onward') {
          ajaxed = true;
          expect(url).toEqual('/api/v1/search/symbols?q=onward');
          expect(opts.type).toEqual('GET');
          return defer.promise;
        } else {
          return RSVP.reject();
        }
      });
      editManager.lucky_symbol(1);
      expect(ajaxed).toEqual(true);
      expect(button.get('pending_image')).toEqual(true);
      defer.reject();
      waitsFor(function() { return button.get('pending_image') === false; });
      runs(function() {
        expect(button.get('pending')).toEqual(false);
      });
    });

    it("should search the last library selected by the user", function() {
      stashes.set('last_image_library', 'lessonpix');
      editManager.setup(board);
      app_state.set('edit_mode', true);
      var button = Button.create({id: 1, label: "onward"});
      board.set('ordered_buttons', [[
        button
      ]]);
      var defer = RSVP.defer();
      var searched = false;
      stub(contentGrabbers.pictureGrabber, 'protected_search', function(text, library, user_name, fallback) {
        expect(library).toEqual('lessonpix');
        expect(text).toEqual('onward');
        expect(user_name).toEqual(undefined);
        expect(fallback).toEqual(true);
        searched = true;
        return RSVP.reject();
      });
      editManager.lucky_symbol(1);
      expect(searched).toEqual(true);
      expect(button.get('pending_image')).toEqual(true);
      waitsFor(function() { return button.get('pending_image') === false; });
      runs(function() {
        expect(button.get('pending')).toEqual(false);
      });
    });

    it("should fall back to the default library if searching in a protected library fails", function() {
      stashes.set('last_image_library', 'lessonpix');
      editManager.setup(board);
      stub(persistence, 'ajax', function() { return RSVP.reject(); });
      app_state.set('edit_mode', true);
      var button = Button.create({id: 1, label: "onward"});
      board.set('ordered_buttons', [[
        button
      ]]);
      var defer = RSVP.defer();
      var searched = false;
      stub(contentGrabbers.pictureGrabber, 'open_symbols_search', function(text) {
        expect(text).toEqual('onward');
        searched = true;
        return RSVP.reject();
      });
      editManager.lucky_symbol(1);
      expect(button.get('pending_image')).toEqual(true);
      waitsFor(function() { return searched; });
      runs(function() {
        expect(searched).toEqual(true);
      });
      waitsFor(function() { return button.get('pending_image') === false; });
      runs(function() {
        expect(button.get('pending')).toEqual(false);
      });
    });
  });

  describe("process_for_saving", function() {
    it("should update attributes for buttons", function() {
      editManager.setup(board);
      var button = Button.create({
        label: 'hat',
        image_id: 1,
        sound_id: 2,
        vocalization: 'hat',
        background_color: 'mahogany',
        border_color: '#88aabbff',
        id: 245
      });
      var button2 = Button.create({
        label: 'happen',
        image_id: 1,
        sound_id: 3,
        vocalization: 'it happened',
        background_color: 'rgb(255, 0, 0)',
        border_color: 'rbg(300, 100, 0)'
      });
      var button3 = Button.create({
        label: 'cheese',
        background_color: '#abf',
        border_color: 'hsv(320, 100%, 59%)'
      });
      var button4 = editManager.fake_button();
      board.set('ordered_buttons', [[button, button2],[button3, button4]]);
      board.set('model.buttons', []);
      var state = editManager.process_for_saving();

      expect(state.buttons.length).toEqual(3);
      expect(state.grid).toEqual({
        rows: 2,
        columns: 2,
        order: [[1, 2],[3, null]]
      });
      expect(state.buttons[0]).toEqual({
        id: 1,
        label: 'hat',
        image_id: 1,
        sound_id: 2,
        border_color: 'rgba(170, 187, 255, 0.53)',
        link_disabled: false,
        blocking_speech: false,
        hidden: false,
        add_to_vocalization: false,
        hide_label: false,
        home_lock: false
      });
      expect(state.buttons[1]).toEqual({
        id: 2,
        label: 'happen',
        image_id: 1,
        sound_id: 3,
        vocalization: 'it happened',
        background_color: 'rgb(255, 0, 0)',
        link_disabled: false,
        blocking_speech: false,
        hidden: false,
        add_to_vocalization: false,
        hide_label: false,
        home_lock: false
      });
      expect(state.buttons[2]).toEqual({
        id: 3,
        label: 'cheese',
        background_color: 'rgb(170, 187, 255)',
        border_color: 'rgb(150, 0, 100)',
        link_disabled: false,
        blocking_speech: false,
        hidden: false,
        add_to_vocalization: false,
        hide_label: false,
        home_lock: false
      });
    });

    it("should set part_of_speech attributes for buttons", function() {
      editManager.setup(board);
      var button = Button.create({
        label: 'hat',
        image_id: 1,
        sound_id: 2,
        vocalization: 'hat',
        background_color: 'mahogany',
        border_color: '#88aabbff',
        part_of_speech: 'noun',
        suggested_part_of_speech: 'verb',
        id: 245
      });
      var button2 = Button.create({
        label: 'happen',
        image_id: 1,
        sound_id: 3,
        vocalization: 'it happened',
        background_color: 'rgb(255, 0, 0)',
        border_color: 'rbg(300, 100, 0)',
        part_of_speech: 'noun',
        painted_part_of_speech: 'noun'
      });
      var button3 = Button.create({
        label: 'cheese',
        background_color: '#abf',
        border_color: 'hsv(320, 100%, 59%)'
      });
      var button4 = editManager.fake_button();
      board.set('ordered_buttons', [[button, button2],[button3, button4]]);
      board.set('model.buttons', []);
      var state = editManager.process_for_saving();

      expect(state.buttons.length).toEqual(3);
      expect(state.grid).toEqual({
        rows: 2,
        columns: 2,
        order: [[1, 2],[3, null]]
      });
      expect(state.buttons[0]).toEqual({
        id: 1,
        label: 'hat',
        image_id: 1,
        sound_id: 2,
        border_color: 'rgba(170, 187, 255, 0.53)',
        link_disabled: false,
        blocking_speech: false,
        hidden: false,
        hide_label: false,
        part_of_speech: 'noun',
        suggested_part_of_speech: 'verb',
        add_to_vocalization: false,
        home_lock: false
      });
      expect(state.buttons[1]).toEqual({
        id: 2,
        label: 'happen',
        image_id: 1,
        sound_id: 3,
        vocalization: 'it happened',
        background_color: 'rgb(255, 0, 0)',
        link_disabled: false,
        blocking_speech: false,
        hidden: false,
        hide_label: false,
        part_of_speech: 'noun',
        painted_part_of_speech: 'noun',
        add_to_vocalization: false,
        home_lock: false
      });
      expect(state.buttons[2]).toEqual({
        id: 3,
        label: 'cheese',
        background_color: 'rgb(170, 187, 255)',
        border_color: 'rgb(150, 0, 100)',
        link_disabled: false,
        blocking_speech: false,
        hidden: false,
        add_to_vocalization: false,
        home_lock: false,
        hide_label: false
      });
    });

    it("should clear removed buttons", function() {
      editManager.setup(board);
      var button = Button.create({
        sound_id: 2,
        vocalization: 'hat',
        background_color: 'mahogany',
        border_color: '#88aabbff',
        id: 245
      });
      var button2 = Button.create({
        label: 'happen',
        image_id: 1,
        sound_id: 3,
        vocalization: 'it happened',
        background_color: 'rgb(255, 0, 0)',
        border_color: 'rbg(300, 100, 0)'
      });
      var button3 = Button.create({
        label: 'cheese',
        background_color: '#abf',
        border_color: 'hsv(320, 100%, 59%)'
      });
      var button4 = editManager.fake_button();
      board.set('ordered_buttons', [[button, button2],[button3, button4]]);
      board.set('model.buttons', []);
      var state = editManager.process_for_saving();

      expect(state.buttons.length).toEqual(2);
      expect(state.grid).toEqual({
        rows: 2,
        columns: 2,
        order: [[null, 1],[2, null]]
      });
      expect(state.buttons[0]).toEqual({
        id: 1,
        label: 'happen',
        image_id: 1,
        sound_id: 3,
        vocalization: 'it happened',
        link_disabled: false,
        blocking_speech: false,
        background_color: 'rgb(255, 0, 0)',
        hidden: false,
        add_to_vocalization: false,
        hide_label: false,
        home_lock: false
      });
      expect(state.buttons[1]).toEqual({
        id: 2,
        label: 'cheese',
        background_color: 'rgb(170, 187, 255)',
        border_color: 'rgb(150, 0, 100)',
        link_disabled: false,
        blocking_speech: false,
        hidden: false,
        add_to_vocalization: false,
        hide_label: false,
        home_lock: false
      });
    });

    it("should handle integration buttons", function() {
      editManager.setup(board);
      var button = Button.create({
        label: 'okay hat',
        vocalization: 'hat',
        integration: {okay: true},
        background_color: 'mahogany',
        border_color: '#88aabbff',
        id: 245
      });
      var button2 = editManager.fake_button();
      var button3 = editManager.fake_button();
      var button4 = editManager.fake_button();
      board.set('ordered_buttons', [[button, button2],[button3, button4]]);
      board.set('model.buttons', []);
      var state = editManager.process_for_saving();

      expect(state.buttons.length).toEqual(1);
      expect(state.grid).toEqual({
        rows: 2,
        columns: 2,
        order: [[1, null],[null, null]]
      });
      expect(state.buttons[0]).toEqual({
        id: 1,
        label: 'okay hat',
        integration: {okay: true},
        vocalization: 'hat',
        link_disabled: false,
        blocking_speech: false,
        border_color: 'rgba(170, 187, 255, 0.53)',
        hidden: false,
        add_to_vocalization: false,
        hide_label: false,
        home_lock: false
      });
    });

    it('should set translations if defined for a button', function() {
      editManager.setup(board);
      var button = Button.create({
        label: 'okay hat',
        vocalization: 'hat',
        integration: {okay: true},
        background_color: 'mahogany',
        border_color: '#88aabbff',
        id: 245
      });
      button.set('translations', [{245: {}}]);
      var button2 = editManager.fake_button();
      var button3 = editManager.fake_button();
      var button4 = editManager.fake_button();
      board.set('ordered_buttons', [[button, button2],[button3, button4]]);
      board.set('model.buttons', []);
      var state = editManager.process_for_saving();

      expect(state.buttons.length).toEqual(1);
      expect(state.grid).toEqual({
        rows: 2,
        columns: 2,
        order: [[1, null],[null, null]]
      });
      expect(state.buttons[0]).toEqual({
        id: 1,
        label: 'okay hat',
        integration: {okay: true},
        vocalization: 'hat',
        link_disabled: false,
        blocking_speech: false,
        border_color: 'rgba(170, 187, 255, 0.53)',
        hidden: false,
        add_to_vocalization: false,
        hide_label: false,
        home_lock: false,
        translations: [{245: {}}]
      });
    });

    it('should handle level modifications', function() {
      expect('test').toEqual('todo');
      // for(var ref_key in mods.pre) {
      //   var found_change = false;
      //   for(var level in mods) {
      //     if(level != 'pre' && mods[level][ref_key] != undefined && mods[level][ref_key] != mods.pre[ref_key]) {
      //       found_change = true;
      //     }
      //   }
      //   if(!found_change) {
      //     newButton[ref_key] = mods.pre[ref_key];
      //     delete mods.pre[ref_key];
      //   }
      // }
    });

    it('should clear level modifications for none level_style', function() {
      expect('test').toEqual('todo');
    });

    it('should parse JSON for advanced level_style', function() {
      expect('test').toEqual('todo');
    });
    
    it('should clear and apply level modifications attributes that are only set on pre', function() {
      expect('test').toEqual('todo');
    });

    it('should clear and apply level modifications attributes that are only set on override', function() {
      expect('test').toEqual('todo');
    });

    it('should clear and apply level modifications that match for every level they are set on', function() {
      expect('test').toEqual('todo');
    });
  });

  describe("process_for_displaying", function() {
    it("should only reload the model (in the route setup, prolly should be moved) if it is missing content data");
    it("should build ordered_buttons correctly", function() {
      board.set('model.buttons', [{id: 1, label: 'hat'}, {id: 2, label: 'crow'}]);
      board.set('model.grid', {
        rows: 2,
        columns: 2,
        order: [[2, 1], [null, null]]
      });
      expect(board.get('ordered_buttons')).toEqual(undefined);
      editManager.setup(board);
      editManager.process_for_displaying();
      waitsFor(function() { return board.get('ordered_buttons'); });
      runs(function() {
        expect(board.get('ordered_buttons')).not.toEqual(undefined);
        expect(board.get('ordered_buttons')[0][0].get('label')).toEqual('crow');
        expect(board.get('ordered_buttons')[0][1].get('label')).toEqual('hat');
        expect(board.get('ordered_buttons')[1][0].get('id')).toEqual(-1);
        expect(board.get('ordered_buttons')[1][1].get('id')).toEqual(-2);
        expect(board.sent_messages).toEqual(['check_scanning', 'highlight_button']);
      });
    });
    it("should not set ordered_buttons if in offline mode and images or sounds not found locally", function() {
      board.set('model.buttons', [{id: 1, label: 'pic', image_id: 123, sound_id: 123}]);
      board.set('model.grid', {
        rows: 1,
        columns: 1,
        order: [[1]]
      });
      editManager.setup(board);
      board.set('no_lookups', true);
      editManager.process_for_displaying();

      var button = null;
      waitsFor(function() { return board.get('model.pending_buttons'); });
      runs(function() {
        expect(board.get('ordered_buttons')).toEqual(null);
        expect(board.get('model.pending_buttons')).not.toEqual(null);
        button = board.get('model.pending_buttons')[0];
      });
      waitsFor(function() {
        return button && button.get('content_status') == 'errored';
      });
      runs();
    });
    it("should retrieve local image and sound records", function() {
      LingoLinq.store.push({data: {type: 'image', id: 123, attributes: {
        id: 123, url: 'http://www.example.com/pic.png'
      }}});
      LingoLinq.store.push({data: {type: 'sound', id: 123, attributes: {
        id: 123, url: 'http://www.example.com/pic.png'
      }}});
      board.set('model.buttons', [{id: 1, label: 'pic', image_id: 123, sound_id: 123}]);
      board.set('model.grid', {
        rows: 1,
        columns: 1,
        order: [[1]]
      });
      board.set('model.image_urls', {
        123: 'http://www.example.com/pic.png'
      });
      board.set('model.sound_urls', {
        123: 'http://www.example.com/pic.png'
      });
      editManager.setup(board);
      persistence.primed = true;
      editManager.process_for_displaying();
      var button = null;
      waitsFor(function() { return board.get('ordered_buttons'); });
      runs(function() {
        expect(board.get('ordered_buttons')).not.toEqual(null);
        button = board.get('ordered_buttons')[0][0];
      });
      waitsFor(function() { return button && button.get('content_status') == 'ready'; });
      runs();
    });
    it("should fail when remove image and sound records aren't found", function() {
      board.set('model.buttons', [{id: 1, label: 'pic', image_id: 125, sound_id: 125}]);
      board.set('model.grid', {
        rows: 1,
        columns: 1,
        order: [[1]]
      });
      persistence.primed = true;
      editManager.setup(board);
      var defer1 = RSVP.defer();
      var defer2 = RSVP.defer();
      queryLog.defineFixture({
        method: 'GET',
        type: 'image',
        id: 125,
        response: defer1.promise
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'sound',
        id: 125,
        response: defer2.promise
      });
      editManager.process_for_displaying();
      waitsFor(function() { return board.get('model.pending_buttons'); });
      var button = null;
      runs(function() {
        expect(board.get('ordered_buttons')).toEqual(null);
        expect(board.get('model.pending_buttons')).not.toEqual(null);
        button = board.get('model.pending_buttons')[0];
        expect(button.get('content_status')).toEqual('pending');
        defer1.reject();
        defer2.reject();
      });
      waitsFor(function() { return button && button.get('content_status') == 'errored'; });
      runs(function() {
        expect(board.get('ordered_buttons')).toEqual(null);
      });
    });
    it("should retrieve remote image and sound records", function() {
      board.set('model.buttons', [{id: 1, label: 'pic', image_id: 126, sound_id: 126}]);
      board.set('model.grid', {
        rows: 1,
        columns: 1,
        order: [[1]]
      });
      persistence.primed = true;
      editManager.setup(board);
      var defer1 = RSVP.defer();
      var defer2 = RSVP.defer();
      queryLog.defineFixture({
        method: 'GET',
        type: 'image',
        id: 126,
        response: defer1.promise
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'sound',
        id: 126,
        response: defer2.promise
      });
      editManager.process_for_displaying();
      var button = null;
      waitsFor(function() { return board.get('model.pending_buttons'); });
      runs(function() {
        expect(board.get('ordered_buttons')).toEqual(null);
        expect(board.get('model.pending_buttons')).not.toEqual(null);
        button = board.get('model.pending_buttons')[0];
        expect(button.get('content_status')).toEqual('pending');
        defer1.resolve({image: {id: '126', url: 'http://www.example.com/pic.png'}});
        defer2.resolve({sound: {id: '126', url: 'http://www.example.com/sound.mp3'}});
      });
      waitsFor(function() { return button && button.get('content_status') == 'ready'; });
      runs(function() {
        expect(board.get('ordered_buttons')).not.toEqual(null);
        expect(board.get('model.pending_buttons')).toEqual(null);
        expect(button.get('image')).not.toEqual(null);
      });
    });
    it("should call lucky_symbol for any new buttons that have a suggestion set", function() {
      editManager.setup(board);
      board.set('model.buttons', [{id: 1, label: 'cow', suggest_symbol: 'cow'}]);
      board.set('model.grid', {
        rows: 3,
        columns: 2,
        order: [[null, null],[1, null],[null, null]]
      });
      var called = false;
      stub(editManager, 'lucky_symbol', function(id) {
        called = true;
        expect(id).toEqual(1);
      });
      editManager.process_for_displaying();
      waitsFor(function() { return called; });
      runs(function() {
        expect(board.get('model.found_content_locally')).toEqual(true);
      });
    });
    it("should do nothing if grid is not defined", function() {
      editManager.setup(board);
      editManager.process_for_displaying();
      expect(board.get('ordered_buttons')).toEqual(undefined);
    });

    it("should use the board's image_urls hash if defined", function() {
      LingoLinq.store.push({data: {type: 'image', id: 123, attributes: {
        id: 123, url: 'http://www.example.com/pic.png'
      }}});
      LingoLinq.store.push({data: {type: 'sound', id: 123, attributes: {
        id: 123, url: 'http://www.example.com/sound.mp3'
      }}});
      board.set('model.buttons', [{id: 1, label: 'pic', image_id: 123, sound_id: 123}]);
      persistence.url_cache = {
        'http://www.example.com/pic.png': 'file://pic.png',
        'http://www.example.com/sound.mp3': 'file://sound.mp3'
      };
      board.set('model.image_urls', {
        123: 'http://www.example.com/pic.png'
      });
      board.set('model.sound_urls', {
        123: 'http://www.example.com/sound.mp3'
      });
      board.set('model.grid', {
        rows: 1,
        columns: 1,
        order: [[1]]
      });
      editManager.setup(board);
      editManager.process_for_displaying();
      var button = null;
      waitsFor(function() { return board.get('ordered_buttons'); });
      runs(function() {
        expect(board.get('ordered_buttons')).not.toEqual(null);
        button = board.get('ordered_buttons')[0][0];
        expect(button.get('local_image_url')).toEqual('file://pic.png');
        expect(button.get('local_sound_url')).toEqual('file://sound.mp3');
      });
      waitsFor(function() { return button && button.get('content_status') == 'ready'; });
      runs();
    });

    it('should pull the correct translations', function() {
      app_state.set('label_locale', 'es');
      app_state.set('vocalization_locale', 'fr');
      var model = LingoLinq.store.createRecord('board');
      model.set('buttons', [
        {id: 1, label: 'fast'},
        {id: 2, label: 'jump', vocalization: 'jumping'}
      ]);
      model.set('translations', {
        1: {
          en: {
            label: 'fast'
          },
          es: {
            label: 'zoom',
            vocalization: 'zoom-zoom'
          },
          fr: {
            label: 'wee',
            vocalization: 'wee-wee'
          }
        },
        2: {
          en: {
            label: 'jump',
            vocalization: 'jumping'
          },
          es: {
            label: 'leap'
          },
          fr: {
            label: 'above'
          }
        }
      });
      board.set('model', model);
      board.set('model.grid', {
        rows: 1,
        columns: 2,
        order: [[1, 2]]
      });
      editManager.setup(board);
      editManager.process_for_displaying();
      waitsFor(function() { return board.get('ordered_buttons'); });
      runs(function() {
        expect(board.get('ordered_buttons')).not.toEqual(null);
        expect(board.get('ordered_buttons')[0][0].get('label')).toEqual('zoom');
        expect(board.get('ordered_buttons')[0][0].get('vocalization')).toEqual('wee-wee');
        expect(board.get('ordered_buttons')[0][1].get('label')).toEqual('leap');
        expect(board.get('ordered_buttons')[0][1].get('vocalization')).toEqual('above');
      });
    });
  });

  describe("image editing in iframe", function() {
    it("should allow setting a stashed image", function() {
      editManager.stash_image({url: 'abc'});
      expect(editManager.stashedImage).toEqual({url: "abc"});
    });

    it("should post a request for image data properly", function() {
      editManager.stash_image({url: "http://www.example.com/pic.png"});
      window.postMessage('imageDataRequest', '*');
      waitsFor(function() { return editManager.imageEditorSource; });
      runs(function() {
        expect(editManager.imageEditorSource).toEqual(window);

        var called = false;
        $(window).bind('message', function(event) {
          event = event.originalEvent || event;
          if(event && event.data == 'imageDataRequest') {
            called = true;
          }
        });
        var called_again = false;
        editManager.get_edited_image().then(function() {
          called_again = true;
        }, function() {
          called_again = true;
        });
        waitsFor(function() { return called; });
        runs(function() {
          expect(!!editManager.imageEditingCallback).toEqual(true);
        });
        waitsFor(function() { return called_again; });
        runs();
      });
    });
    it("should trigger the editor callback if set", function() {
      var called = false;
      editManager.imageEditingCallback = function() {
        called = true;
      };
      window.postMessage('data:image/png;base64,0000', '*');
      waitsFor(function() { return called; });
      runs();
    });
  });

  describe("copy_board", function() {
    it("should create a new board using the old board's settings", function() {
      stub(modal, 'flash', function() { });
      var b = LingoLinq.store.createRecord('board', {
        key: 'example/fred',
        buttons: [],
        grid: {}
      });
      var found = false;
      var promise = RSVP.reject({stub: true});
      promise.then(null, function() { });
      queryLog.defineFixture({
        method: 'POST',
        type: 'board',
        response: promise,
        compare: function(object) {
          found = true;
          return true;
        }
      });
      var rejected = false;
      editManager.copy_board(b).then(null, function() { rejected = true; });
      waitsFor(function() { return found && rejected; });
      runs();
    });

    it("should preserve existing links if specified", function() {
      stub(modal, 'flash', function() { });
      var model = {
        id: '1_1',
        key: 'example/fred',
        buttons: [{id: 1, load_board: {key: 'asdf', id: '1_2'}}],
        grid: {}
      };
      var model2 = {
        id: '1_2',
        key: 'example/fred2',
        buttons: [{id: 1, load_board: {key: 'asdf', id: '1_2'}}],
        grid: {}
      };
      var b = LingoLinq.store.createRecord('board', model);
      var found = false;
      var promise = RSVP.resolve({board: model2});
      queryLog.defineFixture({
        method: 'POST',
        type: 'board',
        response: promise,
        compare: function(object) {
          found = true;
          return true;
        }
      });
      var copy = null;
      editManager.copy_board(b, 'keep_links').then(function(res) { copy = res; });
      waitsFor(function() { return found && copy; });
      runs(function() {
        expect(copy.get('linked_boards').length).toEqual(1);
        expect(copy.get('buttons')[0].id).toEqual(1);
      });
    });

    it("should remove board links if specified", function() {
      stub(modal, 'flash', function() { });
      var model = {
        id: '1_1',
        key: 'example/fred',
        buttons: [{id: 1, load_board: {key: 'asdf', id: '1_2'}}],
        grid: {}
      };
      var model2 = {
        id: '1_2',
        key: 'example/fred',
        buttons: [{id: 1, load_board: {key: 'asdf', id: '1_2'}}],
        grid: {}
      };
      var b = LingoLinq.store.createRecord('board', model2);
      var found = false;
      var promise = RSVP.resolve({board: model});
      queryLog.defineFixture({
        method: 'POST',
        type: 'board',
        response: promise,
        compare: function(object) {
          found = true;
          return true;
        }
      });
      queryLog.defineFixture({
        method: 'PUT',
        type: 'board',
        response: promise,
        compare: function(object) {
          found = true;
          return true;
        }
      });
      var copy = null;
      editManager.copy_board(b, 'remove_links').then(function(res) { copy = res; });
      waitsFor(function() { return found && copy; });
      runs(function() {
        expect(copy.get('linked_boards').length).toEqual(0);
        expect(copy.get('buttons')[0].id).toEqual(1);
      });
    });

    it("should trigger a call to reload_including_all_downstream", function() {
      app_state.set('currentBoardState', {id: '1_1'});
      stub(modal, 'flash', function() { });
      var user = EmberObject.create({
        stats: {
          board_set_ids: ['1_2', '1_3', '1_1']
        }
      });
      app_state.set('sessionUser', user);
      expect(app_state.get('board_in_current_user_set')).toEqual(true);
      var b = LingoLinq.store.createRecord('board', {
        key: 'example/fred',
        buttons: [],
        grid: {}
      });
      b.set('id', '1_1');
      var reload_called = false;
      stub(b, 'reload_including_all_downstream', function() {
        reload_called = true;
      });
      var found = false;
      queryLog.defineFixture({
        method: 'POST',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '1_2'
        }}),
        compare: function(object) {
          found = true;
          return true;
        }
      });
      var new_board = null;
      editManager.copy_board(b).then(function(res) { new_board = res; });
      waitsFor(function() { return new_board; });
      runs(function() {
        expect(new_board.get('id')).toEqual('1_2');
        expect(reload_called).toEqual(true);
      });
    });

    it("should update the user if decision included as_home options", function() {
      app_state.set('currentBoardState', {id: '1_1'});
      stub(modal, 'flash', function() { });
      var user = EmberObject.create({
        stats: {
          board_set_ids: ['1_2', '1_3', '1_1']
        },
        preferences: {
        }
      });
      var saved = false;
      stub(user, 'save', function() {
        saved = true;
        return RSVP.resolve();
      });
      app_state.set('sessionUser', user);
      expect(app_state.get('board_in_current_user_set')).toEqual(true);
      var b = LingoLinq.store.createRecord('board', {
        key: 'example/fred',
        buttons: [],
        grid: {}
      });
      b.set('id', '1_1');
      var reload_called = false;
      stub(b, 'reload_including_all_downstream', function() {
        reload_called = true;
      });
      var found = false;
      queryLog.defineFixture({
        method: 'POST',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '1_2'
        }}),
        compare: function(object) {
          found = true;
          return true;
        }
      });
      var new_board = null;
      editManager.copy_board(b, 'keep_links_as_home', user).then(function(res) { new_board = res; });
      waitsFor(function() { return new_board; });
      runs(function() {
        expect(new_board.get('id')).toEqual('1_2');
        expect(reload_called).toEqual(true);
      });
      waitsFor(function() { return saved; });
      runs(function() {
        expect(user.get('preferences.home_board.id')).toEqual('1_2');
      });
    });

    it("should error if updating the user's home board failed", function() {
      app_state.set('currentBoardState', {id: '1_1'});
      stub(modal, 'flash', function() { });
      var user = EmberObject.create({
        stats: {
          board_set_ids: ['1_2', '1_3', '1_1']
        },
        preferences: {
        }
      });
      var saved = false;
      stub(user, 'save', function() {
        saved = true;
        return RSVP.reject();
      });
      app_state.set('sessionUser', user);
      expect(app_state.get('board_in_current_user_set')).toEqual(true);
      var b = LingoLinq.store.createRecord('board', {
        key: 'example/fred',
        buttons: [],
        grid: {}
      });
      b.set('id', '1_1');
      var reload_called = false;
      stub(b, 'reload_including_all_downstream', function() {
        reload_called = true;
      });
      var found = false;
      queryLog.defineFixture({
        method: 'POST',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '1_2'
        }}),
        compare: function(object) {
          found = true;
          return true;
        }
      });
      var error = null;
      editManager.copy_board(b, 'keep_links_as_home', user).then(null, function(err) { error = err; });
      waitsFor(function() { return error; });
      runs(function() {
        expect(error).toEqual("Failed to update user's home board");
        expect(reload_called).toEqual(true);
      });
    });
    it("should replace in the user's communication set if specified as the decision and in the user's set", function() {
      app_state.set('currentBoardState', {id: '1_1'});
      stub(modal, 'flash', function() { });
      var user = EmberObject.create({
        id: 'self',
        stats: {
          board_set_ids: ['1_2', '1_3', '1_1']
        }
      });
      app_state.set('sessionUser', user);
      expect(app_state.get('board_in_current_user_set')).toEqual(true);
      var b = LingoLinq.store.createRecord('board', {
        key: 'example/fred',
        buttons: [],
        grid: {}
      });
      b.set('id', '1_1');
      var found = false;
      queryLog.defineFixture({
        method: 'POST',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '1_2'
        }}),
        compare: function(object) {
          found = true;
          return true;
        }
      });
      var url = null;
      var options = options;
      stub(persistence, 'ajax', function(u, o) {
        url = u;
        options = o;
        return RSVP.reject({});
      });
      var rejected = false;
      editManager.copy_board(b, 'modify_links_copy', user).then(null, function() { rejected = true; });
      waitsFor(function() { return url && rejected; });
      runs(function() {
        expect(url).toEqual("/api/v1/users/self/replace_board");
        expect(options).toEqual({
          type: 'POST',
          data: {
            new_board_id: '1_2',
            old_board_id: '1_1',
            update_inline: false,
            make_public: undefined,
            ids_to_copy: ""
          }
        });
      });
    });

    it('should include the swap_library if specified', function() {
      expect('test').toEqual('todo');
    });

    it("should return the newly-created board in the copy_board promise resolution", function() {
      app_state.set('currentBoardState', {id: '1_1'});
      stub(modal, 'flash', function() { });
      var user = EmberObject.create({
        stats: {
          board_set_ids: ['1_2', '1_3', '1_1']
        }
      });
      app_state.set('sessionUser', user);
      expect(app_state.get('board_in_current_user_set')).toEqual(true);
      var b = LingoLinq.store.createRecord('board', {
        key: 'example/fred',
        buttons: [],
        grid: {}
      });
      b.set('id', '1_1');
      var found = false;
      queryLog.defineFixture({
        method: 'POST',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '1_2'
        }}),
        compare: function(object) {
          found = true;
          return true;
        }
      });
      var new_board = null;
      editManager.copy_board(b).then(function(res) { new_board = res; });
      waitsFor(function() { return new_board; });
      runs(function() {
        expect(new_board.get('id')).toEqual('1_2');
      });
    });

    it("should not replace in the user's communication set even if specified unless in the user's set", function() {
      expect(app_state.get('board_in_current_user_set')).toEqual(false);

      var b = LingoLinq.store.createRecord('board', {
        key: 'example/fred',
        buttons: [],
        grid: {}
      });
      b.set('id', '1_1');
      var user = EmberObject.create({id: 'self'});
      var found = false;
      queryLog.defineFixture({
        method: 'POST',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '1_2'
        }}),
        compare: function(object) {
          found = true;
          return true;
        }
      });
      var ajaxed = false;
      stub(persistence, 'ajax', function(u, o) {
        ajaxed = true;
        return RSVP.reject({});
      });
      var new_board = null;
      editManager.copy_board(b, 'modify_links_copy', user).then(function(b) { new_board = b; });

      waitsFor(function() { return new_board; });
      runs(function() {
        expect(ajaxed).toEqual(false);
        expect(new_board.get('id')).toEqual('1_2');
      });
    });

    it("should not replace in the user's communication set if not specified but in the user's set", function() {
      app_state.set('currentBoardState', {id: '1_1'});
      var user = EmberObject.create({
        stats: {
          board_set_ids: ['1_2', '1_3', '1_1']
        }
      });
      app_state.set('sessionUser', user);
      expect(app_state.get('board_in_current_user_set')).toEqual(true);

      var b = LingoLinq.store.createRecord('board', {
        key: 'example/fred',
        buttons: [],
        grid: {}
      });
      b.set('id', '1_1');
      var found = false;
      queryLog.defineFixture({
        method: 'POST',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '1_2'
        }}),
        compare: function(object) {
          found = true;
          return true;
        }
      });
      var ajaxed = false;
      stub(persistence, 'ajax', function(u, o) {
        ajaxed = true;
        return RSVP.reject({});
      });
      var new_board = null;
      editManager.copy_board(b).then(function(b) { new_board = b; });

      waitsFor(function() { return new_board; });
      runs(function() {
        expect(new_board.get('id')).toEqual('1_2');
      });
    });

    it("should error if the board replacement initial call fails", function() {
      app_state.set('currentBoardState', {id: '1_1'});
      stub(modal, 'flash', function() { });
      var user = EmberObject.create({
        stats: {
          board_set_ids: ['1_2', '1_3', '1_1']
        },
        id: 'self'
      });
      app_state.set('sessionUser', user);
      expect(app_state.get('board_in_current_user_set')).toEqual(true);

      var b = LingoLinq.store.createRecord('board', {
        key: 'example/fred',
        buttons: [],
        grid: {}
      });
      b.set('id', '1_1');
      var found = false;
      queryLog.defineFixture({
        method: 'POST',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '1_2'
        }}),
        compare: function(object) {
          found = true;
          return true;
        }
      });
      stub(persistence, 'ajax', function(u, o) {
        return RSVP.reject({});
      });
      var error = null;
      editManager.copy_board(b, 'modify_links_copy', user).then(null, function(err) { error = err; });
      waitsFor(function() { return error; });
      runs(function() {
        expect(error).toEqual("Board re-linking failed unexpectedly");
      });
    });

    it("should error if the board replacement progress check fails", function() {
      app_state.set('currentBoardState', {id: '1_1'});
      stub(modal, 'flash', function() { });
      var user = EmberObject.create({
        stats: {
          board_set_ids: ['1_2', '1_3', '1_1']
        },
        id: 'self',
      });
      app_state.set('sessionUser', user);
      expect(app_state.get('board_in_current_user_set')).toEqual(true);

      var b = LingoLinq.store.createRecord('board', {
        key: 'example/fred',
        buttons: [],
        grid: {}
      });
      b.set('id', '1_1');
      var found = false;
      queryLog.defineFixture({
        method: 'POST',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '1_2'
        }}),
        compare: function(object) {
          found = true;
          return true;
        }
      });
      stub(persistence, 'ajax', function(u, o) {
        return RSVP.reject({});
      });
      var error = null;
      editManager.copy_board(b, 'modify_links_copy', user).then(null, function(err) { error = err; });
      waitsFor(function() { return error; });
      runs(function() {
        expect(error).toEqual("Board re-linking failed unexpectedly");
      });
    });

    it("should alert when the copy process is completed", function() {
      app_state.set('currentBoardState', {id: '1_1'});
      stub(modal, 'flash', function() { });
      var user = EmberObject.create({
        stats: {
          board_set_ids: ['1_2', '1_3', '1_1']
        },
        id: 'self',
      });
      app_state.set('sessionUser', user);
      expect(app_state.get('board_in_current_user_set')).toEqual(true);

      var b = LingoLinq.store.createRecord('board', {
        key: 'example/fred',
        buttons: [],
        grid: {}
      });
      b.set('id', '1_1');
      var found = false;
      queryLog.defineFixture({
        method: 'POST',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '1_2'
        }}),
        compare: function(object) {
          found = true;
          return true;
        }
      });
      stub(persistence, 'ajax', function(u, o) {
        return RSVP.resolve({});
      });
      stub(progress_tracker, 'track', function(p, callback) {
        callback({status: 'errored'});
      });
      var error = null;
      editManager.copy_board(b, 'modify_links_copy', user).then(null, function(err) { error = err; });
      waitsFor(function() { return error; });
      runs(function() {
        expect(error).toEqual("Board re-linking failed while processing");
      });
    });

    it("should make boards public if specified", function() {
      app_state.set('currentBoardState', {id: '1_1'});
      stub(modal, 'flash', function() { });
      var user = EmberObject.create({
        stats: {
          board_set_ids: ['1_2', '1_3', '1_1']
        },
        id: 'self',
      });
      app_state.set('sessionUser', user);
      expect(app_state.get('board_in_current_user_set')).toEqual(true);

      var b = LingoLinq.store.createRecord('board', {
        key: 'example/fred',
        buttons: [],
        grid: {}
      });
      b.set('id', '1_1');
      var found = false;
      queryLog.defineFixture({
        method: 'POST',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '1_2'
        }}),
        compare: function(object) {
          expect(object.get('public')).toEqual(true);
          found = true;
          return true;
        }
      });
      stub(persistence, 'ajax', function(u, o) {
        expect(o.data.make_public).toEqual(true);
        return RSVP.resolve({});
      });
      stub(progress_tracker, 'track', function(p, callback) {
        callback({status: 'errored'});
      });
      var error = null;
      editManager.copy_board(b, 'modify_links_copy', user, true).then(null, function(err) { error = err; });
      waitsFor(function() { return error; });
      runs(function() {
        expect(error).toEqual("Board re-linking failed while processing");
      });
    });

    it("should allow trying to copy for someone else", function() {
      app_state.set('currentBoardState', {id: '1_1'});
      stub(modal, 'flash', function() { });
      var user = EmberObject.create({
        id: '1234',
        stats: {
          board_set_ids: ['1_2', '1_3', '1_1']
        }
      });
      app_state.set('sessionUser', user);
      expect(app_state.get('board_in_current_user_set')).toEqual(true);
      var b = LingoLinq.store.createRecord('board', {
        key: 'example/fred',
        buttons: [],
        grid: {}
      });
      b.set('id', '1_1');
      var found = false;
      queryLog.defineFixture({
        method: 'POST',
        type: 'board',
        response: RSVP.resolve({board: {
          id: '1_2'
        }}),
        compare: function(object) {
          found = true;
          return true;
        }
      });
      var url = null;
      var options = options;
      stub(persistence, 'ajax', function(u, o) {
        url = u;
        options = o;
        return RSVP.reject({});
      });
      var rejected = false;
      editManager.copy_board(b, 'links_copy', user).then(null, function() { rejected = true; });
      waitsFor(function() { return url && rejected; });
      runs(function() {
        expect(url).toEqual("/api/v1/users/1234/copy_board_links");
        expect(options).toEqual({
          type: 'POST',
          data: {
            new_board_id: '1_2',
            old_board_id: '1_1',
            update_inline: false,
            make_public: undefined,
            ids_to_copy: ""
          }
        });
      });
    });
  });

  describe('retrieve_badge', function() {
    afterEach(function() {
      editManager.badgeEditorSource = null;
    });

    it('should error on timeout', function() {
      var errored = false;
      editManager.retrieve_badge().then(function(res) {
      }, function(err) {
        errored = true;
      });
      waitsFor(function() { return errored; });
      runs();
    });
    it('should return the data uri for the currently-edited badge', function() {
      var badge = null;
      editManager.badgeEditorSource = {
        postMessage: function(message, recipient) {
          if(recipient == '*' && message == 'imageDataRequest') {
            editManager.badgeEditingCallback('data:asdf');
          }
        }
      };
      editManager.retrieve_badge().then(function(res) {
        badge = res;
      });
      waitsFor(function() { return badge; });
      runs(function() {
        expect(badge).toEqual("data:asdf");
      });
    });

    it('should return settings data as well to be persisted on the badge record', function() {
      var badge = null;
      editManager.badgeEditorSource = {
        postMessage: function(message, recipient) {
          if(recipient == '*' && message == 'imageDataRequest') {
            editManager.badgeEditingCallback('data:asdf');
          } else if(recipient == '*' && message == 'imageStateRequest') {
            editManager.badgeEditingCallback({zoom: 1});
          }
        }
      };
      editManager.retrieve_badge().then(function(res) {
        badge = res;
      });
      waitsFor(function() { return badge; });
      runs(function() {
        expect(badge).toEqual("data:asdf");
        expect(editManager.badgeEditingCallback.state).toEqual({zoom: 1});
      });
    });
  });
  describe('inflection_for_types', function() {
    var lookups = {
      she: {label: 'she', part_of_speech: 'pronoun'},
      he: {label: 'he', part_of_speech: 'pronoun'},
      you: {label: 'you', part_of_speech: 'pronoun'},
      sometimes: {label: 'sometimes', part_of_speech: 'adverb'},
      did: {label: 'did', part_of_speech: 'verb'},
      they: {label: 'they', part_of_speech: 'pronoun'}, 
      might: {label: 'might', part_of_speech: 'verb'},
      would: {label: 'would', part_of_speech: 'verb'},
      could: {label: 'could', part_of_speech: 'verb'},
      can: {label: 'can', part_of_speech: 'verb'},
      will: {label: 'will', part_of_speech: 'verb'},
      usually: {label: 'usually', part_of_speech: 'adverb'},
      is: {label: 'is', part_of_speech: 'verb'}, 
      be: {label: 'be', part_of_speech: 'verb'}, 
      been: {label: 'been', part_of_speech: 'verb'}, 
      was: {label: 'was', part_of_speech: 'verb'}, 
      like: {label: 'like', part_of_speech: 'verb'},
      likes: {label: 'likes', part_of_speech: 'verb'},
      liked: {label: 'liked', part_of_speech: 'verb'},
      see: {label: 'see', part_of_speech: 'verb'}, 
      ask: {label: 'ask', part_of_speech: 'verb'}, 
      hate: {label: 'hate', part_of_speech: 'verb'},
      hates: {label: 'hates', part_of_speech: 'verb'},
      thinks: {label: 'thinks', part_of_speech: 'verb'},
      want: {label: 'want', part_of_speech: 'verb'},
      wants: {label: 'wants', part_of_speech: 'verb'},
      wanted: {label: 'wanted', part_of_speech: 'verb'},
      wanting: {label: 'wanting', part_of_speech: 'verb'},
      feel: {label: 'want', part_of_speech: 'verb'},
      feels: {label: 'want', part_of_speech: 'verb'},
      looking: {label: 'looking', part_of_speech: 'verb'},
      helped: {label: 'helped', part_of_speech: 'verb'},
      are: {label: 'are', part_of_speech: 'verb'},
      were: {label: 'were', part_of_speech: 'verb'},
      not: {label: 'not', part_of_speech: 'negation'},
      tell: {label: 'tell', part_of_speech: 'verb'},
      me: {label: 'me', part_of_speech: 'pronoun'},
      why: {label: 'why', part_of_speech: 'question'},
      dog: {label: 'dog', part_of_speech: 'noun'},
      cat: {label: 'cat', part_of_speech: 'noun'},
      frog: {label: 'frog', part_of_speech: 'noun'},
      to: {label: 'to', part_of_speech: 'preposition'},
      have: {label: 'have', part_of_speech: 'verb'},
      has: {label: 'has', part_of_speech: 'verb'},
      the: {label: 'the', part_of_speech: 'determiner'},
      that: {label: 'that', part_of_speech: 'determiner'},
      these: {label: 'these', part_of_speech: 'determiner'},
      about: {label: 'about', part_of_speech: 'preposition'},
      with: {label: 'with', part_of_speech: 'conunction'},
      get: {label: 'get', part_of_speech: 'verb'},
      for: {label: 'for', part_of_speech: 'preposition'},
      had: {label: 'had', part_of_speech: 'verb'},
      always: {label: 'always', part_of_speech: 'adverb'},
      I: {label: 'I', part_of_speech: 'pronoun'},
      do: {label: 'do', part_of_speech: 'verb'},
      love: {label: 'love', part_of_speech: 'verb'},
      think: {label: 'think', part_of_speech: 'verb'},
      wish: {label: 'wish', part_of_speech: 'verb'},
      give: {label: 'give', part_of_speech: 'verb'},
      it: {label: 'it', part_of_speech: 'pronoun'},
      put: {label: 'put', part_of_speech: 'verb'},
      over: {label: 'over', part_of_speech: 'preposition'},
      jump: {label: 'jump', part_of_speech: 'verb'},
      eat: {label: 'eat', part_of_speech: 'verb'},
      down: {label: 'down', part_of_speech: 'adverb'},
      those: {label: 'those', part_of_speech: 'determiner'},
      on: {label: 'on', part_of_speech: 'preposition'},
      all: {label: 'all', part_of_speech: 'determiner'},
      by: {label: 'by', part_of_speech: 'preposition'},
      somebody: {label: 'somebody', part_of_speech: 'pronoun'},
      what: {label: 'what', part_of_speech: 'question'},
      when: {label: 'when', part_of_speech: 'question'},
      going: {label: 'going', part_of_speech: 'verb'},
      before: {label: 'before', part_of_speech: 'preposition'},
      mine: {label: 'mine', part_of_speech: 'pronoun'},
      am: {label: 'am', part_of_speech: 'verb'},
      my: {label: 'my', part_of_speech: 'pronoun'},
      we: {label: 'we', part_of_speech: 'pronoun'},
      who: {label: 'who', part_of_speech: 'question'},
      of: {label: 'of', part_of_speech: 'preposition'},
      view: {label: 'view', part_of_speech: 'verb'},
      still: {label: 'still', part_of_speech: 'adjective'},
    };

    var sentence = function(list) {
      var res = [];
      if(list.split) {
        list = list.split(/\s+/);
      }
      list.forEach(function(word) {
        if(word.label) {
          res.push(word);
        } else if(lookups[word]) {
          res.push(lookups[word]);
        } else {
          console.error("unrecognized word", word);
          res.push({label: word});
        }
      });
      return res;
    };
    var check = function(res, type, val, id) {
      var str = res;
      if(typeof(res) == 'string') {
        res = editManager.inflection_for_types(sentence(str), 'en');
      }
      if((res[type] || {}).id != id || (res[type] || {}).inflection != val) {
        expect(str).toEqual("err");
        expect((res[type] || {}).id).toEqual(id);
        expect((res[type] || {}).inflection).toEqual(val);
      } else {
        expect((res[type] || {}).inflection).toEqual(val);
      }
    };
  
    it('should handle defaults', function() {
      var res = editManager.inflection_for_types([], 'en');
      expect(res).toEqual({});
      var res = editManager.inflection_for_types(sentence('you'), 'es');
      expect(res).toEqual({});

      var res = editManager.inflection_for_types(sentence('you'), 'en');
      expect(res.am.label).toEqual('are');
      expect(res.does.label).toEqual('do');
      expect(res.has.label).toEqual('have');
      expect(res.is.label).toEqual('are');
      expect(res.was.label).toEqual('were');
      check(res, 'verb', 'present', 'you_look');

      var res = editManager.inflection_for_types(sentence('you sometimes'), 'en');
      expect(res.am.label).toEqual('are');
      expect(res.does.label).toEqual('do');
      expect(res.has.label).toEqual('have');
      expect(res.is.label).toEqual('are');
      expect(res.was.label).toEqual('were');
      check(res, 'verb', 'present', 'you_look');
    });

    it("should handle tenses", function() {
      // 
      //   {id: 'does_she_look', type: 'verb', lookback: [{words: ['do', 'does', 'did', 'can', 'could', 'will', 'would', 'may', 'might', 'must', 'shall', 'should']}, {words: ["he", "she", "it", "that", "this", "they"]}, {optional: true, type: 'adverb'}], inflection: 'present', location: 'c'},
      check('did she', 'verb', 'present', 'does_she_look');

      //   {id: 'they_can_look', type: 'verb', lookback: [{words: ["he", "she", "it", "that", "this", "they"]}, {words: ['do', 'does', 'did', 'can', 'could', 'will', 'would', 'may', 'might', 'must', 'shall', 'should']}, {optional: true, type: 'adverb'}], inflection: 'present', location: 'c'},
      check('they might', 'verb', 'present', 'they_can_look');

      //   {id: 'she_looks', type: 'verb', lookback: [{words: ["he", "she", "it", "that", "this"]}, {optional: true, type: 'adverb'}], inflection: 'simple_present', location: 'n'},
      check('she', 'verb', 'simple_present', 'she_looks');
      check('she usually', 'verb', 'simple_present', 'she_looks');

      //   {id: 'he_is_looking_to_go', type: 'verb', lookback: [{type: 'pronoun'}, {words: ["be", "is", "am", "are", "was", "were"], optional: true}, {type: 'adverb', optional: true}, {words: ["not"], optional: true}, {type: 'verb', match: /ing$/}], inflection: 'infinitive', location: 'e'},
      check('she was wanting', 'verb', 'infinitive', 'he_is_looking_to_go');
      var res = editManager.inflection_for_types(sentence('she is want'), 'en');
      expect(res.verb).toEqual(null);
      //     Y: they are not wanting [to look]
      check('they are not wanting', 'verb', 'infinitive', 'he_is_looking_to_go');
      //     Y: tell me why she is wanting [to look]
      check('tell me why she is wanting', 'verb', 'infinitive', 'he_is_looking_to_go');

      //   //   pronoun [verb (will, would, could, etc.)] verb (is, am, was) [not|adverb (never, already, etc.)]: present_participle (s)
      //   //     Y: he would be always [looking]
      //   //     Y: they can like [eating]
      //   //     Y: she hates [jumping]
      //   //     N: she hates [to jump]
      //   //     N: is there a reason she would want [to jump]
      //   {id: 'she_is_looking', type: 'verb', lookback: [{type: 'pronoun'}, {words: ["can", "could", "will", "would", "may", "might", "must", "shall", "should"], optional: true}, {type: 'verb'}, {optional: true, type: 'adverb'}], inflection: 'present_participle', location: 's'},
      check('she is', 'verb', 'present_participle', 'is_she_looking');
      check('he will always be', 'verb', 'present_participle', 'is_she_looking');
      check('he likes usually', 'verb', 'present_participle', 'she_is_looking');
      check('he usually wants', 'verb', 'infinitive', 'she_wants_to_look');
      check('they can like', 'verb', 'infinitive', 'they_can_like_to_look');
      check('she hates', 'verb', 'present_participle', 'she_is_looking');
      check('why would she want', 'verb', 'infinitive', 'would_she_want_to_look');
      check('why would she hate', 'verb', 'present_participle', 'she_is_looking');
      check('what do you want for', 'verb', 'present_participle', 'hope_for_eating');

      //   {id: 'she_likes_not_looking', type: 'verb', lookback: [{type: 'pronoun'}, {words: ["can", "could", "will", "would", "may", "might", "must", "shall", "should"], optional: true}, {type: 'verb'}, {optional: true, words: ["not"]}], inflection: 'present_participle', location: 's'},

      //   //   verb (being, have, has, had) [adverb] [not]: past (w)
      //   //     Y: I have always looked
      //   //     Y: have looked
      //   //     Y: he had eaten
      //   //     Y: she has taken some more
      //   //     N: I have to look at this
      //   //     N: she had looked happier before
      //   {id: 'have_looked', type: 'verb', lookback: [{optional: true, type: 'pronoun'}, {words: ["being", "doing", "has", "have", "had"]}, {type: 'adverb', optional: true}, {words: ["not"], optional: true}], inflection: 'past', location: 'w'},
      check('have', 'verb', 'past_participle', 'have_looked');
      check('I have always not', 'verb', 'past_participle', 'have_looked');
      check('have you', 'verb', 'past_participle', 'has_she_looked');
      check('tell me why has she', 'verb', 'past_participle', 'has_she_looked');
      check('I have always not', 'verb', 'past_participle', 'have_looked');
      check('I have to', 'verb', null);
      check('she had', 'verb', 'past_participle', 'have_looked');

      //   //   verb (have, has, had) pronoun (I, you, she) [adverb] [not]: past (w)
      //   //     Y: have you looked at this
      //   //     Y: tell me why has she 
      //   //     N: have you taken your medicine (past participle)
      //   {id: 'have_you_looked', type: 'verb', lookback: [{words: ["have", "has", "had"]}, {type: 'pronoun'}, {type: 'adverb', optional: true}, {words: ["not"], optional: true}], inflection: 'past', location: 'w'},
      check('have you', 'verb', 'past_participle', 'has_she_looked');
      check('tell me why has she', 'verb', 'past_participle', 'has_she_looked');
      //   //   verb (have, has, had) [not] been: present_participle (s)
      //   //     Y: I have not been looking
      //   //     N: She has been taken
      //   {id: 'have_been_looking', type: 'verb', lookback: [{words: ["have", "has", "had"]}, {words: ["not"], optional: true}, {words: ["been"]}], inflection: 'present_participle', location: 's'},
      check('I have been', 'verb', 'present_participle', 'have_been_looking');
      check('I have not been', 'verb', 'present_participle', 'have_been_looking');
      check('she has been', 'verb', 'present_participle', 'have_been_looking');
      //   //   verb (can, could, will, etc.) [not] be: present participle
      //   //     Y: he could be thinking about tomorrow
      //   //     N: it should be finished by now (past participle)
      //   {id: 'can_be_looking', type: 'verb', lookback: [{words: ["can", "could", "will", "would", "may", "might", "must", "shall", "should"]}, {words: ["not"], optional: true}, {words: ["be"]}], inflection: 'present_participle', location: 's'},
      check('can be', 'verb', 'present_participle', 'is_she_looking');
      check('he could be', 'verb', 'present_participle', 'is_she_looking');
      //   //   verb (is, am, was, be, are, were, etc.) [pronoun (he, she, it, etc.)] [not]: present_participle (s)
      //   //     Y: the cat is licking her paws
      //   //     N: the frog was forgotten
      //   {id: 'is_she_looking', type: 'verb', lookback: [{words: ["is", "am", "was", "were", "be", "are"]}, {type: 'pronoun', optional: true}, {type: 'adverb', optional: true}, {words: ["not"], optional: true}], inflection: 'present_participle', location: 's'},
      check('is she', 'verb', 'present_participle', 'is_she_looking');
      check('were they', 'verb', 'present_participle', 'is_she_looking');
      check('the cat is not', 'verb', 'present_participle', 'is_she_looking');
      check('the frog was usually', 'verb', 'present_participle', 'is_she_looking');
      //   //   verb (do, does, did, etc.) pronoun (he, she, it, etc.) [not]: present (c)
      //   //   verb (do, does, did, etc.) [determiner] noun: present (c)
      //   //   noun (singular): simple_present (n)
      //   {id: 'dog_looks', type: 'verb', lookback: [{type: "noun", non_match: /[^s]s$/}], inflection: 'simple_present', location: 'n'},
      check('the dog', 'verb', 'simple_present', 'dog_looks');
      check('the dog will', 'verb', 'default', 'should_not_look');
      //   //   will: present (c)
      //   // Nouns: 
      //   //   plural determiners (those, these, some, many): plural (n)
      //   {id: 'these_dogs', type: 'noun', lookback: [{words: ["those", "these", "some", "many"]}], inflection: 'plural', location: 'n'},
      var res = editManager.inflection_for_types(sentence('these'), 'en');
      expect((res.noun || {}).inflection).toEqual('plural', 'with_her');
      //   //   else: base (c)
      //   // Pronouns:
      //   //   (at, for, with): objective (n)
      //   {id: 'with_her', type: 'pronoun', lookback: [{words: ["at", "for", "with"]}], inflection: 'objective', location: 'n'},
      check('with', 'pronoun', 'objective', 'with_her');
      check('with with', 'pronoun', 'objective', 'with_her');
      check('did you get that for', 'pronoun', 'objective', 'with_her');
      check('tell me about', 'pronoun', 'objective', 'about_him');
      check('I like', 'pronoun', 'objective', 'i_like_him');
      check('do you love', 'pronoun', 'objective', 'i_like_him');
      check('I think', 'pronoun', 'default', 'i_think_he');
      //   //   pronoun (that, it, this) verb (is, was): objective (n)
      //   {id: 'it_is_his', type: 'pronoun', lookback: [{words: ["this", "that", "it"]}, {words: ["is", "was"]}], inflection: 'objective', location: 'n'},
      check('that is', 'pronoun', 'possessive_adjective', 'it_is_his');
      //   {id: 'these_are_his', type: 'pronoun', lookback: [{words: ["these", "those"]}, {words: ["are", "were"]}], inflection: 'possessive_adjective', location: 'w'},
      //   //   (is, was): objective(n) or possessive_adjective (w)
      check('these are', 'pronoun', 'possessive_adjective', 'these_are_his');
      //   // TODO: hope that [he] *looks*
      //   //       wish for *eating*
      // ];

      /* 
        he likes [eating] vs. he wants [to tell] vs. she likes not [looking]
        I want to be [asking] vs. did you like to be [asked]
        he is [looking]
        is she [looking]
        I have [looked]
        have you [looked]
      */
      check('I am', 'verb', 'present_participle', 'is_she_looking');
      check('he is', 'verb', 'present_participle', 'is_she_looking');
      check('he is not', 'verb', 'present_participle', 'is_she_looking');
      check('is she', 'verb', 'present_participle', 'is_she_looking');
      check('I have', 'verb', 'past_participle', 'have_looked');
      check('have you', 'verb', 'past_participle', 'has_she_looked');  

      check('I want', 'verb', 'infinitive', 'she_wants_to_look');  
      check('I wanted', 'verb', 'infinitive', 'she_wants_to_look');  
      check('he wants', 'verb', 'infinitive', 'she_wants_to_look');  
      check('he doesn\'t want', 'verb', 'infinitive', 'she_can_want_to_look');  
      check('I want to', 'verb', null);  
      check('I want want', 'verb', null);  

      check('I like', 'verb', 'present_participle', 'she_likes_looking');
      check('he likes', 'verb', 'present_participle', 'she_likes_looking');
      check('we liked', 'verb', 'present_participle', 'she_likes_looking');
      check('I don\'t like', 'verb', 'infinitive', 'they_can_like_to_look');
      check('we didn\'t like', 'verb', 'infinitive', 'they_can_like_to_look');
      check('he doesn\'t like', 'verb', 'infinitive', 'they_can_like_to_look');
      // TODO: WordPower does "I like -ing instead of to-"
      // I have -en/ed
      // plural noun => is to are
      // Emojis on repeat buttons (discourage stimming)
      // TODO: can not => can't https://en.wikipedia.org/wiki/Wikipedia:List_of_English_contractions
      check('he wants', 'verb', 'infinitive', 'she_wants_to_look');  
      check('she thinks', 'verb', 'present_participle', 'she_is_looking');  
      check('he hates', 'verb', 'present_participle', 'she_is_looking');  

      // [I/you/he/she/they/we] was, were, think, wish
      // [him/her/me/you/them/us] want, like, to, in, help, tell, near, over, under, for, preposition, give, get, make, not, stop, hello, goodbye, from, feed, bite, suck, hug, kiss, it's, count, around, beneath, among, beyond, visit, bug
      // [his/her/my/your/their/our] eat, on, up, play, drink, off, down, out, is, are, read, use, wear, all, at, of, eat, drink, taste, lick, left, across, into, where's, lost, lower, raise, hide, lose, start, exit, run, turn, return, check, finish, continue, begin, improve, honor, change, reduce, grow, expand, shrink, it's, refill, drink, swallow, feel, communicate, resolve, describe, explain, represent, spray, scrub, wipe, wash, clean, learn, study, cheat, type, become, exercise, play, ponder, 
      // [himself/herself/myself/ourself] by, view, prepare, settle, repeat, defend
      check('I think', 'pronoun', 'default', 'i_think_he');  
      check('you wish', 'pronoun', 'default', 'i_think_he');  
      check('I like', 'pronoun', 'objective', 'i_like_him');  
      check('give it to', 'pronoun', 'objective', 'about_him');  
      check('tell', 'pronoun', 'objective', 'about_him');  
      check('put it over', 'pronoun', 'objective', 'near_me');  
      check('jump', 'pronoun', 'objective', 'i_like_him');  
      check('I want to eat', 'pronoun', 'possessive_adjective', 'eat_my');  
      check('put it on', 'pronoun', 'possessive_adjective', 'eat_my');  
      check('put down', 'pronoun', 'possessive_adjective', 'eat_my');  
      check('those are', 'pronoun', 'possessive_adjective', 'these_are_his');  
      check('all of', 'pronoun', 'possessive_adjective', 'eat_my');  
      check('by', 'pronoun', 'objective', 'near_me');  
      check('all by', 'pronoun', 'reflexive', 'all_by_myself');  
      check('he will view', 'pronoun', 'reflexive', 'view_yourself');

      check('I am going', 'verb', 'infinitive', 'he_is_looking_to_go');  
      check('I am', 'verb', 'present_participle', 'is_she_looking');  
      check('we are on', 'verb', 'present_participle', 'over_laughing');  
      check('before', 'verb', 'present_participle', 'still_laughing');  
      check('mine', 'verb', 'present_participle', 'his_laughing');  
      // check('who', 'verb', 'past', 'xxx');  
      // check('what', 'verb', 'past', 'xxx');  
      // check('he is usually', 'verb', 'present_participle', 'still_laughing');  
      // check('he usually', 'verb', 'simple_present', 'still_laughing');  
      // check('why does he usually', 'verb', 'present', 'still_laughing');  
      // check('it is still', 'verb', 'present_participle', 'still_laughing');  
      check('I am going to', 'verb', null);  
      // check('somebody', 'verb', 'simple_present', 'xxx');  
      // check('is somebody', 'verb', 'present_participle', 'xxx');  
      check('the dog', 'verb', 'simple_present', 'dog_looks');  
      check('my cat', 'verb', 'simple_present', 'dog_looks');  
      check('did the dog', 'verb', 'present', 'did_the_dog_look');  
      check('when will my cat', 'verb', 'present', 'did_my_dog_look');  
      // [to jump] me, going
      // [jumping] am, on?, in?, are, is, go, off, on, prepositions?, there?, was, were, are, am, stop, the, because, done, no, not, together, lot, wether, than, favorite, perfect, silly, serious, own, me, him, her, them, us, -self, usual, despite, because, maybe, however, although
      // [jumped] mine, what, who, have, has, had, remain, stay, still, become, adverb (-ly)
      // [jump] to, did, does, do
      // [jumps] he, she, somebody, someone, everybody, (article/pronoun) noun

      var res = editManager.inflection_for_types(sentence('what'), 'en');
      expect((res.happen || {}).label).toEqual('happened');  
      // what happened

      var res = editManager.inflection_for_types(sentence('feel'), 'en');
      expect(res.like).toEqual(null);  
      var res = editManager.inflection_for_types(sentence('I feel'), 'en');
      expect(res.like.label).toEqual('like');  
      var res = editManager.inflection_for_types(sentence('she feels'), 'en');
      expect(res.like.label).toEqual('like');  
      var res = editManager.inflection_for_types(sentence('are you'), 'en');
      expect(res.done.label).toEqual('done');  
      var res = editManager.inflection_for_types(sentence('is she'), 'en');
      expect(res.done.label).toEqual('done');  
      var res = editManager.inflection_for_types(sentence('she'), 'en');
      expect(res.done.label).toEqual('does');  
      var res = editManager.inflection_for_types(sentence('she'), 'en');
      expect(res.is.label).toEqual('is');  
      var res = editManager.inflection_for_types(sentence('will she'), 'en');
      expect(res.is.label).toEqual('be');  

      check('he might', 'verb', 'present', 'they_can_look');
      check('I think this could', 'verb', 'present', 'they_can_look');
      var res = editManager.inflection_for_types(sentence('I think this'), 'en');
      expect(res.can.label).toEqual('can');  
      check('I think he', 'verb', 'simple_present', 'she_looks');
      check('I think that', 'verb', 'simple_present', 'she_looks');
      
      check('that is', 'pronoun', 'possessive_adjective', 'it_is_his');
      check('he is', 'pronoun', 'possessive_adjective', 'eat_my');
      check('I do not', 'verb', 'default', 'should_not_look');
      check("I don't", 'verb', 'default', 'should_not_look');
      check('I can not', 'verb', 'default', 'should_not_look');
      check('I will', 'verb', 'default', 'should_not_look');
      check('I will not', 'verb', 'default', 'should_not_look');
      check("I won't", 'verb', 'default', 'should_not_look');

      var res = editManager.inflection_for_types(sentence('she'), 'en');
      expect((res.will || {}).label).toEqual('will');  

      var res = editManager.inflection_for_types(sentence('I will'), 'en');
      expect((res.is || {}).label).toEqual('be');  

      var res = editManager.inflection_for_types(sentence('I am'), 'en');
      expect((res.done || {}).label).toEqual('done');

      var res = editManager.inflection_for_types(sentence('they'), 'en');
      expect((res.is || {}).label).toEqual('are');  

      // going to [is => be]
      var res = editManager.inflection_for_types(sentence('to'), 'en');
      expect((res.is || {}).label).toEqual(undefined);  
      // TODO:
      // var res = editManager.inflection_for_types(sentence('going to'), 'en');
      // expect((res.is || {}).label).toEqual('be');  
      // are/be going to [is => is]
      var res = editManager.inflection_for_types(sentence('are going to'), 'en');
      expect((res.is || {}).label).toEqual(undefined);  

      // I/you [not => am not]
      // I/you [no => don't]
      var res = editManager.inflection_for_types(sentence('I'), 'en');
      expect((res.not || {}).label).toEqual('am not');  
      expect((res.no || {}).label).toEqual('don\'t');  
      var res = editManager.inflection_for_types(sentence('he'), 'en');
      expect((res.not || {}).label).toEqual('isn\'t');  
      expect((res.no || {}).label).toEqual('doesn\'t');  
      var res = editManager.inflection_for_types(sentence('we'), 'en');
      expect((res.not || {}).label).toEqual('aren\'t');  
      expect((res.no || {}).label).toEqual('don\'t');  

      // those/these/some [is => are]
      var res = editManager.inflection_for_types(sentence('those'), 'en');
      expect((res.is || {}).label).toEqual('are');  


      // Auto-fill suggestions
      // is (link to verbs?)
      // eat, drink, play, read, watch, feel, color, listen [as links? maybe on the actual button]
      // go, eat at (links to places?)
      // really (don't auto-home?)
      // Page for adding personal stories, either save from sentence box or record audio, to a button


      // we want [him/her/me/you/them] Y
      check('I want', 'pronoun', 'objective', 'i_like_him');  
      // I don't like [her/him/me] Y
      check('I don\'t want', 'pronoun', 'objective', 'i_like_him');  
      // Do you think [he]
      check('do you think', 'pronoun', 'default', 'i_think_he');  
      // am [her/him/me/them]
      check('I am', 'pronoun', 'objective', 'i_am_him');  
      // are [her/his/my/their]
      check('they are', 'pronoun', 'possessive_adjective', 'these_are_his');
      // That is/was/are [his/hers/mine/theirs] N
      check('that was', 'pronoun', 'possessive_adjective', 'it_is_his');
      // That is not [theirs] N
      check('that is not', 'pronoun', 'possessive_adjective', 'it_is_his');
      // I want to get/have/hold/keep [his/her/my/their]
      // They saw [him/her/me]
      check('I see', 'pronoun', 'objective', 'i_like_him');
      // Give [him/her/me] the book
      check('give', 'pronoun', 'objective', 'about_him');
      check('tell', 'pronoun', 'objective', 'about_him');
      check('ask', 'pronoun', 'objective', 'i_like_him');
      // Are you talking to [him/her/me]
      check('are you talking to', 'pronoun', 'objective', 'about_him');
      // I am thinking about [him/her/me]
      check('I am thinking', 'pronoun', undefined, undefined);
      check('I am thinking about', 'pronoun', 'objective', 'about_him');
      check('I am not thinking about', 'pronoun', 'objective', 'about_him');
      // What is with/as/than/before [him/her/me]
      check('better than', 'pronoun', 'objective', 'with_him');
      // Judy helped [him/her/me]
      check('she helped', 'pronoun', 'objective', 'i_like_him');

    });
  })
});