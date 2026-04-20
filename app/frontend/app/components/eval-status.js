import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { get as emberGet } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import i18n from '../utils/i18n';
import persistence from '../utils/persistence';
import session from '../utils/session';
import progress_tracker from '../utils/progress_tracker';
import modalUtil from '../utils/modal';
import RSVP from 'rsvp';

/**
 * Eval Status Modal Component
 *
 * Converted from modals/eval-status template/controller to component
 * for the new service-based modal system.
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    const modalService = this.get('modal');
    const template = 'modals/eval-status';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
    this.set('user', null);
    this.set('choice', {});
    this.set('status', null);
    this.set('home_board_key', null);
    this.set('symbol_library', null);
    this.set('reset_user_name', '');
    this.set('reset_email', '');
    this.set('reset_password', '');
    this.set('eval_expires', '');
    this.set('extend_date', '');
    this.set('transfer_user_name', '');
    this.set('transfer_password', '');
  },

  org_board_keys: computed('user.org_board_keys', function() {
    const res = [];
    (this.get('user.org_board_keys') || []).forEach(function(key) {
      res.push({ id: key, name: i18n.t('copy_of_board_key', "Copy of %{k}", { k: key }) });
    });
    if (res.length === 0) { return null; }
    res.push({ id: 'none', name: i18n.t('dont_set', "[ Don't Set a Home Board ]") });
    return res;
  }),

  org_board_set: computed('home_board_key', function() {
    return this.get('home_board_key') && this.get('home_board_key') !== 'none';
  }),

  symbol_libraries: computed('user', function() {
    const u = this.get('user');
    const list = [
      { name: i18n.t('original_symbols', "Default symbols"), id: 'original' },
      { name: i18n.t('use_opensymbols', "Opensymbols.org"), id: 'opensymbols' }
    ];
    if (u && (emberGet(u, 'extras_enabled') || emberGet(u, 'subscription.extras_enabled'))) {
      list.push({ name: i18n.t('use_lessonpix', "LessonPix symbol library"), id: 'lessonpix' });
      list.push({ name: i18n.t('use_symbolstix', "SymbolStix Symbols"), id: 'symbolstix' });
      list.push({ name: i18n.t('use_pcs', "PCS Symbols by Tobii Dynavox"), id: 'pcs' });
    }
    list.push({ name: i18n.t('use_twemoji', "Emoji icons (authored by Twitter)"), id: 'twemoji' });
    list.push({ name: i18n.t('use_noun-project', "Noun Project black outlines"), id: 'noun-project' });
    list.push({ name: i18n.t('use_arasaac', "ARASAAC free symbols"), id: 'arasaac' });
    list.push({ name: i18n.t('use_tawasol', "Tawasol"), id: 'tawasol' });
    return list;
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
      this.set('user', this.get('model.user'));
      this.set('status', null);
      const choice = {};
      const action = this.get('model.action');
      if (action) { choice[action] = true; }
      this.set('choice', choice);
      this.set('home_board_key', null);
      const user = this.get('user');
      if (user && user.get('org_board_keys') && user.get('org_board_keys').length) {
        this.set('home_board_key', user.get('org_board_keys')[0]);
      }
      if (user && user.get('subscription.eval_expires')) {
        this.set('extend_date', window.moment(user.get('subscription.eval_expires')).add(7, 'day').toISOString().substring(0, 10));
      }
      const days = user && (user.get('preferences.eval.duration') || 90);
      this.set('eval_expires', window.moment().add(days || 90, 'day').toISOString().substring(0, 10));
      if (user) {
        user.reload();
      }
    },
    closing() {},
    choose(action) {
      const choice = {};
      if (action) { choice[action] = true; }
      this.set('choice', choice);
    },
    transfer() {
      const _this = this;
      if (this.get('user.permissions.delete') && this.get('transfer_user_name') && this.get('transfer_password')) {
        this.set('status', { transferring: true });
        persistence.ajax('/api/v1/users/' + this.get('user.id') + '/evals/transfer', {
          type: 'POST',
          data: {
            user_name: this.get('transfer_user_name'),
            password: this.get('transfer_password')
          }
        }).then(function(res) {
          progress_tracker.track(res.progress, function(event) {
            if (event.status === 'errored') {
              _this.set('status', { transfer_error: true });
            } else if (event.status === 'finished') {
              _this.set('status', { transfer_finished: true });
              runLater(function() {
                session.invalidate(true);
              }, 2000);
            }
          });
        }, function(error) {
          if (error && error.error === 'invalid_credentials') {
            _this.set('status', { transfer_bad_credentials: true });
          } else {
            _this.set('status', { transfer_error: true });
          }
        });
      } else {
        modalUtil.error(i18n.t('eval_transfer_not_authorized', "You do not have proper permissions to transfer this account"));
      }
    },
    reset() {
      const _this = this;
      if (!this.get('user.can_reset_eval')) { return; }
      if (!this.get('reset_email') || this.get('user.email') === this.get('reset_email')) {
        this.set('status', { reset_email_used: true });
      } else if (this.get('user.user_name') !== this.get('reset_user_name')) {
        return;
      } else {
        this.set('status', { resetting: true });
        let pw_gen = RSVP.resolve(null);
        const pw = this.get('reset_password');
        if (pw) {
          pw_gen = session.hashed_password(pw);
        }
        pw_gen.then(function(password) {
          persistence.ajax('/api/v1/users/' + _this.get('user.id') + '/evals/reset', {
            type: 'POST',
            data: {
              expires: _this.get('eval_expires'),
              password: password,
              email: _this.get('reset_email'),
              symbol_library: _this.get('symbol_library'),
              home_board_key: _this.get('home_board_key')
            }
          }).then(function(res) {
            progress_tracker.track(res.progress, function(event) {
              if (event.status === 'errored') {
                _this.set('status', { reset_error: true });
              } else if (event.status === 'finished') {
                _this.set('status', { reset_finished: true });
                runLater(function() {
                  location.reload();
                }, 2000);
              }
            });
          }, function() {
            _this.set('status', { reset_error: true });
          });
        }, function() {
          _this.set('status', { reset_error: true });
        });
      }
    },
    extend() {
      const _this = this;
      if (!this.get('user.subscription.eval_extendable') && !this.get('user.can_reset_eval')) {
        this.set('status', { cant_extend: true });
        return;
      }
      this.set('status', { extending: true });
      const user = this.get('user');
      const date = this.get('extend_date');
      user.set('preferences.extend_eval', date || true);
      user.save().then(function() {
        if (!user.get('eval_expiring')) {
          _this.get('modal').close();
          modalUtil.success(i18n.t('eval_extended', "Evaluation Period Successfully Extended!"));
        } else {
          _this.set('status', { cant_extend: true });
        }
      }, function() {
        _this.set('status', { extend_error: true });
      });
    }
  }
});
