import LingoLinq from '../../app';
import app_state from '../../utils/app_state';
import modal from '../../utils/modal';
import { htmlSafe } from '@ember/string';
import { set as emberSet } from '@ember/object';
import Button from '../../utils/button';
import { computed,  observer } from '@ember/object';
import RSVP from 'rsvp';
import $ from 'jquery';
import stashes from '../../utils/_stashes';
import utterance from '../../utils/utterance';
import i18n from '../../utils/i18n';
import persistence from '../../utils/persistence';
import editManager from '../../utils/edit_manager';
import sync from '../../utils/sync';
import { later as runLater } from '@ember/runloop';

export default modal.ModalController.extend({
  opening: function() {
    this.set('current_template_id', 'none');
    if(this.get('model.note_templates') && !this.get('model.note_templates').forEach) {
      this.set('model.note_templates', []);
    }
  },
  template_list: computed('model.note_templates', 'current_template.title', function() {
    var res = [];
    res.push({id: 'none', name: i18n.t('select_template', "[ Select Template ]")});

    (this.get('model.note_templates') || []).forEach(function(row, idx) {
      res.push({id: idx + 1, name: row.title || "New Template"});
    })
    return res;
  }),
  current_template: computed('current_template_id', 'template_list', 'model.note_templates', function() {
    return (this.get('model.note_templates') || [])[this.get('current_template_id') - 1];
  }),
  actions: {
    confirm: function() {
      var res = [];
      (this.get('model.note_templates') || []).forEach(function(row) {
        res.push({
          title: row.title,
          text: row.text
        })
      });
      modal.close({note_templates: res});
    },
    remove: function(row) {
      var rows = [].concat(this.get('model.note_templates') || []);
      rows = rows.filter(function(r, idx) { return r != row; });
      this.set('model.note_templates', rows);
    },
    add_row: function() {
      var rows = [].concat(this.get('model.note_templates') || []);
      rows.push({
        text: "======= Header Goes Here =======\n\n"
      });
      this.set('model.note_templates', rows);
      var _this = this;
      runLater(function() {
        _this.set('current_template_id', _this.get('template_list')[_this.get('template_list').length - 1].id);
      })
    }
  }
});
