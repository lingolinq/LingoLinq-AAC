import Controller from '@ember/controller';
import { later as runLater } from '@ember/runloop';
import $ from 'jquery';
import i18n from '../../utils/i18n';
import modal from '../../utils/modal';
import capabilities from '../../utils/capabilities';
import LingoLinq from '../../app';
import app_state from '../../utils/app_state';
import evaluation from '../../utils/eval';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import profiles from '../../utils/profiles';
import persistence from '../../utils/persistence';
import { inject as service } from '@ember/service';

export default Controller.extend({
  router: service('router'),
  title: computed('model.user_name', function() {
    return "Log Details";
  }),
  draw_charts: observer('model.geo', 'user', function() {
    if(!this.get('model.geo')) {
      return;
    }
    var user = this.get('user');
    var elem = document.getElementsByClassName('geo_map')[0];
    var geo = this.get('model.geo');
    if(user && user.get('preferences.geo_logging') && geo) {
        LingoLinq.Visualizations.wait('geo', function() {
          if(elem && geo) {
            var current_info = null;
            if(elem) {
              var map = new window.google.maps.Map(elem, {
                scrollwheel: false,
                maxZoom: 16
              });
              var markers = [];
              var locations = [geo];
              locations.forEach(function(location) {
                var title = i18n.t('session_count', "session", {count: location.total_sessions});
                var marker = new window.google.maps.Marker({
                  position: new window.google.maps.LatLng(location.latitude, location.longitude),
                  // TODO: https://developers.google.com/maps/documentation/javascript/examples/marker-animations-iteration
                  // animation: window.google.maps.Animation.DROP,
                  title: title
                });
                // TODO: popup information for each location
                marker.setMap(map);
                markers.push(marker);
              });
              var bounds = new window.google.maps.LatLngBounds();
              for(var i=0;i<markers.length;i++) {
               bounds.extend(markers[i].getPosition());
              }
              map.fitBounds(bounds);
            }
          }
        });
    }
  }),
  update_expected_profile: observer('processed_profile.template.id', function() {
    var _this = this;
    var template_id = _this.get('processed_profile.template.id');
    if(template_id && _this.get('expected_profile.id') != template_id) {
      _this.set('expected_profile', {id: template_id});
      persistence.ajax('/api/v1/profiles/latest?include_suggestions=1&user_id=' + this.get('user.id') + '&profile_id=' + this.get('processed_profile.template.id'), {type: 'GET'}).then(function(res) {
        if(res[0] && res[0].expected) {
          var exp = {id: template_id, state: {}};
          exp.state[res[0].expected] = true;
          _this.set('expected_profile', exp);
        }
      }, function(err) { 
        setTimeout(function() {
          _this.set('expected_profile', null);
        }, 1000)
      });
    }
  }),
  update_processed_profile: observer(
    'model.type',
    'model.eval_in_memory',
    'model.profile',
    'model.enc_nonce',
    function() {
      if(this.get('model.type') == 'profile') {
        var profile = this.get('model.profile');
        if(this.get('model.guid') && this.get('processed_profile.guid') == this.get('model.guid') && !this.get('model.nonce_attempt')) {
          return;  
        }
        if(this.get('model.eval_in_memory')) {
          profiles.recent = profiles.recent || {};
          var now = (new Date()).getTime();
          for(var key in profiles.recent) {
            if(profiles.recent[key] && profiles.recent[key].added < now - (12 * 60 * 60 * 1000)) {
              delete profiles.recent[key];
            }
          }
          if(profiles.recent[this.get('model.guid')]) {
            profile = profiles.recent[this.get('model.guid')].profile;
            profiles.nonces = profiles.nonces || {};
            var nonce = profiles.recent[this.get('model.guid')].nonce;
            profiles.nonces[nonce.id] = nonce;
          }
        }
        var processed_profile = null;
        if(profile) {
          processed_profile = profiles.process(profile);
        }
        var _this = this;
        if(profile && profile.encrypted_results) {
          var nonce = this.get('model.enc_nonce') || (profiles.nonces || {})[profile.encrypted_results.nonce_id];
          if(!nonce && this.get('model.user.id') && this.get('model.id') && !this.get('model.nonce_attempt')) {
            // AJAX call to retrieve nonce referencing log_id
            _this.set('model.nonce_attempt', true);
            persistence.ajax("/api/v1/users/" + this.get('user.id') + "/external_nonce/" + profile.encrypted_results.nonce_id + "?ref_type=log_session&ref_id=" + this.get('model.id'), {type: 'GET'}).then(function(nonce) {
              _this.set('model.enc_nonce', nonce);
            }, function(err) { _this.set('model.nonce_attempt', false); });
          } else if(nonce) {
            // decrypt using the available nonce
            processed_profile.decrypt_results(nonce);

          }
        }
        if(processed_profile) {
          if(_this.get('model.eval_in_memory') && _this.get('history_result.id') != processed_profile.get('template.id')) {
            _this.set('history_result', {id: processed_profile.get('template.id')});
            processed_profile.set('history', []);
            persistence.ajax('/api/v1/profiles/latest?user_id=' + this.get('user.id') + '&profile_id=' + processed_profile.get('template.id'), {type: 'GET'}).then(function(res) {
              _this.set('history_result', {id: processed_profile.get('template.id'), results: res.map(function(hist) {
                var res = hist.profile;
                res.log_id = hist.log_id;
                return res;
              })});
            }, function(err) { });
          } else {
            processed_profile.set('history', _this.get('history_result.results'));
          }
          this.set('processed_profile', processed_profile);
        }
      }
    }
  ),  
  update_history: observer('history_result', function() {
    if(this.get('processed_profile')) {
      this.set('processed_profile.history', this.get('history_result.results'))
    }
  }),
  // The RAW eval blob, before analyze() derives display values off a copy.
  // Anything that needs to WRITE back to the eval (the report workbook) must
  // start from this, because analyze() returns a copy carrying derived fields
  // that must never be persisted, and `data['eval']` is replaced wholesale on
  // save (see evaluation.save_workbook).
  raw_assessment: computed(
    'model.type',
    'model.eval_in_memory',
    'model.evaluation',
    'user.id',
    'user.user_name',
    'eval_memory_fallback',
    'eval_memory_fallback.user_id',
    function() {
      if(this.get('model.type') != 'eval') { return null; }
      var assessment = this.get('model.evaluation');
      if(this.get('model.eval_in_memory')) {
        assessment = evaluation.last_assessment_from_memory(this.get('user.id'), this.get('user.user_name')) || {};
        // In-memory is empty on a fresh load / reload (appState wiped). Fall back
        // to the durable in-progress snapshot (IndexedDB, loaded by
        // load_eval_fallback) so the results page recovers the eval instead of
        // rendering blank. Point-of-use user match: this controller is a
        // singleton reused across communicators, so never render a fallback that
        // belongs to a different user (defense on top of the observer's reset).
        if(!(assessment && (assessment.events || assessment.started)) &&
           this.get('eval_memory_fallback') &&
           String(this.get('eval_memory_fallback.user_id')) == String(this.get('user.id'))) {
          assessment = this.get('eval_memory_fallback');
        }
      }
      return assessment;
    }
  ),
  processed_assessment: computed(
    'model.type',
    'model.profile',
    'raw_assessment',
    function() {
      if(this.get('model.type') == 'eval') {
        var assessment = this.get('raw_assessment');
        window.current_assesment = assessment;
        return evaluation.analyze(assessment);
      }
      return null;
    }
  ),
  // Async-load the durable eval snapshot when the in-memory copy is missing, so
  // processed_assessment recomputes with recovered data. Only for the last-eval
  // (eval_in_memory) page, and only when memory is actually empty. Loads the
  // snapshot keyed to THIS page's user, so it can never surface another
  // communicator's eval.
  load_eval_fallback: observer('model.type', 'model.eval_in_memory', 'user.id', function() {
    var _this = this;
    if(this.get('model.type') != 'eval' || !this.get('model.eval_in_memory')) { return; }
    var uid = this.get('user.id');
    if(!uid) { return; }
    // Singleton controller: viewing a different communicator must drop the prior
    // user's fallback + attempt flag, or it would (a) render on the new user's
    // page and (b) block the new user's own snapshot from loading.
    if(this.get('_eval_fallback_uid') && this.get('_eval_fallback_uid') != String(uid)) {
      this.set('eval_memory_fallback', null);
      this.set('_eval_fallback_attempted', false);
    }
    if(this.get('eval_memory_fallback') || this.get('_eval_fallback_attempted')) { return; }
    var mem = evaluation.last_assessment_from_memory(uid, this.get('user.user_name'));
    if(mem && (mem.events || mem.started)) { return; }
    this.set('_eval_fallback_attempted', true);
    this.set('_eval_fallback_uid', String(uid));
    evaluation.load_progress(uid).then(function(snap) {
      // Defensive: only adopt a snapshot that belongs to this user, and only if
      // we're still viewing that user (guards against a mid-flight navigation).
      if(snap && (!snap.user_id || String(snap.user_id) == String(uid)) && String(_this.get('user.id')) == String(uid)) {
        _this.set('eval_memory_fallback', snap);
      }
    });
  }),
  same_author: computed('model.author.id', 'app_state.sessionUser.id', function() {
    return this.get('model.author.id') == app_state.get('sessionUser.id');
  }),
  init() {
    this._super(...arguments);
    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };
  },

  actions: {
    reply: function() {
      var _this = this;
      var user = _this.get('user');
      modal.open('record-note', {note_type: 'text', user: user, prior: _this.get('model')});
    },
    print: function() {
      capabilities.print();

    },
    lam_export: function() {
      capabilities.window_open('/api/v1/logs/' + this.get('model.id') + '/lam?nonce=' + this.get('model.nonce'), '_system');
    },
    eval_pdf_export: function() {
      var token = capabilities.access_token || (LingoLinq.session && LingoLinq.session.get('access_token'));
      var url = '/api/v1/logs/' + this.get('model.id') + '/eval_pdf';
      if(token) { url += '?access_token=' + encodeURIComponent(token); }
      capabilities.window_open(url, '_system');
    },
    obl_export: function() {
      modal.open('download-log', {log: this.get('model')});
    },
    toggle_notes: function(id, action) {
      this.get('model').toggle_notes(id);
      if(action == 'add') {
        runLater(function() {
          $("input[data-event_id='" + id + "']").focus().select();
        }, 200);
      }
    },
    add_note: function(event_id) {
      var val = $("input[data-event_id='" + event_id + "']").val();
      if(val) {
        this.get('model').add_note(event_id, val);
      }
      $("input[data-event_id='" + event_id + "']").val("");
    },
    resume: function() {
      var assessment = this.get('model.evaluation');
      if(this.get('model.eval_in_memory')) {
        assessment = evaluation.last_assessment_from_memory(this.get('user.id'), this.get('user.user_name')) || {};
        // TODO: how to get log_session_id for in-memory evaluation
        assessment.log_session_id;
      } else {
        assessment.log_session_id = this.get('model.id');
      }
      evaluation.resume(assessment);
    },
    highlight: function(event_id, do_highlight) {
        this.get('model').highlight(event_id, !!do_highlight);
    },
    draw_charts: function() {
      this.draw_charts();
    },
    mastery_preview: function() {
      this.set('mastery_preview', !this.get('mastery_preview'));
    },
    repeat_profile: function() {
      if(this.get('processed_profile.template.id')) {
        this.router.transitionTo('profile', this.get('user.id'), this.get('processed_profile.template.id'));
      }
    }
  }
});
