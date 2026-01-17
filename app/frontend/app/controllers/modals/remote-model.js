import modal from '../../utils/modal';
import sync from '../../utils/sync';
import app_state from '../../utils/app_state';
import LingoLinq from '../../app';
import { computed } from '@ember/object';
import { set as emberSet, get as emberGet } from '@ember/object';
import { inject as service } from '@ember/service';

export default modal.ModalController.extend({
  appState: service('app-state'),
  modal: service(),

  opening: function() {
    var _this = this;
    this.set('modeling_type', 'follow');
    if(this.appState.get('pairing.model')) {
      _this.set('modeling_type', 'model');
    }
    LingoLinq.store.findRecord('user', this.get('model.user_id')).then(function(user) {
      _this.set('model.user', user);
    }, function(err) {
      _this.set('model.user_error', true);
    });
  },
  following_mode: computed('modeling_type', function() {
    return this.get('modeling_type') == 'follow';
  }),
  connect_pending: computed('model.status', function() {
    return this.get('model.status.connecting');
  }),
  paired_with_current_user: computed('app_state.speak_mode', 'model.communicator', 'model.user.id', 'app_state.pairing.user.id', function() {
    if(!this.get('model.communicator') && this.appState.get('speak_mode') && this.appState.get('pairing')) {
      return this.get('model.user.id') == this.appState.get('pairing.user.id');
    }
    return false;
  }),
  reactions: computed(function() {
    return [
      {text: "laugh", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f602.svg"},
      {text: "sad", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f622.svg"},
      {text: "kiss", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f618.svg"},
      {text: "heart eyes", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f60d.svg"},
      {text: "party", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f973.svg"},
      {text: "thumbs up", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f44d.svg"},
      {text: "rose", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f339.svg"},
      {text: "heart", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/2764.svg"},
      {text: "pray", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f64f-1f3fe.svg"},
      {text: "clap", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f44f-1f3fd.svg"},
      {text: "tired", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f634.svg"},
      {text: "mad", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f621.svg"},
      {text: "barf", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f92e.svg"},
      {text: "rolling eyes", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f644.svg"},
      {text: "shrug", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f937-200d-2640-fe0f.svg"},
      {text: "smile", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f642.svg"},
      {text: "laugh", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f604.svg"},
      {text: "tongue", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f61d.svg"},
      {text: "surprised", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f62e.svg"},
      {text: "crying", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f62d.svg"},
      {text: "broken heart", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f494.svg"},
      {text: "fries", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f35f.svg"},
      {text: "shamrock", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/2618.svg"},
      {text: "100", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f4af.svg"},
      {text: "poop", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f4a9.svg"},
      {text: "cool", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f60e.svg"},
      {text: "thinking", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f914.svg"},
      {text: "fist", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/270a-1f3fd.svg"},
      {text: "mail", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f4ec.svg"},
      {text: "raise hand", url: "https://d18vdu4p71yql0.cloudfront.net/libraries/twemoji/1f64b-1f3fe.svg"},
    ];
  }),
  actions: {
    send_reaction: function(reaction) {
      var react_id = Math.random();
      emberSet(reaction, 'sending', react_id);
      setTimeout(function() {
        if(emberGet(reaction, 'sending') == react_id) {
          emberSet(reaction, 'sending', false);
        }
      }, 1000);
      sync.message(this.get('model.user.id'), reaction.url);
    },
    send_message: function() {
      var str = this.get('model_message');
      if(str) {
        sync.message(this.get('model.user.id'), str);
      }
    },
    set_modeling: function(type) {
      this.set('modeling_type', type);
    },
    end: function() {
      if(this.appState.get('pairing.user_id')) {
        sync.unpair();
      }
      this.modal.close();
    },
    request: function() {
      var _this = this;
      _this.set('model.status', {connecting: true});
      var handled = false;
      setTimeout(function() {
        if(handled) { return; }
        handled = true;
        _this.set('model.status', {error_connecting: true});
      }, 5000);
      sync.connect(_this.get('model.user')).then(function() {
        if(handled) { return; }
        handled = true;
        if(_this.get('following_mode')) {
          var sync_handled = false;
          var listen_id = 'remote_model_request.' + (new Date()).getTime();
          setTimeout(function() {
            if(sync_handled) { return; }
            sync_handled = true;
            _this.set('model.status', {pair_timeout: true});
            sync.stop_listening(listen_id);
          }, 60000)
          sync.listen(listen_id, function(message) {
            // Wait until you get an actual update to
            // confirm that the follow is accepted
            if(message && message.user_id == _this.get('model.user.id')) {
              if(message.type == 'update' && message.data.board_state) {
                sync_handled = true;
                sync.stop_listening(listen_id);
                this.modal.close();
                this.appState.set('pairing', {partner: true, follow: true, user: _this.get('model.user'), user_id: _this.get('model.user.id'), communicator_id: _this.get('model.user.id')});
                app_state.set_speak_mode_user(_this.get('model.user.id'), true, true);      
                sync.send(_this.get('model.user.id'), {type: 'query'});
              }
            }
          });
          var query = function() {
            if(sync_handled || query.attempts > 5) { return; }
            query.attempts = (query.attempts || 0) + 1;
            sync.send(_this.get('model.user.id'), {type: 'query', following: true});
            setTimeout(function() {
              query();
            }, 500);
          };
          setTimeout(function() {
            query();
          }, 500);
        } else {
          var sync_handled = false;
          setTimeout(function() {
            if(!sync_handled) {
              sync_handled = true;
              _this.set('model.status', {pair_timeout: true});
            }
          }, 60000);
          sync.request_pair(_this.get('model.user.id')).then(function(res) {
            this.modal.close();
            this.appState.set('pairing', {partner: true, model: true, user: _this.get('model.user'), user_id: _this.get('model.user.id'), communicator_id: _this.get('model.user.id')});
            app_state.set_speak_mode_user(_this.get('model.user.id'), true, true);
            setTimeout(function() {
              sync.send(_this.get('model.user.id'), {type: 'query'});
            }, 500);
          }, function(err) {
            _this.set('model.status', {pair_reject: true});
          });
          // request pairing
        }
      }, function(err) {
        _this.set('model.status', {error_connecting: true});
      });
    }
  }
});
