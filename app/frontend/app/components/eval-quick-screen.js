import Component from '@ember/component';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';
import modal from '../utils/modal';
import persistence from '../utils/persistence';
import i18n from '../utils/i18n';

/*
 * eval-quick-screen — Phase 1A container component for the 5-minute Quick Screen flow.
 *
 * Hosts the three subviews (intake, runner, report) and routes between them
 * by reading session.state. Keeps wiring shallow so Mode 2/3 can reuse the
 * same EvalSession + recommendation engine.
 */
export default Component.extend({
  router: service('router'),
  classNames: ['evq', 'evq--quick'],
  tagName: 'div',
  user: null,
  session: null,

  isConfiguring: computed('session.state', function() {
    return this.get('session.state') === 'configuring';
  }),
  isScreening: computed('session.state', function() {
    return this.get('session.state') === 'screening';
  }),
  isReviewing: computed('session.state', function() {
    return this.get('session.state') === 'reviewing';
  }),

  estimatedMinutes: computed(function() {
    return 5;
  }),

  actions: {
    intakeCompleted(intake) {
      const session = this.get('session');
      session.beginScreening(intake);
      this.notifyPropertyChange('session');
    },

    subtestEvent(event) {
      const session = this.get('session');
      session.recordEvent(event);
    },

    advanceSubtest() {
      const session = this.get('session');
      session.advanceSubtest();
      this.notifyPropertyChange('session');
    },

    reviewSession() {
      const session = this.get('session');
      session.review();
      this.notifyPropertyChange('session');
    },

    saveSession() {
      const session = this.get('session');
      const user = this.get('user');
      const _this = this;
      const userId = user && user.get ? user.get('id') : null;
      session.persist(userId).then(function() {
        if (persistence.get('online')) {
          _this.get('router').transitionTo('user.logs', userId);
        } else {
          modal.notice(i18n.t('eval_saved_offline', "Eval saved offline. It will sync when you reconnect."));
        }
      }, function() {
        modal.error(i18n.t('eval_save_failed', "Could not save eval. Please try again."));
      });
    },

    promoteToTargeted() {
      modal.notice(i18n.t('eval_targeted_coming_soon', "Targeted Eval (10-minute mode) is coming soon. The current screen has been saved."));
    },

    cancel() {
      this.get('router').transitionTo('index');
    }
  }
});
