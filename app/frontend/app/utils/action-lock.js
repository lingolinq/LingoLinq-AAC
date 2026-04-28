import {
  later as runLater,
  cancel as runCancel
} from '@ember/runloop';
import modal from './modal';
import i18n from './i18n';

var locks = {};
var warning_times = {};

var default_warning_interval = 1500;

var actionLock = {
  isLocked: function(key) {
    return !!(key && locks[key]);
  },

  clear: function(key, token) {
    if(!key || !locks[key]) { return; }
    if(token && locks[key].token !== token) { return; }
    if(locks[key].timer) {
      runCancel(locks[key].timer);
    }
    delete locks[key];
  },

  run: function(key, callback, opts) {
    opts = opts || {};
    if(!key) {
      return callback();
    }
    if(locks[key]) {
      this.warn(key, opts);
      return false;
    }

    var token = {};
    locks[key] = { token: token };
    if(opts.timeout) {
      locks[key].timer = runLater(this, function() {
        this.clear(key, token);
      }, opts.timeout);
    }

    var result;
    try {
      result = callback();
    } catch(e) {
      this.clear(key, token);
      throw e;
    }

    if(result && typeof result.then === 'function') {
      locks[key].promise = result;
      result.then(() => {
        this.clear(key, token);
      }, () => {
        this.clear(key, token);
      });
    } else if(!opts.timeout) {
      this.clear(key, token);
    }
    return result;
  },

  warn: function(key, opts) {
    opts = opts || {};
    if(opts.silent) { return; }
    var now = (new Date()).getTime();
    var interval = opts.warningInterval || default_warning_interval;
    if(warning_times[key] && now - warning_times[key] < interval) { return; }
    warning_times[key] = now;
    modal.warning(i18n.t('action_already_in_progress', "That action is already in progress."), true);
  },

  reset: function() {
    Object.keys(locks).forEach((key) => {
      this.clear(key);
    });
    warning_times = {};
  }
};

export default actionLock;
