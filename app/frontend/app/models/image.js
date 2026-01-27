import RSVP from 'rsvp';
import DS from 'ember-data';
import LingoLinq from '../app';
import i18n from '../utils/i18n';
import { inject as service } from '@ember/service';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

LingoLinq.Image = DS.Model.extend({
  appState: service('app-state'),
  persistence: service('persistence'),

  // init removed as explicit injection handles it
  // Clean license when license attribute is loaded
  // This replicates the old didLoad() behavior since init() runs before data is loaded
  onLicenseLoad: observer('license', function() {
    this.clean_license();
  }),
  url: DS.attr('string'),
  fallback: DS.attr('boolean'),
  content_type: DS.attr('string'),
  width: DS.attr('number'),
  height: DS.attr('number'),
  hc: DS.attr('boolean'),
  pending: DS.attr('boolean'),
  avatar: DS.attr('boolean'),
  badge: DS.attr('boolean'),
  protected: DS.attr('boolean'),
  protected_source: DS.attr('string'),
  suggestion: DS.attr('string'),
  external_id: DS.attr('string'),
  search_term: DS.attr('string'),
  button_label: DS.attr('string'),
  source_url: DS.attr('string'),
  license: DS.attr('raw'),
  alternates: DS.attr('raw'),
  permissions: DS.attr('raw'),
  file: DS.attr('boolean'),
  filename: computed('url', function() {
    var url = this.get('url') || '';
    if(url.match(/^data/)) {
      return i18n.t('embedded_image', "embedded image");
    } else {
      var paths = url.split(/\?/)[0].split(/\//);
      var name = paths[paths.length - 1];
      if(!name.match(/\.(png|gif|jpg|jpeg|svg)$/)) {
        name = null;
      }
      return decodeURIComponent(name || 'image');
    }
  }),
  skinned: computed('url', function() {
    return LingoLinq.Board.is_skinned_url(this.get('url'));
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
  license_string: computed('license', 'license.type', function() {
    var license = this.get('license');
    if(!license || !license.type) {
      return i18n.t('unknown_license', "Unknown. Assume all rights reserved");
    } else if(license.type == 'private') {
      return i18n.t('all_rights_reserved', "All rights reserved");
    } else {
      return license.type;
    }
  }),
  author_url_or_email: computed('license', 'license.author_url', 'license.author_email', function() {
    var license = this.get('license') || {};
    if(license.author_url) {
      return license.author_url;
    } else if(license.author_email) {
      return license.author_email;
    } else {
      return null;
    }
  }),
  check_for_editable_license: observer('license', 'id', 'permissions.edit', function() {
    if(this.get('license') && this.get('id') && !this.get('permissions.edit')) {
      this.set('license.uneditable', true);
    }
  }),
  personalizing_url: function(skip_alternates) {
    LingoLinq.Image.unskins = LingoLinq.Image.unskins || {};
    var preferred_symbols = this.get('appState.referenced_user.preferences.preferred_symbols') || 'original';
    var url = this.get('url');
    if(skip_alternates) {
      preferred_symbols = 'original';
    }
    if(this.get('alternates') && this.get('alternates').find) {
      var alternate = (this.get('alternates') || []).find(function(a) { return a.library == preferred_symbols; });
      if(alternate) { url = alternate.url; }
    }
    return LingoLinq.Image.personalize_url(url, this.get('appState.currentUser.user_token'), this.get('appState.referenced_user.preferences.skin'), LingoLinq.Image.unskins[this.get('id')]);
  },
  personalized_url: computed('url', 'appState.currentUser.user_token', 'appState.referenced_user.preferences.skin', 'appState.referenced_user.preferences.preferred_symbols', 'appState.edit_mode', function() {
    return this.personalizing_url();
  }),
  personalized_url_without_preferred_symbols: computed('url', 'appState.currentUser.user_token', 'appState.referenced_user.preferences.skin', 'appState.referenced_user.preferences.preferred_symbols', 'appState.edit_mode', function() {
    return this.personalizing_url(true);
  }),
  best_url: computed('personalized_url', 'appState.referenced_user.preferences.preferred_symbols', 'data_url', function() {
    return this.get('data_url') || this.get('personalized_url') || "";
  }),
  best_url_without_preferred_symbols: computed('personalized_url', 'data_url', 'data_url_no_sym', 'appState.referenced_user.preferences.preferred_symbols', function() {
    return this.get('data_url_no_sym') || this.personalizing_url(true) || this.get('data_url') || "";
  }),
  checkForDataURL: function() {
    this.set('checked_for_data_url', true);
    var _this = this;
    var found_one = function(data_uri) {
      _this.set('data_url', data_uri);
      if(data_uri && data_uri.match(/^file/)) {
        var img = new Image();
        img.src = data_uri;
      }
      return _this;
    };
    if(!this.get('data_url_no_sym') && LingoLinq.remote_url(this.get('personalized_url_without_preferred_symbols'))) {
      return _this.persistence.find_url(this.get('personalized_url_without_preferred_symbols'), 'image').then(function(data_uri) {
        _this.set('data_url_no_sym', data_uri);
      });
    }
    if(!this.get('data_url') && LingoLinq.remote_url(this.get('personalized_url'))) {
      return _this.persistence.find_url(this.get('personalized_url'), 'image').then(function(data_uri) {
        // Found as expected!
        return found_one(data_uri);
      }, function(err) {
        var unvarianted_image_url = _this.get('personalized_url') && _this.get('personalized_url').replace(/\.variant-.+\.(png|svg)$/, '');
        if(unvarianted_image_url != _this.get('personalized_url')) {
          return _this.persistence.find_url(unvarianted_image_url, 'image').then(function(data_uri) {
            // Found, but without the correct variant
            return found_one(data_uri);
          }, function(err) {
            return _this.persistence.find_url(this.get('personalized_url_without_preferred_symbols'), 'image').then(function(data_uri) {
              // Found but without the correct symbol preference
              return found_one(data_uri);
            });
          });    
        } else {
          return RSVP.reject(err);
        }
        
      });
    } else if(this.get('url') && this.get('url').match(/^data/)) {
      return RSVP.resolve(this);
    }
    return RSVP.reject('no image data url');
  },
  checkForDataURLOnChange: observer('personalized_url', 'personalized_url_without_preferred_symbols', function() {
    this.checkForDataURL().then(null, function() { });
  })
});

LingoLinq.Image.reopenClass({
  personalize_url: function(url, token, skin, unskin) {
    url = url || '';
    var res = url;
    if(url.match(/api\/v1\//) && url.match(/lessonpix/) && token) {
      res = url + "?user_token=" + token;
    }
    if(skin && skin != 'default') {
      var which_skin = LingoLinq.Board.which_skinner(skin);
      res = LingoLinq.Board.skinned_url(url, which_skin, unskin);
    }
    return res;
  },
  mimic_server_processing: function(record, hash) {
    if(record.get('data_url')) {
      hash.image.url = record.get('data_url');
      hash.image.data_url = hash.image.url;
    }
    return hash;
  }
});

export default LingoLinq.Image;
