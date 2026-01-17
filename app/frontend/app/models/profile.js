import { later as runLater } from '@ember/runloop';
import RSVP from 'rsvp';
import DS from 'ember-data';
import LingoLinq from '../app';
import i18n from '../utils/i18n';
import persistence from '../utils/persistence';
import contentGrabbers from '../utils/content_grabbers';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

LingoLinq.Profile = DS.Model.extend({
  // Explicit service injections (Ember 3.28 migration)
  persistence: service(),
  profile_id: DS.attr('string'),
  public: DS.attr('string'),
  template: DS.attr('raw'),
  permissions: DS.attr('raw')
});

export default LingoLinq.Profile;
