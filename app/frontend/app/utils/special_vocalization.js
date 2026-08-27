/**
 * Action vocalizations are control protocols, not words. Keyboard and
 * prediction buttons store them on `vocalization`: `:space` completes a
 * word, `:shift` toggles caps, `+q` appends a letter, `:suggestion` marks
 * a prediction slot. Translating the token into another language (or
 * replacing it with the translated label) breaks the control.
 *
 * The same `^[:+]` test is used on the server (`Board#translate_set`,
 * `relinking`, json_api/board). Keep this helper in lockstep with that.
 */
export function isActionVocalization(value) {
  return /^[:+]/.test(String(value || ''));
}

/** True when a vocalization should be sent to Google / stored as a translation. */
export function shouldTranslateVocalization(vocalization, label) {
  if (!vocalization || vocalization === label) { return false; }
  return !isActionVocalization(vocalization);
}
