import DS from 'ember-data';
import LingoLinq from '../app';
import speecher from '../utils/speecher';
import persistence from '../utils/persistence';
import Utils from '../utils/misc';
import { inject as service } from '@ember/service';

LingoLinq.Tag = DS.Model.extend({
  // Explicit service injections (Ember 3.28 migration)
  persistence: service(),
  button: DS.attr('raw'),
  tag_id: DS.attr('string'),
  label: DS.attr('string'),
  public: DS.attr('boolean'),
});

export default LingoLinq.Tag;
