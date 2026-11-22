import EmberObject from '@ember/object';
import RSVP from 'rsvp';

// Every board URL sits under its owner's name, so the parent `user` route must resolve before a board
// page can open, and with no server it cannot fetch the owner. Sync saves boards but not their owners
// (stock boards, a teacher's board), so these helpers find an owner for a board page offline.

var BOARD_PAGE = /^user\.board-(detail|alt)(\.|$)/;

export function is_board_page(route_name) {
  return BOARD_PAGE.test(route_name || '');
}

// The board a transition is heading for, or null when it is not a board page.
export function board_target(transition) {
  var info = transition && transition.to;
  if(!info || !is_board_page(info.name)) { return null; }
  for(; info; info = info.parent) {
    if(info.params && info.params.boardname) { return info.params.boardname; }
  }
  return null;
}

// True when the server gave no answer about this user, as opposed to saying no.
export function no_server_answer(err) {
  if(err && err.short_circuit) { return true; }
  var xhr = err && (err.fakeXHR || (err._result && err._result.fakeXHR));
  if(!xhr) { return false; }
  return xhr.status === 0 || xhr.status >= 500;
}

// True when there was no connection at all, as opposed to a server that answered badly.
export function no_connection(err) {
  if(err && err.short_circuit) { return true; }
  var xhr = err && (err.fakeXHR || (err._result && err._result.fakeXHR));
  return !!xhr && xhr.status === 0;
}

// Stands in for an owner the device never saved, on a board page only. It holds no user data. The
// `user` route replaces it as soon as a page other than a board opens, and `reload` is for those pages'
// setup, which can run first.
export function owner_stand_in(user_name) {
  return EmberObject.extend({
    reload: function() { return RSVP.resolve(this); }
  }).create({ user_name: user_name, board_owner_stand_in: true, preferences: {} });
}
