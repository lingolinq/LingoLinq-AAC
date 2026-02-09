import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { set as emberSet, get as emberGet } from '@ember/object';
import modal from '../utils/modal';
import sync from '../utils/sync';
import app_state from '../utils/app_state';
import LingoLinq from '../app';

/**
 * Remote Model Modal Component
 *
 * Converted from modals/remote-model template/controller to component.
 */
export default Component.extend({
  modal: service('modal'),
  tagName: '',

  init() {
    this._super(...arguments);
    this.set('app_state', app_state);
    const modalService = this.get('modal');
    const template = 'modals/remote-model';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  following_mode: computed('modeling_type', function() {
    return this.get('modeling_type') === 'follow';
  }),

  connect_pending: computed('model.status', function() {
    return this.get('model.status.connecting');
  }),

  paired_with_current_user: computed('model.communicator', 'model.user.id', function() {
    if (!this.get('model.communicator') && app_state.get('speak_mode') && app_state.get('pairing')) {
      return this.get('model.user.id') === app_state.get('pairing.user.id');
    }
    return false;
  }),

  reactions: computed(function() {
    return [
      { text: 'laugh', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f602.svg' },
      { text: 'sad', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f622.svg' },
      { text: 'kiss', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f618.svg' },
      { text: 'heart eyes', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f60d.svg' },
      { text: 'party', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f973.svg' },
      { text: 'thumbs up', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f44d.svg' },
      { text: 'rose', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f339.svg' },
      { text: 'heart', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/2764.svg' },
      { text: 'pray', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f64f-1f3fe.svg' },
      { text: 'clap', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f44f-1f3fd.svg' },
      { text: 'tired', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f634.svg' },
      { text: 'mad', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f621.svg' },
      { text: 'barf', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f92e.svg' },
      { text: 'rolling eyes', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f644.svg' },
      { text: 'shrug', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f937-200d-2640-fe0f.svg' },
      { text: 'smile', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f642.svg' },
      { text: 'laugh', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f604.svg' },
      { text: 'tongue', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f61d.svg' },
      { text: 'surprised', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f62e.svg' },
      { text: 'crying', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f62d.svg' },
      { text: 'broken heart', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f494.svg' },
      { text: 'fries', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f35f.svg' },
      { text: 'shamrock', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/2618.svg' },
      { text: '100', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f4af.svg' },
      { text: 'poop', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f4a9.svg' },
      { text: 'cool', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f60e.svg' },
      { text: 'thinking', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f914.svg' },
      { text: 'fist', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/270a-1f3fd.svg' },
      { text: 'mail', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f4ec.svg' },
      { text: 'raise hand', url: 'https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f64b-1f3fe.svg' }
    ];
  }),

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      const _this = this;
      this.get('modal').setComponent(this);
      this.set('modeling_type', 'follow');
      if (app_state.get('pairing.model')) {
        _this.set('modeling_type', 'model');
      }
      LingoLinq.store.findRecord('user', this.get('model.user_id')).then(function(user) {
        _this.set('model.user', user);
      }, function() {
        _this.set('model.user_error', true);
      });
    },
    closing() {},
    send_reaction(reaction) {
      const react_id = Math.random();
      emberSet(reaction, 'sending', react_id);
      setTimeout(() => {
        if (emberGet(reaction, 'sending') === react_id) {
          emberSet(reaction, 'sending', false);
        }
      }, 1000);
      sync.message(this.get('model.user.id'), reaction.url);
    },
    send_message() {
      const str = this.get('model_message');
      if (str) {
        sync.message(this.get('model.user.id'), str);
      }
    },
    set_modeling(type) {
      this.set('modeling_type', type);
    },
    end() {
      if (app_state.get('pairing.user_id')) {
        sync.unpair();
      }
      this.get('modal').close();
    },
    request() {
      const _this = this;
      _this.set('model.status', { connecting: true });
      let handled = false;
      setTimeout(function() {
        if (handled) { return; }
        handled = true;
        _this.set('model.status', { error_connecting: true });
      }, 5000);
      sync.connect(_this.get('model.user')).then(function() {
        if (handled) { return; }
        handled = true;
        if (_this.get('following_mode')) {
          let sync_handled = false;
          const listen_id = 'remote_model_request.' + (new Date()).getTime();
          setTimeout(function() {
            if (sync_handled) { return; }
            sync_handled = true;
            _this.set('model.status', { pair_timeout: true });
            sync.stop_listening(listen_id);
          }, 60000);
          sync.listen(listen_id, function(message) {
            if (message && message.user_id === _this.get('model.user.id')) {
              if (message.type === 'update' && message.data.board_state) {
                sync_handled = true;
                sync.stop_listening(listen_id);
                modal.close();
                app_state.set('pairing', { partner: true, follow: true, user: _this.get('model.user'), user_id: _this.get('model.user.id'), communicator_id: _this.get('model.user.id') });
                app_state.set_speak_mode_user(_this.get('model.user.id'), true, true);
                sync.send(_this.get('model.user.id'), { type: 'query' });
              }
            }
          });
          const query = function() {
            if (sync_handled || query.attempts > 5) { return; }
            query.attempts = (query.attempts || 0) + 1;
            sync.send(_this.get('model.user.id'), { type: 'query', following: true });
            setTimeout(query, 500);
          };
          setTimeout(query, 500);
        } else {
          let sync_handled = false;
          setTimeout(function() {
            if (!sync_handled) {
              sync_handled = true;
              _this.set('model.status', { pair_timeout: true });
            }
          }, 60000);
          sync.request_pair(_this.get('model.user.id')).then(function() {
            modal.close();
            app_state.set('pairing', { partner: true, model: true, user: _this.get('model.user'), user_id: _this.get('model.user.id'), communicator_id: _this.get('model.user.id') });
            app_state.set_speak_mode_user(_this.get('model.user.id'), true, true);
            setTimeout(function() {
              sync.send(_this.get('model.user.id'), { type: 'query' });
            }, 500);
          }, function() {
            _this.set('model.status', { pair_reject: true });
          });
        }
      }, function() {
        _this.set('model.status', { error_connecting: true });
      });
    }
  }
});
