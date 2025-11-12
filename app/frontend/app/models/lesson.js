import { later as runLater } from '@ember/runloop';
import RSVP from 'rsvp';
import DS from 'ember-data';
import LingoLinq from '../app';
import i18n from '../utils/i18n';
import persistence from '../utils/persistence';
import contentGrabbers from '../utils/content_grabbers';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

LingoLinq.Lesson = DS.Model.extend({
  didLoad: function() {
  },
  title: DS.attr('string'),
  url: DS.attr('string'),
  original_url: DS.attr('string'),
  organization_id: DS.attr('string'),
  organization_unit_id: DS.attr('string'),
  user_id: DS.attr('string'),
  lesson_code: DS.attr('string'),
  user: DS.attr('raw'),
  due_at: DS.attr('date'),
  due_ts: DS.attr('number'),
  target_types: DS.attr('raw'),
  editable: DS.attr('boolean'),
  required: DS.attr('boolean'),
  video: DS.attr('boolean'),
  description: DS.attr('string'),
  time_estimate: DS.attr('number'),
  past_cutoff: DS.attr('number'),
  badge: DS.attr('raw'),
  noframe: DS.attr('boolean'),
  completed_users: DS.attr('raw'),
  target_types_list: computed('target_types', function() {
    return (this.get('target_types') || []).join(', ');
  })
});

export default LingoLinq.Lesson;
