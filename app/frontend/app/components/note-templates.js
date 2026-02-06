import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import modal from '../utils/modal';
import i18n from '../utils/i18n';

/**
 * Note Templates Modal Component
 *
 * Converted from modals/note-templates template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/note-templates';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.set('current_template_id', 'none');
    if (this.get('model.note_templates') && !this.get('model.note_templates').forEach) {
      this.set('model.note_templates', []);
    }
  },

  template_list: computed('model.note_templates', 'model.note_templates.[]', 'current_template_id', function() {
    const res = [];
    res.push({ id: 'none', name: i18n.t('select_template', "[ Select Template ]") });
    (this.get('model.note_templates') || []).forEach(function(row, idx) {
      res.push({ id: idx + 1, name: row.title || "New Template" });
    });
    return res;
  }),

  current_template: computed('current_template_id', 'template_list', 'model.note_templates', function() {
    const id = this.get('current_template_id');
    const list = this.get('model.note_templates') || [];
    const idx = (typeof id === 'number') ? id - 1 : parseInt(id, 10) - 1;
    return list[idx] || null;
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    confirm() {
      const res = [];
      (this.get('model.note_templates') || []).forEach(function(row) {
        res.push({ title: row.title, text: row.text });
      });
      modal.close({ note_templates: res });
    },
    remove(row) {
      let rows = [].concat(this.get('model.note_templates') || []);
      rows = rows.filter(function(r) { return r !== row; });
      this.set('model.note_templates', rows);
    },
    add_row() {
      const rows = [].concat(this.get('model.note_templates') || []);
      rows.push({
        text: "======= Header Goes Here =======\n\n"
      });
      this.set('model.note_templates', rows);
      const _this = this;
      runLater(function() {
        const list = _this.get('template_list');
        if (list && list.length) {
          _this.set('current_template_id', list[list.length - 1].id);
        }
      });
    },
    updateTemplateId(id) {
      this.set('current_template_id', id);
    }
  }
});
