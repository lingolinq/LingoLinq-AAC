import { later as runLater } from '@ember/runloop';
import RSVP from 'rsvp';
import { attr } from '@ember-data/model';
import BaseModel from './base';
import LingoLinq from '../app';
import i18n from '../utils/i18n';
import contentGrabbers from '../utils/content_grabbers';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

LingoLinq.Profile = BaseModel.extend({
  profile_id: attr('string'),
  public: attr('string'),
  template: attr('raw'),
  permissions: attr('raw')
});

export default LingoLinq.Profile;
