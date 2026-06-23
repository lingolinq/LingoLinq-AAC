import { attr } from '@ember-data/model';
import BaseModel from './base';
import LingoLinq from '../app';
import i18n from '../utils/i18n';
import Utils from '../utils/misc';

LingoLinq.Snapshot = BaseModel.extend({
  user_id: attr('string'),
  name: attr('string'),
  start: attr('string'),
  end: attr('string'),
  device_id: attr('string'),
  location_id: attr('string')
});

export default LingoLinq.Snapshot;
