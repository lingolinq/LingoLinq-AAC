import {
  describe,
  it,
  expect,
  beforeEach
} from 'frontend/tests/helpers/jasmine';
import 'frontend/tests/helpers/ember_helper';
import EmberObject from '@ember/object';

/*
 * board-preview-canvas component coverage — Scot #3 (High) + #5 (High)
 * pre-merge review.
 *
 * The component draws an entire board grid into a real <canvas> element
 * via the 2D context API. Two specific behaviors added in this PR cycle
 * NEED test coverage so they cannot silently regress:
 *
 *   1. Offline indicator (Scot #5): when persistence.online === false,
 *      a modern "Offline" pill is drawn in the top-right corner of the
 *      canvas. The pre-fix behavior rendered blank cells with no offline
 *      indication — visually indistinguishable from a bug.
 *
 *   2. Per-cell image fallback (Scot #5): when an `img.onerror` fires
 *      for a cell's symbol URL, a subtle placeholder + broken-image
 *      glyph is drawn into the cell's image area instead of leaving
 *      empty white space.
 *
 * Testing strategy: stub the canvas's 2D context with a recorder that
 * captures every method call and property write. We then drive the
 * draw via render_canvas() and assert on what got recorded. This
 * avoids both Mirage (which currently hangs per acceptance/board-detail-
 * empty-state-test.js TODO) and full DOM rendering — matches the legacy
 * Jasmine style used throughout this codebase.
 *
 * See docs/task-management/2026-05-27-pr281-test-coverage.md.
 */
