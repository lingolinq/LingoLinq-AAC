import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import i18n from '../utils/i18n';
import stashes from '../utils/_stashes';

/**
 * Choose Locale Modal Component
 *
 * Converted from modals/choose-locale template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
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

    const modalService = this.get('modal');
    const template = 'modals/choose-locale';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.set('lang', stashes.get('display_lang'));
  },

  locales: computed(function() {
    const list = i18n.locales_translated || ['en'];
    return list.map(function(loc) {
      const auto_translated = loc.match(/\*/);
      const locCode = loc.replace(/\*/, '');
      let name = i18n.locales_localized[locCode] || i18n.locales[locCode] || locCode;
      name = name + ' (' + locCode + ')';
      if (auto_translated) {
        name = name + ' (auto-translated)';
      }
      return {
        name: name,
        id: locCode
      };
    });
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
      this.set('lang', stashes.get('display_lang'));
    },
    closing() {},
    nothing() {},
    update() {
      stashes.persist('display_lang', this.get('lang'));
      setTimeout(function() {
        location.reload();
      }, 1000);
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
