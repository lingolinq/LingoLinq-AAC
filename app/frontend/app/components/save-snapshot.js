import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import LingoLinq from '../app';
import Utils from '../utils/misc';

/**
 * Save Snapshot modal component.
 * Opens from the stats page "Create Snapshot" button to save the current
 * date range (and optional device/location filter) as a named snapshot for
 * later use in report filtering.
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  error: false,
  saving: false,
  snapshot: null,
  snapshots: null,
  show_snapshots_status: false,

  init() {
    this._super(...arguments);
  },

  model: computed(function() {
    const modalService = this.get('modal');
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor('save-snapshot')) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor['save-snapshot']) ||
                    (modalService && modalService.get('currentOptions')) ||
                    {};
    return {
      usage_stats: options.usage_stats,
      user: options.user
    };
  }),

  starts: computed('model.usage_stats.start_at', 'model.usage_stats.start', function() {
    const stats = this.get('model.usage_stats');
    if (!stats) { return ''; }
    const val = stats.get ? stats.get('start_at') || stats.get('start') : (stats.start_at || stats.start);
    return (val || '').substring(0, 10);
  }),

  default_snapshot_name: computed('starts', 'ends', function() {
    const starts = this.get('starts');
    const ends = this.get('ends');
    if (starts && ends) {
      return starts + ' to ' + ends;
    }
    if (starts) {
      return starts + ' Report Period';
    }
    return 'Report Period';
  }),

  ends: computed('model.usage_stats.end_at', 'model.usage_stats.end', function() {
    const stats = this.get('model.usage_stats');
    if (!stats) { return ''; }
    const val = stats.get ? stats.get('end_at') || stats.get('end') : (stats.end_at || stats.end);
    return (val || '').substring(0, 10);
  }),

  opening() {
    this.set('error', false);
    this.set('saving', false);
    const model = this.get('model');
    const defaultName = this.get('default_snapshot_name');
    const snapshot = LingoLinq.store.createRecord('snapshot', {
      user_id: model.user && model.user.get ? model.user.get('id') : (model.user && model.user.id),
      name: defaultName
    });
    this.set('snapshot', snapshot);
    this.set('show_snapshots_status', !model.usage_stats);
    this.load_snapshots();
  },

  load_snapshots() {
    const _this = this;
    const userId = this.get('model.user.id') || (this.get('model.user') && this.get('model.user').get && this.get('model.user').get('id'));
    if (_this.get('show_snapshots_status')) { _this.set('snapshots', { loading: true }); }
    Utils.all_pages('snapshot', { user_id: userId }, function() {}).then(function(res) {
      _this.set('snapshots', res);
    }, function() {
      if (_this.get('show_snapshots_status')) { _this.set('snapshots', { error: true }); }
    });
  },

  actions: {
    opening() {
      this.opening();
    },
    closing() {},
    close() {
      this.get('modal').close(false);
    },
    save() {
      const _this = this;
      const snapshot = _this.get('snapshot');
      const stats = _this.get('model.usage_stats');
      if (stats) {
        snapshot.set('start', stats.get ? stats.get('start') : stats.start);
        snapshot.set('end', stats.get ? stats.get('end') : stats.end);
        snapshot.set('device_id', stats.get ? stats.get('device_id') : stats.device_id);
        snapshot.set('location_id', stats.get ? stats.get('location_id') : stats.location_id);
      }
      const name = (snapshot.get ? snapshot.get('name') : snapshot.name) || '';
      if (!name.trim()) {
        snapshot.set('name', _this.get('default_snapshot_name'));
      }
      _this.set('snapshot.error', false);
      _this.set('snapshot.saving', true);
      snapshot.save().then(function() {
        _this.get('modal').close({ created: true });
        _this.set('snapshot.saving', false);
      }, function() {
        _this.set('snapshot.error', true);
        _this.set('snapshot.saving', false);
      });
    },
    show_snapshots() {
      this.set('show_snapshots_status', true);
    },
    delete_snapshots(snap) {
      snap.deleteRecord();
      const _this = this;
      snap.save().then(function() {
        _this.load_snapshots();
      }, function() {
        _this.load_snapshots();
      });
    }
  }
});
