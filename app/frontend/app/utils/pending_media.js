import { set as emberSet } from '@ember/object';
import RSVP from 'rsvp';

// Tracks every picture or sound upload still running on a board button, so board Save can wait
// for them (utils/save_after_media.js) and so an upload whose edit session ended never lands.
//
// Each operation calls begin_pending_media(button, field, kind) on the button it started from and
// keeps the returned token, then calls finish_pending_media(token, outcome) once, however it ends:
// - field: 'pending_image' or 'pending_sound', the flag the button shows while it runs
//   (utils/button.js `pending`; the "Saving..." label in button-settings.hbs);
// - kind: 'user' for a picture picked in button settings, a dropped image or a sound; 'auto' for
//   the automatic symbol lookup (editManager.lucky_symbols), whose errors stay silent;
// - outcome: 'landed' (applied), 'failed' (did not arrive), 'superseded' (something else replaced
//   it). A fourth, 'cancelled', is set only by cancel_pending_media(): when the edit session ends
//   (leaving edit mode, a board change, "Save without it"). Every place that applies an upload
//   checks is_cancelled(token) first and writes nothing for a cancelled one.
//
// The per-button flag stays true while any operation on that button for that field is live.
// Other writers still lower the flags directly (clear_image and the license branches in
// services/content-grabbers.js, the button rebuild in utils/edit_manager.js); they never raise
// them, and the registry below, not the flags, is what Save waits on, so a flag left true with no
// live operation never holds Save.
var live = new Set();
// Each waiter counts only the operations that end after it started waiting, so an upload that
// failed earlier (and was already reported) never blocks a later Save.
var waiters = [];

function blank() {
  return {landed: 0, failed: 0, superseded: 0, cancelled: 0};
}

var settable = function(button) {
  return !!button && typeof button === 'object' && !button.isDestroyed && !button.isDestroying;
};

var lower_flag = function(token) {
  var button = token.button;
  if(!settable(button)) { return; }
  var still = false;
  live.forEach(function(other) {
    if(other.button === button && other.field === token.field) { still = true; }
  });
  if(!still) { emberSet(button, token.field, false); }
};

var notify = function() {
  if(live.size > 0 || waiters.length === 0) { return; }
  var ready = waiters;
  waiters = [];
  // The automatic lookup ends its operation BEFORE the afterRender that writes the button's
  // image_id (utils/edit_manager.js lucky_symbols), in the same run loop. Ember flushes every
  // queue of that run loop, afterRender included, inside the current task, so a microtask queued
  // here runs after it: a save that runs on this answer sees the applied picture.
  Promise.resolve().then(function() {
    ready.forEach(function(waiter) { waiter.resolve(waiter.counts); });
  });
};

export function begin_pending_media(button, field, kind) {
  if(!settable(button)) { return null; }
  var token = {button: button, field: field || 'pending_image', kind: kind || 'user', done: false, cancelled: false};
  live.add(token);
  emberSet(button, token.field, true);
  return token;
}

export function finish_pending_media(token, outcome) {
  if(!token || token.done) { return; }
  token.done = true;
  live.delete(token);
  outcome = outcome || 'landed';
  // A lookup the person did not start (the automatic symbol) failing is not a failed upload: its
  // errors are silent by design (utils/edit_manager.js lucky_symbols), so it is not counted.
  var counted = !(outcome === 'failed' && token.kind !== 'user');
  if(counted) {
    waiters.forEach(function(waiter) {
      if(waiter.counts[outcome] !== undefined) { waiter.counts[outcome]++; }
    });
  }
  lower_flag(token);
  notify();
}

export function cancel_pending_media() {
  var cancelling = Array.from(live);
  cancelling.forEach(function(token) { token.cancelled = true; });
  cancelling.forEach(function(token) { finish_pending_media(token, 'cancelled'); });
}

export function is_cancelled(token) {
  return !!(token && token.cancelled);
}

export function has_live_media() {
  return live.size > 0;
}

export function when_media_settled() {
  return new RSVP.Promise(function(resolve) {
    waiters.push({resolve: resolve, counts: blank()});
    if(live.size === 0) {
      notify();
    }
  });
}

// Tests only: the registry is a module singleton.
export function reset_pending_media() {
  live = new Set();
  waiters = [];
}
