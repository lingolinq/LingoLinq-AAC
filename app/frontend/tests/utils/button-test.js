import {
  describe,
  context,
  it,
  expect,
  stub,
  waitsFor,
  runs
} from 'frontend/tests/helpers/jasmine';
import { queryLog } from 'frontend/tests/helpers/ember_helper';
import RSVP from 'rsvp';
import Button from '../../utils/button';
import app_state from '../../utils/app_state';
import persistence from '../../utils/persistence';
import progress_tracker from '../../utils/progress_tracker';
import LingoLinq from '../../app';
import EmberObject from '@ember/object';

context('Button', function() {
  context("actions", function() {
    it("should set default action attributes", function() {
      var button = Button.create();
      expect(button.get('buttonAction')).toEqual('talk');
      expect(button.get('talkAction')).toEqual(true);
      expect(button.get('folderAction')).toEqual(false);
    });
    it("should keep boolean action attributes in sync based on load_board with action value", function() {
      var button = Button.create({load_board: {}});
      expect(button.get('buttonAction')).toEqual('folder');
      expect(button.get('talkAction')).toEqual(false);
      expect(button.get('folderAction')).toEqual(true);
      button.set('load_board', null);
      expect(button.get('buttonAction')).toEqual('talk');
      expect(button.get('talkAction')).toEqual(true);
      expect(button.get('folderAction')).toEqual(false);
    });
  });

  it("should run this test once", function() {
    expect(1).toEqual(1);
  });

  context("raw", function() {
    it("should return a plain object", function() {
      var button = Button.create();
      expect(button.raw()).toEqual({});
      button.setProperties({
        label: "hat",
        background_color: "#fff"
      });
      expect(button.raw()).toEqual({label: 'hat', background_color: '#fff'});
    });
    it("should only pull defined attributes", function() {
      var button = Button.create({
        label: "hat",
        background_color: "#fff",
        chicken: true,
        talkAction: 'ok'
      });
      expect(button.raw()).toEqual({label: 'hat', background_color: '#fff'});
    });

  });

  context("integration type buttons", function() {
    it("should identify integration-type buttons", function() {
      var b = Button.create();
      expect(b.get('integrationAction')).toEqual(false);
      b.set('integration', {});
      expect(!!b.get('integrationAction')).toEqual(true);
    });

    it("should return the correct action_image for integration-type buttons in different states", function() {
      var b = Button.create();
      expect(b.get('action_image')).toEqual('/images/talk.png');
      b.set('integration', {});
      expect(b.get('action_image')).toEqual('/images/action.png');
      b.set('action_status', {pending: true});
      expect(b.get('action_image')).toEqual('/images/clock.png');
      b.set('action_status', {errored: true});
      expect(b.get('action_image')).toEqual('/images/error.png');
      b.set('action_status', {completed: true});
      expect(b.get('action_image')).toEqual('/images/check.png');
      b.set('action_status', {nothing: true});
      expect(b.get('action_image')).toEqual('/images/action.png');
    });
  });

  context("extra_actions", function() {
    it("should do nothing for an invalid button", function() {
      Button.extra_actions(null);
      var b = Button.create();
      Button.extra_actions(b);
      expect(b.get('action_status')).toEqual(undefined);
    });

    it("should do nothing for non-integration buttons", function() {
      var b = Button.create();
      Button.extra_actions(b);
      expect(b.get('action_status')).toEqual(undefined);
    });

    it("should trigger an error when not online", function() {
      app_state.set('sessionUser', EmberObject.create({id: '123'}));
      app_state.set('currentBoardState', {id: '234'});
      persistence.set('online', false);
      var b = Button.create({integration: {action_type: 'webhook'}});
      Button.extra_actions(b);
      expect(b.get('action_status.errored')).toEqual(true);
    });

    it("should not trigger an error for a non-webhook integration", function() {
      app_state.set('sessionUser', EmberObject.create({id: '123'}));
      app_state.set('currentBoardState', {id: '234'});
      persistence.set('online', false);
      var b = Button.create({integration: {action_type: 'render'}});
      Button.extra_actions(b);
      expect(b.get('action_status.errored')).toEqual(null);
    });

    it("should trigger a remote call for integration buttons", function() {
      app_state.set('sessionUser', EmberObject.create({id: '123'}));
      app_state.set('currentBoardState', {id: '234'});
      var b = Button.create({integration: {action_type: 'webhook'}});
      persistence.set('online', true);
      var ajax_opts = null;
      var ajax_url = null;
      stub(persistence, 'ajax', function(url, opts) {
        ajax_url = url;
        ajax_opts = opts;
        return RSVP.reject();
      });
      Button.extra_actions(b);
      waitsFor(function(r) { return ajax_opts; });
      runs(function() {
        expect(ajax_url).toEqual('/api/v1/users/123/activate_button');
        expect(ajax_opts.data.board_id).toEqual('234');
      });
    });

    it("should handle ajax errors for remote calls", function() {
      app_state.set('sessionUser', EmberObject.create({id: '123'}));
      app_state.set('currentBoardState', {id: '234'});
      var b = Button.create({integration: {action_type: 'webhook'}});
      persistence.set('online', true);
      var ajax_opts = null;
      var ajax_url = null;
      stub(persistence, 'ajax', function(url, opts) {
        ajax_url = url;
        ajax_opts = opts;
        expect(b.get('action_status.pending')).toEqual(true);
        return RSVP.reject();
      });
      Button.extra_actions(b);
      waitsFor(function(r) { return ajax_opts; });
      runs(function() {
        expect(ajax_url).toEqual('/api/v1/users/123/activate_button');
        expect(ajax_opts.data.board_id).toEqual('234');
        expect(b.get('action_status.errored')).toEqual(true);
      });
    });

    it("should handle missing progress response", function() {
      app_state.set('sessionUser', EmberObject.create({id: '123'}));
      app_state.set('currentBoardState', {id: '234'});
      var b = Button.create({integration: {action_type: 'webhook'}});
      persistence.set('online', true);
      var ajax_opts = null;
      var ajax_url = null;
      stub(persistence, 'ajax', function(url, opts) {
        ajax_url = url;
        ajax_opts = opts;
        expect(b.get('action_status.pending')).toEqual(true);
        return RSVP.resolve({progress: null});
      });
      Button.extra_actions(b);
      waitsFor(function(r) { return ajax_opts; });
      runs(function() {
        expect(ajax_url).toEqual('/api/v1/users/123/activate_button');
        expect(ajax_opts.data.board_id).toEqual('234');
        expect(b.get('action_status.errored')).toEqual(true);
      });
    });

    it("should track progress for remote calls", function() {
      app_state.set('sessionUser', EmberObject.create({id: '123'}));
      app_state.set('currentBoardState', {id: '234'});
      var b = Button.create({integration: {action_type: 'webhook'}});
      persistence.set('online', true);
      var ajax_opts = null;
      var ajax_url = null;
      stub(persistence, 'ajax', function(url, opts) {
        ajax_url = url;
        ajax_opts = opts;
        expect(b.get('action_status.pending')).toEqual(true);
        return RSVP.resolve({progress: 'asdf'});
      });
      var tracked = false;
      stub(progress_tracker, 'track', function(progress, callback) {
        expect(progress).toEqual('asdf');
        tracked = true;
      });
      Button.extra_actions(b);
      waitsFor(function() { return ajax_opts; });
      runs(function() {
        expect(ajax_url).toEqual('/api/v1/users/123/activate_button');
        expect(ajax_opts.data.board_id).toEqual('234');
      });
      waitsFor(function() { return tracked; });
      runs();
    });

    it("should handle errors on progress tracking", function() {
      app_state.set('sessionUser', EmberObject.create({id: '123'}));
      app_state.set('currentBoardState', {id: '234'});
      var b = Button.create({integration: {action_type: 'webhook'}});
      persistence.set('online', true);
      var ajax_opts = null;
      var ajax_url = null;
      stub(persistence, 'ajax', function(url, opts) {
        ajax_url = url;
        ajax_opts = opts;
        expect(b.get('action_status.pending')).toEqual(true);
        return RSVP.resolve({progress: 'asdf'});
      });
      var tracked = false;
      stub(progress_tracker, 'track', function(progress, callback) {
        expect(progress).toEqual('asdf');
        tracked = true;
        callback({status: 'errored'});
      });
      Button.extra_actions(b);
      waitsFor(function() { return ajax_opts; });
      runs(function() {
        expect(ajax_url).toEqual('/api/v1/users/123/activate_button');
        expect(ajax_opts.data.board_id).toEqual('234');
      });
      waitsFor(function() { return tracked; });
      runs(function() {
        expect(b.get('action_status.errored')).toEqual(true);
      });
    });

    it("should mark successful progresses with no responses as failed", function() {
      app_state.set('sessionUser', EmberObject.create({id: '123'}));
      app_state.set('currentBoardState', {id: '234'});
      var b = Button.create({integration: {action_type: 'webhook'}});
      persistence.set('online', true);
      var ajax_opts = null;
      var ajax_url = null;
      stub(persistence, 'ajax', function(url, opts) {
        ajax_url = url;
        ajax_opts = opts;
        expect(b.get('action_status.pending')).toEqual(true);
        return RSVP.resolve({progress: 'asdf'});
      });
      var tracked = false;
      stub(progress_tracker, 'track', function(progress, callback) {
        expect(progress).toEqual('asdf');
        tracked = true;
        callback({status: 'finished', result: []});
      });
      Button.extra_actions(b);
      waitsFor(function() { return ajax_opts; });
      runs(function() {
        expect(ajax_url).toEqual('/api/v1/users/123/activate_button');
        expect(ajax_opts.data.board_id).toEqual('234');
      });
      waitsFor(function() { return tracked; });
      runs(function() {
        expect(b.get('action_status.errored')).toEqual(true);
      });
    });
    it("should mark successful progresses with any error codes as failed", function() {
      app_state.set('sessionUser', EmberObject.create({id: '123'}));
      app_state.set('currentBoardState', {id: '234'});
      var b = Button.create({integration: {action_type: 'webhook'}});
      persistence.set('online', true);
      var ajax_opts = null;
      var ajax_url = null;
      stub(persistence, 'ajax', function(url, opts) {
        ajax_url = url;
        ajax_opts = opts;
        expect(b.get('action_status.pending')).toEqual(true);
        return RSVP.resolve({progress: 'asdf'});
      });
      var tracked = false;
      stub(progress_tracker, 'track', function(progress, callback) {
        expect(progress).toEqual('asdf');
        tracked = true;
        callback({status: 'finished', result: [{response_code: 200}, {response_code: 400}]});
      });
      Button.extra_actions(b);
      waitsFor(function() { return ajax_opts; });
      runs(function() {
        expect(ajax_url).toEqual('/api/v1/users/123/activate_button');
        expect(ajax_opts.data.board_id).toEqual('234');
      });
      waitsFor(function() { return tracked; });
      runs(function() {
        expect(b.get('action_status.errored')).toEqual(true);
      });
    });
    it("should mark successful progresses with success codes as succeeded", function() {
      app_state.set('sessionUser', EmberObject.create({id: '123'}));
      app_state.set('currentBoardState', {id: '234'});
      var b = Button.create({integration: {action_type: 'webhook'}});
      persistence.set('online', true);
      var ajax_opts = null;
      var ajax_url = null;
      stub(persistence, 'ajax', function(url, opts) {
        ajax_url = url;
        ajax_opts = opts;
        expect(b.get('action_status.pending')).toEqual(true);
        return RSVP.resolve({progress: 'asdf'});
      });
      var tracked = false;
      stub(progress_tracker, 'track', function(progress, callback) {
        expect(progress).toEqual('asdf');
        tracked = true;
        callback({status: 'finished', result: [{response_code: 200}, {response_code: 210}]});
      });
      Button.extra_actions(b);
      waitsFor(function() { return ajax_opts; });
      runs(function() {
        expect(ajax_url).toEqual('/api/v1/users/123/activate_button');
        expect(ajax_opts.data.board_id).toEqual('234');
      });
      waitsFor(function() { return tracked; });
      runs(function() {
        expect(b.get('action_status.completed')).toEqual(true);
      });
    });
  });
  it("should run this test once too", function() {
    expect(1).toEqual(1);
  });

  context("load_image", function() {
    it('should resolve with no image_id', function() {
      var b = Button.create();
      var resolved = false;
      b.load_image().then(function(res) {
        resolved = true;
      });
      waitsFor(function() { return resolved; });
      runs();
    });

    it('should not lookup the image if already loaded', function() {
      var b = Button.create();
      var i = LingoLinq.store.push({ data: {
        id: 'asdf',
        type: 'image',
        attributes: {
          url: 'http://www.example.com/pic.png'
        }
      }});
      var checked = false;
      stub(i, 'checkForDataURL', function() {
        checked = true;
        return RSVP.resolve('asdf');
      });
      var loaded = false;
      b.image_id = 'asdf';
      b.load_image().then(function(res) {
        loaded = true;
      });
      waitsFor(function() { return loaded; });
      runs(function() {
        expect(checked).toEqual(true);
        expect(b.get('local_image_url')).toEqual('http://www.example.com/pic.png');
      });
    });

    it('should reject if not already loaded and no_lookups set', function() {
      var b = Button.create();
      b.set('no_lookups', true);
      var loaded = false;
      b.image_id = 'asdf';
      b.load_image().then(null, function(res) {
        loaded = true;
      });
      waitsFor(function() { return loaded; });
      runs(function() {
        expect(b.get('local_image_url')).toEqual(undefined);
      });
    });

    it('should look up the image', function() {
      var b = Button.create();
      b.image_id = 'asdf';
      var loaded = false;

      persistence.primed = true;
      queryLog.defineFixture({
        method: 'GET',
        type: 'image',
        id: 'asdf',
        response: RSVP.resolve({image: {
          id: 'asdf',
          url: 'http://www.example.com/pic.png'
        }})
      });

      b.load_image().then(function(res) {
        loaded = true;
      });
      waitsFor(function() { return loaded; });
      runs(function() {
        expect(b.get('local_image_url')).toEqual('http://www.example.com/pic.png');
      });
    });
  });

  context("load_sound", function() {
    it('should resolve with no sound_id', function() {
      var b = Button.create();
      var resolved = false;
      b.load_sound().then(function(res) {
        resolved = true;
      });
      waitsFor(function() { return resolved; });
      runs();
    });

    it('should not lookup the sound if already loaded', function() {
      var b = Button.create();
      var i = LingoLinq.store.push({ data: {
        id: 'asdf',
        type: 'sound',
        attributes: {
          url: 'http://www.example.com/pic.png'
        }
      }});
      var checked = false;
      stub(i, 'checkForDataURL', function() {
        checked = true;
        return RSVP.resolve('asdf');
      });
      var loaded = false;
      b.sound_id = 'asdf';
      b.load_sound().then(function(res) {
        loaded = true;
      });
      waitsFor(function() { return loaded; });
      runs(function() {
        expect(checked).toEqual(true);
        expect(b.get('local_sound_url')).toEqual('http://www.example.com/pic.png');
      });
    });

    it('should reject if not already loaded and no_lookups set', function() {
      var b = Button.create();
      b.sound_id = 'asdf';
      b.set('no_lookups', true);
      var loaded = false;
      b.load_sound().then(null, function(res) {
        loaded = true;
      });
      waitsFor(function() { return loaded; });
      runs(function() {
        expect(b.get('local_sound_url')).toEqual(undefined);
      });
    });

    it('should look up the sound', function() {
      var b = Button.create();
      b.sound_id = 'asdf';
      var loaded = false;

      queryLog.defineFixture({
        method: 'GET',
        type: 'sound',
        id: 'asdf',
        response: RSVP.resolve({sound: {
          id: 'asdf',
          url: 'http://www.example.com/pic.png'
        }})
      });

      b.load_sound().then(function(res) {
        loaded = true;
      });
      waitsFor(function() { return loaded; });
      runs(function() {
        expect(b.get('local_sound_url')).toEqual('http://www.example.com/pic.png');
      });
    });
  });

  context("findContentLocally", function() {
    it('should resolve if already loaded', function() {
      var b = Button.create();
      b.image_id = 'asdf';
      b.set('local_image_url', 'http://www.example.com/pic.png');
      b.sound_id = 'qwer';
      b.set('local_sound_url', 'http://www.example.com/sound.mp3');
      var done = false;
      b.findContentLocally().then(function(res) {
        done = true;
        expect(res).toEqual(true);
      });
      waitsFor(function() { return done; });
      runs();
    });

    it('should resolve if ids not specified', function() {
      var b = Button.create();
      var done = false;
      b.findContentLocally().then(function(res) {
        done = true;
        expect(res).toEqual(true);
      });
      waitsFor(function() { return done; });
      runs();
    });

    it('should not call load_image if the url is already cached', function() {
      var b = Button.create();
      var image_load = false;
      var sound_load = false;
      stub(b, 'load_image', function() { image_load = true; return RSVP.reject(); });
      stub(b, 'load_sound', function() { sound_load = true; return RSVP.reject(); });
      var done = false;
      b.image_id = 'asdf';
      b.image_url = 'http://www.example.com/pic.png';
      persistence.url_cache = {'http://www.example.com/pic.png': 'file://something.png'};
      b.findContentLocally().then(function(res) {
        done = true;
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(image_load).toEqual(false);
        expect(sound_load).toEqual(false);
        expect(b.get('local_image_url')).toEqual('file://something.png');
      });
    });

    it('should call load_image if needed', function() {
      var b = Button.create();
      var image_load = false;
      var sound_load = false;
      stub(b, 'load_image', function() { image_load = true; return RSVP.resolve(); });
      stub(b, 'load_sound', function() { sound_load = true; return RSVP.resolve(); });
      var done = false;
      b.image_id = 'asdf';
      b.image_url = 'http://www.example.com/pic.png';
      persistence.url_cache = {};
      b.findContentLocally().then(function(res) {
        done = true;
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(image_load).toEqual(true);
        expect(sound_load).toEqual(false);
        expect(b.get('local_image_url')).toEqual(undefined);
      });
    });

    it('should reject if image lookup fails', function() {
      var b = Button.create();
      var image_load = false;
      var sound_load = false;
      stub(b, 'load_image', function() { image_load = true; return RSVP.reject(); });
      stub(b, 'load_sound', function() { sound_load = true; return RSVP.resolve(); });
      var done = false;
      b.image_id = 'asdf';
      b.image_url = 'http://www.example.com/pic.png';
      persistence.url_cache = {};
      b.findContentLocally().then(function(res) {
        done = true;
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(image_load).toEqual(true);
        expect(sound_load).toEqual(false);
        expect(b.get('local_image_url')).toEqual(undefined);
      });
    });

    it('should not call load_sound if the url is already cached', function() {
      var b = Button.create();
      var image_load = false;
      var sound_load = false;
      stub(b, 'load_image', function() { image_load = true; return RSVP.reject(); });
      stub(b, 'load_sound', function() { sound_load = true; return RSVP.reject(); });
      var done = false;
      b.sound_id = 'asdf';
      b.sound_url = 'http://www.example.com/pic.png';
      persistence.url_cache = {'http://www.example.com/pic.png': 'file://something.png'};
      b.findContentLocally().then(function(res) {
        done = true;
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(image_load).toEqual(false);
        expect(sound_load).toEqual(false);
        expect(b.get('local_sound_url')).toEqual('file://something.png');
      });
    });

    it('should call load_sound if needed', function() {
      var b = Button.create();
      var image_load = false;
      var sound_load = false;
      stub(b, 'load_image', function() { image_load = true; return RSVP.resolve(); });
      stub(b, 'load_sound', function() { sound_load = true; return RSVP.resolve(); });
      var done = false;
      b.sound_id = 'asdf';
      b.sound_url = 'http://www.example.com/pic.png';
      persistence.url_cache = {};
      b.findContentLocally().then(function(res) {
        done = true;
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(image_load).toEqual(false);
        expect(sound_load).toEqual(true);
        expect(b.get('local_sound_url')).toEqual(undefined);
      });
    });

    it('should reject if sound lookup fails', function() {
      var b = Button.create();
      var image_load = false;
      var sound_load = false;
      stub(b, 'load_image', function() { image_load = true; return RSVP.resolve(); });
      stub(b, 'load_sound', function() { sound_load = true; return RSVP.reject(); });
      var done = false;
      b.sound_id = 'asdf';
      b.sound_url = 'http://www.example.com/pic.png';
      persistence.url_cache = {};
      b.findContentLocally().then(function(res) {
        done = true;
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(image_load).toEqual(false);
        expect(sound_load).toEqual(true);
        expect(b.get('local_sound_url')).toEqual(undefined);
      });
    });

    it('should not lookup if no id specified', function() {
      var b = Button.create();
      var done = false;
      b.findContentLocally().then(function(res) {
        done = true;
        expect(res).toEqual(true);
      });
      waitsFor(function() { return done; });
      runs();
    });
  });

  context('fast_html', function() {
    it('should return html', function() {
      var b = Button.create();
      var html = b.get('fast_html');
      expect(!!html.string.match(/div/)).toEqual(true);
    });

    it('should sanitize text appropriately', function() {
      var b = Button.create();
      b.set('label', "<script>alert('asdf');</script>");
      var html = b.get('fast_html');
      expect(html.string.indexOf("<script>alert('asdf');</script>")).toEqual(-1);
      expect(html.string.indexOf("&lt;script&gt;alert('asdf');&lt;/script&gt;")).toNotEqual(-1);
    });
  });

  context('update_translations', function() {
    it('should update matching translation in-place when label changes', function() {
      var board = LingoLinq.store.createRecord('board');
      board.set('locale', 'en');
      var button = Button.create({board: board});
      button.set('translations_hash', {
        'en': {
          'label': 'cat'
        },
        'es': {
          'label': 'tac',
          'vocalization': 'stac'
        }
      });
      expect(button.get('translations')).toEqual([
        {code: 'en', locale: 'en', label: undefined, vocalization: undefined},
        {code: 'es', locale: 'es', label: 'tac', vocalization: 'stac'}
      ]);
      button.set('label', 'cans');
      expect(button.get('translations')).toEqual([
        {code: 'en', locale: 'en', label: 'cans', vocalization: undefined},
        {code: 'es', locale: 'es', label: 'tac', vocalization: 'stac'}
      ]);
    });

    it('should update matching vocalization in-place when vocalization changes', function() {
      var board = LingoLinq.store.createRecord('board');
      board.set('locale', 'en');
      var button = Button.create({board: board});
      button.set('translations_hash', {
        'en': {
          'label': 'cat'
        },
        'es': {
          'label': 'tac',
          'vocalization': 'stac'
        }
      });
      expect(button.get('translations')).toEqual([
        {code: 'en', locale: 'en', label: undefined, vocalization: undefined},
        {code: 'es', locale: 'es', label: 'tac', vocalization: 'stac'}
      ]);
      board.set('locale', 'es');
      button.set('vocalization', 'bleh');
      expect(button.get('translations')).toEqual([
        {code: 'en', locale: 'en', label: 'cat', vocalization: undefined},
        {code: 'es', locale: 'es', label: 'tac', vocalization: 'bleh'}
      ]);
    });

    it('should update translations record when the hash is set', function() {
      var b = Button.create();
      b.set('translations_hash', {
        'fr': {
          'label': 'cat',
          'vocalization': 'cats'
        },
        'es': {
          'label': 'tac',
          'vocalization': 'stac'
        }
      });
      expect(b.get('translations')).toEqual([
        {code: 'fr', locale: 'fr', label: 'cat', vocalization: 'cats'},
        {code: 'es', locale: 'es', label: 'tac', vocalization: 'stac'}
      ]);
    });
  });

  context('update_settings_from_translations', function() {
    it('should update label and vocalization when translation values change', function() {
      var b = Button.create();
      b.set('label', 'fred');
      b.set('vocalization', 'freddy');
      b.set('translations', [
        {code: 'en', locale: 'en', label: 'max', vocalization: 'maximum'},
        {code: 'es', locale: 'es', label: 'big', vocalization: 'really big'}
      ]);
      expect(b.get('label')).toEqual('max');
      expect(b.get('vocalization')).toEqual('maximum');
    });

    it('should not update label and vocalization when non-matching translation values change', function() {
      var b = Button.create();
      b.set('label', 'fred');
      b.set('vocalization', 'freddy');
      b.set('translations', [
        {code: 'fr', locale: 'en', label: 'max', vocalization: 'maximum'},
        {code: 'es', locale: 'es', label: 'big', vocalization: 'really big'}
      ]);
      expect(b.get('label')).toEqual('fred');
      expect(b.get('vocalization')).toEqual('freddy');
    });
  });

  context('resource_from_url', function() {
    it('should recognize tarheel books by url', function() {
      var b = Button.create();
      b.set('url', 'http://tarheelreader.org/2015/06/03/first-the-by-shayd/');
      expect(b.get('book')).toEqual({
        "background": "white",
        "base_url": "http://tarheelreader.org/2015/06/03/first-the-by-shayd/",
        "id": "first-the-by-shayd",
        "links": "large",
        "popup": true,
        "position": "text_below",
        "speech": false,
        "type": "tarheel",
        "url": "http://tarheelreader.org/2015/06/03/first-the-by-shayd/?voice=silent&pageColor=fff&textColor=000&biglinks=2",
        "utterance": true
      });
    });

    it('should recognize YouTube videos by url', function() {
      var b = Button.create();
      b.set('url', 'https://www.youtube.com/watch?v=fPDYj3IMkRI');
      expect(b.get('video')).toEqual({
        "end": "",
        "id": "fPDYj3IMkRI",
        "popup": true,
        "start": "",
        "test_url": "https://www.youtube.com/embed/fPDYj3IMkRI?rel=0&showinfo=0&enablejsapi=1&origin=http%3A%2F%2Flocalhost%3A3400&autoplay=0",
        "thumbnail_content_type": "image/jpeg",
        "thumbnail_url": "https://img.youtube.com/vi/fPDYj3IMkRI/hqdefault.jpg",
        "type": "youtube",
        "url": "https://www.youtube.com/embed/fPDYj3IMkRI?rel=0&showinfo=0&enablejsapi=1&origin=http%3A%2F%2Flocalhost%3A3400&autoplay=1&controls=0"
       });
    });

    it('should recognize custom books by url', function() {
      var b = Button.create();
      b.set('url', 'book:http://www.example.com/book.json');
      expect(b.get('book')).toEqual({
        "background": "white",
        "base_url": "book:http://www.example.com/book.json",
        "id": "http://www.example.com/book.json",
        "links": "large",
        "popup": true,
        "position": "text_below",
        "speech": false,
        "type": "tarheel",
        "url": "book:http://www.example.com/book.json?voice=silent&pageColor=fff&textColor=000&biglinks=2",
        "utterance": true
        });
    });

    it('should update between types correctly', function() {
      var b = Button.create();
      b.set('url', 'https://www.youtube.com/watch?v=fPDYj3IMkRI');
      expect(b.get('video')).toEqual({
        "end": "",
        "id": "fPDYj3IMkRI",
        "popup": true,
        "start": "",
        "test_url": "https://www.youtube.com/embed/fPDYj3IMkRI?rel=0&showinfo=0&enablejsapi=1&origin=http%3A%2F%2Flocalhost%3A3400&autoplay=0",
        "thumbnail_content_type": "image/jpeg",
        "thumbnail_url": "https://img.youtube.com/vi/fPDYj3IMkRI/hqdefault.jpg",
        "type": "youtube",
        "url": "https://www.youtube.com/embed/fPDYj3IMkRI?rel=0&showinfo=0&enablejsapi=1&origin=http%3A%2F%2Flocalhost%3A3400&autoplay=1&controls=0"
      });
      expect(b.get('book')).toEqual(null);
      b.set('video.start', '123');
      b.set('video.popup', false);

      b.set('url', 'https://www.youtube.com/watch?v=fPDYj3IMkRW');
      expect(b.get('video')).toEqual({
        "end": "",
        "id": "fPDYj3IMkRW",
        "popup": true,
        "start": "",
        "test_url": "https://www.youtube.com/embed/fPDYj3IMkRW?rel=0&showinfo=0&enablejsapi=1&origin=http%3A%2F%2Flocalhost%3A3400&autoplay=0",
        "thumbnail_content_type": "image/jpeg",
        "thumbnail_url": "https://img.youtube.com/vi/fPDYj3IMkRW/hqdefault.jpg",
        "type": "youtube",
        "url": "https://www.youtube.com/embed/fPDYj3IMkRW?rel=0&showinfo=0&enablejsapi=1&origin=http%3A%2F%2Flocalhost%3A3400&autoplay=1&controls=0"
      });
      expect(b.get('book')).toEqual(null);

      b.set('url', null);
      expect(b.get('video')).toEqual(null);
      expect(b.get('book')).toEqual(null);

      b.set('url', 'http://tarheelreader.org/2015/06/03/first-the-by-shayd/');
      expect(b.get('book')).toEqual({
        "background": "white",
        "base_url": "http://tarheelreader.org/2015/06/03/first-the-by-shayd/",
        "id": "first-the-by-shayd",
        "links": "large",
        "popup": true,
        "position": "text_below",
        "speech": false,
        "type": "tarheel",
        "url": "http://tarheelreader.org/2015/06/03/first-the-by-shayd/?voice=silent&pageColor=fff&textColor=000&biglinks=2",
        "utterance": true
      });
      expect(b.get('video')).toEqual(null);
      b.set('book.speech', true);
      b.set('book.utterance', false);

      b.set('url', 'book:http://www.example.com/book.json');
      expect(b.get('book')).toEqual({
        "background": "white",
        "base_url": "book:http://www.example.com/book.json",
        "id": "http://www.example.com/book.json",
        "links": "large",
        "popup": true,
        "position": "text_below",
        "speech": false,
        "type": "tarheel",
        "url": "book:http://www.example.com/book.json?voice=silent&pageColor=fff&textColor=000&biglinks=2",
        "utterance": true
      });
      expect(b.get('video')).toEqual(null);
    });
  });

  describe('set_attribute', function() {
    it('should set the attribute', function() {
      var b = Button.create();
      Button.set_attribute(b, 'a', 1);
      expect(b.get('a')).toEqual(1);
    });

    it('should set an override level modification for any attribute set on a level', function() {
      var b = Button.create();
      b.set('level_modifications', {'2': {'a': 2}});
      Button.set_attribute(b, 'a', 3);
      expect(b.get('a')).toEqual(3)
      expect(b.get('level_modifications.2.a')).toEqual(2);
      expect(b.get('level_modifications.override.a')).toEqual(3);
    });

    it('should set an override level modification for any attribute set on pre', function() {
      var b = Button.create();
      b.set('level_modifications', {pre: {'a': 1}});
      Button.set_attribute(b, 'a', 3);
      expect(b.get('a')).toEqual(3)
      expect(b.get('level_modifications.pre.a')).toEqual(1);
      expect(b.get('level_modifications.override.a')).toEqual(3);
    });
  })
});
