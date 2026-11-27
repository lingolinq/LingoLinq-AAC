import modal from './modal';
import { has_live_media, when_media_settled, cancel_pending_media } from './pending_media';
import { owner_gone } from './live_service';

// Board Save while a picture or sound is still uploading: instead of refusing, show the waiting
// dialog (components/save-waiting.js) and save once every upload has ended. Both board pages
// call this from saveButtonChanges before serializing the board (controllers/board/index.js for
// Basic, controllers/user/board-detail.js for Modern):
//
//   if(save_after_media({identity, owner, save, failed})) { return; }
//
// It returns false when nothing is uploading (the caller saves now) and true when it took over.
// - identity(): a string naming the board, the edit session and the person. Captured now and
//   compared when the uploads end; if anything changed (another board, edit mode left and
//   entered again, a different person), the save is dropped.
// - owner: the app instance the save belongs to; if it was torn down meanwhile, nothing runs.
// - save(): called once the uploads have landed; it re-enters saveButtonChanges, which checks
//   again, so an upload started meanwhile is waited for too.
// - failed(): called instead of save() when an upload the person started failed.
//
// The dialog's own answers: 'back' ("Back to editing") drops the deferred save and lets the
// uploads carry on; 'save_without' cancels what is still uploading and saves now; anything
// else (another modal replaced it) drops the deferred save. The dialog is uncloseable, so Escape
// and a backdrop click do nothing.
export var WAIT_TEMPLATE = 'save-waiting';

var active = null;

var close_waiting_dialog = function() {
  // Only our own dialog: a save that re-enters can open the copy or purchase dialog, which must
  // stay open.
  if(modal.is_open(WAIT_TEMPLATE)) { modal.close(); }
};

export function save_after_media(opts) {
  if(active) { return true; }
  if(!has_live_media()) { return false; }
  var wait = {
    identity: opts.identity ? opts.identity() : null,
    owner: opts.owner || null,
    done: false
  };
  active = wait;
  var end = function() {
    wait.done = true;
    if(active === wait) { active = null; }
  };

  modal.open(WAIT_TEMPLATE, {started_at: Date.now()}).then(function(result) {
    if(wait.done) { return; }
    end();
    if(result === 'save_without') {
      cancel_pending_media();
      opts.save();
    }
  }, function() {
    end();
  });

  when_media_settled().then(function(counts) {
    if(wait.done) { return; }
    end();
    if(owner_gone(wait.owner)) { return; }
    close_waiting_dialog();
    if(opts.identity && opts.identity() !== wait.identity) { return; }
    if(counts.failed > 0) {
      if(opts.failed) { opts.failed(); }
      return;
    }
    opts.save();
  });
  return true;
}

export function save_waiting_active() {
  return !!active;
}

// Tests only: the deferred save is a module singleton.
export function reset_save_after_media() {
  active = null;
}
