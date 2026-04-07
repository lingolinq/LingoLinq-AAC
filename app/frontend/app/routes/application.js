import Route from '@ember/routing/route';
import { later as runLater } from '@ember/runloop';
import speecher from '../utils/speecher';
import modal from '../utils/modal';
import capabilities from '../utils/capabilities';
import lingoLinqExtras from '../utils/extras';
import geo from '../utils/geo';
import progress_tracker from '../utils/progress_tracker';
import ttsVoices from '../utils/tts_voices';
import { inject as service } from '@ember/service';
import { getOwner } from '@ember/application';
import evaluation from '../utils/eval';
import obf from '../utils/obf';
import utterance from '../utils/utterance';
import i18n from '../utils/i18n';

// ApplicationRouteMixin.reopen({
//   actions: {
//     sessionAuthenticationSucceeded: function() {
//       if(capabilities.installed_app) {
//         location.href = '#/';
//         location.reload();
//       } else {
//         location.href = '/';
//       }
//     },
//     sessionInvalidationSucceeded: function() {
//       if(capabilities.installed_app) {
//         location.href = '#/';
//         location.reload();
//       } else {
//         location.href = '/';
//       }
//     }
//   }
// });
export default Route.extend({
  router: service(),
  session: service('session'),
  appState: service('app-state'),
  stashes: service('stashes'),
  persistence: service('persistence'),
  activate: function() {
    var session = this.get('session');
    if(session && typeof session.restore === 'function') {
      session.restore();
      // Second restore after 150ms: on first load or after transition, stashes/IndexedDB
      // or session dependencies may not be ready yet. The delayed call ensures we pick up
      // persisted auth once storage and services are fully initialized.
      runLater(this, function() {
        var s = this.get('session');
        if(s && typeof s.restore === 'function') {
          s.restore();
        }
      }, 150);
    }
  },
  setupController: function(controller) {
    // Setup utilities with injected services
    lingoLinqExtras.register_services(this.appState, this.stashes);
    speecher.setup(this.appState, this.persistence, this.stashes, ttsVoices);
    geo.setup(this.appState, this.persistence, this.stashes);
    progress_tracker.setup(this.persistence);
    capabilities.setup(this.stashes, ttsVoices);
    evaluation.setup(this.appState, this.persistence, this.stashes, speecher, utterance, obf, modal, i18n, capabilities);
    obf.register_services(this.appState);

    this.appState.setup_controller(this, controller);
    speecher.refresh_voices();
    controller.set('speecher', speecher);
  },
  init() {
    this._super(...arguments);
    // Explicit lookup of session service (implicit injection disabled to avoid deprecation)
    var owner = getOwner(this);
    var sessionService = owner.lookup('lingolinq:session');
    if(sessionService) {
      // Use defineProperty to set it without triggering read-only error
      Object.defineProperty(this, 'session', {
        value: sessionService,
        writable: false,
        configurable: true
      });
    }
    var _this = this;
    this.router.on('routeWillChange', transition => {
      var params_list = function(elem) {
        var res = [];
        if(elem && elem.paramNames && elem.paramNames.length > 0) {
          elem.paramNames.forEach(function(p) {
            res.push(elem.params[p]);
          });
        }
        if(elem && elem.parent) {
          res = res.concat(params_list(elem.parent));
        }
        return res;
      };
      params_list(transition.to);
      _this.appState.global_transition({
        aborted: transition.isAborted,
        source: transition,
        from_route: (transition.from || {}).name,
        from_params: params_list(transition.from),
        to_route: (transition.to || {}).name,
        to_params: params_list(transition.to),
      });
      // let { to: toRouteInfo, from: fromRouteInfo } = transition;
      // console.log(`Transitioning from -> ${fromRouteInfo.name}`);
      // console.log(`From QPs: ${JSON.stringify(fromRouteInfo.queryParams)}`);
      // console.log(`From Params: ${JSON.stringify(fromRouteInfo.params)}`);
      // console.log(`From ParamNames: ${fromRouteInfo.paramNames.join(', ')}`);
      // console.log(`to -> ${toRouteInfo.name}`);
      // console.log(`To QPs: ${JSON.stringify(toRouteInfo.queryParams)}`);
      // console.log(`To Params: ${JSON.stringify(toRouteInfo.params)}`);
      // console.log(`To ParamNames: ${toRouteInfo.paramNames.join(', ')}`);
    });

    this.router.on('routeDidChange', transition => {
      // let { to: toRouteInfo, from: fromRouteInfo } = transition;
      // console.log(`Transitioned from -> ${fromRouteInfo.name}`);
      // console.log(`From QPs: ${JSON.stringify(fromRouteInfo.queryParams)}`);
      // console.log(`From Params: ${JSON.stringify(fromRouteInfo.params)}`);
      // console.log(`From ParamNames: ${fromRouteInfo.paramNames.join(', ')}`);
      // console.log(`to -> ${toRouteInfo.name}`);
      // console.log(`To QPs: ${JSON.stringify(toRouteInfo.queryParams)}`);
      // console.log(`To Params: ${JSON.stringify(toRouteInfo.params)}`);
      // console.log(`To ParamNames: ${toRouteInfo.paramNames.join(', ')}`);
    });    
  },
  actions: {
    willTransition: function(transition) {
//      this.appState.global_transition(transition);
    },
    didTransition: function() {
      this.appState.finish_global_transition();
      runLater(function() {
        speecher.load_beep().then(null, function() { });
      }, 100);
    },
    speakOptions: function() {
      var last_closed = modal.get('speak_menu_last_closed');
      if(last_closed && last_closed > Date.now() - 500) {
        return;
      }
      modal.open('speak-menu', {inactivity_timeout: true, scannable: true});
    },
    newBoard: function() {
      var _this = this;
      this.appState.check_for_needing_purchase().then(function() {
        modal.open('new-board');
      });
    },
    pickWhichHome: function() {
      modal.open('which-home');
    },
    confirmDeleteBoard: function() {
      modal.open('confirm-delete-board', {board: this.get('controller.board.model'), redirect: true});
    }
  }
});
