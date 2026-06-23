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

  syncHighlightControllerModel: observer('settings', 'highlightController', function() {
    var ctrl = this.get('highlightController');
    if(!ctrl) { return; }
    ctrl.set('model', this.get('settings'));
  }),

  init() {
    this._super(...arguments);
    this.syncHighlightControllerModel();

    this.openingHandler = () => {
      this.get('highlightController').send('opening');
    };
    this.closingHandler = () => {
      this.get('highlightController').send('closing');
    };
    this.selectReleaseHandler = (event) => {
      this.get('highlightController').send('select_release', event);
    };
    this.closeHighlight = () => {
      this.get('highlightController').send('close');
    };
    this.selectHighlight = () => {
      this.get('highlightController').send('select');
    };
  }
});
