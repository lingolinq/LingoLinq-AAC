import modal from '../utils/modal';
import i18n from '../utils/i18n';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  appState: service('app-state'),
  persistence: service(),
  modal: service(),

  opening: function () {
    if (this.appState.get('sessionUser')) {
      this.set('cookies', !!this.appState.get('sessionUser.preferences.cookies'));
    } else {
      this.set('cookies', localStorage['enable_cookies'] == 'true');
    }
  },
  ios: computed(function () {
    return window.navigator.userAgent.match(/ipad|ipod|iphone/i);
  }),
  author_ids: computed('sessionUser.supervisors', function () {
    var list = [];
    list.push({ id: this.appState.get('sessionUser.id'), name: this.appState.get('sessionUser.name') + " <" + this.appState.get('sessionUser.email') + ">" });
    this.appState.get('sessionUser.supervisors').forEach(function (sup) {
      list.push({ id: sup.id, name: sup.name + " (" + sup.user_name + ")" });
    });
    list.push({ id: 'custom', name: i18n.t('other_account', "Other Account") });
    return list;
  }),
  prompt_user: computed('app_state.sessionUser', 'author_id', function () {
    return !this.appState.get('sessionUser') || this.get('author_id') == 'custom';
  }),
  actions: {
    toggle_cookies: function () {
      var _this = this;
      if (this.appState.get('sessionUser')) {
        this.appState.set('sessionUser.watch_cookies');
        this.appState.set('sessionUser.preferences.cookies', !this.appState.get('sessionUser.preferences.cookies'));
        this.appState.get('sessionUser').save().then(function () {
          _this.set('cookies', !!this.appState.get('sessionUser.preferences.cookies'));
        }, function () { });
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
      var _this = this;
      this.set('disabled', true);
      this.set('error', false);
      this.persistence.ajax('/api/v1/messages', {
        type: 'POST',
        data: {
          message: message
        }
      }).then(function (res) {
        _this.set('disabled', false);
        this.modal.success(i18n.t('message_delivered', "Message sent! Thank you for reaching out!"));
        this.modal.close();
      }, function () {
        _this.set('error', true);
        _this.set('disabled', false);
      });

    }
  }
});
