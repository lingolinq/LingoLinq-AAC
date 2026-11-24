import { begin_pending_media, finish_pending_media } from './pending_media';

// The picture half of utils/pending_media.js, kept as the API PR #1346 introduced. A token only
// finishes on the button it was begun on, so a button object rebuilt while the operation ran
// keeps its own state.
export function begin_pending_image(button, kind) {
  return begin_pending_media(button, 'pending_image', kind || 'user');
}

export function finish_pending_image(button, token, outcome) {
  if(!button || !token || token.button !== button) { return; }
  finish_pending_media(token, outcome);
}
