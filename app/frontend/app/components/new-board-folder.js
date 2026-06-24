import Component from '@ember/component';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';
import i18n from '../utils/i18n';
import modal from '../utils/modal';

export default Component.extend({
  modal: service('modal'),
  tagName: '',
  folderName: '',
  status: null,

  submitDisabled: computed('folderName', 'status.loading', function() {
    return !(this.get('folderName') || '').trim() || this.get('status.loading');
  }),

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
    const template = 'new-board-folder';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.set('folderName', '');
      this.set('status', null);
      setTimeout(function() {
        var input = document.getElementById('new-board-folder-name');
        if (input) { input.focus(); input.select(); }
      }, 150);
    },
    submit() {
      var name = (this.get('folderName') || '').trim();
      if (!name.length) {
        this.set('status', { error: true });
        return;
      }
      var user = this.get('model.user');
      if (!user || !user.ensureBoardTag) {
        this.set('status', { error: true });
        return;
      }
      var _this = this;
      this.set('status', { loading: true });
      user.ensureBoardTag(name).then(function() {
        _this.set('status', null);
        _this.get('modal').close(true);
        modal.success(i18n.t('folder_created', "Folder created"));
      }, function() {
        _this.set('status', { error: true, loading: false });
      });
    }
  },

  didInsertElement() {
    this._super(...arguments);
    var self = this;
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
  },
});
