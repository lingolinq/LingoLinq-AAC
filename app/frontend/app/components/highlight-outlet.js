import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
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

  highlightController: computed('settings', 'secondary', function() {
    var settings = this.get('settings');
    if (!settings) { return null; }
    var owner = getOwner(this);
    var key = this.get('secondary') ? 'controller:highlight2' : 'controller:highlight';
    var ctrl = owner.lookup(key);
    ctrl.set('model', settings);
    return ctrl;
  }),
});
