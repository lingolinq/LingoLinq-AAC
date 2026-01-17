import i18n from '../../utils/i18n';
import modal from '../../utils/modal';
import utterance from '../../utils/utterance';
import RSVP from 'rsvp';
import app_state from '../../utils/app_state';
import evaluation from '../../utils/eval';
import { set as emberSet } from '@ember/object';
import { computed } from '@ember/object';
import { observer } from '@ember/object';
import { inject as service } from '@ember/service';
import LingoLinq from '../../app';

export default modal.ModalController.extend({
  modal: service(),

  opening: function() {
    if(this.get('model.lesson.editable')) {
      this.set('lesson', this.get('model.lesson'));
    } else {
      var lesson = LingoLinq.store.createRecord('lesson');
      lesson.set('target_types', ['supervisor']);
      this.set('lesson', lesson);
    }

    this.set('required_option', this.get('lesson.required') ? 'required' : 'optional');
    var types = (lesson.get('target_types') || ['supervisor']).sort().join(',')
    if(types == 'supervisor') {
      this.set('target_type', 'supervisors');
    } else if(types == 'manager') {
      this.set('target_type', 'managers');
    } else {
      this.set('target_type', 'all');
    }
    this.set('allow_past', !!this.get('lesson.past_cutoff'));
    this.set('status', null);
  },
  required_options: computed(function() {
    return [
      {id: 'optional', name: i18n.t('optional_lesson', "This lesson is a suggestion, not required")},
      {id: 'required', name: i18n.t('required_lesson', "This lesson is required, remind users")},
    ];
  }),
  target_types: computed('model.org', 'model.unit', function() {
    var res = [];
    res.push({id: 'supervisors', name: i18n.t('supervisors_only', "Supervisors Only")});
    if(this.get('model.org')) {
      res.push({id: 'managers', name: i18n.t('managers_only', "Managers Only")});
    }
    res.push({id: 'all', name: i18n.t('all_users', "All Users")});
    return res;
  }),
  update_on_required_option: observer('lesson', 'required_option', function() {
    if(this.get('lesson') && this.get('required_option') != null) {
      this.set('lesson.required', this.get('required_option') == 'required');
    }
  }),
  actions: {
    confirm: function() {
      var _this = this;
      _this.set('status', {saving: true});
      var lesson = _this.get('lesson');
      lesson.set('url', lesson.get('original_url'));
      if(_this.get('model.org')) {
        lesson.set('organization_id', _this.get('model.org.id'));
      } else if(_this.get('model.unit')) {
        lesson.set('organization_unit_id', _this.get('model.unit.id'));
      }
      if(_this.get('model.org') || _this.get('model.unit')) {
        if(_this.get('target_type') == 'supervisors') {
          lesson.set('target_types', ['supervisor']);
        } else if(_this.get('target_type') == 'managers') {
          lesson.set('target_types', ['manager']);
        } else {
          if(_this.get('model.org')) {
            lesson.set('target_types', ['manager', 'supervisor', 'user']);
          } else {
            lesson.set('target_types', ['supervisor', 'user']);
          }
        }
      }
      lesson.save().then(function(res) {
        _this.set('status', null);
        this.modal.close({lesson: lesson});
      }, function(err) {
        _this.set('status', {error: true});
      });
    }
  }
});
