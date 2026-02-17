import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { set as emberSet } from '@ember/object';
import { computed, observer } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import { htmlSafe } from '@ember/template';
import $ from 'jquery';
import modal from '../utils/modal';
import capabilities from '../utils/capabilities';
import app_state from '../utils/app_state';
import utterance from '../utils/utterance';
import LingoLinq from '../app';
import persistence from '../utils/persistence';
import stashes from '../utils/_stashes';

/**
 * Share Utterance modal (Phase 2).
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  store: service('store'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'share-utterance';
    const settings = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                     (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                     {};
    this.set('model', settings);
  },

  didInsertElement() {
    this._super(...arguments);
    this.set('copy_result', null);
    const settings = this.get('model');
    this.set('utterance', settings.utterance);
    const u = this.get('store').createRecord('utterance', {
      button_list: settings.utterance,
      timestamp: (new Date()).getTime() / 1000,
      sentence: utterance.sentence(settings.utterance),
      user_id: app_state.get('referenced_user.id')
    });
    this.set('text_only', !!app_state.get('text_only_shares') || !!stashes.get('text_only_shares'));
    u.assert_remote_urls();
    u.save().then((rec) => {
      this.set('utterance_record', rec);
    }, () => {
      this.set('utterance_record_error', true);
    });
    this.check_native_shares();
  },

  contacts: computed(
    'appState.referenced_user.supervisors',
    'appState.referenced_user.known_supervisees',
    'appState.referenced_user.supporter_role',
    'appState.referenced_user.contacts',
    'appState.reply_note',
    function() {
      let res = [];
      (app_state.get('referenced_user.contacts') || []).forEach(function(contact) {
        res.push({
          user_name: contact.name,
          avatar_url: contact.image_url,
          id: app_state.get('referenced_user.id') + 'x' + contact.hash
        });
      });
      if (app_state.get('referenced_user.supporter_role')) {
        res = res.concat(app_state.get('referenced_user.known_supervisees') || []);
      } else {
        res = res.concat(app_state.get('referenced_user.supervisors') || []);
      }
      if (app_state.get('reply_note.author')) {
        res.unshift({
          user_name: app_state.get('reply_note.author.name'),
          id: app_state.get('reply_note.author.id'),
          avatar_url: app_state.get('reply_note.author.image_url'),
          reply: app_state.get('reply_note')
        });
      }
      res.forEach(function(contact) {
        if (LingoLinq.remote_url(contact.avatar_url)) {
          persistence.find_url(contact.avatar_url, 'image').then(function(uri) {
            emberSet(contact, 'avatar_url', uri);
          }, function() {});
        }
      });
      return res;
    }
  ),

  sentence: computed('utterance', function() {
    if (this.get('utterance')) {
      return utterance.sentence(this.get('utterance'));
    }
    return '';
  }),

  update_text_only_shares: observer('text_only', function() {
    app_state.set('text_only_shares', !!this.get('text_only'));
    if (app_state.get('referenced_user.id') === app_state.get('sessionUser.id')) {
      stashes.persist('text_only_shares', !!this.get('text_only'));
    }
  }),

  escaped_sentence: computed('sentence', function() {
    return encodeURIComponent(this.get('sentence'));
  }),

  check_native_shares() {
    const _this = this;
    _this.set('native', {});
    if (app_state.get('referenced_user.preferences.sharing') !== false) {
      capabilities.sharing.available().then(function(list) {
        if (list.indexOf('facebook') !== -1) { _this.set('native.facebook', true); }
        if (list.indexOf('twitter') !== -1) { _this.set('native.twitter', true); }
        if (list.indexOf('instagram') !== -1) { _this.set('native.instagram', true); }
        if (list.indexOf('email') !== -1) { _this.set('native.email', true); }
        if (list.indexOf('clipboard') !== -1) { _this.set('native.clipboard', true); }
        if (list.indexOf('generic') !== -1) { _this.set('native.generic', true); }
      });
    }
  },

  shares: computed(
    'utterance_record.link',
    'text_only',
    'native',
    'native.generic',
    'native.facebook',
    'native.twitter',
    'native.instagram',
    'native.clipboard',
    function() {
      const res = {};
      if (this.get('utterance_record.link')) {
        res.facebook = true;
        res.twitter = true;
      }
      const native = this.get('native');
      for (const key in native) {
        if (native[key] && this.get('utterance_record.link')) {
          res[key] = true;
        }
      }
      if (!this.get('utterance.best_image_url') || this.get('text_only')) {
        res.instagram = false;
      }
      if (document.queryCommandSupported && document.queryCommandSupported('copy')) {
        res.clipboard = true;
      }
      return res;
    }
  ),

  facebook_url: computed('utterance_record.link', function() {
    return 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(this.get('utterance_record.link'));
  }),

  twitter_url: computed('utterance_record.link', 'sentence', function() {
    let res = 'https://twitter.com/intent/tweet?url=' + encodeURIComponent(this.get('utterance_record.link')) + '&text=' + encodeURIComponent(this.get('sentence'));
    if (app_state.get('domain_settings.twitter_handle')) {
      res = res + '&related=' + encodeURIComponent(app_state.get('domain_settings.twitter_handle'));
    }
    return res;
  }),

  clipboard_class: computed('copy_result', function() {
    if (this.get('copy_result.succeeded')) {
      return htmlSafe('btn btn-success');
    }
    if (this.get('copy_result.failed')) {
      return htmlSafe('btn btn-danger');
    }
    return htmlSafe('btn btn-default');
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    copy_event(res) {
      if (res) {
        this.set('copy_result', { succeeded: true });
        runLater(() => {
          modal.close();
        }, 3000);
      } else {
        this.set('copy_result', { failed: true });
      }
    },
    message(user) {
      modal.open('confirm-notify-user', {
        user: user,
        reply: user.reply,
        raw: this.get('utterance'),
        sentence: this.get('sentence'),
        utterance: this.get('utterance_record')
      });
    },
    share_via(medium) {
      const image_url = this.get('text_only') ? null : this.get('utterance_record.best_image_url');
      if (this.get('native.' + medium)) {
        capabilities.sharing.share(medium, this.get('sentence'), this.get('utterance_record.link'), image_url);
        this.get('modal').close();
      } else if (medium === 'facebook') {
        capabilities.window_open(this.get('facebook_url'));
        this.get('modal').close();
      } else if (medium === 'twitter') {
        capabilities.window_open(this.get('twitter_url'));
        this.get('modal').close();
      } else if (medium === 'link') {
        capabilities.window_open(this.get('utterance_record.link'));
        this.get('modal').close();
      } else if (medium === 'email') {
        modal.open('share-email', {
          url: this.get('utterance_record.link'),
          text: this.get('sentence'),
          utterance_id: this.get('utterance_record.id')
        });
      } else if (medium === 'big_text') {
        modal.open('modals/big-button', {
          text: this.get('sentence'),
          text_only: app_state.get('referenced_user.preferences.device.button_text_position') === 'text_only'
        });
      } else if (medium === 'clipboard' && this.get('shares.clipboard')) {
        const $elem = $('#utterance_sentence');
        window.getSelection().removeAllRanges();
        let text = $elem[0].innerText;
        if ($elem[0].tagName === 'INPUT') {
          $elem.focus().select();
          text = $elem.val();
        } else {
          const range = document.createRange();
          range.selectNode($elem[0]);
          window.getSelection().addRange(range);
        }
        let res = document.execCommand('copy');
        if (!res) {
          const textArea = document.createElement('textArea');
          textArea.value = text;
          document.body.appendChild(textArea);
          const range2 = document.createRange();
          range2.selectNodeContents(textArea);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range2);
          textArea.setSelectionRange(0, 999999);
          res = document.execCommand('copy');
          document.body.removeChild(textArea);
        }
        window.getSelection().removeAllRanges();
        this.send('copy_event', !!res);
      }
    }
  }
});
