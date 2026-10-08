/**
 * WHO HAS A CASELOAD -- stated once (2026-10-02). The Modern Caseload page (routes/caseload.js)
 * admits exactly these people, and the Basic home page draws its Communicators tab for them
 * (components/dashboard/classic-view.js showCommunicatorsTab), because Basic's landing for the
 * Caseload is that tab (utils/basic_landing.js). Two separate readings let a parent with
 * communicators land on a section whose tab was never drawn.
 */
import { get as emberGet } from '@ember/object';

function read(user, key) {
  if(!user) { return null; }
  try { return emberGet(user, key); } catch(e) { return null; }
}

export function has_caseload_access(user) {
  if(!user) { return false; }
  var supervisees = read(user, 'known_supervisees') || read(user, 'supervisees') || [];
  return !!(read(user, 'supporter_role') || read(user, 'supporter_view') || supervisees.length > 0);
}
