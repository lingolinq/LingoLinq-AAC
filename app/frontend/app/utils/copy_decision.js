/* What "Make a Copy" (components/copy-board.js) settled with: a decision, or a dismissal.
 *
 * Only the dialog's copy buttons produce a decision: tweakBoard closes with a payload whose
 * `action` is the button's literal (components/copy-board.js tweakBoard). Every other way the
 * open() promise can resolve is a dismissal: `undefined` from the document-level Escape, which
 * calls utils/modal.close() with no argument when focus is outside the dialog
 * (utils/raw_events.js:606, and utils/modal.js:397 resolves anything but `false`), `null`, and
 * `{replaced: true}` when another modal opens over it (utils/modal.js:136-147). Callers treated
 * those as "copy with the default action", or reopened the dialog. A cancel still rejects, as
 * before (utils/modal.js close(false)).
 */
export function is_copy_decision(result) {
  return !!result && typeof result === 'object' &&
    typeof result.action === 'string' && result.action.length > 0;
}

export default is_copy_decision;
