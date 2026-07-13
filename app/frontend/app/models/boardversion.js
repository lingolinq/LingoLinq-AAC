import { attr } from '@ember-data/model';
import BaseModel from './base';
import LingoLinq from '../app';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';

LingoLinq.Boardversion = BaseModel.extend({
  appState: service('app-state'),
  modifier: attr('raw'),
  created: attr('date'),
  stats: attr('raw'),
  action: attr('string'),
  summary: attr('string'),
  button_labels: attr('raw'),
  grid: attr('raw'),
  immediately_upstream_boards: attr('raw'),
  recent: computed('appState.refresh_stamp', 'created', function() {
    var past = window.moment().add(-7, 'day');
    return this.get('created') && this.get('created') > past;
  }),
  button_labels_list: computed('button_labels', function() {
    if(this.get('button_labels') && this.get('button_labels').length > 0) {
      return this.get('button_labels').join(', ');
    } else {
      return "";
    }
  })
});

export default LingoLinq.Boardversion;
