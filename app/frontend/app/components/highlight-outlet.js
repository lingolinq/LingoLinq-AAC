import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed, observer } from '@ember/object';
import { getOwner } from '@ember/application';

/**
 * Renders highlight overlays without deprecated named outlets / route.render().
 * @secondary — when true, renders the secondary (scanning) highlight layer.
 */
export default Component.extend({
  modalService: service('modal'),
  secondary: false,
  tagName: '',

  settings: computed('modalService.highlightModel', 'modalService.highlight2Model', 'secondary', function() {
    return this.get('secondary')
      ? this.get('modalService.highlight2Model')
      : this.get('modalService.highlightModel');
  }),

  highlightController: computed('secondary', function() {
    var owner = getOwner(this);
    var key = this.get('secondary') ? 'controller:highlight2' : 'controller:highlight';
    return owner.lookup(key);
  }),

  // `opening`/`closing` are plain controller lifecycle methods (NOT in its
  // `actions` hash), so they can't be reached via `(action "name" target=…)` —
  // that routes through `send`, which only finds actions-hash entries. And
  // Ember 4.x rejects the legacy `(action someObject "name")` object-first form
  // the template used. So expose them as functions the opening-observer can call
  // directly (it invokes `this.opening()` / `this.closing()`).
  boundOpening: computed('highlightController', function() {
    var ctrl = this.get('highlightController');
    return ctrl ? function() { ctrl.opening(); } : undefined;
  }),
  boundClosing: computed('highlightController', function() {
    var ctrl = this.get('highlightController');
    return ctrl ? function() { ctrl.closing(); } : undefined;
  }),

  syncHighlightControllerModel: observer('settings', 'highlightController', function() {
    var ctrl = this.get('highlightController');
    if(!ctrl) { return; }
    ctrl.set('model', this.get('settings'));
  }),

  init() {
    this._super(...arguments);
    this.syncHighlightControllerModel();
  }
});
