import Component from '@ember/component';
import { inject as service } from '@ember/service';
import i18n from '../utils/i18n';
import modalUtil from '../utils/modal';

/**
 * Tag Board Modal Component
 *
 * Converted from modals/tag-board template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/tag-board';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.set('tag', '');
    this.set('downstream', false);
    this.set('status', null);
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
      this.set('status', null);
      const user = this.get('model.user');
      if (user && !user.get('board_tags')) {
        user.reload();
      }
    },
    closing() {},
    nothing() {},
    choose(tagName) {
      this.set('tag', tagName);
    },
    update() {
      const downstream = !!this.get('downstream');
      const _this = this;
      this.set('status', { loading: true });
      this.get('model.user').tag_board(this.get('model.board'), this.get('tag'), false, downstream).then(function() {
        _this.set('status', null);
        _this.get('modal').close();
        modalUtil.success(i18n.t('categorization_complete', "Board Categorization Complete"));
      }, function() {
        _this.set('status', { error: true });
      });
    }
  }
});
