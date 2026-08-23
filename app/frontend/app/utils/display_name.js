/* The one authoritative rule for turning a user payload into a name a human
   should see.

   Signup collects no name, so `name` is simply absent for most accounts and
   every display needs a fallback to the handle. `name` remains the raw
   attribute for round-tripping to the server.

   The sentinel this also strips is historical: User#generate_defaults used to
   seed settings['name'] with the literal string "No name", which is truthy and
   therefore defeated every `name || user_name` guard in the codebase. That seed
   has been removed and `rake extras:clear_no_name_placeholder` backfills
   existing accounts to nil — but the check stays, because an account that has
   not been backfilled (or a cached/offline payload predating it) still carries
   the string. Treat it as a value that must never reach a human.

   This works on an Ember-Data record OR a plain object on purpose. Most users
   never reach the client as records: `limited_identity` payloads — a board's
   shared_users, an utterance's user, the organization roster — are raw JSON,
   where a computed property on the model would simply never run. Keeping one
   function for both shapes is what stops the guard from being re-derived (and
   re-broken) per surface. */

/* Two places deliberately do NOT use this, each commented at the site:
   - templates/user/edit.hbs — a write binding; a display value there would be
     saved back over the real one.
   - controllers/organization/reports.js — a CSV export, where the handle is
     already the adjacent column.
   Note also that a fallback only works where `user_name` is actually on the
   wire. `limited_identity` payloads carry it; hand-rolled controller JSON may
   not (see api/organizations_controller.rb#start_code_lookup, which had to be
   changed to emit it).

   Server-side displays need their own fallback — this file cannot reach them.
   Utterance#share_with builds the SMS and email a family member receives
   (app/models/utterance.rb:249, :263, :271) with `name || user_name`, which is
   correct and only ever failed because of the seed described above. */

const SERVER_PLACEHOLDER_NAME = 'No name';

function read(obj, key) {
  if(!obj) { return null; }
  return obj.get ? obj.get(key) : obj[key];
}

/* Also safe on an organization, which has a `name` but no `user_name`: only
   User#generate_defaults seeds the sentinel, so an org's real name always
   returns on the first branch and never reaches the handle fallback. */
export function display_name_for(user) {
  if(!user) { return ''; }
  var name = (read(user, 'name') || '').trim();
  if(name && name !== SERVER_PLACEHOLDER_NAME) { return name; }
  return read(user, 'user_name') || '';
}

export { SERVER_PLACEHOLDER_NAME };

export default {
  display_name_for: display_name_for,
  SERVER_PLACEHOLDER_NAME: SERVER_PLACEHOLDER_NAME
};
