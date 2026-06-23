import { attr } from '@ember-data/model';
import BaseModel from './base';
import LingoLinq from '../app';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';

LingoLinq.Userversion = BaseModel.extend({
  appState: service('app-state'),
  modifier: attr('raw'),
  created: attr('date'),
  stats: attr('raw'),
  action: attr('string'),
  summary: attr('string'),
  recent: computed('appState.refresh_stamp', 'created', function() {
    var past = window.moment().add(-7, 'day');
    return this.get('created') && this.get('created') > past;
  })
});

export default LingoLinq.Userversion;
