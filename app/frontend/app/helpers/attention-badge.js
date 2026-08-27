import { helper } from '@ember/component/helper';
import { attentionBadgeFor } from '../utils/dashboard_sections';

/**
 * The "action required" badge for one caseload roster row, or null when that
 * communicator needs nothing.
 *
 * Delegates entirely to attentionBadgeFor (utils/dashboard_sections) so the row
 * badge and the dashboard's "Communicators Need Attention" card resolve who is
 * flagged from the SAME ATTENTION_STATUS_IDS list — a supervisee can never be
 * listed on one surface and unflagged on the other.
 *
 * Returns `{ label, hint }`, so the call site reads:
 *   {{#let (attention-badge supervisee) as |att|}}
 *     {{#if att}} … {{att.label}} … {{/if}}
 *   {{/let}}
 *
 * Takes the supervisee ENTRY (a plain hash off the user record, not an Ember Data
 * model), matching how communicatorsNeedingAttention reads the same objects.
 */
export default helper(function([supervisee]) {
  return attentionBadgeFor(supervisee);
});
