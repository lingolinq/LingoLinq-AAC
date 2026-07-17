import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { alias } from '@ember/object/computed';
import modalUtil from '../utils/modal';

/**
 * About LingoLinq Modal Component
 * 
 * This is a converted modal template to component for testing the new service-based system.
 * Other modals will be converted incrementally.
 */
export default Component.extend({
  appState: service('app-state'),
  // Alias for template compatibility (template uses this.app_state)
  app_state: alias('appState'),
  modal: service('modal'),
  tagName: '',
  
  init() {
    this._super(...arguments);
    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };

    // Get options from service or passed model
    const modal = this.get('modal');
    const template = 'about-lingolinq';
    const options = (modal && modal.getSettingsFor && modal.getSettingsFor(template)) || 
                    (modal && modal.settingsFor && modal.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },
  
  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      // Opening lifecycle handled by service
      const component = this;
      this.get('modal').setComponent(component);
    },
    closing() {
      // Closing lifecycle
    }
  },

  didInsertElement() {
  this._super(...arguments);
  var self = this;
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
    this.onClosing = function() { self.send('closing'); };
},

});
