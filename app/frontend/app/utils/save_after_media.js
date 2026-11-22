// RED-RUN SHELL: the exported names only, doing nothing, so the new tests load and fail on
// their assertions. Replaced by the implementation in the next commit.
export var WAIT_TEMPLATE = 'save-waiting';
export function save_after_media() { return false; }
export function save_waiting_active() { return false; }
export function reset_save_after_media() { }
