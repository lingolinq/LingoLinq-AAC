import Route from '@ember/routing/route';
import { later as runLater } from '@ember/runloop';
import speecher from '../utils/speecher';
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
  appState: service('app-state'),
  persistenceService: service('persistence'),
  stashesService: service('stashes'),
  sessionService: service('session'),
  modal: service(),
  setupController: function (controller) {
    this.appState.setup_controller(this, controller);
    speecher.refresh_voices();
    controller.set('speecher', speecher);
  },
  router: service(),
  init() {
    this._super(...arguments);
    this.router.on('routeWillChange', transition => {
      var params_list = function (elem) {
        var res = [];
        if (elem && elem.paramNames && elem.paramNames.length > 0) {
          elem.paramNames.forEach(function (p) {
            res.push(elem.params[p]);
          });
        }
        if (elem && elem.parent) {
          res = res.concat(params_list(elem.parent));
        }
        return res;
      };
      params_list(transition.to);
      this.appState.global_transition({
        aborted: transition.isAborted,
        source: transition,
        from_route: (transition.from || {}).name,
        from_params: params_list(transition.from),
        to_route: (transition.to || {}).name,
        to_params: params_list(transition.to),
      });
    });

    this.router.on('routeDidChange', transition => {
    });
  },
  actions: {
    willTransition: function (transition) {
    },
    didTransition: function () {
      this.appState.finish_global_transition();
      runLater(function () {
        speecher.load_beep().then(null, function () { });
      }, 100);
    },
    speakOptions: function () {
      var last_closed = this.modal.get('speak_menu_last_closed');
      if (last_closed && last_closed > Date.now() - 500) {
        return;
      }
      this.modal.open('speak-menu', { inactivity_timeout: true, scannable: true });
    },
    newBoard: function () {
      var _this = this;
      this.appState.check_for_needing_purchase().then(function () {
        _this.modal.open('new-board');
      });
    },
    pickWhichHome: function () {
      this.modal.open('which-home');
    },
    confirmDeleteBoard: function () {
      this.modal.open('confirm-delete-board', { board: this.get('controller.board.model'), redirect: true });
    }
  }
});
