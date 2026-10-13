/**
 * WHO MAY START REMOTE MODELING WITH A COMMUNICATOR, AND WHAT A SUPPORTER WHO CANNOT IS SHOWN --
 * stated once (2026-10-02, requested). Every entry point (the Basic dashboard's communicator menu,
 * the Modern caseload's row and tiles, the account page's Extras) reads this through the
 * `remote-modeling-access` helper, so they cannot disagree.
 *
 * THE RULES, unchanged on the server side:
 *   - the communicator needs a premium account (requested: keep requiring it);
 *   - the supporter needs `supervise` on them, which the server checks before handing out the
 *     connection (app/controllers/api/users_controller.rb ws_settings): full supervisors and org
 *     managers, not modeling-only links (requested: keep the current rule);
 *   - the communicator must have turned Remote Modeling on in their Settings, or their device
 *     ignores the request (utils/sync.js, pair_request).
 *
 * WHAT CHANGED is the entry points: instead of hiding the option, or offering one that cannot
 * connect, they show it with a "Limited" badge, and a click says what would make it work
 * (requested: "it should show with a Limited badge -> once clicked, it should show that if they
 * want full remote modeling, they must upgrade to a premium account").
 */
import { get as emberGet } from '@ember/object';
import modal from './modal';

function read(obj, key) {
  if(!obj) { return null; }
  try { return emberGet(obj, key); } catch(e) { return null; }
}

/* `user` is either a caseload supervisee (the limited JSON: `premium`, `remote_modeling`,
   `modeling_only`, `edit_permission`) or a full user record (the account page: `premium` /
   `currently_premium`, `preferences.remote_modeling`, `permissions`). */
function linkIsModelingOnly(user) {
  if(read(user, 'modeling_only') === true) { return true; }
  var perms = read(user, 'permissions');
  return !!(perms && typeof perms === 'object' && Object.keys(perms).length && !perms.supervise);
}

/**
 * One of: 'available', 'needs_premium' (the communicator has no premium account),
 * 'supporter_upgrade' (the supporter's own account is modeling-only), 'modeling_access' (this
 * supporter's link to them is modeling-only), 'not_enabled' (they have not turned it on).
 * Checked in that order: an upgrade is the first thing that would have to change.
 */
export function remoteModelingState(user, supporter) {
  if(!user) { return 'needs_premium'; }
  if(!(read(user, 'premium') || read(user, 'currently_premium'))) { return 'needs_premium'; }
  if(read(supporter, 'modeling_only')) { return 'supporter_upgrade'; }
  if(linkIsModelingOnly(user)) { return 'modeling_access'; }
  if(!(read(user, 'remote_modeling') || read(user, 'preferences.remote_modeling'))) { return 'not_enabled'; }
  return 'available';
}

export function openRemoteModeling(user, supporter) {
  var state = remoteModelingState(user, supporter);
  if(state === 'needs_premium') {
    return modal.open('premium-required', { user_name: read(user, 'user_name'), action: 'remote_modeling', reason: 'not_currently_premium' });
  } else if(state === 'supporter_upgrade') {
    return modal.open('premium-required', { user_name: read(supporter, 'user_name'), user: supporter, remind_to_upgrade: true, limited_supervisor: true, action: 'remote_modeling' });
  }
  var opts = { user_id: read(user, 'id') };
  if(state !== 'available') {
    opts.limited = state;
    opts.can_edit_settings = !!(read(user, 'edit_permission') || read(user, 'permissions.edit'));
  }
  return modal.open('modals/remote-model', opts);
}
