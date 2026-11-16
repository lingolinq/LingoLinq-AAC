// Shared by the offline app shell specs (offline-launch.spec.js, offline-kill-switch.spec.js).
//
// These run against RAILS directly (it serves /sw.js and the page), never `ember serve`, and need a
// persistent browser profile: the kill-switch spec reopens the profile the launch spec left behind,
// so it can see the worker and caches that run installed.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium, webkit, devices } = require('@playwright/test');
const { assertLocalStack } = require('./local-session');

const CACHE_PREFIX = 'll-offline-shell-';

function baseURL() {
  return process.env.E2E_BASE_URL || 'http://localhost:8184';
}

function profileDir(name) {
  return path.join(process.env.E2E_OFFLINE_PROFILE_DIR || path.join(os.tmpdir(), 'll-offline-shell-e2e'), name);
}

// options.locale sets the browser language (navigator.language), which picks the interface language;
// options.baseURL points the profile at another local address (offline-worker-lifecycle's proxy).
//
// E2E_BROWSER=webkit runs the same specs in WebKit (Safari's engine) as a current iPad: an iPad screen and
// touch, and Safari's Mac identity, which iPadOS 13 and later sends by default (utils/ipad_detect.js tells
// it apart by its touch points). WebKit on Linux reports no touch points and a Linux platform, so the
// profile reports what an iPad does. Not iOS: no Home Screen mode, and Chromium-only calls (a CDP
// session) fail there. Chromium stays the default.
const IPAD_AS_MAC = {
  viewport: devices['iPad (gen 11)'].viewport,
  deviceScaleFactor: devices['iPad (gen 11)'].deviceScaleFactor,
  userAgent: devices['Desktop Safari'].userAgent,
  hasTouch: true,
};

async function openProfile(name, options) {
  assertLocalStack();
  const common = { baseURL: (options && options.baseURL) || baseURL(), locale: (options && options.locale) || 'en-US' };
  if ((options && options.browser) === 'webkit' || process.env.E2E_BROWSER === 'webkit') {
    const context = await webkit.launchPersistentContext(profileDir(name), { ...IPAD_AS_MAC, ...common });
    await context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5, configurable: true });
      Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'MacIntel', configurable: true });
    });
    return context;
  }
  const { viewport, userAgent, deviceScaleFactor } = devices['Desktop Chrome'];
  return chromium.launchPersistentContext(profileDir(name), { ...common, viewport, userAgent, deviceScaleFactor });
}

// What the page can see of the worker and its caches.
async function workerState(page) {
  return page.evaluate(async (prefix) => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const keys = await caches.keys();
    return {
      registrations: registrations.map((r) => {
        const w = r.active || r.waiting || r.installing;
        return w ? new URL(w.scriptURL).pathname : null;
      }),
      caches: keys.filter((k) => k.indexOf(prefix) === 0),
    };
  }, CACHE_PREFIX);
}

// offline-launch.spec.js leaves the worker installed in some profiles for offline-kill-switch.spec.js. It
// records what it left (a file next to the profile), and the kill-switch spec takes that record before it
// starts, so a rerun on a profile that is already clean fails instead of passing on nothing.
function markerPath(name) {
  return profileDir(name) + '.installed.json';
}

function markInstalled(name, state) {
  if (!state.registrations.includes('/sw.js') || state.caches.length < 1) {
    throw new Error(`profile ${name}: nothing installed to leave for the kill switch`);
  }
  fs.writeFileSync(markerPath(name), JSON.stringify(state));
}

// Returns what the launch spec left, and removes the record. Throws when there is none.
function takeInstalledMark(name) {
  const file = markerPath(name);
  if (!fs.existsSync(file)) {
    throw new Error(`profile ${name} has no installed worker recorded: run offline-launch.spec.js first, with a fresh E2E_OFFLINE_PROFILE_DIR`);
  }
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.unlinkSync(file);
  return state;
}

module.exports = { CACHE_PREFIX, baseURL, markInstalled, openProfile, profileDir, takeInstalledMark, workerState };
