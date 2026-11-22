// RED-RUN SHELL: the exported names only, doing nothing, so the new tests load and fail on
// their assertions. Replaced by the implementation in the next commit.
var NONE = function() { return {landed: 0, failed: 0, superseded: 0, cancelled: 0}; };
export function begin_pending_media() { return null; }
export function finish_pending_media() { }
export function cancel_pending_media() { }
export function is_cancelled() { return false; }
export function has_live_media() { return false; }
export function when_media_settled() { return Promise.resolve(NONE()); }
export function reset_pending_media() { }
