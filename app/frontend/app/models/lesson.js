import { later as runLater } from '@ember/runloop';
import RSVP from 'rsvp';
import { attr } from '@ember-data/model';
import BaseModel from './base';
import LingoLinq from '../app';
import i18n from '../utils/i18n';
import persistence from '../utils/persistence';
import contentGrabbers from '../utils/content_grabbers';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

LingoLinq.Lesson = BaseModel.extend({
  title: attr('string'),
  url: attr('string'),
  original_url: attr('string'),
  organization_id: attr('string'),
  organization_unit_id: attr('string'),
  user_id: attr('string'),
  lesson_code: attr('string'),
  user: attr('raw'),
  due_at: attr('date'),
  due_ts: attr('number'),
  target_types: attr('raw'),
  editable: attr('boolean'),
  required: attr('boolean'),
  video: attr('boolean'),
  description: attr('string'),
  time_estimate: attr('number'),
  past_cutoff: attr('number'),
  badge: attr('raw'),
  noframe: attr('boolean'),
  completed_users: attr('raw'),
  target_types_list: computed('target_types', function() {
    return (this.get('target_types') || []).join(', ');
  })
});

export default LingoLinq.Lesson;
