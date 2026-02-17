import DS from 'ember-data';
import LingoLinq from '../app';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';

LingoLinq.Userversion = DS.Model.extend({
  appState: service('app-state'),
  modifier: DS.attr('raw'),
  created: DS.attr('date'),
  stats: DS.attr('raw'),
  action: DS.attr('string'),
  summary: DS.attr('string'),
  recent: computed('appState.refresh_stamp', 'created', function() {
    var past = window.moment().add(-7, 'day');
    return this.get('created') && this.get('created') > past;
  })
});

export default LingoLinq.Userversion;