describe('BoardPreviewCanvasComponent', 'component:board-preview-canvas', function() {
  var testOwner;

  beforeEach(function() {
    testOwner = this.owner;
  });

  /* Build a stub 2D context that records every method call + every
     fillStyle/strokeStyle assignment. Returns the stub itself plus a
     `calls` array (name + args per invocation) and a `styles` array
     (sequence of fillStyle/strokeStyle/font writes). Methods return
     sensible defaults so the draw code never trips on undefined. */
  function buildContextStub() {
    var calls = [];
    var styles = [];
    var record = function(name) {
      return function() {
        calls.push({ name: name, args: Array.prototype.slice.call(arguments) });
      };
    };
    var stub = {
      calls: calls,
      styles: styles,
      // Drawing ops the render path actually invokes.
      save: record('save'),
      restore: record('restore'),
      clearRect: record('clearRect'),
      fillRect: record('fillRect'),
      beginPath: record('beginPath'),
      closePath: record('closePath'),
      moveTo: record('moveTo'),
      lineTo: record('lineTo'),
      arc: record('arc'),
      fill: record('fill'),
      stroke: record('stroke'),
      fillText: record('fillText'),
      drawImage: record('drawImage'),
      // Returns measure proxy with usable width.
      measureText: function(t) { return { width: (t || '').length * 7 }; },
      // Gradient stub mirrors the createLinearGradient API surface used.
      createLinearGradient: function() {
        return { addColorStop: function() {} };
      }
    };
    // Property-setter recording for shadow + style assignments.
    ['fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin',
     'shadowOffsetX', 'shadowOffsetY', 'shadowBlur', 'shadowColor',
     'font', 'textAlign', 'textBaseline'].forEach(function(prop) {
      var current = null;
      Object.defineProperty(stub, prop, {
        configurable: true,
        get: function() { return current; },
        set: function(v) { current = v; styles.push({ prop: prop, value: v }); }
      });
    });
    return stub;
  }

  /* Build a stub board with the minimal surface the draw method needs.
     Returns an EmberObject so .get(...) works. */
  function buildBoard() {
    return EmberObject.create({
      id: '1_42',
      get: function(key) {
        if(key === 'grid.rows') { return 2; }
        if(key === 'grid.columns') { return 2; }
        if(key === 'grid.order') { return [[null, null], [null, null]]; }
        if(key === 'image_urls') { return {}; }
        if(key === 'has_background') { return false; }
        return EmberObject.prototype.get.call(this, key);
      },
      translated_buttons: function() { return []; },
      variant_image_urls: function() { return {}; }
    });
  }

  function setupCanvasComponent(persistence_online) {
    var component = testOwner.factoryFor('component:board-preview-canvas').create();
    var ctxStub = buildContextStub();
    // Fake canvas element returning our context stub.
    var fakeCanvas = {
      getContext: function() { return ctxStub; },
      setAttribute: function() {},
      getBoundingClientRect: function() { return { width: 400, height: 300 }; }
    };
    // Fake host element exposing the canvas via getElementsByTagName.
    component.set('element', {
      getElementsByTagName: function(tag) {
        return tag === 'canvas' ? [fakeCanvas] : [];
      }
    });
    component.set('persistence', EmberObject.create({
      online: persistence_online,
      url_cache: {},
      url_uncache: {}
    }));
    component.set('appState', EmberObject.create({
      get: function(key) {
        if(key === 'currentUser.preferences.skin') { return null; }
        if(key === 'currentUser.preferences.preferred_symbols') { return 'original'; }
        return null;
      }
    }));
    component.set('board', buildBoard());
    component.set('dark_mode', false);
    return { component: component, ctx: ctxStub };
  }

  describe('offline indicator (Scot #5)', function() {
    it('draws an "Offline" pill in the top-right corner when persistence.online is false', function() {
      var setup = setupCanvasComponent(false);
      setup.component.render_canvas();

      // The badge calls fillText('Offline', ...) — find that call.
      var offlineFill = setup.ctx.calls.find(function(c) {
        return c.name === 'fillText' && c.args[0] === 'Offline';
      });
      expect(offlineFill).not.toEqual(undefined);
    });

    it('does NOT draw the badge when persistence.online is true (default-state preview)', function() {
      var setup = setupCanvasComponent(true);
      setup.component.render_canvas();

      var offlineFill = setup.ctx.calls.find(function(c) {
        return c.name === 'fillText' && c.args[0] === 'Offline';
      });
      expect(offlineFill).toEqual(undefined);
    });

    it('uses modern pill design — sets a linear gradient fill on the badge', function() {
      var setup = setupCanvasComponent(false);
      var gradient_created = false;
      // Wrap createLinearGradient to confirm it was called for the badge.
      var orig = setup.ctx.createLinearGradient;
      setup.ctx.createLinearGradient = function() {
        gradient_created = true;
        return orig.apply(setup.ctx, arguments);
      };
      setup.component.render_canvas();

      // The badge applies a glass-veil gradient via createLinearGradient
      // (modern pill design per LEARNINGS atmospheric-depth pattern).
      expect(gradient_created).toEqual(true);
    });

    it('paints the badge with a drop shadow (atmospheric depth)', function() {
      var setup = setupCanvasComponent(false);
      setup.component.render_canvas();

      // Per the atmospheric-depth recipe the badge sets shadowBlur and
      // shadowOffsetY before its first fill — that's how the "ambient
      // haze" tier is approximated on canvas (canvas can't stack three
      // shadows). Confirm at least one non-zero shadowBlur write occurred.
      var hadShadowBlur = setup.ctx.styles.some(function(s) {
        return s.prop === 'shadowBlur' && s.value > 0;
      });
      expect(hadShadowBlur).toEqual(true);
    });
  });

  describe('trace_rounded_rect (Cordova-WebView safety)', function() {
    it('renders without invoking context.roundRect (older WebViews lack it)', function() {
      var setup = setupCanvasComponent(false);
      // Force a failure if roundRect is ever called — older Cordova
      // WebViews crash on this. See LEARNINGS "context.roundRect is a
      // Cordova-WebView landmine" pattern.
      setup.ctx.roundRect = function() {
        throw new Error('context.roundRect must not be used — fails in older Cordova WebViews');
      };
      var threw = false;
      try {
        setup.component.render_canvas();
      } catch(e) {
        threw = true;
      }
      expect(threw).toEqual(false);
    });
  });
});
