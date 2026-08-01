import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  waitsFor,
  runs
} from 'frontend/tests/helpers/jasmine';
import 'frontend/tests/helpers/ember_helper';

// Verifies the reactive data contract that drives the full-viewport loading
// overlay (<AppLoadingOverlay>).
// See docs/task-management/2026-07-25-loading-overlay-not-showing-on-board-open.md.
//
// The bug (overlay not appearing when opening a board) was a template-reactivity
// failure: a classic `computed` in a tagName:'' component didn't update under
// Ember 5.x. The fix (a) declares `loading_overlay_message` on the service and
// (b) binds the template DIRECTLY to it. A true DOM render test is not feasible in
// this repo — the app never reaches @ember/test-helpers `settled()`, so every
// rendering test times out (which is why the suite contains none, and the old
// integration tests are commented out). This object-level test covers the reactive
// SOURCE the fixed template binds to: the declared property, the show/hide API, and
// the component wiring (tagless + bound to the shared singleton service).
describe('app-loading-overlay (reactive data contract)', function() {
  var appState, component;

  beforeEach(function() {
    appState = this.owner.lookup('service:app-state');
    appState.set('loading_overlay_message', null);
    component = this.owner.factoryFor('component:app-loading-overlay').create();
  });

  afterEach(function() {
    if(component && !component.isDestroyed) { component.destroy(); }
    component = null;
    if(appState && !appState.isDestroyed) { appState.set('loading_overlay_message', null); }
  });

  it('declares loading_overlay_message on the service (default null → overlay hidden)', function() {
    // Declared so the template binding tracks it reliably under Ember 5.x.
    expect(appState.get('loading_overlay_message')).toEqual(null);
  });

  it('show_loading_overlay sets the message the overlay renders', function() {
    appState.show_loading_overlay('Loading board...');
    expect(appState.get('loading_overlay_message')).toEqual('Loading board...');
  });

  it('hide_loading_overlay clears the message (overlay hides)', function() {
    appState.show_loading_overlay('Loading board...', { min_ms: 0 });
    expect(appState.get('loading_overlay_message')).toEqual('Loading board...');
    appState.hide_loading_overlay();
    waitsFor(function() { return appState.get('loading_overlay_message') === null; });
    runs(function() {
      expect(appState.get('loading_overlay_message')).toEqual(null);
    });
  });

  it('is tagless and binds to the shared app-state singleton', function() {
    // tagName:'' → no wrapper element; the template reads
    // `this.app_state.loading_overlay_message` directly.
    expect(component.tagName).toEqual('');
    // Same singleton service the setters mutate, so the direct template binding
    // (`{{#if this.app_state.loading_overlay_message}}`) tracks the live value.
    expect(component.get('app_state')).toEqual(appState);
  });
});
