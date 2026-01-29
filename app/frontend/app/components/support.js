import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import i18n from '../utils/i18n';

export default Component.extend({
  tagName: '',

  // Service injections
  appState: service('app-state'),
  persistence: service(),
  modal: service(),

  // State
  cookies: false,
  author_id: null,
  subject: null,
  message: null,
  email: null,
  name: null,
  disabled: false,
  error: false,

  init() {
    this._super(...arguments);
    this.opening();
  },

  opening() {
    if (this.appState.get('sessionUser')) {
      this.set('cookies', !!this.appState.get('sessionUser.preferences.cookies'));
      this.set('author_id', this.appState.get('sessionUser.id'));
    } else {
      this.set('cookies', localStorage['enable_cookies'] == 'true');
    }
  },

  ios: computed(function () {
    return window.navigator.userAgent.match(/ipad|ipod|iphone/i);
  }),

  author_ids: computed('appState.sessionUser.supervisors.[]', function () {
    var user = this.appState.get('sessionUser');
    if (!user) { return []; }
    var list = [];
    list.push({ id: user.id, name: user.name + " <" + user.email + ">" });
    (user.get('supervisors') || []).forEach(function (sup) {
      list.push({ id: sup.id, name: sup.name + " (" + sup.user_name + ")" });
    });
    list.push({ id: 'custom', name: i18n.t('other_account', "Other Account") });
    return list;
  }),

  prompt_user: computed('appState.sessionUser', 'author_id', function () {
    return !this.appState.get('sessionUser') || this.get('author_id') == 'custom';
  }),

  actions: {
    toggle_cookies: function () {
      if (this.appState.get('sessionUser')) {
        this.appState.set('sessionUser.preferences.cookies', !this.appState.get('sessionUser.preferences.cookies'));
        this.appState.get('sessionUser').save().then(() => {
          this.set('cookies', !!this.appState.get('sessionUser.preferences.cookies'));
        }, () => { });
      } else {
        this.appState.toggle_cookies(localStorage['enable_cookies'] != 'true');
        this.set('cookies', localStorage['enable_cookies'] == 'true');
      }
    },

    submit_message: function () {
      if (!this.get('email') && !this.appState.get('currentUser')) { return; }
      var message = {
        name: this.get('name'),
        email: this.get('email'),
        author_id: this.get('author_id'),
        recipient: 'support',
        subject: this.get('subject'),
        locale: i18n.langs.preferred,
        message: this.get('message')
      };
      this.set('disabled', true);
      this.set('error', false);
      this.persistence.ajax('/api/v1/messages', {
        type: 'POST',
        data: {
          message: message
        }
      }).then(() => {
        this.set('disabled', false);
        this.modal.success(i18n.t('message_delivered', "Message sent! Thank you for reaching out!"));
        this.modal.close();
      }, () => {
        this.set('error', true);
        this.set('disabled', false);
      });
    },

    close: function() {
      this.modal.close();
    }
  }
});
