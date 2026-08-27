import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import Service from '@ember/service';
import { setupTest } from '../../helpers';
import { SIDE_BY_SIDE, TOP_DOWN } from 'frontend/components/boards-layout-toggle';

/* The Boards-page layout selector (2026-08-16). It reflects its choice as
 * `data-boards-layout` on <body> and persists it in localStorage, so it owns three
 * things worth pinning: the DEFAULT (which is what every user lands on while the
 * feature flag is forced on), the BODY ATTRIBUTE contract the CSS keys off, and the
 * TEARDOWN that stops a stale attribute leaking onto other routes.
 *
 * localStorage is stubbed per test rather than used live — a real write would leak
 * the tester's own layout choice into the suite, and the throw path (Safari private
 * mode, sandboxed iframes) cannot be reproduced any other way.
 */
module('Unit | Component | boards-layout-toggle', function(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function() {
    this._realStorage = window.localStorage;
    this._realAttr = document.body.getAttribute('data-boards-layout');
    // The component injects app-state to read/write the preference. Register a
    // no-user stub by default so the storage-only tests below never touch the real
    // service; withUser() swaps in a stub that has one.
    this.owner.register('service:app-state', Service.extend({ currentUser: null }));
  });

  hooks.afterEach(function() {
    try {
      Object.defineProperty(window, 'localStorage', { value: this._realStorage, configurable: true });
    } catch (e) { /* restoring is best-effort; the stub is per-test anyway */ }
    if (this._realAttr === null) {
      document.body.removeAttribute('data-boards-layout');
    } else {
      document.body.setAttribute('data-boards-layout', this._realAttr);
    }
  });

  function stubStorage(store) {
    Object.defineProperty(window, 'localStorage', { value: store, configurable: true });
  }

  function throwingStorage() {
    return Object.defineProperty({}, 'll_boards_layout', {
      get: function() { throw new Error('SecurityError: localStorage is disabled'); },
      set: function() { throw new Error('SecurityError: localStorage is disabled'); }
    });
  }

  test('defaults to SIDE-BY-SIDE with nothing stored', function(assert) {
    stubStorage({});
    var toggle = this.owner.factoryFor('component:boards-layout-toggle').create();

    assert.strictEqual(toggle.get('layoutMode'), SIDE_BY_SIDE, 'side-by-side is the default');
    assert.true(toggle.get('isSideBySide'), 'isSideBySide agrees');
  });

  test('restores a stored TOP-DOWN choice', function(assert) {
    stubStorage({ ll_boards_layout: TOP_DOWN });
    var toggle = this.owner.factoryFor('component:boards-layout-toggle').create();

    assert.strictEqual(toggle.get('layoutMode'), TOP_DOWN, 'read back from storage');
    assert.false(toggle.get('isSideBySide'), 'isSideBySide agrees');
  });

  test('an unrecognised stored value falls back to SIDE-BY-SIDE', function(assert) {
    stubStorage({ ll_boards_layout: 'sideways' });
    var toggle = this.owner.factoryFor('component:boards-layout-toggle').create();

    assert.strictEqual(toggle.get('layoutMode'), SIDE_BY_SIDE, 'garbage does not become a mode');
  });

  test('unavailable localStorage does not break the component', function(assert) {
    stubStorage(throwingStorage());
    var toggle = this.owner.factoryFor('component:boards-layout-toggle').create();

    assert.strictEqual(toggle.get('layoutMode'), SIDE_BY_SIDE, 'falls back to the default');

    // ...and choosing must still work in-session, just without persisting.
    toggle.actions.choose.call(toggle, TOP_DOWN);
    assert.strictEqual(toggle.get('layoutMode'), TOP_DOWN, 'the toggle still works');
  });

  /* ARROW KEYS. These call the handler the way `{{on}}` actually calls it: detached from
     the component, with `this` set to the element the listener sits on. That is the whole
     bug this pins -- the handler was a bare class-body method, so `this` was the
     <span role="radiogroup">, `this.get(...)` threw, and because preventDefault() had
     already run the arrow was swallowed with nothing happening. With the roving tabindex
     only the CHECKED radio is tabbable, so that left NO keyboard or switch route to the
     other option at all (WCAG 2.1.1).

     Calling `toggle.onGroupKeydown(...)` directly would NOT catch it -- that binds `this`
     for free and passes against the broken code. Detaching is the point. */
  function fakeGroupEl() {
    return {
      querySelector: function() { return { focus: function() {} }; }
    };
  }

  function keydown(key) {
    var prevented = false;
    return {
      key: key,
      currentTarget: fakeGroupEl(),
      preventDefault: function() { prevented = true; },
      wasPrevented: function() { return prevented; }
    };
  }

  ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].forEach(function(key) {
    test(key + ' moves the selection when dispatched the way {{on}} dispatches it',
      function(assert) {
        stubStorage({});
        var toggle = this.owner.factoryFor('component:boards-layout-toggle').create();
        assert.strictEqual(toggle.get('layoutMode'), SIDE_BY_SIDE, 'starts on the default');

        // Detached reference + element `this`, exactly as addEventListener invokes it.
        var handler = toggle.onGroupKeydown;
        var ev = keydown(key);
        handler.call(fakeGroupEl(), ev);

        assert.true(ev.wasPrevented(), 'the arrow key is consumed');
        assert.strictEqual(toggle.get('layoutMode'), TOP_DOWN, key + ' selected the other option');

        // ...and back again, so the group is genuinely two-way by keyboard.
        var back = keydown(key);
        toggle.onGroupKeydown.call(fakeGroupEl(), back);
        assert.strictEqual(toggle.get('layoutMode'), SIDE_BY_SIDE, key + ' selected the first option again');
      });
  });

  test('a non-arrow key is left alone for the browser to handle', function(assert) {
    stubStorage({});
    var toggle = this.owner.factoryFor('component:boards-layout-toggle').create();

    var ev = keydown('Tab');
    toggle.onGroupKeydown.call(fakeGroupEl(), ev);

    assert.false(ev.wasPrevented(), 'Tab is not swallowed');
    assert.strictEqual(toggle.get('layoutMode'), SIDE_BY_SIDE, 'and nothing changed');
  });

  test('choose() reflects the mode onto <body> and persists it', function(assert) {
    var store = {};
    stubStorage(store);
    var toggle = this.owner.factoryFor('component:boards-layout-toggle').create();

    toggle.actions.choose.call(toggle, TOP_DOWN);
    assert.strictEqual(document.body.getAttribute('data-boards-layout'), TOP_DOWN,
      'body attribute is the CSS contract');
    assert.strictEqual(store.ll_boards_layout, TOP_DOWN, 'persisted');

    toggle.actions.choose.call(toggle, SIDE_BY_SIDE);
    assert.strictEqual(document.body.getAttribute('data-boards-layout'), SIDE_BY_SIDE, 'and back');
    assert.strictEqual(store.ll_boards_layout, SIDE_BY_SIDE, 'persisted');
  });

  test('choose() ignores a value that is not a real layout', function(assert) {
    stubStorage({});
    var toggle = this.owner.factoryFor('component:boards-layout-toggle').create();
    toggle.actions.choose.call(toggle, TOP_DOWN);

    toggle.actions.choose.call(toggle, 'diagonal');

    assert.strictEqual(toggle.get('layoutMode'), TOP_DOWN, 'unchanged by a junk value');
  });

  /* The USER PREFERENCE is the reason the choice survives a new login, so these are the
     tests that matter most: localStorage is per-device and proves nothing about that. */
  function withUser(owner, prefs) {
    var saves = [];
    var user = EmberObject.create({
      preferences: prefs || {},
      save: function() { saves.push(JSON.parse(JSON.stringify(this.get('preferences')))); return Promise.resolve(this); }
    });
    // beforeEach already registered a no-user stub; replace it.
    owner.unregister('service:app-state');
    owner.register('service:app-state', Service.extend({ currentUser: user }));
    return { user: user, saves: saves };
  }

  test('a stored TOP-DOWN preference wins over the default', function(assert) {
    stubStorage({});
    withUser(this.owner, { boards_layout: TOP_DOWN });
    var toggle = this.owner.factoryFor('component:boards-layout-toggle').create();

    assert.strictEqual(toggle.get('layoutMode'), TOP_DOWN, 'preference drives the layout');
  });

  test('the PREFERENCE beats a disagreeing localStorage — this is the new-login case', function(assert) {
    // Chose top-down elsewhere; this browser last remembered side-by-side.
    stubStorage({ ll_boards_layout: SIDE_BY_SIDE });
    withUser(this.owner, { boards_layout: TOP_DOWN });
    var toggle = this.owner.factoryFor('component:boards-layout-toggle').create();

    assert.strictEqual(toggle.get('layoutMode'), TOP_DOWN,
      'the user preference, not the device cache, decides');
  });

  test('no preference falls back to localStorage, then to SIDE-BY-SIDE', function(assert) {
    stubStorage({ ll_boards_layout: TOP_DOWN });
    withUser(this.owner, {});
    var toggle = this.owner.factoryFor('component:boards-layout-toggle').create();
    assert.strictEqual(toggle.get('layoutMode'), TOP_DOWN, 'device cache covers first paint');

    stubStorage({});
    var fresh = this.owner.factoryFor('component:boards-layout-toggle').create();
    assert.strictEqual(fresh.get('layoutMode'), SIDE_BY_SIDE, 'and the default backstops both');
  });

  test('choosing TOP-DOWN persists it to the user', function(assert) {
    assert.expect(4);
    stubStorage({});
    var ctx = withUser(this.owner, {});
    var toggle = this.owner.factoryFor('component:boards-layout-toggle').create();

    toggle.actions.choose.call(toggle, TOP_DOWN);

    assert.strictEqual(ctx.user.get('preferences.boards_layout'), TOP_DOWN, 'preference set');
    assert.true(ctx.user.get('preferences.device.updated'),
      'device dirty bit bumped so the blob actually serializes');
    return toggle._lastSave.then(function() {
      assert.strictEqual(ctx.saves.length, 1, 'saved once');
      assert.strictEqual(ctx.saves[0].boards_layout, TOP_DOWN, 'with the chosen value');
    });
  });

  test('re-choosing the SAME mode does not save again', function(assert) {
    assert.expect(2);
    stubStorage({});
    var ctx = withUser(this.owner, { boards_layout: TOP_DOWN });
    var toggle = this.owner.factoryFor('component:boards-layout-toggle').create();

    toggle.actions.choose.call(toggle, TOP_DOWN);

    assert.notOk(toggle._lastSave, 'no save was even queued');
    return Promise.resolve().then(function() {
      assert.strictEqual(ctx.saves.length, 0, 'no redundant write');
    });
  });

  test('rapid toggling serializes saves instead of racing them', function(assert) {
    assert.expect(3);
    stubStorage({});
    var ctx = withUser(this.owner, {});
    var toggle = this.owner.factoryFor('component:boards-layout-toggle').create();

    toggle.actions.choose.call(toggle, TOP_DOWN);
    toggle.actions.choose.call(toggle, SIDE_BY_SIDE);
    toggle.actions.choose.call(toggle, TOP_DOWN);

    return toggle._lastSave.then(function() {
      assert.strictEqual(ctx.saves.length, 3, 'every choice saved, one at a time');
      assert.strictEqual(ctx.saves[ctx.saves.length - 1].boards_layout, TOP_DOWN,
        'the LAST choice is what persisted — no out-of-order overwrite');
      assert.strictEqual(ctx.user.get('preferences.boards_layout'), TOP_DOWN, 'record agrees');
    });
  });

  test('a preference arriving after render adopts it', function(assert) {
    // Fresh login, cold cache: the component renders before the user hydrates.
    stubStorage({});
    var ctx = withUser(this.owner, {});
    var toggle = this.owner.factoryFor('component:boards-layout-toggle').create();
    assert.strictEqual(toggle.get('layoutMode'), SIDE_BY_SIDE, 'starts on the default');

    ctx.user.set('preferences', { boards_layout: TOP_DOWN });

    assert.strictEqual(toggle.get('layoutMode'), TOP_DOWN, 'adopts the late preference');
    assert.strictEqual(document.body.getAttribute('data-boards-layout'), TOP_DOWN,
      'and reflects it onto <body>');
  });

  test('no user (logged out / offline) still works device-locally', function(assert) {
    var store = {};
    stubStorage(store);
    this.owner.register('service:app-state', Service.extend({ currentUser: null }));
    var toggle = this.owner.factoryFor('component:boards-layout-toggle').create();

    toggle.actions.choose.call(toggle, TOP_DOWN);

    assert.strictEqual(toggle.get('layoutMode'), TOP_DOWN, 'the toggle still works');
    assert.strictEqual(store.ll_boards_layout, TOP_DOWN, 'and still caches on the device');
  });

  test('teardown removes the body attribute so other routes do not inherit it', function(assert) {
    stubStorage({});
    var toggle = this.owner.factoryFor('component:boards-layout-toggle').create();
    toggle.actions.choose.call(toggle, SIDE_BY_SIDE);
    assert.strictEqual(document.body.getAttribute('data-boards-layout'), SIDE_BY_SIDE, 'set while alive');

    toggle.willDestroyElement();

    assert.strictEqual(document.body.getAttribute('data-boards-layout'), null, 'cleared on teardown');
  });
});
