import Component from '@ember/component';
import $ from 'jquery';
import lingoLinqExtras from '../utils/extras';
import app_state from '../utils/app_state';
import modal from '../utils/modal';
import capabilities from '../utils/capabilities';
import i18n from '../utils/i18n';
import { computed } from '@ember/object';

export default Component.extend({
  tagName: 'span',
  didInsertElement: function() {
    if(this.get('utterance') && this.get('utterance').check_for_large_image_url) {
      this.get('utterance').check_for_large_image_url();
    }
    this.check_native_shares();
  },
  check_native_shares: function() {
    var _this = this;
    _this.set('native', {});
    capabilities.sharing.available().then(function(list) {
      if(list.indexOf('facebook') != -1) { _this.set('native.facebook', true); }
      if(list.indexOf('twitter') != -1) { _this.set('native.twitter', true); }
      if(list.indexOf('instagram') != -1) { _this.set('native.instagram', true); }
      if(list.indexOf('email') != -1) { _this.set('native.email', true); }
      if(list.indexOf('clipboard') != -1) { _this.set('native.clipboard', true); }
      if(list.indexOf('generic') != -1) { _this.set('native.generic', true); }
    });
  },
  facebook_enabled: computed('url', 'native.generic', 'native.facebook', function() {
    return !!(this.get('url') && (!this.get('native.generic') || this.get('native.facebook')));
  }),
  twitter_enabled: computed('url', 'native.generic', 'native.twitter', function() {
    return !!(this.get('url') && (!this.get('native.generic') || this.get('native.twitter')));
  }),
  email_enabled: computed('text', function() {
    return !!this.get('text');
  }),
  instagram_enabled: computed('url', 'native.instagram', 'utterance.best_image_url', function() {
    return !!(this.get('url') && this.get('native.instagram') && this.get('utterance.best_image_url'));
  }),
  clipboard_enabled: computed('native.clipboard', function() {
    if(document.queryCommandSupported && document.queryCommandSupported('copy')) {
      return true;
    } else {
      return !!this.get('native.clipboard');
    }
  }),
  generic_enabled: computed('url', 'native.generic', function() {
    return !!(this.get('url') && this.get('native.generic'));
  }),
  facebook_url: computed('url', function() {
    return 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(this.get('url'));
  }),
  twitter_url: computed('url', 'text', function() {
    var res = 'https://twitter.com/intent/tweet?url=' + encodeURIComponent(this.get('url')) + '&text=' + encodeURIComponent(this.get('text'));
    if(app_state.get('domain_settings.twitter_handle')) {
      res = res + '&related=' + encodeURIComponent(app_state.get('domain_settings.twitter_handle'));
    }
    return res;
  }),
  actions: {
    message: function(supervisor) {
      modal.open('confirm-notify-user', {user: supervisor, utterance: this.get('utterance'), sentence: this.get('utterance.sentence')});
    },
    share_via: function(medium) {
      if(this.get('native.' + medium)) {
        // TODO: download the image locally first??
        capabilities.sharing.share(medium, this.get('text'), this.get('url'), this.get('utterance.best_image_url'));
      } else if(medium == 'facebook') {
        capabilities.window_open(this.get('facebook_url'));
      } else if(medium == 'twitter') {
        capabilities.window_open(this.get('twitter_url'));
      } else if(medium == 'email') {
        modal.open('share-email', {url: this.get('url'), text: this.get('text'), utterance_id: this.get('utterance.id') });
      } else if(medium == 'clipboard' && this.get('clipboard_enabled')) {
        var res = false
        if(this.get('native.clipboard')) {
          capabilities.sharing.share('clipboard', this.get('text'));
          res = true;
        } 
        if(!res) {
          var $elem = $("#" + this.get('element_id'));
          window.getSelection().removeAllRanges();
          var text = $elem[0].innerText;
          if($elem[0].tagName == 'INPUT') {
            $elem.focus().select();
            text = $elem.val();
          } else {
            var range = document.createRange();
            range.selectNode($elem[0]);
            window.getSelection().addRange(range);
          }
          res = document.execCommand('copy');
          if(!res) {
            capabilities.sharing.copy_text(text);
          }
          window.getSelection().removeAllRanges();
        }
        this.sendAction('copy_event', !!res);
      }
    }
  }
});