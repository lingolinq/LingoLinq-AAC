/**
 * Capacitor native bootstrap for LingoLinq Ember.
 * Installs Cordova-compatible shims before dbman.setup_database so offline
 * SQLite + filesystem caching light up under Capacitor (and remain no-ops on web).
 *
 * Shell scripts www/sqlite_bridge.js + www/filesystem_bridge.js usually install
 * first (prod-packaged app.js). This module covers monorepo-packaged builds.
 */

import { installCapacitorSqliteShim } from './capacitor_sqlite_shim';
import { installCapacitorFilesystemShim } from './capacitor_filesystem_shim';

export function isNativeCapacitor() {
  try {
    return !!(window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform());
  } catch(e) {
    return false;
  }
}

/**
 * Install offline adapters. Safe to call multiple times.
 * @returns {{ native: boolean, sqlite: boolean, filesystem: boolean }}
 */
export function installCapacitorAdapters() {
  var native = isNativeCapacitor();
  if(!native) {
    return { native: false, sqlite: false, filesystem: false };
  }

  var sqlite = installCapacitorSqliteShim();
  var filesystem = installCapacitorFilesystemShim();

  if(window.capabilities) {
    window.capabilities.capacitor_native = true;
    window.capabilities.native_iap_enabled = window.capabilities.native_iap_enabled === true;
  }

  return { native: true, sqlite: !!sqlite, filesystem: !!filesystem };
}

// Install as soon as this module evaluates (capabilities imports us early).
var _install = installCapacitorAdapters();
if(_install.native) {
  console.log('LINGOLINQ: capacitor_bridge adapters', _install);
}

export default {
  isNativeCapacitor: isNativeCapacitor,
  installCapacitorAdapters: installCapacitorAdapters
};
