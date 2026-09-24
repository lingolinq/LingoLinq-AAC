/**
 * WHO GETS A ROOMS PILL, AND WHICH ORGANISATION IT POINTS AT -- stated once.
 *
 * The primary nav offers ONE of these two in the slot right of Caseload (requested
 * 2026-09-23): Organizations for anyone who manages an org, Rooms for someone whose only
 * org access is the rooms they supervise. They are alternatives, not siblings -- a manager
 * reaches rooms THROUGH the Organizations page, so offering both would put two doors to the
 * same place in a six-item nav.
 *
 * WHY A UTIL AND NOT A COMPUTED ON THE NAV. Four places need the same answer:
 *   - components/user-pill-nav.js   draws the pill, and needs the destination
 *   - controllers/application.js    decides whether the nav renders on /organizations/:id/rooms
 *   - components/account-rail.js    asks the same question through utils/primary_nav
 *   - utils/primary_nav.js's caller supplies the gate as an option
 * Naming a pill that the nav will not draw is the failure `utils/primary_nav` already guards
 * against; the gate has to be ONE reading of the user or the two can disagree.
 *
 * THE GATE IS `has_management_responsibility` (models/user.js `managed_orgs.length > 0`), the
 * same one the Organizations pill uses, so the two can never both show or both hide.
 */
import { get as emberGet } from '@ember/object';

function read(user, key) {
  if(!user) { return null; }
  /* `supervised_units` is a plain array on the user RECORD, so both an EmberObject and a POJO
     turn up here depending on the caller (the nav has the model, a test may hand a literal). */
  try { return emberGet(user, key); } catch(e) { return null; }
}

/* The rooms this person supervises, ordered by name. The nav needs only the first one's
   organisation, but ORDER decides which that is, so it is sorted here rather than left to the
   order the server happened to serialise -- the same `Intl.Collator` ordering the Basic rail
   and the Modern Rooms card use, so all three land on the same organisation. */
export function supervisedRooms(user) {
  var units = read(user, 'supervised_units');
  if(!units || !units.length) { return []; }
  var collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return units.slice().sort(function(a, b) {
    return collator.compare((a && a.name) || '', (b && b.name) || '');
  });
}

/**
 * The organisation the Rooms pill opens.
 *
 * LOSSY BY DESIGN, and knowingly: `OrganizationUnit.supervised_units` is not filtered to one
 * organisation, so someone supervising rooms in two districts has more than one answer here
 * and this returns the first. The rooms page itself carries the organisation switcher that
 * makes the others reachable (templates/organization.hbs), which is why one destination is
 * enough for the nav.
 */
export function roomsOrgId(user) {
  var first = supervisedRooms(user)[0];
  return (first && first.organization_id) || null;
}

/**
 * Whether the nav draws Rooms in the Organizations slot.
 *
 * Needs a DESTINATION as well as a role: a supervised unit with no `organization_id` would
 * give a LinkTo with no model, which throws rather than degrading, so `roomsOrgId` is part of
 * the gate and not a separate lookup afterwards.
 */
export function showsRoomsPill(user) {
  if(!user) { return false; }
  if(read(user, 'has_management_responsibility')) { return false; }
  return !!roomsOrgId(user);
}
