import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { set as emberSet, get as emberGet } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import modalUtil from '../utils/modal';
import i18n from '../utils/i18n';

export default Component.extend({
  modal: service('modal'),
  appState: service('app-state'),
  router: service(),
  tagName: '',

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {},
    closing() {},

    visitUser(userName) {
      if (!userName) {
        return;
      }
      this.get('modal').close();
      runLater(
        () => {
          this.get('router').transitionTo('user', userName);
        },
        250
      );
    },

    visitBoard(boardKey) {
      if (!boardKey) {
        return;
      }
      this.get('modal').close();
      runLater(
        () => {
          this.get('router').transitionTo('board', boardKey);
        },
        250
      );
    },

    visitSuperviseeStats(userName) {
      if (!userName) {
        return;
      }
      this.get('modal').close();
      runLater(
        () => {
          this.get('router').transitionTo('user.stats', userName, {
            queryParams: {
              highlighted: null,
              start: null,
              end: null,
              device_id: null,
              location_id: null,
              split: null,
              start2: null,
              end2: null,
              device_id2: null,
              location_id2: null,
            },
          });
        },
        250
      );
    },

    visitOrgRoom(orgId, roomId) {
      this.get('modal').close();
      runLater(
        () => {
          this.get('router').transitionTo('organization.room', orgId, roomId);
        },
        250
      );
    },

    homeInSpeakMode(boardForUserId, keepAsSelf) {
      var _this = this;
      this.get('modal').close();
      runLater(function() {
        if (boardForUserId) {
          _this.appState.set_speak_mode_user(boardForUserId, true, keepAsSelf);
        } else if (
          (_this.appState.get('currentUser.permissions.delete') &&
            (_this.appState.get('currentUser.supervisees') || []).length > 0) ||
          _this.appState.get('currentUser.communicator_in_supporter_view')
        ) {
          var prompt = i18n.t('speak_as_which_user', 'Select User to Speak As');
          if (_this.appState.get('currentUser.communicator_in_supporter_view')) {
            prompt = i18n.t('speak_as_which_mode', 'Select Mode and User for Session');
          }
          _this.appState.set('referenced_speak_mode_user', null);
          _this.appState.get('controller').send('switch_communicators', {
            stay: true,
            modeling: 'ask',
            skip_me: false,
            header: prompt,
          });
        } else {
          _this.appState.home_in_speak_mode();
        }
      }, 250);
    },

    recordNoteFor(supervisee) {
      var user = supervisee || this.appState.get('currentUser');
      if (!emberGet(user, 'avatar_url_with_fallback')) {
        emberSet(user, 'avatar_url_with_fallback', emberGet(user, 'avatar_url'));
      }
      var appState = this.appState;
      this.get('modal').close();
      runLater(function() {
        appState.check_for_needing_purchase().then(
          function() {
            modalUtil.open('record-note', { note_type: 'text', user: user }).then(
              function() {
                runLater(function() {
                  appState.get('currentUser').reload().then(null, function() {});
                }, 5000);
              },
              function() {}
            );
          },
          function() {
            modalUtil.open('record-note', { note_type: 'text', user: user });
          }
        );
      }, 300);
    },

    quickAssessmentFor(supervisee) {
      this.get('modal').close();
      runLater(function() {
        if (emberGet(supervisee, 'premium') || emberGet(supervisee, 'currently_premium')) {
          modalUtil.open('quick-assessment', { user: supervisee });
        } else {
          modalUtil.open('premium-required', {
            user_name: supervisee.user_name,
            action: 'quick_assessment',
            reason: 'not_currently_premium',
          });
        }
      }, 300);
    },
  },
});
