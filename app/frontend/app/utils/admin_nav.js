/**
 * THE ADMIN SLOT: a site admin who manages no organisation gets System Settings in the primary
 * nav (2026-10-02, requested: "they need more than the three account-menu links -> evaluate
 * what an slp user that has no other org access other than rooms -> and follow that lead").
 *
 * THE LEAD FOLLOWED. The slot right of Caseload holds ONE destination per person
 * (utils/rooms_nav): Organizations for a manager, otherwise Rooms for someone who supervises
 * rooms. This adds a third alternative, after both: Admin, which opens System Settings. Before
 * this, such an admin's only admin routes were the three account-menu links (View Beta Feedback,
 * Database, System Settings: components/app-navbar-authenticated-inner.hbs).
 *
 * WHY NOT ORGANIZATIONS. The server lists organisations only to someone with `edit` on the admin
 * organisation (app/controllers/api/organizations_controller.rb:831), i.e. a manager or assistant
 * of it -- and those already have `has_management_responsibility`, so they already get the
 * Organizations pill. An admin by the `admin` user setting alone is refused that list, but is let
 * into System Settings (app/controllers/concerns/api/system_settings_access.rb:16, `admin?`).
 *
 * WHO IS A SITE ADMIN is the same reading as `showBetaFeedbackAdminLink`
 * (controllers/application.js:116), which gates the account-menu links this complements.
 */
import { get as emberGet } from '@ember/object';
import { showsRoomsPill } from './rooms_nav';

function read(user, key) {
  if(!user) { return null; }
  try { return emberGet(user, key); } catch(e) { return null; }
}

export function isSiteAdmin(user) {
  if(!user) { return false; }
  if(read(user, 'admin') || read(user, 'is_admin')) { return true; }
  var perm = read(user, 'permissions');
  return !!(perm && perm.admin_support_actions);
}

/* Last of the slot's three alternatives, so it can never be drawn beside Organizations or Rooms. */
export function showsAdminSlot(user) {
  if(!isSiteAdmin(user)) { return false; }
  if(read(user, 'has_management_responsibility')) { return false; }
  return !showsRoomsPill(user);
}
