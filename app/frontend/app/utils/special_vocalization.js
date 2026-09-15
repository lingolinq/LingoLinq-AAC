import i18n from './i18n';

/**
 * Action vocalizations are control protocols, not words. Keyboard and
 * prediction buttons store them on `vocalization`: `:space` completes a
 * word, `:shift` toggles one-shot caps, `:caps` keeps caps on, `+q` appends a letter, `:suggestion` marks
 * a prediction slot. Translating the token into another language (or
 * replacing it with the translated label) breaks the control.
 *
 * The same `^[:+]` test is used on the server (`Board#translate_set`,
 * `relinking`, json_api/board). Keep this helper in lockstep with that.
 */
export function isActionVocalization(value) {
  return /^[:+]/.test(String(value || ''));
}

/** True when the caps-lock key should show its on-state (green border). Shift must not light it. */
export function capsLockHighlight(vocalization, capsLockOn) {
  return String(vocalization || '') === ':caps' && !!capsLockOn;
}

/** Speak-mode label for the caps key: CAPS LOCK while on, authored label while off. */
export function capsLockDisplayLabel(label, vocalization, capsLockOn) {
  var text = label == null ? '' : String(label);
  if (!capsLockHighlight(vocalization, capsLockOn)) { return text; }
  var norm = text.trim().toLowerCase();
  if (norm === 'caps' || norm === 'caps lock') {
    return i18n.t('caps_lock_on_label', "CAPS LOCK");
  }
  return text.toUpperCase();
}

/** True when a vocalization should be sent to Google / stored as a translation. */
export function shouldTranslateVocalization(vocalization, label) {
  if (!vocalization || vocalization === label) { return false; }
  return !isActionVocalization(vocalization);
}
