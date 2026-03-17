import app_state from '../utils/app_state';
import modal from '../utils/modal';
import persistence from '../utils/persistence';
import i18n from '../utils/i18n';
import { computed } from '@ember/object';

export default modal.ModalController.extend({
  _cookiesEnabled: function(val) {
    return val === true || val === 'true';
  },
  opening: function() {
    if(app_state.get('sessionUser')) {
      this.set('cookies', this._cookiesEnabled(app_state.get('sessionUser.preferences.cookies')));
    } else {
      this.set('cookies', localStorage['enable_cookies'] == 'true');
    }
  },
  ios: computed(function() {
    return window.navigator.userAgent.match(/ipad|ipod|iphone/i);
  }),
  author_ids: computed('sessionUser.supervisors', function() {
    var list = [];
    list.push({id: app_state.get('sessionUser.id'), name: app_state.get('sessionUser.name') + " <" + app_state.get('sessionUser.email') + ">"});
    app_state.get('sessionUser.supervisors').forEach(function(sup) {
      list.push({id: sup.id, name: sup.name + " (" + sup.user_name + ")"});
    });
    list.push({id: 'custom', name: i18n.t('other_account', "Other Account")});
    return list;
  }),
  prompt_user: computed('app_state.sessionUser', 'author_id', function() {
    return !app_state.get('sessionUser') || this.get('author_id') == 'custom';
  }),
  actions: {
    toggle_cookies: function() {
      var _this = this;
      if(app_state.get('sessionUser')) {
        app_state.set('sessionUser.watch_cookies', true);
        var currentlyEnabled = _this._cookiesEnabled(app_state.get('sessionUser.preferences.cookies'));
        app_state.set('sessionUser.preferences.cookies', !currentlyEnabled);
        app_state.get('sessionUser').save().then(function() {
          _this.set('cookies', _this._cookiesEnabled(app_state.get('sessionUser.preferences.cookies')));
        }, function() { });
      } else {
        app_state.toggle_cookies(localStorage['enable_cookies'] != 'true');
        this.set('cookies', localStorage['enable_cookies'] == 'true');
      }
    },
    submit_message: function() {
      if(!this.get('email') && !app_state.get('currentUser')) { return; }
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
      persistence.ajax('/api/v1/messages', {
        type: 'POST',
        data: {
          message: message
        }
      }).then(function(res) {
        _this.set('disabled', false);
        modal.success(i18n.t('message_delivered', "Message sent! Thank you for reaching out!"));
        modal.close();
      }, function() {
        _this.set('error', true);
        _this.set('disabled', false);
      });

    }
  }
});
