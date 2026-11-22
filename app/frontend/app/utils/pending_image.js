import { set as emberSet } from '@ember/object';

// Tracks the image operations still running for each button that go through
// it: picking an image in button settings (pictureGrabber.select_image_preview
// in services/content-grabbers.js) and the automatic symbol lookup
// (editManager.lucky_symbols). For those, `pending_image`, which the board-save
// guard reads (saveButtonChanges in controllers/board/index.js and
// controllers/user/board-detail.js), stays true until the last one has ended.
// Other writers of `pending_image` (clear_image, the image license save, the
// button rebuild in edit_manager.js) still set it directly.
//
// Each operation calls begin_pending_image() on the button it started from and
// keeps the returned token. It calls finish_pending_image() with that same
// button and token once, however it ends (saved, failed or superseded), even
// if the settings modal that started it has closed. Finishing a token that was
// already finished, or that belongs to another button object, does nothing, so
// a button rebuilt while the operation ran keeps its own state.
var operationsByButton = new WeakMap();

var settable = function(button) {
  return !!button && typeof button === 'object' && !button.isDestroyed && !button.isDestroying;
};

export function begin_pending_image(button) {
  if(!settable(button)) { return null; }
  var operations = operationsByButton.get(button);
  if(!operations) {
    operations = new Set();
    operationsByButton.set(button, operations);
  }
  var token = {};
  operations.add(token);
  emberSet(button, 'pending_image', true);
  return token;
}

export function finish_pending_image(button, token) {
  if(!button || !token) { return; }
  var operations = operationsByButton.get(button);
  if(!operations || !operations.has(token)) { return; }
  operations.delete(token);
  if(operations.size === 0 && settable(button)) {
    emberSet(button, 'pending_image', false);
  }
}
