import Component from '@ember/component';
import { inject as service } from '@ember/service';
import EmberObject from '@ember/object';
import modal from '../utils/modal';
import i18n from '../utils/i18n';

/**
 * Pre-import modal: choose which users receive the imported board set (multi-user board import).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
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
    const template = 'import-board-recipients';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);

    const rows = [];
    const sess = this.get('appState.sessionUser');
    if(sess) {
      rows.push(EmberObject.create({
        global_id: sess.get('id'),
        user_name: sess.get('user_name'),
        selected: true,
        is_self: true
      }));
    }
    const supers = this.get('appState.sessionUser.known_supervisees') || [];
    supers.forEach(function(supervisee) {
      if(!supervisee.edit_permission) { return; }
      rows.push(EmberObject.create({
        global_id: supervisee.id,
        user_name: supervisee.user_name,
        selected: false,
        is_self: false
      }));
    });
    this.set('recipient_rows', rows);
  },

  actions: {
    opening() {},
    closing() {},
    close() {
      this.get('modal').close({ dismissed: true });
    },
    confirm() {
      const rows = this.get('recipient_rows') || [];
      const ids = rows.filter(function(r) { return r.get('selected'); }).map(function(r) { return r.get('global_id'); }).filter(Boolean);
      if(ids.length === 0) {
        modal.error(i18n.t('import_recipients_required', "Please select at least one user to import boards for."));
        return;
      }
      this.get('modal').close({
        recipient_global_ids: ids,
        file: this.get('model.file')
      });
    },
  }
});
