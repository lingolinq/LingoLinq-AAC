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
import { db_wait } from 'frontend/tests/helpers/ember_helper';
import capabilities from '../../utils/capabilities';
import app_state from '../../utils/app_state';
import scanner from '../../utils/scanner';
import frame_listener from '../../utils/frame_listener';
import LingoLinq from '../../app';

describe("frame_listener", function() {
  var frame = null;
  var overlay = null;
  beforeEach(function() {
    frame = document.createElement('div');
    frame.id = 'integration_frame';
    document.body.appendChild(frame);
    overlay = document.createElement('div');
    overlay.id = 'integration_overlay';
    document.body.appendChild(overlay);
    overlay.style.left = '100px';
    overlay.style.top = '100px';
    overlay.style.width = '100px';
    overlay.style.height = '100px';
    overlay.style.position = 'absolute';
  });
  afterEach(function() {
    if(frame && frame.parentNode) {
      frame.parentNode.removeChild(frame);
    }
    if(overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    frame_listener.raw_listeners = {};
    frame_listener.set('targets', []);
  });

  describe('handle_action', function() {
    it('should trigger the correct method', function() {
      var method = null;
      var data = null;
      stub(frame_listener, 'listen', function(d) { method = 'listen'; data = d; });
      stub(frame_listener, 'stop_listening', function(d) { method = 'stop_listening'; data = d; });
      stub(frame_listener, 'status', function(d) { method = 'status'; data = d; });
      stub(frame_listener, 'add_text', function(d) { method = 'add_text'; data = d; });
      stub(frame_listener, 'update_manifest', function(d) { method = 'update_manifest'; data = d; });
      stub(frame_listener, 'retrieve_object', function(d) { method = 'retrieve_object'; data = d; });
      stub(frame_listener, 'add_target', function(d) { method = 'add_target'; data = d; });
      stub(frame_listener, 'clear_target', function(d) { method = 'clear_target'; data = d; });
      stub(frame_listener, 'clear_targets', function(d) { method = 'clear_targets'; data = d; });

      frame_listener.handle_action({action: 'listen', key: 'listen'});
      expect(method).toEqual('listen');
      expect(data.key).toEqual('listen');

      frame_listener.handle_action({action: 'stop_listening', key: 'key'});
      expect(method).toEqual('stop_listening');
      expect(data.key).toEqual('key');

      frame_listener.handle_action({action: 'status', key: 'abc'});
      expect(method).toEqual('status');
      expect(data.key).toEqual('abc');

      frame_listener.handle_action({action: 'add_text', key: 'hat'});
      expect(method).toEqual('add_text');
      expect(data.key).toEqual('hat');

      frame_listener.handle_action({action: 'update_manifest', key: 'cat'});
      expect(method).toEqual('update_manifest');
      expect(data.key).toEqual('cat');

      frame_listener.handle_action({action: 'retrieve_object', key: 'sat'});
      expect(method).toEqual('retrieve_object');
      expect(data.key).toEqual('sat');

      frame_listener.handle_action({action: 'add_target', key: 'rat'});
      expect(method).toEqual('add_target');
      expect(data.key).toEqual('rat');

      frame_listener.handle_action({action: 'clear_target', key: 'fat'});
      expect(method).toEqual('clear_target');
      expect(data.key).toEqual('fat');

      frame_listener.handle_action({action: 'clear_targets', key: 'splat'});
      expect(method).toEqual('clear_targets');
      expect(data.key).toEqual('splat');

      frame_listener.handle_action({action: 'bacon', respond: function(d) { method = 'bacon'; data = d; }});
      expect(method).toEqual('bacon');
      expect(data).toEqual({error: "unrecognized action, bacon"});
    });
  });

  describe('unload', function() {
    it('should stop listening and clear targets', function() {
      var stop_key = null;
      var clear_key = null;
      stub(frame_listener, 'stop_listening', function(k) {
        stop_key = k;
      });
      stub(frame_listener, 'clear_targets', function(k) {
        clear_key = k;
      });
      frame_listener.unload();
      waitsFor(function() { return stop_key && clear_key; });
      runs(function() {
        expect(stop_key).toEqual('all');
        expect(clear_key).toEqual('all');
      });
    });
  });

  describe('listen', function() {
    it('should add the listener', function() {
      var keys = Object.keys(frame_listener.raw_listeners);
      expect(keys.length).toEqual(0);

      frame_listener.handle_action({
        action: 'listen',
        session_id: 'asdf'
      });

      var keys = Object.keys(frame_listener.raw_listeners);
      expect(keys.length).toEqual(1);
    });

    it('should respond to the caller', function() {
      var id = null;
      frame_listener.listen({
        respond: function(data) {
          id = data.listen_id;
        },
        session_id: 'asdf'
      });
      waitsFor(function() { return id; });
      runs(function() {
        expect(frame_listener.raw_listeners['asdf' + id]).toNotEqual(undefined);
        expect(frame_listener.raw_listeners['asdf' + id].respond).toNotEqual(undefined);
        expect(frame_listener.raw_listeners['asdf' + id].session_id).toEqual('asdf');
      });
    });
  });

  describe('stop_listening', function() {
    it('should remove all listeners when specified', function() {
      frame_listener.raw_listeners = {a: 1, b: 2};
      frame_listener.stop_listening('all');
      expect(frame_listener.raw_listeners).toEqual({});
    });

    it('should remove all session listeners when specified', function() {
      frame_listener.raw_listeners = {a: 1, asdfa: 1};
      frame_listener.handle_action({action: 'stop_listening', session_id: 'asdf', listen_id: 'all'});
      expect(frame_listener.raw_listeners).toEqual({a: 1});
    });

    it('should remove the specified listener', function() {
      frame_listener.raw_listeners = {a: 1, asdfa: 1, asdfb: 1};
      frame_listener.handle_action({action: 'stop_listening', session_id: 'asdf', listen_id: 'b'});
      expect(frame_listener.raw_listeners).toEqual({a: 1, asdfa: 1});
    });

    it('should respond', function() {
      var data = null;
      frame_listener.raw_listeners = {a: 1, asdfa: 1, asdfb: 1};
      frame_listener.handle_action({action: 'stop_listening', session_id: 'asdf', listen_id: 'b', respond: function(d) { data = d; }});
      waitsFor(function() { return data; });
      runs(function() {
        expect(frame_listener.raw_listeners).toEqual({a: 1, asdfa: 1});
        expect(data).toEqual({cleared: true});
      });
    });
  });

  describe('raw_event', function() {
    it('should not trigger any if overlay not found', function() {
      var e = document.getElementById('integration_overlay');
      e.parentNode.removeChild(e);

      var a = null;
      var b = null;
      var t = null;
      frame_listener.raw_listeners = {
        asdfa: {
          respond: function(d) { a = d; },
          session_id: 'asdf'
        },
        asdfb: {
          respond: function(d) { b = d; },
          session_id: 'asdf'
        },
        qwert: {
          respond: function(d) { t = d; },
          session_id: 'qwer'
        }
      };
      var rect = overlay.getBoundingClientRect();
      frame_listener.raw_event({ session_id: 'asdf', type: 'click', aac_type: 'select', clientX: rect.left, clientY: rect.top });
      expect(a).toEqual(null);
      expect(b).toEqual(null);
      expect(t).toEqual(null);
    });

    it('should trigger the event for all matching listeners', function() {
      document.documentElement.scrollTop = 75;
      var a = null;
      var b = null;
      var t = null;
      frame_listener.raw_listeners = {
        asdfa: {
          respond: function(d) { a = d; },
          session_id: 'asdf'
        },
        asdfb: {
          respond: function(d) { b = d; },
          session_id: 'asdf'
        },
        qwert: {
          respond: function(d) { t = d; },
          session_id: 'qwer'
        }
      };
      var rect = overlay.getBoundingClientRect();
      frame_listener.raw_event({ session_id: 'asdf', type: 'click', aac_type: 'select', clientX: rect.left, clientY: rect.top });
      expect(a).toNotEqual(null);
      expect(a).toEqual({aac_type: 'select', type: 'click', x_percent: 0, y_percent: 0});
      expect(b).toNotEqual(null);
      expect(b).toEqual({aac_type: 'select', type: 'click', x_percent: 0, y_percent: 0});
      expect(t).toEqual(null);
    });

    it('should not trigger the event for non-matching listeners', function() {
      var a = null;
      var b = null;
      var t = null;
      frame_listener.raw_listeners = {
        asdfa: {
          respond: function(d) { a = d; },
          session_id: 'asdf'
        },
        asdfb: {
          respond: function(d) { b = d; },
          session_id: 'asdf'
        },
        qwert: {
          respond: function(d) { t = d; },
          session_id: 'qwer'
        }
      };
      frame.setAttribute('data-session_id', 'qwer');
      var rect = overlay.getBoundingClientRect();
      frame_listener.raw_event({ type: 'click', aac_type: 'select', clientX: rect.left + 50, clientY: rect.top + 25 });
      expect(a).toEqual(null);
      expect(b).toEqual(null);
      expect(t).toNotEqual(null);
      expect(t).toEqual({aac_type: 'select', type: 'click', x_percent: 0.5, y_percent: 0.25});
    });
  });

  describe('status', function() {
    it('should return ready status', function() {
      var data = null;
      frame_listener.status({respond: function(d) { data = d; }});
      expect(data).toEqual({status: 'ready', session_id: undefined, user_token: undefined, code: undefined, system_token: 'LingoLinqAAC'});
    });

    it('should return the user token if specified', function() {
      var data = null;
      frame.setAttribute('data-user_token', 'token');
      frame_listener.handle_action({action: 'status', session_id: 'asdf', respond: function(d) { data = d; }});
      expect(data).toEqual({status: 'ready', session_id: 'asdf', user_token: 'token', code: undefined, system_token: 'LingoLinqAAC'});
    });

    it('should return the action code if specified', function() {
      var data = null;
      frame.setAttribute('data-user_token', 'token');
      frame.setAttribute('data-code', 'codeness');
      frame_listener.handle_action({action: 'status', session_id: 'asdf', respond: function(d) { data = d; }});
      expect(data).toEqual({status: 'ready', session_id: 'asdf', user_token: 'token', code: 'codeness', system_token: 'LingoLinqAAC'});
    });
  });

  describe('add_text', function() {
    it('should trigger a button activation if specified', function() {
      var button = null;
      stub(app_state, 'activate_button', function(a, b) {
        button = b;
      });
      app_state.set('currentBoardState', {id: '1_1', key: 'hat/cat'});
      frame_listener.handle_action({action: 'add_text', text: 'hats', image_url: 'http://www.example.com/pic.png'});
      expect(button).toNotEqual(null);
      expect(button).toEqual({
        label: 'hats',
        vocalization: 'hats',
        image: 'http://www.example.com/pic.png',
        button_id: null,
        board: {id: '1_1', key: 'hat/cat'},
        prevent_return: true,
        type: 'speak'
      });
    });

    it('should return a response', function() {
      var button = null;
      var data = null;
      stub(app_state, 'activate_button', function(a, b) {
        button = b;
      });
      app_state.set('currentBoardState', {id: '1_1', key: 'hat/cat'});
      frame_listener.handle_action({action: 'add_text', text: 'hats', image_url: 'http://www.example.com/pic.png', respond: function(d) { data = d; }});
      expect(button).toNotEqual(null);
      expect(data).toEqual({added: true});
    });
  });

  describe('update_manifest', function() {
    it('should respond with not implemented', function() {
      var data = null;
      frame_listener.handle_action({action: 'update_manifest', respond: function(d) { data = d; }});
      expect(data).toEqual({error: 'not implemented'});
    });
  });

  describe('retrieve_object', function() {
    it('should respond with not implemented', function() {
      var data = null;
      frame_listener.handle_action({action: 'update_manifest', respond: function(d) { data = d; }});
      expect(data).toEqual({error: 'not implemented'});
    });
  });

  describe('trigger_target', function() {
    it('should respond to the matching target, matching by dom element', function() {
      var a = null, b = null;
      var d = {};
      frame_listener.set('targets', [
        {dom: d, session_id: 'asdf', id: '123', respond: function(d) { a = d; }},
        {dom: null, session_id: 'qwer', id: '234', respond: function(d) { b = d; }}
      ]);
      frame_listener.trigger_target(d);
      expect(a).toEqual({type: 'select', id: '123'});
      expect(b).toEqual(null);
    });

    it('should respond to the matching target, matching by session and id', function() {
      var a = null, b = null, c = null;
      var d = {};
      frame_listener.set('targets', [
        {dom: d, session_id: 'asdf', id: '123', respond: function(d) { a = d; }},
        {dom: null, session_id: 'qwer', id: '345', respond: function(d) { b = d; }},
        {dom: null, session_id: 'qwer', id: '234', respond: function(d) { c = d; }}
      ]);
      frame_listener.trigger_target({session_id: 'qwer', id: '234'});
      expect(a).toEqual(null);
      expect(b).toEqual(null);
      expect(c).toEqual({type: 'select', id: '234'});
    });
  });

  describe('add_target', function() {
    it('should create a target element and add it to the DOM', function() {
      var target = {
        id: 'asder',
        top_percent: 0.5,
        left_percent: 0.5,
        width_percent: 0.1,
        height_percent: 0.2
      };
      frame_listener.handle_action({
        action: 'add_target',
        target: target
      });
      var targets = frame_listener.get('targets');
      expect(targets.length).toEqual(1);
      expect(targets[0].target).toEqual(target);
      expect(targets[0].dom).toNotEqual(undefined);
      expect(targets[0].dom.style.top).toEqual('50px');
      expect(targets[0].dom.style.left).toEqual('50px');
      expect(targets[0].dom.style.width).toEqual('10px');
      expect(targets[0].dom.style.height).toEqual('20px');
    });

    it('should reset scanning', function() {
      var reset = false;
      var done = false;
      stub(scanner, 'scanning', true);
      stub(scanner, 'reset', function() { reset = true; });
      frame_listener.handle_action({
        action: 'add_target',
        respond: function() { done = true; },
        target: {
          id: 'bob',
          top_percent: 0.1,
          left_percent: 0.1,
          width_percent: 0.1,
          height_percent: 0.1
        }
      });
      waitsFor(function() { return done; });
      runs(function() {
        expect(reset).toEqual(true);
      });
    });

    it('should return an error if missing settings', function() {
      overlay.parentNode.removeChild(overlay);
      var result = null;
      frame_listener.add_target({
        respond: function(res) { result = res; }
      });
      expect(result).toEqual({error: 'target attribute missing'});
    });

    it('should return an error if no overlay found', function() {
      overlay.parentNode.removeChild(overlay);
      var result = null;
      frame_listener.add_target({
        target: {},
        respond: function(res) { result = res; }
      });
      expect(result).toEqual({error: 'not ready'});
    });

    it('should add the target to the tracked list', function() {
      var target = {
        id: 'asder',
        top_percent: 0.5,
        left_percent: 0.5,
        width_percent: 0.1,
        height_percent: 0.2
      };
      frame_listener.handle_action({
        action: 'add_target',
        target: target
      });
      var targets = frame_listener.get('targets');
      expect(targets.length).toEqual(1);
      expect(targets[0].target).toEqual(target);
    });

    it('should respond with the target id', function() {
      var result = null;
      var target = {
        id: 'asder',
        top_percent: 0.5,
        left_percent: 0.5,
        width_percent: 0.1,
        height_percent: 0.2
      };
      frame_listener.handle_action({
        action: 'add_target',
        respond: function(res) { result = res; },
        target: target
      });
      var targets = frame_listener.get('targets');
      expect(targets.length).toEqual(1);
      expect(targets[0].target).toEqual(target);
      expect(result).toEqual({id: 'asder'});
    });
  });

  describe('trigger_target_event', function() {
    it('should call raw_event for any matching sessions', function() {
      document.documentElement.scrollTop = Math.random() * 100;
      var calls = [];
      stub(frame_listener, 'raw_event', function(opts) {
        calls.push(opts);
      });
      frame_listener.trigger_target_event(overlay, 'click', 'select', 'asdf');
      var rect = overlay.getBoundingClientRect();
      expect(calls.length).toEqual(1);
      expect(calls[0]).toEqual({
        session_id: 'asdf',
        type: 'click',
        aac_type: 'select',
        clientX: rect.left + (rect.width / 2),
        clientY: rect.top  + (rect.height / 2)
      });

      frame_listener.trigger_target_event(overlay, 'click', 'select');
      expect(calls.length).toEqual(1);

      frame.setAttribute('data-session_id', 'sessiony');
      frame_listener.trigger_target_event(overlay, 'click', 'select');
      expect(calls.length).toEqual(2);
      expect(calls[1]).toEqual({
        session_id: 'sessiony',
        type: 'click',
        aac_type: 'select',
        clientX: rect.left + (rect.width / 2),
        clientY: rect.top  + (rect.height / 2)
      });
    });
  });

  describe('size_targets', function() {
    it('should resize visible targets based on window size', function() {
      var d = document.createElement('div');
      frame_listener.set('targets', [
        {
          dom: d,
          target: {
            width_percent: 0.25,
            height_percent: 0.2,
            left_percent: 0.1,
            top_percent: 0
          }
        }
      ]);
      frame_listener.size_targets();
      expect(d.style.width).toEqual('25px');
      expect(d.style.height).toEqual('20px');
      expect(d.style.left).toEqual('10px');
      expect(d.style.top).toEqual('0px');
    });
  });

  describe('clear_target', function() {
    it('should clear the specified target, if any', function() {
      var d = document.createElement('div');
      var e = document.createElement('div');
      d.appendChild(e);
      expect(d.children.length).toEqual(1);
      frame_listener.set('targets', [ {},
        {session_id: 'asdf', id: 'bob', dom: e}
      ]);
      frame_listener.handle_action({action: 'clear_target', session_id: 'asdf', id: 'bob'});
      expect(frame_listener.get('targets')).toEqual([{}]);
      expect(d.children.length).toEqual(0);
    });

    it('should remove the target from the DOM', function() {
      var d = document.createElement('div');
      var e = document.createElement('div');
      d.appendChild(e);
      expect(d.children.length).toEqual(1);
      frame_listener.set('targets', [ {},
        {session_id: 'asdf', id: 'bob', dom: e}
      ]);
      frame_listener.handle_action({action: 'clear_target', session_id: 'asdf', id: 'bob'});
      expect(frame_listener.get('targets')).toEqual([{}]);
      expect(d.children.length).toEqual(0);
    });

    it('should respond with the target id', function() {
      var d = document.createElement('div');
      var e = document.createElement('div');
      d.appendChild(e);
      expect(d.children.length).toEqual(1);
      frame_listener.set('targets', [ {},
        {session_id: 'asdf', id: 'bob', dom: e}
      ]);
      var result = null;
      frame_listener.clear_target({session_id: 'asdf', id: 'bob', respond: function(r) { result = r; }});
      expect(frame_listener.get('targets')).toEqual([{}]);
      expect(result).toEqual({cleared: true, id: 'bob'});
    });
  });

  describe('clear_targets', function() {
    it('should clear all targets if specified', function() {
      frame_listener.set('targets', [{}, {}, {}]);
      frame_listener.clear_targets('all');
      expect(frame_listener.get('targets')).toEqual([]);
    });

    it('should remove targets by ids if specified', function() {
      frame_listener.set('targets', [
        {id: '1', session_id: '1'},
        {id: '2', session_id: '1'},
        {id: '1', session_id: '2'}
      ]);
      frame_listener.handle_action({action: 'clear_targets', session_id: '1', ids: ['1']});
      expect(frame_listener.get('targets')).toEqual([
        {id: '2', session_id: '1'},
        {id: '1', session_id: '2'}
      ]);
    });

    it('should remove targets by session_id if no ids specified', function() {
      frame_listener.set('targets', [
        {id: '1', session_id: '1'},
        {id: '2', session_id: '1'},
        {id: '1', session_id: '2'}
      ]);
      frame_listener.handle_action({action: 'clear_targets', session_id: '1'});
      expect(frame_listener.get('targets')).toEqual([
        {id: '1', session_id: '2'}
      ]);
    });

    it('should remove cleared targets from the DOM', function() {
      var d = document.createElement('div');
      var a = document.createElement('div');
      d.appendChild(a);
      var b = document.createElement('div');
      d.appendChild(b);
      var c = document.createElement('div');
      d.appendChild(c);
      expect(d.children.length).toEqual(3);
      frame_listener.set('targets', [
        {id: 'a', session_id: '1', dom: a},
        {id: 'b', session_id: '1', dom: b},
        {id: 'c', session_id: '2', dom: c}
      ]);
      var done = false;
      frame_listener.handle_action({action: 'clear_targets', session_id: '1', respond: function() { done = true; }});
      waitsFor(function() { return done; });
      runs(function() {
        expect(d.children.length).toEqual(1);
        expect(d.children[0]).toEqual(c);
      });
    });

    it('should respond on success', function() {
      var d = document.createElement('div');
      var a = document.createElement('div');
      d.appendChild(a);
      var b = document.createElement('div');
      d.appendChild(b);
      var c = document.createElement('div');
      d.appendChild(c);
      frame_listener.set('targets', [
        {id: 'a', session_id: '1'},
        {id: 'b', session_id: '1'},
        {id: 'c', session_id: '2'}
      ]);
      var result = null;
      frame_listener.handle_action({action: 'clear_targets', session_id: '1', respond: function(r) { result = r; }});
      waitsFor(function() { return result; });
      runs(function() {
        expect(result).toEqual({cleared: true, ids: ['a', 'b']});
      });
    });
  });

  describe('visible', function() {
    it('should return the correct value', function() {
      expect(frame_listener.visible()).toEqual(true);
      overlay.parentNode.removeChild(overlay);
      expect(frame_listener.visible()).toEqual(false);
    });
  });

  describe('active_targets', function() {
    it('should return a list of targets for the current session', function() {
      frame.setAttribute('data-session_id', 'asdf');
      frame_listener.set('targets', [
        {}, {}, {id: 1}, {id: 2}, {id: 3, session_id: 'asdf'}, {id: 4, session_id: 'asdf'}
      ]);
      var res = frame_listener.active_targets();
      expect(res).toEqual([{id: 3, session_id: 'asdf'}, {id: 4, session_id: 'asdf'}]);
    });
  });

  describe('window resizing', function() {
    it('should call size_targets on window resize', function() {
      var sized = false;
      stub(frame_listener, 'size_targets', function() { sized = true; });

      window.dispatchEvent(new window.CustomEvent(
        'resize',
        {
          detail: {
          },
          bubbles: true,
          cancelable: true
        }
      ));

      waitsFor(function() { return sized; });
      runs();
    });
  });

  describe('postMessage handling', function() {
    it('should ignore if not an aac_shim event', function() {
      var responded = false;
      stub(frame_listener, 'respond', function(r) { responded = true; });
      window.postMessage('asdf', '*');
      var waited = false;
      setTimeout(function() { waited = true; }, 200);
      waitsFor(function() { return waited; });
      runs(function() {
        expect(responded).toEqual(false);
      });
    });

    it('should respond with an error if no session_id sent', function() {
      var response = null;
      stub(frame_listener, 'respond', function(source, r) { response = r; });
      window.postMessage({aac_shim: true}, '*');
      waitsFor(function() { return response; });
      runs(function() {
        expect(response).toEqual({callback_id: undefined, aac_shim: true, error: 'session_id required, but not sent'});
      });
    });

    it('should respond with an error if no frame loaded', function() {
      frame.parentNode.removeChild(frame);
      var response = null;
      stub(frame_listener, 'respond', function(source, r) { response = r; });
      window.postMessage({aac_shim: true, session_id: 'asdf'}, '*');
      waitsFor(function() { return response; });
      runs(function() {
        expect(response).toEqual({callback_id: undefined, aac_shim: true, error: 'message came from unknown source'});
      });
    });

    it('should respond with an error if not from the frame', function() {
      var response = null;
      stub(frame_listener, 'session_window', function() { return {}; });
      stub(frame_listener, 'respond', function(source, r) { response = r; });
      window.postMessage({aac_shim: true, session_id: 'asdf'}, '*');
      waitsFor(function() { return response; });
      runs(function() {
        expect(response).toEqual({callback_id: undefined, aac_shim: true, error: 'message came from wrong window'});
      });
    });

    it('should call handle_action with the correct data', function() {
      var response = null;
      stub(frame_listener, 'session_window', function() { return window; });
      stub(frame_listener, 'respond', function(source, r) { response = r; });
      window.postMessage({aac_shim: true, session_id: 'asdf', action: 'status'}, '*');
      waitsFor(function() { return response; });
      runs(function() {
        expect(response).toEqual({callback_id: undefined, aac_shim: true, status: 'ready', session_id: 'asdf', user_token: undefined, code: undefined, system_token: 'LingoLinqAAC'});
      });

    });
  });
});
