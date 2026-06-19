import DS from 'ember-data';
import { computed } from '@ember/object';
import RSVP from 'rsvp';
import persistence from '../utils/persistence';

const BaseModel = DS.Model.extend({
  reload: function(ignore_local) {
    if(ignore_local === false) {
      persistence.force_reload = null;
    } else {
      persistence.force_reload = this.constructor.modelName + "_" + this.get('id');
    }
    return this._super();
  },
  retrieved: DS.attr('number'),
  fresh: computed('retrieved', 'app_state.refresh_stamp', function() {
    var retrieved = this.get('retrieved');
    var now = (new Date()).getTime();
    return (now - retrieved) < (5 * 60 * 1000);
  }),
  really_fresh: computed('retrieved', 'app_state.short_refresh_stamp', function() {
    var retrieved = this.get('retrieved');
    var now = (new Date()).getTime();
    return (now - retrieved) < (30 * 1000);
  }),
  save: function() {
    // TODO: this causes a difficult constraint, because you need to use the result of the
    // promise instead of the original record you were saving in any results, just in case
    // the record object changed. It's not ideal, but we have to do something because DS gets
    // mad now if the server returns a different id, and we use a temporary id when persisted
    // locally.
    if(this.id && this.id.match(/^tmp[_/]/) && persistence.get('online')) {
      var tmp_id = this.id;
      var tmp_key = this.get('key');
      var type = this.constructor.modelName;
      var attrs = this.serialize({ includeId: false });
      var rec = this.store.createRecord(type, attrs);
      rec.tmp_key = tmp_key;
      return rec.save().then(function(result) {
        return persistence.remove(type, {}, tmp_id).then(function() {
          return RSVP.resolve(result);
        }, function() {
          return RSVP.reject({error: "failed to remove temporary record"});
        });
      });
    }
    return this._super();
  }
});

export default BaseModel;
