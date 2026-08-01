import Component from '@ember/component';
import { inject as service } from '@ember/service';

/**
 * User search results modal — converted from legacy controller+template
 * (`controllers/user-results` / `templates/user-results.hbs`) so component-based
 * modal rendering (modal-container) can show Find User hits.
 */
export default Component.extend({
  modal: service('modal'),
  router: service('router'),
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

    var modalService = this.get('modal');
    var template = 'user-results';
    var options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                  (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                  this.get('model') || {};
    this.set('model', options);
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
    },
    closing() {},
    open_user(user) {
      var name = user && (user.get ? user.get('user_name') : user.user_name);
      if(!name) { return; }
      this.get('modal').close();
      this.get('router').transitionTo('user.index', name);
    },
    // Same agreement modal as user profile "Masquerade as User".
    masquerade(user) {
      if(!user) { return; }
      this.get('modal').open('modals/masquerade', {user: user});
    }
  },

  didInsertElement() {
    this._super(...arguments);
    var self = this;
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
    this.onClosing = function() { self.send('closing'); };
    // Component modals don't always auto-invoke opening(); mirror assessment-settings.
    this.send('opening');
  }
});
