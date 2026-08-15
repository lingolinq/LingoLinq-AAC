import Component from '@ember/component';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';
import i18n from '../utils/i18n';
import openRecommendedHomeBoard from '../utils/recommended_home_board';

/*
 * eval-page-set-card — "Recommended page set" card, shared by the tiered Quick
 * Eval report (eval-quick-report) and the full-eval report (eval-full-report).
 *
 * Takes the Vocal Flair button count the caller's recommendation resolved to,
 * and opens that board in the shared board-preview modal so the SLP can choose
 * it FOR THE COMMUNICATOR being evaluated.
 *
 * THE BOARD GOES TO THE COMMUNICATOR, NOT THE SLP. board-preview-overlay's
 * `pick_for_home` resolves its target as `app_state.setup_user ||
 * app_state.currentUser` — setup_user is the same lever the standalone board
 * picker uses to act on a supervisee (controllers/board-picker#_resolve_setup_user).
 * We point it at the person this eval is for; without that the copy lands on
 * whoever is signed in, which for a school SLP is their own account.
 *
 * setup_user is NOT managed by this component. pick_for_home reads it seconds
 * later, when the SLP picks from the modal, so the override has to outlive
 * whatever opened the preview — and this card unmounts the moment the report
 * switches to School mode (it is medical-only). Clearing it on teardown, as this
 * component used to, reset setup_user while the preview was still open and sent
 * the board to the signed-in SLP's own account. utils/recommended_home_board now
 * owns the override and releases it when the preview closes.
 *
 * tagName/classNames reproduce the original inline markup exactly, so the card
 * keeps its place in the .evq-report__grid it is rendered into.
 */
export default Component.extend({
  appState: service('app-state'),
  tagName: 'article',
  classNames: ['evq-card', 'evq-card--flair'],
  buttons: null,
  user: null,
  loading: false,

  // Callers that run an eval unattached to a communicator (routes/eval/quick
  // leaves `user` null) must not be able to assign — that would silently copy
  // the board onto the signed-in SLP's own account. Gate, never default.
  canAssign: computed('user', function() {
    var u = this.get('user');
    return !!(u && u.get && u.get('user_name'));
  }),

  forLabel: computed('user', function() {
    var u = this.get('user');
    return (u && u.get) ? (u.get('user_name') || '') : '';
  }),

  boardLabel: computed('buttons', function() {
    var n = this.get('buttons');
    if (!n) { return ''; }
    return i18n.t('report_vocal_flair_name', "Vocal Flair %{n}", { n: n });
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
  },

  actions: {
    // The board must land on the COMMUNICATOR, not the signed-in SLP. That is
    // done by pointing app_state.setup_user at them, which
    // board-preview-overlay#pick_for_home reads when the SLP picks — seconds
    // after this returns.
    //
    // Deliberately NOT managed here. This component unmounts whenever the report
    // switches to School mode (the card is medical-only), and restoring
    // setup_user on teardown while the preview was still open sent the board to
    // the SLP's own account. openRecommendedHomeBoard now owns the override and
    // releases it when the preview closes, so it lives exactly as long as the
    // thing that reads it.
    open: function() {
      var n = this.get('buttons');
      if (!n) { return; }
      var _this = this;
      _this.set('loading', true);
      var done = function() { _this.set('loading', false); };
      openRecommendedHomeBoard(n, this.get('user')).then(done, done);
    }
  }
});
