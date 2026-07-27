// Opt-in speak-mode board open timings.
// Enable: localStorage.setItem('ll_board_cache_diag', '1') then reload.
// Or: window.__LL_BOARD_CACHE_DIAG = true
// Logs land in console as [ll-board-cache] … and on window.__LL_BOARD_CACHE_LOG.

function enabled() {
  if (typeof window === 'undefined') { return false; }
  if (window.__LL_BOARD_CACHE_DIAG === true) { return true; }
  try {
    return window.localStorage && window.localStorage.getItem('ll_board_cache_diag') === '1';
  } catch (e) {
    return false;
  }
}

function mark(label, detail) {
  if (!enabled()) { return; }
  var entry = {
    t: Date.now(),
    label: label,
    detail: detail || null
  };
  try {
    window.__LL_BOARD_CACHE_LOG = window.__LL_BOARD_CACHE_LOG || [];
    window.__LL_BOARD_CACHE_LOG.push(entry);
  } catch (e) { /* ignore */ }
  try {
    // eslint-disable-next-line no-console
    console.log('[ll-board-cache]', label, detail || '');
  } catch (e2) { /* ignore */ }
}

function span(startLabel, endLabel, detail) {
  if (!enabled()) { return; }
  var log = null;
  try { log = window.__LL_BOARD_CACHE_LOG; } catch (e) { log = null; }
  if (!log || !log.length) {
    mark(endLabel, detail);
    return;
  }
  var start = null;
  for (var i = log.length - 1; i >= 0; i--) {
    if (log[i].label === startLabel) {
      start = log[i];
      break;
    }
  }
  var ms = start ? (Date.now() - start.t) : null;
  var merged = {};
  var src = detail || {};
  Object.keys(src).forEach(function(k) { merged[k] = src[k]; });
  merged.ms_since = startLabel;
  merged.ms = ms;
  mark(endLabel, merged);
}

export default {
  enabled: enabled,
  mark: mark,
  span: span
};
