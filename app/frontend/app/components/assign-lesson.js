import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import i18n from '../utils/i18n';

/**
 * Assign Lesson Modal Component
 *
 * Converted from modals/assign-lesson template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  store: service('store'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/assign-lesson';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.set('lesson', null);
    this.set('required_option', 'optional');
    this.set('target_type', 'supervisors');
    this.set('allow_past', false);
    this.set('status', null);
  },

  required_options: computed(function() {
    return [
      { id: 'optional', name: i18n.t('optional_lesson', "This lesson is a suggestion, not required") },
      { id: 'required', name: i18n.t('required_lesson', "This lesson is required, remind users") }
    ];
  }),

  target_types: computed('model.org', 'model.unit', function() {
    const res = [];
    res.push({ id: 'supervisors', name: i18n.t('supervisors_only', "Supervisors Only") });
    if (this.get('model.org')) {
      res.push({ id: 'managers', name: i18n.t('managers_only', "Managers Only") });
    }
    res.push({ id: 'all', name: i18n.t('all_users', "All Users") });
    return res;
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
      const modelLesson = this.get('model.lesson');
      if (modelLesson && modelLesson.get('editable')) {
        this.set('lesson', modelLesson);
      } else {
        const store = this.get('store');
        const lesson = store.createRecord('lesson');
        lesson.set('target_types', ['supervisor']);
        this.set('lesson', lesson);
      }
      const lesson = this.get('lesson');
      this.set('required_option', lesson.get('required') ? 'required' : 'optional');
      const types = (lesson.get('target_types') || ['supervisor']).sort().join(',');
      if (types === 'supervisor') {
        this.set('target_type', 'supervisors');
      } else if (types === 'manager') {
        this.set('target_type', 'managers');
      } else {
        this.set('target_type', 'all');
      }
      this.set('allow_past', !!lesson.get('past_cutoff'));
      this.set('status', null);
    },
    closing() {},
    confirm() {
      const _this = this;
      this.set('status', { saving: true });
      const lesson = this.get('lesson');
      lesson.set('url', lesson.get('original_url'));
      lesson.set('required', this.get('required_option') === 'required');
      if (this.get('model.org')) {
        lesson.set('organization_id', this.get('model.org.id'));
      } else if (this.get('model.unit')) {
        lesson.set('organization_unit_id', this.get('model.unit.id'));
      }
      if (this.get('model.org') || this.get('model.unit')) {
        if (this.get('target_type') === 'supervisors') {
          lesson.set('target_types', ['supervisor']);
        } else if (this.get('target_type') === 'managers') {
          lesson.set('target_types', ['manager']);
        } else {
          if (this.get('model.org')) {
            lesson.set('target_types', ['manager', 'supervisor', 'user']);
          } else {
            lesson.set('target_types', ['supervisor', 'user']);
          }
        }
      }
      lesson.save().then(function() {
        _this.set('status', null);
        _this.get('modal').close({ lesson: lesson });
      }, function() {
        _this.set('status', { error: true });
      });
    }
  }
});
