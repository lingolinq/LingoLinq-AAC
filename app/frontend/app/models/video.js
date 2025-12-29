import RSVP from 'rsvp';
import DS from 'ember-data';
import LingoLinq from '../app';
import i18n from '../utils/i18n';
import persistence from '../utils/persistence';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

LingoLinq.Video = DS.Model.extend({
  init() {
    this._super(...arguments);
    // Clean license on initialization
    this.clean_license();
  },
  url: DS.attr('string'),
  content_type: DS.attr('string'),
  duration: DS.attr('number'),
  pending: DS.attr('boolean'),
  license: DS.attr('raw'),
  permissions: DS.attr('raw'),
  file: DS.attr('boolean'),
  filename: computed('url', function() {
    var url = this.get('url') || '';
    if(url.match(/^data/)) {
      return i18n.t('embedded_video', "embedded video");
    } else {
      var paths = url.split(/\?/)[0].split(/\//);
      var name = paths[paths.length - 1];
      if(!name.match(/\.(webm|mp4|avi|ogg|ogv)$/)) {
        name = null;
      }
      return decodeURIComponent(name || 'video');
    }
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
      return persistence.find_url(this.get('url'), 'video').then(function(data_uri) {
        _this.set('data_url', data_uri);
        return _this;
      });
    } else if(this.get('url') && this.get('url').match(/^data/)) {
      return RSVP.resolve(this);
    }
    return RSVP.reject('no video data url');
  },
  checkForDataURLOnChange: observer('url', function() {
    this.checkForDataURL().then(null, function() { });
  })
});

LingoLinq.Video.reopenClass({
  mimic_server_processing: function(record, hash) {
    if(record.get('data_url')) {
      hash.video.url = record.get('data_url');
      hash.video.data_url = hash.video.url;
    }
    return hash;
  }
});

export default LingoLinq.Video;
