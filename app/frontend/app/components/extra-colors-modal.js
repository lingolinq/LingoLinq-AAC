import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { set as emberSet } from '@ember/object';
import { htmlSafe } from '@ember/template';
import Button from '../utils/button';

/**
 * Extra Colors Modal Component (modal content for modals/extra-colors).
 * Named extra-colors-modal to avoid conflict with the existing extra-colors
 * component that opens this modal.
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/extra-colors';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    if (this.get('model.colors') && typeof this.get('model.colors').forEach !== 'function') {
      this.set('model.colors', []);
    }
  },

  styled_colors: computed('model.colors', 'model.colors.@each.fill', 'model.colors.@each.border', function() {
    const colors = this.get('model.colors') || [];
    colors.forEach(function(c) {
      emberSet(c, 'style', htmlSafe('border-color: ' + Button.clean_text(c.border || '#888') + '; background: ' + Button.clean_text(c.fill || '#fff') + ';'));
    });
    return colors;
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
      if (this.get('model.colors') && typeof this.get('model.colors').forEach !== 'function') {
        this.set('model.colors', []);
      }
    },
    closing() {},
    confirm() {
      const res = [];
      (this.get('model.colors') || []).forEach(function(row) {
        res.push({
          label: row.label,
          fill: row.fill,
          border: row.border
        });
      });
      this.get('modal').close({ colors: res });
    },
    remove(row) {
      const rows = [].concat(this.get('model.colors') || []);
      const filtered = rows.filter(function(r) { return r !== row; });
      this.set('model.colors', filtered);
    },
    add_row() {
      const rows = [].concat(this.get('model.colors') || []);
      rows.push({});
      this.set('model.colors', rows);
    }
  }
});
