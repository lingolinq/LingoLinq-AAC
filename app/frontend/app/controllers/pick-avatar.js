import EmberObject from '@ember/object';
import { set as emberSet, get as emberGet } from '@ember/object';
import modal from '../utils/modal';
import app_state from '../utils/app_state';
import i18n from '../utils/i18n';
import contentGrabbers from '../utils/content_grabbers';
import Utils from '../utils/misc';
import LingoLinq from '../app';
import { htmlSafe } from '@ember/string';
import editManager from '../utils/edit_manager';
import { observer } from '@ember/object';
import { computed } from '@ember/object';

export default modal.ModalController.extend({
  opening: function() {
    var _this = this;
    _this.set('editable', false);
    _this.set('editing', false);
    _this.set('saving', false);
    contentGrabbers.avatar_result = function(success, result) {
      _this.set('loading_avatar', false);
      if(success) {
        if(result == 'loading') {
          _this.set('loading_avatar', true);
        } else {
          editManager.stash_image({url: result.get('data_url')});
          _this.set('editable', true);
          _this.set('model.user.avatar_url', result.get('url'));
        }
      } else {
        modal.error(i18n.t('avatar_upload_failed', "Profile pic failed to upload"));
      }
    };
    contentGrabbers.avatar_result.size = 800;
  },
  closing: function() {
    contentGrabbers.avatar_result = null;
  },
  avatar_examples: LingoLinq.avatarUrls.concat(LingoLinq.iconUrls),
  avatar_options: computed(
    'model.user.prior_avatar_urls',
    'model.user.fallback_avatar_url',
    'mode.user.avatar_url',
    function() {
      var res = [];
      if(this.get('model.user.avatar_url')) {
        res.push({selected: true, alt: i18n.t('current_avatar', 'current pic'), url: this.get('model.user.avatar_url')});
      }
      (this.get('model.user.prior_avatar_urls') || []).forEach(function(url, idx) {
        res.push({alt: i18n.t('prior_idx', "prior pic %{idx}", {idx: idx}), url: url});
      });
      res = res.concat(this.get('avatar_examples'));
      if(this.get('model.user.fallback_avatar_url')) {
        res.push({alt: i18n.t('fallback', 'fallback'), url: this.get('model.user.fallback_avatar_url')});
      }
      res.forEach(function(option) {
        var url = option.url.replace(/\(/, '\\(').replace(/\)/, '\\)'); //Ember.Handlebars.Utils.escapeExpression(option.url).replace(/\(/, '\\(').replace(/\)/, '\\)');
        emberSet(option, 'div_style', htmlSafe("height: 0; width: 100%; padding-bottom: 100%; overflow: hidden; background-position: center; background-repeat: no-repeat; background-size: contain; background-image: url(" + url + ");"));
      });

      res = Utils.uniq(res, function(o) { return o.url; });
      return res;
    }
  ),
  update_selected: observer('model.user.avatar_url', function() {
    var url = this.get('model.user.avatar_url');
    if(url && this.get('avatar_options')) {
      this.get('avatar_options').forEach(function(o) {
        emberSet(o, 'selected', o.url == url);
      });
    }
  }),
  actions: {
    pick: function(option) {
      modal.close({image_url: option.url});
    },
    edit_image_url: function() {
      this.set('editing', !this.get('editing'));
    },
    save_edit: function() {
      var _this = this;
      _this.set('saving', true);
      editManager.get_edited_image().then(function(url) {
        var content_type = (url.split(/:/)[1] || "").split(/;/)[0];
        var image = LingoLinq.store.createRecord('image', {
          url: url,
          content_type: content_type,
          width: contentGrabbers.pictureGrabber.default_size,
          height: contentGrabbers.pictureGrabber.default_size,
          avatar: true,
          badge: false,
          license: {
            type: 'private'
          }
        });
        contentGrabbers.save_record(image).then(function(res) {
          _this.set('saving', false);
          _this.set('model.user.avatar_url', res.get('url'));
          _this.send('select');
        }, function(err) {
          _this.set('saving', false);
          modal.error(i18n.t('error_editing_image', "Failed to save edited image"));
        });
      }, function(err) {
        _this.set('saving', false);
        modal.error(i18n.t('error_getting_image', "Failed to retrieve edited image"));
      });
    },
    select: function() {
      var user = this.get('model.user');
      var url = this.get('model.user.avatar_url');
      if(user && user.save) {
        user.set('avatar_data_uri', null);
        user.save().then(function() {
          user.checkForDataURL().then(null, function() { });
          modal.close({image_url: url});
        }, function() {
          modal.error(i18n.t('avatar_update_failed', "Failed to save updated avatar"));
        });
      } else {
        modal.close({image_url: url});
      }
    }
  }
});

