import DS from 'ember-data';
import BaseModel from './base';
import LingoLinq from '../app';
import i18n from '../utils/i18n';
import Utils from '../utils/misc';

LingoLinq.Snapshot = BaseModel.extend({
  user_id: DS.attr('string'),
  name: DS.attr('string'),
  start: DS.attr('string'),
  end: DS.attr('string'),
  device_id: DS.attr('string'),
  location_id: DS.attr('string')
});

export default LingoLinq.Snapshot;
