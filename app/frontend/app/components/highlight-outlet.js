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
    var settings = this.get('settings');
    if(settings) {
      ctrl.set('model', settings);
      return;
    }
    if(ctrl.get('model') && ctrl.closing) {
      ctrl.closing();
    }
    ctrl.set('model', null);
  }),

  init() {
    this._super(...arguments);
    this.syncHighlightControllerModel();

    this.openingHandler = () => {
      var ctrl = this.get('highlightController');
      if(!ctrl || !this.get('settings')) { return; }
      if(ctrl.opening) {
        ctrl.opening();
      }
    };
    this.closingHandler = () => {
      var ctrl = this.get('highlightController');
      if(!ctrl || !ctrl.closing) { return; }
      ctrl.closing();
    };
    this.selectReleaseHandler = (event) => {
      var ctrl = this.get('highlightController');
      if(!ctrl) { return; }
      ctrl.send('select_release', event);
    };
    this.closeHighlight = () => {
      var ctrl = this.get('highlightController');
      if(!ctrl) { return; }
      ctrl.send('close');
    };
    this.selectHighlight = () => {
      var ctrl = this.get('highlightController');
      if(!ctrl) { return; }
      ctrl.send('select');
    };
  }
});
