import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { htmlSafe } from '@ember/template';
import capabilities from '../utils/capabilities';

/**
 * Renders flash messages from the modal service (no deprecated route.render()).
 * Replaces the flash-message outlet when modal service is used.
 */
export default Component.extend({
  modalService: service('modal'),
  appState: service('app-state'),
  tagName: '',

  message: computed('modalService.flashMessage', function() {
    var flash = this.get('modalService.flashMessage');
    return flash ? flash.text : null;
  }),

  displayClass: computed('modalService.flashMessage', function() {
    var flash = this.get('modalService.flashMessage');
    if (!flash) { return 'alert alert-dismissable alert-info'; }
    var res = 'alert alert-dismissable ';
    if (flash.type === 'warning') { res += 'alert-warning'; }
    else if (flash.type === 'error') { res += 'alert-danger'; }
    else if (flash.type === 'success') { res += 'alert-success'; }
    else { res += 'alert-info'; }
    if (flash.belowHeader) { res += ' below_header'; }
    return res;
  }),

  extraStyles: computed('modalService.flashMessage', 'appState.header_height', function() {
    var flash = this.get('modalService.flashMessage');
    if (!flash || !flash.belowHeader) { return htmlSafe(''); }
    var top = this.get('appState.header_height') || 0;
    return htmlSafe('top: ' + top + 'px;');
  }),

  sticky: computed('modalService.flashMessage.sticky', function() {
    var flash = this.get('modalService.flashMessage');
    return flash && flash.sticky;
  }),

  redirectContact: computed('modalService.flashMessage.redirect.contact', function() {
    var flash = this.get('modalService.flashMessage');
    return flash && flash.redirect && flash.redirect.contact;
  }),

  actionText: computed('modalService.flashMessage.action.text', function() {
    var flash = this.get('modalService.flashMessage');
    return flash && flash.action && flash.action.text;
  }),

  actions: {
    confirm() {
      var flash = this.get('modalService.flashMessage');
      if (flash && flash.redirect) {
        if (flash.redirect.subscribe && !capabilities.installed_app) {
          this.get('appState.controller').transitionToRoute('user.subscription', this.get('appState.currentUser.user_name'));
        }
      } else if (flash && flash.action && flash.action.callback) {
        flash.action.callback();
      }
      this.get('modalService').close(null, 'flash-message');
    },
    contact() {
      this.get('appState.controller').transitionToRoute('contact');
    },
  },
});
