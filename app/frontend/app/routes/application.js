import Route from '@ember/routing/route';
import { later as runLater } from '@ember/runloop';
import app_state from '../utils/app_state';
import speecher from '../utils/speecher';
import modal from '../utils/modal';
import capabilities from '../utils/capabilities';
import { inject as service } from '@ember/service';

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
  setupController: function(controller) {
    app_state.setup_controller(this, controller);
    speecher.refresh_voices();
    controller.set('speecher', speecher);
  },
  router: service(),
  init() {
    this._super(...arguments);
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
      app_state.global_transition({
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
//      app_state.global_transition(transition);
    },
    didTransition: function() {
      app_state.finish_global_transition();
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
      app_state.check_for_needing_purchase().then(function() {
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
