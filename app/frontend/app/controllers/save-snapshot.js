import LingoLinq from '../app';
import modal from '../utils/modal';
import Utils from '../utils/misc';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  modal: service(),

  opening: function() {
    this.set('error', false);
    this.set('saving', false);
    var snapshot = LingoLinq.store.createRecord('snapshot', {user_id: this.get('model.user.id')});
    this.set('snapshot', snapshot);
    this.set('show_snapshots_status', !this.get('model.usage_stats'));
    this.load_snapshots();
  },
  load_snapshots: function() {
    var _this = this;
    if(_this.get('show_snapshots_status')) { _this.set('snapshots', {loading: true}); }
    Utils.all_pages('snapshot', {user_id: this.get('model.user.id')}, function(inter) {
    }).then(function(res) {
      _this.set('snapshots', res);
    }, function(err) {
      if(_this.get('show_snapshots_status')) { _this.set('snapshots', {error: true}); }
    });
  },
  starts: computed('model.usage_stats.start_at', function() {
    return (this.get('model.usage_stats.start_at') || '').substring(0, 10);
  }),
  default_snapshot_name: computed('starts', function() {
    return (this.get('starts') || "New") + " Snapshot";
  }),
  ends: computed('model.usage_stats.end_at', function() {
    return (this.get('model.usage_stats.end_at') || '').substring(0, 10);
  }),
  actions: {
    close: function() {
      this.modal.close(false);
    },
    save: function() {
      var _this = this;
      var snapshot = _this.get('snapshot');
      snapshot.set('start', this.get('model.usage_stats.start'));
      snapshot.set('end', this.get('model.usage_stats.end'));
      snapshot.set('device_id', this.get('model.usage_stats.device_id'));
      snapshot.set('location_id', this.get('model.usage_stats.location_id'));
      _this.set('snapshot.error', false);
      _this.set('snapshot.saving', true);
      snapshot.save().then(function() {
        this.modal.close({created: true});
        _this.set('snapshot.saving', false);
      }, function() {
        _this.set('snapshot.error', true);
        _this.set('snapshot.saving', false);
      });
    },
    show_snapshots: function() {
      this.set('show_snapshots_status', true);
    },
    delete_snapshot: function(snap) {
      snap.deleteRecord();
      var _this = this;
      snap.save().then(function() {
        _this.load_snapshots();
      }, function() {
        _this.load_snapshots();
      });
    }
  }
});
