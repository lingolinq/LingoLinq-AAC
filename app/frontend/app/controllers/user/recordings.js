import Controller from '@ember/controller';
import i18n from '../../utils/i18n';
import capabilities from '../../utils/capabilities';
import contentGrabbers from '../../utils/content_grabbers';
import modal from '../../utils/modal';
import Utils from '../../utils/misc';
import LingoLinq from '../../app';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';
import { alias } from '@ember/object/computed';

export default Controller.extend({
  appState: service('app-state'),
  session: service('session'),
  // Alias for template compatibility (template uses this.app_state)
  app_state: alias('appState'),
  load_recordings: function() {
    var _this = this;
    _this.set('recordings', {loading: true});
    Utils.all_pages('sound', {user_id: this.get('model.id')}, function(res) {
      _this.set('recordings', res);
    }).then(function(res) {
      _this.set('recordings', res);
    }, function(err) {
      _this.set('recordings', {error: true});
    });
  },
  filtered_recordings: computed('recordings', 'search_string', function() {
    var recordings = this.get('recordings');
    var str = this.get('search_string');
    var re = new RegExp(str, 'i');
    var res = recordings;
    if(str) {
      res = recordings.filter(function(r) { return r.get('search_string').match(re); });
    }
    return res;
  }),
  init() {
    this._super(...arguments);
    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };
  },

  actions: {
    play_audio: function(sound) {
      contentGrabbers.soundGrabber.play_audio(sound);
    },
    edit_sound: function(sound) {
      var _this = this;
      modal.open('edit-sound', {sound: sound}).then(function(res) {
        if(res && res.updated) {
          _this.load_recordings();
        }
      });
    },
    delete_sound: function(sound) {
      var _this = this;
      modal.open('confirm-delete-sound', {sound: sound}).then(function(res) {
        if(res && res.deleted) {
          _this.load_recordings();
        }
      });
    },
    record_sound: function() {
      var _this = this;
      modal.open('batch-recording', {user: this.get('model'), recordings: null, single: true}).then(function() {
        _this.load_recordings();
      });
    },
    batch_recording: function() {
      var rec = null;
      if(this.get('recordings.length') > 0) {
        rec = this.get('recordings');
      }
      var _this = this;
      modal.open('batch-recording', {user: this.get('model'), recordings: rec}).then(function() {
        _this.load_recordings();
      });
    }
  }
});
