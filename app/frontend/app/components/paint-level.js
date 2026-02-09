import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import i18n from '../utils/i18n';
import editManager from '../utils/edit_manager';
import LingoLinq from '../app';

/**
 * Paint Level Modal Component
 *
 * Converted from modals/paint-level template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/paint-level';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.set('paint_type', '');
    this.set('paint_level', '');
  },

  paint_types: computed(function() {
    return [
      { name: i18n.t('choose_type', "[ Choose Type ]"), id: '' },
      { name: i18n.t('reveal_button', "Un-Hide the Button"), id: 'hidden' },
      { name: i18n.t('enable_link', "Enable the Link for the Button"), id: 'link_disabled' },
      { name: i18n.t('remove_settings', "Clear All Level Settings"), id: 'clear' }
    ];
  }),

  level_select: computed('paint_type', function() {
    return this.get('paint_type') === 'hidden' || this.get('paint_type') === 'link_disabled';
  }),

  paint_levels: computed(function() {
    return LingoLinq.board_levels || [];
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
    },
    closing() {},
    nothing() {},
    paint() {
      if (this.get('paint_type') && (!this.get('level_select') || this.get('paint_level'))) {
        editManager.set_paint_mode('level', this.get('paint_type'), parseInt(this.get('paint_level'), 10));
        this.get('modal').close();
      }
    }
  }
});
