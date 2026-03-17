import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import modal from '../utils/modal';
import i18n from '../utils/i18n';

/**
 * Support modal component (Phase 2: non-modals/ prefix).
 * Converted from support controller/template.
 */
export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  persistence: service('persistence'),
  tagName: '',

  init() {
    this._super(...arguments);
    const appState = this.get('appState');
    if (appState.get('sessionUser')) {
      this.set('cookies', this._cookiesEnabled(appState.get('sessionUser.preferences.cookies')));
    } else {
      this.set('cookies', localStorage['enable_cookies'] === 'true');
    }
  },

  _cookiesEnabled(val) {
    return val === true || val === 'true';
  },

  ios: computed(function() {
    return window.navigator.userAgent.match(/ipad|ipod|iphone/i);
  }),

  author_ids: computed('appState.sessionUser.supervisors', 'appState.sessionUser.id', function() {
    const appState = this.get('appState');
    const list = [];
    const sessionUser = appState.get('sessionUser');
    if (sessionUser) {
      list.push({
        id: sessionUser.id,
        name: sessionUser.get('name') + ' <' + sessionUser.get('email') + '>'
      });
      (sessionUser.get('supervisors') || []).forEach(function(sup) {
        list.push({ id: sup.id, name: sup.name + ' (' + sup.user_name + ')' });
      });
    }
    list.push({ id: 'custom', name: i18n.t('other_account', 'Other Account') });
    return list;
  }),

  prompt_user: computed('appState.sessionUser', 'author_id', function() {
    return !this.get('appState.sessionUser') || this.get('author_id') === 'custom';
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},
    toggle_cookies() {
      const appState = this.get('appState');
      if (appState.get('sessionUser')) {
        appState.set('sessionUser.watch_cookies', true);
        const currentlyEnabled = this._cookiesEnabled(appState.get('sessionUser.preferences.cookies'));
        appState.set('sessionUser.preferences.cookies', !currentlyEnabled);
        appState.get('sessionUser').save().then(() => {
          this.set('cookies', this._cookiesEnabled(appState.get('sessionUser.preferences.cookies')));
        }, function() {});
      } else {
        appState.toggle_cookies(localStorage['enable_cookies'] !== 'true');
        this.set('cookies', localStorage['enable_cookies'] === 'true');
      }
    },
    updateAuthorId(id) {
      this.set('author_id', id);
    },
    show_speak_mode_intro_again() {
      const appState = this.get('appState');
      const user = appState.get('currentUser');
      if (!user) { return; }
      const progress = user.get('preferences.progress') || {};
      delete progress.speak_mode_intro_done;
      user.set('preferences.progress', progress);
      appState.set('speak-mode-intro', false);
      user.save().then(() => {
        this.get('modal').close();
        this.get('modal').open('speak-mode-intro');
      }, function() {});
    },
    submit_message() {
      if (!this.get('email') && !this.get('appState.currentUser')) { return; }
      const message = {
        name: this.get('name'),
        email: this.get('email'),
        author_id: this.get('author_id'),
        recipient: 'support',
        subject: this.get('subject'),
        locale: i18n.langs.preferred,
        message: this.get('message')
      };
      const _this = this;
      this.set('disabled', true);
      this.set('error', false);
      this.get('persistence').ajax('/api/v1/messages', {
        type: 'POST',
        data: { message: message }
      }).then(function() {
        _this.set('disabled', false);
        modal.success(i18n.t('message_delivered', 'Message sent! Thank you for reaching out!'));
        modal.close();
      }, function() {
        _this.set('error', true);
        _this.set('disabled', false);
      });
    }
  }
});
