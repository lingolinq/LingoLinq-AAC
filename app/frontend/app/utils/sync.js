/**
Copyright 2021, OpenAAC
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
**/

// TODO: Classroom mode option that allows a teacher to set focus words
// or highlight for all users in the classroom

import LingoLinq from '../app';
import EmberObject from '@ember/object';
import stashes from './_stashes';
import persistence from './persistence';
import app_state from './app_state';
import editManager from './edit_manager';
import modal from './modal';
import speecher from './speecher';
import utterance from './utterance';
import RSVP from 'rsvp';
import $ from 'jquery';
import {
  set as emberSet,
  get as emberGet
} from '@ember/object';
import {
  later as runLater,
  cancel as runCancel,
} from '@ember/runloop';

var sync = EmberObject.extend({
  subscribe: function(opts) {
    if(window.crypto && window.crypto.subtle && !sync.user_token) {
      sync.user_token = Math.round(Math.random() * 10000);
    }
    if(!sync.con) {
      return new Promise(function(res, rej) {
        var check = function() {
          if(!sync.con) {
            setTimeout(check, 500);
          } else  {
            sync.subscribe(opts).then(function(success) {
              res(success);
            }, function(err) {
              rej(err);
            });
          }
        };
        setTimeout(check, 500);
      });
    }
    return new Promise(function(resolve, reject) {
      var now = (new Date()).getTime();
      var sub = sync.con.subscriptions.subscriptions.find(function(s) { return s.user_id == opts.user_id; });
      var old_sub = null;
      if(sub && sub.started < (now - (60 * 60 * 1000))) {
        old_sub = sub;
        sub = null;
      }
      sub = sub || sync.con.subscriptions.create({
        channel: "RoomChannel",
        room_id: opts.room_id,
        user_id: opts.ws_user_id,
        verifier: opts.verifier
      }, {
        received: function(data) {
          if(data.sender_id && data.sender_id == opts.ws_user_id) {
            // Rebroadcast of my own message, ignore
            return;
          }
          console.log("CDWS Data", sub.user_id, data); 
          sync.listeners = sync.listeners || {};
          if(data.partner_id == opts.ws_user_id) {
            data.partner_is_self = true;
          }
          if(data.communicator_id == opts.ws_user_id || (data.communicator_id == 'driver' && opts.ws_user_id.match(/^me/))) {
            data.communicator_is_self = true;
          }
          if(data.preferred_communicator_id == opts.ws_user_id) {
            data.preferred_communicator_is_self = true;
          }
          if(data.paired_communicator_id == opts.ws_user_id || (data.paired_communicator_id == 'driver' && opts.ws_user_id.match(/^me/))) {
            data.paired_communicator_is_self = true;
          }
          if(data.paired_partner_id == opts.ws_user_id) {
            data.paired_partner_is_self = true;
          }
          if(opts.never_communicator) {
            if(data.communicator_is_self) {
              delete data.communicator_is_self;
              delete data.paired_communicator_is_self;
            }
          } else if(data.communicator_is_self) {
            delete data.partner_is_self;
            delete data.paired_partner_is_self;
          }
          if(data.type == 'users' || (data.type == 'update' && (data.user_id || '').match(/^me/))) {
            sub.last_communicator_access = parseInt(data.last_communicator_access, 10) || 0;
            if(data.type == 'users' && data.signed_list) {
              if(data.signed_list.find(function(id) { return id && id == sub.ws_user_id; })) {
                sub.secured = true;
              }
            }
            if(data.type == 'update') {
              sub.last_communicator_access = sub.last_communicator_access || ((new Date()).getTime() / 1000);
            }
            var sup = app_state.get('sessionUser.known_supervisees').find(function(sup) { return sup.id == sub.user_id; });
            LingoLinq.User.ws_accesses = LingoLinq.User.ws_accesses || {};
            if(sup) {
              var cutoff = ((new Date()).getTime() - (10 * 60 * 1000)) / 1000;
              // console.log("SUP", sup.user_name, data, cutoff);
              emberSet(sup, 'online', sub.last_communicator_access > cutoff);
            }
            LingoLinq.User.ws_accesses[sub.user_id] = sub.last_communicator_access;

            var user = LingoLinq.store.peekRecord('user', sub.user_id);
            if(user) {
              user.set('last_ws_access', sub.last_communicator_access);
            }
          }
          for(var key in sync.listeners) {
            sync.listeners[key]({
              user_id: opts.user_id,
              type: data && data.type,
              data: data
            });
          }
        },
        connected: function() {
          if(old_sub) {
            old_sub.unsubscribe();
          }
          runLater(function() {
            sub.send({type: 'users', token_secret: sync.user_token});
          }, 200);
          resolve();
        },
        rejected: function() {
          // TODO: can we recover from this?
          sub.active = false;
          reject();
        }
      });  
      sub.user_id = opts.user_id;
      sub.ws_user_id = opts.ws_user_id;
      sub.manual_user = opts.manual_follow;
      sub.started = sub.started || now;
    });
  },
  last_accesses: function() {
    if(!sync.con) { return {}; }
    var res = {};
    sync.con.subscriptions.subscriptions.forEach(function(sub) {
      if(sub.last_communicator_access != undefined) {
        res[sub.user_id] = sub.last_communicator_access;
      }
    });
    return res;
  },
  connect: function(user) {
    if(!app_state || !app_state.get || !stashes || !stashes.get || !stashes.get('ws_url')) {
      return new Promise(function(res, rej) {
        var check = function() {
          if(!app_state || !app_state.get || !stashes || !stashes.get || !stashes.get('ws_url')) {
            setTimeout(check, 500);
          } else {
            sync.connect(user).then(function(success) {
              res(success);
            }, function(err) {
              rej(err);
            });
          }
        };
        setTimeout(check, 500);
      });
    }
    var connect_promise = new Promise(function(resolve, reject) {
      if(!window.ActionCable) { return reject({error: 'no ActionCable'}); }
      if(stashes.get('ws_url') && !sync.con) {
        sync.con = window.ActionCable.createConsumer(stashes.get('ws_url'));
      }
      user = user || app_state.get('sessionUser');
      if(!user) { return; }
      var manual_follow = user.get('id') != app_state.get('sessionUser.id');
      var supporter_device = user.get('supporter_view');
      var connected = user.get('sync_connected') || 0;
      var now = (new Date()).getTime();
      sync.pending_connect_for = sync.pending_connect_for || {};
      // Re-connect every 2-ish hours
      if(user && connected < now - (2 * 60 * 60 * 1000) && (!user.get('supporter_role') || user.get('supervisees.length'))) {
        user.set('sync_connected', now);
        if(sync.pending_connect_for[user.get('id')]) { return sync.pending_connect_for[user.get('id')]; }
        sync.pending_connect_for[user.get('id')] = connect_promise;
        console.log("LINGOLINQ: ws connect");
        persistence.ajax('/api/v1/users/self/ws_settings', {type: 'GET'}).then(function(res) {
          res.retrieved = (new Date()).getTime();
          var cached_settings = stashes.get('ws_settings');
          // Reuse cached settings if not too old so
          // we don't lose the existing pairing
          if(cached_settings && cached_settings.user_id == res.user_id && cached_settings.retrieved && cached_settings.retrieved > (res.retrieved - (3 * 60 * 60 * 1000))) {
            res = cached_settings;
          }
          res = Object.assign({}, res);
          delete res['meta'];
          if(user.get('id') == app_state.get('sessionUser.id')) {
            // Store settings for the session user
            stashes.persist('ws_settings', res);
            // ..and retry all manual connections at the same time
            var manuals = sync.con.subscriptions.subscriptions.filter(function(sub) { return sub.manual_user; });
            manuals.forEach(function(sub) {
              sync.connect(sub.manual_user);
            });
          }
          sync.pending_connect_for[user.get('id')] = false;
          sync.self_settings = res;
          var promises = [];
          if(!user.get('supporter_role')) {
            promises.push(sync.subscribe({
              user_id: res.user_id,
              ws_user_id: res.my_device_id,
              never_communicator: supporter_device,
              manual_follow: manual_follow && user,
              room_id: res.ws_user_id,
              verifier: res.verifier
            }).then(null, function(err) {
              user.set('sync_connected', 0);
              return err;
            }));
          }
          if(res.supervisees) {
            res.supervisees.forEach(function(sup) {
              promises.push(sync.subscribe({
                user_id: sup.user_id,
                ws_user_id: sup.my_device_id,
                room_id: sup.ws_user_id,
                verifier: sup.verifier
              }));
            });
          }
          if(promises.length == 0) {
            resolve();
          } else {
            promises[0].then(function(res) {
              resolve(res);
            }, function(err)  {
              reject(err);
            })
          }
        }, function(err) {
          sync.pending_connect_for[user.get('id')] = false;
          reject(err);
        });
      } else {
        resolve();
      }
    });
    connect_promise.then(null, function() { });
    return connect_promise;
  },
  listen: function(listen_id, callback) {
    sync.listeners = sync.listeners || {};
    sync.listeners[listen_id] = callback;
  },
  user_lookup: function(ws_user_id) {
    // API call to get user's info, check for cache first
    return new Promise(function(resolve, reject) {
      sync.user_lookups = sync.user_lookups || {};
      if(sync.user_lookups[ws_user_id]) {
        resolve(sync.user_lookups[ws_user_id]);
      } else {
        persistence.ajax("/api/v1/users/" + encodeURIComponent(ws_user_id) + "/ws_lookup", {type: 'GET'}).then(function(user) {
          sync.user_lookups[ws_user_id] = user;
          resolve(user);
        }, function(err) {
          reject(err);
        });
      }
    });
  },
  handle_message: function(data) {
    sync.user_lookup(data.sender_id).then(function(user) {
      var valid_message = false;
      if(app_state.get('pairing.user.id') == user.user_id) {
        valid_message = true;
      } else if((app_state.get('followers.active') || []).find(function(u) { return u.user_id == user.user_id; })) {
        valid_message = true;
      }
      if(valid_message) {
        sync.recent_message_ids = sync.recent_message_ids || [];
        if(sync.recent_message_ids.indexOf(data.message_id) == -1) {
          sync.recent_message_ids.push(data.message_id);
          sync.recent_message_ids = sync.recent_message_ids.slice(-10);
          utterance.silent_speak_button({
            message: data.message,
            avatar_url: user.avatar_url
          });  
        }
      }
    });
  },
  message: function(user_id, message) {
    var message_id = (new Date()).getTime() + "." + Math.random();
    var tally = 0;
    var send = function() {
      tally++;
      sync.send(user_id, {type: 'message', message: message, message_id: message_id});
      if(tally < 10) {
        setTimeout(send, 500);
      }
    };
    send();
  },
  unpair: function() {
    // TODO: auto-unpair when someone exits speak mode
    if(sync.current_pairing) {
      sync.send(sync.current_pairing.room_user_id, {type: 'unpair'});
      speecher.click('partner_end');
      // Send unpair messages for the next 60 seconds
      var other_user_id = sync.current_pairing.other_user_id;
      app_state.set('unpaired', other_user_id);
      setTimeout(function() {
        if(app_state.get('unpaired') == other_user_id) {
          app_state.set('unpaired', null);
        }
      }, 60000)

      // Remove the paired partner from the list of followers
      var follow_stamps = Object.assign({}, app_state.get('followers') || {});
      delete follow_stamps[other_user_id];
      follow_stamps.active = (follow_stamps.active || []).filter(function(u) { return u.user_id != other_user_id; });
      app_state.set('followers', follow_stamps);
      sync.current_pairing = null;  
    } else if(app_state.get('pairing.partner')) {
      speecher.click('partner_end');
      var user_id = app_state.get('pairing.communicator_id');
      var tally = 0;
      var send_unpair = function() {
        tally++;
        sync.send(user_id, {type: 'unpair'});
        if(tally < 5) {
          setTimeout(send_unpair, 300);
        }
      };
      send_unpair();
    }
    app_state.set('pairing', null);
  },
  end_follows: function() {
    // Send a couple times to the room that follows are being disabled
    sync.message(app_state.get('referenced_user.id') || app_state.get('currentUser.id'), 'end_follows');
  },
  pair_as: function(role, user_id, other_ws_user_id, pair_code) {
    if(role == 'none') {
      // if already pairing for the specified user_id, end it
      var pair_to_end = sync.current_pairing && sync.current_pairing.room_user_id == user_id;
      pair_to_end = pair_to_end || (app_state.get('pairing.user_id') == user_id && pair_code == 'manual_end');
      if(pair_to_end) {
        speecher.click('partner_end');
        app_state.set('pairing', null);
        sync.current_pairing = null;
        sync.check_following(other_ws_user_id, true);
      }
      return;
    }
    if(sync.current_pairing && sync.current_pairing.pair_code == pair_code) {
      // already paired
      return;
    }
    sync.user_lookup(other_ws_user_id).then(function(other_user) {
      sync.current_pairing = {
        started: (new Date()).getTime(),
        room_user_id: user_id,
        role: role,
        other_user_id: other_user.user_id,
        other_user: other_user,
        pair_code: pair_code
      };
      // set pairing state
      LingoLinq.store.findRecord('user', other_user.user_id).then(function(u) {
        var communicator_id = role == 'partner' ? u.get('id') : app_state.get('sessionUser.id');
        if(role == 'partner') {
          speecher.click('partner_start');
        }
        app_state.set('pairing', {partner: role == 'partner', model: true, user_id: u.get('id'), user: u, communicator_id: communicator_id});
      });
    });
  },
  keepalive: function() {
    if(!sync.con) { return; }
    sync.con.subscriptions.subscriptions.forEach(function(sub) {
      var opts = {
        type: 'keepalive', 
        following: (app_state.get('pairing.user_id') == sub.user_id)
      };
      if(!sub.secured && sync.user_token) {
        opts.token_secret = sync.user_token;
      }
      sync.send(sub.user_id, opts);
    })
  },
  check_following: function(partner_id, unfollow) {
    var now = (new Date()).getTime();
    // Note the user recently continued to follow
    var lookup = RSVP.resolve();
    if(partner_id) {
      lookup = sync.user_lookup(partner_id);
    }
    lookup.then(function(user) {
      var follow_stamps = Object.assign({}, app_state.get('followers') || {});
      if(user) {
        follow_stamps[user.user_id] = {
          user: user,
          last_update: unfollow ? 0 : now
        };  
        var user_record = LingoLinq.store.peekRecord('user', user.user_id);
        if(user_record) {
          user_record.set('last_ws_access', now);
        }
      }
      // Check if the user is allowed to follow
      // NOTE: There is an assumption here that only authorized 
      // supervisors would be able to join the room in the 
      // first place, so we don't need to check their permissions
      if(app_state.get('pairing') || app_state.get('sessionUser.preferences.remote_modeling_auto_follow') || follow_stamps.allowed) {
        // Already broadcasting
        var prior_active_followers = (follow_stamps.active || []).length;
        follow_stamps.active = [];
        for(var key in follow_stamps) {
          // Add all recently-updated followers to the list
          if(follow_stamps[key] && follow_stamps[key].last_update > (now - (5 * 60 * 1000))) {
            // ..Unless they were just unpaired or are the pairing partner
            if(follow_stamps[key].user && app_state.get('unpaired') != follow_stamps[key].user.user_id && (sync.current_pairing || {}).other_user_id != follow_stamps[key].user.user_id) {
              follow_stamps.active.push(follow_stamps[key].user);
            }
          }
        }
        if(follow_stamps.active.length > prior_active_followers) {
          speecher.click('follower');
        } else if(follow_stamps.active.length < prior_active_followers) {
          // TODO: is this a good idea?
          // speecher.click('partner_end');
        }
      } else if(!follow_stamps.ignore_until || follow_stamps.ignore_until < now) {
        // If this user hasn't asked to follow before
        // during this session, or it's been five minutes
        // since the last rejection, show a prompt
        if(user && app_state.get('sessionUser.request_alert.user') != user) {
          app_state.set('sessionUser.request_alert', {follow: true, user: user});
        }

      }
      if(app_state.get('speak_mode')) {
        app_state.set('followers', follow_stamps);
      }
      // sync.confirm_pair(message.data.pair_code, message.data.partner_id);
    }, function(err) { });

  },
  send_update: function(user_id, extra) {
    sync.cached_updates = sync.cached_updates || [];
    // generate an id for the update,
    var update_id = (new Date()).getTime() + "." + Math.random();
    // if currently-paired then keep sending
    // it and queue other updates until the 
    // current update is confirmed
    var update = {
      type: 'update',
      update_id: update_id,
      last_action: app_state.get('last_activation'),
      speak_mode: app_state.get('speak_mode')
    };
    if(!app_state.get('sessionUser.preferences.remote_modeling') && app_state.get('sessionUser.id') == user_id) {
      // If remote support is completely disabled, 
      // (as the communicator) don't send anything
      return RSVP.reject();
    }
    if(app_state.get('pairing') || app_state.get('sessionUser.preferences.remote_modeling_auto_follow') || app_state.get('followers.allowed')) {
      // If paired, or allowing auto-followers, include current state
      if(app_state.get('speak_mode')) {
        if(app_state.get('pairing.model') || app_state.get('sessionUser.id') == user_id) {
          // Only send state if modeling or if you're the communicator
          if(extra && extra.button) {
            var button_obj = extra.button
            update.current_action = {type: 'button', id: button_obj.button_id, board_id: button_obj.board.id, source: button_obj.source};
            if(button_obj.model_confirm) {
              update.current_action.model = 'select';
            } else if(button_obj.remote_model) {
              update.current_action.model = 'prompt';            
            }
          }
          if(extra && extra.utterance) {
            update.utterance = extra.utterance;
          }
          if(extra && extra.assertion)  {
            update.assertion = extra.assertion;
          }
          if(!extra || extra.button) {
            update.board_state = {
              id: app_state.get('currentBoardState.id'),
              show_all: !!stashes.get('all_buttons_enabled'),
              level: app_state.get('currentBoardState.level'),
            };
            if(app_state.get('focus_words.list') && app_state.get('focus_words.user_id') == app_state.get('sessionUser.id')) {
              update.board_state.focus_words = app_state.get('focus_words.list');
            }
          }
        }
        if(app_state.get('pairing') && sync.current_pairing) {
          update.paired = true;
        }
        if(app_state.get('unpaired')) {
          // For 60 seconds after manual unpairing,
          // keep sending the unpair message to
          // ensure it gets delivered
          if(!app_state.get('pairing')) {
            delete update.paired;
            update.unpaired = true;
          }
        }
      } else {
        // Remember, you may have a pairing in-process,
        // so you only really know you're unpaired if
        // there's no way you could be paired
        update.unpaired = true;
      }
    } else {

    }
    if(update.board_state && !update.current_action && update.board_state.id == sync.last_board_id_assertion && app_state.get('sessionUser.id') != user_id) {
      alert('bad loop');
      // When someone else navigates you to a board,
      // don't assert that board or you can end up
      // in a bad loop
      return RSVP.reject();
    }
    
    var defer = RSVP.defer();

    var send_it = function(update) {
      sync.send(user_id, update);
      if(sync.pending_update && sync.pending_update.id == update.update_id && update.attempts < 20) {
        update.attempts = (update.attempts || 0) + 1;
        runLater(function() {
          if(sync.pending_update && sync.pending_update.id == update.update_id) {
            send_it(update);
          }
        }, 500);
      } else if(sync.cached_updates.length > 0) {
        runLater(function() {
          var update = sync.cached_updates.shift();
          sync.pending_update = {id: update.update_id, defer: update.defer};
          delete update['defer'];
          send_it(update);
        }, 500);
      } else {
        sync.pending_update = null;
      }
    };
    if(sync.current_pairing && sync.current_pairing.room_user_id == user_id) {
      if(sync.pending_update) {
        update.defer = defer;
        sync.cached_updates.push(update);
        // queue the update to send later
      } else {
        sync.pending_update = {defer: defer, id: update_id};
        send_it(update);
      }
    } else {
      defer.resolve();
      send_it(update);
    }
    sync.check_following();
    return defer.promise;
  },
  model_button: function(button, obj) {
    if(!button.id || !button.board) { return; }
    var $button = $(".board[data-id='" + button.board.id + "'] .button[data-id='" + button.id + "']");
    if($button[0]) {
      var model_handled = false;
      setTimeout(function() {
        if(model_handled) { return; }
        model_handled = true;
        obj.remote_model = true;
        sync.send_update(app_state.get('referenced_user.id') || app_state.get('currentUser.id'), {button: obj});
      }, 500);
      modal.highlight($button, {clear_overlay: true, highlight_type: 'model', icon: 'send' }).then(function(highlight) {
        var phrase = null;
        if((button.add_vocalization || button.add_vocalization == null) && app_state.get('currentUser.supporter_view') && (stashes.get('logging_enabled') || app_state.get('currentUser.supervised_units.length'))) {
          // unit supervisors and those with logging enabled 
          // with have their models explicitly tracked for reporting
          phrase = button.vocalization || button.label;
        }
        stashes.track_daily_event('remote_models', phrase);
        model_handled = true;
        if(highlight && highlight.pending) {
          highlight.pending();
        }
        obj.model_confirm = true;
        obj.modeling = true;
        // send activation
        var confirmed = false;
        setTimeout(function() {
          if(confirmed) { return; }
          confirmed = true;
          modal.close_highlight();
        }, 5000);
        sync.send_update(app_state.get('referenced_user.id') || app_state.get('currentUser.id'), {button: obj}).then(function() {
          if(confirmed) { return; }
          confirmed = true;
          modal.close_highlight();
        }, function() {
          if(confirmed) { return; }
          confirmed = true;
          modal.close_highlight();
        });
      }, function() { 
        model_handled = true;
      });
      return;
    }

  },
  allow_followers: function() {
    var follow_stamps = app_state.get('followers') || {};
    follow_stamps.allowed = true;
    app_state.set('followers', follow_stamps);
    setTimeout(function() {
      sync.check_following();
      sync.send_update(app_state.get('sessionUser.id'));
    }, 500);
  },
  confirm_pair: function(code, partner_id) {
    speecher.click('partner_start');
    sync.send(app_state.get('sessionUser.id'), {
      type: 'accept',
      pair_code: code,
      partner_id: partner_id
    });
  },
  request_pair: function(user_id) {
    if(sync.pending_pair_request_promise) {
      sync.pending_pair_request_promise.reject('cancelled');
    }
    return new Promise(function(resolve, reject) {
      var pair_code = (new Date()).getTime() + "." + Math.random();
      var promise = {
        user_id: user_id,
        pair_code: pair_code,
        resolve: function(result) { 
          if(sync.pending_pair_request_promise == promise) {
            sync.pending_pair_request_promise = null;
          }
          resolve(result);
        },
        reject: function(error) { 
          if(sync.pending_pair_request_promise == promise) {
            sync.pending_pair_request_promise = null;
          }
          reject(error); 
        }
      };        
      sync.pending_pair_request_promise = promise;
      sync.pair_code = {user_id: user_id, code: pair_code};
      // send out on a loop until confirmed
      var attempts = 0;
      var send_request = function() {
        attempts++;
        if(sync.pair_code && sync.pair_code.code == pair_code) {
          if(attempts > (5 * 60)) {
            // Try for 5 minutes, then give up
            promise.reject('timed out');
            sync.pair_code = null;
          } else {
            var driving = (user_id == app_state.get('sessionUser.id') && app_state.get('sessionUser.supporter_view'));
            sync.send(user_id, {
              type: 'request',
              driving: driving,
              pair_code: sync.pair_code.code
            });
            runLater(send_request, 1000);
          }
        }
      };
      send_request();  
    });
  },
  default_listen: function() {
    sync.listen('default_listeners', function(message) {
      var matched = false;
      if(message.user_id == app_state.get('sessionUser.id')) {
        matched = true;
        var auto_accept = app_state.get('sessionUser.preferences.remote_modeling_auto_accept');
        if(message.data.sender_id && message.data.sender_id.match(/^me\$/)) {
          auto_accept = true;
        }
        // Message in my room!
        if(message.type == 'pair_request') {
          app_state.set('unpaired', null);
          if(app_state.get('speak_mode')) {
            // Someone sent a pair request
            // TODO: if requesting with yourself, auto-accept (driver mode)
            if(!app_state.get('sessionUser.preferences.remote_modeling')) {
              // Reject if pairing is disabled
              sync.send(app_state.get('sessionUser.id'), {
                type: 'reject',
                pair_code: message.data.pair_code,
                partner_id: message.data.partner_id
              });
            } else if(message.data.preferred_communicator_is_self) {
              // They want to pair with this device
              sync.confirm_pair(message.data.pair_code, message.data.partner_id);
            } else if(auto_accept && message.data.communicator_ids.length < 2) {
              // If auto-accept is enabled and there's
              // only one active communicator device in the channel
              sync.confirm_pair(message.data.pair_code, message.data.partner_id);
            } else {
              sync.handled_pair_codes = sync.handled_pair_codes || [];
              if(sync.handled_pair_codes.indexOf(message.data.pair_code) == -1) {
                sync.handled_pair_codes.push(message.data.pair_code);
                sync.handled_pair_codes = sync.handled_pair_codes.slice(-5);
                sync.user_lookup(message.data.partner_id).then(function(user) {
                  // Note the pair request, wait for user response
                  app_state.set('sessionUser.request_alert', {model: true, user: user, pair: message.data});
                  // sync.confirm_pair(message.data.pair_code, message.data.partner_id);
                });
              }
            }
          } else {
            sync.send(app_state.get('sessionUser.id'), {
              type: 'reject',
              pair_code: message.data.pair_code,
              partner_id: message.data.partner_id
            });
          }
        } else if(message.type == 'query') {
          if(auto_accept && !app_state.get('followers.allowed')) {
            sync.allow_followers();
          }
          // Someone asked for an update
          sync.send_update(message.user_id);
          sync.check_following(message.data.sender_id);
          app_state.sync_send_utterance();
        } else if(message.type == 'following') {
          sync.check_following(message.data.sender_id);
        } else if(message.type == 'confirm') {
          sync.check_following(message.data.sender_id);
        } else if(message.type == 'pair_confirm') {
          app_state.sync_send_utterance();          
        } else if(message.type == 'unfollow') {
          // You are not paired with this user but they are 
          // done with you, so remove them from followers list

          debugger
          sync.check_following(message.data.sender_id, true);
        } else if(message.type == 'message') {
          if(message.data && message.data.message == 'end_follows') {
            sync.pair_as('none', message.user_id, null, 'manual_end');
          } else {
            sync.handle_message(message.data);
          }
        }
      } else {
        // Check if it's for one of my supervisees
        var sup = (app_state.get('sessionUser.all_supervisees') || app_state.get('sessionUser.supervisees')).find(function(s) { return s.id == message.user_id });
        if(app_state.get('focused_user.id') == message.user_id) {
          sup = app_state.get('focused_user');
        }
        if(sup) {
          matched = true;
          // Message to one of my supervisee rooms
          emberSet(sup, 'last_action', Math.max(sup.last_action || 0, message.data.last_action));
        }
      }
      if(matched) {
        if(message.type == 'pair_confirm') {
          if(message.data.communicator_is_self) {
            // You are paired as the communicator!
            sync.pair_as('communicator', message.user_id, message.data.partner_id, message.data.pair_code);
          } else if(message.data.partner_is_self) {
            // You are paired as the partner!
            // TODO: we should have the communicator's info cached
            if(sync.pending_pair_request_promise && sync.pending_pair_request_promise.pair_code == message.data.pair_code) {
              sync.pending_pair_request_promise.resolve();
              sync.pair_as('partner', message.user_id, message.data.communicator_id, message.data.pair_code);
            } else {
              // something barfed
              debugger
            }
          } else {
            // You are not paired with this user
            if(sync.pending_pair_request_promise && sync.pending_pair_request_promise.user_id == message.user_id) {
              sync.pending_pair_request_promise.reject('paired with someone else');
            }
            sync.pair_as('none', message.user_id, null, message.data.pair_code);
          }
          if(sync.pair_code && sync.pair_code.user_id == message.user_id) {
            sync.pair_code = null;
          }
        } else if(message.type == 'pair_reject') {
          if(sync.pending_pair_request_promise && sync.pending_pair_request_promise.pair_code == message.data.pair_code) {
            sync.pending_pair_request_promise.reject('rejected');
          }
        } else if(message.type == 'confirm') {
          // Update confirmed by partner, stop retrying
          if(sync.pending_update && message.data.update_id == sync.pending_update.id) {
            sync.pending_update.defer.resolve();
            sync.pending_update = null;
          }
        } else if(message.type == 'update') {
          if(message.data.pair_code == sync.pair_code) {
            sync.pair_code = null;
          }
          if(message.data.update_id) {
            sync.recent_update_ids = sync.recent_update_ids || [];
            // Send confirmation if currently-paired
            if(message.data.paired_communicator_is_self || message.data.paired_partner_is_self) {
              sync.send(message.user_id, {
                type: 'confirm',
                update_id: message.data.update_id
              });
            }
            // Don't process the same update more than once
            if(sync.recent_update_ids.indexOf(message.data.update_id) != -1) {
              return;              
            }
            sync.recent_update_ids.push(message.data.update_id);
            sync.recent_update_ids = sync.recent_update_ids.slice(-50);
          }
          if(message.data.paired_communicator_is_self) {
            // You are paired as the communicator!
            sync.pair_as('communicator', message.user_id, message.data.paired_partner_id, message.data.pair_code);
          } else if(message.data.paired_partner_is_self) {
            // You are paired as the partner!
            sync.pair_as('partner', message.user_id, message.data.paired_communicator_id, message.data.pair_code);
          } else if(message.data.paired_communicator_id) {
            // You are not paired or your pair has ended with this user
            sync.pair_as('none', message.user_id, null, message.data.pair_code);
          } else {
            // No one is paired with this communicator
            sync.pair_as('none', message.user_id, null, message.data.pair_code);
          }
          var full_following = false, any_following = false;
          if(!modal.is_open()) {
            // Don't navigate when a modal is open
            if(app_state.get('pairing.communicator_id') == message.user_id) {
              any_following = true;
              // Only update when it's for the room you're following/paired in
              if(app_state.get('pairing.model')) {
                // When modeling, we follow both directions
                full_following = true;
              } else if(app_state.get('pairing.user_id') == message.user_id) {
                // Otherwise only the non-communicator should update
                full_following = true;
              }
            } else if((app_state.get('followers.active') || []).find(function(f) { return f.user_id == message.user_id; })) {
              any_following = true;
            }
          }

          // TODO: warn if getting data from multiple devices at once
          // TODO: if paired, only listen to updates from the paired device
          if(app_state.get('speak_mode') && any_following) {
            if(message.data.utterance && full_following) {
              var prefix = message.data.utterance.substring(0, 10);
              if(sync.get('last_utterance_prefix') != prefix) {
                sync.set('last_utterance_prefix', prefix);
                persistence.ajax('/api/v1/users/' + message.user_id + '/ws_decrypt', {
                  type: 'POST',
                  data: {text: message.data.utterance}
                }).then(function(res) {
                  try {
                    var voc = JSON.parse(res.decoded);
                    stashes.set('working_vocalization', voc);
                    utterance.set('rawButtonList', voc);
                    utterance.set_button_list();
                  } catch(e) { }
                }, function(err) { });
              }
            }
            var update_render = false;
            if(message.data.board_state && full_following) {
              LingoLinq.store.findRecord('board', message.data.board_state.id).then(function(board) {
                sync.handle_action({type: 'board_assertion', board: board});
                if(message.data.current_action) {
                  console.log("OTHER PERSON HIT A BUTTON", message.data);
                  sync.handle_action(message.data.current_action);
                }
                if(app_state.get('pairing.partner')) {
                  if(message.data.board_state.level) {
                    stashes.persist('board_level', message.data.board_state.level);
                    editManager.controller.set('preview_level', message.data.board_state.level);
                    editManager.controller.set('model.display_level', message.data.board_state.level);
                    update_render = true;
                  }
                  if(message.data.board_state.show_all != null) {
                    stashes.persist('all_buttons_enabled', (message.data.board_state.show_all ? true : null));  
                    update_render = true;
                  }
                  if(message.data.board_state.focus_words) {
                    if(message.data.board_state.focus_words.length > 0) {
                      app_state.set('focus_words', {list: message.data.board_state.focus_words, focus_id: Math.random()});
                      editManager.controller.model.set('focus_id', 'force_refresh');
                      update_render = true;
                    } else {
                      app_state.set('focus_words', null);
                      editManager.controller.model.set('focus_id', 'blank');
                    }
                  } 
                }
              });
            }
            // allow passive followers to send assertions (select focus words)
            if(app_state.get('pairing') || app_state.get('followers')) {
              // communicator should handle force settings when paired
              if(message.data.assertion) {
                if(message.data.assertion.show_all != null) {
                  stashes.persist('all_buttons_enabled', (message.data.assertion.show_all ? true : null));
                  update_render = true;
                } else if(message.data.assertion.focus_words != null) {
                  if(message.data.assertion.focus_words.length > 0) {
                    app_state.set('focus_words', {list: message.data.assertion.focus_words, focus_id: Math.random()});
                    editManager.controller.model.set('focus_id', 'force_refresh');
                    update_render = true;
                  } else {
                    app_state.set('focus_words', null);
                    editManager.controller.model.set('focus_id', 'blank');
                  }  
                }
              }
            }
            if(update_render) {
              editManager.process_for_displaying();
            }
          }
        } else if(message.type == 'pair_end') {
          // You are not paired with this user
          sync.pair_as('none', message.user_id, null, message.data.pair_code);
        }
      }
    });
  },
  next_action: function() {
    // TODO: new action which is to trigger find-a-button mechanism for a specific word?
    if(sync.next_action.timer) {
      return;
    }
    sync.pending_actions = sync.pending_actions || [];
    var action = sync.pending_actions.shift();
    if(action) {
      if(action.type == 'board_assertion') {
        var did_change = false;
        if(app_state.get('currentBoardState.id') != action.board.get('id')) {
          did_change = true;
          speecher.click('click');
          sync.last_board_id_assertion = action.board.get('id');
          app_state.jump_to_board({
            id: action.board.get('id'),
            key: action.board.get('key'),
          });  
        }
        sync.next_action.timer = runLater(function() {
          sync.next_action.timer = null;
          sync.next_action();
        }, did_change ? 500 : 50);
      } else if(action.type == 'button') {
        console.log("BUTTON?")
        if(app_state.get('currentBoardState.id') == action.board_id) {
          var close_on_next = false;
          console.log("ACTION", action);
          var $button = $(".button[data-id='" + action.id + "']");
          var hit_button = function() {
            if(app_state.get('currentBoardState.id') == action.board_id) {
              var btn = editManager.find_button(action.id);
              var obj = {
                label: btn.label,
                vocalization: btn.vocalization,
                button_id: btn.id,
                source: 'prompt',
                board: {id: app_state.get('currentBoardState.id'), parent_id: app_state.get('currentBoardState.parent_id'), key: app_state.get('currentBoardState.key')},
                type: 'speak'        
              }
              app_state.activate_button(btn, obj);
            }
          };
          if(action.model == 'prompt') {
            // Partner sending modeling prompt
            modal.highlight($button, {clear_overlay: true, highlight_type: 'model'}).then(function() {
              // activate!
              modal.close_highlight();
              hit_button();
            }, function() { });  
          } else if(action.model == 'select') {
            speecher.click('ding');
            // Partner forced selection of modeling prompt
            hit_button();
            runLater(function() {
              modal.close_highlight();
            }, 500);
          } else {
            // Communicator hit a button
            speecher.click('ding');
            console.log("BUTTON SOURCE", action);
            var icon = 'hand-up';
            // click, completion, tag, overlay, switch, keyboard,
            // expression, keyboard_control, dwell, 
            // longpress, gamepad
            if(action.source == 'dwell') {
              icon = 'screenshot';
            } else if(action.source == 'switch') { 
              icon = 'record';
            } else if(action.source == 'expression') {
              icon = 'sunglasses';
            } else if(action.source == 'keyboard') {
              icon = 'text-background';
            } else if(action.source == 'gamepad') {
              icon = 'tower';
            }
            close_on_next = true;
            modal.highlight($button, {clear_overlay: true, icon: icon, highlight_type: 'model'}).then(function() {
              close_on_next = false;
              modal.close_highlight();
            }, function() { 
              close_on_next = false;              
            });  
          }
          sync.next_action.timer = runLater(function() {
            sync.next_action.timer = null;
            if(close_on_next) {
              modal.close_highlight();
            }
            sync.next_action();
          }, 1500);
        }
      }
    }
  },
  handle_action: function(action) {
    sync.pending_actions = sync.pending_actions || [];
    sync.pending_actions.push(action);
    sync.next_action();
  },
  stop_listening: function(listen_id) {
    sync.listeners = sync.listeners || {};
    delete sync.listeners[listen_id];
  },
  send: function(user_id, message_obj) {
    var sub = sync.con && sync.con.subscriptions.subscriptions.find(function(s) { return s.user_id == user_id; });
    if(!sub) { return false; }
    message_obj.sender_id = sub.ws_user_id;
    if(sync.user_token) {
      message_obj.token = sync.user_token;
    }
    var ts = Math.round((new Date()).getTime() / 1000);
    var str = ts + "::" + sub.ws_user_id + "::" + sync.user_token;
    var do_send = function() {
      sub.send(message_obj);
    };
    if(window.crypto && window.crypto.subtle) {
      window.crypto.subtle.digest('SHA-512', new TextEncoder().encode(str)).then(function(buffer) { 
        var hashArray = Array.from(new Uint8Array(buffer));
        var hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        message_obj.token = [ts, sub.ws_user_id, hex].join("::")
        do_send();
      }, function(err) {
        do_send();
      });
    } else {
      do_send();
    }
    return true;
  }
}).create({ });

window.sync = sync;
export default sync;
