import { module, test } from 'qunit';
import RSVP from 'rsvp';
import $ from 'jquery';
import { setupTest } from '../../helpers';
import modal from 'frontend/utils/modal';
import buttonTracker from 'frontend/utils/raw_events';
import scanner from 'frontend/utils/scanner';
import editManager from 'frontend/utils/edit_manager';
import persistence from 'frontend/utils/persistence';
import LingoLinq from 'frontend/app';

/*
 * Escape on an open modal. The document listener (utils/raw_events.js) and
 * modal-dialog keyDown both see the same key. keyDown runs first, on the way
 * up to document. These tests call keyDown, then deliver the event to the
 * document listener unless keyDown stopped it. That is the bubble order.
 *
 * A caller that does its work in .then(function() {}) with no result check
 * must not run when the user presses Escape. Uncloseable dialogs stay open.
 * Dismissing must not wipe the speak-mode utterance (:clear). A switch whose
 * cancel key is Escape must still reach scanner.escape().
 */

module('Unit | modal escape dismissal', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this.service = this.owner.lookup('service:modal');
    this.savedModal = {
      route: modal.route,
      last_promise: modal.last_promise,
      last_template: modal.last_template,
      component_based: modal._component_based_template,
      close: modal.close
    };
    this.savedTracker = {
      appState: buttonTracker.appState,
      keyboard_listen: buttonTracker.keyboard_listen,
      scanning_enabled: buttonTracker.scanning_enabled,
      cancel_keycode: buttonTracker.cancel_keycode
    };
    this.savedEscape = scanner.escape;
    this.savedService = {
      currentTemplate: this.service.get('currentTemplate'),
      currentPromise: this.service.get('currentPromise'),
      queuedTemplate: this.service.get('queuedTemplate'),
      resumeScanning: this.service.get('resumeScanning')
    };
    this.service.set('currentTemplate', null);
    this.service.set('currentPromise', null);
    this.service.set('queuedTemplate', null);
    this.service.set('resumeScanning', false);
    this.dialogs = [];
    var appRoute = this.owner.lookup('route:application');
    if (appRoute) {
      modal.route = appRoute;
    } else if (!modal.route) {
      modal.route = { render: function() {} };
    }
  });

  hooks.afterEach(function() {
    this.dialogs.forEach(function(component) {
      if (component && !component.isDestroyed) {
        component.destroy();
      }
    });
    document.querySelectorAll('[data-test-escape-modal]').forEach(function(node) {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    });
    modal.route = this.savedModal.route;
    modal.last_promise = this.savedModal.last_promise;
    modal.last_template = this.savedModal.last_template;
    modal._component_based_template = this.savedModal.component_based;
    modal.close = this.savedModal.close;
    modal.dialog_ate_escape = false;
    modal.skip_clear_for_escape = false;
    buttonTracker.appState = this.savedTracker.appState;
    buttonTracker.keyboard_listen = this.savedTracker.keyboard_listen;
    buttonTracker.scanning_enabled = this.savedTracker.scanning_enabled;
    buttonTracker.cancel_keycode = this.savedTracker.cancel_keycode;
    scanner.escape = this.savedEscape;
    this.service.set('currentTemplate', this.savedService.currentTemplate);
    this.service.set('currentPromise', this.savedService.currentPromise);
    this.service.set('queuedTemplate', this.savedService.queuedTemplate);
    this.service.set('resumeScanning', this.savedService.resumeScanning);
  });

  function flush() {
    return new Promise(function(resolve) { setTimeout(resolve, 0); });
  }

  function openShell(uncloseable) {
    var shell = document.createElement('div');
    shell.className = 'modal';
    shell.setAttribute('data-test-escape-modal', 'true');
    if (uncloseable) {
      shell.setAttribute('data-uncloseable', 'true');
    }
    document.body.insertBefore(shell, document.body.firstChild);
    modal.last_template = null;
    modal._component_based_template = 'example-modal';
    return shell;
  }

  function dialogFor(testContext, options) {
    var component = testContext.owner.factoryFor('component:modal-dialog').create({
      uncloseable: !!(options && options.uncloseable),
      action: options && options.action
    });
    var shell = openShell(options && options.uncloseable);
    Object.defineProperty(component, 'element', { configurable: true, value: shell });
    testContext.dialogs.push(component);
    return component;
  }

  function pressEscape(target, component) {
    var event = $.Event('keydown', { keyCode: 27, code: 'Escape', key: 'Escape', bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { configurable: true, value: target || document.body });
    if (component) {
      component.keyDown(event);
    }
    if (!event.isPropagationStopped()) {
      $(document).trigger(event);
    }
    return event;
  }

  function trackCaller() {
    var outcome = { status: 'pending', worked: false };
    var caller = new RSVP.Promise(function(resolve, reject) {
      modal.last_promise = { resolve: resolve, reject: reject };
    });
    caller.then(function() {
      outcome.status = 'resolved';
      outcome.worked = true;
    }, function(error) {
      outcome.status = 'rejected';
      outcome.error = error;
    });
    return outcome;
  }

  function speakMode() {
    buttonTracker.appState = {
      get: function(key) {
        return key === 'speak_mode';
      },
      activate_button: function(button) {
        speakMode.calls.push(button && button.vocalization);
      }
    };
    speakMode.calls = [];
    buttonTracker.keyboard_listen = true;
  }

  test('focus outside a closeable modal rejects Escape so an unchecked then does not run', async function(assert) {
    assert.expect(2);
    var outcome = trackCaller();
    openShell(false);
    pressEscape(document.body, null);
    await flush();
    assert.strictEqual(outcome.status, 'rejected', 'Escape is a rejection, the same result as close(false)');
    assert.false(outcome.worked, 'a then with no result check must not run');
  });

  function linkCaller(service) {
    var outcome = { status: 'pending', worked: false };
    var servicePromise = new RSVP.Promise(function(resolve, reject) {
      service.set('currentPromise', { resolve: resolve, reject: reject });
    });
    var wrapped = new RSVP.Promise(function(resolve, reject) {
      modal.last_promise = { resolve: resolve, reject: reject };
    });
    servicePromise.then(function(result) {
      if (modal.last_promise) { modal.last_promise.resolve(result); }
    }, function(error) {
      if (modal.last_promise) { modal.last_promise.reject(error); }
    });
    wrapped.then(function() {
      outcome.status = 'resolved';
      outcome.worked = true;
    }, function(error) {
      outcome.status = 'rejected';
      outcome.error = error;
    });
    return outcome;
  }

  test('focus inside a closeable modal closes once and rejects', async function(assert) {
    assert.expect(4);
    var service = this.service;
    var outcome = linkCaller(service);
    var closes = [];
    var realUtilClose = modal.close;
    var realServiceClose = service.close;
    function count(kind, success, outlet) {
      if (outlet === 'highlight' || outlet === 'highlight-secondary') { return; }
      closes.push(kind);
    }
    modal.close = function(success, outlet) {
      count('util', success, outlet);
      return realUtilClose.call(modal, success, outlet);
    };
    service.close = function(success, outlet) {
      count('service', success, outlet);
      return realServiceClose.call(service, success, outlet);
    };
    var actionCalled = false;
    var button = document.createElement('button');
    button.type = 'button';
    var component = dialogFor(this, {
      action: function() {
        actionCalled = true;
        service.close();
      }
    });
    component.element.appendChild(button);
    try {
      pressEscape(button, component);
      await flush();
    } finally {
      service.close = realServiceClose;
      modal.close = realUtilClose;
    }
    assert.true(actionCalled, 'the dialog close action still runs');
    assert.deepEqual(closes, ['service'], 'the document handler must not close the modal a second time');
    assert.strictEqual(outcome.status, 'rejected');
    assert.false(modal.is_open(), 'a service close must not leave the modal reported open');
  });

  test('a service close(false) stays a rejection after Escape reaches the document', async function(assert) {
    assert.expect(1);
    var service = this.service;
    var outcome = { status: 'pending' };
    var servicePromise = new RSVP.Promise(function(resolve, reject) {
      service.set('currentPromise', { resolve: resolve, reject: reject });
    });
    var wrapped = new RSVP.Promise(function(resolve, reject) {
      modal.last_promise = { resolve: resolve, reject: reject };
    });
    servicePromise.then(function(result) {
      modal.last_promise && modal.last_promise.resolve(result);
    }, function(error) {
      modal.last_promise && modal.last_promise.reject(error);
    });
    wrapped.then(function() {
      outcome.status = 'resolved';
    }, function() {
      outcome.status = 'rejected';
    });
    service.set('currentTemplate', 'copy-board');
    var button = document.createElement('button');
    button.type = 'button';
    var component = dialogFor(this, {
      action: function() {
        service.close(false);
      }
    });
    component.element.appendChild(button);
    pressEscape(button, component);
    await flush();
    assert.strictEqual(outcome.status, 'rejected', 'the document handler must not resolve a cancel');
  });

  test('an uncloseable modal ignores Escape and leaves the promise pending', async function(assert) {
    assert.expect(3);
    var outcome = trackCaller();
    var escapes = 0;
    var actionCalled = false;
    scanner.escape = function() { escapes = escapes + 1; };
    speakMode();
    buttonTracker.scanning_enabled = true;
    buttonTracker.cancel_keycode = 27;
    var button = document.createElement('button');
    button.type = 'button';
    var component = dialogFor(this, {
      uncloseable: true,
      action: function() { actionCalled = true; }
    });
    component.element.appendChild(button);
    pressEscape(button, component);
    await flush();
    assert.strictEqual(outcome.status, 'pending');
    assert.false(actionCalled, 'Escape does not activate the close action');
    assert.strictEqual(escapes, 1, 'switch cancel still reaches scanner.escape()');
  });

  test('dismissing a modal does not clear the speak-mode utterance', async function(assert) {
    assert.expect(4);
    var outcome = trackCaller();
    var actionCalled = false;
    speakMode();
    buttonTracker.scanning_enabled = false;
    var button = document.createElement('button');
    button.type = 'button';
    var component = dialogFor(this, {
      action: function() {
        actionCalled = true;
        modal.close();
      }
    });
    component.element.appendChild(button);
    pressEscape(button, component);
    await flush();
    assert.true(actionCalled);
    assert.strictEqual(outcome.status, 'rejected');
    assert.deepEqual(speakMode.calls, [], 'Escape that dismisses a modal must not activate :clear');
    assert.false(modal.is_open(), 'dismissing the modal must not leave it reported open');
  });

  test('Escape inside a closeable modal still reaches scanner.escape and rejects', async function(assert) {
    assert.expect(2);
    var outcome = trackCaller();
    var escapes = 0;
    scanner.escape = function() { escapes = escapes + 1; };
    speakMode();
    buttonTracker.scanning_enabled = true;
    buttonTracker.cancel_keycode = 27;
    var button = document.createElement('button');
    button.type = 'button';
    var component = dialogFor(this, {
      action: function() {
        modal.close();
      }
    });
    component.element.appendChild(button);
    pressEscape(button, component);
    await flush();
    assert.strictEqual(outcome.status, 'rejected');
    assert.strictEqual(escapes, 1, 'the dialog must not swallow the cancel key');
  });

  test('a saved batch recording still reloads the board when Escape rejects the dialog', async function(assert) {
    assert.expect(4);
    var reloads = [];
    var model = {
      board: { id: '1_9' },
      reload: function() {
        reloads.push('model');
        return RSVP.resolve(model);
      },
      load_button_set: function(force) {
        reloads.push(force === true ? 'button-set' : 'button-set-soft');
        return RSVP.resolve();
      }
    };
    var actions = this.owner.factoryFor('component:board-actions').create();
    actions.set('model', model);
    actions.set('appState', this.owner.lookup('service:app-state'));
    this.dialogs.push(actions);
    // The unit owner does not give the modal service a writable settingsFor,
    // so the real open() throws before it returns a promise. Install the same
    // promise the service close rejects, and let the real Escape path settle it.
    var liveModal = modal._getService() || this.service;
    var opened = [];
    var realOpen = modal.open;
    modal.open = function(name) {
      opened.push(name);
      var deferred = RSVP.defer();
      liveModal.set('currentTemplate', name);
      liveModal.set('currentPromise', deferred);
      modal._component_based_template = name;
      modal.last_promise = deferred;
      return deferred.promise;
    };
    try {
      actions.send('batch_recording');
    } finally {
      modal.open = realOpen;
    }
    assert.deepEqual(opened, ['batch-recording'], 'board actions opened the recording dialog');

    var recorder = this.owner.factoryFor('component:batch-recording').create({
      phrase: { button_id: 1, board_id: '1_9' }
    });
    this.dialogs.push(recorder);
    recorder.set('modal', liveModal);
    recorder._return_to_details = function() {};
    var ajaxHost = window.persistence || persistence;
    var savedAjax = ajaxHost.ajax;
    var savedStore = LingoLinq.store;
    var savedDisplay = editManager.process_for_displaying;
    ajaxHost.ajax = function() {
      return RSVP.resolve({ board: { id: '1_9' } });
    };
    LingoLinq.store = {
      findRecord: function() {
        return RSVP.resolve({ reload: function() { return RSVP.resolve(); } });
      }
    };
    editManager.process_for_displaying = function() {
      reloads.push('display');
    };
    var sound = { id: 'sound-1', get: function(key) { return sound[key]; } };
    try {
      recorder.save_to_button(sound);
      await flush();
      assert.strictEqual(recorder.get('phrase.saved_sound_id'), 'sound-1', 'the sound is saved before Escape');
      assert.deepEqual(reloads, [], 'saving inside the dialog does not reload the open board');
      var button = document.createElement('button');
      button.type = 'button';
      var component = dialogFor(this, {
        action: function() {
          // components/batch-recording.js close() calls the service with no value.
          recorder.send('close');
        }
      });
      component.element.appendChild(button);
      pressEscape(button, component);
      await flush();
      await flush();
    } finally {
      ajaxHost.ajax = savedAjax;
      LingoLinq.store = savedStore;
      editManager.process_for_displaying = savedDisplay;
    }
    assert.deepEqual(reloads, ['model', 'button-set', 'display'], 'Escape after a saved recording reloads the board the user is speaking');
  });
});
