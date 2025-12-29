import { later as runLater } from '@ember/runloop';
import RSVP from 'rsvp';
import DS from 'ember-data';
import LingoLinq from '../app';
import i18n from '../utils/i18n';
import persistence from '../utils/persistence';
import contentGrabbers from '../utils/content_grabbers';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

LingoLinq.Sound = DS.Model.extend({
  init() {
    this._super(...arguments);
    // Clean license and check transcription on initialization
    this.clean_license();
    this.check_transcription();
  },
  user_id: DS.attr('string'),
  url: DS.attr('string'),
  created: DS.attr('date'),
  content_type: DS.attr('string'),
  name: DS.attr('string'),
  tags: DS.attr('raw'),
  tag: DS.attr('string'),
  transcription: DS.attr('string'),
  duration: DS.attr('number'),
  pending: DS.attr('boolean'),
  protected: DS.attr('boolean'),
  protected_source: DS.attr('string'),
  license: DS.attr('raw'),
  permissions: DS.attr('raw'),
  file: DS.attr('boolean'),
  untranscribable: DS.attr('boolean'),
  search_string: computed('name', 'transcription', 'created', function() {
    return this.get('name') + " " + this.get('transcription') + " " + this.get('created');
  }),
  check_transcription: function() {
    if(this.get('transcription')) {
      this.set('transcription_pending', false);
      return true;
    } else if(this.get('untranscribable')) {
      this.set('transcription_pending', false);
      return false;
    } else {
      var two_hours_ago = window.moment().add(-2, 'hours');
      var created = window.moment(this.get('created'));
      if(created > two_hours_ago) {
        var _this = this;
        this.set('transcription_pending', true);

        var timeout = 5 * 1000;
        var attempts = (this.get('transcription_checks') || 0);
        if(attempts == 1) {
          timeout = 10 * 1000;
        } else if(attempts < 4) {
          timeout = 15 * 1000;
        } else {
          timeout = 60 * 1000;
        }
        this.set('transcription_checks', attempts + 1);
        runLater(function() {
          if(persistence.get('online')) {
            _this.reload().then(function(res) {
              _this.check_transcription();
            }, function(err) {
              runLater(function() {
                _this.check_transcription();
              }, 2 * 60 * 1000);
            });
          } else {
            runLater(function() {
              _this.check_transcription();
            }, 2 * 60 * 1000);
          }
        }, timeout);
      } else {
        this.set('transcription_pending', false);
      }
    }
  },
  filename: computed('url', function() {
    var url = this.get('url') || '';
    if(url.match(/^data/)) {
      return i18n.t('embedded_sound', "embedded sound");
    } else {
      var paths = url.split(/\?/)[0].split(/\//);
      var name = paths[paths.length - 1];
      if(!name.match(/\.(mp3|wav|aac|ogg)$/)) {
        name = null;
      }
      return decodeURIComponent(name || 'sound');
    }
  }),
  extension: computed('url', 'content_type', function() {
    var type = this.get('content_type');
    var url = this.get('url') || '';
    if(contentGrabbers.file_type_extensions[type]) {
      return contentGrabbers.file_type_extensions[type].replace(/\./, '');
    } else {
      var last = url.split(/\//).pop();
      var pre = last && last.split(/\?/)[0];
      var ext = pre && pre.split(/\./).length > 1 && pre.split(/\./).pop();
      if(ext && ext.length > 0) {
        return ext;
      }
    }
    return 'unknown type';
  }),
  check_for_editable_license: observer('license', 'id', function() {
    if(this.get('license') && this.get('id') && !this.get('permissions.edit')) {
      this.set('license.uneditable', true);
    }
  }),
  clean_license: function() {
    var _this = this;
    ['copyright_notice', 'source', 'author'].forEach(function(key) {
      if(_this.get('license.' + key + '_link')) {
        _this.set('license.' + key + '_url', _this.get('license.' + key + '_url') || _this.get('license.' + key + '_link'));
      }
      if(_this.get('license.' + key + '_link')) {
        _this.set('license.' + key + '_link', _this.get('license.' + key + '_link') || _this.get('license.' + key + '_url'));
      }
    });
  },
  best_url: computed('url', 'data_url', function() {
    return this.get('data_url') || this.get('url');
  }),
  checkForDataURL: function() {
    this.set('checked_for_data_url', true);
    var _this = this;
    if(!this.get('data_url') && LingoLinq.remote_url(this.get('url')) && !persistence.online) {
      return persistence.find_url(this.get('url'), 'sound').then(function(data_uri) {
        _this.set('data_url', data_uri);
        return _this;
      });
    } else if(this.get('url') && this.get('url').match(/^data/)) {
      return RSVP.resolve(this);
    }
    return RSVP.reject('no sound data url');
  },
  checkForDataURLOnChange: observer('url', function() {
    this.checkForDataURL().then(null, function() { });
  })
});
LingoLinq.Sound.reopenClass({
  mimic_server_processing: function(record, hash) {
    if(record.get('data_url')) {
      hash.sound.url = record.get('data_url');
      hash.sound.data_url = hash.sound.url;
    }
    return hash;
  }
});

export default LingoLinq.Sound;
