import Component from '@ember/component';
import obf from '../utils/obf';

// Bespoke modern intro screen for the eval tool. Rendered by
// templates/board/index.hbs in place of the legacy OBF board grid when
// `eval_intro_active` (see controllers/board/index.js). Presentational
// only — the primary CTA and Settings re-use the existing eval flow
// actions (the same ones the eval header buttons call), so the eval
// logic is untouched.
export default Component.extend({
  classNames: ['md-eval-intro'],
  // `text` is passed in (the current intro step's prompt, from
  // obf.eval.current_intro().text).

  init() {
    this._super(...arguments);
    var self = this;
    this.ctrlAction = function(actionName) {
      return function() {
        var args = Array.prototype.slice.call(arguments);
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
  },

  actions: {
    start: function() {
      if(obf.eval && obf.eval.intro_header_start) {
        obf.eval.intro_header_start();
      }
    },
    settings: function() {
      if(obf.eval && obf.eval.settings) {
        obf.eval.settings();
      }
    },
    // Section navigation — same actions the eval toolbar's Prev / Next /
    // Skip buttons call, so the bespoke screen and the toolbar stay in sync.
    back: function() {
      if(obf.eval && obf.eval.move) {
        obf.eval.move('back');
      }
    },
    next: function() {
      if(obf.eval && obf.eval.move) {
        obf.eval.move('forward');
      }
    },
    skip: function() {
      if(obf.eval && obf.eval.intro_header_skip) {
        obf.eval.intro_header_skip();
      }
    }
  }
});
