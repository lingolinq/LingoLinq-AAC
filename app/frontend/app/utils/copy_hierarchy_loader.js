import RSVP from 'rsvp';
import { later, cancel } from '@ember/runloop';
import BoardHierarchy from './board_hierarchy';

var EARLY_LIVE_LINKS_DELAY_MS = 6000;

export function loadHierarchyForCopyModal(board, opts) {
  opts = opts || {};
  var earlyDelay = opts.early_live_links_delay_ms != null
    ? opts.early_live_links_delay_ms
    : EARLY_LIVE_LINKS_DELAY_MS;

  return new RSVP.Promise(function(resolve, reject) {
    var settled = false;
    var bs_done = false;
    var ll_done = false;
    var ll_started = false;
    var bs_err = null;
    var early_handle = null;

    var clear_timer = function() {
      if(early_handle) {
        cancel(early_handle);
        early_handle = null;
      }
    };

    var settle_with = function(hierarchy, source) {
      if(settled) { return; }
      settled = true;
      clear_timer();
      resolve({ hierarchy: hierarchy, source: source });
    };

    var maybe_finalize = function() {
      if(settled) { return; }
      if(bs_done && ll_done) {
        settled = true;
        clear_timer();
        if(bs_err) {
          reject(bs_err);
        } else {
          resolve({ hierarchy: null, source: 'none' });
        }
      }
    };

    var start_live_links = function() {
      if(ll_started || settled) { return; }
      ll_started = true;
      clear_timer();
      BoardHierarchy.load_from_live_links(board, {
        expand_all: opts.expand_all
      }).then(function(hierarchy) {
        ll_done = true;
        if(hierarchy && hierarchy.get && hierarchy.get('root')) {
          settle_with(hierarchy, 'live_links');
        } else {
          maybe_finalize();
        }
      }, function() {
        ll_done = true;
        maybe_finalize();
      });
    };

    BoardHierarchy.load_with_button_set(board, {
      skipBoardReloadForCopyModal: opts.skipBoardReloadForCopyModal,
      expand_all: opts.expand_all
    }).then(function(hierarchy) {
      bs_done = true;
      if(hierarchy && hierarchy.get && hierarchy.get('root')) {
        settle_with(hierarchy, 'button_set');
      } else {
        start_live_links();
      }
    }, function(err) {
      bs_done = true;
      bs_err = err;
      start_live_links();
    });

    early_handle = later(function() {
      early_handle = null;
      start_live_links();
    }, earlyDelay);
  });
}

export default loadHierarchyForCopyModal;
