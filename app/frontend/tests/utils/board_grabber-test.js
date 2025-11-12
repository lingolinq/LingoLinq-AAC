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
import contentGrabbers from '../../utils/content_grabbers';
import EmberObject from '@ember/object';
import modal from '../../utils/modal';
import editManager from '../../utils/edit_manager';
import persistence from '../../utils/persistence';
import progress_tracker from '../../utils/progress_tracker';
import LingoLinq from '../../app';

describe('boardGrabber', function() {
  var boardGrabber = contentGrabbers.boardGrabber;

  var controller = null;
  beforeEach(function() {
    var model = EmberObject.create({id: 1234});
    controller = EmberObject.create({model: model});
  });

  describe('setup', function() {
    it('should set the button and controller attributes', function() {
      var a = {a: 1};
      var b = {b: 2};
      boardGrabber.setup(a, b);
      expect(boardGrabber.controller).toEqual(b);
      expect(boardGrabber.button).toEqual(a);
    });
  });

  describe('clear', function() {
    it('should clear foundBoards and linkedBoardName (board search attributes) on controller', function() {
      controller.setProperties({foundBoards: 1, linkedBoardName: 2});
      boardGrabber.setup(null, controller);
      boardGrabber.clear();
      expect(controller.get('foundBoards')).toEqual(null);
      expect(controller.get('linkedBoardName')).toEqual(null);
    });
  });

  describe('find_board', function() {
    it('should use the exact board if found', function() {
      var called = null;
      stub(editManager, 'change_button', function(id, args) {
        called = !!(id == 1234 && args.load_board.key == 'hippo' && args.load_board.id == '123');
        expect(called).toEqual(true);
      });
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        query: {public: true, key: "hat"},
        response: RSVP.resolve({board: [{id: '123', key: 'hippo'}]})
      });
      controller.set('linkedBoardName', 'hat');
      boardGrabber.setup(null, controller);
      boardGrabber.find_board();

      waitsFor(function() { return called != null; }, 'too slow', 1000);
      runs(function() {
        expect(called).toEqual(true);
        expect(controller.get('foundBoards.results')).toEqual(null);
        expect(controller.get('linkedBoardName')).toEqual(null);
      });
    });
    it('should use the exact board if found by URL, stripping off the URL part', function() {
      var called = null;
      stub(editManager, 'change_button', function(id, args) {
        called = !!(id == 1234 && args.load_board.key == 'hippo' && args.load_board.id == '123');
        expect(called).toEqual(true);
      });
      var url = location.protocol + "//" + location.host + "/hat/fat";
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        query: {public: true, key: "hat/fat"},
        response: RSVP.resolve({board: [{id: '123', key: 'hippo'}]})
      });
      controller.set('linkedBoardName', url);
      boardGrabber.setup(null, controller);
      boardGrabber.find_board();

      waitsFor(function() { return called != null; }, 'too slow', 1000);
      runs(function() {
        expect(called).toEqual(true);
        expect(controller.get('foundBoards.results')).toEqual(null);
        expect(controller.get('linkedBoardName')).toEqual(null);
      });
    });
    it('should show search results if no exact board found', function() {
      queryLog.defineFixture({
        method: 'GET',
        type: 'board',
        query: {public: true, q: "hat"},
        response: RSVP.resolve({board: [{id: '123', key: 'hippo'}]})
      });
      controller.set('linkedBoardName', 'hat');
      boardGrabber.setup(null, controller);
      boardGrabber.find_board();
      expect(controller.get('foundBoards.ready')).toEqual(false);
      waitsFor(function() { return controller.get('foundBoards.ready'); });
      runs(function() {
        expect(controller.get('foundBoards.results')).not.toEqual(null);
        expect(controller.get('linkedBoardName')).toEqual("hat");
      });
    });
  });

  describe('build_board', function() {
    it('should create a board record for editing using the linkedBoardName', function() {
      controller.set('linkedBoardName', 'cookie');
      boardGrabber.setup(null, controller);
      boardGrabber.build_board();
      expect(controller.get('pending_board')).not.toEqual(null);
      expect(controller.get('pending_board.name')).toEqual('cookie');
      expect(controller.get('pending_board.grid.rows')).toEqual(2);
      expect(controller.get('pending_board.grid.columns')).toEqual(4);
      expect(controller.get('linkedBoardName')).toEqual('cookie');
    });
    it('should use the original board\'s dimensions on the new board', function() {
      var model = EmberObject.create({grid: {rows: 9, columns: 15}});
      controller.set('board', model);
      controller.set('linkedBoardName', 'cookie');
      boardGrabber.setup(null, controller);
      boardGrabber.build_board();
      expect(controller.get('pending_board')).not.toEqual(null);
      expect(controller.get('pending_board.name')).toEqual('cookie');
      expect(controller.get('pending_board.grid.rows')).toEqual(9);
      expect(controller.get('pending_board.grid.columns')).toEqual(15);
    });
    it('should cancel the pending board when cancel is called', function() {
      controller.set('linkedBoardName', 'cookie');
      boardGrabber.setup(null, controller);
      boardGrabber.build_board();
      expect(controller.get('pending_board')).not.toEqual(null);
      boardGrabber.cancel_build_board();
      expect(controller.get('pending_board')).toEqual(null);
    });
  });

  describe('create_board', function() {
    it('should create a new board based on the pending_board attribute', function() {
      var called = false;
      stub(editManager, 'change_button', function(id, args) {
        called = true;
      });
      queryLog.defineFixture({
        method: 'POST',
        type: 'board',
        response: RSVP.resolve({board: {id: '134', key: 'cookie'}}),
        compare: function(object) {
          return object.get('name') == 'cookie';
        }
      });
      boardGrabber.setup(null, controller);
      controller.set('pending_board', LingoLinq.store.createRecord('board', {name: 'cookie'}));
      boardGrabber.create_board();
      waitsFor(function() { return called === true; });
      runs(function() {
        var event = queryLog[queryLog.length - 1];
        expect(event.method).toEqual('POST');
        expect(event.simple_type).toEqual('board');
        expect(called).toEqual(true);
        expect(controller.get('pending_board')).toEqual(null);
        expect(controller.get('linkedBoardName')).toEqual(null);
      });
    });
  });

  describe('pick_board', function() {
    it('should set correct board attributes', function() {
      var called = false;
      stub(editManager, 'change_button', function(id, args) {
        called = (id == 1234 && args.load_board.key == 'key' + rand && args.load_board.id == rand);
      });

      var rand = Math.round(Math.random() * 99999);
      var board = EmberObject.create({
        id: rand,
        key: 'key' + rand
      });
      boardGrabber.setup(null, controller);
      boardGrabber.pick_board(board);

      expect(called).toEqual(true);
    });
  });

  describe("file_selected", function() {
    it("should error on invalid file type", function() {
      var message = null;
      stub(modal, 'flash', function(text) {
        message = text;
      });
      boardGrabber.file_selected();
      expect(message).toEqual('Please select a valid board file (.obf or .obz)');
    });
    it("should open a progress modal", function() {
      var template = null;
      stub(modal, 'open', function(t) {
        template = t;
      });
      stub(modal, 'error', function(t) { });
      stub(contentGrabbers, 'upload_for_processing', function() { return RSVP.reject(); });
      stub(contentGrabbers, 'read_file', function() { return RSVP.reject(); });
      boardGrabber.file_selected({});
      expect(template).toEqual('importing-boards');
    });
    it("should message on file reading error", function() {
      var message = null;
      stub(modal, 'open', function(t) { });
      stub(modal, 'error', function(str) {
        message = str;
      });
      stub(contentGrabbers, 'read_file', function() {
        return RSVP.reject();
      });
      boardGrabber.file_selected({});
      waitsFor(function() { return message; });
      runs(function() {
        expect(message).toEqual("Upload failed");
      });
    });
    it("should message on import preflight error", function() {
      var message = null;
      var made_it = false;
      stub(modal, 'open', function(t) { });
      stub(modal, 'error', function(str) {
        message = str;
      });
      stub(contentGrabbers, 'read_file', function() {
        return RSVP.resolve({target: {result: "abc"}});
      });
      stub(persistence, 'ajax', function(url, opts) {
        if(url == '/api/v1/boards/imports') {
          expect(opts.type).toEqual('POST');
          expect(opts.data.type).toEqual('obf');
          made_it = true;
          return RSVP.reject();
        }
      });
      boardGrabber.file_selected({});
      waitsFor(function() { return message; });
      runs(function() {
        expect(message).toEqual("Upload failed");
        expect(made_it).toEqual(true);
      });
    });
    it("should message on remote upload error", function() {
      var message = null;
      var made_it = false;
      stub(modal, 'open', function(t) { });
      stub(modal, 'error', function(str) {
        message = str;
      });
      stub(contentGrabbers, 'read_file', function() {
        return RSVP.resolve({target: {result: "abc"}});
      });
      stub(persistence, 'ajax', function(url, opts) {
        if(url == '/api/v1/boards/imports') {
          expect(opts.type).toEqual('POST');
          expect(opts.data.type).toEqual('obf');
          return RSVP.resolve({remote_upload: {}});
        }
      });
      stub(contentGrabbers, 'upload_to_remote', function(opts) {
        expect(opts.success_method).toEqual('POST');
        made_it = true;
        return RSVP.reject();
      });
      boardGrabber.file_selected({});
      waitsFor(function() { return message; });
      runs(function() {
        expect(message).toEqual("Upload failed");
        expect(made_it).toEqual(true);
      });
    });
    it("should message on progress error", function() {
      var message = null;
      var made_it = false;
      stub(modal, 'open', function(t) { });
      stub(modal, 'error', function(str) {
        message = str;
      });
      stub(contentGrabbers, 'read_file', function() {
        return RSVP.resolve({target: {result: "abc"}});
      });
      stub(persistence, 'ajax', function(url, opts) {
        if(url == '/api/v1/boards/imports') {
          expect(opts.type).toEqual('POST');
          expect(opts.data.type).toEqual('obf');
          return RSVP.resolve({remote_upload: {}});
        }
      });
      stub(contentGrabbers, 'upload_to_remote', function(opts) {
        expect(opts.success_method).toEqual('POST');
        return RSVP.resolve({progress: {}});
      });
      stub(progress_tracker, 'track', function(progress, callback) {
        made_it = true;
        callback({
          status: 'errored'
        });
      });
      boardGrabber.file_selected({});
      waitsFor(function() { return message; });
      runs(function() {
        expect(message).toEqual("Upload failed");
        expect(made_it).toEqual(true);
      });
    });
    it("should transition to the first board on successful import", function() {
      var message = null;
      var made_it = false;
      stub(modal, 'open', function(t) { });
      stub(modal, 'error', function(str) {
        message = str;
      });
      stub(contentGrabbers, 'read_file', function() {
        return RSVP.resolve({target: {result: "abc"}});
      });
      stub(persistence, 'ajax', function(url, opts) {
        if(url == '/api/v1/boards/imports') {
          expect(opts.type).toEqual('POST');
          expect(opts.data.type).toEqual('obf');
          return RSVP.resolve({remote_upload: {}});
        }
      });
      stub(contentGrabbers, 'upload_to_remote', function(opts) {
        expect(opts.success_method).toEqual('POST');
        return RSVP.resolve({progress: {}});
      });
      stub(progress_tracker, 'track', function(progress, callback) {
        callback({
          status: 'finished',
          result: [{key: 'bob'}]
        });
      });
      modal.last_template = 'importing-boards';
      boardGrabber.transitioner = {
        transitionTo: function(route, id) {
          made_it = true;
          expect(route).toEqual('board');
          expect(id).toEqual('bob');
        }
      };
      boardGrabber.file_selected({});
      waitsFor(function() { return made_it; });
      runs();
    });
  });

  describe("files_dropped", function() {
    it("should find the first obf or obz file and send it to file_selected", function() {
      var board = null;
      stub(boardGrabber, 'file_selected', function(obj) {
        board = obj;
      });
      boardGrabber.files_dropped([
        {name: "pic.png"},
        {name: "sound.obf", id: '1234'}
      ]);
      expect(board).not.toEqual(null);
      expect(board.id).toEqual('1234');
    });
    it("should alert if no valid files found", function() {
      var alert_message = null;
      stub(window, 'alert', function(message) {
        alert_message = message;
      });
      boardGrabber.files_dropped([]);
      expect(alert_message).toEqual("No valid board file found");
      alert_message = null;
      boardGrabber.files_dropped([
        {name: "pic.png"},
        {name: "sound.mp3"}
      ]);
      expect(alert_message).toEqual("No valid board file found");
    });
  });
});


